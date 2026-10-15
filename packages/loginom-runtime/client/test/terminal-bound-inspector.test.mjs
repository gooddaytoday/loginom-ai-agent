import test from 'node:test';import assert from 'node:assert/strict';
import {creationControl} from './terminal-capsule-provider.test.mjs';
import {observeStorageBound} from './terminal-bound-inspector.mjs';
test('bound inspector same packet/control exact operator admits four original callee/delegate activations',()=>creationControl(async x=>{
 const observer=observeStorageBound({provider:x.provider,context:x.f.c,guard:()=>x.host.c.token.guard()});x.realm.native.beforeDispatch(observer.beforeDispatch);
 try{
  await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const packet=x.provider.packet();
  const result=await x.host.witness.continueStorage(x.host.f.bridge),records=observer.inspect();
  assert.equal(records.length,4);assert.equal(new Set(records.map(r=>r.activationToken)).size,4);
  for(const row of records){assert(Object.isFrozen(row));assert.equal(row.callee,row.mkdelCompletion.returned);assert.equal(row.delegate,row.mkdelCall.delegate);assert.equal(row.receiver,packet.initial.storage);assert.equal(row.initial,packet.initial);assert.equal(row.packet,packet);assert.equal(row.boundCallQualified,true);assert.equal(row.operator.method,packet.initial.storageReaders[row.mkdelCall.scope.split('.')[1].split(':')[0]]);assert(Object.isFrozen(row.operator));assert.equal(Object.hasOwn(row.delegate,'apply'),false);assert.equal(row.closureIdentityQualified,false);assert.equal(row.nativeReceiversQualified,false)}
  assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);assert.equal(x.realm.native.writes(),0);
  for(const row of records){row.callee();row.callee()}assert.equal(observer.inspect().length,4);assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);
  assert.equal(result.reason,'NATIVE_LEXICAL_QUALIFICATION_MISSING');assert.equal(result.nativeReceiversQualified,false);assert.equal(result.componentReady,false);
 }catch(value){try{observer.inspect()}catch(detail){console.error('observer detail',detail)}throw value}finally{observer.close()}
},{originalSdk:true,invokeSdk:true,realCompletion:true}));
for(const alterLocal of ['replacement','proxy'])test('bound inspector local '+alterLocal+' at own operator refuses before relay',()=>creationControl(async x=>{
 const observer=observeStorageBound({provider:x.provider,context:x.f.c,guard:()=>x.host.c.token.guard(),alterLocal});x.realm.native.beforeDispatch(observer.beforeDispatch);
 try{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);await assert.rejects(x.host.witness.continueStorage(x.host.f.bridge));assert.throws(()=>observer.inspect(),/PAUSE_REFUSED|CALL_CHANGED/);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0)}finally{observer.close()}
},{originalSdk:true,invokeSdk:true,realCompletion:true}));
for(const mode of ['foreign receiver','premature returned','lower accessor'])test('bound inspector '+mode+' during pause does not mint dispatch receipt',()=>creationControl(async x=>{
 let gets=0;const observer=observeStorageBound({provider:x.provider,context:x.f.c,guard:()=>x.host.c.token.guard(),onPause({callee,delegate,receiver,lower}){
  if(mode==='foreign receiver')Reflect.apply(Object.getOwnPropertyDescriptor(delegate,'apply').value,delegate,[{...receiver},[]]);
  if(mode==='premature returned')callee();
  if(mode==='lower accessor')Object.defineProperty(lower,'mkdelCompletion',{configurable:true,get(){gets++;throw Error('foreign')}});
 }});x.realm.native.beforeDispatch(observer.beforeDispatch);
 try{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);await assert.rejects(x.host.witness.continueStorage(x.host.f.bridge));assert.throws(()=>observer.inspect());assert.equal(gets,0);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0)}finally{observer.close()}
},{originalSdk:true,invokeSdk:true,realCompletion:true}));
test('bound inspector missing breakpoint never admits storage dispatch',()=>creationControl(async x=>{
 const observer=observeStorageBound({provider:x.provider,context:x.f.c,guard:()=>x.host.c.token.guard(),skipBreakpoint:true});x.realm.native.beforeDispatch(observer.beforeDispatch);
 try{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);await assert.rejects(x.host.witness.continueStorage(x.host.f.bridge));assert.equal(observer.inspect().length,0);assert.deepEqual(x.realm.native.calls,[0])}finally{observer.close()}
},{originalSdk:true,invokeSdk:true}));
test('bound inspector direct transport outside activation refuses before relay',()=>creationControl(async x=>{
 const observer=observeStorageBound({provider:x.provider,context:x.f.c,guard:()=>x.host.c.token.guard()});x.realm.native.beforeDispatch(observer.beforeDispatch);
 try{assert.throws(()=>x.realm.native.session.DispatchMessageAsync({method:907}),/TOKEN_UNAVAILABLE/);assert.equal(observer.inspect().length,0);assert.deepEqual(x.realm.native.calls,[])}finally{observer.close()}
},{originalSdk:true,invokeSdk:true}));
for(const reason of [false,0,null,undefined,'',Error('bound first',{cause:0})])test('bound inspector raw '+String(reason)+' remains original rejection after observed dispatch',()=>{
 let held;const pending=new Promise(resolve=>held=resolve);return creationControl(async x=>{
  const observer=observeStorageBound({provider:x.provider,context:x.f.c,guard:()=>x.host.c.token.guard()});x.realm.native.beforeDispatch(observer.beforeDispatch);
  try{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const work=x.host.witness.continueStorage(x.host.f.bridge);work.catch(()=>{});await pending;
   x.realm.native.fail(reason);await x.realm.native.drain();let caught=false;try{await work}catch(value){caught=true;assert.equal(value,reason)}assert(caught);
   const records=observer.inspect();assert.equal(records.length,1);assert.equal(records[0].activationToken.lower.sourceTask.status,3);assert.notEqual(records[0].activationToken.lower.sourceSettled,true);assert.deepEqual(x.realm.native.calls,[0,907]);assert.equal(x.realm.native.writes(),0);
  }finally{observer.close()}
 },{originalSdk:true,invokeSdk:true,realCompletion:true,phaseHook(x,fn,method){if(fn.name==='readTerminalRealmStorage'&&method==='get_Connected'){x.realm.native.hold();queueMicrotask(held)}}});
});
test('bound inspector second token consumption in one activation refuses before relay',()=>creationControl(async x=>{
 const observer=observeStorageBound({provider:x.provider,context:x.f.c,guard:()=>x.host.c.token.guard()});x.realm.native.beforeDispatch(observer.beforeDispatch);let refused=0;
 x.probe.onDispatch=request=>{if(x.realm.native.calls.at(-1)!==0){assert.throws(()=>observer.beforeDispatch(request),/TOKEN_UNAVAILABLE/);refused++}};
 try{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);await x.host.witness.continueStorage(x.host.f.bridge);assert.equal(refused,4);assert.equal(observer.inspect().length,4);assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);assert.equal(x.realm.native.writes(),0)}finally{observer.close()}
},{originalSdk:true,invokeSdk:true,realCompletion:true,instrument:true}));
for(const mode of ['abort false','absolute expiry'])test('bound inspector original '+mode+' before resume refuses before storage dispatch',()=>creationControl(async x=>{
 const now=Date.now;const observer=observeStorageBound({provider:x.provider,context:x.f.c,guard:()=>x.host.c.token.guard(),onPause(){if(mode==='abort false')x.host.f.state.controller.abort(false);else Date.now=()=>x.host.f.wire.deadline}});x.realm.native.beforeDispatch(observer.beforeDispatch);
 try{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);let caught=false;try{await x.host.witness.continueStorage(x.host.f.bridge)}catch(value){caught=true;if(mode==='abort false')assert.equal(value,false);else assert.match(value.message,/RUN_EXPIRED/)}assert(caught);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0)}finally{Date.now=now;observer.close()}
},{originalSdk:true,invokeSdk:true,realCompletion:true}));
