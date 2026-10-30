import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeCorrAnalysisContextCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>(${readCorrAnalysisContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readCorrAnalysisBrowser.toString()})`;
}
export async function readCorrAnalysisContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readCorrAnalysisBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'correlation_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'correlation_node_changed'};
 return {...result,node_context:after};
}
export function readCorrAnalysisBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;CorrAnalysisWizard';
 const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
 const roots=exact(base),root=roots[0],view=roots.length===1&&globalThis.Ext?.getCmp?.(root.id);
 if(!root?.checkVisibility({checkVisibilityCSS:true})||view?.el?.dom!==root)return fail('correlation_root');
 const grids=exact(base+';grdColumns'),grid=grids.length===1&&globalThis.Ext?.getCmp?.(grids[0].id);
 if(grid?.el?.dom!==grids[0]||!root.contains(grids[0]))return fail('correlation_grid');
 const store=grid.getStore?.(),records=store?.getData?.()?.items,proxy=store?.getProxy?.();
 if(store?.$className!=='Ext.data.Store'||proxy?.$className!=='bg.ext.CollectionProxy'||store.isLoading?.()||store.isBufferedStore
  ||!Array.isArray(records)||records.length>1000||store.getCount?.()!==records.length||store.getRemoteFilter?.()===true||store.getRemoteSort?.()===true
  ||proxy.pendingOperations&&Object.keys(proxy.pendingOperations).length)return fail('correlation_inventory');
 const fields=[];
 for(const [index,r] of records.entries()){
  const d=r?.data;
  if(!r?.isModel||r.internalId===undefined||typeof d?.Name!=='string'||!d.Name||typeof d.DisplayName!=='string'||![1,2,3,4,5,6].includes(d.DataType)||typeof d.ChkFirstSet!=='boolean'||typeof d.ChkSecondSet!=='boolean')return fail('correlation_record');
  fields.push({index,record_id:String(r.internalId),name:d.Name,label:d.DisplayName,type:{1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'}[d.DataType],first_set:d.ChkFirstSet,second_set:d.ChkSecondSet});
 }
 if(new Set(fields.map(f=>f.name)).size!==fields.length||new Set(fields.map(f=>f.record_id)).size!==fields.length)return fail('correlation_identity');
 const coefficients={};
 for(const [name,key] of [['pearson','cbCorrTypeLinear'],['kendall','cbCorrTypeKendall'],['spearman','cbCorrTypeSpearmen'],['extremum','cbCorrTypeExtremum']]){
  const es=exact(base+';'+key),c=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);
  if(c?.el?.dom!==es[0]||!root.contains(es[0])||typeof c.getValue!=='function'||typeof c.getValue()!=='boolean')return fail('correlation_coefficient');
  coefficients[name]=c.getValue();
 }
 return {verified:true,inventory_complete:true,fields,coefficients};
}
