// Fixed J26 operator only. Unsupported text never enters the editor/engine.
import {randomUUID} from 'node:crypto';
import {AjvJsonSchemaValidator} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/validation/ajv-provider.js';
import {dispatchNodeApi} from '../../client/lib/node-api.mjs';
import {nodeApplyResultSchema} from '../../client/lib/node-result-schema.mjs';
import {nodeResultReply} from '../../client/lib/node-result-reply.mjs';

const need=(ok,message)=>{if(!ok)throw Error(message);};
export const javascriptPublicPolicyRefusalSources=Object.freeze([
 'import "module-not-enabled/J26";', 'export * from "module-not-enabled/J26";',
 'require("builtIn/Data");', 'import("builtIn/Data");',
]);

export async function runJavascriptPublicPolicyReread({runtime,request,prior,sourceIdentity,record,report,save,
 deadline,onPending,apiRecords,verifyOracle}){
 need(prior.status==='SUCCEEDED'&&prior.cleanup_complete===true&&prior.execution.status==='completed'
  &&prior.configuration.readback.source.sha256===sourceIdentity.sha256&&!runtime.hasUnsettledWork(),
 'Public policy reread requires its completed source operation');
 const refusals=[];
 for(const targetKind of ['new','existing'])for(const [index,source] of javascriptPublicPolicyRefusalSources.entries()){
  const operation_id='js-policy-refused-'+randomUUID(),before=apiRecords.length;
  const rejected={...structuredClone(request),operation_id,
   ...(targetKind==='existing'?{target:{kind:'existing',type:'programming.javascript',ref:prior.node},inputs:[],
    parameters:{source_text:source,expected_source_sha256:sourceIdentity.sha256}}
    :{parameters:{...request.parameters,source_text:source}})};
  let failure;
  try{await dispatchNodeApi(runtime,'dock_node_apply',rejected);}catch(error){failure=error;}
  need(failure&&failure.message==='Invalid parameters.source_text'&&apiRecords.length===before
   &&!runtime.hasUnsettledWork(),'Public unsupported source was not refused before editor/target effects');
  refusals.push({operation_id,target_kind:targetKind,case_index:index,refused:true,api_records_added:0,
   editor_effects_observed:false,explicit_execute_requested:false});
 }
 const operation_id='js-policy-reread-'+randomUUID(),remaining=deadline-Date.now()-60000;
 need(remaining>=600000,'Public policy reread original remaining budget unavailable');
 const args={operation_id,source_operation_id:request.operation_id,budget_ms:remaining,
  read:{ports:[0],sample_rows:100,require_exact_numbers:true}};
 report.stage='public-policy-source-bound-reread';onPending(true);await save();
 let job=await dispatchNodeApi(runtime,'dock_node_read',args);
 while(job.state==='running'){
  job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id,timeout_ms:30000});
  report.policy_reread_progress=job.progress;await save();
 }
 report.policy_reread_job=job;await save();
 const result=job.outcome?.output,table=result?.output?.ports?.[0];
 if(job.state==='settled'&&job.outcome?.cleanup_complete===true&&result?.cleanup_complete===true
  &&result.pending_phase==null&&!runtime.hasUnsettledWork()){onPending(false);await save();}
 need(job.state==='settled'&&job.outcome?.status==='SUCCEEDED'&&result?.status==='SUCCEEDED'
  &&result.cleanup_complete===true&&result.configuration?.status==='not_requested'
  &&JSON.stringify(result.node)===JSON.stringify(prior.node)&&result.execution.status==='completed'
  &&result.execution.execution_id!==prior.execution.execution_id&&table?.fresh===true
  &&table.execution_id===result.execution.execution_id&&table.port_guid===prior.output.ports[0].port_guid
  &&table.sample_complete===true&&table.row_count===6&&table.sample_rows===6&&!runtime.hasUnsettledWork(),
 'Public source-bound reread/owned fresh Execute/output boundary unconfirmed');
 need(new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema)(result).valid,'Public policy reread result schema differs');
 const oracle=verifyOracle(table);need(oracle.gate_passed===true,'Public policy reread independent business oracle differs');
 const projected=nodeResultReply(job,{userProfile:true}).structuredContent;
 need(projected.result_version==='user-v1'&&projected.configuration?.status==='not_requested'
  &&projected.execution.execution_id===result.execution.execution_id
  &&projected.output.ports[0].sample.length===table.sample.length
  &&projected.output.ports[0].sample.every((row,index)=>row.length===table.sample[index].length
   &&row.every((cell,column)=>['type','value','is_null','precision','decimal','representation','timezone','cell_type','native']
    .every(key=>JSON.stringify(cell[key])===JSON.stringify(table.sample[index][column][key]))))
  &&projected.output.ports[0].schema.length===table.schema.length
  &&projected.output.ports[0].schema.every((column,index)=>['index','name','label','type','data_kind']
   .every(key=>column[key]===table.schema[index][key])),
 'Public policy reread lost full typed user-v1 output');
 const beforeRetry=apiRecords.length,retry=await dispatchNodeApi(runtime,'dock_node_read',args);
 need(JSON.stringify(retry)===JSON.stringify(job)&&apiRecords.length===beforeRetry&&!runtime.hasUnsettledWork(),
 'Public policy reread delivery retry repeated a browser effect');
 const proof={status:'OBSERVED',operation_id,source_operation_id:request.operation_id,
  source_identity:structuredClone(sourceIdentity),node:result.node,job,user_v1_result:projected,oracle,
  unsupported_refusals:refusals,same_id_delivery_retry_verified:true,same_id_retry_api_records_added:0,
  package_saved:false,candidate_verified:false,cli_verified:false,native_bytes_verified:false};
 const saved=await record({phase:'javascript_public_policy_reread_verified',operation_id,proof:structuredClone(proof)});
 need(JSON.stringify(saved.proof)===JSON.stringify(proof),'Public policy reread proof ACK differs');
 return proof;
}
