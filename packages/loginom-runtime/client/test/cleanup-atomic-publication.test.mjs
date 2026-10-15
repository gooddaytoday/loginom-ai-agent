import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const source=await fsp.readFile(process.env.BRIDGE_MODULE??new URL('../lib/bridge.mjs',import.meta.url),'utf8');
const writer=source.slice(source.indexOf('    async function writeCleanupReceipt(cleanup) {'),source.indexOf('    function closeBridge() {'));
const start=source.indexOf('function shutdownRejection('),rejection=source.slice(start,source.indexOf('\n}',start)+2);
for(const scenario of ['normal','rename-pending','directory-sync-failure','collision','symlink','blocked-to-succeeded'])test('atomic cleanup publication '+scenario,async()=>{
 const directory=await fsp.mkdtemp(join(tmpdir(),'cleanup-atomic-')),target=join(directory,'package-cleanup.json');
 const receipt=Object.freeze({status:'SUCCEEDED',session_id:'s',package_closed:true,logged_out:true});
 const events=[],kinds=new Map();let deliver,selected=false,fileOpens=0;
 const temp=join(directory,'.package-cleanup.fixed.tmp');
 await fsp.writeFile(target,'previous receipt');
 if(scenario==='collision')await fsp.writeFile(temp,'owned preexisting');
 if(scenario==='symlink')await fsp.symlink(target,temp);
 const open=(path,flags,mode,done)=>{
  const file=path!==directory;if(file){fileOpens++;assert.ok(flags&fs.constants.O_EXCL);assert.ok(flags&fs.constants.O_NOFOLLOW);assert.equal(mode,0o600)}
  fs.open(path,flags,mode,(error,fd)=>{if(!error)kinds.set(fd,file?'file':'directory');events.push(file?'file-open':'directory-open');done(error,fd)})
 };
 const sync=(fd,done)=>{
  const kind=kinds.get(fd);events.push(kind+'-sync');
  if(scenario==='directory-sync-failure'&&kind==='directory'&&!selected){selected=true;fs.fsync(fd,()=>done(false));return}
  fs.fsync(fd,done)
 };
 const close=(fd,done)=>fs.close(fd,error=>{events.push(kinds.get(fd)+'-close');done(error)});
 const rename=(a,b,done)=>{
  events.push('rename-dispatch');
  if(events.filter(e=>e==='rename-dispatch').length===1)assert.equal(fs.readFileSync(target,'utf8'),'previous receipt');
  assert.ok(events.indexOf('file-sync')<events.indexOf('file-close'));
  assert.ok(events.indexOf('file-close')<events.indexOf('rename-dispatch'));
  if(scenario==='rename-pending'&&!selected){selected=true;fs.rename(a,b,error=>{deliver=()=>done(error)});throw 0}
  fs.rename(a,b,done)
 };
 const f=vm.runInNewContext(`let confirmedCleanup=${scenario==='blocked-to-succeeded'?'undefined':'receipt'},cleanupEvidenceBinding,cleanupReceiptWritten=false,cleanupPersistencePrimary,cleanupPublication;const cleanupPersistenceFailures=[],cleanupWriters=new Set();${rejection}\n${writer}\n({write:writeCleanupReceipt,confirm:r=>{confirmedCleanup=r},inspect:()=>({marker:cleanupReceiptWritten,writers:cleanupWriters.size})})`,{
  receipt,session:{directory,metadata:{sessionId:'s'}},receiptOpen:open,receiptWrite:fs.writeFile,receiptSync:sync,receiptClose:close,receiptRename:rename,receiptFlags:fs.constants,receiptUUID:()=>['collision','symlink'].includes(scenario)?'fixed':randomUUID(),join,Promise,Error,
 });
 try{
  if(['collision','symlink'].includes(scenario)){
   await assert.rejects(f.write(receipt));assert.equal(f.inspect().marker,false);assert.equal(await fsp.readFile(target,'utf8'),'previous receipt');assert.equal(events.includes('rename-dispatch'),false);
  }else{
   if(scenario==='rename-pending'){
    await assert.rejects(f.write(receipt),e=>e===0);while(!deliver)await new Promise(r=>setImmediate(r));
    assert.equal(f.inspect().marker,false);await assert.rejects(f.write(receipt),e=>e===0);assert.equal(fileOpens,1);assert.equal(events.filter(e=>e==='rename-dispatch').length,1);deliver();
   }else if(scenario==='directory-sync-failure'){
    await assert.rejects(f.write(receipt),e=>e===false);assert.equal(f.inspect().marker,false);assert.equal(fileOpens,1);
   }
   if(scenario==='blocked-to-succeeded'){
    await f.write(Object.freeze({...receipt,status:'BLOCKED',package_closed:false,logged_out:false}));assert.equal(f.inspect().marker,false);assert.equal(JSON.parse(await fsp.readFile(target,'utf8')).status,'BLOCKED');f.confirm(receipt);
   }
   await f.write(receipt);assert.equal(f.inspect().marker,true);assert.equal(f.inspect().writers,0);assert.deepEqual(JSON.parse(await fsp.readFile(target,'utf8')),receipt);assert.equal(fileOpens,scenario==='blocked-to-succeeded'?2:1);
   assert.ok(events.lastIndexOf('directory-sync')<events.lastIndexOf('directory-close'));assert.equal(events.filter(e=>e==='rename-dispatch').length,scenario==='blocked-to-succeeded'?2:1);
  }
 }finally{await fsp.rm(directory,{recursive:true,force:true})}
});
