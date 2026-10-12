import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';

const source=await fsp.readFile(process.env.CAPTURE_BRIDGE_SOURCE,'utf8');
const helpers=source.slice(source.indexOf('    async function closeCaptureWriter('),source.indexOf('    async function persistCapture('));
for(const differentName of [false,true])test('pending receipt rename blocks '+(differentName?'diagnostic':'same receipt')+' publication (real FS, exact VM helpers)',async()=>{
 const directory=await fsp.mkdtemp(join(tmpdir(),'review-capture-rename-'));
 const session={directory,metadata:{sessionId:'own'}},events=[],owned=new Set();
 const primary=Error('original receipt rename reply lost',{cause:0});
 let selected=false,deliver,kernel;
 const open=(path,flags,mode,callback)=>{
  events.push({stage:'open',path,original_callback_delivered:!deliver});
  fs.open(path,flags,mode,(error,fd)=>{if(error===null||error===undefined)owned.add(fd);callback(error,fd)});
 };
 const close=(fd,callback)=>fs.close(fd,error=>{if(error===null||error===undefined)owned.delete(fd);callback(error)});
 const rename=(from,to,callback)=>{
  events.push({stage:'rename',to});
  if(!selected){
   selected=true;kernel=new Promise(resolve=>fs.rename(from,to,error=>{
    events.push({stage:'original-rename-kernel-complete'});
    deliver=()=>{events.push({stage:'original-rename-callback-delivered'});deliver=undefined;callback(error)};
    resolve();
   }));throw primary;
  }
  fs.rename(from,to,callback);
 };
 const api=vm.runInNewContext(`let capturePersistencePrimary;const captureWriters=new Set(),capturePersistenceFailures=[],capturePublications=new Map();${helpers};({write:writeCaptureEvidence,inspect:()=>({writers:captureWriters.size,publications:[...capturePublications].map(([name,p])=>({name,pending:p.pending,succeeded:p.succeeded})),primary:capturePersistencePrimary})})`,{
  session,join,randomUUID,Error,Promise,captureOpen:open,captureWrite:fs.writeFile,captureSync:fs.fsync,captureClose:close,captureRename:rename,captureConstants:fs.constants,
  shutdownRejection:value=>({message:value?.message,cause:value?.cause}),
 });
 let failure;
 try{
  await assert.rejects(api.write('acceptance-capture.json','{"receipt":true}\n'),error=>error===primary);
  await kernel;
  assert.equal(api.inspect().publications[0].pending,true);
  const opens=events.filter(e=>e.stage==='open').length;
  const next=differentName?'acceptance-capture-failure.json':'acceptance-capture.json';
  const bytes=differentName?'{"failed":true}\n':'{"receipt":true}\n';
  await assert.rejects(api.write(next,bytes),error=>error===primary);
  assert.equal(events.filter(e=>e.stage==='open').length,opens,'no new diagnostic IO before original receipt callback');
 }catch(error){failure={name:error.name,message:error.message};throw error}
 finally{
  const proof={differentName,events,inspection:api.inspect(),failure,scope:'exact receiving helpers; real FS, VM state/fault projection doubles; no native/IPC'};
  if(process.env.REVIEW_RESULTS_DIR){await fsp.mkdir(process.env.REVIEW_RESULTS_DIR,{recursive:true});await fsp.writeFile(join(process.env.REVIEW_RESULTS_DIR,(differentName?'diagnostic':'same-name')+'.json'),JSON.stringify(proof,null,2)+'\n')}
  if(kernel)await kernel;if(deliver)deliver();
  for(const fd of owned)await new Promise(resolve=>fs.close(fd,()=>resolve()));
  await fsp.rm(directory,{recursive:true,force:true});
 }
});
