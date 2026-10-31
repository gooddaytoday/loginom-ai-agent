import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeAutoCorrelationContextCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>(${readAutoCorrelationContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readAutoCorrelationBrowser.toString()})`;
}
export async function readAutoCorrelationContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readAutoCorrelationBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'autocorrelation_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'autocorrelation_node_changed'};
 return {...result,node_context:after};
}
export function readAutoCorrelationBrowser(prefix){
 const fail=reason=>({verified:false,reason}),exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const component=(tid,root)=>{const es=exact(tid),e=es[0],c=es.length===1&&globalThis.Ext?.getCmp?.(e.id);return c?.el?.dom===e&&(!root||root.contains(e))?c:null;};
 const active=tid=>{const es=exact(tid);return es.length===1&&es[0].checkVisibility({checkVisibilityCSS:true})?es[0]:null;};
 if([...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].some(e=>e.checkVisibility({checkVisibilityCSS:true})))return fail('autocorrelation_mask');
 const base=prefix+';WizrdMCF;AutoCorrelationWizard',root=active(base);
 if(root){
  if(!component(base))return fail('autocorrelation_root');
  const values={},switches={};
  for(const name of ['pedLagCount','pedDomainCalc','pedCalcPacf']){
   const c=component(base+';'+name+';ValueControl',root),es=exact(base+';'+name+';SwitchButton');
   if(!c||typeof c.getValue!=='function'||es.length>1)return fail('autocorrelation_control');
   values[name]=c.getValue();
   const sw=es.length===1&&component(base+';'+name+';SwitchButton',root);
   if(es.length&&typeof sw?.pressed!=='boolean')return fail('autocorrelation_switch');
   switches[name]=sw?sw.pressed:false;
  }
  // A visible card precedes its asynchronous values. Do not admit an edit yet.
  if(!Number.isSafeInteger(values.pedLagCount)||values.pedLagCount<0||![0,1,2].includes(values.pedDomainCalc)||typeof values.pedCalcPacf!=='boolean')return fail('autocorrelation_initializing');
  return {verified:true,kind:'parameters',lag_count:values.pedLagCount,domain:['time','frequency','auto'][values.pedDomainCalc],pacf:values.pedCalcPacf,switches};
 }
 const input=prefix+';WizrdMCF;TuneDataSourceInputPortWizard',inputRoot=active(input);
 if(!inputRoot)return fail('autocorrelation_input_root');
 if(['EditTuneColumnDefForm',prefix+';WizrdMCF;EditTuneColumnDefForm'].some(t=>active(t)))return fail('autocorrelation_editor');
 const grid=component(input+';grdTargetColumns',inputRoot),store=grid?.getStore?.(),proxy=store?.getProxy?.(),data=store?.getData?.(),records=data?.items,source=data?.getSource?.()?.items;
 if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()||proxy?.$className!=='bg.ext.CollectionProxy'
  ||!proxy.pendingOperations||Object.keys(proxy.pendingOperations).length||store.currentPage!==1||store.getRemoteFilter?.()!==false||store.getRemoteSort?.()!==false
  ||!Array.isArray(records)||records.length>1000||store.getCount?.()!==records.length||store.getTotalCount?.()!==records.length
  ||source&&(!Array.isArray(source)||source.length!==records.length||new Set(source).size!==records.length||source.some(r=>!records.includes(r))))return fail('autocorrelation_inventory');
 const fields=[],ids=new Set(),fieldIds=new Set(),names=new Set(),types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},kinds={0:'Неопределенное',1:'Непрерывный',2:'Дискретный'};
 for(const [index,r] of records.entries()){
  const d=r?.data,id=String(r?.internalId??'');
  if(!r?.isModel||!id||ids.has(id)||!Number.isSafeInteger(d?.ID)||d.ID<0||fieldIds.has(d.ID)||d.Index!==index
   ||typeof d.Name!=='string'||!d.Name||names.has(d.Name.toLowerCase())||typeof d.DisplayName!=='string'||!types[d.DataType]||!kinds[d.DataKind]
   ||![0,1].includes(d.UsageType)||d.GroupField!==''||d.Broken!==false||d.ReverseBroken!==false)return fail('autocorrelation_record');
  ids.add(id);fieldIds.add(d.ID);names.add(d.Name.toLowerCase());
  fields.push({index,record_id:id,field_id:String(d.ID),name:d.Name,label:d.DisplayName,type:types[d.DataType],data_kind:kinds[d.DataKind],usage_type:d.UsageType});
 }
 return {verified:true,kind:'roles',inventory_complete:true,fields};
}
