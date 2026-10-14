import test from 'node:test';import assert from 'node:assert/strict';
import {setup} from './terminal-provider-boundary-fixture.mjs';
const {retainTerminalPrepareInvocation,invokeTerminalPrepareInvocation}=await import(process.env.TERMINAL_INVOCATION_MODULE??new URL('../lib/terminal-prepare-invocation.mjs',import.meta.url));
async function initial(){const f=await setup(60000,'retain-only');
 const source={custody:f.custody,native:f.receivers,loaded:f.loaded,preparation:f.preparation};
 const input={loginomUrl:'http://loginom.example/app?testable=true',compatibility:{profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},platform:'darwin',sessionId:'own-session',operationId:'own-prepare'};
 const control={signal:f.controller.signal,deadline:f.custody.deadline};return {...f,source,input,control};}
async function control(fn){const f=await initial();try{await fn(f)}finally{await f.native.drain();await f.native.cleanup()}}
test('private producer retains before creation, positive H1 packet→H2 original component',()=>control(async f=>{
 assert.equal(f.preparation.receipts.size,0);const token=retainTerminalPrepareInvocation(f.source,f.input,f.control);assert.equal(f.preparation.receipts.size,0);
 const work=invokeTerminalPrepareInvocation(token);assert.equal(invokeTerminalPrepareInvocation(token),work);
 const result=await work;assert.equal(result.facts.interface_reply,'original_proxy_observed');
 for(const k of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(result.facts[k],false);
 assert.equal(f.preparation.receipts.get('own-prepare').phase,'verified');assert.equal(invokeTerminalPrepareInvocation(token),work);
 await assert.rejects(result.component.persist(),/WRITER_NOT_BOUND/);
}));
for(const key of ['source','input','signal','deadline','document','map'])test('retained '+key+' substitution refuses before creation',()=>control(async f=>{
 const token=retainTerminalPrepareInvocation(f.source,f.input,f.control);
 if(key==='source')f.source.native={...f.receivers};if(key==='input')f.input.operationId='foreign';
 if(key==='signal')f.control.signal=new AbortController().signal;if(key==='deadline')f.control.deadline++;
 if(key==='document')f.custody.document={};if(key==='map')f.preparation.receipts=new Map();
 assert.throws(()=>invokeTerminalPrepareInvocation(token));assert.equal(f.preparation.receipts.size,0);
}));
test('receipt accessor refuses getter0',()=>control(async f=>{
 let gets=0;Object.defineProperty(f.preparation.receipts,'get',{get(){gets++;return Map.prototype.get}});
 assert.throws(()=>retainTerminalPrepareInvocation(f.source,f.input,f.control));assert.equal(gets,0);
}));
for(const value of [false,0,null,undefined,'',new Error('original',{cause:0})])test('raw first '+String(value)+' retained without creation/reader replay',()=>control(async f=>{
 let calls=0;f.page.page.evaluate=async()=>{calls++;f.control.deadline++;throw value};
 const token=retainTerminalPrepareInvocation(f.source,f.input,f.control),work=invokeTerminalPrepareInvocation(token);
 try{await work;assert.fail('must reject')}catch(error){assert.equal(error,value)}
 assert.equal(invokeTerminalPrepareInvocation(token),work);try{await work}catch(error){assert.equal(error,value)}
 assert.equal(calls,1);assert.equal(f.preparation.receipts.size,0);
}));
for(const key of ['input','signal','deadline','source','compatibility'])test('post-await '+key+' drift stops before creation',()=>control(async f=>{
 const evaluate=f.page.page.evaluate;let calls=0;
 f.page.page.evaluate=async function(...args){calls++;const result=await evaluate.apply(this,args);
  if(key==='input')f.input.operationId='foreign';if(key==='signal')f.control.signal=new AbortController().signal;
  if(key==='deadline')f.control.deadline++;if(key==='source')f.source.native={...f.receivers};
  if(key==='compatibility')f.input.compatibility.profile_id='foreign';return result;};
 const token=retainTerminalPrepareInvocation(f.source,f.input,f.control),work=invokeTerminalPrepareInvocation(token);
 await assert.rejects(work,/INVOCATION_REPLACED/);assert.equal(calls,1);assert.equal(f.preparation.receipts.size,0);
 assert.equal(invokeTerminalPrepareInvocation(token),work);
}));
test('copied token and missing absolute caller deadline refuse',()=>control(async f=>{
 const token=retainTerminalPrepareInvocation(f.source,f.input,f.control);assert.throws(()=>invokeTerminalPrepareInvocation({...token}));
 assert.throws(()=>retainTerminalPrepareInvocation(f.source,f.input,{signal:f.control.signal}));assert.equal(f.preparation.receipts.size,0);
}));
test('original abort is first even when deadline descriptor is foreign',()=>control(async f=>{
 let gets=0;f.controller.abort(false);Object.defineProperty(f.control,'deadline',{get(){gets++;return Date.now()+60000}});
 let caught=false;try{retainTerminalPrepareInvocation(f.source,f.input,f.control)}catch(value){caught=true;assert.equal(value,false)}
 assert(caught);assert.equal(gets,0);assert.equal(f.preparation.receipts.size,0);
}));
test('successful completed invocation cannot be reused after typed input drift',()=>control(async f=>{
 const token=retainTerminalPrepareInvocation(f.source,f.input,f.control);const work=invokeTerminalPrepareInvocation(token);await work;
 f.input.operationId='foreign';assert.throws(()=>invokeTerminalPrepareInvocation(token));
}));
