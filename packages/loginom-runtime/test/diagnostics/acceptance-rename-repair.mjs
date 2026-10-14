import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import {readFile,mkdir,rmdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const [modulePath,rawOut,phase]=process.argv.slice(2),out=resolve(rawOut);
await mkdir(out,{recursive:true});
const text=await readFile(modulePath,'utf8'),helpers=text.slice(text.indexOf('    async function closeCaptureWriter('),text.indexOf('    async function captureAcceptance('));
const rows=[];
for(const mode of ['equal-false','late-undefined','same-Error-cause-false']){
 const a=join(out,mode,'A'),final=join(a,'acceptance-capture.json');await mkdir(final,{recursive:true});
 const originalError=Error('original',{cause:false}),primary=mode==='same-Error-cause-false'?originalError:false;
 const secondary=mode==='late-undefined'?undefined:primary;
 let callbackResolve,projectionReject,renames=0,journals=0,kernelError;
 const reached=new Promise(resolve=>callbackResolve=resolve),held=new Promise((_,reject)=>projectionReject=reject);
 const metadata={sessionId:'original'},session={directory:a,metadata};
 const sandbox={session,captureEvidence:Object.freeze({receipt:{kind:'PARTIAL',settings_applied:false}}),captureWriters:new Set(),capturePublications:new Map(),capturePersistenceFailures:[],captureReceiptWritten:false,captureJournalWritten:false,capturePersistencePrimary:undefined,captureEvidenceBinding:undefined,captureIOAssert:()=>{assert.equal(session.directory,a);assert.equal(session.metadata,metadata)},captureOpen:fs.open,captureWrite:fs.writeFile,captureSync:fs.fsync,captureClose:fs.close,
  captureRename:(from,to,done)=>{const number=++renames;fs.rename(from,to,error=>{
   if(number===1){kernelError=error;done(primary);callbackResolve()}else done(error);
  });return number===1?held:undefined},captureConstants:fs.constants,randomUUID,join,
  shutdownRejection:value=>({type:typeof value,value}),recordExecution:async()=>journals++,Promise,Error,JSON};
 const f=vm.runInNewContext(helpers+';({persistCapture})',sandbox);
 let first;const original=f.persistCapture().catch(value=>{first={value}});await reached;await original;
 assert.equal(kernelError.code,'EISDIR');assert.equal(first.value,primary);
 const publication=sandbox.capturePublications.get('acceptance-capture.json'),temporary=publication.temporary;
 await rmdir(final);
 let early;try{await f.persistCapture()}catch(value){early={value}}
 assert.equal(early.value,primary);assert.equal(renames,1);assert.equal(journals,0);assert.equal(publication.pending,true);
 assert.equal(sandbox.captureReceiptWritten,false);assert.equal(sandbox.captureJournalWritten,false);
 projectionReject(secondary);await publication.settlement;
 assert.equal(publication.pending,false);assert.equal(publication.failure.value,primary);
 assert.equal(publication.projectedFailure.value,secondary);assert.notEqual(publication.failure,publication.projectedFailure);
 assert.equal(sandbox.capturePersistencePrimary.value,primary);
 await f.persistCapture();assert.equal(sandbox.capturePublications.get('acceptance-capture.json'),publication);
 assert.equal(publication.temporary,temporary);assert.equal(renames,2);assert.equal(journals,1);
 await f.persistCapture();assert.equal(renames,2);assert.equal(journals,1);
 rows.push({mode,pass:true,firstPreserved:true,separateSecondaryBox:true,pendingRefused:true,originalTemporaryReused:true,renames,journals,cachedReplay:0,native:0});
}
await writeFile(join(out,'results.json'),JSON.stringify({phase,pass:rows.length,fail:0,rows,limits:'Verbatim persistence, real FS/EISDIR; labelled callback raw-reason and held projection faults. Same original tuple storage-only repair after original settlement; not native cleanup/ACK.'},null,2)+'\n');
console.log(JSON.stringify(rows));
