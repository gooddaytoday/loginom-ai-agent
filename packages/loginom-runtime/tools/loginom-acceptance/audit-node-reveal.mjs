import {readGraph} from '../../client/lib/node-target-browser.mjs';
import {NODE_TYPES} from '../../client/lib/node-contracts.mjs';
import {nodePlacementViewport,nodePlacementPoint,revealNodePlacement,samePlacementGraph} from '../../client/lib/node-placement.mjs';

// Diagnostic navigation only: retain every node, position and link. A fresh
// read proves ownership before each native outline gesture.
export async function revealAuditNode(page,task,read,reveal,viewport,project,same) {
 const remaining=()=>{const ms=task.deadline-Date.now();if(ms<=0)throw Error('Audit reveal deadline exceeded');return ms;};
 const before=await read(page,task);
 const matches=before.nodes.filter(n=>n.ref.node_id===task.node_id);
 if(before.complete!==true||matches.length!==1)throw Error('Exact complete audit graph required');
 const node=matches[0],prefix=task.request.workflow_ref.prefix;
 const root=page.locator('[data-tid='+JSON.stringify(prefix+';ModelForm;cmpDiagram')+']');
 const guard=async()=>{remaining();if(!same(before,await read(page,task)))throw Error('Graph changed during audit navigation');};
 const result=await reveal({page,root,prefix,nodeId:task.node_id,position:node.position,remaining,guard,readViewport:viewport,project});
 await guard();
 if(result.fully_visible!==true)throw Error('Audit node remains outside viewport');
 return {...result,graph_unchanged:true,node_id:task.node_id};
}

export function makeAuditNodeRevealCode({prepared,node,origin,build,deadline}) {
 const task={request:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},node_id:node.node_id,types:NODE_TYPES,origin,build,deadline};
 return `async page=>(${revealAuditNode.toString()})(page,${JSON.stringify(task)},${readGraph.toString()},${revealNodePlacement.toString()},${nodePlacementViewport.toString()},${nodePlacementPoint.toString()},${samePlacementGraph.toString()})`;
}
