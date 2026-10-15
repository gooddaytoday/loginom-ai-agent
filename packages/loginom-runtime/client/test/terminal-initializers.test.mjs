// Real pinned initClass/shallowCopy/member-table text; namespace/assembly/constructors
// and Page/native/task/application loader are CODE/OFFLINE doubles, not loaded IIFEs.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile}from'node:fs/promises';import{createHash,webcrypto}from'node:crypto';import{runInContext,createContext}from'node:vm';
import{parse}from'../../../loginom-host/node_modules/acorn/dist/acorn.mjs';
import{fixture}from'./terminal-user-lower.test.mjs';
import{setup}from'./terminal-provider-boundary-fixture.mjs';
const {retainTerminalPrepareInvocation,invokeTerminalPrepareInvocation}=await import(process.env.TERMINAL_INVOCATION_MODULE??new URL('../lib/terminal-prepare-invocation.mjs',import.meta.url));
const {terminalUserPublisherScript}=await import(process.env.TERMINAL_USER_PUBLISHER_MODULE??new URL('../lib/terminal-user-publisher.mjs',import.meta.url));
const input=process.env.TERMINAL_INPUT_DIR;
const bytes=await readFile(input+'/mscorlib.js');assert.equal(createHash('sha256').update(bytes).digest('hex'),'9b2b59bb2f7d3765526c3530e752fe8aeef57360a7bdafb39c6eb8468f7ee555');
const runtime=bytes.toString();const functions={};
function walk(n,fn){if(!n||typeof n!=='object')return;fn(n);for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(n=>walk(n,fn));else if(v&&typeof v==='object')walk(v,fn)}}
walk(parse(runtime,{ecmaVersion:'latest'}),n=>{if(n.type==='AssignmentExpression'&&['ss.initClass','ss.shallowCopy'].includes(runtime.slice(n.left.start,n.left.end)))functions[runtime.slice(n.left.start,n.left.end).slice(3)]=runtime.slice(n.right.start,n.right.end)});
const bgRuntimeBytes=await readFile(input+'/bg.mscorlib.js');assert.equal(createHash('sha256').update(bgRuntimeBytes).digest('hex'),'a5b62e7dff9920b13b02b9affad6995316df6c6ae191fc078648a987950c4550');
const bgRuntime=bgRuntimeBytes.toString();let bgInitializer;
walk(parse(bgRuntime,{ecmaVersion:'latest'}),n=>{if(n.type==='AssignmentExpression'&&bgRuntime.slice(n.left.start,n.left.end)==='ss.initClass')bgInitializer=bgRuntime.slice(n.right.start,n.right.end)});
const tables={};for(const[file,targets]of[['rpc.js',{'$rpc_TBGObjectProxy':'ObjectProxy'}],['bg.rtl.rpc.js',{'$bg_rpc_TIBGFileStorage_Proxy':'FileStorage','$bg_rpc_TIBGStreamPersist_Proxy':'StreamPersist'}]]){
 const source=await readFile(input+'/'+file,'utf8');walk(parse(source,{ecmaVersion:'latest'}),n=>{
  if(n.type==='CallExpression'&&source.slice(n.callee.start,n.callee.end)==='ss.initClass'){
   const kind=targets[source.slice(n.arguments[0].start,n.arguments[0].end)];if(kind)tables[kind]=source.slice(n.arguments[2].start,n.arguments[2].end);
  }
 });
}
export async function fresh({initializer,realm,scriptContext,originalCompletion}={}){
 const f=await fixture({realm,originalCompletion,initializeDOM:scriptContext?.install,initializeSS(ss,c){ss.shallowCopy=runInContext('('+functions.shallowCopy+')',c);ss.initClass=initializer??runInContext('('+functions.initClass+')',c)}});
 const ss=f.c.ss;f.c.ss_initClass=ss.initClass; // The actual modifier saves the unwrapped original.
 ss.prepareProperties=()=>{}; // Explicit property-preparation dependency double.
 scriptContext?.select('bg/js/bg.mscorlib.js');
 const finalInitializer=runInContext('('+bgInitializer+')',f.c);ss.initClass=finalInitializer;
 const original=ss.initClass; // fixed wrapper; restored value must be finalInitializer.

 const rpc=f.c.rpc;rpc.TBGObjectProxy.__typeName='rpc.TBGObjectProxy';
 const storage=realm?f.c.bg.rpc.TIBGFileStorage_Proxy:runInContext('(function Storage(){})',f.c),persist=realm?f.c.bg.rpc.TIBGStreamPersist_Proxy:runInContext('(function Persist(){})',f.c);
 storage.__typeName='bg.rpc.TIBGFileStorage_Proxy';persist.__typeName='bg.rpc.TIBGStreamPersist_Proxy';
 f.c.bg.rpc={TIBGFileStorage_Proxy:storage,TIBGStreamPersist_Proxy:persist};
 const constructors={ObjectProxy:rpc.TBGObjectProxy,FileStorage:storage,StreamPersist:persist};
 const asm={__types:{},name:'fixture'};const members={};
 const init=kind=>{scriptContext?.select(kind==='ObjectProxy'?'bg/js/rpc.js':'bg/js/bg.rtl.rpc.js');const m=runInContext('('+tables[kind]+')',f.c);members[kind]=m;
  return ss.initClass(constructors[kind],asm,m,kind==='ObjectProxy'?undefined:rpc.TBGObjectProxy)};
 return Object.assign(f,{ss,original,finalInitializer,constructors,asm,members,init});
}
async function finish(f){const task=f.invoke();f.deliver();await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();return f.inspect()}
test('initial namespace→three actual initClass/member-table calls retained and original method restored',async()=>{
 const f=await fresh();for(const kind of ['ObjectProxy','FileStorage','StreamPersist'])assert.equal(f.init(kind),undefined);
 assert.notEqual(f.ss.initClass,f.original);const held=await finish(f),r=held.acquisition.loadedDefinitions.initializers;
 assert.equal(r.complete,true);assert(Object.isFrozen(r));assert(Object.isFrozen(r.records));assert.equal(r.records.length,3);
 for(const record of r.records){assert.equal(record.ctor,f.constructors[record.kind]);assert.equal(record.assembly,f.asm);assert.equal(record.members,f.members[record.kind]);assert.equal(record.ss,f.ss);assert.equal(record.initializer,f.ss.initClass);
  for(const key of Object.keys(record.methods))assert.equal(record.methods[key],record.ctor.prototype[key]);}
 assert.equal(r.sourceExecutionQualified,false);assert.equal(r.closureIdentityQualified,false);assert.equal(held.nativeReceiversQualified,false);assert.deepEqual(f.counts(),[1,1,1]);
});
for(const kind of ['ObjectProxy','FileStorage','StreamPersist'])test('post-initializer '+kind+' method accessor refuses getter0 before resolver',async()=>{
 const f=await fresh();for(const kind of ['ObjectProxy','FileStorage','StreamPersist'])f.init(kind);
 f.invoke();const key=kind==='ObjectProxy'?'QueryInterface':kind==='FileStorage'?'get_Connected':'SaveToStream';let gets=0;
 Object.defineProperty(f.constructors[kind].prototype,key,{configurable:true,get(){gets++;return ()=>{}}});
 f.deliver();await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(gets,0);assert.deepEqual(f.counts(),[1,1,0]);
});
test('original initializer member-table drift remains refusal, even with same installed method',async()=>{
 const f=await fresh();for(const kind of ['ObjectProxy','FileStorage','StreamPersist'])f.init(kind);
 const task=f.invoke();f.members.FileStorage.extra=true;f.deliver();await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.deepEqual(f.counts(),[1,1,0]);
});
test('foreign initClass descriptor is never overwritten by completion',async()=>{
 const f=await fresh();f.init('ObjectProxy');const old=f.ss.initClass,foreign=()=>{};f.ss.initClass=foreign;
 Reflect.apply(old,f.ss,[f.constructors.FileStorage,f.asm,runInContext('('+tables.FileStorage+')',f.c),f.constructors.ObjectProxy]);
 assert.equal(f.ss.initClass,foreign);await assert.rejects(f.invoke(),/UNAVAILABLE/);assert.throws(f.inspect,/UNAVAILABLE/);assert.deepEqual(f.counts(),[0,0,0]);
});
test('existing ss cannot become an initial witness by later reflection',async()=>{
 const f=await fixture(),held=await finish(f),r=held.acquisition.loadedDefinitions.initializers;
 assert.equal(r.complete,false);assert.equal(r.reason,'INITIAL_SS_ALREADY_PRESENT');assert.equal(r.sourceExecutionQualified,false);
});
for(const error of [false,0,null,undefined,'',Error('initializer',{cause:0})])test('original initializer throws same raw value '+String(error),async()=>{
 let calls=0;const f=await fresh({initializer(){calls++;throw error}});let caught,failed=false;try{f.init('ObjectProxy')}catch(e){caught=e;failed=true}
 assert(failed);assert.equal(caught,error);assert.equal(calls,1);assert.deepEqual(f.counts(),[0,0,0]);
});

test('actual mscorlib IIFE publishes original base before fixed modifier; no namespace reconstruction',()=>{
 const c=createContext({document:{},location:{origin:'https://app.loginom.ai'},crypto:webcrypto,TextEncoder});
 runInContext('window=globalThis',c);runInContext(terminalUserPublisherScript('https://app.loginom.ai/app'),c);
 runInContext(runtime,c);const base=c.ss.initClass;
 assert.equal(base.name,'ss$initClass');assert.equal(typeof Object.getOwnPropertyDescriptor(c,'ss').value,'object');
 assert.equal(typeof Object.getOwnPropertyDescriptor(c.ss,'initClass').get,'function');
 c.ss_initClass=base;c.ss.prepareProperties=()=>{};const final=runInContext('('+bgInitializer+')',c);c.ss.initClass=final;
 assert.equal(c.ss_initClass,base);assert.equal(typeof Object.getOwnPropertyDescriptor(c.ss,'initClass').value,'function');
 assert.notEqual(c.ss.initClass,final); // fixed bounded wrapper, not the saved base closure
});
test('restoration leaves subsequent unrelated initializer calls ordinary and receipt unchanged',async()=>{
 const f=await fresh();for(const kind of ['ObjectProxy','FileStorage','StreamPersist'])f.init(kind);
 const before=f.ss.initClass,extra=function Extra(){};extra.__typeName='Extra';f.ss.initClass(extra,f.asm,{});
 assert.equal(f.ss.initClass,before);assert.equal(before,f.finalInitializer);assert.equal(extra.__assembly,f.asm);
 const r=(await finish(f)).acquisition.loadedDefinitions.initializers;assert.equal(r.records.length,3);
});
for(const error of [false,0,null,undefined,'',Error('lower',{cause:0})])test('initializer custody does not replace first lower rejection '+String(error),async()=>{
 const f=await fresh();for(const kind of ['ObjectProxy','FileStorage','StreamPersist'])f.init(kind);
 const task=f.invoke();f.members.FileStorage.extra=true;f.fail(error);f.deliver();await assert.rejects(task,v=>Object.is(v,error));await f.settle();
 let caught,failed=false;try{f.inspect()}catch(e){failed=true;caught=e}assert(failed);assert.equal(caught,error);assert.deepEqual(f.counts(),[1,1,0]);
});

test('original base prototype replacement refuses pending continuation before resolver',async()=>{
 const f=await fresh();for(const kind of ['ObjectProxy','FileStorage','StreamPersist'])f.init(kind);
 f.invoke();f.constructors.ObjectProxy.prototype={};f.deliver();await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.deepEqual(f.counts(),[1,1,0]);
});
test('initial namespace replacement is not accepted via an old initializer reference',async()=>{
 const f=await fresh(),init=f.ss.initClass;f.c.ss={...f.ss};
 Reflect.apply(init,f.ss,[f.constructors.ObjectProxy,f.asm,runInContext('('+tables.ObjectProxy+')',f.c)]);
 await assert.rejects(f.invoke(),/UNAVAILABLE/);assert.deepEqual(f.counts(),[0,0,0]);
});

test('initial initializer receipt retained through production workspace→packet→readonly component',async()=>{
 const realm=await setup(60000,'retain-only');try{
  const f=await fresh({realm});
  // Existing native/proxy constructors and tables are doubles. Preserve their
  // originals; do not manufacture replacement prototypes to obtain a positive.
  for(const kind of ['ObjectProxy','FileStorage','StreamPersist']){
   const ctor=f.constructors[kind];f.ss.initClass(ctor,f.asm,ctor.prototype);
  }
  const receipt=(await finish(f)).acquisition.loadedDefinitions.initializers;assert.equal(receipt.complete,true);
  const input={loginomUrl:'http://loginom.example/app?testable=true',compatibility:{profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},platform:'darwin',sessionId:'own-session',operationId:'own-prepare'};
  const result=await invokeTerminalPrepareInvocation(retainTerminalPrepareInvocation({custody:realm.custody,native:realm.receivers,loaded:realm.loaded,preparation:realm.preparation},input,{signal:realm.controller.signal,deadline:realm.custody.deadline}));
  assert.equal(realm.preparation.terminalOriginalRealm.userInitializers,receipt);
  for(const key of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(result.facts[key],false);
  assert.equal(receipt.sourceExecutionQualified,false);assert.equal(receipt.closureIdentityQualified,false);assert.deepEqual(f.counts(),[1,1,1]);
 }finally{await realm.native.drain();await realm.native.cleanup()}
});
