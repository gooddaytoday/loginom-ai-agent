import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeFactorAnalysisContextCode(binding) {
 validatePreparedNodeContext(binding);
 return `async page=>(${readFactorAnalysisContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readFactorAnalysisBrowser.toString()})`;
}

export async function readFactorAnalysisContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readFactorAnalysisBrowser) {
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'factor_analysis_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'factor_analysis_node_changed'};
 return {...result,node_context:after};
}

// Observe the complete local collection; never load a proxy or execute a
// conversion. Record IDs survive edits, whereas field names and DOM tids change.
// Input-source correspondence is a separate proof, not inferred from labels.
export function readFactorAnalysisBrowser(prefix) {
 const parameterBase=prefix+';WizrdMCF;FactorAnalysisWizard;';
 const parameterRoots=[...document.querySelectorAll('[data-tid='+JSON.stringify(parameterBase.slice(0,-1))+']')];
 if(parameterRoots.length===1&&parameterRoots[0].checkVisibility({checkVisibilityCSS:true})){
  const values={},switches={};
  for(const key of ['pedSignificanceCriterion','pedEigenValuesThreshold','pedCumDispersion','pedNFactors','pedRotationType','pedNOutFactorsMax']){
   const es=[...document.querySelectorAll('[data-tid='+JSON.stringify(parameterBase+key+';ValueControl')+']')],c=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);
   if(c?.el?.dom!==es[0]||typeof c.getValue!=='function')return {verified:false,reason:'factor_analysis_control'};
   values[key]=c.getValue();
   const sw=[...document.querySelectorAll('[data-tid='+JSON.stringify(parameterBase+key+';SwitchButton')+']')];
   if(sw.length>1)return {verified:false,reason:'factor_analysis_switch'};
   switches[key]=sw.length===1&&globalThis.Ext?.getCmp?.(sw[0].id)?.pressed===true;
  }
  const es=[...document.querySelectorAll('[data-tid='+JSON.stringify(parameterBase+'cntOutFactorsMax;cnt;chb')+']')],cap=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);
  if(cap?.el?.dom!==es[0]||typeof cap.getValue?.()!=='boolean'||!Number.isSafeInteger(values.pedNFactors))return {verified:false,reason:'factor_analysis_cap'};
  return {verified:true,kind:'parameters',criterion:values.pedSignificanceCriterion,factors:values.pedNFactors,rotation:values.pedRotationType,output_cap:cap.getValue(),values,switches};
 }
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;TuneDataSourceInputPortWizard;';
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const roots=exact(base.slice(0,-1)),root=roots[0];
 if(roots.length!==1||!root.checkVisibility({checkVisibilityCSS:true}))return fail('factor_analysis_root');
 if([...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].some(e=>e.checkVisibility({checkVisibilityCSS:true})))return fail('factor_analysis_mask');
 if(['EditTuneColumnDefForm',prefix+';WizrdMCF;EditTuneColumnDefForm'].some(t=>exact(t).some(e=>e.checkVisibility({checkVisibilityCSS:true}))))return fail('factor_analysis_editor');
 const component=key=>{const es=exact(base+key),e=es[0],c=es.length===1&&globalThis.Ext?.getCmp?.(e.id);return c?.el?.dom===e&&root.contains(e)?c:null;};
 const grid=component('grdTargetColumns'),store=grid?.getStore?.(),proxy=store?.getProxy?.();
 const data=store?.getData?.(),records=data?.items,source=data?.getSource?.()?.items;
 if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()
  ||proxy?.$className!=='bg.ext.CollectionProxy'||!proxy.pendingOperations||Object.keys(proxy.pendingOperations).length
  ||store.currentPage!==1||store.getRemoteFilter?.()!==false||store.getRemoteSort?.()!==false
  ||!Array.isArray(records)||records.length>1000||store.getCount?.()!==records.length||store.getTotalCount?.()!==records.length
  ||source&&(!Array.isArray(source)||source.length!==records.length||new Set(source).size!==records.length||source.some(r=>!records.includes(r))))return fail('factor_analysis_inventory');
 const selection=grid.getSelectionModel?.().getSelection?.();
 if(!Array.isArray(selection)||selection.some(r=>!records.includes(r)))return fail('factor_analysis_selection');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},kinds={0:'Неопределенное',1:'Непрерывный',2:'Дискретный'};
 const ids=new Set(),fieldIds=new Set(),names=new Set(),fields=[];
 for(const [index,r] of records.entries()) {
  const d=r?.data,id=String(r?.internalId??'');
  if(!r?.isModel||!id||ids.has(id)||!Number.isSafeInteger(d?.ID)||d.ID<0||fieldIds.has(d.ID)||d.Index!==index
   ||typeof d.Name!=='string'||!d.Name||d.Name.length>128||names.has(d.Name.toLowerCase())
   ||typeof d.DisplayName!=='string'||d.DisplayName.length>256||!types[d.DataType]||!kinds[d.DataKind]
   ||![0,3].includes(d.UsageType)||d.GroupField!==''||d.Broken!==false||d.ReverseBroken!==false)return {...fail('factor_analysis_record'),invalid_field:{index,name:d?.Name,native_index:d?.Index,usage_type:d?.UsageType,group:d?.GroupField,broken:d?.Broken,reverse_broken:d?.ReverseBroken,data_type:d?.DataType,data_kind:d?.DataKind}};
  ids.add(id);fieldIds.add(d.ID);names.add(d.Name.toLowerCase());
  fields.push({index,record_id:id,field_id:String(d.ID),name:d.Name,label:d.DisplayName,type:types[d.DataType],
   data_kind:kinds[d.DataKind],usage_type:d.UsageType,origin_type:d.OriginType,selected:selection.includes(r)});
 }
 return {verified:true,inventory_complete:true,state_source:'cached_factor_analysis_role_store',fields,settings_applied:false,source_identity_verified:false};
}
