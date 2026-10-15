import test from 'node:test';import assert from 'node:assert/strict';
import {createReplacementStartupBridge as createStartupBridge} from '../replacement-live-owner.mjs';
function fixture(){
 const order=[],context={close:()=>{order.push('exit');}},page={},startup={id:'private-owner'},owner={};
 const bridge=createStartupBridge(startup,owner);bridge.captureContext(context);bridge.capturePage(page);
 startup.close=async()=>{order.push('same-owner-guard');order.push('durable-native-proof');context.close();startup.closed=true;return {owner_id:startup.id,cleanup_complete:true,context_closed:true,logged_out:false};};
 return {order,context,page,startup,owner,bridge};
}
for(const stage of ['observer','init','login','journal','runtime','inventory'])test('caller '+stage+' refusal retains current handles and independent causes',async()=>{
 const f=fixture(),primary=Error(stage),evidence=Error('evidence'),cleanup=Error('cleanup');
 if(stage==='runtime'||stage==='inventory')f.owner.runtime={hasUnsettledWork:()=>false};
 f.startup.primaryFailure=primary;const wrapper=Error('helper wrapper',{cause:primary});
 f.bridge.fail(wrapper,stage);f.bridge.evidenceFailure(evidence);f.startup.close=async()=>{throw cleanup;};
 await assert.rejects(f.owner.recover(),e=>e===cleanup);
 assert.equal(f.owner.primaryFailure,primary);assert.equal(f.owner.entryFailure,wrapper);
 assert.equal(f.owner.evidenceFailures[0],evidence);assert.equal(f.owner.cleanupFailure,cleanup);
 assert.equal(f.owner.context,f.context);assert.equal(f.owner.page,f.page);assert.equal(typeof f.owner.execute,'function');assert.equal(typeof f.owner.recover,'function');
 assert.equal(f.owner.closed,undefined);assert.deepEqual(f.order,[]);
});
for(const value of [undefined,null,false,0,''])test('caller raw '+String(value)+' is not replaced by later evidence/cleanup rejection',async()=>{
 const f=fixture();f.startup.primaryFailure=value;f.bridge.fail(Error('wrapped',{cause:value}),'login');f.bridge.evidenceFailure(Error('persist'));
 const cleanup=Error('cleanup');f.startup.close=async()=>{throw cleanup;};await assert.rejects(f.owner.recover(),e=>e===cleanup);
 assert.ok(Object.hasOwn(f.owner,'primaryFailure'));assert.ok(Object.is(f.owner.primaryFailure,value));assert.equal(f.owner.closed,undefined);
});
test('caller partial setup retains context with no Page and refuses handoff',()=>{
 const owner={},startup={},bridge=createStartupBridge(startup,owner),context={};bridge.captureContext(context);const cause=Error('page getter');bridge.fail(cause,'observer');
 assert.equal(owner.context,context);assert.equal(owner.page,undefined);assert.equal(owner.primaryFailure,cause);
 assert.throws(()=>bridge.fulfilled({context}),/HANDOFF/);
});
test('caller cleanup confirmation precedes exit; unauthenticated result is not logout',async()=>{
 const f=fixture();f.bridge.fulfilled({context:f.context});const receipt=await f.owner.recover();assert.equal(receipt.logged_out,false);assert.equal(f.owner.closed,true);
 assert.deepEqual(f.order,['same-owner-guard','durable-native-proof','exit']);
});
test('caller incomplete cleanup is not successful teardown',async()=>{
 const f=fixture();f.startup.close=async()=>({owner_id:f.startup.id,cleanup_complete:false,context_closed:false});
 await assert.rejects(f.owner.recover(),/CLEANUP_UNCONFIRMED/);assert.equal(f.owner.closed,undefined);assert.deepEqual(f.order,[]);
});
test('caller pending preserves same owner without calling cleanup',async()=>{
 const f=fixture();f.owner.runtime={hasUnsettledWork:()=>true};await assert.rejects(f.owner.recover(),/PENDING/);assert.deepEqual(f.order,[]);
});
test('caller foreign Page refuses cleanup and handoff',async()=>{
 const f=fixture();f.owner.page={};await assert.rejects(f.owner.recover(),/OWNER_CHANGED/);assert.throws(()=>f.bridge.capturePage({}),/PAGE_CHANGED/);assert.deepEqual(f.order,[]);
});
test('caller fulfilled handoff preserves runtime handles and lifecycle cleanup route',()=>{
 const f=fixture();f.bridge.fulfilled({context:f.context});const execute=f.owner.execute,runtime={hasUnsettledWork:()=>false},recover=()=>{};
 f.bridge.handoff({context:f.context,page:f.page,execute,runtime},(options,owner)=>{Object.assign(owner,{...options,recover});});
 assert.equal(f.owner.context,f.context);assert.equal(f.owner.page,f.page);assert.equal(f.owner.execute,execute);assert.equal(f.owner.runtime,runtime);assert.equal(f.owner.recover,recover);assert.equal(f.owner.phase,'replacement');
});
test('caller evidence failure cannot authorize handoff after primary refusal',()=>{
 const f=fixture();f.bridge.fail(false,'observer');f.bridge.evidenceFailure(Error('persist'));assert.throws(()=>f.bridge.fulfilled({context:f.context}),/HANDOFF/);assert.equal(f.owner.primaryFailure,false);
});
test('caller falsy cleanup rejection remains independent and never confirms exit',async()=>{
 const f=fixture(),primary=Error('init');f.bridge.fail(primary,'init');f.startup.close=async()=>{throw false;};
 await assert.rejects(f.owner.recover(),value=>Object.is(value,false));assert.equal(f.owner.primaryFailure,primary);assert.equal(f.owner.cleanupFailure,false);assert.equal(f.owner.closed,undefined);assert.deepEqual(f.order,[]);
});
test('caller falsy evidence cause is retained separately from login rejection',()=>{
 const f=fixture();f.startup.primaryFailure=null;const wrapper=Error('wrapper',{cause:null});f.bridge.fail(wrapper,'login');f.bridge.evidenceFailure(false);
 assert.equal(f.owner.primaryFailure,null);assert.equal(f.owner.entryFailure,wrapper);assert.equal(f.owner.evidenceFailures[0],false);assert.equal(f.owner.context,f.context);
});
