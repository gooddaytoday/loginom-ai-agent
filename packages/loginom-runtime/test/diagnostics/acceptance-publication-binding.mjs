import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import {readFile,mkdir,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const[modulePath,rawOut,phase]=process.argv.slice(2),out=resolve(rawOut);await mkdir(out,{recursive:true});
const text=await readFile(modulePath,'utf8');
const helpers=text.slice(text.indexOf('    async function closeCaptureWriter('),text.indexOf('    async function captureAcceptance('));
const rows=[];
for(const mode of ['canonical-stable','late-file-close-directory-metadata','late-file-close-metadata-same-id']){
 const a=join(out,mode,'A'),b=join(out,mode,'B');await mkdir(a,{recursive:true});await mkdir(b,{recursive:true});
 const originalMetadata={sessionId:'original'},foreignMetadata={sessionId:mode.endsWith('same-id')?'original':'foreign',sentinel:'unchanged'};
 const session={directory:a,metadata:originalMetadata};let drifted=false,renameCalls=0,records=0,raw;
 const sandbox={session,captureEvidence:Object.freeze({receipt:{kind:'PARTIAL',settings_applied:false}}),captureWriters:new Set(),capturePublications:new Map(),capturePersistenceFailures:[],captureReceiptWritten:false,captureJournalWritten:false,capturePersistencePrimary:undefined,captureEvidenceBinding:undefined,captureIOAssert:undefined,
  captureOpen:fs.open,captureWrite:fs.writeFile,captureSync:fs.fsync,
  captureClose:(fd,done)=>{const directory=fs.fstatSync(fd).isDirectory();return fs.close(fd,error=>{
   if((error===null||error===undefined)&&!directory&&!drifted&&mode!=='canonical-stable'){
    drifted=true;if(mode==='late-file-close-directory-metadata')session.directory=b;session.metadata=foreignMetadata;
   }done(error);
  })},
  captureRename:(...args)=>{renameCalls++;return fs.rename(...args)},captureConstants:fs.constants,randomUUID,join,
  shutdownRejection:value=>({type:typeof value,message:value instanceof Error?value.message:undefined,value:value instanceof Error?undefined:value}),
  recordExecution:async()=>{records++},Promise,Error,JSON};
 const f=vm.runInNewContext(helpers+';({persistCapture})',sandbox);
 try{await f.persistCapture()}catch(value){raw=value}
 const bFiles=await readdir(b),aFiles=await readdir(a);
 const row={mode,drifted,renameCalls,records,bFiles,aFiles,foreignMetadataKeys:Object.keys(foreignMetadata),raw:raw?.message,writerCount:sandbox.captureWriters.size,pass:true};
 try{
  assert.equal(sandbox.captureWriters.size,0);assert.equal(foreignMetadata.sentinel,'unchanged');assert.deepEqual(Object.keys(foreignMetadata),['sessionId','sentinel']);
  if(mode==='canonical-stable'){assert.equal(raw,undefined);assert.equal(renameCalls,1);assert.equal(records,1);assert.deepEqual(bFiles,[]);assert.deepEqual(aFiles,['acceptance-capture.json'])}
  else{assert.equal(raw?.message,'LOGINOM_CAPTURE_EVIDENCE_BINDING_CHANGED');assert.equal(renameCalls,0,'late binding drift must refuse before atomic publication');assert.equal(records,0);assert.deepEqual(bFiles,[],'no publication into foreign B');assert(!aFiles.includes('acceptance-capture.json'),'temporary custody is retained without publication')}
 }catch(error){row.pass=false;row.assertion=error.message}
 rows.push(row);
}
await writeFile(join(out,'results.json'),JSON.stringify({phase,pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,rows,class:'extracted exact production persistence; real file/write/sync/close/rename/FS callbacks; session/metadata drift fixture, no native'},null,2)+'\n');
console.log(JSON.stringify(rows));assert.equal(rows.filter(x=>!x.pass).length,0,'original metadata/destination retained through atomic publication');
