// Operator-only E scenario. Business source/oracle stay outside the runtime.
import {randomUUID,createHash} from 'node:crypto';
import {AjvJsonSchemaValidator} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/validation/ajv-provider.js';
import {createActionRuntime} from '../../client/lib/executor.mjs';
import {createCandidateNodeSupport} from '../../client/lib/node-support.mjs';
import {createJavascriptCodeNodeSupport} from '../../client/lib/javascript-code-node.mjs';
import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';
import {dispatchNodeApi} from '../../client/lib/node-api.mjs';
import {nodeApplyResultSchema} from '../../client/lib/node-result-schema.mjs';
import {nodeResultReply} from '../../client/lib/node-result-reply.mjs';
import {javascriptPublicCodePins} from './javascript-public-code-live.mjs';
import {javascriptPublicSourceCase,javascriptPublicSourceOutputOracle} from './javascript-public-source-cases.mjs';
import {javascriptDiscoveryProbe,javascriptDiscoveryOracle} from './javascript-discovery-probes.mjs';
import {javascriptStopProbe} from './javascript-stop-case.mjs';
import {stopJavascriptPublicExecution} from './javascript-public-stop.mjs';
import {createJavascriptPublicCancelResume} from './javascript-public-cancel-resume.mjs';

const need=(condition,message)=>{if(!condition)throw Error(message);};

// The fixed synchronous throw compiles successfully and fails on an explicit
// execution. Its committed source must be used as the NEW repair baseline.
export function verifyJavascriptPublicSyncThrow(job,node) {
  const result=job?.outcome?.output;
  need(job?.state==='settled'&&job.outcome.status==='FAILED'&&job.outcome.cleanup_complete===true
    &&job.outcome.effect_possible===true&&result?.status==='FAILED'&&result.cleanup_complete===true
    &&result.pending_phase==null&&JSON.stringify(result.node)===JSON.stringify(node)
    &&result.configuration?.status==='applied'&&result.execution?.status==='failed'
    &&result.execution.failure_verified===true&&typeof result.execution.execution_id==='string'
    &&result.execution.execution_id===node.document_id+':'+result.execution.root_id+':'+result.execution.group_id
    &&result.output?.status==='not_refreshed'&&result.output.ports?.length===0
    &&result.error?.code==='NODE_EXECUTION_FAILED'&&result.error.message.includes('Error: E_JS_SYNC_THROW')
    &&result.phases?.some(phase=>phase.phase==='materialization_execute'&&phase.status==='verified')
    &&result.phases.every(phase=>phase.status==='verified'),
  'Public synchronous throw execution/cleanup boundary unconfirmed');
  return result;
}

// One public source session; continuations retain its original deadline.
export async function readJavascriptPublicExistingSource({runtime,prepared,node,deadline,record}) {
  need(Number.isSafeInteger(deadline)&&deadline>Date.now()+30000,'Public source original deadline unavailable');
  const operation_id='js-existing-source-'+randomUUID(),chunks=[];
  const budget_ms=Math.max(1,Math.min(600000,deadline-Date.now()-30000));
  let request={kind:'source',operation_id,document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node,budget_ms};
  let source='',identity;
  do{
    const part=await dispatchNodeApi(runtime,'dock_node_read',request);
    const actual={source_sha256:part.source_sha256,source_utf8_bytes:part.source_utf8_bytes,source_lf_lines:part.source_lf_lines};
    need(part.kind==='source'&&typeof part.source_text==='string'&&part.source_text.isWellFormed()
      &&['document_id','workflow_id','node_id'].every(key=>part.owner?.[key]===node[key])
      &&part.owner.operation_id===operation_id&&part.offset_utf8_bytes===Buffer.byteLength(source,'utf8')
      &&part.chunk_utf8_bytes===Buffer.byteLength(part.source_text,'utf8')
      &&(!identity||JSON.stringify(identity)===JSON.stringify(actual))
      &&Buffer.byteLength(JSON.stringify(part),'utf8')<=16384,'Public existing source chunk identity differs');
    identity??=actual;source+=part.source_text;
    chunks.push({offset_utf8_bytes:part.offset_utf8_bytes,chunk_utf8_bytes:part.chunk_utf8_bytes,
      chunk_sha256:createHash('sha256').update(part.source_text,'utf8').digest('hex'),
      response_utf8_bytes:Buffer.byteLength(JSON.stringify(part),'utf8')});
    need(chunks.length<=8192&&Buffer.byteLength(source,'utf8')<=32768,'Public existing source chunk bound differs');
    request=part.cursor===null?null:{kind:'source',operation_id,cursor:part.cursor,expected_source_sha256:part.source_sha256};
  }while(request);
  need(JSON.stringify(javascriptSourceIdentity(source))===JSON.stringify(identity)&&!runtime.hasUnsettledWork(),
    'Public existing complete source digest/cleanup differs');
  const proof={operation_id,node,...identity,chunks,complete:true};
  const ack=await record({phase:'javascript_existing_public_source_chunks_verified',proof:structuredClone(proof)});
  need(JSON.stringify(ack.proof)===JSON.stringify(proof),'Public existing source chunks ACK differs');
  return {kind:'source',source_text:source,...identity,cursor:null,source_read_operation_id:operation_id,chunks};
}

export async function runJavascriptPublicExistingLive({page,prepared,node,targetOrigin,redactor,record,
  report,save,deadline,onPending,schemaMode,graph,inputVariant='base',sourceCaseId=null,schemaRefusalCaseId=null,
  wizardRefusalCaseId=null,stopCaseId=null,cancelResumeCaseId=null,readGraph}) {
  need(['code','declared'].includes(schemaMode)&&['base','changed','reordered'].includes(inputVariant)&&Date.now()+660000<deadline,
    'Public existing JavaScript mode/original budget unavailable');
  const sourceCase=sourceCaseId===null?null:javascriptPublicSourceCase(sourceCaseId);
  need(sourceCase===null||sourceCase.schema_mode===schemaMode&&inputVariant==='base','Public source case requires its fixed mode/base package');
  need(schemaRefusalCaseId===null||sourceCaseId===null&&inputVariant==='base'
    &&schemaRefusalCaseId===(schemaMode==='code'?'code-to-declared':'declared-to-code'),'Public schema refusal requires its fixed mode/base');
  need(wizardRefusalCaseId===null||sourceCaseId===null&&schemaRefusalCaseId===null&&inputVariant==='base'
    &&['syntax-'+schemaMode,'throw-'+schemaMode].includes(wizardRefusalCaseId)&&typeof readGraph==='function','Public wizard refusal requires its fixed mode/base');
  need(stopCaseId===null||stopCaseId==='stop-code'&&schemaMode==='code'&&inputVariant==='base'
    &&sourceCaseId===null&&schemaRefusalCaseId===null&&wizardRefusalCaseId===null&&typeof readGraph==='function',
  'Public Stop requires its fixed Code mode/base');
  need(cancelResumeCaseId===null||cancelResumeCaseId==='cancel-resume-code'&&stopCaseId===null&&schemaMode==='code'
    &&inputVariant==='base'&&sourceCaseId===null&&schemaRefusalCaseId===null&&wizardRefusalCaseId===null&&typeof readGraph==='function',
  'Public cancel/resume requires its fixed Code mode/base');
  const probe=javascriptDiscoveryProbe('p1-business-'+schemaMode+'-'+inputVariant);
  const base=createCandidateNodeSupport({targetOrigin,targetBuild:'7.4.2'});
  const support=createJavascriptCodeNodeSupport({targetOrigin,targetBuild:'7.4.2',redactor});
  let cancelResume;
  const runtime=createActionRuntime({pinned:await javascriptPublicCodePins(),allowCandidate:true,
    targetOrigin,targetBuild:'7.4.2',redactor,onRecord:async event=>{
      if((stopCaseId!==null||cancelResumeCaseId!==null)&&event.phase==='node_phase_prepared'&&event.receipt?.phase==='materialization_start'
        &&event.operation_id===report.public_existing?.stop?.operation_id)
        report.public_existing.stop.launch_window_started=Date.now();
      const saved=await record(event);await cancelResume?.observe(saved);return saved;
    },
    execute:source=>Function('return ('+source+')')()(page),
    nodeApplyHandlers:new Map([...base.nodeApplyHandlers,...support.nodeApplyHandlers]),
    nodeApplyDriverFactory:options=>options.operation.parameters.target.type==='programming.javascript'
      ?support.nodeApplyDriverFactory(options):base.nodeApplyDriverFactory(options)});
  Object.assign(report,{scope:'isolated E existing source edit/Execute/full typed UI; current schema preserved',
    stage:'public-existing-source-before',original_deadline:deadline,explicit_execution_limit:inputVariant==='base'?2:3,
    candidate_verified:false,cli_verified:false,native_bytes_verified:false,gates_closed:[],
    public_existing:{status:'RUNNING',schema_mode:schemaMode,input_variant:inputVariant,source_case_id:sourceCaseId,node,raw_source_in_report:false}});
  onPending(true);await save();
  const readSource=()=>readJavascriptPublicExistingSource({runtime,prepared,node,deadline,record});
  const before=await readSource();
  let repairBaseline=before.source_sha256;
  need(before.source_text===probe.source&&before.source_sha256===probe.source_sha256
    &&before.cursor===null&&!runtime.hasUnsettledWork(),'Public existing initial source differs from assigned package');
  if(schemaRefusalCaseId!==null){
    const operation_id='js-public-schema-refusal-'+randomUUID(),requested_mode=schemaMode==='code'?'declared':'code';
    const remaining=deadline-Date.now()-60000;need(remaining>=600000,'Public schema refusal original budget unavailable');
    report.scope='isolated E public existing schema mode refusal after owned read/discard';
    report.explicit_execution_limit=0;
    Object.assign(report.public_existing,{operation_id,schema_refusal_case_id:schemaRefusalCaseId,
      requested_schema_mode:requested_mode,source_sha256:before.source_sha256,previous_source_sha256:before.source_sha256,graph_before:graph});
    const request={operation_id,contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,
      target:{kind:'existing',type:'programming.javascript',ref:node},inputs:[],mode:'script',parameters:{schema_mode:requested_mode},
      mappings:[],finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},
      budgets:{configure_ms:remaining,execute_ms:300000,total_ms:remaining}};
    report.stage='public-existing-schema-refusal';await save();
    let job=await dispatchNodeApi(runtime,'dock_node_apply',request);
    while(job.state==='running'){
      job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id,timeout_ms:30000});
      report.public_existing.progress=job.progress;await save();
    }
    report.public_existing.job=job;await save();
    const result=job.outcome?.output;
    need(job.state==='settled'&&job.outcome?.status==='FAILED'&&job.outcome.cleanup_complete===true
      &&job.outcome.effect_possible===true&&result?.status==='FAILED'&&result.cleanup_complete===true
      &&result.pending_phase===null&&result.node===null&&result.execution.status==='not_requested'
      &&result.output.status==='not_refreshed'&&result.error.message==='JavaScript existing lifecycle preserves observed schema'
      &&JSON.stringify(result.phases.map(phase=>phase.phase))===JSON.stringify(['source','workflow'])
      &&result.phases.every(phase=>phase.status==='verified')&&!runtime.hasUnsettledWork(),
      'Public existing schema refusal/cleanup boundary unconfirmed');
    need(new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema)(result).valid,
      'Public schema refusal violates diagnostic schema');
    onPending(false);await save();
    report.stage='public-existing-schema-refusal-source-after';onPending(true);await save();
    const after=await readSource();
    need(after.source_text===before.source_text&&after.source_sha256===before.source_sha256&&!runtime.hasUnsettledWork(),
      'Public schema refusal source changed');
    Object.assign(report.public_existing,{status:'OBSERVED',verified_schema_mode_refusal:true,
      editor_mutation_started:false,explicit_execute_requested:false,
      independent_source:{complete:true,...javascriptSourceIdentity(after.source_text),chunks:after.chunks,source_read_operation_id:after.source_read_operation_id}});
    report.stage='public-existing-schema-refusal-observed';onPending(false);await save();return;
  }
  if(wizardRefusalCaseId!==null) {
    const operation_id='js-public-native-refusal-'+randomUUID();
    const throwing=wizardRefusalCaseId.startsWith('throw-');
    const source_text=before.source_text+(throwing?'\nthrow new Error("E_JS_SYNC_THROW");\n':'\nconst unsupported = ({})?.value;\n');
    const identity=javascriptSourceIdentity(source_text),remaining=deadline-Date.now()-60000;
    need(remaining>=1200000,'Public wizard refusal/repair original budget unavailable');
    report.scope='isolated E public native wizard refusal and NEW same-node repair/full typed UI';
    report.public_existing.wizard_refusal={status:'RUNNING',case_id:wizardRefusalCaseId,operation_id,node,
      previous_source_sha256:before.source_sha256,rejected_source:identity,graph_before:graph};
    const request={operation_id,contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,
      target:{kind:'existing',type:'programming.javascript',ref:node},inputs:[],mode:'script',
      parameters:{source_text,expected_source_sha256:before.source_sha256,schema_mode:schemaMode},mappings:[],finish:'execute',
      read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},
      budgets:{configure_ms:600000,execute_ms:300000,total_ms:600000}};
    report.stage='public-existing-native-refusal';await save();
    let job=await dispatchNodeApi(runtime,'dock_node_apply',request);
    while(job.state==='running') {
      job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id,timeout_ms:30000});
      report.public_existing.wizard_refusal.progress=job.progress;await save();
    }
    report.public_existing.wizard_refusal.job=job;await save();
    const result=job.outcome?.output,native=result?.error?.native;
    if(throwing){verifyJavascriptPublicSyncThrow(job,node);need(!runtime.hasUnsettledWork(),'Public failed execution remains unresolved');}
    if(!throwing)need(job.state==='settled'&&job.outcome?.status==='FAILED'&&job.outcome.cleanup_complete===true
      &&result?.status==='FAILED'&&result.cleanup_complete===true&&result.pending_phase===null
      &&JSON.stringify(result.node)===JSON.stringify(node)&&result.configuration?.status==='discarded'
      &&result.execution.status==='not_requested'&&result.output.status==='not_refreshed'&&result.output.ports.length===0
      &&native?.kind==='javascript_wizard'&&['code_next','done'].includes(native.stage)&&native.source_sha256===identity.source_sha256
      &&native.dialog_closed===true&&native.error_class?.name==='SyntaxError'
      &&(native.tooltip+'\n'+native.dialog_text).includes('SyntaxError: Syntax error at code')&&!runtime.hasUnsettledWork(),
    'Public native wizard diagnostic/discard/cleanup boundary unconfirmed');
    need(new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema)(result).valid,
      'Public native refusal violates diagnostic schema');
    const compact=nodeResultReply(job,{userProfile:true}).structuredContent;
    need(JSON.stringify(compact.error)===JSON.stringify(result.error)&&Buffer.byteLength(JSON.stringify(compact))<=16384,
      'Public native refusal user-v1 diagnostic differs');
    onPending(false);await save();
    report.stage='public-existing-native-refusal-source-after';onPending(true);await save();
    const after=await readSource(),afterGraph=await readGraph();
    need(after.source_text===(throwing?source_text:before.source_text)
      &&after.source_sha256===(throwing?identity.source_sha256:before.source_sha256)&&!runtime.hasUnsettledWork(),
      'Public native refusal committed source changed');
    repairBaseline=after.source_sha256;
    Object.assign(report.public_existing.wizard_refusal,{status:'OBSERVED',user_result:compact,
      explicit_execute_requested:throwing,actual_stage:throwing?'materialization_execute':native.stage,graph_after:afterGraph,
      independent_source:{complete:true,...javascriptSourceIdentity(after.source_text),chunks:after.chunks,source_read_operation_id:after.source_read_operation_id}});
    onPending(false);await save();
  }
  if(stopCaseId!==null||cancelResumeCaseId!==null){
    const fixed=javascriptStopProbe(),identity=javascriptSourceIdentity(fixed.source),operation_id='js-public-stop-'+randomUUID();
    need(fixed.short.source===before.source_text,'Public finite Stop saved source differs');
    report.scope='isolated E public finite native Stop and NEW same-node short repair';report.explicit_execution_limit=3;
    report.public_existing.stop={status:'RUNNING',case_id:stopCaseId??cancelResumeCaseId,operation_id,node,
      previous_source_sha256:before.source_sha256,finite_source:identity,finite_loop:fixed.finite_loop,graph_before:graph};
    const request={operation_id,contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,
      target:{kind:'existing',type:'programming.javascript',ref:node},inputs:[],mode:'script',
      parameters:{source_text:fixed.source,expected_source_sha256:before.source_sha256,schema_mode:schemaMode},mappings:[],finish:'execute',
      read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},
      budgets:{configure_ms:600000,execute_ms:60000,total_ms:660000}};
    report.stage='public-existing-native-stop';await save();
    const onProgress=async job=>{report.public_existing.stop.progress=job.progress;await save();};
    let job;
    if(cancelResumeCaseId!==null){
      cancelResume=createJavascriptPublicCancelResume({runtime,node,record});
      const resumed=await cancelResume.run({request,onProgress,deadline:deadline-60000});
      job=resumed.job;report.public_existing.stop.local_cancel_resume=resumed;
    }
    if(cancelResumeCaseId===null)job=await stopJavascriptPublicExecution({runtime,request,node,record,deadline:deadline-60000,onProgress});
    report.public_existing.stop.job=job;onPending(false);await save();
    const elapsed_ms=Date.now()-report.public_existing.stop.launch_window_started;
    need(Number.isFinite(elapsed_ms)&&elapsed_ms>0&&elapsed_ms<=60000&&!runtime.hasUnsettledWork(),
      'Public finite Stop exceeded the original 60s launch/terminal window');
    need(new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema)(job.outcome.output).valid,'Public Stop violates diagnostic schema');
    const compact=nodeResultReply(job,{userProfile:true}).structuredContent;
    need(JSON.stringify(compact.error)===JSON.stringify(job.outcome.output.error),'Public Stop user-v1 error differs');
    report.stage='public-existing-native-stop-source-after';onPending(true);await save();
    const after=await readSource(),afterGraph=await readGraph();
    need(after.source_text===fixed.source&&after.source_sha256===identity.source_sha256&&!runtime.hasUnsettledWork(),
      'Public Stop committed source changed');
    repairBaseline=after.source_sha256;
    Object.assign(report.public_existing.stop,{status:'OBSERVED',elapsed_ms,user_result:compact,graph_after:afterGraph,
      independent_source:{complete:true,...javascriptSourceIdentity(after.source_text),chunks:after.chunks,source_read_operation_id:after.source_read_operation_id}});
    onPending(false);await save();
  }
  const source_text=sourceCase?.source??before.source_text+(cancelResumeCaseId!==null
    ?'\n// E: public local cancel and SAME-ID resume repair on the SAME node.\n':stopCaseId!==null
    ?'\n// E: public native Stop repair on the SAME node.\n':wizardRefusalCaseId===null
    ?'\n// E: existing node source revision; business logic preserved.\n'
    :'\n// E: public native refusal repair on the SAME node.\n');
  const expected=javascriptSourceIdentity(source_text),operation_id='js-public-existing-'+randomUUID();
  const remaining=deadline-Date.now()-60000;
  need(remaining>=600000,'Public existing original time budget unavailable');
  const request={operation_id,contract_revision:'1.0.0',document_id:prepared.document_id,
    workflow_ref:prepared.workflow_ref,target:{kind:'existing',type:'programming.javascript',ref:node},
    inputs:[],mode:'script',parameters:{source_text,expected_source_sha256:repairBaseline,schema_mode:schemaMode},
    mappings:[],finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},
    budgets:{configure_ms:remaining,execute_ms:300000,total_ms:remaining}};
  Object.assign(report.public_existing,{operation_id,previous_source_sha256:repairBaseline,
    source_sha256:expected.source_sha256,oracle_sha256:probe.oracle_sha256,graph_before:graph,
    ...(wizardRefusalCaseId!==null?{wizard_refusal_case_id:wizardRefusalCaseId,repair_operation_id:operation_id}:{}),
    ...(stopCaseId!==null?{stop_case_id:stopCaseId,repair_operation_id:operation_id}:{}),
    ...(cancelResumeCaseId!==null?{cancel_resume_case_id:cancelResumeCaseId,repair_operation_id:operation_id}:{})});
  report.stage='public-existing-apply';await save();
  await record({phase:'javascript_existing_workflow_blockers_observed',operation_id,
    blockers:await page.evaluate(()=>[...document.querySelectorAll('[role="dialog"],.bg-mask-message,.x-mask-msg')]
      .filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden')
      .map(e=>({tid:e.getAttribute('data-tid'),role:e.getAttribute('role'),classes:e.className,
        connected:e.isConnected,check_visibility:e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),
        text:e.innerText?.slice(0,300),ancestors:Array.from((function*(node){while(node){yield node;node=node.parentElement;}})(e))
          .slice(0,12).map(node=>({tid:node.getAttribute('data-tid'),classes:node.className,
            display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility,
            opacity:getComputedStyle(node).opacity}))})))});
  let job=await dispatchNodeApi(runtime,'dock_node_apply',request);
  while(job.state==='running'){
    job=await dispatchNodeApi(runtime,'dock_node_wait',{operation_id,timeout_ms:30000});
    report.public_existing.progress=job.progress;await save();
  }
  report.public_existing.job=job;await save();
  if(job.state==='settled'&&job.outcome?.status==='NOT_APPLIED'&&job.outcome.effect_possible===false
    &&job.outcome.cleanup_complete===true&&!runtime.hasUnsettledWork())onPending(false);
  const result=job.outcome?.output,table=result?.output?.ports?.[0];
  need(job.outcome?.status==='SUCCEEDED'&&result.status==='SUCCEEDED'&&result.cleanup_complete===true
    &&JSON.stringify(result.node)===JSON.stringify(node)&&result.configuration?.readback?.schema_mode===schemaMode
    &&result.configuration.readback.source.sha256===expected.source_sha256
    &&result.execution.status==='completed'&&result.output.status==='complete'
    &&table?.fresh===true&&table.execution_id===result.execution.execution_id&&!runtime.hasUnsettledWork(),
  'Public existing execution/result boundary unconfirmed');
  onPending(false);await save();
  need(new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema)(result).valid,
    'Public existing result violates diagnostic schema');
  const oracle=sourceCaseId===null?javascriptDiscoveryOracle(probe,table):javascriptPublicSourceOutputOracle(sourceCaseId,table);
  need(oracle.gate_passed===true,'Public existing full business oracle differs');
  const compact=nodeResultReply(job,{userProfile:true}).structuredContent;
  const delivered=compact?.output?.ports?.[0];
  need(delivered?.fresh===true&&delivered.execution_id===table.execution_id
    &&delivered.row_count===table.row_count&&delivered.sample_rows===table.sample_rows&&delivered.sample_complete===true
    &&delivered.schema.length===table.schema.length&&delivered.schema.every((column,index)=>
      ['index','name','label','type','data_kind'].every(key=>column[key]===table.schema[index][key]))
    &&delivered.sample.length===table.sample.length&&delivered.sample.every((row,index)=>row.length===table.sample[index].length
      &&row.every((cell,column)=>['type','value','is_null','precision'].every(key=>cell[key]===table.sample[index][column][key])))
    &&JSON.stringify(compact.configuration)===JSON.stringify(result.configuration),
  'Public existing user-v1 full output/configuration differs');
  report.stage='public-existing-source-after';onPending(true);await save();
  const after=await readSource();
  need(after.source_text===source_text&&after.source_sha256===expected.source_sha256
    &&after.cursor===null&&!runtime.hasUnsettledWork(),'Public existing independent final source differs');
  Object.assign(report.public_existing,{status:'OBSERVED',configuration:result.configuration,execution:result.execution,
    output:result.output,oracle,independent_source:{complete:true,...expected,chunks:after.chunks,source_read_operation_id:after.source_read_operation_id}});
  report.stage='public-existing-observed';onPending(false);await save();
}
