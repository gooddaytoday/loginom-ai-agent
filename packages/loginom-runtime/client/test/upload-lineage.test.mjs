import test from 'node:test';import assert from 'node:assert/strict';
import {verifyUploadLineage} from '../lib/upload-lineage.mjs';
const source={upload_operation_id:'A',destination:'/test/A.csv',bytes:2,sha256:'a'.repeat(64)};
function upload(id,sequence,sha256=source.sha256){const artifact={artifact_id:id,bytes:2,sha256};return {sequence,operation_id:id,destination:source.destination,artifact,cleanup_confirmed:true,transport_uncertain:false,outcome:{status:'SUCCEEDED',action_key:'artifact.upload',operation_id:id,cleanup_complete:true,output:{...artifact,destination:source.destination,server_copy_verification:{status:'SUCCEEDED',verification_id:'v-'+id,bytes_verified:true,upload_completion_verified:true,bytes:2,sha256,destination:source.destination}}}};}
const history=(...records)=>({complete:true,records});
test('latest version must match before import, same-byte replacement is valid',()=>{
 assert.throws(()=>verifyUploadLineage(source,history(upload('A',0),upload('B',1,'b'.repeat(64)))),/superseded/);
 assert.equal(verifyUploadLineage(source,history(upload('A',0),upload('A2',1))).verified_current_upload,'A2');
 assert.equal(verifyUploadLineage({...source,upload_operation_id:'B',sha256:'b'.repeat(64)},history(upload('A',0),upload('B',1,'b'.repeat(64)))).verified_current_upload,'B');
});
test('execution lineage rejects changed or unknown writes after execution, including change then restore',()=>{
 for(const writes of [[upload('B',3,'b'.repeat(64))],[{...upload('B',3),outcome:null}],[{...upload('B',3),transport_uncertain:true}],[{...upload('B',3),outcome:{status:'AMBIGUOUS'}}],[upload('B',3,'b'.repeat(64)),upload('A2',4)]])assert.throws(()=>verifyUploadLineage(source,history(upload('A',0),...writes),{executionSequence:2}));
 assert.equal(verifyUploadLineage(source,history(upload('A',0),upload('A2',3)),{executionSequence:2}).verified_current_upload,'A2');
});
test('old/future receipts, missing or unordered history and uncertain overwrite refuse',()=>{
 for(const h of [undefined,{complete:false,records:[]},history(),history(upload('A',2),upload('B',1)),history(upload('A',0),{...upload('B',1),cleanup_confirmed:false}),history(upload('A',0),{...upload('B',1),outcome:{status:'NOT_APPLIED',effect_possible:true}})])assert.throws(()=>verifyUploadLineage(source,h));
 assert.throws(()=>verifyUploadLineage(source,history(upload('A',5)),{executionSequence:2}));
});
test('proven no-effect refusal and unrelated paths do not invalidate completed import',()=>{
 const denied={...upload('B',3),outcome:{status:'NOT_APPLIED',effect_possible:false}};
 const unrelated={...upload('C',4,'c'.repeat(64)),destination:'/test/other.csv',outcome:{status:'AMBIGUOUS'}};
 assert.equal(verifyUploadLineage(source,history(upload('A',0),denied,unrelated),{executionSequence:2}).verified_current_upload,'A');
 denied.transport_uncertain=true;assert.throws(()=>verifyUploadLineage(source,history(upload('A',0),denied),{executionSequence:2}));
});
