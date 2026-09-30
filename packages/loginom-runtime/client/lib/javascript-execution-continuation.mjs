const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Only resume a proved read-only execution wait in the retained driver. A new
// runtime cannot restore unsaved editor state or infer an unknown browser effect.
export function javascriptExecutionWaitContext(state,{operation,owner,expected,configured,committed,inputMapping,outputMapping,now}) {
  const wait=state?.execution_wait,phase=wait?.phase;
  const order=['source','workflow','target','input_mapping','open','configure','node_finish','materialization_start',
    ...(phase==='execute'?['materialization_execute','output_mapping','finish']:[])];
  if(!state||state!==operation.nodeApply||operation.transportUncertain||operation.cleanupConfirmed!==true
    ||state.result||state.pending||state.cleanup_complete!==true||state.execution?.status!=='pending'
    ||!['materialization_execute','execute'].includes(phase)||wait.read_only!==true||wait.cleanup_complete!==true
    ||wait.effect_possible!==false||wait.receipt_id!==operation.id+':'+phase
    ||wait.execution_id!==state.execution.execution_id||!wait.native_execution||!same(wait.before_node,state.node)
    ||!same(state.request,operation.parameters)||!owner||!same(state.node,{document_id:owner.document_id,workflow_id:owner.workflow_id,node_id:owner.node_id})
    ||owner.operation_id!==operation.id||!Number.isSafeInteger(wait.deadline)||wait.deadline>state.deadline||now>=wait.deadline
    ||!same(state.phases?.map(p=>p.phase),order)||state.phases.some(p=>p.status!=='verified'
      ||p.receipt_id!==operation.id+':'+p.phase||p.value?.verified!==true||p.value.cleanup_complete!==true)
    ||committed?.owned_done_settled!==true||committed.graph_owner_verified!==true
    ||!expected||configured?.effective_source?.source_sha256!==expected.source_sha256
    ||typeof configured?.settings_sha256!=='string'||!inputMapping||phase==='execute'&&!outputMapping)return null;
  const finish=state.phases.find(p=>p.phase==='node_finish').value;
  if(finish.source_sha256!==expected.source_sha256||finish.source_utf8_bytes!==expected.source_utf8_bytes
    ||finish.source_lf_lines!==expected.source_lf_lines||finish.source_readback_verified!==true
    ||finish.wizard_commit_verified!==true||finish.owned_done_settled!==true||finish.settings_preserved!==true
    ||!same(state.phases.find(p=>p.phase==='input_mapping').value.native_mapping,inputMapping)
    ||state.phases.at(-1).value.execution_id!==state.execution.execution_id
    ||phase==='execute'&&!same(state.phases.find(p=>p.phase==='output_mapping').value.native_mapping,outputMapping))return null;
  return {operation_id:operation.id,document_id:state.request.document_id,workflow_ref:state.request.workflow_ref,
    node:state.node,execution:state.execution,deadline:wait.deadline};
}
