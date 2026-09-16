import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeFilterContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readFilterContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readFilterBrowser.toString()})`;}
export async function readFilterContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readFilterBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'filter_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'filter_node_changed'};
 return {...result,node_context:after};
}
// Read cached local model data only, never getters on RPC proxies. The grid
// includes OR pseudo-records which are absent from the persisted filter list.
export function readFilterBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;FilterDataWizard;FilterDataPanel';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base);if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('filter_root');
 const grid=globalThis.Ext?.getCmp?.(roots[0].id),controller=grid?.Controller,store=grid?.getStore?.();
 if(grid?.$className!=='bg.components.filterdata.view.FilterDataPanel'||grid.el?.dom!==roots[0]||controller?.FView!==grid
  ||controller.FFilterItemsStore!==store)return fail('filter_owner');
 const complete=(s,limit)=>{const d=s?.getData?.(),items=d?.items,source=d?.getSource?.()?.items;
  return s?.$className==='Ext.data.Store'&&!s.isBufferedStore&&!s.isLoading?.()&&!s.isSyncing
   &&s.getProxy?.()?.$className==='bg.ext.CollectionProxy'&&Array.isArray(items)&&items.length<=limit
   &&s.getCount()===items.length&&(!source||source.length===items.length&&source.every(r=>items.includes(r)))?items:null;};
 const records=complete(store,128),input=complete(controller.FColumnInfoStore,1001);
 if(!records||records.length>128||!input)return fail('filter_inventory');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},fields=[],names=new Set();
 let rowNumbers=0;
 for(const r of input){const d=r?.data;
  if(!r?.isModel||![0,1].includes(d?.RowNumberer)||!types[d.DataType])return fail('filter_input');
  if(d.RowNumberer===1){if(d.Value!==''||d.DataType!==4||++rowNumbers>1) return fail('filter_row_number');continue;}
  if(fields.length>=1000)return fail('filter_inventory');
  if(typeof d.Name!=='string'||!d.Name||d.Value!==d.Name||names.has(d.Name)||typeof d.DisplayText!=='string')return fail('filter_input_identity');
  names.add(d.Name);fields.push({record_id:String(r.internalId),name:d.Name,label:d.DisplayText,type:types[d.DataType],data_kind:({1:'Непрерывный',2:'Дискретный'})[d.DataKind]??null});
 }
 const literal=(v,type)=>{
  if(v===null)return null;
  if(type==='datetime'){if(!(v instanceof Date)||!Number.isFinite(+v))throw Error('date');
   const z=(n,l=2)=>String(n).padStart(l,'0');return `${z(v.getFullYear(),4)}-${z(v.getMonth()+1)}-${z(v.getDate())}T${z(v.getHours())}:${z(v.getMinutes())}:${z(v.getSeconds())}.${z(v.getMilliseconds(),3)}`;}
  if(type==='integer'&&!Number.isSafeInteger(v)||type==='real'&&(typeof v!=='number'||!Number.isFinite(v))
   ||type==='boolean'&&typeof v!=='boolean'||type==='string'&&(typeof v!=='string'||v.length>256))throw Error('literal');
  if(!['integer','real','boolean','string'].includes(type))throw Error('unsupported literal');return v;
 };
 const rows=[],ids=new Set(),view=grid.getView?.();
 try{for(const [index,r] of records.entries()){
  const d=r?.data,id=String(r?.internalId??'');if(!r?.isModel||!id||ids.has(id))return fail('filter_record');ids.add(id);
  const row={record_id:id,index,kind:d.IsOperatorRecord===true?'or':'condition'};
  if(row.kind==='condition'){
   if(![0,1].includes(d.RowNumberer)||typeof d.Name!=='string'||!Number.isInteger(d.RelationType)||typeof d.CaseSensitive!=='boolean'||d.UseVariables!==0)return fail('filter_condition_or_variables');
   const type=types[d.DataType]??null;
   if(type==='variant')return fail('filter_variant');
   Object.assign(row,{field:d.RowNumberer===1?{kind:'row_number'}:{kind:'input_field',name:d.Name},type,operator_code:d.RelationType,case_sensitive:d.CaseSensitive});
   // Persisted records omit inactive operands. Never decode stale/default
   // scalar slots for an interval, list or null/boolean predicate.
   if(type){
    if([8,9].includes(d.RelationType))Object.assign(row,{lower:literal(d.CompareValueLowerBound,type),upper:literal(d.CompareValueUpperBound,type)});
    else if([10,11].includes(d.RelationType)){
     if(!Array.isArray(d.CompareValueList))return fail('filter_list');
     row.values=d.CompareValueList.map(v=>literal(v,type));
    }else if(d.RelationType<=5||d.RelationType>=12&&d.RelationType<=17)row.value=literal(d.CompareValue,type);
   }
  }
  const dom=view?.getNode?.(r);if(dom&&roots[0].contains(dom)&&dom.getAttribute('data-recordid')===id&&dom.getAttribute('data-boundview')===view.id){
   const cells={};for(const [key,col] of Object.entries({field:'colField',operator:'colRelationType',value:'colValue',case_sensitive:'colCaseSensitive',delete:'colDelete'})){
    const es=[...dom.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid').startsWith(base+';'+col+'_'));
    if(es.length!==1)return fail('filter_cell_identity');cells[key]=es[0].getAttribute('data-tid');
   }row.cells=cells;
  }rows.push(row);
 }}catch{return fail('filter_typed_value');}
 const selection=grid.getSelectionModel?.().getSelection?.();if(!Array.isArray(selection)||selection.some(r=>!records.includes(r)))return fail('filter_selection');
 const plugin=grid.editingPlugin,context=plugin?.context,editing=plugin?.editing===true;
 if(editing&&(!records.includes(context?.record)||context.grid!==grid||context.store!==store))return fail('filter_editor_owner');
 const editor=editing?{record_id:String(context.record.internalId),field:context.field,root_tid:plugin.activeEditor?.el?.dom?.getAttribute('data-tid')}:null;
 const dialogs=[];
 for(const [kind,key,content,recordKey] of [['range','FBetweenValuesWindow','FBetweenValuesEditor','FModel'],['list','FValueListWindow','FValueListEditor','FFilterRecord']]){
  const win=controller[key],ed=controller[content],dom=win?.FView?.el?.dom;
  if(!dom?.checkVisibility({checkVisibilityCSS:true}))continue;
  if(win.FModalWindowContent!==ed||!records.includes(ed?.[recordKey])||!dom.contains(ed?.FView?.el?.dom))return fail('filter_dialog_owner');
  dialogs.push({kind,root_tid:dom.getAttribute('data-tid'),record_id:String(ed[recordKey].internalId)});
 }
 if(dialogs.length>1)return fail('filter_dialog_ambiguous');
 const numericInputs=[],datetimeInputs=[];
 const inputRoots=[...(editing&&plugin.activeEditor?.el?.dom?[{dom:plugin.activeEditor.el.dom,record:context.record}]:[]),
  ...dialogs.flatMap(d=>exact(d.root_tid).map(dom=>({dom,record:records.find(r=>String(r.internalId)===d.record_id)})))];
 for(const {dom,record} of inputRoots)for(const el of dom.querySelectorAll('input')){
  const component=globalThis.Ext?.getCmp?.(el.getAttribute('componentid'));
  const anchor=el.closest('[data-tid]')?.getAttribute('data-tid');
  if(record?.data.DataType===2&&component?.$className==='Ext.form.field.ComboBox'&&component.inputEl?.dom===el&&anchor?.endsWith(';ValueContainer;cbx')){
   // This local helper returns the already cached scalar parser configuration;
   // it does not read a server/RPC property or change the editor's value.
   const c=globalThis.bg?.GetParserConfigForLocale?.();
   if(!c||![c.dayPos,c.monthPos,c.yearPos].sort().every((v,i)=>v===i+1)
    ||!['.','/','-'].includes(c.dateSeparator)||![' ', ', ', '\u00a0', ',\u00a0'].includes(c.timePrefix)
    ||c.timeSeparator!==':'||!['.',','].includes(c.mSecSeparator))return fail('filter_datetime_locale');
   datetimeInputs.push({anchor_tid:anchor,format:{day_pos:c.dayPos,month_pos:c.monthPos,year_pos:c.yearPos,
    date_separator:c.dateSeparator,time_prefix:c.timePrefix,time_separator:c.timeSeparator,millisecond_separator:c.mSecSeparator}});
  }
  if(record?.data.DataType===2&&component?.$className==='Ext.ux.DateTimeField'&&component.inputEl?.dom===el&&(anchor?.endsWith(';ValueContainer;datetimefield')||dialogs.some(d=>d.kind==='list'&&anchor?.startsWith(d.root_tid+';')&&anchor.endsWith(';VariantFieldEditor;datetimefield')))){
   // Native DateTimeFields accept ISO through Ext.Date's documented c
   // parser. Scalar/range property editors commit only whole seconds; the
   // list editor retains milliseconds (verified in the native UI).
   const formats=component.altFormatsArray??(typeof component.altFormats==='string'?component.altFormats.split('|'):null);
   if(!Array.isArray(formats)||!formats.includes('c'))return fail('filter_datetime_iso_parser');
   datetimeInputs.push({anchor_tid:anchor,format:{kind:'iso_local',precision:anchor.endsWith(';VariantFieldEditor;datetimefield')?'millisecond':'second'}});
  }
  if(component?.$className!=='Ext.form.field.Number'||component.inputEl?.dom!==el)continue;
  if(!['.',','].includes(component.decimalSeparator))return fail('filter_number_locale');
  numericInputs.push({anchor_tid:el.closest('[data-tid]')?.getAttribute('data-tid'),decimal_separator:component.decimalSeparator});
 }
 const decimalSeparator=globalThis.Ext?.util?.Format?.decimalSeparator;
 return {verified:true,inventory_complete:true,state_source:'cached_filter_stores',input_fields:fields,rows,selection:selection.map(r=>String(r.internalId)),editor,dialogs,
  numeric_inputs:numericInputs,datetime_inputs:datetimeInputs,decimal_separator:['.',','].includes(decimalSeparator)?decimalSeparator:null,settings_applied:false};
}
