import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeCollapseContextCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readCollapseContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readCollapseBrowser.toString()})`;}
export async function readCollapseContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readCollapseBrowser){
 const before=await readNode(page,binding);if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'collapse_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'collapse_node_changed'};
 return {...result,node_context:after};
}
// Native local UI stores observed in Loginom 7.4.2. Never load a dataset proxy.
export function readCollapseBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;ColumnFlippingWizard;';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base.slice(0,-1));if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('collapse_root');
 const cmp=k=>{const es=exact(base+k),c=es.length===1&&globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]&&roots[0].contains(es[0])?c:null;};
 const components=['grdDataFields','grdUsedFields'].map(cmp),chains=components.map(c=>c?.getStore?.()),stores=chains.map(s=>s?.getSource?.());
 if(chains.some(s=>s?.$className!=='Ext.data.ChainedStore'||s.isLoading?.())||stores[0]!==stores[1])return fail('collapse_source_binding');
 const store=stores[0],data=store?.getData?.(),records=data?.items,source=data?.getSource?.()?.items;
 if(store?.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()||store.getProxy?.()?.$className!=='bg.ext.CollectionProxy'||!Array.isArray(records)||records.length>1002
  ||store.getCount?.()!==records.length||source&&(source.length!==records.length||source.some(r=>!records.includes(r))))return fail('collapse_source_inventory');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},fields=[],ids=new Set(),names=new Set(),placeholders=[];
 for(const r of records){const d=r?.data,id=String(r?.internalId??'');
  if(r?.isModel&&d?.Name===undefined&&d.DataType===0&&d.DisplayName===''&&[6,7].includes(d.Disposition)&&d.Order===0&&d.Index===0){
   if(placeholders.includes(d.Disposition))return fail('collapse_placeholder_duplicate');placeholders.push(d.Disposition);continue;
  }
  if(!r?.isModel||!id||ids.has(id)||typeof d?.Name!=='string'||!d.Name||d.Name.length>128||names.has(d.Name.toLowerCase())||typeof d.DisplayName!=='string'||d.DisplayName.length>256
   ||!types[d.DataType]||![0,6,7].includes(d.Disposition)||!Number.isSafeInteger(d.Order)||d.Order< -1||!Number.isSafeInteger(d.Index)||d.Index<0)return fail('collapse_input_record');
  ids.add(id);names.add(d.Name.toLowerCase());fields.push({record_id:id,name:d.Name,label:d.DisplayName,type:types[d.DataType],index:d.Index,disposition:d.Disposition,order:d.Order});
 }
 fields.sort((a,b)=>a.index-b.index);
 if(fields.length>1000||fields.some((f,i)=>f.index!==i)||placeholders.some(d=>fields.some(f=>f.disposition===d)))return fail('collapse_input_order');
 const information=fields.filter(f=>f.disposition===6).sort((a,b)=>a.order-b.order),transposed=fields.filter(f=>f.disposition===7).sort((a,b)=>a.order-b.order);
 if([information,transposed].some(fs=>fs.some((f,i)=>f.order!==i)))return fail('collapse_role_order');
 const selections={};for(const [i,role]of ['available','selected'].entries()){
  const rs=chains[i].getData?.()?.items,selection=components[i].getSelectionModel?.()?.getSelection?.();
  if(!Array.isArray(rs)||rs.some(r=>!records.includes(r))||!Array.isArray(selection)||selection.some(r=>!records.includes(r)))return fail('collapse_chain_selection');
  const expected=records.filter(r=>i===0?r.data.Disposition===0:r.data.Disposition!==0);
  if(rs.length!==expected.length||new Set(rs).size!==rs.length||expected.some(r=>!rs.includes(r)))return fail('collapse_partition');
  // Both role grids share a selection model; after moving a field its old grid
  // retains that same source record. Only members of this grid are actionable.
  selections[role]=selection.filter(r=>rs.includes(r)).map(r=>String(r.internalId));
 }
 const option=cmp('pedSkipNullCases;ValueControl'),sw=cmp('pedSkipNullCases;SwitchButton');
 if(typeof option?.getValue?.()!=='boolean'||typeof sw?.pressed!=='boolean')return fail('collapse_skip_option');
 return {verified:true,inventory_complete:true,state_source:'cached_collapse_source_store',input_fields:fields,information,transposed,selections,
  skip_null:{value:option.getValue(),switch_pressed:sw.pressed},settings_applied:false};
}
