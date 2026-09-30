// Acceptance operator only: the business source and oracle never enter the
// candidate runtime or its knowledge bundle.
import {randomUUID} from 'node:crypto';
import {AjvJsonSchemaValidator} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/validation/ajv-provider.js';
import {createActionRuntime} from '../../client/lib/executor.mjs';
import {createCandidateNodeSupport} from '../../client/lib/node-support.mjs';
import {createJavascriptCodeNodeSupport} from '../../client/lib/javascript-code-node.mjs';
import {dispatchNodeApi} from '../../client/lib/node-api.mjs';
import {nodeResultReply} from '../../client/lib/node-result-reply.mjs';
import {nodeApplyResultSchema} from '../../client/lib/node-result-schema.mjs';
import {javascriptDiscoveryProbe,javascriptDiscoveryOracle} from './javascript-discovery-probes.mjs';

const need=(value,message)=>{if(!value)throw Error(message);};

export async function runJavascriptPublicCodeLive({page,prepared,input,targetOrigin,redactor,record,
  report,save,deadline,onPending}) {
  const probe=javascriptDiscoveryProbe('p1-business-code-base');
  const remaining=deadline-Date.now()-60000;
  need(remaining>=600000&&input.table?.sample_complete===true&&input.table.row_count===6
    &&input.table.schema.length===5,'Public Code lifecycle requires complete own input and original time budget');
  const base=createCandidateNodeSupport({targetOrigin,targetBuild:'7.4.2'});
  const code=createJavascriptCodeNodeSupport({targetOrigin,targetBuild:'7.4.2',redactor});
  const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},
    allowCandidate:true,targetOrigin,targetBuild:'7.4.2',redactor,onRecord:record,
    execute:source=>Function('return ('+source+')')()(page),
    nodeApplyHandlers:new Map([...base.nodeApplyHandlers,...code.nodeApplyHandlers]),
    nodeApplyDriverFactory:options=>options.operation.parameters.target.type==='programming.javascript'
      ?code.nodeApplyDriverFactory(options):base.nodeApplyDriverFactory(options)});
  const request={operation_id:'js-public-code-'+randomUUID(),contract_revision:'1.0.0',
    document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,
    target:{kind:'new',type:'programming.javascript',label:'JavaScript Code business'},
    inputs:[{source:input.node,output:0,input:0}],mode:'script',
    parameters:{schema_mode:'code',source_text:probe.source},mappings:[],finish:'execute',
    read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},
    budgets:{configure_ms:remaining,execute_ms:300000,total_ms:remaining}};
  Object.assign(report,{scope:'isolated public C new Code lifecycle; full typed UI business output',
    original_deadline:deadline,explicit_execution_limit:2,gates_closed:[],candidate_verified:false,
    cli_verified:false,native_bytes_verified:false,stage:'public-code-apply',
    public_code:{status:'RUNNING',operation_id:request.operation_id,target_kind:'new',
      source_sha256:probe.source_sha256,oracle_sha256:probe.oracle_sha256,raw_source_in_report:false}});
  onPending(true);await save();
  let job=await dispatchNodeApi(runtime,'dock_node_apply',request);
  while(job.state==='running'){
    job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id:request.operation_id,timeout_ms:30000});
    report.public_code.progress=job.progress;await save();
  }
  report.public_code.job=job;await save();
  const result=job.outcome?.output,table=result?.output?.ports?.[0];
  need(job.outcome?.status==='SUCCEEDED'&&result.status==='SUCCEEDED'&&result.cleanup_complete===true
    &&result.configuration?.readback?.source.sha256===probe.source_sha256
    &&result.configuration.readback.execution_effects.explicit_execute_requested===true
    &&result.execution.status==='completed'&&result.output.status==='complete'
    &&table?.fresh===true&&table.execution_id===result.execution.execution_id&&!runtime.hasUnsettledWork(),
  'Public Code execution/result boundary unconfirmed');
  const validation=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema)(result);
  need(validation.valid,'Public Code result violates its diagnostic schema');
  const oracle=javascriptDiscoveryOracle(probe,table);
  need(oracle.gate_passed===true,'Public Code full business oracle differs');
  const projected=nodeResultReply(job,{userProfile:true}).structuredContent;
  const compact=projected?.output?.ports?.[0];
  need(projected?.configuration?.readback?.source.sha256===probe.source_sha256
    &&compact?.fresh===true&&compact.execution_id===table.execution_id
    &&compact.sample_complete===true&&compact.sample_rows===table.sample_rows&&compact.row_count===table.row_count
    &&compact.schema.length===table.schema.length
    &&compact.schema.every((column,index)=>['index','name','label','type','data_kind']
      .every(key=>column[key]===table.schema[index][key]))
    &&compact.sample.length===table.sample.length&&compact.sample.every((row,index)=>row.length===table.sample[index].length
      &&row.every((cell,column)=>['type','value','is_null','precision'].every(key=>cell[key]===table.sample[index][column][key]))),
  'Public Code user-v1 full output differs');
  report.stage='public-code-independent-source-read';await save();
  const sourceRead=await dispatchNodeApi(runtime,'dock_node_read',{kind:'source',operation_id:'js-code-after-'+randomUUID(),
    document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:result.node,
    budget_ms:Math.max(1,Math.min(180000,deadline-Date.now()-30000))});
  need(sourceRead.kind==='source'&&sourceRead.source_text===probe.source&&sourceRead.source_sha256===probe.source_sha256
    &&sourceRead.cursor===null&&!runtime.hasUnsettledWork(),'Independent public Code saved source differs');
  Object.assign(report.public_code,{status:'OBSERVED',configuration:result.configuration,
    execution:result.execution,output:result.output,node:result.node,oracle,
    independent_source:{source_sha256:sourceRead.source_sha256,source_utf8_bytes:sourceRead.source_utf8_bytes,
      source_lf_lines:sourceRead.source_lf_lines,complete:true,raw_source_in_report:false}});
  report.stage='public-code-observed';onPending(false);await save();
  return result.node;
}
