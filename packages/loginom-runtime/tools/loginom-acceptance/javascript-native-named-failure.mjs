import {javascriptCalibrationCase,javascriptCalibrationIds,calibrationDiagnostic} from './javascript-calibration-cases.mjs';
import {verifyJavascriptIntegerInput,verifyJavascriptNamedInput} from './javascript-native-named-contract.mjs';
import {javascriptNamedCase} from './javascript-native-named-cases.mjs';
import {verifyNativeRoundtripRead} from './javascript-native-roundtrip-contract.mjs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';

const failureCase=id=>javascriptCalibrationIds.includes(id)?javascriptCalibrationCase(id):javascriptNamedCase(id);
const caseField=id=>javascriptCalibrationIds.includes(id)?'calibration_id':'named_case_id';
const need=(v,m)=>{if(!v)throw Error('Native named failure: '+m);};
export function verifyNamedFailedExecution(execution,node,caseId){
 const fixture=failureCase(caseId),same=n=>['document_id','workflow_id','node_id'].every(k=>typeof node[k]==='string'&&node[k]&&n?.[k]===node[k]);
 need(execution?.verified===true&&execution.status==='failed'&&execution.failure_verified===true
  &&execution.owner_verified===true&&execution.cleanup_complete===true&&execution.output_refreshed===false
  &&execution.ownership_source==='native_process_model_identity_and_show_node'&&execution.error_source==='native_child_error_details'
  &&execution.error?.code==='NODE_EXECUTION_FAILED'&&typeof execution.error.message==='string'&&execution.error.message.trim().length>0
  &&execution.error.message.length<=1000&&same(execution.node),'owned failed child and ErrorDetails required');
 need(execution.trial?.phase==='initial'&&execution.trial.node_id===node.node_id&&execution.trial.source_sha256===fixture.source_sha256
  &&same(execution.fresh_baseline?.node)&&Array.isArray(execution.fresh_baseline.roots)
  &&typeof execution.root_id==='string'&&execution.root_id===execution.fresh_baseline.root_id
  &&typeof execution.group_id==='string'&&/^[1-9][0-9]*$/.test(execution.group_id)
  &&typeof execution.group_record_id==='string'&&execution.group_record_id
  &&typeof execution.process_id==='string'&&execution.process_id.startsWith(execution.group_id+'.')
  &&typeof execution.process_record_id==='string'&&execution.process_record_id
  &&execution.execution_id===node.document_id+':'+execution.root_id+':'+execution.group_id
  &&same(execution.launch_identity?.node)&&execution.launch_identity.execution_id===execution.execution_id
  &&execution.launch_identity.root_id===execution.root_id&&execution.launch_identity.group_id===execution.group_id
  &&execution.launch_identity.group_record_id===execution.group_record_id
  &&!execution.fresh_baseline.roots.some(p=>p.process_id===execution.group_id),'fresh fixed-source failed execution required');
 return execution;
}

// Page-local failed capability, separate from the completed owner. The original
// capability retains its Done seal; no failed process becomes a completed one.
export function sealJavascriptNamedFailure({named_case_id,calibration_id,source,source_sha256,execution}){
 const need=(v,m)=>{if(!v)throw Error('Named failed owner: '+m);};
 const pins={"A-get-index":"ade8e3b5195f4c6cd81c09ced0836e909d1ad037b99b40ac152805630ffd8782","A-get-exact":"6befc43d503c85db5063fe2ae128cdbfc52db37f26cf449610639e3280079ab5","A-getcolumn-index":"bb2b3bbd7adf0204483b9a3367ba1506f2fc4fd9b89d45ce9381147ac8868766","A-getcolumn-exact":"ddda422a0d6a06aa08ad0743fdfb616f18641e232aaa5b9921d8b752aa777ee1","A-columns-index":"5410965b02be2a044a1973b31ca2290d60ee935a817109329728a4fa21021032","A-columns-exact":"752e74be9ab4fb53adece872ec1492ee7fd761f4ec086229187965120eec902e","A-isnull-index":"1ab38e09307a876f96b6e3b83e2a46f3b34da9cb4f90a759413cd4d36dd0dc98","A-isnull-exact":"57ceade9570a31dc76f0e2a94e514c1ad7d4474470467ba69649d3dc2b4fb34c","B-get-case":"ca569c1320bf7c160803b9031524feaadf4adecf87f1bd00ee4eff043599c505","B-get-missing":"8e2ed7bf78ccb567121f257dc43058dddc284ef7384df4a45eeabdbfa0e7329c","B-getcolumn-case":"08054f2f62477f665c8b92bd0414755dc0e66e3ba8008439aa05d28500c3eb30","B-getcolumn-missing":"4832a8582d5af517d8f60c2a2c8499ce8b4c131a3ba78b952bcd3f9dfd3f038d","B-columns-case":"d60e2aa72f3585e87c09073c0c002cc465846b39a146f719c494276f8271cc19","B-columns-missing":"13c5ccc3c6aec7723b5401b1853ee4d2f343444a566e0d37a7f520e4173e766f","B-isnull-case":"dc8be58b76ab183e2b3be3921886a2bac1fc37eb0ea30470d763c37522cf4c1b","B-isnull-missing":"7133ef6538cd9f2d09e652df0eafcdba8fe89d8619b8a8be22fa898368b577c4"};
 const calibration=calibration_id!==undefined;
 const key=calibration?'calibration_id':'named_case_id',id=calibration?calibration_id:named_case_id;
 const calPins={'K1-parse-v1':'721161cd4f4c0de387cefeef03b2425fd20f5645c05bff724103e330acd1620f','K2-sync-v1':'3f7350f5f9e7cb30107fb314643ae844477a7b87610132036e995f556fe983c2','K3-shift-v1':'02b7e36c08e2d1f18fe83e60ed145d00bef83746fbe14b1328b1b6ba91ab76b3'};
 need(!calibration||named_case_id===undefined,'separate calibration identity');
 const admitted=calibration?calPins:pins;
 const s=globalThis.__loginomJavascriptNativeRoundtripV1;
 need(!globalThis.__loginomJavascriptNamedFailureV1&&s?.document===document&&s.stage==='done-sealed'
  &&Object.hasOwn(admitted,id)&&admitted[id]===source_sha256&&s[key]===id&&s.named_case_id===named_case_id&&s.calibration_id===calibration_id&&s.input_fixture_id==='integer-safe'&&s.fixture_id==='integer-safe'
  &&s.source===source&&s.source_sha256===source_sha256&&s.schema_mode==='code'
  &&s.done?.status==='sealed'&&s.done.node_id===s.node.FGuid&&s.done.source===source&&s.done.source_sha256===source_sha256
  &&!s.execution&&!s.executionWitness&&s.bindings.size===0,'one fixed-source failed admission');
 const checkOwner=s.check,checkGraph=s.checkGraph,checkSource=s.sourceWitness.verify,done=s.done;
 const inputRead=globalThis.__loginomJavascriptNativeInputReadV1,inputLast=inputRead?.last;
 const nativeRead=globalThis.__loginomJavascriptNativeRoundtripReadV1;
 need(!nativeRead||nativeRead.document===document&&!nativeRead.poisoned&&!nativeRead.active&&!nativeRead.last,'unused failed native reader');
 checkOwner();
 const node=s.node,nodeData=node.data,root=s.input.processRoot,store=s.input.processStore;
 const same=n=>n?.document_id===s.binding.document_id&&n.workflow_id===s.binding.workflow_id&&n.node_id===node.FGuid;
 need(execution?.verified===true&&execution.status==='failed'&&execution.failure_verified===true&&execution.owner_verified===true
  &&execution.cleanup_complete===true&&execution.output_refreshed===false&&same(execution.node)
  &&execution.ownership_source==='native_process_model_identity_and_show_node'&&execution.error_source==='native_child_error_details'
  &&execution.error?.code==='NODE_EXECUTION_FAILED'&&execution.trial?.phase==='initial'
  &&execution.trial.node_id===node.FGuid&&execution.trial.source_sha256===source_sha256
  &&same(execution.fresh_baseline?.node)&&Array.isArray(execution.fresh_baseline.roots)
  &&execution.root_id===String(root.internalId)&&execution.fresh_baseline.root_id===execution.root_id
  &&execution.execution_id===s.binding.document_id+':'+execution.root_id+':'+execution.group_id
  &&same(execution.launch_identity?.node)&&execution.launch_identity.execution_id===execution.execution_id
  &&execution.launch_identity.root_id===execution.root_id&&execution.launch_identity.group_id===execution.group_id
  &&execution.launch_identity.group_record_id===execution.group_record_id
  &&!execution.fresh_baseline.roots.some(p=>p.process_id===execution.group_id),'fresh native failed receipt');
 const records=[...s.upstream()],groups=records.filter(r=>String(r.data.id)===execution.group_id&&String(r.internalId)===execution.group_record_id);
 need(groups.length===1&&root.childNodes.includes(groups[0]),'direct failed group');
 const group=groups[0],children=group.childNodes.filter(r=>r.data.ModelNode===nodeData);
 need(records.filter(r=>r.data.ModelNode===nodeData).length===1
  &&new Set(records.map(r=>String(r.data.id))).size===records.length
  &&new Set(records.map(r=>String(r.internalId))).size===records.length,'unique failed child and process inventory');
 need(children.length===1&&String(children[0].data.id)===execution.process_id&&String(children[0].internalId)===execution.process_record_id
  &&execution.process_id.startsWith(execution.group_id+'.'),'exact native failed child');
 const child=children[0],childData=child.data,groupData=group.data;
 const details=childData.ErrorDetails;
 need(typeof details==='string'&&details.trim().length>0&&(calibration||details.length<=1000)&&details.trim().slice(0,1000)===execution.error.message,'complete native child ErrorDetails');
 const failed=r=>{
  const tokens=typeof r.data.ProgressBarCls==='string'?r.data.ProgressBarCls.trim().split(/\s+/).filter(x=>x.startsWith('bg-progress-ptps')):[];
  return r.data.Status!==3&&tokens.length===1&&tokens[0]==='bg-progress-ptpsError'&&r.data.CanCancelProcess===false
   &&typeof r.data.ErrorDetails==='string'&&r.data.ErrorDetails.trim().length>0&&!r.data.loading;
 };
 const fingerprint=rs=>JSON.stringify(rs.map(r=>[r.internalId,r.data.id,r.data.Status,r.data.ErrorDetails,r.data.ProgressBarCls,r.data.CanCancelProcess,r.data.loaded,r.data.ModelNode===nodeData,
  (r.childNodes??[]).map(c=>c.internalId)]));
 const history=fingerprint(records),jsStatus=node.FStatus;
 const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
 const proof=freeze({contract:calibration?'javascript-native-calibration-failed-terminal-1':'javascript-native-named-failed-terminal-1',[key]:id,input_fixture_id:'integer-safe',source,source_sha256,
  node:{document_id:s.binding.document_id,workflow_id:s.binding.workflow_id,node_id:node.FGuid},
  execution:JSON.parse(JSON.stringify(execution)),error_details:calibration?details.slice(0,1000):details,...(calibration?{native_text_length:details.length,receipt_text:details.trim().slice(0,1000)}:{}),output_status:'not_read_failed_execution',
  native_owner_verified:true,native_error_complete:details.length<=1000});
 const cap={document,roundtrip:s,proof,check:null,checkIdle:null};
 const check=()=>{
  need(globalThis.__loginomJavascriptNamedFailureV1===cap&&cap.proof===proof&&cap.check===check&&cap.checkIdle===checkIdle
   &&globalThis.__loginomJavascriptNativeRoundtripV1===s&&s.stage==='done-sealed'&&!s.execution&&!s.executionWitness
   &&s.check===checkOwner&&s.checkGraph===checkGraph&&s.sourceWitness.verify===checkSource&&s.done===done
   &&s.source===source&&s.source_sha256===source_sha256&&s.named_case_id===named_case_id&&s.calibration_id===calibration_id&&s.input_fixture_id==='integer-safe'&&s.fixture_id==='integer-safe'&&!s.bindings.has('output'),'failed capability/source replaced or OUTPUT requested');
  checkOwner();
  need(node===s.node&&node.data===nodeData&&node.FRunning===false&&node.FStatus===jsStatus
   &&store===s.input.processStore&&store.getRoot()===root&&!store.isLoading()&&root.data.loaded===true
   &&group.data===groupData&&child.data===childData&&root.childNodes.includes(group)
   &&group.childNodes.includes(child)&&group.childNodes.filter(r=>r.data.ModelNode===nodeData).length===1
   &&groupData.loaded===true&&childData.ModelNode===nodeData&&failed(group)&&failed(child)
   &&childData.ErrorDetails===details&&fingerprint([...s.upstream()])===history,'failed child/group/history changed');
 };
 const checkIdle=()=>{
  check();
  need(globalThis.__loginomJavascriptNativeInputReadV1===inputRead&&inputRead.document===document&&!inputRead.poisoned&&!inputRead.active
   &&inputRead.last===inputLast&&inputLast.id===s.binding.read_id&&inputLast.status==='completed'&&inputLast.published===true
   &&inputLast.pending===0&&inputLast.requests===s.input.count&&inputLast.releasedRequests===s.input.count&&inputLast.releasedResponses===s.input.count,'original INPUT lifecycle changed');
  const read=globalThis.__loginomJavascriptNativeRoundtripReadV1;
  if(read)need(read.document===document&&!read.poisoned&&!read.active&&(!read.last||read.last.status==='completed'&&read.last.published===true
   &&read.last.pending===0&&read.last.id===s.bindings.get('upstream')?.readId&&read.last.requests===s.input.count
   &&read.last.releasedRequests===s.input.count&&read.last.releasedResponses===s.input.count),'failed upstream lifecycle not idle/released');
 };
 cap.check=check;cap.checkIdle=checkIdle;Object.freeze(cap);
 globalThis.__loginomJavascriptNamedFailureV1=cap;
 checkIdle();
 // One-way reservation. Existing completed owner cannot reuse this wizard seal.
 Object.defineProperties(s,{stage:{value:'done-sealed',writable:false,configurable:false},execution:{value:undefined,writable:false,configurable:false},executionWitness:{value:undefined,writable:false,configurable:false}});
 return proof;
}

export function verifyNamedFailureWitness(proof,execution,node,caseId){
 const fixture=failureCase(caseId);
 verifyNamedFailedExecution(execution,node,caseId);
 const calibration=caseField(caseId)==='calibration_id';
 need(proof?.contract===(calibration?'javascript-native-calibration-failed-terminal-1':'javascript-native-named-failed-terminal-1')&&proof[caseField(caseId)]===caseId
  &&proof[calibration?'named_case_id':'calibration_id']===undefined&&proof.input_fixture_id==='integer-safe'
  &&proof.source===fixture.source&&proof.source_sha256===fixture.source_sha256
  &&JSON.stringify(proof.execution)===JSON.stringify(execution)&&['document_id','workflow_id','node_id'].every(k=>proof.node?.[k]===node[k])
  &&proof.native_owner_verified===true&&(calibration||proof.native_error_complete===true)&&proof.output_status==='not_read_failed_execution'
  &&typeof proof.error_details==='string'&&(calibration?proof.receipt_text:proof.error_details.trim())===execution.error.message&&proof.error_details.length<=1000,'failed witness differs');
 if(calibration){
  calibrationDiagnostic(proof,caseId);
  need(proof.native_error_complete?proof.error_details.trim()===proof.receipt_text
   :proof.receipt_text.startsWith(proof.error_details.trim()),'bounded raw and receipt differ');
 }
 return proof;
}

export function verifyNamedFailureOutcome({before,failed,upstream,output},caseId){
 need(output?.status==='not_read_failed_execution'&&Object.keys(output).length===1,'failed OUTPUT must not be read');
 verifyNamedFailureWitness(failed,failed.execution,failed.node,caseId);
 const calibration=caseField(caseId)==='calibration_id';
 const input={node:{node_id:before.binding.node_id},table:{port_guid:before.binding.port_guid},native_input:{native:before}};
 if(calibration)verifyJavascriptIntegerInput(input);else verifyJavascriptNamedInput(input,caseId);
 need(upstream.binding[caseField(caseId)]===caseId&&upstream.binding.input_fixture_id==='integer-safe','failed upstream selected case');
 need(['document_id','workflow_id'].every(k=>failed.node[k]===before.binding[k])&&failed.node.node_id!==before.binding.node_id,'failed/import scope');
 need(JSON.stringify(upstream.binding.failed_terminal)===JSON.stringify(failed),'upstream failed-terminal association');
 const exact=verifyNativeRoundtripRead(upstream.raw,{binding:upstream.binding,lifecycle:upstream.lifecycle,input:before,role:'upstream'});
 need(JSON.stringify(exact)===JSON.stringify(upstream.exact),'stored failed upstream proof differs');
 if(calibration)return freezeCivilEvidence({calibration_id:caseId,status:'owned_calibration_failure',input_exact:true,upstream_exact:true,
  output_status:'not_read_failed_execution',source_sha256:failed.source_sha256,failed_execution_id:failed.execution.execution_id,
  ...calibrationDiagnostic(failed,caseId)});
 // Source line alone cannot establish engine line mapping. Until separately
 // observed mapping is admitted, even an owned runtime failure is incomplete.
 return freezeCivilEvidence({named_case_id:caseId,status:'owned_execution_failure_unattributed',case_complete:false,
  characterization_only:true,exact_pass:false,g5_complete:false,general_integer_precision_guarantee:false,
  input_exact:true,upstream_exact:true,output_status:'not_read_failed_execution',rejection_attributed:false,
  reason:'runtime_source_position_mapping_unverified',failed_execution_id:failed.execution.execution_id});
}
