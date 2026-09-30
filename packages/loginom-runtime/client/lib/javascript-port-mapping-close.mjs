import {closePreparedWizard} from './node-wizard-close.mjs';

// Narrow reconciliation of an already dispatched close confirmation. The shared
// procedure keeps its refusal; only fresh read-only graph proof may complete it.
export function javascriptMappingUnlockReceipt(receipt,reference) {
  if(receipt?.status!=='AMBIGUOUS'||receipt.action_key!=='ui.act'||receipt.effect_possible!==true
    ||receipt.error?.code!=='PREPARED_NODE_CONTEXT_CHANGED'||!Array.isArray(receipt.trace)||receipt.trace.length>32)return false;
  const gestures=receipt.trace.filter(e=>e.event==='ui_gesture_applied'),mismatches=receipt.trace.filter(e=>e.event==='prepared_node_surface_mismatch');
  if(gestures.length!==1||gestures[0].verb!=='confirm_wizard_close'||mismatches.length!==1
    ||!receipt.trace.some(e=>e.event==='ui_preconditions_verified'&&e.verb==='confirm_wizard_close'))return false;
  if(receipt.trace.indexOf(mismatches[0])<=receipt.trace.indexOf(gestures[0]))return false;
  const {before,after}=mismatches[0];
  if(!before||!after||before.verified!==true||after.verified!==true||before.surface!=='graph'||after.surface!=='graph'
    ||before.locked!==true||after.locked!==false||typeof before.tid!=='string'||before.tid!==after.tid
    ||!['document_id','workflow_id','node_id'].every(k=>before[k]===reference[k]&&after[k]===reference[k]))return false;
  const canonical=value=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)));
  return canonical({...before,locked:false})===canonical(after)&&canonical(receipt.output?.prepared_node_context??{})===canonical(after);
}

export async function closeJavascriptPortMapping({reader,direction,reference,record,deadline,verifyGraph,allowOwnedUnlock=false}) {
  let closed;
  try {closed=await closePreparedWizard(reader);}
  catch(error){
    if(!(direction==='input'||direction==='output'&&allowOwnedUnlock===true)
      ||error.name!=='NodeProcedureStepError'||!javascriptMappingUnlockReceipt(error.receipt,reference))throw error;
    await record({phase:'port_mapping_close_unlock_receipt',direction,operation_id:error.receipt.operation_id,
      original_status:error.receipt.status,reference,transition:'same_graph_locked_true_to_false'});
    const remaining=deadline-Date.now();if(remaining<=0)throw error;
    const state=await reader.observe({condition:'same original mapping node unlocked after dispatched confirmation',timeoutMs:Math.min(15000,remaining),
      ready:s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'&&s.prepared_node_context.locked===false
        &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===reference[k])
        &&s.prepared_node_context.tid===error.receipt.output.prepared_node_context.tid
        &&s.wizard?.status==='absent'&&s.ui?.dialogs?.length===0&&s.ui?.masks?.length===0,
      confirmIdentity:s=>s.prepared_node_context});
    if(Date.now()>=deadline)throw error;
    closed={verified:true,cleanup_complete:true,mode:'close',settings_applied:false,execution_started:false,
      reconciled_from:error.receipt.operation_id,original_status:error.receipt.status,node_context:state.prepared_node_context};
  }
  if(Date.now()>=deadline)throw Error('Port mapping close original deadline expired');
  await verifyGraph();
  if(Date.now()>=deadline)throw Error('Port mapping graph proof exceeded original deadline');
  await record({phase:'port_mapping_close_verified',direction,closed,native_graph_unchanged:true});return closed;
}
