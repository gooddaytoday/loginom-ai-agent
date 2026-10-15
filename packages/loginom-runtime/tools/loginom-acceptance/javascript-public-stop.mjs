import {dispatchNodeApi} from '../../client/lib/node-api.mjs';

const need=(value,message)=>{if(!value)throw Error(message);};

export function verifyJavascriptPublicStopped(job,node) {
  const result=job?.outcome?.output;
  need(job?.state==='settled'&&job.server_stop_requested===true&&job.cancel_requested===false
    &&job.outcome.status==='FAILED'&&job.outcome.cleanup_complete===true&&job.outcome.effect_possible===true
    &&result?.status==='FAILED'&&result.cleanup_complete===true&&result.pending_phase==null
    &&JSON.stringify(result.node)===JSON.stringify(node)&&result.configuration?.status==='applied'
    &&result.execution?.status==='cancelled'&&result.execution.stop_verified===true
    &&typeof result.execution.execution_id==='string'&&result.execution.execution_id.startsWith(node.document_id+':')
    &&result.output?.status==='not_refreshed'&&result.output.ports?.length===0
    &&result.checkpoint_kind==='local_node_stopped'&&result.error?.code==='NODE_EXECUTION_CANCELLED'
    &&result.phases?.some(phase=>phase.phase==='materialization_execute'&&phase.status==='verified')
    &&result.phases.every(phase=>phase.status==='verified'),
  'Public native Stop terminal/cleanup boundary unconfirmed');
  return result;
}

// Only status/wait repeats. Unknown Stop reply or journal ACK never dispatches
// another Stop; the original public worker and its mutation gate remain owner.
export async function stopJavascriptPublicExecution({runtime,request,node,record,onProgress,deadline,initialJob,now=Date.now}) {
  need(Number.isSafeInteger(deadline)&&now()<deadline,'Public finite Stop original deadline expired');
  let job=initialJob??await dispatchNodeApi(runtime,'dock_node_apply',request),requested=false,execution_id;
  while(job.state==='running') {
    need(job.operation_id===request.operation_id,'Public Stop worker identity changed');
    need(now()<deadline,'Public finite Stop original deadline expired');
    if(!requested&&job.progress?.pending_phase==='materialization_execute'
      &&job.progress.execution?.status==='pending'&&typeof job.progress.execution.execution_id==='string') {
      need(JSON.stringify(job.progress.node)===JSON.stringify(node)
        &&job.progress.execution.execution_id.startsWith(node.document_id+':'),'Public Stop execution owner changed');
      const prepared={phase:'javascript_public_stop_prepared',operation_id:request.operation_id,node,
        execution_id:job.progress.execution.execution_id,deadline};
      const ack=await record(structuredClone(prepared));
      need(Object.keys(prepared).every(key=>JSON.stringify(ack?.[key])===JSON.stringify(prepared[key])),
        'Public Stop prepared ACK differs');
      requested=true;execution_id=prepared.execution_id;
      job=await dispatchNodeApi(runtime,'dock_node_stop',{operation_id:request.operation_id});
      need(job.operation_id===request.operation_id&&job.server_stop_requested===true
        &&job.cancel_requested===false,'Public Stop request identity differs');
      const returned={phase:'javascript_public_stop_requested',operation_id:request.operation_id,node,execution_id,deadline};
      const saved=await record(structuredClone(returned));
      need(Object.keys(returned).every(key=>JSON.stringify(saved?.[key])===JSON.stringify(returned[key])),
        'Public Stop requested ACK differs');
    }
    job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id:request.operation_id,timeout_ms:1000});
    await onProgress(job);
  }
  const result=verifyJavascriptPublicStopped(job,node);
  need(requested&&result.execution.execution_id===execution_id,'Public Stop settled another execution');
  return job;
}
