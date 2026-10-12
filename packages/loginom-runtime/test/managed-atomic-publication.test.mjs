import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import * as fs from 'node:fs';import * as fsp from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
const source=await fsp.readFile(process.env.MANAGED_MODULE??new URL('../src/managed-entry.mjs',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function closeRejection('),source.indexOf('function close()'));
for(const scenario of ['normal','write-failure','rename-failure','rename-lost','directory-sync','final-symlink'])test('managed receiving atomic '+scenario+' (real FS/IO projections doubles)',async()=>{
 const directory=await fsp.mkdtemp(join(tmpdir(),'lab69-managed-atomic-')),path=join(directory,'managed-shutdown.json'),old='{\"original\":true}\n';
 const state={session:{directory}},events=[],fds=new Set(),meta=new Map();let inject=true,deliver;
 await fsp.writeFile(path,old,{mode:0o600});
 const open=(p,flags,mode,cb)=>{events.push({stage:'open',kind:p===directory?'directory':'file',flags,mode});fs.open(p,flags,mode,(e,fd)=>{if(!e){fds.add(fd);meta.set(fd,p===directory?'directory':'file')}cb(e,fd)})};
 const write=(fd,bytes,cb)=>{if(scenario==='write-failure'&&inject){inject=false;cb(Error('write',{cause:0}));return;}fs.writeFile(fd,bytes,cb)};
 const sync=(fd,cb)=>{if(scenario==='directory-sync'&&meta.get(fd)==='directory'&&inject){inject=false;cb(false);return;}
  fs.fsync(fd,e=>{events.push({stage:'sync-complete',kind:meta.get(fd)});cb(e)})};
 const close=(fd,cb)=>fs.close(fd,e=>{if(!e)fds.delete(fd);events.push({stage:'close-complete',kind:meta.get(fd)});cb(e)});
 const rename=(a,b,cb)=>{events.push({stage:'rename'});if(scenario==='rename-failure'&&inject){inject=false;cb(Error('rename',{cause:false}));return;}
  fs.rename(a,b,e=>{if(scenario==='rename-lost'&&inject)deliver=()=>{inject=false;cb(e)};else cb(e)});
  if(scenario==='rename-lost'&&inject)throw 0;
 };
 const api=vm.runInNewContext(code+';({write:()=>recordClose("atomic",{status:"observed"})})',{state,evidenceOpen:open,evidenceWrite:write,evidenceSync:sync,evidenceClose:close,evidenceRename:rename,evidenceConstants:fs.constants,randomUUID,join,Promise,Error});
 let target;try{
  if(scenario==='final-symlink'){target=join(directory,'target');await fsp.writeFile(target,'unchanged');await fsp.unlink(path);await fsp.symlink(target,path);}
  if(['write-failure','rename-failure','rename-lost','directory-sync'].includes(scenario)){
   await assert.rejects(api.write());assert.ok(state.evidencePrimary);
   if(['write-failure','rename-failure'].includes(scenario))assert.equal(await fsp.readFile(path,'utf8'),old);
   if(scenario==='rename-lost'){
    while(!deliver)await new Promise(r=>setTimeout(r,1));const n=events.filter(e=>e.stage==='open').length;
    await assert.rejects(api.write(),e=>e===0);assert.equal(events.filter(e=>e.stage==='open').length,n);assert.equal(events.some(e=>e.kind==='directory'),false);deliver();
   }
  }
  await api.write();assert.equal(state.evidenceWriters.size,0);assert.equal((await fsp.stat(path)).mode&0o777,0o600);
  assert.ok(JSON.parse(await fsp.readFile(path,'utf8')).stages.some(s=>s.stage==='atomic'));
  if(target){assert.equal(await fsp.readFile(target,'utf8'),'unchanged');assert.equal((await fsp.lstat(path)).isSymbolicLink(),false);}
  const opened=events.find(e=>e.stage==='open'&&e.kind==='file');for(const flag of [fs.constants.O_EXCL,fs.constants.O_NOFOLLOW,fs.constants.O_CREAT])assert.equal(opened.flags&flag,flag);
  assert.ok(events.findIndex(e=>e.stage==='close-complete'&&e.kind==='file')<events.findIndex(e=>e.stage==='rename'));
  assert.ok(events.some(e=>e.stage==='sync-complete'&&e.kind==='directory'));assert.ok(events.some(e=>e.stage==='close-complete'&&e.kind==='directory'));
 }finally{if(deliver)deliver();for(const fd of fds)await new Promise(r=>fs.close(fd,()=>r()));await fsp.rm(directory,{recursive:true,force:true})}
});
