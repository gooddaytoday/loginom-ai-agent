// Fixed operator scenario only. The product handler never imports this module.
import {randomUUID} from 'node:crypto';
import {AjvJsonSchemaValidator} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/validation/ajv-provider.js';
import {dispatchNodeApi} from '../../client/lib/node-api.mjs';
import {nodeApplyResultSchema} from '../../client/lib/node-result-schema.mjs';
import {nodeResultReply} from '../../client/lib/node-result-reply.mjs';
import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';
import {verifyJavascriptMappingGraph} from '../../client/lib/javascript-graph-preservation.mjs';

const need=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export const javascriptConfigurationSuffixes=Object.freeze({
  done:'\n// E: general configuration-only Done; business logic preserved.\n',
  close:'\n// E: general Close draft must be discarded.\n'
});

export function verifyJavascriptConfigurationJob(job,{node,mode,schemaMode,source}){
  const result=job?.outcome?.output;
  need(job?.state==='settled'&&job.outcome.status==='SUCCEEDED'&&job.outcome.cleanup_complete===true
    &&result?.status==='SUCCEEDED'&&result.cleanup_complete===true&&same(result.node,node)
    &&result.execution?.status==='not_requested'&&result.execution.execution_id===null
    &&result.output?.status==='not_refreshed'&&result.output.ports?.length===0
    &&result.package_saved===false&&result.persisted_package_verified===false,
  'Public configuration-only terminal boundary differs');
  const phases=['source','workflow','target','input_mapping','open','configure',...(mode==='done'?['node_finish']:[]),'finish'];
  need(same(result.phases?.map(p=>p.phase),phases)&&result.phases.every(p=>p.status==='verified'),
    'Public configuration-only phase sequence differs');
  need(new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema)(result).valid,
    'Public configuration-only result schema differs');
  if(mode==='done'){
    const readback=result.configuration?.readback;
    need(result.configuration.status==='applied'&&readback?.schema_mode===schemaMode
      &&readback.source.sha256===source.source_sha256&&readback.source.utf8_bytes===source.source_utf8_bytes
      &&readback.source.lf_lines===source.source_lf_lines&&readback.wizard_commit_verified===true
      &&readback.settings_preserved===true&&readback.execution_effects.explicit_execute_requested===false
      &&readback.execution_effects.internal_execution_started===null&&readback.package_persistence_verified===false,
    'Public configuration-only committed readback differs');
  }else need(mode==='close'&&same(result.configuration,{status:'discarded'})
    &&result.checkpoint_kind==='local_node_cancellation','Public Close discard result differs');
  const compact=nodeResultReply(job,{userProfile:true}).structuredContent;
  need(same(compact.configuration,result.configuration)&&same(compact.execution,result.execution)
    &&same(compact.output,result.output),'Public configuration-only user-v1 differs');
  return compact;
}

export async function runJavascriptPublicConfiguration({runtime,prepared,node,schemaMode,before,readSource,
  readGraph,record,runtimeEventCount,report,save,deadline,onPending}){
  const source=before.source_text+javascriptConfigurationSuffixes.done,identity=javascriptSourceIdentity(source);
  report.public_configuration={status:'RUNNING',schema_mode:schemaMode,node,initial_source_sha256:before.source_sha256,
    committed_source:identity,explicit_execution_requested:false,package_saved:false};
  for(const mode of ['done','close']){
    need(deadline-Date.now()>720000,'Public configuration original run budget unavailable');
    const baseline=await readGraph();
    const request={operation_id:'js-public-configuration-'+mode+'-'+randomUUID(),contract_revision:'1.0.0',
      document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,
      target:{kind:'existing',type:'programming.javascript',ref:node},inputs:[],mode:'script',
      parameters:{schema_mode:schemaMode,source_text:mode==='done'?source:source+javascriptConfigurationSuffixes.close,
        expected_source_sha256:mode==='done'?before.source_sha256:identity.source_sha256},
      mappings:[],finish:mode,read:{ports:[],sample_rows:0,require_exact_numbers:true},
      budgets:{configure_ms:600000,execute_ms:300000,total_ms:600000}};
    report.stage='public-configuration-'+mode;onPending(true);await save();
    let job=await dispatchNodeApi(runtime,'dock_node_apply',request);
    while(job.state==='running'){
      need(Date.now()<deadline-60000,'Public configuration original deadline expired');
      job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id:request.operation_id,timeout_ms:30000});
    }
    report.public_configuration[mode]={operation_id:request.operation_id,job};await save();
    const compact=verifyJavascriptConfigurationJob(job,{node,mode,schemaMode,source:identity});
    need(!runtime.hasUnsettledWork(),'Public configuration retained unsettled work');
    const count=runtimeEventCount(),retry=await dispatchNodeApi(runtime,'dock_node_apply',request);
    need(same(retry,job)&&runtimeEventCount()===count&&!runtime.hasUnsettledWork(),
      'Public configuration exact retry changed result or emitted events');
    const actual=await readSource(),after=await readGraph();
    need(actual.source_text===source&&actual.source_sha256===identity.source_sha256,
      'Public configuration independent retained source differs');
    verifyJavascriptMappingGraph(baseline,after,node);
    const proof={mode,operation_id:request.operation_id,node,...identity,
      source_read_operation_id:actual.source_read_operation_id,chunks:actual.chunks,
      graph_before:baseline,graph_after:after,exact_retry_runtime_events_added:0,explicit_execute_requested:false};
    const ack=await record({phase:'javascript_public_configuration_operator_verified',proof});
    need(same(ack.proof,proof),'Public configuration operator journal ACK differs');
    Object.assign(report.public_configuration[mode],{status:'OBSERVED',user_result:compact,proof});
    onPending(false);await save();
  }
  report.public_configuration.status='OBSERVED';await save();
  return {source_text:source,...identity};
}
