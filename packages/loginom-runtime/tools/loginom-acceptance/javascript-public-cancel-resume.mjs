import {dispatchNodeApi} from '../../client/lib/node-api.mjs';
import {verifyExecutionReadWait} from '../../client/lib/node-execution-evidence.mjs';
import {stopJavascriptPublicExecution} from './javascript-public-stop.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// The journal callback runs inside an acknowledged native read sample. A host
// timer can race an ownership gesture and cannot establish a read-only pause.
export function createJavascriptPublicCancelResume({runtime,node,record,now=Date.now}) {
  let request,requested=false,waitDeadline,pause,native;
  const acknowledge=async event=>{
    const saved=await record(structuredClone(event));
    need(Object.keys(event).every(key=>same(saved?.[key],event[key])),'Public local cancel/resume ACK differs');
    return saved;
  };
  return {
    async observe(event) {
      if(!request||event.operation_id!==request.operation_id)return;
      if(event.phase==='node_phase_prepared'&&event.receipt.phase==='materialization_execute'){
        need(waitDeadline===undefined||event.receipt.deadline<=waitDeadline,'Read wait deadline was extended');
        waitDeadline??=event.receipt.deadline;
      }
      if(event.phase==='node_phase_paused'){
        need(!pause&&event.receipt.phase==='materialization_execute','Unexpected/repeated read wait pause');
        pause=structuredClone(event.receipt);return;
      }
      if(requested||event.phase!=='node_observation_sample'||event.readiness?.condition!=='new node execution completed'
        ||event.readiness.satisfied!==false)return;
      const job=await dispatchNodeApi(runtime,'dock_node_status',{operation_id:request.operation_id});
      need(job.state==='running'&&job.attempt===1&&job.cancel_requested===false&&job.server_stop_requested===false
        &&job.progress?.pending_phase==='materialization_execute'&&job.progress.execution?.status==='pending'
        &&same(job.progress.node,node)&&Number.isSafeInteger(waitDeadline)&&now()<waitDeadline,
      'Local cancellation requires the original identified read wait');
      const inventory=event.outcome?.output?.node_processes;
      const groups=inventory?.processes?.filter(p=>p.parent_id===null
        &&job.progress.execution.execution_id===node.document_id+':'+inventory.root_id+':'+p.process_id);
      need(groups?.length===1,'Local cancellation execution group differs');
      if(!inventory.processes.some(p=>p.parent_id===groups[0].process_id&&p.owner?.verified===true
        &&p.owner.node_id===node.node_id&&p.owner.source==='native_process_model_identity'))return;
      native=verifyExecutionReadWait({node,execution_id:job.progress.execution.execution_id,root_id:inventory.root_id,
        group_id:groups[0].process_id,group_record_id:groups[0].record_id},inventory);
      requested=true;
      await acknowledge({phase:'javascript_public_local_cancel_prepared',operation_id:request.operation_id,node,
        execution_id:native.execution_id,native_execution:native,deadline:waitDeadline,
        read_internal_operation_id:event.internal_operation_id,read_step:event.step});
      const cancelled=await dispatchNodeApi(runtime,'dock_node_cancel',{operation_id:request.operation_id});
      need(cancelled.operation_id===request.operation_id&&cancelled.cancel_requested===true
        &&cancelled.server_stop_requested===false,'Local cancellation returned another worker/stop');
      await acknowledge({phase:'javascript_public_local_cancel_requested',operation_id:request.operation_id,node,
        execution_id:native.execution_id,deadline:waitDeadline,job:cancelled});
    },
    async run({request:input,onProgress,deadline}) {
      need(!request&&now()<deadline,'Local cancel/resume probe already started or expired');request=structuredClone(input);
      let job=await dispatchNodeApi(runtime,'dock_node_apply',request);
      while(job.state==='running'){
        need(now()<deadline,'Original local cancel/resume deadline expired');
        job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id:request.operation_id,timeout_ms:1000});await onProgress(job);
      }
      need(requested&&pause&&pause.read_only===true&&pause.cleanup_complete===true&&pause.effect_possible===false
        &&pause.deadline===waitDeadline&&pause.execution_id===native.execution_id&&same(pause.native_execution,native)
        &&job.operation_id===request.operation_id&&job.attempt===1&&job.state==='settled'
        &&job.cancel_requested===true&&job.server_stop_requested===false&&job.outcome?.status==='AMBIGUOUS'
        &&job.outcome.cleanup_complete===true&&job.progress?.pending_phase===null
        &&job.progress.execution?.status==='pending'&&job.progress.execution.execution_id===native.execution_id,
      'Public local read cancellation did not settle an owned continuation checkpoint');
      const paused_job=job,retry_job=await dispatchNodeApi(runtime,'dock_node_apply',request);
      need(same(retry_job,paused_job),'Same-ID apply retry relaunched the cancelled read wait');
      // Same entrypoint as public dock_operation_inspect; no arbitrary browser read.
      const inspection=await runtime.inspect({operationId:request.operation_id});
      need(inspection.output?.cleanup_confirmed===true&&inspection.output.internal_resume_available===true,
        'Public inspection did not admit the original read wait');
      await acknowledge({phase:'javascript_public_local_cancel_checkpoint_verified',operation_id:request.operation_id,
        node,execution_id:native.execution_id,deadline:waitDeadline,paused_job,retry_job,inspection});
      need(now()<Math.min(deadline,waitDeadline),'Original execution deadline expired before resume');
      await acknowledge({phase:'javascript_public_same_id_resume_prepared',operation_id:request.operation_id,
        node,execution_id:native.execution_id,deadline:waitDeadline});
      const resume_job=await dispatchNodeApi(runtime,'dock_node_resume',{operation_id:request.operation_id});
      need(resume_job.operation_id===request.operation_id&&resume_job.state==='running'&&resume_job.attempt===2
        &&resume_job.cancel_requested===false&&resume_job.server_stop_requested===false
        &&resume_job.progress.execution.execution_id===native.execution_id,'Same-ID resume returned another execution');
      await acknowledge({phase:'javascript_public_same_id_resume_requested',operation_id:request.operation_id,
        node,execution_id:native.execution_id,deadline:waitDeadline,job:resume_job});
      job=await stopJavascriptPublicExecution({runtime,request,node,record,onProgress,
        deadline:Math.min(deadline,waitDeadline),initialJob:resume_job,now});
      need(job.attempt===2&&job.outcome.output.execution.execution_id===native.execution_id,'Resumed Stop settled another attempt/execution');
      return {job,paused_job,retry_job,inspection,resume_job,original_wait_deadline:waitDeadline,native_execution:native};
    },
  };
}
