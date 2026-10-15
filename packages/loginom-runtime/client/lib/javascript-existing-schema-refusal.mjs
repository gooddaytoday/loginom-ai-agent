import {javascriptExistingLifecycleBaseline} from './javascript-existing-lifecycle.mjs';
import {javascriptSourceSettingsDigest} from './javascript-source-admission.mjs';
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const need=(value,message)=>{if(!value)throw Error(message);};
const phase='javascript_existing_schema_mode_refused';

// A mode mismatch is known only after the full owned read/discard and native
// baseline. Unknown owner/settings/Close/ACK failures keep the normal gate.
export async function admitJavascriptExistingSchema({receipt,snapshot,parameters,owner,record,deadline}) {
  const baseline=javascriptExistingLifecycleBaseline({receipt,snapshot,parameters:{...parameters,schema_mode:undefined},owner});
  if(parameters.schema_mode===undefined||parameters.schema_mode===baseline.schema_mode)return baseline;
  need(['code','declared'].includes(parameters.schema_mode)&&Date.now()<deadline,'JavaScript existing schema refusal unavailable');
  const proof={node:Object.fromEntries(['document_id','workflow_id','node_id'].map(key=>[key,owner[key]])),
    owner:structuredClone(owner),admission_id:receipt.admission_id,observed_schema_mode:baseline.schema_mode,
    requested_schema_mode:parameters.schema_mode,source_identity:structuredClone(receipt.previous_source),
    settings:structuredClone(snapshot.settings),settings_sha256:baseline.settings_sha256,
    source_read_discard_verified:true,settings_unchanged:true,editor_mutation_started:false,explicit_execute_requested:false};
  const event={phase,operation_id:owner.operation_id,proof},expected=JSON.stringify(event);
  let timer;
  try{
    const ack=await Promise.race([Promise.resolve().then(()=>record(structuredClone(event))),new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(Error('JavaScript existing schema refusal ACK deadline')),Math.max(1,deadline-Date.now()));
    })]);
    need(Date.now()<deadline&&JSON.stringify({phase:ack?.phase,operation_id:ack?.operation_id,proof:ack?.proof})===expected,
      'JavaScript existing schema refusal ACK unconfirmed');
  }finally{clearTimeout(timer);}
  const error=Error('JavaScript existing lifecycle preserves observed schema');
  error.nodePhaseRefusal={phase:'target',status:'FAILED',effect_possible:true,cleanup_complete:true,
    settings_unchanged:true,verification:phase,proof};
  throw error;
}

// This is a trusted driver proof, not model parameters. Retain possible UI
// activity effects while clearing only the proved, fully closed target phase.
export function verifiedJavascriptExistingSchemaRefusal(refusal,request) {
  const proof=refusal?.proof,node=request.target.ref,source=proof?.source_identity;
  return request.target.type==='programming.javascript'&&request.target.kind==='existing'
    &&request.mode==='script'&&['done','close','execute'].includes(request.finish)&&request.inputs.length===0&&request.mappings.length===0
    &&request.parameters.columns===undefined&&refusal?.verification===phase&&same(proof?.node,node)
    &&['document_id','workflow_id','node_id'].every(key=>proof?.owner?.[key]===node[key])
    &&proof?.owner?.operation_id===request.operation_id&&Number.isSafeInteger(proof.owner.ui_epoch)&&proof.owner.ui_epoch>=0
    &&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(proof.admission_id)
    &&['code','declared'].includes(proof.observed_schema_mode)&&['code','declared'].includes(proof.requested_schema_mode)
    &&proof.requested_schema_mode===request.parameters.schema_mode&&proof.observed_schema_mode!==proof.requested_schema_mode
    &&proof.source_read_discard_verified===true&&proof.settings_unchanged===true
    &&proof.editor_mutation_started===false&&proof.explicit_execute_requested===false
    &&/^[a-f0-9]{64}$/.test(source?.source_sha256)&&Number.isSafeInteger(source.source_utf8_bytes)
    &&source.source_utf8_bytes>=0&&source.source_utf8_bytes<=32768&&Number.isInteger(source.source_lf_lines)
    &&source.source_lf_lines>=1&&source.source_lf_lines<=1024
    &&(request.parameters.expected_source_sha256===undefined||request.parameters.expected_source_sha256===source.source_sha256)
    &&proof.settings?.generation===(proof.observed_schema_mode==='code')&&Array.isArray(proof.settings.grids)
    &&proof.settings_sha256===javascriptSourceSettingsDigest(proof.settings);
}
