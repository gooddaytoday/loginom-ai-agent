import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,stat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServerDownloadRegistry,serverDownloadBudget} from '../lib/storage-policy.mjs';

const source=()=>({verified:true,kind:'storage',server_source_ref:'storage-one',destination:'/worker/full.csv',
 bytes:3,mtime:'2026-10-28T00:00:00Z',origin:'https://app.loginom.ai',account:'worker',document_id:'doc'});
async function fixture(t,transfer) {
 const root=await mkdtemp(join(tmpdir(),'server-cache-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const current=source(),registry=createServerDownloadRegistry({directory:join(root,'cache'),
  inspect:async()=>structuredClone(current),download:transfer??(async({path})=>writeFile(path,'abc'))});
 return {root,current,registry,request:{operation_id:'download',server_source_ref:'storage-one'}};
}
async function settled(registry,id='download') {
 while(registry.status(id).state==='running')await registry.wait(id,{timeoutMs:100});
 return registry.status(id);
}
test('server download deadline is size-derived and capped without a global timeout change',()=>{
 assert.equal(serverDownloadBudget(0),120000);
 assert.equal(serverDownloadBudget(2*1024**3),529600);
 assert.equal(serverDownloadBudget(100*1024**3),7200000);
 for(const value of [-1,NaN,Infinity,1.5])assert.throws(()=>serverDownloadBudget(value));
});
test('download writes a private cache, binds its receipt to native identity and never uploads',async t=>{
 const f=await fixture(t);f.registry.start(f.request);
 const result=await settled(f.registry);assert.equal(result.status,'SUCCEEDED');
 const path=result.output.path;assert.equal((await stat(join(f.root,'cache'))).mode&0o777,0o700);
 assert.equal((await stat(path)).size,3);
 const receipt={basis:'backend_exact_scan',profile_id:'p',records:1,bytes:3,sha256:'a'.repeat(64),
  identity:{canonical_path:path,size:3,file_id:`${(await stat(path)).dev}:${(await stat(path)).ino}`,
   mtime:(await stat(path)).mtimeMs,ctime:(await stat(path)).ctimeMs}};
 assert.equal((await f.registry.bind(source(),receipt)).sha256,receipt.sha256);
 assert.equal((await f.registry.bind(source(),{...receipt,identity:{...receipt.identity,canonical_path:'/foreign'}})).sha256,undefined);
 assert.equal((await f.registry.bind({...source(),mtime:'changed'},receipt)).sha256,undefined);
 await f.registry.cleanup();assert.deepEqual(await readdir(join(f.root,'cache')),[]);
});
test('changed native size/mtime or wrong copy size invalidates download and removes partials',async t=>{
 for(const kind of ['size','mtime','copy']){
  const f=await fixture(t,async({path})=>{await writeFile(path,kind==='copy'?'abcd':'abc');
   if(kind==='size')f.current.bytes++;if(kind==='mtime')f.current.mtime='changed';});
  f.registry.start(f.request);const result=await settled(f.registry);
  assert.equal(result.status,'FAILED');assert.equal(result.cleanup_complete,true);
  assert.match(result.error.code,/FILE_CHANGED/);assert.deepEqual(await readdir(join(f.root,'cache')),[]);
 }
});
test('cancel drains the actual transfer before deleting partials; IDs cannot replay a download',async t=>{
 let transfers=0,release;
 const f=await fixture(t,async({path,signal})=>{transfers++;await writeFile(path,'a');
  await new Promise(resolve=>{release=resolve;signal.addEventListener('abort',resolve,{once:true});});signal.throwIfAborted();});
 f.registry.start(f.request);while(!release)await new Promise(resolve=>setTimeout(resolve,1));
 f.registry.start(f.request);assert.equal(transfers,1);
 assert.throws(()=>f.registry.start({...f.request,server_source_ref:'other'}),/different/);
 f.registry.cancel('download');const result=await settled(f.registry);
 assert.equal(result.status,'FAILED');assert.equal(result.cancel_requested,true);assert.equal(result.cleanup_complete,true);
 assert.deepEqual(await readdir(join(f.root,'cache')),[]);
 await f.registry.cleanup();
});
