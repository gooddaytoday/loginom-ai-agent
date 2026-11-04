import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeVariablesCalculatorContextCode(binding) {
  validatePreparedNodeContext(binding);
  return `async page=>(${readVariablesCalculatorContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readVariablesCalculatorBrowser.toString()})`;
}

export async function readVariablesCalculatorContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readVariablesCalculatorBrowser) {
  const before=await readNode(page,binding);
  if(before.verified!==true||before.surface!=='wizard'||before.output_port||before.input_port)return {verified:false,reason:'variables_calculator_node_surface'};
  const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix);
  const after=await readNode(page,binding);
  if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'variables_calculator_node_changed'};
  return {...result,node_context:after};
}

// Read the bounded, unfiltered local Ext store and the active CodeMirror document.
// The selected record's Expression is only flushed by Loginom on selection/Next;
// its editor is therefore authoritative while it remains selected. Never load a
// proxy or evaluate a formula to obtain this configuration evidence.
export function readVariablesCalculatorBrowser(prefix) {
  const fail=reason=>({verified:false,reason});
  const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
  const base=prefix+';WizrdMCF;CalcVariablesWizard;',roots=exact(base.slice(0,-1));
  if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('variables_calculator_root');
  const root=roots[0];
  if(exact(prefix+';WizrdMCF;ExprEditForm').some(e=>e.checkVisibility({checkVisibilityCSS:true})))return fail('variables_calculator_parameter_editor');
  if([...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].some(e=>e.checkVisibility({checkVisibilityCSS:true})))return fail('variables_calculator_mask');
  const grids=exact(base+'grdExpressions'),grid=grids.length===1&&globalThis.Ext?.getCmp?.(grids[0].id);
  if(!grid||grid.el?.dom!==grids[0]||!root.contains(grids[0]))return fail('variables_calculator_grid');
  const store=grid.getStore?.(),data=store?.getData?.(),records=data?.items,source=data?.getSource?.()?.items;
  if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()
    ||!Array.isArray(records)||records.length>32||store.getCount?.()!==records.length
    ||![0,records.length].includes(store.getTotalCount?.())
    ||source&&(!Array.isArray(source)||source.length!==records.length||new Set(source).size!==records.length||source.some(r=>!records.includes(r))))return fail('variables_calculator_filtered_store');
  const selection=grid.getSelectionModel?.()?.getSelection?.();
  if(!Array.isArray(selection)||selection.length!==1||!records.includes(selection[0]))return fail('variables_calculator_selection');
  const editors=exact(base+'cmpExpression'),wrappers=editors.length===1?[...editors[0].querySelectorAll('.CodeMirror')]:[];
  const wrapper=wrappers[0],cm=wrapper?.CodeMirror,doc=cm?.getDoc?.();
  if(wrappers.length!==1||!root.contains(editors[0])||cm?.getWrapperElement?.()!==wrapper||!doc)return fail('variables_calculator_editor');
  const count=doc.lineCount?.();
  if(!Number.isSafeInteger(count)||count<1||count>128||doc.firstLine?.()!==0||doc.lastLine?.()!==count-1)return fail('variables_calculator_editor_lines');
  const lines=Array.from({length:count},(_,i)=>doc.getLine(i));
  if(lines.some(s=>typeof s!=='string'||/[\r\n\0]/.test(s)))return fail('variables_calculator_editor_text');
  const text=lines.join('\n');if(text.length>2048)return fail('variables_calculator_editor_size');
  const types={1:'boolean',3:'real',4:'integer',5:'string'},names=new Set(),ids=new Set(),expressionIds=new Set(),expressions=[];
  for(const [index,r] of records.entries()) {
    const d=r?.data,id=String(r?.internalId??'');
    if(!r?.isModel||!d||!id||ids.has(id)||expressionIds.has(d.ID)||d.Index!==index||!Number.isSafeInteger(d.ID)||d.ID<0
      ||!types[d.DataType]||typeof d.Name!=='string'||! /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(d.Name)
      ||names.has(d.Name.toLowerCase())||typeof d.DisplayName!=='string'||d.DisplayName.length>256
      ||typeof d.Description!=='string'||d.Description.length>8192
      ||typeof d.Intermediate!=='boolean')return fail('variables_calculator_record');
    const formula=r===selection[0]?text:d.Expression;
    if(typeof formula!=='string'||formula.length>2048||/[\r\0]/.test(formula)||formula.split('\n').length>128)return fail('variables_calculator_formula');
    ids.add(id);expressionIds.add(d.ID);names.add(d.Name.toLowerCase());
    expressions.push({index,record_id:id,expression_id:String(d.ID),name:d.Name,label:d.DisplayName,type:types[d.DataType],
      formula,intermediate:d.Intermediate,description:d.Description,
      selected:r===selection[0]});
  }
  const errorControls=exact(prefix+';WizrdMCF;btnError');
  const error=errorControls.length===1?errorControls[0].getAttribute('data-qtip'):null;
  return {verified:true,mode:'expression',inventory_complete:true,state_source:'cached_expression_store_and_selected_editor',
    expressions,settings_applied:false,syntax_validity:'unverified',
    syntax_error:typeof error==='string'&&error.length>0?error.slice(0,4096):null};
}
