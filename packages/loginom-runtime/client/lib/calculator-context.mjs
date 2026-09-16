import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeCalculatorContextCode(binding) {
  validatePreparedNodeContext(binding);
  return `async page=>(${readCalculatorContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readCalculatorBrowser.toString()})`;
}

export async function readCalculatorContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readCalculatorBrowser) {
  const before=await readNode(page,binding);
  if(before.verified!==true||before.surface!=='wizard'||before.output_port||before.input_port)return {verified:false,reason:'calculator_node_surface'};
  const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix);
  const after=await readNode(page,binding);
  if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'calculator_node_changed'};
  return {...result,node_context:after};
}

// Read the bounded, unfiltered local Ext store and the active CodeMirror document.
// The selected record's Expression is only flushed by Loginom on selection/Next;
// its editor is therefore authoritative while it remains selected. Never load a
// proxy or evaluate a formula to obtain this configuration evidence.
export function readCalculatorBrowser(prefix) {
  const fail=reason=>({verified:false,reason});
  const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
  const base=prefix+';WizrdMCF;CalcDataWizard;',roots=exact(base.slice(0,-1));
  if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('calculator_root');
  const root=roots[0];
  if(exact(prefix+';WizrdMCF;ExprDataEditForm').some(e=>e.checkVisibility({checkVisibilityCSS:true})))return fail('calculator_parameter_editor');
  if([...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].some(e=>e.checkVisibility({checkVisibilityCSS:true})))return fail('calculator_mask');
  const grids=exact(base+'grdExpressions'),grid=grids.length===1&&globalThis.Ext?.getCmp?.(grids[0].id);
  if(!grid||grid.el?.dom!==grids[0]||!root.contains(grids[0]))return fail('calculator_grid');
  const store=grid.getStore?.(),data=store?.getData?.(),records=data?.items,source=data?.getSource?.()?.items;
  if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()
    ||!Array.isArray(records)||records.length>128||store.getCount?.()!==records.length
    ||source&&(!Array.isArray(source)||source.length!==records.length||new Set(source).size!==records.length||source.some(r=>!records.includes(r))))return fail('calculator_filtered_store');
  const selection=grid.getSelectionModel?.()?.getSelection?.();
  if(!Array.isArray(selection)||selection.length!==1||!records.includes(selection[0]))return fail('calculator_selection');
  const editors=exact(base+'cmpExpression'),wrappers=editors.length===1?[...editors[0].querySelectorAll('.CodeMirror')]:[];
  const wrapper=wrappers[0],cm=wrapper?.CodeMirror,doc=cm?.getDoc?.();
  if(wrappers.length!==1||!root.contains(editors[0])||cm?.getWrapperElement?.()!==wrapper||!doc)return fail('calculator_editor');
  const count=doc.lineCount?.();
  if(!Number.isSafeInteger(count)||count<1||count>128||doc.firstLine?.()!==0||doc.lastLine?.()!==count-1)return fail('calculator_editor_lines');
  const lines=Array.from({length:count},(_,i)=>doc.getLine(i));
  if(lines.some(s=>typeof s!=='string'||/[\r\n\0]/.test(s)))return fail('calculator_editor_text');
  const text=lines.join('\n');if(text.length>2048)return fail('calculator_editor_size');
  const modes=exact(base+'btnCalcMode');
  if(modes.length!==1||!modes[0].querySelector('.bg-TBGCalcMode-cmExpression')||modes[0].querySelector('.bg-TBGCalcMode-cmJavaScript'))return fail('calculator_mode');
  const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},names=new Set(),ids=new Set(),expressionIds=new Set(),expressions=[];
  for(const [index,r] of records.entries()) {
    const d=r?.data,id=String(r?.internalId??'');
    if(!r?.isModel||!d||!id||ids.has(id)||expressionIds.has(d.ID)||d.Index!==index||!Number.isSafeInteger(d.ID)||d.ID<0
      ||!types[d.DataType]||typeof d.Name!=='string'||! /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(d.Name)
      ||names.has(d.Name.toLowerCase())||typeof d.DisplayName!=='string'||d.DisplayName.length>256
      ||typeof d.Description!=='string'||d.Description.length>8192
      ||['Intermediate','Replaced','Cached'].some(k=>typeof d[k]!=='boolean'))return fail('calculator_record');
    const formula=r===selection[0]?text:d.Expression;
    if(typeof formula!=='string'||formula.length>2048||/[\r\0]/.test(formula)||formula.split('\n').length>128)return fail('calculator_formula');
    ids.add(id);expressionIds.add(d.ID);names.add(d.Name.toLowerCase());
    expressions.push({index,record_id:id,expression_id:String(d.ID),name:d.Name,label:d.DisplayName,type:types[d.DataType],
      formula,intermediate:d.Intermediate,replace:d.Replaced,cached:d.Cached,description:d.Description,
      selected:r===selection[0]});
  }
  const fieldGrids=exact(base+'grdFields'),fieldGrid=fieldGrids.length===1&&globalThis.Ext?.getCmp?.(fieldGrids[0].id);
  if(!fieldGrid||fieldGrid.el?.dom!==fieldGrids[0]||!root.contains(fieldGrids[0]))return fail('calculator_input_grid');
  const fieldStore=fieldGrid.getStore?.(),fieldData=fieldStore?.getData?.(),fieldRecords=fieldData?.items,fieldSource=fieldData?.getSource?.()?.items;
  if(fieldStore?.$className!=='Ext.data.Store'||fieldStore.isBufferedStore||fieldStore.isLoading?.()
    ||!Array.isArray(fieldRecords)||fieldRecords.length>1000||fieldStore.getCount?.()!==fieldRecords.length
    ||![0,fieldRecords.length].includes(fieldStore.getTotalCount?.())||fieldSource&&(!Array.isArray(fieldSource)||fieldSource.length!==fieldRecords.length||new Set(fieldSource).size!==fieldRecords.length||fieldSource.some(r=>!fieldRecords.includes(r))))return fail('calculator_input_filtered');
  const fields=[],fieldNames=new Set(),fieldIds=new Set();
  for(const r of fieldRecords) {
    const d=r?.data,id=String(r?.internalId??'');
    if(!r?.isModel||!d||!id||fieldIds.has(id)||d.GroupType!=='Fields'||typeof d.Name!=='string'||!d.Name||fieldNames.has(d.Name.toLowerCase())
      ||typeof d.DisplayName!=='string'||!types[d.DataType]||typeof d.Replaced!=='boolean')return fail('calculator_input_record');
    fieldIds.add(id);fieldNames.add(d.Name.toLowerCase());fields.push({record_id:id,name:d.Name,label:d.DisplayName,type:types[d.DataType],replaced:d.Replaced});
  }
  const errorControls=exact(prefix+';WizrdMCF;btnError');
  const error=errorControls.length===1?errorControls[0].getAttribute('data-qtip'):null;
  return {verified:true,mode:'expression',inventory_complete:true,state_source:'cached_expression_store_and_selected_editor',
    expressions,input_fields:fields,settings_applied:false,syntax_validity:'unverified',
    syntax_error:typeof error==='string'&&error.length>0?error.slice(0,4096):null};
}
