import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {durabilityFixture,serial} from './startup-durability-fixture.mjs';
const source=process.env.STARTUP_SOURCE??new URL('../src/connection-check.mjs',import.meta.url).pathname;
const managed=process.env.STARTUP_MANAGED??new URL('../src/managed-entry.mjs',import.meta.url).pathname;
const values=[Error('primary storage',{cause:0}),undefined,null,false,0,''];
async function proof(f,label){if(process.env.REVIEW_RESULTS)await writeFile(join(process.env.REVIEW_RESULTS,label+'.json'),JSON.stringify({fixture:true,events:f.events,native:f.native(),context:f.context(),evidence:f.owner.evidence},null,2)+'\n')}
for(const phase of ['file_open','write','file_sync','file_close','rename','directory_open','directory_sync','directory_close'])for(const when of ['before','after','context'])for(const [i,value] of values.entries())test('producer '+phase+' '+when+' '+i+' preserves exact refusal; retry does not repeat native result',async()=>{
 const f=await durabilityFixture({source,managed,phase,when,rejected:value});
 try{
  let error,failed=false;try{await f.lifecycle.close()}catch(e){error=e;failed=true}
  assert.equal(failed,true);assert.equal(error.message,'LOGINOM_RUNTIME_CLEANUP_FAILED');assert.equal(error.cause,value);assert.equal(f.owner.cleanupFailure,value);assert.equal(f.context(),when==='context'?1:0);
  assert.notEqual(f.lifecycle.state.shutdown.stages.at(-1).status,'allowed');assert.equal(f.owner.closed,undefined);
  assert.equal(f.native(),when==='before'?0:1);assert.ok(f.owner.evidence.persistence_attempts.length>0);
  const first=JSON.stringify(f.owner.evidence.first_guard);await f.lifecycle.close();
  assert.equal(f.native(),1);assert.equal(f.context(),1);assert.equal(f.owner.closed,true);assert.equal(JSON.stringify(f.owner.evidence.first_guard),first);
  assert.equal(f.lifecycle.state.shutdown.stages.at(-1).stage,'outer_acknowledgement');
  assert.equal(f.lifecycle.state.shutdown.stages.at(-1).status,'allowed');
  const durable=JSON.parse(await readFile(join(f.directory,'startup-cleanup.json'),'utf8'));assert.equal(durable.cleanup_complete,true);
  assert.deepEqual(durable.persistence_attempts[0].rejection,serial(value));await proof(f,phase+'-'+when+'-'+i);
 }finally{await f.dispose()}
});
test('write refusal0 and close refusal preserve primary plus secondary, without early context exit',async()=>{
 const f=await durabilityFixture({source,phase:'write',rejected:0,writeAndClose:true});
 try{let error;try{await f.owner.close()}catch(e){error=e}assert.equal(error,0);assert.equal(f.context(),0);
  const p=f.owner.evidence.persistence_attempts[0];assert.equal(p.rejection.value,0);assert.equal(p.secondary[0].phase,'file_close');
  await f.owner.close();assert.equal(f.native(),1);assert.equal(f.context(),1)}finally{await f.dispose()}
});
for(const [i,value]of values.entries())test('authentication primary and producer sync refusal stay separate '+i,async()=>{
 const f=await durabilityFixture({source,phase:'file_sync',rejected:0,primary:{value}});
 try{await assert.rejects(f.owner.close(),e=>e===0);assert.equal(f.owner.primaryFailure,value);assert.deepEqual(f.owner.evidence.primary_rejection,serial(value));await f.owner.close();assert.equal(f.owner.primaryFailure,value);assert.equal(f.native(),1)}finally{await f.dispose()}
});
test('first guard is immutable; actual retry operands/time are separately durable',async()=>{
 const f=await durabilityFixture({source,guard:{value:undefined}});
 try{await assert.rejects(f.owner.close());const first=JSON.stringify(f.owner.evidence.first_guard);f.map.HasRunningNodes=()=>false;await f.owner.close();
  const e=JSON.parse(await readFile(join(f.directory,'startup-cleanup.json'),'utf8'));assert.equal(JSON.stringify(e.first_guard),first);
  assert.equal(e.guard_observations.length,2);assert.equal(e.guard_observations[0].snapshot.running.is_undefined,true);
  assert.equal(e.guard_observations[1].snapshot.running.value,false);assert.equal(e.guard_observations[1].owner_id,f.owner.id);
  assert.equal(e.guard_observations[1].snapshot.deadline,null);assert.ok(e.guard_observations[1].snapshot.observed_at);await proof(f,'retry-operands');
 }finally{await f.dispose()}
});

test('lost context reply preserves cause and prevents second context/native close',async()=>{
 const f=await durabilityFixture({source,managed});
 try{const close=f.owner.context.close;f.owner.context.close=async()=>{await close();throw 0};
  await assert.rejects(f.lifecycle.close(),e=>e.message==='LOGINOM_RUNTIME_CLEANUP_FAILED'&&e.cause===0);f.owner.context.pages=()=>[];
  await assert.rejects(f.lifecycle.close(),e=>e.message==='LOGINOM_RUNTIME_CLEANUP_FAILED'&&e.cause?.message==='LOGINOM_STARTUP_CONTEXT_UNKNOWN'&&e.cause.cause===0);
  assert.equal(f.owner.contextCloseFailure,0);assert.equal(f.native(),1);assert.equal(f.context(),1);assert.notEqual(f.owner.closed,true);
 }finally{await f.dispose()}
});
