// Acceptance operator only: the business source and oracle never enter the
// candidate runtime or its knowledge bundle.
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {AjvJsonSchemaValidator} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/validation/ajv-provider.js';
import {createActionRuntime} from '../../client/lib/executor.mjs';
import {createCandidateNodeSupport} from '../../client/lib/node-support.mjs';
import {createJavascriptCodeNodeSupport} from '../../client/lib/javascript-code-node.mjs';
import {dispatchNodeApi} from '../../client/lib/node-api.mjs';
import {nodeResultReply} from '../../client/lib/node-result-reply.mjs';
import {nodeApplyResultSchema} from '../../client/lib/node-result-schema.mjs';
import {javascriptDiscoveryProbe,javascriptDiscoveryOracle} from './javascript-discovery-probes.mjs';

const need=(value,message)=>{if(!value)throw Error(message);};

export async function javascriptPublicCodePins() {
  const actions=JSON.parse(await readFile(new URL('../../executor/catalog/actions.json',import.meta.url),'utf8')).actions;
  const selectors=JSON.parse(await readFile(new URL('../../executor/catalog/selectors.json',import.meta.url),'utf8')).selectors;
  return {actions:new Map(actions.map(action=>[action.action_key,action])),
    selectors:new Map(selectors.map(selector=>[selector.symbol,selector])),pins:{}};
}

export async function runJavascriptPublicCodeLive({page,prepared,input,targetOrigin,redactor,record,
  report,save,deadline,onPending,schemaMode='code'}) {
  need(['code','declared'].includes(schemaMode),'Public JavaScript schema mode unavailable');
  const key=schemaMode==='declared'?'public_declared':'public_code';
  const stage=schemaMode==='declared'?'public-declared':'public-code';
  const probe=javascriptDiscoveryProbe('p1-business-'+schemaMode+'-base');
  const remaining=deadline-Date.now()-60000;
  need(remaining>=600000&&input.table?.sample_complete===true&&input.table.row_count===6
    &&input.table.schema.length===5,'Public Code lifecycle requires complete own input and original time budget');
  const base=createCandidateNodeSupport({targetOrigin,targetBuild:'7.4.2'});
  const code=createJavascriptCodeNodeSupport({targetOrigin,targetBuild:'7.4.2',redactor});
  const runtime=createActionRuntime({pinned:await javascriptPublicCodePins(),
    allowCandidate:true,targetOrigin,targetBuild:'7.4.2',redactor,onRecord:record,
    execute:source=>Function('return ('+source+')')()(page),
    nodeApplyHandlers:new Map([...base.nodeApplyHandlers,...code.nodeApplyHandlers]),
    nodeApplyDriverFactory:options=>options.operation.parameters.target.type==='programming.javascript'
      ?code.nodeApplyDriverFactory(options):base.nodeApplyDriverFactory(options)});
  const request={operation_id:'js-public-code-'+randomUUID(),contract_revision:'1.0.0',
    document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,
    target:{kind:'new',type:'programming.javascript',label:'JavaScript '+schemaMode+' business'},
    inputs:[{source:input.node,output:0,input:0}],mode:'script',
    parameters:{schema_mode:schemaMode,source_text:probe.source,
      ...(schemaMode==='declared'?{columns:probe.schema.map((column,index)=>({...column,
        data_kind:column.type==='integer'?'Непрерывный':'Дискретный',usage:index===0?'Выходное':'Не задано'}))}:{})},mappings:[],finish:'execute',
    read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},
    budgets:{configure_ms:remaining,execute_ms:300000,total_ms:remaining}};
  Object.assign(report,{scope:'isolated public '+(schemaMode==='code'?'C Code':'D declared')+' lifecycle; full typed UI business output',
    original_deadline:deadline,explicit_execution_limit:2,gates_closed:[],candidate_verified:false,
    cli_verified:false,native_bytes_verified:false,stage:stage+'-apply',
    [key]:{status:'RUNNING',operation_id:request.operation_id,target_kind:'new',
      source_sha256:probe.source_sha256,oracle_sha256:probe.oracle_sha256,raw_source_in_report:false}});
  onPending(true);await save();
  let job=await dispatchNodeApi(runtime,'dock_node_apply',request);
  while(job.state==='running'){
    job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id:request.operation_id,timeout_ms:30000});
    report[key].progress=job.progress;await save();
  }
  report[key].job=job;await save();
  const result=job.outcome?.output,table=result?.output?.ports?.[0];
  // A confirmed refusal before target creation leaves no JS wizard or graph
  // effect to reconcile. Preserve the failed result and permit owned package cleanup.
  if(job.state==='settled'&&job.outcome?.status==='NOT_APPLIED'&&job.outcome.effect_possible===false
    &&job.outcome.cleanup_complete===true&&result?.node===null&&result.pending_phase===null
    &&result.cleanup_complete===true&&result.effect_possible===false&&!runtime.hasUnsettledWork()){
    onPending(false);await save();
  }
  need(job.outcome?.status==='SUCCEEDED'&&result.status==='SUCCEEDED'&&result.cleanup_complete===true
    &&result.configuration?.readback?.source.sha256===probe.source_sha256
    &&result.configuration.readback.execution_effects.explicit_execute_requested===true
    &&result.execution.status==='completed'&&result.output.status==='complete'
    &&table?.fresh===true&&table.execution_id===result.execution.execution_id&&!runtime.hasUnsettledWork(),
  'Public Code execution/result boundary unconfirmed');
  // The settled public operation has already restored its owned graph. An
  // operator schema/oracle refusal must still permit ordinary package cleanup.
  onPending(false);await save();
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
  report.stage=stage+'-independent-source-read';await save();
  onPending(true);
  const sourceRead=await dispatchNodeApi(runtime,'dock_node_read',{kind:'source',operation_id:'js-code-after-'+randomUUID(),
    document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:result.node,
    budget_ms:Math.max(1,Math.min(180000,deadline-Date.now()-30000))});
  need(sourceRead.kind==='source'&&sourceRead.source_text===probe.source&&sourceRead.source_sha256===probe.source_sha256
    &&sourceRead.cursor===null&&!runtime.hasUnsettledWork(),'Independent public Code saved source differs');
  Object.assign(report[key],{status:'OBSERVED',configuration:result.configuration,
    execution:result.execution,output:result.output,node:result.node,oracle,
    independent_source:{source_sha256:sourceRead.source_sha256,source_utf8_bytes:sourceRead.source_utf8_bytes,
      source_lf_lines:sourceRead.source_lf_lines,complete:true,raw_source_in_report:false}});
  report.stage=stage+'-observed';onPending(false);await save();
  return result.node;
}
