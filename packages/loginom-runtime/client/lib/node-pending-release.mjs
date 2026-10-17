import {closePreparedWizard} from './node-wizard-close.mjs';
import {returnFromNodeViews} from './node-output-procedure.mjs';

const requireValue=(value,message)=>{if(!value)throw new Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const retry=' Then call dock_operation_recover with abandon_operation and a NEW recovery_operation_id.';
const sameNode=(context,node)=>context?.verified===true&&['document_id','workflow_id','node_id'].every(k=>context[k]===node?.[k]);
// Release is a bounded cleanup of its own, not a continuation of the stopped
// phase. It never extends that phase or repeats any of its gestures.
export const NODE_RELEASE_BUDGET_MS=90000;

export class NodeReleaseBlocked extends Error {
 constructor(message,userAction) {super(message);this.userAction=userAction;}
}

// Proves that a stopped node operation no longer holds the workspace: the last
// browser call settled with confirmed cleanup, only this operation's own draft
// or output Table view was cleaned up, and the same unlocked node rests on an
// unchanged, quiet graph. The proof says nothing about the node's settings or
// execution; the caller reports those as unknown unless already verified.
export async function releasePendingNode({operation,channel,readReceipt,restoreRead}) {
 const state=operation.nodeApply,node=state?.node;
 requireValue(state?.pending&&node&&!state.result,'Release requires an unresolved phase of a known node');
 requireValue(!operation.transportUncertain,'The last browser call has not confirmed completion; inspect the operation again later');
 if(operation.lastReceipt){
  const response=await readReceipt(operation.lastReceipt);
  requireValue(response?.state==='completed'&&response.receipt?.cleanup_complete===true,
   'The last browser gesture of this operation has no confirmed cleanup');
 }
 const cleanup={wizard_closed:false,read_view_restored:false,views_returned:false};
 if(restoreRead)cleanup.read_view_restored=await restoreRead();
 // A heavy wizard can exceed the observation budget; only the user can then
 // cancel it. Its unsaved settings are lost, which the agent must say first.
 const current=await channel.observe({condition:'stopped node release surface',
  ready:s=>['absent','observed'].includes(s.wizard?.status)}).catch(error=>{
   throw new NodeReleaseBlocked('The Loginom workspace could not be observed for release: '+String(error.message).slice(0,300),
    'Warn the user that unsaved settings of the open wizard will be lost, ask them to close any open Loginom wizard or dialog with its Cancel button and return to this scenario graph.'+retry);});
 if(current.wizard.status==='observed'){
  if(current.prepared_node_context?.surface!=='wizard'||!sameNode(current.prepared_node_context,node))
   throw new NodeReleaseBlocked('A Loginom wizard of another node is open',
    'Ask the user to close the open Loginom wizard of another node with its Cancel button and return to this scenario graph.'+retry);
  // A wizard draft is committed only by Done/Execute. Closing this node's own
  // draft discards uncommitted settings; earlier committed settings remain.
  await closePreparedWizard(channel);
  cleanup.wizard_closed=true;
 }
 // A read stopped before its Table became active leaves this node's
 // visualizers open; return through the observed scenario control only.
 if(current.wizard.status==='absent'&&current.prepared_node_context?.surface==='views'&&sameNode(current.prepared_node_context,node))
  cleanup.views_returned=(await returnFromNodeViews(channel,node)).returned;
 const quiet=s=>s.wizard?.status==='absent'&&s.prepared_node_context?.surface==='graph'
  &&sameNode(s.prepared_node_context,node)&&s.prepared_node_context.locked===false
  &&s.ui?.dialogs?.length===0&&s.ui?.masks?.length===0;
 let first;
 try{first=await channel.observe({condition:'released node rests on its unlocked graph',ready:quiet});}
 catch(error){
  throw new NodeReleaseBlocked('The node is not on a quiet unlocked graph: '+String(error.message).slice(0,300),
   'Warn the user that unsaved settings of an open wizard will be lost, ask them to close any open Loginom dialog or wizard with its Cancel button and return to this scenario graph without saving.'+retry);
 }
 const graph=await readReleaseGraph(operation,node);
 const second=await channel.observe({condition:'released node graph remains quiet',ready:quiet});
 requireValue(same(graph,await readReleaseGraph(operation,node))&&same(first.prepared_node_context,second.prepared_node_context),
  'The graph changed during release; inspect the operation again');
 requireValue(graph.nodes.filter(n=>same(n.ref,node)).length===1,'The released node is absent from its graph');
 return {verified:true,cleanup_complete:true,effect_possible:cleanup.wizard_closed||cleanup.read_view_restored||cleanup.views_returned,
  node_context:second.prepared_node_context,graph,cleanup};
}

// Every launch-class gesture prepared in a stopped finish must have a settled
// receipt refused before any precondition or gesture. Selection clicks may have
// succeeded: they are re-observed on resume and commit nothing.
export async function proveFinishLaunchRefused({steps,readReceipt}) {
 const receipts=[];
 for(const step of steps){
  const response=await readReceipt({id:step.internal_operation_id,signature:step.signature,action_key:'ui.act',operation_id:step.internal_operation_id});
  const r=response?.receipt;
  requireValue(response?.state==='completed'&&r?.cleanup_complete===true,'A finish gesture has no settled receipt');
  const refused=r.status==='NOT_APPLIED'&&r.effect_possible===false&&Array.isArray(r.trace)
   &&!r.trace.some(e=>['ui_preconditions_verified','ui_gesture_applied'].includes(e.event));
  requireValue(refused||!['execute_graph_node','deactivate_graph_node','finish_wizard','execute_wizard'].includes(step.verb),
   'A finish launch or deactivation may have taken effect; release the operation instead');
  receipts.push({step:step.step,verb:step.verb,status:r.status,refused_before_gesture:refused});
 }
 return {verified:true,launch_effect:false,receipts};
}

async function readReleaseGraph(operation,node) {
 const request=operation.nodeApply.request;
 const g=await operation.nodeTargetAdapter.observe({document_id:request.document_id,workflow_ref:request.workflow_ref},operation.deadline);
 requireValue(g?.complete===true&&g.document_id===node.document_id&&g.workflow_ref?.workflow_id===node.workflow_id,
  'A complete graph of the released node is required');
 return {nodes:g.nodes.map(({ref,type,label,position,inputs,outputs})=>({ref,type,label,position,inputs,outputs})),
  links:g.links,foreign_links:g.foreign_links};
}
