import {javascriptNamedCase,javascriptNamedProbe} from './javascript-native-named-cases.mjs';
import {verifyNativeInputRead,verifyNativeFixtureCells} from './javascript-native-input-contract.mjs';
import {verifyNativeRoundtripInput,verifyNativeRoundtripExecution} from './javascript-native-roundtrip-contract.mjs';
import {adaptRead} from '../../client/lib/variant-native-values.mjs';
const need=(v,m)=>{if(!v)throw Error('Named native contract: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function verifyJavascriptNamedInput(input,caseId){
 javascriptNamedCase(caseId);
 return verifyJavascriptIntegerInput(input);
}
export function verifyJavascriptIntegerInput(input){
 need(input?.native_input?.native?.binding?.fixture_id==='integer-safe','immutable integer-safe input');
 const before=verifyNativeRoundtripInput(input,'integer-safe');
 const exact=verifyNativeInputRead(before.raw,{binding:before.binding,lifecycle:before.lifecycle,provenance:before.exact.provenance});
 need(same(exact,before.exact),'stored pre-JS input differs');
 need(before.binding.completed_child?.verified===true&&before.binding.completed_child.owner_verified===true
  &&before.binding.completed_child.cleanup_complete===true&&before.binding.completed_child.status==='completed'
  &&before.binding.execution.execution_id===before.binding.completed_child.execution_id
  &&['execution_id','group_id','process_id','process_record_id'].every(k=>before.binding.completed_child[k]===exact.provenance.execution[k]),'original complete input child');
 return before;
}
export function verifyJavascriptNamedRead(raw,{binding,lifecycle,input,role}){
 const c=javascriptNamedCase(binding.named_case_id),probe=javascriptNamedProbe(c.id);
 need(raw.named_case_id===c.id&&raw.input_fixture_id===c.input_fixture_id&&raw.source_sha256===probe.source_sha256,'raw named/source identity');
 need(binding.fixture_id===c.input_fixture_id&&binding.input_fixture_id===c.input_fixture_id,'read input fixture identity');
 verifyJavascriptNamedInput({node:{node_id:input.binding.node_id},table:{port_guid:input.binding.port_guid},native_input:{native:input}},c.id);
 need(['output','upstream'].includes(role)&&binding.roundtrip_role===role&&binding.source_sha256===probe.source_sha256,'role/source identity');
 need(['document_id','workflow_id','package_id'].every(k=>binding[k]===input.binding[k]),'read scope');
 need(binding.execution?.status==='completed'&&binding.completed_child?.execution_id===binding.execution.execution_id
  &&['group_id','process_id','process_record_id'].every(k=>binding.execution[k]===undefined||binding.execution[k]===binding.completed_child[k]),'completed child association');
 if(role==='output'){
  need(binding.failed_terminal===undefined&&binding.node_id!==input.binding.node_id&&binding.javascript_node_id===binding.node_id,'own completed JS output');
  verifyNativeRoundtripExecution(binding.completed_child,binding,c.input_fixture_id,c.id);
 }
 if(role==='upstream')need(binding.node_id===input.binding.node_id&&binding.port_guid===input.binding.port_guid
  &&same(binding.source,input.binding.source)&&same(binding.completed_child,input.binding.completed_child),'original upstream identity/child');
 const exact=adaptRead(raw,{expected:binding,lifecycle,consistency:{kind:'observed_local',changed:false,exclusive_operation:true,stability_basis:'owned_static_completed_fixture'}});
 const rows=role==='output'?(c.output_rows??4):4;
 need(exact.coverage.table_complete&&exact.row_count===rows&&exact.cells.length===rows
  &&same(exact.schema,[{name:'Value',label:'Value',type:'integer',index:0}]),'complete fixed Value/Integer schema/count');
 if(role==='upstream'||c.oracle==='copy'){
  verifyNativeFixtureCells(exact,'integer-safe');
  need(exact.cells.every((cell,i)=>cell.row===i&&cell.column===0&&cell.value===input.exact.cells[i].value
   &&cell.is_null===input.exact.cells[i].is_null&&same(cell.native,input.exact.cells[i].native)),'exact copy/upstream differs');
 }
 if(role==='output'&&c.oracle==='isnull')need(exact.cells.every((cell,i)=>cell.row===i&&cell.column===0&&cell.type==='integer'
  &&cell.cell_type==='integer'&&cell.is_null===false&&cell.precision==='exact_native'&&cell.representation==='decimal_integer'
  &&cell.value===(i===0?'1':'0')&&cell.decimal===cell.value
  &&same(cell.native,{tag:20,encoding:'signed-int64-le',bytes_le:i===0?'0100000000000000':'0000000000000000',bits:64})),'independent IsNull vector differs');
 if(role==='output'&&['set-exact','set-value'].includes(c.oracle))need(exact.cells.every(cell=>cell.row===0&&cell.column===0&&cell.type==='integer'
  &&cell.precision==='exact_native'&&(cell.cell_type==='null'&&cell.is_null===true&&cell.value===null
   &&cell.representation==='native_null'&&same(cell.native,{tag:1,encoding:'null'})
   ||cell.cell_type==='integer'&&cell.is_null===false&&cell.representation==='decimal_integer'&&cell.decimal===cell.value
   &&cell.native?.tag===20&&cell.native.encoding==='signed-int64-le'&&cell.native.bits===64)),'one native int64 or NULL Set observation required');
 if(role==='output'&&c.output_rows===1&&!['set-exact','set-value'].includes(c.oracle))need(exact.cells.every(cell=>cell.row===0&&cell.column===0&&cell.type==='integer'
  &&cell.cell_type==='integer'&&cell.is_null===false&&cell.precision==='exact_native'&&cell.representation==='decimal_integer'
  &&cell.decimal===cell.value&&cell.native?.tag===20&&cell.native.encoding==='signed-int64-le'&&cell.native.bits===64),'non-NULL native Integer marker required');
 return {...exact,contract:'javascript-native-named-read-1',named_case_id:c.id,input_fixture_id:c.input_fixture_id,
  role,source_sha256:probe.source_sha256,input_read_id:input.raw.read_id,g5_complete:false};
}
export function verifyJavascriptNamedOutcome(results,caseId){
 const c=javascriptNamedCase(caseId),before=verifyJavascriptNamedInput({node:{node_id:results.before.binding.node_id},table:{port_guid:results.before.binding.port_guid},native_input:{native:results.before}},caseId);
 need(!results.failed,'failed execution cannot use success oracle');
 for(const role of ['output','upstream']){
  const proof=results[role];need(proof.binding.named_case_id===caseId,'selected case differs');
  const exact=verifyJavascriptNamedRead(proof.raw,{...proof,input:before,role});
  need(same(exact,proof.exact),'stored '+role+' proof differs');
 }
 need(results.upstream.binding.javascript_node_id===results.output.binding.node_id,'same JS owner before upstream');
 if(['set-exact','set-value'].includes(c.oracle)){
  const cell=results.output.exact.cells[0],strict=c.oracle==='set-exact';
  const candidate=cell.is_null===false&&cell.value==='-9007199254740991'&&cell.native.bytes_le==='010000000000e0ff';
  const sentinel=cell.is_null===false&&cell.value==='0'&&cell.native.bytes_le==='0000000000000000';
  return {named_case_id:caseId,input_fixture_id:c.input_fixture_id,
   status:strict?(candidate?'named_exact_case_observed':'observed_mismatch'):'characterized_value',oracle:c.oracle,
   execution_status:'completed',evidence_status:'native_proofs_verified_pending_cleanup_and_persistence',
   semantic_status:strict?(candidate?'PASS_EXACT_CASE':'OBSERVED_MISMATCH'):'CHARACTERIZED_VALUE',
   observed_cell:structuredClone(cell),value_observation:candidate?'candidate_written':sentinel?'sentinel_unchanged':'other_value',
   value_characterized:!strict,input_exact:true,upstream_exact:true,output_case_exact:strict&&candidate,
   output_identity_exact:false,exact_pass:strict&&candidate,characterization_only:!strict,rejection_attributed:false,
   g5_complete:false,public_handler_accepted:false,cli_accepted:false};
 }
 if(c.output_rows===1){
  const marker=results.output.exact.cells[0],allowed={'get-return':['10','11','12'],'column-return':['10','11','13'],'isnull-return':['10','11','14','15']}[c.oracle];
  need(Array.isArray(allowed),'fixed marker API');
  const bytes={'10':'0a00000000000000','11':'0b00000000000000','12':'0c00000000000000','13':'0d00000000000000','14':'0e00000000000000','15':'0f00000000000000'};
  const recognized=allowed.includes(marker.value)&&marker.native.bytes_le===bytes[marker.value];
  return {named_case_id:caseId,input_fixture_id:c.input_fixture_id,status:recognized?'characterized_return':'unresolved_unsupported_return',oracle:c.oracle,
   marker:marker.value,return_kind:recognized?{'10':'undefined','11':'null','12':'input_number','13':'matching_column','14':'true','15':'false'}[marker.value]:'unsupported',
   return_characterized:recognized,input_exact:true,upstream_exact:true,output_case_exact:false,output_identity_exact:false,exact_pass:false,
   characterization_only:true,rejection_attributed:false,g5_complete:false,public_handler_accepted:false,cli_accepted:false};
 }
 return {named_case_id:caseId,input_fixture_id:c.input_fixture_id,status:'named_exact_case_observed',oracle:c.oracle,
  input_exact:true,upstream_exact:true,output_case_exact:true,output_identity_exact:c.oracle==='copy',exact_pass:true,
  characterization_only:false,g5_complete:false,public_handler_accepted:false,cli_accepted:false};
}
