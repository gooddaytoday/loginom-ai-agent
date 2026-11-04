import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeDataToVarContextCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>(${readDataToVarContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readDataToVarBrowser.toString()})`;
}
export async function readDataToVarContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readDataToVarBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'datatovar_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'datatovar_node_changed'};
 return {...result,node_context:after};
}

// Cached UI records only. No proxy loads, engine calls or server evaluation.
// Chain membership is the field role; no disposition ordinal is inferred from
// the unrelated GroupDataWizard. Unknown store shapes fail closed.
export function readDataToVarBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;DataToVariablesWizard;';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base.slice(0,-1));
 if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('datatovar_root');
 const grids=['grdDataFields','grdUsedFields'].map(k=>exact(base+k));
 if(grids.some(es=>es.length!==1||!roots[0].contains(es[0])))return fail('datatovar_grids');
 const components=grids.map(es=>globalThis.Ext?.getCmp?.(es[0].id));
 if(components.some((c,i)=>c?.el?.dom!==grids[i][0]))return fail('datatovar_grid_binding');
 const chains=components.map(c=>c.getStore?.()),stores=chains.map(s=>s?.getSource?.());
 if(chains.some(s=>s?.$className!=='Ext.data.ChainedStore'||s.isLoading?.())||!stores[0]||stores[0]!==stores[1])return fail('datatovar_source_binding');
 const store=stores[0],data=store.getData?.(),records=data?.items,source=data?.getSource?.()?.items;
 if(store.$className!=='Ext.data.Store'||store.isBufferedStore||store.isLoading?.()||!Array.isArray(records)||records.length>1000
  ||store.getCount?.()!==records.length||source&&(source.length!==records.length||source.some(r=>!records.includes(r))))return fail('datatovar_source_inventory');
 const partitions=chains.map(s=>s.getData?.()?.items);
 if(partitions.some(rs=>!Array.isArray(rs)||rs.some(r=>!records.includes(r))||new Set(rs).size!==rs.length)
  ||partitions[0].length+partitions[1].length!==records.length||partitions[0].some(r=>partitions[1].includes(r)))return fail('datatovar_partition');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},fields=[],ids=new Set(),names=new Set();
 let summary=null;
 for(const r of records){
  const d=r?.data,id=String(r?.internalId??'');
  // Native summary row observed in a2-diag:372. It belongs to the store and
  // partition proof, but is not an input field or a selected-field ordinal.
  if(r?.isModel&&id&&!ids.has(id)&&d?.Name===undefined&&d.DataType===0&&d.DisplayName===''&&d.Disposition===3
   &&d.Order===0&&d.Index===0&&d.GroupFunctions===0&&d.Separator===''&&d.Wrapper===''&&d.UniqueOnly===false&&d.Sort===false&&d.SortDirection===0){
   if(summary)return fail('datatovar_duplicate_summary');summary=r;ids.add(id);continue;
  }
  if(!r?.isModel||!id||ids.has(id)||typeof d?.Name!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(d.Name)||names.has(d.Name.toLowerCase())
   ||typeof d.DisplayName!=='string'||d.DisplayName.length>256||!types[d.DataType]||!Number.isSafeInteger(d.GroupFunctions)||d.GroupFunctions<0||d.GroupFunctions>16383){
   // A refused read must retain enough bounded native shape to distinguish a
   // model mismatch from incomplete data, without traversing native objects.
   const scalar=v=>v===null||typeof v==='boolean'?v:typeof v==='number'?Number.isFinite(v)?v:'[nonfinite]':typeof v==='string'?v.slice(0,256):'['+typeof v+']';
   return {...fail('datatovar_input_record'),record_shape:{record_id:id.slice(0,128),is_model:r?.isModel===true,
    data:Object.fromEntries(Object.entries(d??{}).slice(0,32).map(([k,v])=>[k.slice(0,128),scalar(v)]))}};
  }
  const settings={};
  for(const key of ['Index','Separator','Wrapper','UniqueOnly','Sort','SortDirection'])if(Object.hasOwn(d,key)){
   if(!['string','boolean','number'].includes(typeof d[key])||typeof d[key]==='number'&&!Number.isFinite(d[key])
    ||typeof d[key]==='string'&&d[key].length>2048)return fail('datatovar_field_settings');
   settings[key]=d[key];
  }
  ids.add(id);names.add(d.Name.toLowerCase());
  const order=partitions[1].indexOf(r);
  fields.push({record_id:id,name:d.Name,label:d.DisplayName,type:types[d.DataType],role:order<0?'available':'selected',order,functions:d.GroupFunctions,settings});
 }
 const selectedFields=partitions[1].filter(r=>r!==summary);
 for(const field of fields)field.order=selectedFields.findIndex(r=>String(r.internalId)===field.record_id);
 const selections={};
 for(const [i,role]of ['available','selected'].entries()){
  const selected=components[i].getSelectionModel?.().getSelection?.();
  if(!Array.isArray(selected)||new Set(selected).size!==selected.length||selected.some(r=>!records.includes(r)))return fail('datatovar_selection');
  selections[role]=selected.filter(r=>r!==summary&&partitions[i].includes(r)).map(r=>String(r.internalId));
 }
 return {verified:true,inventory_complete:true,state_source:'cached_datatovar_source_store',input_fields:fields,
  fields:fields.filter(f=>f.role==='selected').sort((a,b)=>a.order-b.order),selections,settings_applied:false};
}
