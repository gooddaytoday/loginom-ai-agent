import {javascriptCalibrationCase} from './javascript-calibration-cases.mjs';
import {verifyJavascriptIntegerInput} from './javascript-native-named-contract.mjs';
import {verifyNativeFixtureCells} from './javascript-native-input-contract.mjs';
import {adaptRead} from '../../client/lib/variant-native-values.mjs';
const need=(v,m)=>{if(!v)throw Error('Calibration upstream: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function verifyCalibrationUpstream(raw,{binding,lifecycle,input,role}){
 const c=javascriptCalibrationCase(binding.calibration_id);
 need(binding.named_case_id===undefined&&raw.named_case_id===undefined&&raw.calibration_id===c.calibration_id
  &&binding.fixture_id==='integer-safe'&&binding.input_fixture_id==='integer-safe'&&raw.input_fixture_id==='integer-safe'
  &&binding.source_sha256===c.source_sha256&&raw.source_sha256===c.source_sha256,'closed identity/source');
 need(role==='upstream'&&binding.roundtrip_role==='upstream'&&binding.failed_terminal?.calibration_id===c.calibration_id
  &&binding.failed_terminal.source===c.source&&binding.failed_terminal.source_sha256===c.source_sha256,'failed upstream only');
 verifyJavascriptIntegerInput({node:{node_id:input.binding.node_id},table:{port_guid:input.binding.port_guid},native_input:{native:input}});
 need(['document_id','workflow_id','package_id','node_id','port_guid'].every(k=>binding[k]===input.binding[k])
  &&same(binding.source,input.binding.source)&&same(binding.completed_child,input.binding.completed_child)
  &&binding.execution?.status==='completed'&&binding.execution.execution_id===input.binding.completed_child.execution_id
  &&['group_id','process_id','process_record_id'].every(k=>binding.execution[k]===undefined||binding.execution[k]===input.binding.completed_child[k]),'original import owner/execution');
 const exact=adaptRead(raw,{expected:binding,lifecycle,consistency:{kind:'observed_local',changed:false,exclusive_operation:true,stability_basis:'owned_static_completed_fixture'}});
 need(exact.coverage.table_complete&&exact.row_count===4&&exact.cells.length===4
  &&same(exact.schema,[{name:'Value',label:'Value',type:'integer',index:0}]),'exact Integer4 schema');
 verifyNativeFixtureCells(exact,'integer-safe');
 need(exact.cells.every((cell,i)=>cell.row===i&&cell.column===0&&cell.value===input.exact.cells[i].value
  &&cell.is_null===input.exact.cells[i].is_null&&same(cell.native,input.exact.cells[i].native)),'upstream unchanged');
 return {...exact,contract:'javascript-calibration-upstream-1',calibration_id:c.calibration_id,source_sha256:c.source_sha256,
  role,input_read_id:input.raw.read_id,g5_complete:false};
}
