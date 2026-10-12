import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import * as fs from 'node:fs';import * as fsp from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
const source=await fsp.readFile(process.env.BRIDGE_MODULE??new URL('../lib/bridge.mjs',import.meta.url),'utf8');
const writer=source.slice(source.indexOf('    async function writeCleanupReceipt(cleanup) {'),source.indexOf('    function closeBridge() {'));
const rejection=source.slice(source.indexOf('function shutdownRejection('),source.indexOf('\n}',source.indexOf('function shutdownRejection('))+2);
async function fixture(kind){
 const directory=await fsp.mkdtemp(join(tmpdir(),'lab69-atomic-cleanup-')),path=join(directory,'package-cleanup.json'),old='{\"original\":true}\n';
 await fsp.writeFile(path,old,{mode:0o600});const receipt={status:'SUCCEEDED',session_id:'own',logged_out:true},session={directory,metadata:{sessionId:'own'}};
 const events=[],fds=new Set(),meta=new Map();let fail=true,deliver,renameFinished=false,run;
 const open=(p,flags,permissions,cb)=>{events.push({stage:'open',kind:p===directory?'directory':'file',flags,permissions});fs.open(p,flags,permissions,(e,fd)=>{if(!e){fds.add(fd);meta.set(fd,p===directory?'directory':'file')}cb(e,fd)})};
 const write=(fd,b,cb)=>{events.push({stage:'write'});if(kind==='write-failure'&&fail){fail=false;cb(Error('write refused',{cause:0}));return;}fs.writeFile(fd,b,cb)};
 const sync=(fd,cb)=>fs.fsync(fd,e=>{events.push({stage:'sync-complete',kind:meta.get(fd)});cb(e)});
 const close=(fd,cb)=>fs.close(fd,e=>{if(!e)fds.delete(fd);events.push({stage:'close-complete',kind:meta.get(fd)});cb(e)});
 const rename=(a,b,cb)=>{events.push({stage:'rename-invoked'});
  if(kind==='rename-failure'&&fail){fail=false;cb(Error('rename refused',{cause:false}));return;}
  fs.rename(a,b,e=>{renameFinished=true;events.push({stage:'rename-kernel-complete'});
   if(kind==='rename-lost'&&fail){deliver=()=>{fail=false;cb(e)}}else cb(e)});
  if(kind==='rename-lost'&&fail)throw 0;
 };
 const body=`let confirmedCleanup=initialConfirmed,cleanupEvidenceBinding,cleanupReceiptWritten=false,cleanupPersistencePrimary,cleanupPublication;const cleanupPersistenceFailures=[],cleanupWriters=new Set();${rejection}\n${writer}\n({write:writeCleanupReceipt,setConfirmed:value=>confirmedCleanup=value,inspect:()=>({marker:cleanupReceiptWritten,writers:cleanupWriters.size,primary:cleanupPersistencePrimary,publication:cleanupPublication})})`;
 const f=vm.runInNewContext(body,{initialConfirmed:kind==='blocked-transition'?undefined:receipt,receipt,session,receiptOpen:open,receiptWrite:write,receiptSync:sync,receiptClose:close,receiptRename:rename,receiptConstants:fs.constants,randomUUID,join,Promise,Error});
 return {f,receipt,session,directory,path,old,events,fds,get deliver(){return deliver},get renameFinished(){return renameFinished},async dispose(){if(deliver)deliver();for(const fd of fds)await new Promise(r=>fs.close(fd,()=>r()));await fsp.rm(directory,{recursive:true,force:true})}};
}
for(const kind of ['normal','write-failure','rename-failure','rename-lost','final-symlink','blocked-transition'])test('atomic receiving publication '+kind+' (real FS; receipt/IO projections doubles)',async()=>{
 const f=await fixture(kind);try{
  if(kind==='blocked-transition'){await f.f.write({status:'BLOCKED',reason:'busy'});assert.equal(f.f.inspect().marker,false);f.f.setConfirmed(f.receipt);}
  let target;if(kind==='final-symlink'){target=join(f.directory,'target.json');await fsp.writeFile(target,'target-original');await fsp.unlink(f.path);await fsp.symlink(target,f.path);}
  if(['write-failure','rename-failure','rename-lost'].includes(kind)){
   await assert.rejects(f.f.write(f.receipt));assert.equal(f.f.inspect().marker,false);
   if(kind==='rename-lost'){
    while(!f.deliver)await new Promise(r=>setTimeout(r,1));const opens=f.events.filter(x=>x.stage==='open').length;
    await assert.rejects(f.f.write(f.receipt),e=>e===0);assert.equal(f.events.filter(x=>x.stage==='open').length,opens);
    assert.equal(f.events.some(x=>x.kind==='directory'),false);f.deliver();
   }else assert.equal(await fsp.readFile(f.path,'utf8'),f.old);
  }
  await f.f.write(f.receipt);assert.equal(f.f.inspect().marker,true);assert.equal(f.f.inspect().writers,0);
  assert.deepEqual(JSON.parse(await fsp.readFile(f.path,'utf8')),f.receipt);assert.equal((await fsp.stat(f.path)).mode&0o777,0o600);
  if(target){assert.equal(await fsp.readFile(target,'utf8'),'target-original');assert.equal((await fsp.lstat(f.path)).isSymbolicLink(),false);}
  const fileOpen=f.events.find(x=>x.stage==='open'&&x.kind==='file');
  for(const flag of [fs.constants.O_EXCL,fs.constants.O_NOFOLLOW,fs.constants.O_CREAT])assert.equal(fileOpen.flags&flag,flag);
  const rename=f.events.findIndex(x=>x.stage==='rename-invoked'),closed=f.events.findIndex(x=>x.stage==='close-complete'&&x.kind==='file');assert.ok(closed>=0&&closed<rename);
  assert.ok(f.events.some(x=>x.stage==='sync-complete'&&x.kind==='directory'));assert.ok(f.events.some(x=>x.stage==='close-complete'&&x.kind==='directory'));
 }finally{await f.dispose()}
});
