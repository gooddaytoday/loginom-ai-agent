import {javascriptCoercionCase} from './javascript-native-coercion-cases.mjs';
import {verifyNativeRoundtripInput,verifyNativeRoundtripRead} from './javascript-native-roundtrip-contract.mjs';
import {freezeCivilEvidence} from './javascript-native-datetime-civil.mjs';

const need=(v,m)=>{if(!v)throw Error('Native coercion failure: '+m);};
export function verifyCoercionFailedExecution(execution,node,fixtureId){
 const fixture=javascriptCoercionCase(fixtureId),same=n=>['document_id','workflow_id','node_id'].every(k=>typeof node[k]==='string'&&node[k]&&n?.[k]===node[k]);
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
export function sealJavascriptCoercionFailure({fixture_id,source,source_sha256,execution}){
 const need=(v,m)=>{if(!v)throw Error('Coercion failed owner: '+m);};
 const pins={
  'integer-coercion-fraction-positive':'6392d7bd6ecfb37351160aef70a94fa52f4786124daf2d14d789120292173e4e',
  'integer-coercion-fraction-negative':'c6cc020cb53965aec934f072c82ecc0ea5fcaebe0385b650adfa889e478a15fa',
  'integer-coercion-string-numeric':'263d9de6fa75ce6c1ac9379eabeca1114407998ec00c5ff6fcaffe4a001306c6',
  'integer-coercion-string-invalid':'cc7cbdfd0262956f66896395b8ad85e48879e8b5fac70a70be7bf21712b68fd2',
  'integer-coercion-nan':'e145174ca2472dab41c0d1433fd27c87aca7a2391459f04a0e579930ac7085ff',
  'integer-coercion-positive-infinity':'7cae6b72caeadcc28d7c6a87e4cf7b9eb2c94daf5901369d2f099a239e3cdf16',
  'integer-coercion-negative-infinity':'d75c797c0915f0796b267e9b9a46c99db29b192db3aa2e3ef7a4cc0efb04e2d1'
 };
 const s=globalThis.__loginomJavascriptNativeRoundtripV1;
 need(!globalThis.__loginomJavascriptCoercionFailureV1&&s?.document===document&&s.stage==='done-sealed'
  &&Object.hasOwn(pins,fixture_id)&&pins[fixture_id]===source_sha256&&s.fixture_id===fixture_id
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
 need(typeof details==='string'&&details.trim().length>0&&details.length<=1000&&details.trim()===execution.error.message,'complete native child ErrorDetails');
 const failed=r=>{
  const tokens=typeof r.data.ProgressBarCls==='string'?r.data.ProgressBarCls.trim().split(/\s+/).filter(x=>x.startsWith('bg-progress-ptps')):[];
  return r.data.Status!==3&&tokens.length===1&&tokens[0]==='bg-progress-ptpsError'&&r.data.CanCancelProcess===false
   &&typeof r.data.ErrorDetails==='string'&&r.data.ErrorDetails.trim().length>0&&!r.data.loading;
 };
 const fingerprint=rs=>JSON.stringify(rs.map(r=>[r.internalId,r.data.id,r.data.Status,r.data.ErrorDetails,r.data.ProgressBarCls,r.data.CanCancelProcess,r.data.loaded,r.data.ModelNode===nodeData,
  (r.childNodes??[]).map(c=>c.internalId)]));
 const history=fingerprint(records),jsStatus=node.FStatus;
 const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
 const proof=freeze({contract:'javascript-native-coercion-failed-terminal-1',fixture_id,source,source_sha256,
  node:{document_id:s.binding.document_id,workflow_id:s.binding.workflow_id,node_id:node.FGuid},
  execution:JSON.parse(JSON.stringify(execution)),error_details:details,output_status:'not_read_failed_execution',
  native_owner_verified:true,native_error_complete:true});
 const cap={document,roundtrip:s,proof,check:null,checkIdle:null};
 const check=()=>{
  need(globalThis.__loginomJavascriptCoercionFailureV1===cap&&cap.proof===proof&&cap.check===check&&cap.checkIdle===checkIdle
   &&globalThis.__loginomJavascriptNativeRoundtripV1===s&&s.stage==='done-sealed'&&!s.execution&&!s.executionWitness
   &&s.check===checkOwner&&s.checkGraph===checkGraph&&s.sourceWitness.verify===checkSource&&s.done===done
   &&s.source===source&&s.source_sha256===source_sha256&&s.fixture_id===fixture_id&&!s.bindings.has('output'),'failed capability/source replaced or OUTPUT requested');
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
 globalThis.__loginomJavascriptCoercionFailureV1=cap;
 checkIdle();
 // One-way reservation. Existing completed owner cannot reuse this wizard seal.
 Object.defineProperties(s,{stage:{value:'done-sealed',writable:false,configurable:false},execution:{value:undefined,writable:false,configurable:false},executionWitness:{value:undefined,writable:false,configurable:false}});
 return proof;
}

export function verifyCoercionFailureWitness(proof,execution,node,fixtureId){
 const fixture=javascriptCoercionCase(fixtureId);
 verifyCoercionFailedExecution(execution,node,fixtureId);
 need(proof?.contract==='javascript-native-coercion-failed-terminal-1'&&proof.fixture_id===fixtureId
  &&proof.source===fixture.source&&proof.source_sha256===fixture.source_sha256
  &&JSON.stringify(proof.execution)===JSON.stringify(execution)&&['document_id','workflow_id','node_id'].every(k=>proof.node?.[k]===node[k])
  &&proof.native_owner_verified===true&&proof.native_error_complete===true&&proof.output_status==='not_read_failed_execution'
  &&typeof proof.error_details==='string'&&proof.error_details.trim()===execution.error.message&&proof.error_details.length<=1000,'failed witness differs');
 return proof;
}

export function verifyCoercionFailureOutcome({before,failed,upstream,output},fixtureId){
 need(output?.status==='not_read_failed_execution'&&Object.keys(output).length===1,'failed OUTPUT must not be read');
 verifyCoercionFailureWitness(failed,failed.execution,failed.node,fixtureId);
 verifyNativeRoundtripInput({node:{node_id:before.binding.node_id},table:{port_guid:before.binding.port_guid},native_input:{native:before}},fixtureId);
 need(['document_id','workflow_id'].every(k=>failed.node[k]===before.binding[k])&&failed.node.node_id!==before.binding.node_id,'failed/import scope');
 need(JSON.stringify(upstream.binding.failed_terminal)===JSON.stringify(failed),'upstream failed-terminal association');
 const exact=verifyNativeRoundtripRead(upstream.raw,{binding:upstream.binding,lifecycle:upstream.lifecycle,input:before,role:'upstream'});
 need(JSON.stringify(exact)===JSON.stringify(upstream.exact),'stored failed upstream proof differs');
 // Source line alone cannot establish engine line mapping. Until separately
 // observed mapping is admitted, even an owned runtime failure is incomplete.
 return freezeCivilEvidence({fixture_id:fixtureId,status:'owned_execution_failure_unattributed',case_complete:false,
  characterization_only:true,exact_pass:false,g5_complete:false,general_integer_precision_guarantee:false,
  input_exact:true,upstream_exact:true,output_status:'not_read_failed_execution',rejection_attributed:false,
  reason:'runtime_source_position_mapping_unverified',failed_execution_id:failed.execution.execution_id});
}
