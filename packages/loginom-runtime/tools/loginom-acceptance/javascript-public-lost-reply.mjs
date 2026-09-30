import {dispatchNodeApi} from '../../client/lib/node-api.mjs';
import {stopJavascriptPublicExecution} from './javascript-public-stop.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Operator-only fault: drop the caller's apply reply after the retained backend
// has launched and identified its execution. Browser gesture receipts stay real.
export async function runJavascriptPublicLostApplyReply({runtime,request,node,record,onProgress,deadline,now=Date.now}) {
  const acknowledge=async event=>{
    const saved=await record(structuredClone(event));
    need(Object.keys(event).every(key=>same(saved?.[key],event[key])),'Public lost reply ACK differs');return saved;
  };
  need(now()<deadline,'Original public lost reply deadline expired');
  await acknowledge({phase:'javascript_public_reply_loss_prepared',operation_id:request.operation_id,node,
    boundary:'public_apply_reply_after_identified_execute',browser_receipt_dropped:false,deadline});
  const lost=new Error('Controlled public apply reply loss');let execution_id;
  const receiveApply=async()=>{
    let job=await dispatchNodeApi(runtime,'dock_node_apply',request);
    while(job.state==='running'){
      need(job.operation_id===request.operation_id&&now()<deadline,'Lost reply worker/original deadline differs');
      if(job.progress?.pending_phase==='materialization_execute'&&job.progress.execution?.status==='pending'){
        need(same(job.progress.node,node)&&job.progress.execution.execution_id.startsWith(node.document_id+':')
          &&job.attempt===1&&job.cancel_requested===false&&job.server_stop_requested===false,'Lost reply execution owner differs');
        execution_id=job.progress.execution.execution_id;
        await acknowledge({phase:'javascript_public_apply_reply_dropped',operation_id:request.operation_id,node,
          execution_id,deadline,backend_retained:true,browser_receipt_dropped:false});
        throw lost;
      }
      job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id:request.operation_id,timeout_ms:1000});await onProgress(job);
    }
    throw Error('Assigned execution settled before controlled public reply loss');
  };
  try{await receiveApply();}catch(error){if(error!==lost)throw error;}
  // Inspect/status can be repeated; apply and execution cannot. No new browser
  // context, backend worker, request parameters, source or deadline is admitted.
  const inspection=await runtime.inspect({operationId:request.operation_id});
  need(inspection.operation_id===request.operation_id&&inspection.output?.operation_id===request.operation_id,
    'Lost reply inspection belongs to another operation');
  const recovered_job=await dispatchNodeApi(runtime,'dock_node_status',{operation_id:request.operation_id});
  need(recovered_job.operation_id===request.operation_id&&recovered_job.state==='running'&&recovered_job.attempt===1
    &&recovered_job.cancel_requested===false&&recovered_job.server_stop_requested===false
    &&same(recovered_job.progress.node,node)&&recovered_job.progress.execution?.execution_id===execution_id
    &&recovered_job.progress.execution.status==='pending'&&recovered_job.progress.pending_phase==='materialization_execute',
  'Lost reply status changed the original identified execution');
  await acknowledge({phase:'javascript_public_lost_reply_inspected',operation_id:request.operation_id,node,
    execution_id,deadline,inspection,recovered_job});
  const job=await stopJavascriptPublicExecution({runtime,request,node,record,onProgress,deadline,initialJob:recovered_job,now});
  need(job.attempt===1&&job.outcome.output.execution.execution_id===execution_id,'Lost reply terminal changed the original execution');
  return {job,inspection,recovered_job,execution_id,boundary:'public_apply_reply_after_identified_execute',browser_receipt_dropped:false};
}
