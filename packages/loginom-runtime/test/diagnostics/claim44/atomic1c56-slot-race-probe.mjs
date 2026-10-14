import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const [modulePath,rawOut,phase]=process.argv.slice(2),out=resolve(rawOut);await mkdir(out,{recursive:true});const text=await readFile(modulePath,'utf8');
const start=text.indexOf('    async function closeCaptureWriter('),end=text.indexOf('    async function captureAcceptance(');assert(start>=0&&end>start);const helpers=text.slice(start,end);
const {createExecutionJournal}=await import(pathToFileURL(join(dirname(resolve(modulePath)),'execution-journal.mjs')));const rows=[];
for(const mode of ['canonical','unknown-created-after-slot-check']){
 const a=join(out,mode,'A');await mkdir(a,{recursive:true});const metadata={sessionId:'A'},session={directory:a,metadata},target=join(a,'acceptance-capture.json'),unknown=Buffer.from('original UNKNOWN receipt: preserve bytes\n');let raced=false,renames=0,records=0,writes=0;
 const trace=[],journal=createExecutionJournal({directory:a,metadata,knownSecrets:[]});
 const sandbox={session,captureEvidence:Object.freeze({receipt:{kind:'PARTIAL',settings_applied:false}}),captureWriters:new Set(),capturePublications:new Map(),capturePreparedRecords:new Map(),capturePersistenceOrigin:Object.freeze({directory:a,metadata,sessionId:'A'}),capturePersistenceMetadata:metadata,capturePersistenceFailures:[],captureReceiptWritten:false,captureJournalWritten:false,capturePersistencePrimary:undefined,captureEvidenceBinding:undefined,
  captureIOAssert:()=>{},captureOpen:fs.open,captureWrite:(...args)=>{writes++;return fs.writeFile(...args)},captureSync:fs.fsync,captureClose:fs.close,captureFstat:fs.fstat,captureConstants:fs.constants,captureRename:(...args)=>{renames++;trace.push('rename');return fs.rename(...args)},captureLink:fs.link,captureUnlink:fs.unlink,
  lstat:async path=>{
   try{return await fs.promises.lstat(path)}
   catch(error){
    const publication=sandbox.capturePublications.get('acceptance-capture.json');
    if(mode==='unknown-created-after-slot-check'&&!raced&&path===target&&error.code==='ENOENT'&&publication?.prepared){
     // Named race at the actual missing-slot observation. Real independent file
     // creation occurs after kernel lstat but before original publication.
     fs.writeFileSync(target,unknown,{flag:'wx',mode:0o600});raced=true;trace.push('UNKNOWN-created-after-kernel-lstat');
    }
    throw error;
   }
  },Buffer,randomUUID,join,shutdownRejection:value=>({type:typeof value,message:value?.message}),recordExecution:async record=>{records++;trace.push('journal');return journal(record)},Promise,Error,JSON};
 const api=vm.runInNewContext(helpers+';({persistCapture})',sandbox);const outcome=await api.persistCapture().then(()=>({ok:true}),value=>({ok:false,value}));const actual=await readFile(target);const journalRows=await readFile(join(a,'execution-events.jsonl'),'utf8').then(s=>s.trim().split('\n').filter(Boolean).length,()=>0);
 let pass=true,error;
 try{
  if(mode==='canonical'){assert.equal(outcome.ok,true);assert.equal(writes,1);assert.equal(renames,1);assert.equal(records,1);assert.equal(journalRows,1)}
  else{assert.equal(raced,true);assert.equal(outcome.ok,false,'An unowned UNKNOWN receipt created after slot check must refuse publication');assert(actual.equals(unknown),'Original UNKNOWN receipt bytes must remain unchanged');assert.equal(records,0);assert.equal(journalRows,0);assert.equal(sandbox.captureReceiptWritten,false);assert.equal(sandbox.captureJournalWritten,false)}
 }catch(value){pass=false;error=value.message}
 assert.equal(sandbox.captureWriters.size,0);
 rows.push({mode,pass,error,raced,persistReturnedSuccess:outcome.ok,originalUnknownPreserved:mode==='canonical'?undefined:actual.equals(unknown),writes,renames,records,journalRows,receiptWritten:sandbox.captureReceiptWritten,journalWritten:sandbox.captureJournalWritten,trace,native:false,acknowledged:false});
}
const result={phase,pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,rows,limits:'Literal production persistence; actual execution-journal and real kernel FS/lstat/exclusive marker creation/rename/sync/close. Scheduling race, captured tuple and evidence are named conformance operands. No embedded factory/original native consumer/cleanup/ACK authority.'};await writeFile(join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(result.fail)process.exitCode=1;
