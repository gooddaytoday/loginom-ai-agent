import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeElimOutlierContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readElimOutlierContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readElimOutlierBrowser.toString()})`;}
export async function readElimOutlierContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readElimOutlierBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'elim_outlier_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'elim_outlier_owner_changed'};
 return {...result,node_context:after};
}
// Only the owned local field collection and rendered controls are read. No
// engine/proxy getters, learned statistics or native mutations are invoked.
export function readElimOutlierBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;ElimOutlierWizard;';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base.slice(0,-1));if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('elim_outlier_root');
 const cmp=k=>{const es=exact(base+k);if(es.length!==1||!roots[0].contains(es[0]))return null;const c=globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
 const grid=cmp('grdColumnsSettings'),store=grid?.getStore?.(),data=store?.getData?.(),rs=data?.items,source=data?.getSource?.()?.items;
 if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()||store.getProxy?.()?.$className!=='bg.ext.CollectionProxy'
  ||!Array.isArray(rs)||rs.length>1000||store.getCount?.()!==rs.length||source&&(source.length!==rs.length||source.some(r=>!rs.includes(r))))return fail('elim_outlier_inventory');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},kinds={1:'Непрерывный',2:'Дискретный'},fields=[],names=new Set(),ids=new Set();
 for(const [index,r] of rs.entries()){
  const d=r?.data,id=String(r?.internalId??'');
  if(!r?.isModel||!id||ids.has(id)||typeof d?.Name!=='string'||!d.Name||names.has(d.Name)||typeof d.DisplayName!=='string'||!types[d.DataType]||!kinds[d.DataKind]||typeof d.ChkUsable!=='boolean')return fail('elim_outlier_field');
  names.add(d.Name);ids.add(id);fields.push({index,record_id:id,name:d.Name,label:d.DisplayName,type:types[d.DataType],data_kind:kinds[d.DataKind],used:d.ChkUsable});
 }
 const selection=grid.getSelectionModel?.().getSelection?.();
 if(!Array.isArray(selection)||selection.length>1||selection.length===1&&!rs.includes(selection[0]))return fail('elim_outlier_selection');
 // A newly opened native page has no selected row. The complete inventory
 // authorizes selecting a field, never inferring that field's parameters.
 const selected=selection.length===1?fields[rs.indexOf(selection[0])]:null,values={},switches={};
 for(const key of ['pedDetectOSko','pedDetectESko','pedDetectOKvartil','pedDetectEKvartil','pedActionOut','pedActionExtr','pedOrderedSample','pedUseQuality']){
  const c=cmp(key+';ValueControl');if(!c||typeof c.getValue!=='function')return fail('elim_outlier_control:'+key);
  values[key]=c.getValue();const es=exact(base+key+';SwitchButton');
  if(es.length>1||es.length===1&&typeof cmp(key+';SwitchButton')?.pressed!=='boolean')return fail('elim_outlier_switch');
  switches[key]=es.length===1&&cmp(key+';SwitchButton').pressed;
 }
 const radios=['pedModeOE;ValueControl;radiofield','pedModeOE;ValueControl;radiofield-1'].map(k=>cmp(k)?.getValue?.());
 if(selected?.used&&(!radios.every(v=>typeof v==='boolean')||radios[0]===radios[1]
  ||!['pedDetectOSko','pedDetectESko','pedDetectOKvartil','pedDetectEKvartil'].every(k=>Number.isFinite(values[k])&&values[k]>=0)
  ||!['pedActionOut','pedActionExtr'].every(k=>Number.isInteger(values[k])&&values[k]>=1&&values[k]<=7)))return fail('elim_outlier_selected_settings');
 if(typeof values.pedOrderedSample!=='boolean'||typeof values.pedUseQuality!=='boolean')return fail('elim_outlier_global_settings');
 const method=radios[0]?'sd':'iqr';
 return {verified:true,inventory_complete:true,state_source:'cached_elim_outlier_store',fields,selected,values,switches,
  ordered:values.pedOrderedSample,quality:values.pedUseQuality,
  settings:selected?.used?{method,outlier_factor:values[method==='sd'?'pedDetectOSko':'pedDetectOKvartil'],extreme_factor:values[method==='sd'?'pedDetectESko':'pedDetectEKvartil'],outlier_policy:values.pedActionOut===1?'keep':'unsupported',extreme_policy:values.pedActionExtr===1?'keep':'unsupported'}:null,
  settings_applied:false};
}
