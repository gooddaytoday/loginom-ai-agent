// Whole production close/writer bodies + genuine callback FS. Native/handles are doubles.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import * as fs from 'node:fs';import * as fsp from 'node:fs/promises';
import {randomUUID} from 'node:crypto';import {join} from 'node:path';import {tmpdir} from 'node:os';
const text=await fsp.readFile(process.env.MANAGED_MODULE??new URL('../src/managed-entry.mjs',import.meta.url),'utf8');
const code=text.slice(text.indexOf('function closeRejection('),text.indexOf('const stop ='));
for(const scenario of ['normal','collision','symlink','file-callback','directory-callback','rename-pending'])test('atomic receiving policy '+scenario,async()=>{
 const directory=await fsp.mkdtemp(join(tmpdir(),'managed-atomic-')),events=[],fds=new Set();
 let native=0,released=0,selected=false,deliver,foreign,firstOutcome;
 const state={session:{directory},authenticatedReadiness:{account:'own'},bridge:{async close(){native++;events.push('native-double');return {cleanup_complete:true,browser_transport_closed:true,native_logout_confirmed:true}}},
  browser:{async close(){released++;events.push('release-context')}},client:{async close(){released++;events.push('release-client')}},browserServer:{async close(){released++;events.push('release-server')}}};
 const kinds=new Map();
 const open=(p,flags,mode,cb)=>{
  const kind=p===directory?'directory':'file';events.push('open-'+kind);
  if(kind==='file'){assert.ok(flags&fs.constants.O_EXCL);assert.ok(flags&fs.constants.O_NOFOLLOW);assert.ok(flags&fs.constants.O_CREAT);assert.equal(mode,0o600)}
  else{assert.ok(flags&fs.constants.O_DIRECTORY);assert.ok(flags&fs.constants.O_NOFOLLOW)}
  if(!selected&&['collision','symlink'].includes(scenario)&&kind==='file'){
   selected=true;foreign=p;
   if(scenario==='collision')fs.writeFileSync(p,'foreign',{mode:0o600});
   else{fs.writeFileSync(join(directory,'foreign-target'),'foreign');fs.symlinkSync(join(directory,'foreign-target'),p)}
  }
  fs.open(p,flags,mode,(error,fd)=>{if(!error){fds.add(fd);kinds.set(fd,kind)};cb(error,fd)});
 };
 const sync=(fd,cb)=>fs.fsync(fd,error=>{events.push('sync-'+kinds.get(fd));cb(error)});
 const close=(fd,cb)=>{
  const kind=kinds.get(fd),target=!selected&&state.bridgeCleanup&&
    ((scenario==='file-callback'&&kind==='file')||(scenario==='directory-callback'&&kind==='directory'));
  if(target)selected=true;
  fs.close(fd,error=>{fds.delete(fd);events.push('kernel-close-'+kind);
   const reply=()=>{events.push('callback-close-'+kind);cb(error)};
   if(target)deliver=reply;else reply();
  });
 };
 const rename=(from,to,cb)=>{
  // File close callback must precede rename, not just FD retirement.
  assert.equal(events.at(-1),'callback-close-file');events.push('rename-call');
  if(!selected&&state.bridgeCleanup&&scenario==='rename-pending'){
   selected=true;fs.rename(from,to,error=>{deliver=()=>{events.push('rename-callback');cb(error)}});throw 0;
  }
  fs.rename(from,to,error=>{events.push('rename-callback');cb(error)});
 };
 const f=vm.runInNewContext(code+';({close})',{state,requests:new Set(),constants:fs.constants,randomUUID,join,Promise,Error,
  evidenceOpen:open,evidenceWrite:fs.writeFile,evidenceSync:sync,evidenceClose:close,evidenceRename:rename,evidenceUnlink:fs.unlink});
 const until=async pred=>{const end=Date.now()+5000;while(!pred()){assert.ok(Date.now()<end,'fixture timeout');await new Promise(r=>setTimeout(r,2))}};
 try{
  const pending=f.close().then(()=>{firstOutcome={ok:true}},error=>{firstOutcome={ok:false,error}});
  if(['file-callback','directory-callback'].includes(scenario)){
   await until(()=>!!deliver);assert.equal(firstOutcome,undefined);assert.equal(released,0);assert.equal(native,1);assert.equal(state.evidenceWriters.size,1);
   if(scenario==='file-callback')assert.equal(events.at(-1),'kernel-close-file');
   deliver();await pending;assert.equal(firstOutcome.ok,true);
  }else if(scenario==='rename-pending'){
   await until(()=>!!deliver);await pending;assert.equal(firstOutcome.ok,false);assert.equal(firstOutcome.error.cause,0);
   const opens=events.filter(e=>e.startsWith('open-')).length;
   await assert.rejects(f.close());assert.equal(events.filter(e=>e.startsWith('open-')).length,opens);
   assert.equal(released,0);assert.equal(native,1);assert.equal(state.evidencePublication.pending,true);
   deliver();await f.close();assert.equal(native,1);
  }else{
   await pending;
   if(['collision','symlink'].includes(scenario)){
    assert.equal(firstOutcome.ok,false);assert.equal(native,0);
    assert.equal(await fsp.readFile(foreign,'utf8'),'foreign');
    if(scenario==='symlink')assert.equal((await fsp.lstat(foreign)).isSymbolicLink(),true);
   }else assert.equal(firstOutcome.ok,true);
  }
  if(!['collision','symlink'].includes(scenario)){
   assert.equal(released,3);assert.equal(native,1);assert.equal(state.evidenceWriters.size,0);
   assert.equal((await fsp.stat(join(directory,'managed-shutdown.json'))).mode&0o777,0o600);
   assert.equal(events.includes('sync-directory'),true);
   for(let i=0;i<events.length;i++)if(events[i].startsWith('release-')){
    assert.ok(events.slice(0,i).includes('callback-close-directory'));
    assert.ok(events.slice(0,i).includes('sync-directory'));
   }
  }
 }finally{
  for(const fd of fds)await new Promise(r=>fs.close(fd,()=>r()));
  if(process.env.ATOMIC_RESULTS){await fsp.mkdir(process.env.ATOMIC_RESULTS,{recursive:true});await fsp.writeFile(join(process.env.ATOMIC_RESULTS,scenario+'.json'),JSON.stringify({scenario,events,native,released,scope:'whole production bodies; real callback FS; native/context/handles doubles'},null,2))}
  await fsp.rm(directory,{recursive:true,force:true});
 }
});
