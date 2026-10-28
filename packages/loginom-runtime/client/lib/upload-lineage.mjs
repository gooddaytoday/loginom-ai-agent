const need=(x,m)=>{if(!x)throw Error('Upload lineage: '+m);};
// Native Size confirms the destination, while SHA remains the admitted local
// source digest. It must never be presented as a downloaded server SHA.
export function verifiedLocalDelivery(artifact,outcome) {
 const requireDelivery=(value,reason)=>need(value,'Upload bytes, digest, artifact or exact destination do not match the source: '+reason);
 const output=outcome?.output,download=output?.server_copy_verification,native=download===undefined;
 const proof=download??output?.native_size_verification;
 requireDelivery(Number.isSafeInteger(artifact?.bytes)&&artifact.bytes>=0&&(/^[a-f0-9]{64}$/.test(artifact?.sha256??'')
  ||native&&artifact.sha256===null&&proof?.source_unchanged_verified===true),'admitted identity required');
 requireDelivery(outcome?.status==='SUCCEEDED'&&outcome.cleanup_complete===true&&outcome.action_key==='artifact.upload'
  &&output?.artifact_id===artifact.artifact_id&&proof?.status==='SUCCEEDED'&&proof.upload_completion_verified===true
  &&output.destination===proof.destination&&[output,proof].every(x=>x.bytes===artifact.bytes)
  &&output.sha256===artifact.sha256,'completed local delivery required');
 if(native)requireDelivery(artifact.bytes>16*1024*1024&&proof.bytes_source==='native_file_store'&&proof.cleanup_complete===true
  &&proof.artifact_id===artifact.artifact_id&&proof.upload_operation_id===outcome.operation_id
  &&proof.source_sha256===artifact.sha256,'native size/local digest receipt required');
 else requireDelivery(proof.bytes_verified===true&&proof.sha256===artifact.sha256&&typeof proof.verification_id==='string'&&proof.verification_id.length>0,'download digest receipt required');
 return {destination:proof.destination,bytes:artifact.bytes,sha256:artifact.sha256,
  verification_id:native?outcome.operation_id:proof.verification_id,...(native?{verification_basis:artifact.sha256===null?'native_size_and_source_metadata':'native_size_and_local_sha256'}:{})};
}
// Private ordered executor history, including unsuccessful/uncertain writes.
// A completed import may retain its version only if every later write is a
// verified same-byte replacement. No server atomicity or external lock claimed.
export function verifyUploadLineage(source,history,{executionSequence=Infinity}={}) {
 need(history?.complete===true&&Array.isArray(history.records)&&history.records.length<=4096,'complete private write history required');
 let last=-1;const ids=new Set();
 for(const r of history.records){need(Number.isSafeInteger(r.sequence)&&r.sequence>last&&!ids.has(r.operation_id),'ordered unique writes required');last=r.sequence;ids.add(r.operation_id);}
 need(executionSequence===Infinity||Number.isSafeInteger(executionSequence)&&executionSequence>=0,'execution order required');
 const relevant=history.records.filter(r=>r.destination===source.destination);
 const chosen=relevant.filter(r=>r.operation_id===source.upload_operation_id);need(chosen.length===1&&chosen[0].sequence<executionSequence,'upload must precede execution');
 const noEffect=r=>r.cleanup_confirmed===true&&!r.transport_uncertain&&(r.outcome?.status==='NOT_APPLIED'&&r.outcome.effect_possible===false
  ||r.outcome?.status==='FAILED'&&r.outcome.output?.conflict_rejected===true&&r.outcome.output.upload_submitted===false);
 const sameBytes=r=>{
  // Without an exact digest, equal sizes do not prove a later write identical.
  if(source.sha256===null&&r.operation_id!==source.upload_operation_id)return false;
  if(r.cleanup_confirmed!==true||r.transport_uncertain||r.outcome?.operation_id!==r.operation_id)return false;
  try{const proof=verifiedLocalDelivery(r.artifact,r.outcome);return proof.bytes===source.bytes&&proof.sha256===source.sha256&&proof.destination===source.destination;}catch{return false;}
 };
 need(sameBytes(chosen[0]),'selected upload is not a verified local delivery');
 const writes=relevant.filter(r=>!noEffect(r));
 const prior=writes.filter(r=>r.sequence<executionSequence).at(-1);
 need(prior&&sameBytes(prior),'source path was superseded or its latest write is uncertain');
 for(const r of writes.filter(r=>r.sequence>=executionSequence))need(sameBytes(r),'source path changed or became uncertain after execution');
 return {basis:'private_ordered_upload_history',selected_upload:source.upload_operation_id,verified_current_upload:writes.at(-1).operation_id,
  execution_sequence:executionSequence===Infinity?null:executionSequence,sha256:source.sha256,bytes:source.bytes,external_writers_excluded:false};
}
