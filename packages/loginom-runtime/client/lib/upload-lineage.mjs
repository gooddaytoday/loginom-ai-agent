const need=(x,m)=>{if(!x)throw Error('Upload lineage: '+m);};
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
 const sameBytes=r=>{const o=r.outcome,p=o?.output?.server_copy_verification,a=r.artifact;
  return r.cleanup_confirmed===true&&!r.transport_uncertain&&o?.status==='SUCCEEDED'&&o.cleanup_complete===true
   &&o.operation_id===r.operation_id&&o.action_key==='artifact.upload'&&p?.status==='SUCCEEDED'&&p.bytes_verified===true&&p.upload_completion_verified===true
   &&typeof p.verification_id==='string'&&p.verification_id.length>0&&a?.artifact_id===o.output.artifact_id
   &&[a,o.output,p].every(x=>x?.bytes===source.bytes&&x.sha256===source.sha256)
   &&o.output.destination===source.destination&&p.destination===source.destination;};
 need(sameBytes(chosen[0]),'selected upload is not byte verified');
 const writes=relevant.filter(r=>!noEffect(r));
 const prior=writes.filter(r=>r.sequence<executionSequence).at(-1);
 need(prior&&sameBytes(prior),'source path was superseded or its latest write is uncertain');
 for(const r of writes.filter(r=>r.sequence>=executionSequence))need(sameBytes(r),'source path changed or became uncertain after execution');
 return {basis:'private_ordered_upload_history',selected_upload:source.upload_operation_id,verified_current_upload:writes.at(-1).operation_id,
  execution_sequence:executionSequence===Infinity?null:executionSequence,sha256:source.sha256,bytes:source.bytes,external_writers_excluded:false};
}
