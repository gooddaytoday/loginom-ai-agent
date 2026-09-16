import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeGroupingContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readGroupingContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readGroupingBrowser.toString()})`;}
export async function readGroupingContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readGroupingBrowser){
 const before=await readNode(page,binding);if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'grouping_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'grouping_node_changed'};
 return {...result,node_context:after};
}
// The two chained stores share one local source store. Its records carry the
// complete input inventory; section placeholders exist only in the used chain.
// Read cached records only, never a proxy load or a Loginom mutation method.
export function readGroupingBrowser(prefix){
 const fail=reason=>({verified:false,reason});
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const visible=e=>e.checkVisibility({checkVisibilityCSS:true});
 const base=prefix+';WizrdMCF;GroupDataWizard;',roots=exact(base.slice(0,-1));
 if(roots.length!==1||!visible(roots[0]))return fail('grouping_root');
 const grids=['grdDataFields','grdUsedFields'].map(k=>exact(base+k));
 if(grids.some(es=>es.length!==1||!roots[0].contains(es[0])))return fail('grouping_grids');
 const components=grids.map(es=>globalThis.Ext?.getCmp?.(es[0].id));
 if(components.some((c,i)=>c?.el?.dom!==grids[i][0]))return fail('grouping_grid_binding');
 const chains=components.map(c=>c.getStore?.()),stores=chains.map(s=>s?.getSource?.());
 if(chains.some(s=>s?.$className!=='Ext.data.ChainedStore'||s.isLoading?.())||stores[0]!==stores[1])return fail('grouping_source_binding');
 const store=stores[0],data=store?.getData?.(),records=data?.items,source=data?.getSource?.()?.items;
 if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()||!Array.isArray(records)||records.length>1002
  ||store.getCount?.()!==records.length||source&&(source.length!==records.length||source.some(r=>!records.includes(r))))return fail('grouping_source_inventory');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},fields=[],ids=new Set(),names=new Set();
 const placeholders=[];
 for(const r of records){const d=r?.data,id=String(r?.internalId??'');
  if(r?.isModel&&d?.Name===undefined&&d.DataType===0&&d.DisplayName===''&&[6,7].includes(d.Disposition)
    &&d.Order===0&&d.Index===0&&d.GroupFunctions===0&&d.Separator===''&&d.Wrapper===''&&d.UniqueOnly===false&&d.Sort===false&&d.SortDirection===0){
   if(placeholders.includes(d.Disposition))return fail('grouping_duplicate_placeholder');placeholders.push(d.Disposition);continue;
  }
  if(!r?.isModel||!id||ids.has(id)||typeof d?.Name!=='string'||!d.Name||d.Name.length>128||names.has(d.Name.toLowerCase())
   ||typeof d.DisplayName!=='string'||d.DisplayName.length>256||!types[d.DataType]||![0,6,7].includes(d.Disposition)
   ||!Number.isSafeInteger(d.Order)||d.Order<(d.Disposition===0?-1:0)||!Number.isSafeInteger(d.GroupFunctions)||d.GroupFunctions<0||d.GroupFunctions>16383
   ||typeof d.Separator!=='string'||typeof d.Wrapper!=='string'||typeof d.UniqueOnly!=='boolean'||typeof d.Sort!=='boolean'||![0,1].includes(d.SortDirection))return fail('grouping_input_record');
  ids.add(id);names.add(d.Name.toLowerCase());fields.push({record_id:id,name:d.Name,label:d.DisplayName,type:types[d.DataType],disposition:d.Disposition,order:d.Order,functions:d.GroupFunctions,
   concat:{separator:d.Separator,wrapper:d.Wrapper,unique:d.UniqueOnly,sort:d.Sort,direction:d.SortDirection}});
 }
 const keys=fields.filter(f=>f.disposition===6).sort((a,b)=>a.order-b.order),measures=fields.filter(f=>f.disposition===7).sort((a,b)=>a.order-b.order);
 if(fields.length>1000||placeholders.some(d=>fields.some(f=>f.disposition===d)))return fail('grouping_placeholder_conflict');
 if([keys,measures].some(fs=>fs.some((f,i)=>f.order!==i)))return fail('grouping_order');
 const selected=components[1].getSelectionModel?.().getSelection?.();
 if(!Array.isArray(selected)||selected.some(r=>!records.includes(r)&&!(chains[1].getData().items.includes(r)&&r?.data?.Name===undefined&&r.data.DataType===0&&[6,7].includes(r.data.Disposition))))return fail('grouping_selection');
 const options={};for(const k of ['pedDimCache','pedSortResult']){
  const es=exact(base+k+';ValueControl'),switches=exact(base+k+';SwitchButton');
  const c=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id),s=switches.length===1&&globalThis.Ext?.getCmp?.(switches[0].id);
  if(!c||c.el?.dom!==es[0]||!s||s.el?.dom!==switches[0]||typeof c.getValue?.()!=='boolean')return fail('grouping_option');
  options[k]={value:c.getValue(),switch_pressed:s.pressed===true};
 }
 return {verified:true,inventory_complete:true,state_source:'cached_grouping_source_store',input_fields:fields,keys,measures,
  selected_records:selected.map(r=>String(r.internalId)),options,settings_applied:false};
}
