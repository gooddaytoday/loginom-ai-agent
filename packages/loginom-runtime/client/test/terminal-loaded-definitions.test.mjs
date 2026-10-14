// Page, loader, Saltarelle task and native session are explicit CODE/OFFLINE doubles.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './terminal-user-lower.test.mjs';
import {setup} from './terminal-provider-boundary-fixture.mjs';
async function control(fn){const realm=await setup(60000,'retain-only');try{await fn(await fixture({realm}),realm)}finally{await realm.native.drain();await realm.native.cleanup()}}
async function finish(f){const task=f.invoke();f.deliver();await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();return f.inspect()}
test('defining exports retained before original acquisition; receipt never grants closure/native authority',()=>control(async f=>{
 const original=f.c.bg.rpc.TIBGFileStorage_Proxy,held=await finish(f),r=held.acquisition.loadedDefinitions;
 assert(Object.isFrozen(r));assert(Object.isFrozen(r.bindings));assert.equal(r.complete,true);
 assert.equal(r.bindings.FileStorage,original);assert.equal(r.bindings.connected,original.prototype.get_Connected);
 assert.equal(r.bindings.taskConstructor,f.c.ss.TaskCompletionSource);assert.equal(r.closureIdentityQualified,false);
 assert.equal(held.nativeReceiversQualified,false);assert.deepEqual(f.counts(),[1,1,1]);
}));
for(const change of ['namespace','constructor','method','flags','shadow','prototype'])test('pre-acquisition loaded custody detects pending '+change+' without resolver/replay',()=>control(async f=>{
 const task=f.invoke();let settled=false;task.then(()=>settled=true,()=>settled=true);
 const storage=f.c.bg.rpc.TIBGFileStorage_Proxy,proto=storage.prototype;
 if(change==='namespace')f.c.bg.rpc={...f.c.bg.rpc};
 if(change==='constructor')f.c.bg.rpc.TIBGFileStorage_Proxy={prototype:proto};
 if(change==='method')proto.get_Connected=function(){return true};
 if(change==='flags'){const d=Object.getOwnPropertyDescriptor(proto,'get_Connected');Object.defineProperty(proto,'get_Connected',{...d,enumerable:!d.enumerable})}
 if(change==='shadow')Object.defineProperty(storage,'prototype',{value:Object.create(proto),configurable:true});
 if(change==='prototype')Object.setPrototypeOf(proto,{});
 f.deliver();await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(settled,false);assert.deepEqual(f.counts(),[1,1,0]);
}));
test('pending defining-method accessor is rejected getter0',()=>control(async f=>{
 f.invoke();let getters=0;Object.defineProperty(f.c.bg.rpc.TIBGFileStorage_Proxy.prototype,'get_Connected',{configurable:true,get(){getters++;return ()=>true}});
 f.deliver();await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(getters,0);assert.deepEqual(f.counts(),[1,1,0]);
}));
for(const error of [false,0,null,undefined,'',Error('first',{cause:0})])test('raw lower rejection wins later export drift '+String(error),()=>control(async f=>{
 const task=f.invoke();f.c.bg.rpc={};f.fail(error);f.deliver();await assert.rejects(task,v=>Object.is(v,error));await f.settle();
 let caught,failed=false;try{f.inspect()}catch(e){failed=true;caught=e}assert(failed);assert.equal(caught,error);assert.deepEqual(f.counts(),[1,1,0]);
}));
test('missing exports stay partial; later export publication cannot qualify this attempt',async()=>{
 const f=await fixture(),task=f.invoke();f.deliver();await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();
 const r=f.inspect().acquisition.loadedDefinitions;assert.equal(r.complete,false);assert.equal(r.closureIdentityQualified,false);
 f.c.bg.rpc={};assert.throws(f.inspect,/UNAVAILABLE/);assert.deepEqual(f.counts(),[1,1,1]);
});
test('replacement after success is refused without another original reader',()=>control(async f=>{
 await finish(f);f.c.rpc.GuidHelper={};assert.throws(f.inspect,/UNAVAILABLE/);assert.deepEqual(f.counts(),[1,1,1]);
}));
test('initial defining-export accessor is never invoked; ordinary acquisition is not replayed',()=>control(async f=>{
 let getters=0;Object.defineProperty(f.c.bg.rpc,'TIBGFileStorage_Proxy',{configurable:true,get(){getters++;return {}}});
 const task=f.invoke();f.deliver();await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();
 assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(getters,0);assert.deepEqual(f.counts(),[1,1,1]);
}));
