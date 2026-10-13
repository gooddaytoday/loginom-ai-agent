import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import * as fs from 'node:fs';import * as fsp from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
const source=await fsp.readFile(process.env.CAPTURE_BRIDGE_SOURCE??new URL('../lib/bridge.mjs',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('    async function closeCaptureWriter('),source.indexOf('    async function captureAcceptance('));
async function fixture(kind){
 const directory=await fsp.mkdtemp(join(tmpdir(),'lab69-atomic-capture-')),path=join(directory,'acceptance-capture.json'),old='{"original":true}\n';
 await fsp.writeFile(path,old,{mode:0o600});const events=[],owned=new Set(),targets=new Map();let fault=true,deliver,kernel;
 const primary=Error('original storage refusal',{cause:0});
 const open=(p,flags,permissions,cb)=>{
  events.push({stage:'open',path:p,kind:p===directory?'directory':'file',flags,permissions});
  if(kind==='temp-symlink'&&fault&&p!==directory){fault=false;fs.symlinkSync(path,p)}
  if(kind==='permission'&&fault&&p!==directory){fault=false;cb(Object.assign(primary,{code:'EACCES'}));return}
  fs.open(p,flags,permissions,(e,fd)=>{if(!e){owned.add(fd);targets.set(fd,p)}cb(e,fd)});
 };
 const write=(fd,b,cb)=>{events.push({stage:'write'});if(kind==='write-failure'&&fault){fault=false;cb(primary);return}fs.writeFile(fd,b,cb)};
 const sync=(fd,cb)=>{
  if(kind==='directory-sync-failure'&&fault&&targets.get(fd)===directory){fault=false;cb(primary);return}
  fs.fsync(fd,e=>{events.push({stage:'sync',kind:targets.get(fd)===directory?'directory':'file'});cb(e)});
 };
 const close=(fd,cb)=>{
  const type=targets.get(fd)===directory?'directory':'file';
  if(fault&&((kind==='file-close-lost'&&type==='file')||(kind==='directory-close-lost'&&type==='directory'))){
   kernel=new Promise(resolve=>fs.close(fd,e=>{owned.delete(fd);events.push({stage:'kernel-close',kind:type});deliver=()=>{fault=false;cb(e)};resolve()}));throw primary;
  }
  fs.close(fd,e=>{if(!e)owned.delete(fd);events.push({stage:'close',kind:type});cb(e)});
 };
 const rename=(a,b,cb)=>{
  events.push({stage:'rename'});
  if(kind==='rename-failure'&&fault){fault=false;cb(primary);return}
  if(kind==='rename-lost'&&fault){kernel=new Promise(resolve=>fs.rename(a,b,e=>{deliver=()=>{fault=false;cb(e)};resolve()}));throw primary}
  fs.rename(a,b,cb);
 };
 const session={directory,metadata:{sessionId:'own-fixture'}},evidence={receipt:{cancel_verified:true}};
 const code=`let captureIOAssert;let capturePersistencePrimary,captureEvidenceBinding,captureReceiptWritten=false,captureJournalWritten=false;const captureWriters=new Set(),capturePersistenceFailures=[],capturePublications=new Map();let captureEvidence=evidence;${helpers};({persist:persistCapture,inspect:()=>({marker:captureReceiptWritten,journal:captureJournalWritten,writers:captureWriters.size,primary:capturePersistencePrimary}),change:()=>captureEvidence={foreign:true}})`;
 const f=vm.runInNewContext(code,{captureOpen:open,captureWrite:write,captureSync:sync,captureClose:close,captureRename:rename,captureConstants:fs.constants,randomUUID,join,session,evidence,Error,Promise,recordExecution:async()=>events.push({stage:'journal'}),shutdownRejection:v=>({message:v?.message,cause:v?.cause})});
 return {f,path,directory,old,primary,events,owned,get deliver(){return deliver},get kernel(){return kernel},async dispose(){if(kernel)await kernel;if(deliver)deliver();for(const fd of owned)await new Promise(r=>fs.close(fd,()=>r()));await fsp.rm(directory,{recursive:true,force:true})}};
}
for(const kind of ['normal','write-failure','rename-failure','rename-lost','final-symlink','temp-symlink','permission','directory-sync-failure','file-close-lost','directory-close-lost'])test('receiving capture atomic '+kind+' (real FS; fault projections/evidence doubles)',async()=>{
 const f=await fixture(kind);try{
  let target;if(kind==='final-symlink'){target=join(f.directory,'target');await fsp.writeFile(target,'unchanged');await fsp.unlink(f.path);await fsp.symlink(target,f.path)}
  if(!['normal','final-symlink'].includes(kind)){
   await assert.rejects(f.f.persist());assert.equal(f.f.inspect().marker,false);assert.equal(f.events.some(e=>e.stage==='journal'),false);
   if(kind.endsWith('-lost')){
    await f.kernel;assert.ok(f.deliver);const count=f.events.filter(e=>e.stage==='open').length;
    await assert.rejects(f.f.persist(),e=>e===f.primary);assert.equal(f.events.filter(e=>e.stage==='open').length,count);f.deliver();
   }else if(kind!=='directory-sync-failure')assert.equal(await fsp.readFile(f.path,'utf8'),f.old);
  }
  await f.f.persist();assert.equal(f.f.inspect().marker,true);assert.equal(f.f.inspect().journal,true);assert.equal(f.f.inspect().writers,0);
  assert.equal((await fsp.stat(f.path)).mode&0o777,0o600);assert.equal(JSON.parse(await fsp.readFile(f.path,'utf8')).receipt.cancel_verified,true);
  if(target){assert.equal(await fsp.readFile(target,'utf8'),'unchanged');assert.equal((await fsp.lstat(f.path)).isSymbolicLink(),false)}
  const file=f.events.find(e=>e.stage==='open'&&e.kind==='file');assert.equal(file.permissions,0o600);
  for(const flag of [fs.constants.O_CREAT,fs.constants.O_EXCL,fs.constants.O_NOFOLLOW])assert.equal(file.flags&flag,flag);
  const firstRename=f.events.findIndex(e=>e.stage==='rename'),close=f.events.findIndex(e=>(e.stage==='close'||e.stage==='kernel-close')&&e.kind==='file');
  assert.ok(close>=0&&close<firstRename);assert.ok(f.events.some(e=>e.stage==='sync'&&e.kind==='directory'));
  assert.ok(f.events.some(e=>(e.stage==='close'||e.stage==='kernel-close')&&e.kind==='directory'));
  const count=f.events.length;await f.f.persist();assert.equal(f.events.length,count,'confirmed publication/journal not repeated');
  f.f.change();await assert.rejects(f.f.persist(),/BINDING_CHANGED/);assert.equal(f.events.length,count);
 }finally{await f.dispose()}
});
