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
 let settleWizard,beforeSettlement;
 if(operation.lastReceipt){
  const response=await readReceipt(operation.lastReceipt);
  requireValue(response?.state==='completed'&&response.receipt?.cleanup_complete===true,
   'The last browser gesture of this operation has no confirmed cleanup');
  if(operation.lastReceipt.operation_id)requireValue(response.receipt.operation_id===operation.lastReceipt.operation_id,
   'The last wizard receipt identity changed');
  const r=response.receipt,n=r.output?.prepared_node_context,w=r.output?.wizard;
  const gestures=r.trace?.filter(e=>e.event==='ui_gesture_applied')??[];
  const graphReturn=n?.surface==='graph'&&w?.status==='absent'
    &&['confirm_wizard_close','finish_wizard','execute_wizard'].includes(gestures[0]?.verb);
  if(r.action_key==='ui.act'&&typeof operation.lastReceipt.operation_id==='string'&&r.operation_id===operation.lastReceipt.operation_id
    &&r.status==='AMBIGUOUS'&&r.effect_possible===true&&n?.verified===true&&sameNode(n,node)
    &&(n.surface==='wizard'&&w?.status==='observed'&&w.root_ref||graphReturn)
    &&Number.isFinite(state.deadline)&&Number.isFinite(state.pending.deadline)
    &&Math.min(operation.deadline,state.deadline,state.pending.deadline)>Date.now()
    &&['WIZARD_OPEN_NOT_CONFIRMED','WIZARD_STEP_NOT_CONFIRMED','WIZARD_CANCEL_NOT_CONFIRMED','WIZARD_FINISH_NOT_CONFIRMED','WIZARD_FIELD_NOT_CONFIRMED'].includes(r.error?.code)
    &&gestures.length===1
    &&['open_wizard','begin_wizard','confirm_wizard_deactivation','wizard_step','finish_wizard','execute_wizard','confirm_wizard_close','set_wizard_field'].includes(gestures[0].verb)) {
   settleWizard={root_ref:w.root_ref,graph_only:graphReturn,node:n,deadline:Math.min(operation.deadline,state.deadline,state.pending.deadline)};
   beforeSettlement=await readReleaseGraph(operation,node);
  }
 }
 const cleanup={wizard_closed:false,read_view_restored:false,views_returned:false};
 if(restoreRead)cleanup.read_view_restored=await restoreRead();
 // A heavy wizard can exceed the observation budget; only the user can then
 // cancel it. Its unsaved settings are lost, which the agent must say first.
 const current=await channel.observe({condition:'stopped node release surface',releaseWizard:true,...(settleWizard?{settleWizard}:{}),
  ready:s=>['absent','observed'].includes(s.wizard?.status)}).catch(error=>{
   throw new NodeReleaseBlocked('The Loginom workspace could not be observed for release: '+String(error.message).slice(0,300),
    'Warn the user that unsaved settings of the open wizard will be lost, ask them to close any open Loginom wizard or dialog with its Cancel button and return to this scenario graph.'+retry);});
 if(settleWizard)requireValue(same(beforeSettlement,await readReleaseGraph(operation,node)),
  'The graph changed while the original wizard gesture settled; no cleanup was authorized');
 if(current.wizard.status==='observed'){
  if(current.prepared_node_context?.surface!=='wizard'||!sameNode(current.prepared_node_context,node))
   throw new NodeReleaseBlocked('A Loginom wizard of another node is open',
    'Ask the user to close the open Loginom wizard of another node with its Cancel button and return to this scenario graph.'+retry);
  // A wizard draft is committed only by Done/Execute. Closing this node's own
  // draft discards uncommitted settings; earlier committed settings remain.
  await closePreparedWizard(channel,{initialObservation:current});
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
