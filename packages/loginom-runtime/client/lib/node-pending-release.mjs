import {closePreparedWizard} from './node-wizard-close.mjs';
import {returnFromNodeViews} from './node-output-procedure.mjs';
import {boundWizardDeactivationConfirmation} from './node-wizard-open.mjs';

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
// browser call settled, only this operation's own draft
// or output Table view was cleaned up, and the same unlocked node rests on an
// unchanged, quiet graph. The proof says nothing about the node's settings or
// execution; the caller reports those as unknown unless already verified.
export async function releasePendingNode({operation,channel,readReceipt,restoreRead,
 deadline=operation.deadline,now=channel.now??Date.now}) {
 const state=operation.nodeApply,node=state?.node;
 requireValue(state?.pending&&node&&!state.result,'Release requires an unresolved phase of a known node');
 requireValue(Number.isFinite(deadline),'Release requires an explicit finite deadline');
 requireValue(!operation.transportUncertain,'The last browser call has not confirmed completion; inspect the operation again later');
 let settleWizard,beforeSettlement,openingConfirmation,draftReceipt=false;
 if(operation.portReadCleanupComplete!==undefined)requireValue(operation.portReadCleanupComplete===true,
  'The last output-port read has no confirmed settled cleanup');
 if(operation.lastReceipt){
  const response=await readReceipt(operation.lastReceipt);
  const r=response?.receipt;
  // REST configure never commits Done/Execute. Its completed failure receipt
  // can truthfully retain cleanup=false because the draft is still open.
  // Permit only the existing owned-wizard cancellation and quiet-graph proof;
  // this does not replay configure or accept unknown transport completion.
  const restDraft=state.pending.phase==='configure'&&state.request.target?.type==='integration.rest_request'
   &&typeof operation.lastReceipt.operation_id==='string'&&r?.operation_id===operation.lastReceipt.operation_id
   &&operation.lastReceipt.action_key==='node.rest.configure.internal'&&r.action_key===operation.lastReceipt.action_key
   &&r.phase==='configure'&&r.status==='AMBIGUOUS'&&r.effect_possible===true&&r.cleanup_complete===false
   &&r.output?.verified===false&&r.output.cleanup_complete===false&&r.error?.code==='REST_STEP_UNCONFIRMED';
  const gestures=r?.trace?.filter(e=>e.event==='ui_gesture_applied')??[];
  const exportDraft=state.pending.phase==='configure'&&state.request.target?.type==='exports.text'
   &&operation.lastReceipt.action_key==='node.export.next'&&r?.action_key==='node.export.next'
   &&r.phase==='export_next'&&r.status==='AMBIGUOUS'&&r.effect_possible===true&&r.cleanup_complete===false
   &&['EXPORT_NEXT_UNCONFIRMED','EXPORT_NEXT_UNSETTLED'].includes(r.error?.code);
  const wizardDraft=state.pending.phase==='configure'&&operation.lastReceipt.action_key==='ui.act'&&r?.action_key==='ui.act'
   &&r.status==='AMBIGUOUS'&&r.effect_possible===true&&r.cleanup_complete===false
   &&sameNode(r.output?.prepared_node_context,node)&&r.output.prepared_node_context.surface==='wizard'
   &&r.output.wizard?.status==='observed'&&r.output.wizard.root_ref&&gestures.length===1
   &&['wizard_step','set_wizard_field'].includes(gestures[0].verb)
   &&['WIZARD_STEP_NOT_CONFIRMED','WIZARD_FIELD_NOT_CONFIRMED'].includes(r.error?.code);
  const draft=restDraft||exportDraft||wizardDraft;
  draftReceipt=draft;
  requireValue(response?.state==='completed'&&(r?.cleanup_complete===true||draft),
   'The last browser gesture of this operation has no confirmed cleanup');
  if(operation.lastReceipt.operation_id)requireValue(response.receipt.operation_id===operation.lastReceipt.operation_id,
   'The last wizard receipt identity changed');
  const n=r.output?.prepared_node_context,w=r.output?.wizard;
  if(state.pending.phase==='open'&&state.request.target?.type==='imports.text'
   &&r.action_key==='ui.act'&&operation.lastReceipt.action_key==='ui.act'
   &&typeof operation.lastReceipt.operation_id==='string'&&r.operation_id===operation.lastReceipt.operation_id
   &&r.operation_id===operation.lastReceipt.id&&r.operation_id.startsWith(operation.id+':n')
   &&r.status==='AMBIGUOUS'&&r.effect_possible===true&&r.cleanup_complete===true
   &&r.error?.code==='WIZARD_CONTEXT_CHANGED'&&gestures.length===1&&gestures[0].verb==='begin_wizard'
   &&r.trace.filter(e=>e.event==='ui_preconditions_verified'&&e.verb==='begin_wizard').length===1
   &&sameNode(n,node)&&n.surface==='graph'&&n.locked===false&&typeof n.tid==='string'
   &&typeof n.pending_wizard_node?.tid==='string'&&n.pending_wizard_node.label
   &&r.output.authenticated===true&&r.output.workflow_navigation?.status==='observed'
   &&r.output.workflow_navigation.path?.length>0
   &&same(r.output.workflow_navigation.path,state.request.workflow_ref.navigation_path)
   &&same(r.output.workflow_navigation.current_path,[...r.output.workflow_navigation.path,n.pending_wizard_node])
   &&n.pending_wizard_node.tid.startsWith(r.output.workflow_navigation.path.at(-1).tid+'>')
   &&typeof r.output.dom_epoch?.document==='string'&&typeof r.output.active_tab_ref==='string'
   &&r.output.ui?.dialogs?.length===1){
   const s=r.output;
   const binding={kind:'deactivation',release_opening:{node:n,workflow_ref:s.workflow_ref,document:s.dom_epoch.document,
    origin:s.origin,build:s.loginom_build,active_tab_ref:s.active_tab_ref,package_identity:s.package_identity,
    navigation:s.workflow_navigation,dialog:s.ui.dialogs[0]}};
   if(boundWizardDeactivationConfirmation(s,binding)){
    openingConfirmation=structuredClone(binding);
   }
  }
  if(draft){
   requireValue(typeof operation.lastReceipt.operation_id==='string'&&r.operation_id===operation.lastReceipt.operation_id,
    'The completed draft receipt identity changed');
  }
  const graphReturn=n?.surface==='graph'&&w?.status==='absent'
    &&['confirm_wizard_close','finish_wizard','execute_wizard'].includes(gestures[0]?.verb);
  if(!draft&&r.action_key==='ui.act'&&typeof operation.lastReceipt.operation_id==='string'&&r.operation_id===operation.lastReceipt.operation_id
    &&r.status==='AMBIGUOUS'&&r.effect_possible===true&&n?.verified===true&&sameNode(n,node)
    &&(n.surface==='wizard'&&w?.status==='observed'&&w.root_ref||graphReturn)
    &&Number.isFinite(state.deadline)&&Number.isFinite(state.pending.deadline)
    &&['WIZARD_OPEN_NOT_CONFIRMED','WIZARD_STEP_NOT_CONFIRMED','WIZARD_CANCEL_NOT_CONFIRMED','WIZARD_FINISH_NOT_CONFIRMED','WIZARD_FIELD_NOT_CONFIRMED'].includes(r.error?.code)
    &&gestures.length===1
    &&['open_wizard','begin_wizard','confirm_wizard_deactivation','wizard_step','finish_wizard','execute_wizard','confirm_wizard_close','set_wizard_field'].includes(gestures[0].verb)) {
   settleWizard={root_ref:w.root_ref,graph_only:graphReturn,node:n,deadline:Math.min(deadline,state.deadline,state.pending.deadline)};
   beforeSettlement=await readReleaseGraph(operation,node,settleWizard.deadline,now);
  }
  // A settled browser call can return to its graph before Preview's own
  // loading mask disappears. The existing observer admits only that node's
  // native graph-loading owner, never a dialog or a foreign mask.
  if(!settleWizard&&sameNode(n,node)&&n.surface==='graph'&&w?.status==='absent')
   settleWizard={graph_only:true,node:n,deadline};
  if(wizardDraft)settleWizard={root_ref:w.root_ref,node:n,deadline};
 }
 const cleanup={wizard_closed:false,read_view_restored:false,views_returned:false};
 if(restoreRead)cleanup.read_view_restored=await restoreRead();
 // A heavy wizard can exceed the observation budget; only the user can then
 // cancel it. Its unsaved settings are lost, which the agent must say first.
 const current=await channel.observe({condition:'stopped node release surface',releaseWizard:true,
  ...(openingConfirmation?{wizardConfirmation:openingConfirmation}:{}),...(settleWizard?{settleWizard}:{}),
  ready:s=>['absent','observed'].includes(s.wizard?.status)}).catch(error=>{
   throw new NodeReleaseBlocked('The Loginom workspace could not be observed for release: '+String(error.message).slice(0,300),
    'Warn the user that unsaved settings of the open wizard will be lost, ask them to close any open Loginom wizard or dialog with its Cancel button and return to this scenario graph.'+retry);});
 if(beforeSettlement)requireValue(same(beforeSettlement,await readReleaseGraph(operation,node,settleWizard.deadline,now)),
  'The graph changed while the original wizard gesture settled; no cleanup was authorized');
 if(openingConfirmation){
  await channel.perform({condition:'cancel only the stopped opening deactivation question',initialObservation:current,
   ready:s=>boundWizardDeactivationConfirmation(s,openingConfirmation),identity:()=>openingConfirmation,
   resolve:s=>({verb:'click',ref:s.ui.elements.find(e=>e.tid==='msgbox;tlb;cancel').ref})});
 }
 if(draftReceipt)requireValue(current.ui?.dialogs?.length===0&&current.ui?.masks?.length===0,
  'The stopped draft has a blocking dialog or mask');
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
 const graph=await readReleaseGraph(operation,node,deadline,now);
 const second=await channel.observe({condition:'released node graph remains quiet',ready:quiet});
 requireValue(same(graph,await readReleaseGraph(operation,node,deadline,now))&&same(first.prepared_node_context,second.prepared_node_context),
  'The graph changed during release; inspect the operation again');
 requireValue(graph.nodes.filter(n=>same(n.ref,node)).length===1,'The released node is absent from its graph');
 return {verified:true,cleanup_complete:true,effect_possible:!!openingConfirmation||cleanup.wizard_closed||cleanup.read_view_restored||cleanup.views_returned,
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

async function readReleaseGraph(operation,node,deadline,now) {
 const request=operation.nodeApply.request;
 requireValue(now()<deadline,'Original release graph deadline elapsed');
 const g=await operation.nodeTargetAdapter.observe({document_id:request.document_id,workflow_ref:request.workflow_ref},deadline);
 requireValue(now()<deadline,'Original release graph deadline elapsed');
 requireValue(g?.complete===true&&g.document_id===node.document_id&&g.workflow_ref?.workflow_id===node.workflow_id,
  'A complete graph of the released node is required');
 return {nodes:g.nodes.map(({ref,type,label,position,inputs,outputs})=>({ref,type,label,position,inputs,outputs})),
  links:g.links,foreign_links:g.foreign_links};
}
