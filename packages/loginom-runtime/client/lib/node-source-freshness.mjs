import {existingOutputExecution} from './node-execution-evidence.mjs';
import {makeNodeOutputContextCode} from './node-output-context.mjs';
import {makeNodeProcessContextCode} from './node-process-context.mjs';

function sameNode(a,b){
 return ['document_id','workflow_id','node_id'].every(key=>a?.[key]===b[key]);
}

export async function observeStepwiseSourceFreshness({request,operationId,history,observe,record}){
 const input=request.inputs[0];
 if(request.target.kind!=='new'||!['transform.group_data','transform.sorting','exports.excel'].includes(request.target.type)
  ||request.inputs.length!==1||request.finish==='close')return;
 const node=input.source;
 const own=history.filter(entry=>sameNode(entry.request?.target?.ref,node)||sameNode(entry.outcome?.output?.node,node));
 const latest=own.reduce((a,b)=>!a||a.sequence<b.sequence?b:a,null);
 const result=latest?.outcome?.output,executionId=result?.execution?.execution_id;
 const outputs=result?.output?.ports?.filter(port=>port.port===input.output);
 const output=outputs?.length===1?outputs[0]:null;
 let proof={status:'unverified',node,port:input.output,reason:'no_matching_completed_port_receipt'};
 if(latest?.cleanup_confirmed===true&&latest.outcome.status==='SUCCEEDED'&&latest.outcome.cleanup_complete===true
  &&latest.outcome.operation_id===latest.request.operation_id&&result?.operation_id===latest.request.operation_id
  &&result.status==='SUCCEEDED'&&result.cleanup_complete===true&&sameNode(result.node,node)
  &&result.execution?.status==='completed'&&typeof executionId==='string'&&result.output?.verified===true
  &&result.output.execution_id===executionId&&output?.fresh===true&&output.execution_id===executionId
  &&typeof output.port_guid==='string'&&output.port_guid.length){
  const binding={document_id:request.document_id,workflow_ref:request.workflow_ref,node};
  const {processes,ports}=await observe(binding);
  const port=ports?.ports?.filter(port=>port.index===input.output);
  let current;
  try{current=existingOutputExecution(processes,node);}catch{}
  if(current?.status==='completed'&&current.execution_id===executionId&&ports?.verified===true
   &&ports.node_context?.verified===true&&ports.node_context.surface==='graph'&&sameNode(ports.node_context,node)
   &&JSON.stringify(ports.node_context)===JSON.stringify(processes.node_context)
   &&port?.length===1&&port[0].port_guid===output.port_guid&&port[0].active===true){
   proof={status:'fresh',node,port:input.output,port_guid:output.port_guid,execution_id:executionId,
    source_operation_id:latest.request.operation_id,process_record_id:current.process_record_id,
    basis:'matching_completed_native_execution_and_active_port'};
  }else proof.reason='native_execution_or_port_not_current';
 }
 await record({operation_id:operationId,phase:'node_stepwise_source_freshness',proof});
}

export function makeStepwiseSourceObservationCode(binding){
 const ports=makeNodeOutputContextCode(binding),processes=makeNodeProcessContextCode(binding,{existingOutput:true});
 return `async page=>({ports:await (${ports})(page),processes:await (${processes})(page)})`;
}
