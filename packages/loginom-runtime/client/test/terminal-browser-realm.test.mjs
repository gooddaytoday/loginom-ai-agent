import test from 'node:test';import assert from 'node:assert/strict';
import {setup} from './terminal-provider-boundary-fixture.mjs';
const {retainTerminalPrepareInvocation,invokeTerminalPrepareInvocation}=await import(process.env.TERMINAL_INVOCATION_MODULE??new URL('../lib/terminal-prepare-invocation.mjs',import.meta.url));
async function control(fn){const f=await setup(60000,'retain-only');try{
 const source={custody:f.custody,native:f.receivers,loaded:f.loaded,preparation:f.preparation};
 const input={loginomUrl:'http://loginom.example/app?testable=true',compatibility:{profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},platform:'darwin',sessionId:'own-session',operationId:'own-prepare'};
 await fn(f,()=>invokeTerminalPrepareInvocation(retainTerminalPrepareInvocation(source,input,{signal:f.controller.signal,deadline:f.custody.deadline})));
 }finally{await f.native.drain();await f.native.cleanup()}}
test('browser capture is before UI effect and retains raw same-realm document/Map/session/definitions',()=>control(async(f,start)=>{
 const evaluate=f.page.page.evaluate;let captured=false;
 f.page.page.evaluate=async function(fn,args){const result=await evaluate.call(this,fn,args);if(args?.mode==='lookup'){
  const r=f.preparation.terminalOriginalRealm;assert(r);assert(Object.isFrozen(r));captured=true;
  assert.equal(r.document,f.page.context.document);assert.equal(r.preparation,f.preparation);assert.equal(r.receipts,f.preparation.receipts);
  assert.equal(r.nativeSession,f.native.session);assert.equal(r.query,f.native.definitions.ObjectProxyPrototype.QueryInterface);
  assert.equal(r.FileStoragePrototype,f.native.definitions.FileStoragePrototype);assert.equal(r.ss,f.native.closureContext.ss);
  assert.equal(f.page.events.includes('menu'),false);assert.equal(f.page.events.includes('create_draft'),false);assert.equal(f.native.calls.length,0);
  assert.equal(r.nativeReceiversQualified,false);assert.equal(r.reason,'CACHED_CURRENT_USER_FILE_STORAGE_PRODUCER_UNQUALIFIED');
 }return result};
 await start();assert(captured);
}));
for(const variant of ['session','export','prototype','query'])test('realm '+variant+' replacement stops next UI/native dispatch',()=>control(async(f,start)=>{
 const evaluate=f.page.page.evaluate;let swapped=false;
 f.page.page.evaluate=async function(fn,args){const result=await evaluate.call(this,fn,args);if(args?.mode==='lookup'&&!swapped){swapped=true;
  if(variant==='session')f.page.context.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.Session={};
  if(variant==='export')f.page.context.rpc.TBGObjectProxy={};
  if(variant==='prototype')f.page.context.rpc.TBGObjectProxy.prototype={};
  if(variant==='query')f.native.definitions.ObjectProxyPrototype.QueryInterface=()=>{};
 }return result};
 await assert.rejects(start());assert.equal(f.page.events.includes('create_draft'),false);assert.equal(f.page.events.includes('menu'),false);assert.equal(f.native.calls.length,0);
}));
test('native cached Session accessor refusal getter0, no remint/no RPC',()=>control(async(f,start)=>{
 let gets=0;Object.defineProperty(f.page.context.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection,'Session',{get(){gets++;return f.native.session}});
 await assert.rejects(start(),/TERMINAL_REALM_ACCESSOR/);assert.equal(gets,0);assert.equal(f.page.events.includes('create_draft'),false);assert.equal(f.native.calls.length,0);
}));
