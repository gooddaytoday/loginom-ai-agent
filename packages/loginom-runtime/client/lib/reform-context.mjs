import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeReformContextCode(binding) {
 validatePreparedNodeContext(binding);
 return `async page=>(${readReformContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readReformBrowser.toString()})`;
}

export async function readReformContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readReformBrowser) {
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'reform_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'reform_node_changed'};
 return {...result,node_context:after};
}

// Observe the complete local collection; never load a proxy or execute a
// conversion. Record IDs survive edits, whereas field names and DOM tids change.
// Input-source correspondence is a separate proof, not inferred from labels.
export function readReformBrowser(prefix) {
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;ReformColumnsWizard;';
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const roots=exact(base.slice(0,-1)),root=roots[0];
 if(roots.length!==1||!root.checkVisibility({checkVisibilityCSS:true}))return fail('reform_root');
 if([...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].some(e=>e.checkVisibility({checkVisibilityCSS:true})))return fail('reform_mask');
 if(['EditReformColumnDefForm',prefix+';WizrdMCF;EditReformColumnDefForm'].some(t=>exact(t).some(e=>e.checkVisibility({checkVisibilityCSS:true}))))return fail('reform_editor');
 const component=key=>{const es=exact(base+key),e=es[0],c=es.length===1&&globalThis.Ext?.getCmp?.(e.id);return c?.el?.dom===e&&root.contains(e)?c:null;};
 const grid=component('grdTargetColumns'),store=grid?.getStore?.(),proxy=store?.getProxy?.();
 const data=store?.getData?.(),records=data?.items,source=data?.getSource?.()?.items;
 if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()
  ||proxy?.$className!=='bg.ext.CollectionProxy'||!proxy.pendingOperations||Object.keys(proxy.pendingOperations).length
  ||store.currentPage!==1||store.getRemoteFilter?.()!==false||store.getRemoteSort?.()!==false
  ||!Array.isArray(records)||records.length>1000||store.getCount?.()!==records.length||store.getTotalCount?.()!==records.length
  ||source&&(!Array.isArray(source)||source.length!==records.length||new Set(source).size!==records.length||source.some(r=>!records.includes(r))))return fail('reform_inventory');
 const selection=grid.getSelectionModel?.().getSelection?.();
 if(!Array.isArray(selection)||selection.some(r=>!records.includes(r)))return fail('reform_selection');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},kinds={0:'Неопределенное',1:'Непрерывный',2:'Дискретный'};
 const ids=new Set(),fieldIds=new Set(),names=new Set(),fields=[];
 for(const [index,r] of records.entries()) {
  const d=r?.data,id=String(r?.internalId??'');
  if(!r?.isModel||!id||ids.has(id)||!Number.isSafeInteger(d?.ID)||d.ID<0||fieldIds.has(d.ID)||d.Index!==index
   ||typeof d.Name!=='string'||!d.Name||d.Name.length>128||names.has(d.Name.toLowerCase())
   ||typeof d.DisplayName!=='string'||d.DisplayName.length>256||!types[d.DataType]||!kinds[d.DataKind]
   ||![0,3,4,6,7,8,9].includes(d.DefaultUsageType)||![0,1,2].includes(d.CachingMethod)
   ||typeof d.Excluded!=='boolean'||d.Broken!==false||d.ReverseBroken!==false)return fail('reform_record');
  ids.add(id);fieldIds.add(d.ID);names.add(d.Name.toLowerCase());
  fields.push({index,record_id:id,field_id:String(d.ID),name:d.Name,label:d.DisplayName,type:types[d.DataType],
   data_kind:kinds[d.DataKind],usage_type:d.DefaultUsageType,caching_method:d.CachingMethod,excluded:d.Excluded,selected:selection.includes(r)});
 }
 const cache=component('pedDataSourceCachingMethod;ValueControl'),switcher=component('pedDataSourceCachingMethod;SwitchButton');
 const value=cache?.getValue?.(),display=cache?.getRawValue?.();
 if(!cache||!switcher||![0,1,2,3].includes(value)||typeof display!=='string'||typeof switcher.pressed!=='boolean')return fail('reform_caching');
 return {verified:true,inventory_complete:true,state_source:'cached_reform_store',fields,
  caching:{value,display,variable:switcher.pressed},settings_applied:false,source_identity_verified:false};
}
