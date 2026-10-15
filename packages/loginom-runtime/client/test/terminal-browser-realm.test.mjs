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
  assert.equal(r.nativeReceiversQualified,false);assert.equal(r.reason,'ORIGINAL_USER_BEFORE_PROJECTION_NOT_RETAINED');
 }return result};
 await start();assert(captured);
}));
for(const variant of ['session','export','prototype','query','account'])test('realm '+variant+' replacement stops next UI/native dispatch',()=>control(async(f,start)=>{
 const evaluate=f.page.page.evaluate;let swapped=false;
 f.page.page.evaluate=async function(fn,args){const result=await evaluate.call(this,fn,args);if(args?.mode==='lookup'&&!swapped){swapped=true;
  if(variant==='account')f.page.context.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.FUsername='foreign';
  if(variant==='session')f.page.context.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection.FSession={};
  if(variant==='export')f.page.context.rpc.TBGObjectProxy={};
  if(variant==='prototype')f.page.context.rpc.TBGObjectProxy.prototype={};
  if(variant==='query')f.native.definitions.ObjectProxyPrototype.QueryInterface=()=>{};
 }return result};
 await assert.rejects(async()=>start());assert.equal(f.page.events.includes('create_draft'),false);assert.equal(f.page.events.includes('menu'),false);assert.equal(f.native.calls.length,0);
}));
test('native cached FSession accessor refusal getter0, no remint/no RPC',()=>control(async(f,start)=>{
 let gets=0;Object.defineProperty(f.page.context.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection,'FSession',{get(){gets++;return f.native.session}});
 await assert.rejects(start(),/TERMINAL_REALM_ACCESSOR/);assert.equal(gets,0);assert.equal(f.page.events.includes('create_draft'),false);assert.equal(f.native.calls.length,0);
}));

test('genuine public Session/UserName getters are never invoked; cached storage kept before creation',()=>control(async(f,start)=>{
 let gets=0;const main=f.page.context.bg.app.Application.FInstance.FMainForm,connection=main.FMapTree.FServerConnection;
 for(const key of ['Session','UserName'])Object.defineProperty(connection,key,{get(){gets++;throw Error('public getter must not run')}});
 // The whole private invocation later includes ordinary account reporting. Inspect
 // only its precreation lookup: capture must neither call getters nor mint a user.
 const evaluate=f.page.page.evaluate;
 f.page.page.evaluate=async function(fn,args){const result=await evaluate.call(this,fn,args);if(args?.mode==='lookup'){
  const r=f.preparation.terminalOriginalRealm;assert.equal(r.applicationSession,connection.FSession);
  assert.equal(r.fileStorage,f.native.storage);assert.equal(r.storageSession,f.native.session);assert.equal(gets,0);
  assert.equal(r.nativeReceiversQualified,false);throw Error('bounded lookup stop');
 }return result};
 await assert.rejects(start(),/bounded lookup stop/);assert.equal(gets,0);assert.equal(f.native.calls.length,0);
}));
for(const variant of ['foreign-storage-session','storage-accessor','storage-method','descriptor-flags'])test('backing custody '+variant+' refuses before creation with getter0',()=>control(async(f,start)=>{
 let gets=0;const main=f.page.context.bg.app.Application.FInstance.FMainForm,evaluate=f.page.page.evaluate;
 if(variant==='foreign-storage-session')f.native.storage.$S={};
 if(variant==='storage-accessor')Object.defineProperty(main.FUrlUtils,'FFileStorage',{get(){gets++;return f.native.storage}});
 if(variant==='storage-method')Object.defineProperty(f.native.storage,'get_Connected',{get(){gets++;return f.native.definitions.FileStoragePrototype.get_Connected}});
 if(variant==='descriptor-flags')f.page.page.evaluate=async function(fn,args){const result=await evaluate.call(this,fn,args);if(args?.mode==='lookup')
  Object.defineProperty(main.FMapTree.FServerConnection,'FUsername',{writable:false});return result};
 await assert.rejects(async()=>start());assert.equal(gets,0);assert.equal(f.page.events.includes('create_draft'),false);assert.equal(f.native.calls.length,0);
}));

test('backing-field private continuation has getter0 through packet/component; storage drift blocks reuse',()=>control(async(f,start)=>{
 let gets=0;const connection=f.page.context.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection;
 for(const key of ['Session','UserName'])Object.defineProperty(connection,key,{get(){gets++;throw Error('foreign public getter')}});
 const result=await start();assert.equal(gets,0);for(const key of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(result.facts[key],false);
 const realm=f.preparation.terminalOriginalRealm;
 Object.defineProperty(realm.urlUtils,'FFileStorage',{get(){gets++;return f.native.storage}});
 const {terminalPacketArguments}=await import(process.env.TERMINAL_PACKET_ROOT?new URL('file://'+process.env.TERMINAL_PACKET_ROOT+'/terminal-original-packet.mjs'):new URL('../lib/terminal-original-packet.mjs',import.meta.url));
 assert.throws(()=>terminalPacketArguments(result.packet),/TERMINAL_PACKET_ACCESSOR|TERMINAL_PACKET_NATIVE_REPLACED/);
 assert.equal(gets,0);
}));

test('equal inherited method shadow after completion is refused without replay',()=>control(async(f,start)=>{
 const result=await start(),calls=f.native.calls.length;
 Object.defineProperty(f.native.storage,'get_Connected',{value:f.native.definitions.FileStoragePrototype.get_Connected});
 const {terminalPacketArguments}=await import(process.env.TERMINAL_PACKET_ROOT?new URL('file://'+process.env.TERMINAL_PACKET_ROOT+'/terminal-original-packet.mjs'):new URL('../lib/terminal-original-packet.mjs',import.meta.url));
 assert.throws(()=>terminalPacketArguments(result.packet),/TERMINAL_PACKET_NATIVE_REPLACED/);assert.equal(f.native.calls.length,calls);
}));

test('foreign frozen capsule with accessor slots refuses getter0 before effect',()=>control(async(f,start)=>{
 let gets=0;f.preparation.terminalOriginalRealm=Object.freeze({get slots(){gets++;return []}});
 await assert.rejects(async()=>start(),/TERMINAL_REALM_ACCESSOR/);assert.equal(gets,0);
 assert.equal(f.page.events.includes('create_draft'),false);assert.equal(f.native.calls.length,0);
}));
