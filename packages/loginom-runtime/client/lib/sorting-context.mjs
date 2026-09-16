import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeSortingContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readSortingContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readSortingBrowser.toString()})`;}
export async function readSortingContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readSortingBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'sorting_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'sorting_node_changed'};
 return {...result,node_context:after};
}
// Cached local stores only. The input chain retains all source fields; the
// sorting store's item order is priority (its Index/totalCount are stale).
export function readSortingBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;SortingWizard;SortingColumnCollection;';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base.slice(0,-1));if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('sorting_root');
 const cmp=k=>{const es=exact(base+k);if(es.length!==1||!roots[0].contains(es[0]))return null;const c=globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
 const available=cmp('grdFields'),selected=cmp('grdSorting'),chain=available?.getStore?.(),input=chain?.getSource?.(),used=selected?.getStore?.();
 if(chain?.$className!=='Ext.data.ChainedStore'||chain.isLoading?.())return fail('sorting_input_chain');
 const complete=s=>{const d=s?.getData?.(),items=d?.items,source=d?.getSource?.()?.items;
  return s?.$className==='Ext.data.Store'&&!s.isBufferedStore&&!s.isLoading?.()&&s.getProxy?.()?.$className==='bg.ext.CollectionProxy'
   &&Array.isArray(items)&&items.length<=1000&&s.getCount()===items.length&&(!source||source.length===items.length&&source.every(r=>items.includes(r)))?items:null;};
 const ins=complete(input),keys=complete(used);if(!ins||!keys)return fail('sorting_local_inventory');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},names=new Set(),ids=new Set(),fields=[];
 for(const r of ins){const d=r?.data,id=String(r?.internalId??'');
  if(!r?.isModel||!id||ids.has(id)||typeof d?.Name!=='string'||!d.Name||d.Name.length>128||names.has(d.Name.toLowerCase())||typeof d.DisplayName!=='string'||!types[d.DataType])return fail('sorting_input_record');
  ids.add(id);names.add(d.Name.toLowerCase());fields.push({record_id:id,name:d.Name,label:d.DisplayName,type:types[d.DataType]});
 }
 const ordered=[],seen=new Set(),keyIds=new Set();for(const [order,r] of keys.entries()){const d=r?.data,f=fields.find(f=>f.name===d?.Name),id=String(r?.internalId??'');
  // Loginom retains a removed/renamed key as an explicit unknown-type row.
  // Keep its identity so a complete replacement can delete it in this wizard;
  // never treat it as a usable input field or accept an unexplained typed row.
  const missing=!f&&d?.DataType===0&&d.DisplayName===d.Name;
  if(!r?.isModel||typeof d?.Name!=='string'||!d.Name||d.Name.length>128||!id||keyIds.has(id)||seen.has(d.Name.toLowerCase())
   ||!missing&&(!f||f.label!==d.DisplayName||f.type!==types[d.DataType])||![0,1].includes(d.SortDirection)||typeof d.CaseSensitive!=='boolean')return fail('sorting_key_record');
  keyIds.add(id);seen.add(d.Name.toLowerCase());ordered.push({...f,...(missing?{name:d.Name,label:d.DisplayName,type:null,missing_input:true}:{}),record_id:id,order,direction:d.SortDirection===0?'ASC':'DESC',case_sensitive:d.CaseSensitive});
 }
 const free=chain.getData?.()?.items;
 if(!Array.isArray(free)||new Set(free).size!==free.length||free.length!==fields.length-ordered.filter(k=>!k.missing_input).length||free.some(r=>!ins.includes(r)||seen.has(r.data.Name.toLowerCase())))return fail('sorting_available_partition');
 const selections={};for(const [name,c,rs] of [['available',available,ins],['selected',selected,keys]]){
  const selection=c.getSelectionModel?.().getSelection?.();if(!Array.isArray(selection)||selection.some(r=>!rs.includes(r)))return fail('sorting_selection');selections[name]=selection.map(r=>String(r.internalId));
 }
 const options={};for(const k of ['chkLocaleAware','chkBufferWhole','cbxMaxThreadCount']){
  const c=cmp(k+';ValueControl'),sw=cmp(k+';SwitchButton'),v=c?.getValue?.();
  if(!c||!sw||typeof sw.pressed!=='boolean'||(k==='cbxMaxThreadCount'?!Number.isSafeInteger(v)||v<0:typeof v!=='boolean'))return fail('sorting_option');
  options[k]={value:v,switch_pressed:sw.pressed};
 }
 return {verified:true,inventory_complete:true,state_source:'cached_sorting_stores',input_fields:fields,keys:ordered,selections,options,
  comparison:{mode:options.chkLocaleAware.value?'user_locale':'binary',locale:null,locale_verified:false,
   case_insensitivity:options.chkLocaleAware.value?'locale_dependent':'latin_only'},settings_applied:false};
}
