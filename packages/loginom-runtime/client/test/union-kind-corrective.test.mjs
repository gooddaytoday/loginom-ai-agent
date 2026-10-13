import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fixture,deferred,unionCleanupWitness} from './reviewer-kind-fixture.mjs';
for(const primary of [Error('original',{cause:0}),undefined,null,false,0,'']) {
 test('canonical original request preserves primary '+String(primary)+' through storage-only repair',async()=>{
  const f=await fixture('transform.union_data');
  try {
   // Mint a fresh scope with this raw first failure; no helper invocation.
   const {retainUnionConfigureCleanup}=await import(process.env.UNION_CLEANUP_MODULE);
   const p=f.operation,tuple=f.tuple,current=f.current;let close=0,read=0,write=0;
   const originalClose=async()=>{close++;};tuple.close=originalClose;current.close=originalClose;
   const originalRequest=JSON.stringify(p.parameters),before=structuredClone(p);
   const failure=Error('durable write refused',{cause:false});
   const scope=retainUnionConfigureCleanup({operation:p,tuple,current:()=>current,
    prepared:{wizard:{status:'observed',root_ref:'r',root_tid:'w',stage:'union',owner_context:{status:'observed'}},prepared_node_context:{verified:true,surface:'wizard',...p.nodeApply.node}},
    originalClose,observeTerminal:async()=>{read++;return {wizard:{status:'absent'},prepared_node_context:{verified:true,surface:'graph',locked:false,...p.nodeApply.node},ui:{dialogs:[],masks:[]}};},
    record:async r=>{write++;if(write===1)throw failure;const fd=await open(join(f.directory,'repair.json'),'wx',0o600);try{await fd.writeFile(JSON.stringify(r));await fd.sync();}finally{await fd.close();}return JSON.parse(await readFile(join(f.directory,'repair.json'),'utf8'));},signal:f.abort.signal,deadline:1000,now:()=>0});
   scope.holdFailure(primary);await assert.rejects(scope.complete(),e=>e===failure);
   assert.equal(scope.primary,primary);assert.equal(scope.secondary[0],failure);
   assert(unionCleanupWitness(await scope.complete(),p));assert.deepEqual([close,read,write],[1,1,2]);
   assert.equal(JSON.stringify(p.parameters),originalRequest);assert.deepEqual(p,before);assert.equal(p.outcome.status,'AMBIGUOUS');assert.equal(p.nodeApply.pending.phase,'configure');
  }finally{await f.cleanup();}
 });
}
test('canonical receipt hashes original request; one pending callback, same witness, no replay',async()=>{
 const f=await fixture('transform.union_data');
 try {
  const d=deferred(),started=deferred(),before=structuredClone(f.operation);
  f.closeHook(async()=>{started.resolve();return d.promise;});const work=f.scope.complete();await started.promise;
  assert.equal(f.scope.complete(),work);assert.deepEqual(f.counts,{close:1,read:0,write:0});d.resolve();
  const proof=await work;assert(unionCleanupWitness(proof,f.operation));assert.equal(await f.scope.complete(),proof);
  const receipt=JSON.parse(await readFile(join(f.directory,'partial.json'),'utf8'));
  assert.equal(receipt.request_sha256,createHash('sha256').update(JSON.stringify(before.parameters)).digest('hex'));
  assert.equal(receipt.operation_id,before.id);assert.equal(receipt.signature,before.signature);
  assert.equal(receipt.release_authority,false);assert.equal(receipt.package_saved,false);assert.equal(receipt.native_replay,false);
  assert.deepEqual(f.operation,before);assert.deepEqual(f.counts,{close:1,read:1,write:1});
 }finally{await f.cleanup();}
});
test('kind drift after confirmed Close refuses, original restoration permits only storage completion',async()=>{
 const f=await fixture('transform.union_data');
 try {
  f.closeHook(async()=>{f.operation.parameters.target.type='transform.union';});
  await assert.rejects(f.scope.complete());assert.deepEqual(f.counts,{close:1,read:0,write:0});
  f.operation.parameters.target.type='transform.union_data';const awaitableProof=await f.scope.complete();assert(unionCleanupWitness(awaitableProof,f.operation));
  assert.deepEqual(f.counts,{close:1,read:1,write:1});
  f.operation.parameters.target.type='transform.union';assert.throws(()=>unionCleanupWitness(awaitableProof,f.operation));
 }finally{await f.cleanup();}
});
