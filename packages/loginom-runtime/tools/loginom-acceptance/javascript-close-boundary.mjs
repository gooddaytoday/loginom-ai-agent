import {setTimeout} from 'node:timers/promises';
import {requireJavascriptGraphUnchanged} from './javascript-link-topology.mjs';

// Read-only settlement after an owned Close. Only the target's transient lock
// may differ while waiting; the final observation must satisfy the strict graph.
export async function settleJavascriptCloseBoundary({before,node,deadline,observe,record}) {
  const until=Math.min(deadline,Date.now()+15000);
  const baseline=structuredClone(before);
  const target=baseline.nodes?.find(n=>n.ref.node_id===node.node_id);
  if(!Number.isSafeInteger(deadline)||until<=Date.now()||!target||target.locked!==false
    ||!['document_id','workflow_id','node_id'].every(k=>target.ref[k]===node[k]))
    throw Error('Close settlement requires an unlocked original owned node and deadline');
  requireJavascriptGraphUnchanged(baseline,baseline);
  for(let sample=1;sample<=151;sample++){
    if(Date.now()>=until)throw Error('Close settlement original deadline expired');
    const after=await observe();
    if(Date.now()>=until)throw Error('Close settlement observation exceeded original deadline');
    const current=after.nodes?.find(n=>n.ref.node_id===node.node_id);
    await record({phase:'javascript_close_boundary_observed',sample,deadline:until,node:structuredClone(node),after:structuredClone(after)});
    if(Date.now()>=until)throw Error('Close settlement journal exceeded original deadline');
    if(!current||typeof current.locked!=='boolean')throw Error('Close settlement node unavailable');
    // This normalization is only a waiting predicate. It never admits a locked
    // graph as settled, and no other node or graph property is normalized.
    requireJavascriptGraphUnchanged(baseline,{...after,nodes:after.nodes.map(n=>n===current?{...n,locked:false}:n)});
    if(current.locked===false){
      requireJavascriptGraphUnchanged(baseline,after);
      await record({phase:'javascript_close_boundary_settled',sample,deadline:until,node:structuredClone(node)});
      if(Date.now()>=until)throw Error('Close settlement acknowledgement exceeded original deadline');
      return;
    }
    await setTimeout(Math.min(100,Math.max(1,until-Date.now())));
  }
  throw Error('Close settlement observation bound exceeded');
}
