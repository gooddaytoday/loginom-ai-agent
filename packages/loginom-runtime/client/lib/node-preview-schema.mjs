import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
export function makeNodePreviewSchemaCode(binding){validatePreparedNodeContext(binding);return `async page=>(${readNodePreviewSchema.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readPreviewSchemaBrowser.toString()})`;}
export async function readNodePreviewSchema(page,binding,readNode=readPreparedNodeContext,readBrowser=readPreviewSchemaBrowser){
 const before=await readNode(page,binding);if(!before.verified||before.surface!=='graph')return {verified:false,reason:'preview_graph_owner'};
 const result=await page.evaluate(readBrowser,binding),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'preview_owner_changed'};
 return {...result,node_context:after};
}
export function readPreviewSchemaBrowser(binding){
 const fail=reason=>({verified:false,reason}),prefix=binding.workflow_ref.prefix;
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const model=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab()?.Controller?.FController;
 const manager=model?.FPreviewManager,form=manager?.FPreviewForm,node=form?.FCurrentPreviewNode,port=form?.FCurrentPreviewPort;
 const rootTid=prefix+';ModelForm;PreviewWindow',roots=exact(rootTid);
 if(manager?.constructor?.name!=='PreviewModelFormManager'||form?.constructor?.name!=='PreviewForm'||manager.FPreviewVisible!==true
  ||roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true})||manager.FPreviewWindow?.FView?.el?.dom!==roots[0]
  ||node?.FGuid!==binding.node.node_id||port?.parent!==node||port.FType!==1||port.FSubType!==1
  ||manager.FShowDataLastCall?.Node!==node||manager.FShowDataLastCall?.Port!==port)return fail('preview_binding');
 // Persisted ports may omit FPortIndex. For multiple outputs, bind every
 // tabular port to its own graph shape before assigning the public port index.
 if(!Array.isArray(node.FPorts)||node.FPorts.length>16||node.FPorts.some(g=>!Array.isArray(g.FCollection)||g.FCollection.length>100))return fail('preview_port_inventory');
 const outputs=node.FPorts.flatMap(g=>g.FCollection).filter(p=>p.FType===1&&p.FSubType===1);
 if(!outputs.length||outputs.filter(p=>p===port).length!==1||new Set(outputs.map(p=>p.FGuid)).size!==outputs.length
  ||outputs.some(p=>p.parent!==node))return fail('preview_port_inventory');
 let portIndex=0;
 if(outputs.length===1){if(port.FPortIndex!==undefined&&port.FPortIndex!==0)return fail('preview_port_inventory');}
 else{
  const graph=model.FDiagram?.FmxGraph,nodeRoot=graph?.view?.getState(node.FCell)?.shape?.node,nodeTid=nodeRoot?.getAttribute('data-tid');
  // Cached inactive graphs retain the same data-tid values. The prepared
  // native graph owns this preview; only duplicates inside it are ambiguous.
  if(!nodeTid?.startsWith(prefix+';Graph;')||exact(nodeTid).filter(e=>graph.container.contains(e)).length!==1||!graph.container.contains(nodeRoot))return fail('preview_port_graph');
  const indexed=[];
  for(const p of outputs){
   const root=graph.view.getState(p.FCell)?.shape?.node,tid=root?.getAttribute('data-tid'),base=nodeTid+';Output_Data-';
   if(!tid?.startsWith(base)||!/^\d{1,2}$/.test(tid.slice(base.length))||exact(tid).filter(e=>graph.container.contains(e)).length!==1||!graph.container.contains(root))return fail('preview_port_graph');
   const index=Number(tid.slice(base.length));
   if(p.FPortIndex!==undefined&&p.FPortIndex!==index)return fail('preview_port_graph');
   indexed.push({port:p,index});
  }
  if(new Set(indexed.map(p=>p.index)).size!==indexed.length)return fail('preview_port_graph');
  indexed.sort((a,b)=>a.index-b.index);portIndex=indexed.findIndex(p=>p.port===port);
 }
 const caches=form.FFormCache;if(!caches||Object.keys(caches).length>16)return fail('preview_cache_bound');
 const candidates=Object.values(caches).filter(f=>f.FView?.el?.dom?.checkVisibility({checkVisibilityCSS:true}));
 if(candidates.length!==1)return fail('preview_visible_form');
 const data=candidates[0],root=data.FView.el.dom,tid=rootTid+';PreviewForm;DataSetForm';
 if(root.getAttribute('data-tid')!==tid||exact(tid).filter(e=>roots[0].contains(e)&&e.checkVisibility({checkVisibilityCSS:true})).length!==1||!roots[0].contains(root)||data.FModelNode!==node.data)return fail('preview_dataset_binding');
 const store=data.FColumnInfosStore,collection=store?.getData?.(),records=collection?.items,source=collection?.getSource?.()?.items;
 if(store?.$className!=='Ext.data.Store'||store.isLoading?.()||store.isBufferedStore||!Array.isArray(records)||records.length>1000
  ||store.getCount?.()!==records.length||source&&(source.length!==records.length||new Set(source).size!==records.length||source.some(r=>!records.includes(r))))return fail('preview_schema_inventory');
 const header=exact(tid+';normalHeaderCt').filter(e=>root.contains(e)),native=header.length===1&&globalThis.Ext?.getCmp?.(header[0].id),columns=native?.items?.items;
 if(!native||native.el?.dom!==header[0]||!root.contains(header[0])||!Array.isArray(columns)||columns.length!==records.length)return fail('preview_headers');
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},fields=[],names=new Set(),ids=new Set();
 for(const [i,r] of records.entries()){const d=r?.data,c=columns[i],el=c?.el?.dom,id=String(r?.internalId??'');
  if(!r?.isModel||!id||ids.has(id)||typeof d?.Name!=='string'||!d.Name||d.Name.length>128||names.has(d.Name.toLowerCase())
   ||typeof d.DisplayName!=='string'||d.DisplayName.length>256||!types[d.DataType]||c.dataIndex!==d.Name||c.text!==d.DisplayName
   ||!el||el.getAttribute('data-tid')!==tid+';normalHeaderCt;'+d.Name||!header[0].contains(el))return fail('preview_field');
  ids.add(id);names.add(d.Name.toLowerCase());fields.push({index:i,record_id:id,name:d.Name,label:d.DisplayName,type:types[d.DataType]});
 }
 return {verified:true,inventory_complete:true,fields,root_tid:rootTid,port:portIndex,port_guid:port.FGuid,node_id:node.FGuid,state_source:'cached_preview_column_infos',settings_changed:false};
}
