import test from 'node:test';import assert from 'node:assert/strict';
import {creationControl} from './terminal-capsule-provider.test.mjs';
import {observeStorageBound} from './terminal-bound-inspector.mjs';
const fullScriptSha256='11ac2c63d2e8162b974f57d14e0f4f57b19cc80d3d39797be377e22eced6a973';
const options={originalSdk:true,invokeSdk:true,realCompletion:{fullStorage:true}};
const observe=(x,extra={})=>observeStorageBound({provider:x.provider,context:x.f.c,guard:()=>x.host.c.token.guard(),fullScriptSha256,...extra});
test('witness bound full pinned script observer admits exact four witness receipts without fixture gate',()=>creationControl(async x=>{
 const observer=observe(x);
 try{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const result=await x.host.witness.continueStorage(x.host.f.bridge),packet=x.provider.packet(),dispatches=x.provider.inspect().storageDispatches;
  assert.equal(dispatches.length,4);assert.equal(observer.inspect().length,4);
  for(const dispatch of dispatches){const receipt=dispatch.boundReceipt;
   assert(Object.isFrozen(receipt));assert.equal(receipt.operator.fullScript,true);assert.equal(receipt.operator.scriptSha256,fullScriptSha256);assert(receipt.operator.lineNumber>63000);
   assert.equal(receipt.receiver,packet.initial.storage);assert.equal(receipt.callee,dispatch.mkdelCompletion.returned);assert.equal(receipt.delegate,dispatch.mkdelCall.delegate);
   assert.equal(receipt.request,dispatch.request);assert.equal(receipt.initial,packet.initial);assert.equal(receipt.packet,packet);assert.equal(receipt.boundCallQualified,true);
   assert.equal(receipt.closureIdentityQualified,false);assert.equal(receipt.nativeReceiversQualified,false);assert.equal(Object.hasOwn(receipt.delegate,'apply'),false);
  }
  assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);assert.equal(x.realm.native.writes(),0);assert.equal(result.reason,'NATIVE_LEXICAL_QUALIFICATION_MISSING');assert.equal(result.componentReady,false);
 }catch(error){try{observer.inspect()}catch(e){console.error('witness observer detail',e)}throw error}finally{observer.close()}
},options));
for(const mode of ['absent observer','fixture allow','missing breakpoint'])test('witness bound '+mode+' cannot bypass witness before transport',()=>creationControl(async x=>{
 const observer=mode==='missing breakpoint'?observe(x,{skipBreakpoint:true}):undefined;
 if(mode==='fixture allow')x.realm.native.beforeDispatch(()=>true);
 try{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);await assert.rejects(x.host.witness.continueStorage(x.host.f.bridge));assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0)}finally{observer?.close()}
},options));
for(const alterLocal of ['replacement','proxy'])test('witness bound '+alterLocal+' local has no armed witness token',()=>creationControl(async x=>{
 const observer=observe(x,{alterLocal});try{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);await assert.rejects(x.host.witness.continueStorage(x.host.f.bridge));assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0)}finally{observer.close()}
},options));
test('witness bound full source hash and copied lower/token refuse without foreign getter',()=>creationControl(async x=>{
 assert.throws(()=>observe(x,{fullScriptSha256:'0'.repeat(64)}),/FULL_SCRIPT_REQUIRED/);
 let gets=0,checked=false;const observer=observe(x,{onPause({callee,receiver,lower,name,token}){
  if(checked)return;checked=true;
  assert.throws(()=>x.provider.retainBoundPause({...lower},callee,receiver,name,token.operator),/BOUND_UNAVAILABLE/);
  assert.throws(()=>x.provider.armBoundPause({...token}),/BOUND_UNAVAILABLE/);
  const foreign={get lower(){gets++;throw Error('foreign')}};assert.throws(()=>x.provider.armBoundPause(foreign),/BOUND_UNAVAILABLE/);
 }});
 try{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);await x.host.witness.continueStorage(x.host.f.bridge);assert(checked);assert.equal(gets,0);assert.deepEqual(x.realm.native.calls,[0,907,909,910,911])}finally{observer.close()}
},options));
test('witness bound excerpt FunctionExpression cannot receive full-script admission',()=>creationControl(async x=>{
 assert.throws(()=>observe(x),/FULL_SCRIPT_REQUIRED/);assert.deepEqual(x.realm.native.calls,[]);
},{originalSdk:true,invokeSdk:true,realCompletion:true}));
test('witness bound replayed arm is refused before transport',()=>creationControl(async x=>{
 const observer=observe(x,{onPause({token}){x.provider.armBoundPause(token)}});
 try{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);await assert.rejects(x.host.witness.continueStorage(x.host.f.bridge));assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0)}finally{observer.close()}
},options));
for(const reason of [false,0,null,undefined,'',Error('witness bound first',{cause:0})])test('witness bound raw '+String(reason)+' stays first with original task pending',()=>{
 let held;const pending=new Promise(resolve=>held=resolve);return creationControl(async x=>{
  const observer=observe(x);try{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const work=x.host.witness.continueStorage(x.host.f.bridge);work.catch(()=>{});await pending;
   x.realm.native.fail(reason);await x.realm.native.drain();let caught=false;try{await work}catch(value){caught=true;assert.equal(value,reason)}assert(caught);
   const rows=observer.inspect();assert.equal(rows.length,1);assert.equal(rows[0].activationToken.lower.sourceTask.status,3);assert.notEqual(rows[0].activationToken.lower.sourceSettled,true);assert.deepEqual(x.realm.native.calls,[0,907]);assert.equal(x.realm.native.writes(),0);
  }finally{observer.close()}
 },{...options,phaseHook(x,fn,method){if(fn.name==='readTerminalRealmStorage'&&method==='get_Connected'){x.realm.native.hold();queueMicrotask(held)}}});
});
for(const mode of ['abort false','absolute expiry'])test('witness bound original '+mode+' before resume prevents dispatch',()=>creationControl(async x=>{
 const now=Date.now,observer=observe(x,{onPause(){if(mode==='abort false')x.host.f.state.controller.abort(false);else Date.now=()=>x.host.f.wire.deadline}});
 try{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);let caught=false;try{await x.host.witness.continueStorage(x.host.f.bridge)}catch(value){caught=true;if(mode==='abort false')assert.equal(value,false);else assert.match(value.message,/RUN_EXPIRED/)}assert(caught);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0)}finally{Date.now=now;observer.close()}
},options));
