import {readGraph} from './node-target-browser.mjs';
import {NODE_TYPES} from './node-contracts.mjs';
import {revealNodePlacement,nodePlacementViewport,nodePlacementPoint,samePlacementGraph} from './node-placement.mjs';

// View navigation only: retain the prepared document and every graph setting.
export async function revealPreparedGraphNode(page,args,read,reveal,readViewport,project,sameGraph) {
 const need=(v,m)=>{if(!v)throw Error('Prepared node viewport: '+m);};
 const task={request:{document_id:args.binding.document_id,workflow_ref:args.binding.workflow_ref},
  types:args.types,origin:args.origin,build:args.build};
 const remaining=()=>{const n=args.deadline-Date.now();need(n>0,'deadline');return n;};
 remaining();const before=await read(page,task),ref=args.binding.node;
 need(before.complete===true&&before.interaction_ready===true,'complete idle graph');
 const nodes=before.nodes.filter(n=>n.ref.node_id===ref.node_id);
 need(nodes.length===1&&nodes[0].locked===false&&['document_id','workflow_id','node_id'].every(k=>nodes[0].ref[k]===ref[k]),'node owner');
 const position=nodes[0].position;
 need(['x','y'].every(k=>Number.isFinite(position?.[k])&&position[k]>=0&&position[k]<=10000),'bounded position');
 const root=page.locator('[data-tid='+JSON.stringify(args.binding.workflow_ref.prefix+';ModelForm;cmpDiagram')+']');
 need(await root.count()===1&&await root.isVisible(),'owned canvas');
 const guard=async()=>{remaining();need(sameGraph(before,await read(page,task)),'graph changed during navigation');};
 const navigation=await reveal({page,root,position,nodeId:ref.node_id,prefix:args.binding.workflow_ref.prefix,
  remaining,guard,readViewport,project});
 await guard();need(navigation.fully_visible===true,'node not revealed');
 return {status:'SUCCEEDED',verified:true,node:ref,graph_unchanged:true,settings_applied:false,
  fully_visible:true,cleanup_complete:true,effect_possible:navigation.zoom_steps>0,
  zoom_steps:navigation.zoom_steps,outline_closed:navigation.outline_closed};
}
export function makePreparedNodeRevealCode(binding,options) {
 return `async page=>(${revealPreparedGraphNode.toString()})(page,${JSON.stringify({binding,...options,types:NODE_TYPES})},${readGraph.toString()},${revealNodePlacement.toString()},${nodePlacementViewport.toString()},${nodePlacementPoint.toString()},${samePlacementGraph.toString()})`;
}
