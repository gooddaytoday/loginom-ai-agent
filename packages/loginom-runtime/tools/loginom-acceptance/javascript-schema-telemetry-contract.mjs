import {javascriptTelemetryCase,javascriptTelemetryProbe,requireJavascriptTelemetryMode} from './javascript-schema-telemetry-cases.mjs';
import {verifyJavascriptIntegerInput} from './javascript-native-named-contract.mjs';
import {verifyNativeRoundtripExecution} from './javascript-native-roundtrip-contract.mjs';
import {verifyNativeFixtureCells} from './javascript-native-input-contract.mjs';
import {adaptRead} from '../../client/lib/variant-native-values.mjs';
const need=(v,m)=>{if(!v)throw Error('Schema telemetry: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const metadataEqual=(a,b)=>a.every((field,i)=>['index','name','display_name','data_type'].every(k=>field[k]===b[i][k]));
const keys=(v,expected)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===expected.length&&expected.every(k=>Object.hasOwn(v,k));
export function parseJavascriptTelemetry(text,caseId){
 javascriptTelemetryCase(caseId);
 need(typeof text==='string'&&Buffer.byteLength(text,'utf8')<=8192,'UTF-8 JSON bound');
 const value=JSON.parse(text);
 // JSON.parse first proves grammar. Scan string tokens to retain repeated object keys,
 // including escaped aliases; a reviver cannot see keys already overwritten by parse.
 const stack=[];
 for(const token of text.matchAll(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\]]/g)){
  const word=token[0];
  if(word==='{'){stack.push(new Set());continue;}
  if(word==='['){stack.push(null);continue;}
  if(word==='}'||word===']'){stack.pop();continue;}
  if(/^\s*:/.test(text.slice(token.index+word.length))){
   const key=JSON.parse(word),seen=stack.at(-1);
   need(seen&&!seen.has(key),'duplicate JSON property');seen.add(key);
  }
 }
 need(keys(value,['version','probe_id','column_count','before','after'])&&value.version===1&&value.probe_id===caseId&&value.column_count===2,'closed telemetry envelope');
 for(const phase of ['before','after']){
  need(Array.isArray(value[phase])&&value[phase].length===2,'two metadata fields');
  value[phase].forEach((field,index)=>{
   need(keys(field,['index','name','display_name','data_type'])&&field.index===index&&!Object.is(field.index,-0)&&field.data_type===(index===0?4:5),'metadata index/type/keys');
   for(const key of ['name','display_name'])need(typeof field[key]==='string'&&field[key].length<=128&&Buffer.byteLength(field[key],'utf8')<=512,'metadata string bound');
  });
 }
 return value;
}
export function verifyJavascriptTelemetryRead(raw,{binding,lifecycle,input,role}){
 const c=javascriptTelemetryCase(binding.telemetry_case_id),probe=javascriptTelemetryProbe(c.id);
 requireJavascriptTelemetryMode(c.id,{namedCaseId:binding.named_case_id,calibrationId:binding.calibration_id});
 need(raw.named_case_id===undefined&&raw.calibration_id===undefined&&raw.telemetry_case_id===c.id&&raw.input_fixture_id==='integer-safe'&&raw.source_sha256===probe.source_sha256,'raw identity');
 need(binding.fixture_id==='integer-safe'&&binding.input_fixture_id==='integer-safe','input fixture');
 verifyJavascriptIntegerInput({node:{node_id:input.binding.node_id},table:{port_guid:input.binding.port_guid},native_input:{native:input}});
 need(['output','upstream'].includes(role)&&binding.roundtrip_role===role&&binding.source_sha256===probe.source_sha256,'role/source');
 need(['document_id','workflow_id','package_id'].every(k=>binding[k]===input.binding[k]),'scope');
 need(binding.execution?.status==='completed'&&binding.completed_child?.execution_id===binding.execution.execution_id
  &&['group_id','process_id','process_record_id'].every(k=>binding.execution[k]===undefined||binding.execution[k]===binding.completed_child[k]),'completed child');
 if(role==='output'){
  need(binding.failed_terminal===undefined&&binding.node_id!==input.binding.node_id&&binding.javascript_node_id===binding.node_id,'output owner');
  need(binding.physical_schema_provenance==='Preview cache'&&binding.bridge_verified===false,'physical provenance');
  verifyNativeRoundtripExecution(binding.completed_child,binding,'integer-safe',undefined,c.id);
 }
 if(role==='upstream')need(binding.node_id===input.binding.node_id&&binding.port_guid===input.binding.port_guid&&same(binding.source,input.binding.source)&&same(binding.completed_child,input.binding.completed_child),'original upstream');
 const exact=adaptRead(raw,{expected:binding,lifecycle,consistency:{kind:'observed_local',changed:false,exclusive_operation:true,stability_basis:'owned_static_completed_fixture'}});
 need(exact.coverage.table_complete,'complete table');
 let observation;
 if(role==='upstream'){
  verifyNativeFixtureCells(exact,'integer-safe');
  need(same(exact.schema,[{name:'Value',label:'Value',type:'integer',index:0}])&&exact.cells.length===4
   &&exact.cells.every((cell,i)=>cell.row===i&&cell.column===0&&cell.value===input.exact.cells[i].value&&cell.is_null===input.exact.cells[i].is_null&&same(cell.native,input.exact.cells[i].native)),'upstream exact bytes');
 }
 if(role==='output'){
  need(exact.row_count===1&&exact.schema.length===2&&exact.cells.length===2&&exact.schema.every((f,i)=>f.index===i&&f.type===(i===0?'integer':'string')),'1 row x 2 fields');
  const [integer,string]=exact.cells;
  need(integer.row===0&&integer.column===0&&integer.type==='integer'&&integer.cell_type==='integer'&&!integer.is_null&&integer.value==='-9007199254740991'
   &&integer.decimal===integer.value&&integer.precision==='exact_native'&&integer.representation==='decimal_integer'
   &&same(integer.native,{tag:20,encoding:'signed-int64-le',bytes_le:'010000000000e0ff',bits:64}),'independent Integer bytes');
  need(string.row===0&&string.column===1&&string.type==='string'&&string.cell_type==='string'&&!string.is_null&&string.representation==='native_string'&&string.precision==='exact_native','native String');
  const telemetry=parseJavascriptTelemetry(string.value,c.id);
  const physical=exact.schema.map((field,index)=>({index,name:field.name,display_name:field.label,data_type:index===0?4:5}));
  physical.forEach(f=>{for(const k of ['name','display_name'])need(typeof f[k]==='string'&&f[k].length<=128&&Buffer.byteLength(f[k],'utf8')<=512,'physical string bound');});
  observation={code_side:telemetry,physical_schema:physical,physical_schema_provenance:'Preview cache',bridge_verified:false,
   comparisons:{before_after_equal:metadataEqual(telemetry.before,telemetry.after),before_physical_equal:metadataEqual(telemetry.before,physical),after_physical_equal:metadataEqual(telemetry.after,physical)},
   atomic_snapshot_verified:false,aba_excluded:false,persisted_schema_verified:false};
 }
 return {...exact,contract:'javascript-schema-telemetry-read-1',telemetry_case_id:c.id,input_fixture_id:'integer-safe',role,source_sha256:probe.source_sha256,input_read_id:input.raw.read_id,g5_complete:false,...(observation?{observation}:{})};
}
export function verifyJavascriptTelemetryOutcome(results,caseId){
 javascriptTelemetryCase(caseId);need(!results.failed,'failed execution is not characterization');
 const before=verifyJavascriptIntegerInput({node:{node_id:results.before.binding.node_id},table:{port_guid:results.before.binding.port_guid},native_input:{native:results.before}});
 for(const role of ['output','upstream']){
  const proof=results[role];need(proof.binding.telemetry_case_id===caseId,'case identity');
  need(same(verifyJavascriptTelemetryRead(proof.raw,{...proof,input:before,role}),proof.exact),'stored proof differs');
 }
 need(results.upstream.binding.javascript_node_id===results.output.binding.node_id,'same JS owner');
 return {telemetry_case_id:caseId,status:'schema_telemetry_observed',input_exact:true,upstream_exact:true,integer_exact:true,
  observation:structuredClone(results.output.exact.observation),evidence_status:'native_proofs_verified_pending_cleanup_and_persistence',
  characterization_only:true,bridge_verified:false,g5_complete:false,public_handler_accepted:false,cli_accepted:false};
}
