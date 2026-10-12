import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readFile,writeFile,open,lstat,mkdtemp,mkdir,rm,symlink,link,readdir} from 'node:fs/promises';
import {open as evidenceOpen,writeFile as evidenceWrite,fsync as evidenceSync,close as evidenceClose,rename as evidenceRename,constants} from 'node:fs';
import {randomUUID} from 'node:crypto';import {join} from 'node:path';import {tmpdir} from 'node:os';
const source=await readFile(process.env.BRIDGE_MODULE??new URL('../lib/bridge.mjs',import.meta.url),'utf8');
const rejection=source.slice(source.indexOf('function shutdownRejection('),source.indexOf('\n}',source.indexOf('function shutdownRejection('))+2);
const code=source.slice(source.indexOf('    async function writeCleanupReceipt'),source.indexOf('    function closeBridge'));
for(const scenario of ['normal','symlink','hardlink','directory-symlink','exclusive','late-target','late-owner','rename-pending'])test('cleanup atomic '+scenario,async()=>{
 const root=await mkdtemp(join(tmpdir(),'managed-atomic-')),directory=join(root,'dir');await mkdir(directory);
 const path=join(directory,'package-cleanup.json'),sentinel=join(root,'sentinel');await writeFile(sentinel,'SENTINEL\n');
 if(scenario==='symlink')await symlink(sentinel,path);if(scenario==='hardlink')await link(sentinel,path);
 const selected=scenario==='directory-symlink'?join(root,'alias'):directory;if(scenario==='directory-symlink')await symlink(directory,selected);
 if(scenario==='exclusive')await writeFile(join(directory,'.package-cleanup.fixed.tmp'),'EXCLUSIVE');
 const session={directory:selected,metadata:{sessionId:'own'}},receipt=Object.freeze({status:'SUCCEEDED',session_id:'own'}),state={session},events=[];let deliver,firstClose=true,renameFault=true;
 const writer=vm.runInNewContext(`let confirmedCleanup=receipt,cleanupEvidenceBinding,cleanupReceiptWritten=false,cleanupPersistencePrimary,cleanupPublication;const cleanupWriters=new Set(),cleanupPersistenceFailures=[];${rejection}\n${code};({write:writeCleanupReceipt,inspect:()=>({publication:cleanupPublication,primary:cleanupPersistencePrimary,marker:cleanupReceiptWritten})})`,{session,receipt,Error,Promise,Set,join,lstat,constants,randomUUID:()=>scenario==='exclusive'?'fixed':randomUUID(),
  receiptOpen:(p,f,m,cb)=>{events.push({stage:'open',path:p,flags:f});evidenceOpen(p,f,m,cb)},
  receiptWrite:(fd,b,cb)=>evidenceWrite(fd,b,cb),receiptSync:(fd,cb)=>evidenceSync(fd,e=>{events.push({stage:'sync'});cb(e)}),
  receiptClose:(fd,cb)=>evidenceClose(fd,async e=>{events.push({stage:'close'});if(firstClose){firstClose=false;if(scenario==='late-target')await symlink(sentinel,path);if(scenario==='late-owner')state.session.directory=root}cb(e)}),
  receiptRename:(a,b,cb)=>{events.push({stage:'rename'});if(scenario==='rename-pending'&&renameFault){renameFault=false;evidenceRename(a,b,e=>{deliver=()=>cb(e)});throw 0}evidenceRename(a,b,cb)},
 });
 const record=()=>writer.write(receipt);
 try{
  if(scenario==='normal'){await record('atomic',{fixture:true});assert.equal((await lstat(path)).mode&0o777,0o600);assert.equal((await readdir(directory)).some(x=>x.endsWith('.tmp')),false);assert.equal(events.findIndex(x=>x.stage==='rename')>events.findIndex(x=>x.stage==='close'),true);assert.deepEqual(events.slice(-2).map(x=>x.stage),['sync','close']);}
  else if(scenario==='rename-pending'){
   let rejected=false;try{await record('first',{})}catch(e){rejected=true;assert.equal(e,0)}assert.equal(rejected,true);
   const opens=events.filter(x=>x.stage==='open').length;try{await record('blocked',{})}catch(e){assert.equal(e,0)}assert.equal(events.filter(x=>x.stage==='open').length,opens);
   while(!deliver)await new Promise(r=>setTimeout(r,1));deliver();assert.equal(writer.inspect().publication.confirmed,true);
   await record('repair',{});assert.equal(writer.inspect().primary.value,0);
   assert.equal(events.filter(x=>x.stage==='rename').length,2); // New evidence, not replay of the original rename.
  }else{await assert.rejects(record('refused',{}));assert.equal(events.some(x=>x.stage==='rename'),false)}
  assert.equal(await readFile(sentinel,'utf8'),'SENTINEL\n');
  if(scenario==='exclusive')assert.equal(await readFile(join(directory,'.package-cleanup.fixed.tmp'),'utf8'),'EXCLUSIVE');
 }finally{await rm(root,{recursive:true,force:true})}
});
