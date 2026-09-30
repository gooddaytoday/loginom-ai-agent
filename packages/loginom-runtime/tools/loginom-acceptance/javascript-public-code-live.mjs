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
import {verifyJavascriptMismatchTable} from './javascript-mismatch-probe.mjs';
import {verifyNativeInputUi} from './javascript-native-input-contract.mjs';
import {verifyNativeRoundtripInput} from './javascript-native-roundtrip-contract.mjs';
import {javascriptDiscoveryProbe,javascriptDiscoveryOracle} from './javascript-discovery-probes.mjs';

const need=(value,message)=>{if(!value)throw Error(message);};

export async function javascriptPublicCodePins() {
  const actions=JSON.parse(await readFile(new URL('../../executor/catalog/actions.json',import.meta.url),'utf8')).actions;
  const selectors=JSON.parse(await readFile(new URL('../../executor/catalog/selectors.json',import.meta.url),'utf8')).selectors;
  return {actions:new Map(actions.map(action=>[action.action_key,action])),
    selectors:new Map(selectors.map(selector=>[selector.symbol,selector])),pins:{}};
}

const codeTypedIds=Object.freeze(['g5-native-integer-outside-safe','g5-native-civil-datetime','g5-native-integer-safe','g5-native-string','g5-native-boolean','g5-native-real','g5-null-empty','g5-boolean','g5-real',
  'g5-safe-integer','g5-date-civil','g5-named-access','g5-empty-output','g5-one-output','g5-empty-input']);
export const javascriptPublicTypedIds=Object.freeze([...codeTypedIds,...codeTypedIds.map(id=>'declared-'+id),
  'g5-native-cardinality-keep2','g5-native-cardinality-odd','g5-native-cardinality-duplicate','declared-g5-native-cardinality-empty']);

export function javascriptPublicCodeProbe(probeId,schemaMode) {
  need(probeId===null||javascriptPublicTypedIds.includes(probeId),'Public typed probe requires a fixed typed case');
  const probe=javascriptDiscoveryProbe(probeId??'p1-business-'+schemaMode+'-base');
  need(probe.schema_mode===schemaMode,'Public typed probe requires its fixed schema mode');
  return probe;
}

export function javascriptPublicCodeRequest({prepared,input,probe,schemaMode,remaining}) {
  need(['code','declared'].includes(schemaMode)&&Number.isSafeInteger(remaining)&&remaining>=600000,
    'Public Code request mode/original budget unavailable');
  const pinned=javascriptPublicCodeProbe(javascriptPublicTypedIds.includes(probe.id)?probe.id:null,schemaMode);
  need(JSON.stringify(probe)===JSON.stringify(pinned),'Public Code probe pin changed');
  return {operation_id:'js-public-code-'+randomUUID(),contract_revision:'1.0.0',
    document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,
    target:{kind:'new',type:'programming.javascript',label:'JavaScript '+schemaMode+' '+(javascriptPublicTypedIds.includes(probe.id)?probe.id:'business')},
    inputs:[{source:input.node,output:0,input:0}],mode:'script',
    parameters:{schema_mode:schemaMode,source_text:probe.source,
      ...(schemaMode==='declared'?{columns:probe.schema.map((column,index)=>({...column,
        data_kind:['integer','real','datetime'].includes(column.type)?'Непрерывный':'Дискретный',usage:index===0?'Выходное':'Не задано'}))}:{})},mappings:[],finish:'execute',
    read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},
    budgets:{configure_ms:remaining,execute_ms:300000,total_ms:remaining}};
}

// Pure operator boundary: native bytes and released reads precede public JS.
export function verifyJavascriptPublicCodeInput(probe,input) {
  const mode=probe.schema_mode;
  const pinned=javascriptPublicCodeProbe(javascriptPublicTypedIds.includes(probe.id)?probe.id:null,mode);
  need(JSON.stringify(probe)===JSON.stringify(pinned),'Public Code input probe pin changed');
  if(probe.native_input_fixture!==undefined){
    need(['real','boolean','string','integer-safe','integer-outside-safe','civil-datetime',
      'cardinality-keep2','cardinality-odd','cardinality-duplicate','cardinality-empty'].includes(probe.native_input_fixture),'Public Code native input fixture unavailable');
    const native=verifyNativeRoundtripInput(input,probe.native_input_fixture);
    verifyNativeInputUi(input.table,probe.native_input_fixture);
    need(['document_id','workflow_id','node_id'].every(key=>native.binding[key]===input.node[key]
      &&native.exact.provenance.node[key]===input.node[key])
      &&input.table.execution_id===native.exact.provenance.execution.execution_id,
      'Public Code native input owner/execution differs');
    return {verified:true,native_input_bytes_verified:true,fixture_id:probe.native_input_fixture,node:input.node,
      input_source_sha256:native.exact.provenance.source.sha256,
      native_read_released:true,row_count:input.table.row_count};
  }
  need(input.table?.sample_complete===true&&input.table.row_count===(probe.input_variant==='empty'?0:6)
    &&input.table.sample_rows===input.table.row_count&&input.table.schema.length===5,
    'Public Code lifecycle requires complete own input');
  return {verified:true,native_input_bytes_verified:false};
}

// Outside-safe is an observation of exact decimal output, never a fixed
// identity oracle. Safe-range cases keep their existing fixed-value contract.
export function javascriptPublicCodeOracle(probe,table,input) {
  if(probe.native_input_fixture!=='integer-outside-safe')return javascriptDiscoveryOracle(probe,table);
  verifyJavascriptPublicCodeInput(probe,input);
  verifyJavascriptMismatchTable(table);
  need(table.row_count===3&&table.schema.length===1&&table.schema[0].name==='Value'
    &&table.schema[0].label==='Value'&&table.schema[0].type==='integer',
    'Public outside-safe requires full fixed output schema/cardinality');
  const cells=table.sample.map((row,index)=>{
    const cell=row[0];
    need(cell.is_null===false&&typeof cell.value==='string'&&/^(?:0|-?[1-9][0-9]*)$/.test(cell.value)
      &&BigInt(cell.value)>=-9223372036854775808n&&BigInt(cell.value)<=9223372036854775807n,
      'Public outside-safe requires signed-int64 decimal observations');
    const before=input.table.sample[index][0].value;
    return {row:index,input_decimal:before,output_decimal:cell.value,
      unchanged:cell.value===before,delta_decimal:(BigInt(cell.value)-BigInt(before)).toString()};
  });
  return {schema_verified:true,values_verified:false,gate_passed:false,expectation:'characterization',scope:probe.scope,
    proof_level:'typed_ui_with_native_input',native_bytes_verified:false,gates_closed:[],
    characterization_verified:true,characterization_only:true,exact_pass:false,
    output_identity_exact:cells.every(cell=>cell.unchanged),general_integer_precision_guarantee:false,cells};
}

export async function runJavascriptPublicCodeLive({page,prepared,input,targetOrigin,redactor,record,
  report,save,deadline,onPending,schemaMode='code',probeId=null}) {
  need(['code','declared'].includes(schemaMode),'Public JavaScript schema mode unavailable');
  const key=schemaMode==='declared'?'public_declared':'public_code';
  const stage=schemaMode==='declared'?'public-declared':'public-code';
  const probe=javascriptPublicCodeProbe(probeId,schemaMode);
  const remaining=deadline-Date.now()-60000;
  need(remaining>=600000,'Public Code lifecycle requires original time budget');
  const inputProof=verifyJavascriptPublicCodeInput(probe,input);
  if(inputProof.native_input_bytes_verified){
    const acknowledged=await record({phase:'javascript_public_native_input_verified',proof:inputProof});
    need(JSON.stringify(acknowledged.proof)===JSON.stringify(inputProof),'Public Code native baseline ACK differs');
  }
  const base=createCandidateNodeSupport({targetOrigin,targetBuild:'7.4.2'});
  const code=createJavascriptCodeNodeSupport({targetOrigin,targetBuild:'7.4.2',redactor});
  const runtime=createActionRuntime({pinned:await javascriptPublicCodePins(),
    allowCandidate:true,targetOrigin,targetBuild:'7.4.2',redactor,onRecord:record,
    execute:source=>Function('return ('+source+')')()(page),
    nodeApplyHandlers:new Map([...base.nodeApplyHandlers,...code.nodeApplyHandlers]),
    nodeApplyDriverFactory:options=>options.operation.parameters.target.type==='programming.javascript'
      ?code.nodeApplyDriverFactory(options):base.nodeApplyDriverFactory(options)});
  const request=javascriptPublicCodeRequest({prepared,input,probe,schemaMode,remaining});
  Object.assign(report,{scope:'isolated public '+(probeId===null?(schemaMode==='code'?'C Code':'D declared'):'E typed '+probeId)+' lifecycle; full typed UI output',
    original_deadline:deadline,explicit_execution_limit:2,gates_closed:[],candidate_verified:false,
    cli_verified:false,native_bytes_verified:false,native_input_bytes_verified:inputProof.native_input_bytes_verified,stage:stage+'-apply',
    [key]:{status:'RUNNING',probe_id:probe.id,operation_id:request.operation_id,target_kind:'new',
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
  const oracle=javascriptPublicCodeOracle(probe,table,input);
  need(oracle.gate_passed===true||oracle.characterization_verified===true&&oracle.characterization_only===true&&oracle.exact_pass===false,
    'Public Code full business oracle/characterization differs');
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
