import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
import{runInContext}from'node:vm';import{webcrypto,createHash}from'node:crypto';
import{setup}from'./terminal-provider-boundary-fixture.mjs';
const {terminalUserPublisherScript}=await import(process.env.TERMINAL_USER_PUBLISHER_MODULE??new URL('../lib/terminal-user-publisher.mjs',import.meta.url));
const {retainTerminalPrepareInvocation,invokeTerminalPrepareInvocation}=await import(process.env.TERMINAL_INVOCATION_MODULE??new URL('../lib/terminal-prepare-invocation.mjs',import.meta.url));
const source=await readFile(process.env.TERMINAL_USER_SOURCE,'utf8');
assert.equal(createHash('sha256').update(source).digest('hex'),'884660d99890c59fa5a54f2b245255df98b8aff20a5106c1c2fdaa33723888ea');
async function control(fn){const f=await setup(60000,'retain-only');try{
 Object.assign(f.page.context,{crypto:webcrypto,TextEncoder,Debug:{assert:assert.ok},__awaiter(self,a,b,generator){
  const it=generator.call(self);return new Promise((resolve,reject)=>{const step=(key,value)=>{let r;try{r=it[key](value)}catch(e){reject(e);return}
   if(r.done)resolve(r.value);else Promise.resolve(r.value).then(v=>step('next',v),e=>step('throw',e))};step('next')});
 }});
 Object.assign(f.page.context.bg,{ObjectEquals:()=>false,objectId:()=>({}),selectAsync:async()=>callback=>callback({Name:'projection'})});
 Object.setPrototypeOf(f.receivers.currentUser,f.native.definitions.ObjectProxyPrototype);
 runInContext(terminalUserPublisherScript('http://loginom.example/app'),f.page.context);
 runInContext(source,f.page.context);
 const task=f.page.context.bg.app.CurrentUser.Set(f.receivers.currentUser);await task;
 await new Promise(r=>setTimeout(r,20));
 const input={loginomUrl:'http://loginom.example/app?testable=true',compatibility:{profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},platform:'darwin',sessionId:'own-session',operationId:'own-prepare'};
 const start=()=>invokeTerminalPrepareInvocation(retainTerminalPrepareInvocation({custody:f.custody,native:f.receivers,loaded:f.loaded,preparation:f.preparation},input,{signal:f.controller.signal,deadline:f.custody.deadline}));
 await fn(f,start,task);
 }finally{await f.native.drain();await f.native.cleanup()}}
test('fixed user publisher → realm backing capture → packet → readonly private component',()=>control(async(f,start,task)=>{
 const result=await start(),realm=f.preparation.terminalOriginalRealm;
 assert.equal(realm.user,f.receivers.currentUser);assert.equal(realm.userTask,task);
 assert.notEqual(f.page.context.bg.app.CurrentUser.FCurrentUser,realm.user);
 assert.equal(realm.reason,'LOADED_NATIVE_PROVIDER_NOT_BOUND');assert.equal(realm.nativeReceiversQualified,false);
 for(const k of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(result.facts[k],false);
 assert.equal(f.native.calls.filter(x=>x===0).length,1);
}));
test('user transport substitution before prepare refuses without creation/dispatch',()=>control(async(f,start)=>{
 f.receivers.currentUser.$S={};await assert.rejects(async()=>start());assert.equal(f.native.calls.length,0);assert.equal(f.page.events.includes('create_draft'),false);
}));
test('Set descriptor drift after creation blocks next private packet continuation without replay',()=>control(async(f,start)=>{
 const result=await start(),calls=f.native.calls.length;
 Object.defineProperty(f.page.context.bg.app.CurrentUser,'Set',{writable:false});
 const {terminalPacketArguments}=await import(process.env.TERMINAL_PACKET_ROOT?new URL('file://'+process.env.TERMINAL_PACKET_ROOT+'/terminal-original-packet.mjs'):new URL('../lib/terminal-original-packet.mjs',import.meta.url));
 assert.throws(()=>terminalPacketArguments(result.packet),/TERMINAL_USER_PUBLISHER_UNAVAILABLE/);assert.equal(f.native.calls.length,calls);
}));

test('foreign publisher data function refuses before calling it',async()=>{
 const f=await setup(60000,'retain-only');try{let calls=0;
  f.page.context.__loginomOriginalUserPublisherV1=Object.freeze({inspect(){calls++;return {}}});
  const input={loginomUrl:'http://loginom.example/app?testable=true',compatibility:{profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},platform:'darwin',sessionId:'own-session',operationId:'own-prepare'};
  await assert.rejects(invokeTerminalPrepareInvocation(retainTerminalPrepareInvocation({custody:f.custody,native:f.receivers,loaded:f.loaded,preparation:f.preparation},input,{signal:f.controller.signal,deadline:f.custody.deadline})),/TERMINAL_REALM_USER_PUBLISHER/);
  assert.equal(calls,0);assert.equal(f.native.calls.length,0);assert.equal(f.page.events.includes('create_draft'),false);
 }finally{await f.native.drain();await f.native.cleanup()}
});
