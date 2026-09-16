import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeMissingValuesContextCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>(${readMissingValuesContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readMissingValuesBrowser.toString()})`;
}
export async function readMissingValuesContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readMissingValuesBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'missing_values_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'missing_values_node_changed'};
 return {...result,node_context:after};
}

// Only rendered controls and their complete cached local collection are read.
// ActionNull is an observed UI enum; no engine object or learned value is read.
export function readMissingValuesBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;DataRecoveryWizard;';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base.slice(0,-1));
 if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('missing_values_root');
 const cmp=k=>{const es=exact(base+k);if(es.length!==1||!roots[0].contains(es[0]))return null;const c=globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
 const grid=cmp('grdColumnsSettings'),s=grid?.getStore?.(),data=s?.getData?.(),rs=data?.items,unfiltered=data?.getSource?.()?.items;
 if(s?.$className!=='Ext.data.Store'||s.isBufferedStore||s.isLoading?.()||s.getProxy?.()?.$className!=='bg.ext.CollectionProxy'
  ||!Array.isArray(rs)||rs.length>1000||s.getCount()!==rs.length||unfiltered&&(unfiltered.length!==rs.length||unfiltered.some(r=>!rs.includes(r))))return fail('missing_values_inventory');
 const fields=[],ids=new Set(),names=new Set(),types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},kinds={1:'Непрерывный',2:'Дискретный'};
 for(const [index,r] of rs.entries()){
  const d=r?.data,id=String(r?.internalId??'');
  if(!r?.isModel||!id||ids.has(id)||d?.Index!==index||typeof d.Name!=='string'||!d.Name||d.Name.length>128||names.has(d.Name.toLowerCase())
   ||typeof d.DisplayName!=='string'||!types[d.DataType]||!kinds[d.DataKind]||typeof d.Usable!=='boolean'||!Number.isInteger(d.ActionNull)||typeof d.NullStrValue!=='string'||d.NullStrValue.length>5000)return fail('missing_values_field');
  ids.add(id);names.add(d.Name.toLowerCase());
  fields.push({index,record_id:id,name:d.Name,label:d.DisplayName,type:types[d.DataType],data_kind:kinds[d.DataKind],used:d.Usable,
   method_code:d.ActionNull,method:d.ActionNull===3?'mean':d.ActionNull===6?'constant':null,value:d.NullStrValue});
 }
 const options={};
 for(const key of ['pedOrderedSample','pedMaxNullsPercent','pedUseQuality','RandSeedEdit;edtRandSeed']){
  const c=cmp(key+';ValueControl'),sw=cmp(key+';SwitchButton'),value=c?.getValue?.();
  if(!c||!sw||typeof sw.pressed!=='boolean'||(key==='pedMaxNullsPercent'?!Number.isInteger(value)||value<0||value>100:key==='RandSeedEdit;edtRandSeed'?typeof value!=='string'||value.length>32:typeof value!=='boolean'))return fail('missing_values_option');
  options[key]={value,switch_pressed:sw.pressed};
 }
 const plugin=grid.editingPlugin,context=plugin?.context;
 let editor=null,method_context=null;
 if(context){
  const field=fields.find(f=>f.record_id===String(context?.record?.internalId));
  if(!field||!rs.includes(context.record)||context.field!=='ActionNull'||context.grid!==grid)return fail('missing_values_editor');
  method_context={field_name:field.name,record_id:field.record_id,property:'method'};
  if(plugin?.editing===true)editor=method_context;
 }
 return {verified:true,inventory_complete:true,state_source:'cached_missing_values_store',input_fields:fields.map(({index,record_id,name,label,type,data_kind})=>({index,record_id,name,label,type,data_kind})),fields,options,editor,method_context,
  ordered:options.pedOrderedSample.value,max_nulls_percent:options.pedMaxNullsPercent.value,settings_applied:false};
}
