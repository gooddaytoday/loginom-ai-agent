// Reuse the client's bounded outline navigation. The oracle supplies only an
// independently observed source GUID; every UI gesture keeps the full graph.
export async function revealColdSource(page,args,readGraph,reveal,readViewport,project,sameGraph){
 const need=(v,m)=>{if(!v)throw Error('COLD_SOURCE_VIEWPORT:'+m);};
 const ref=args.node;
 need(ref?.document_id===args.request?.document_id
  &&ref.workflow_id===args.request.workflow_ref?.workflow_id&&typeof ref.node_id==='string','source owner');
 need(['imports.text','transform.collapse_columns','transform.cross_table'].includes(args.type),'source type');
 const task={request:args.request,types:args.types,origin:args.origin,build:args.build};
 const remaining=()=>{const n=args.deadline-Date.now();need(n>0,'deadline');return n;};
 remaining();
 const before=await readGraph(page,task);
 need(before.complete===true&&before.interaction_ready===true,'complete idle graph');
 const nodes=before.nodes.filter(n=>n.ref.node_id===ref.node_id);
 need(nodes.length===1&&['document_id','workflow_id','node_id'].every(k=>nodes[0].ref[k]===ref[k])
  &&nodes[0].type===args.type,'observed source identity');
 const position=nodes[0].position;
 need(['x','y'].every(k=>Number.isFinite(position?.[k])&&position[k]>=0&&position[k]<=10000),'bounded source position');
 const root=page.locator('[data-tid='+JSON.stringify(args.request.workflow_ref.prefix+';ModelForm;cmpDiagram')+']');
 need(await root.count()===1&&await root.isVisible(),'owned canvas');
 const guard=async()=>{remaining();need(sameGraph(before,await readGraph(page,task)),'graph changed during navigation');};
 const navigation=await reveal({page,root,position,nodeId:ref.node_id,prefix:args.request.workflow_ref.prefix,
  remaining,guard,readViewport,project});
 await guard();need(navigation.fully_visible===true,'source not revealed');
 return {status:'SUCCEEDED',verified:true,node:ref,graph_unchanged:true,settings_applied:false,
  fully_visible:true,zoom_steps:navigation.zoom_steps,outline_closed:navigation.outline_closed};
}
export function makeColdSourceRevealCode(args,helpers){
 return `async page=>(${revealColdSource.toString()})(page,${JSON.stringify(args)},${helpers.readGraph.toString()},${helpers.revealNodePlacement.toString()},${helpers.nodePlacementViewport.toString()},${helpers.nodePlacementPoint.toString()},${helpers.samePlacementGraph.toString()})`;
}
