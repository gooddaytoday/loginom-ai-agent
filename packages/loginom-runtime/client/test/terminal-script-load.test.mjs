// Document/HTMLScriptElement/Node readers, source loading and native/task refs are
// doubles. Real Node/VM executes production publisher and pinned initializer text.
import test from 'node:test';import assert from 'node:assert/strict';
import{fresh}from'./terminal-initializers.test.mjs';
import{setup}from'./terminal-provider-boundary-fixture.mjs';
const {retainTerminalPrepareInvocation,invokeTerminalPrepareInvocation}=await import(process.env.TERMINAL_INVOCATION_MODULE??new URL('../lib/terminal-prepare-invocation.mjs',import.meta.url));
function scripts({integrity='',missing=false}={}){
 let current,document,context;const states=new WeakMap(),nodes=new Map();
 class NodeDouble{get ownerDocument(){return states.get(this).document}get isConnected(){return states.get(this).connected}}
 class DocumentDouble extends NodeDouble{get currentScript(){return current}}
 class ScriptDouble extends NodeDouble{get src(){return states.get(this).src}get integrity(){return states.get(this).integrity}}
 const select=path=>{if(!nodes.has(path)){const node=new ScriptDouble();states.set(node,{document,connected:true,src:context.location.origin+'/app/'+path,integrity});nodes.set(path,node)}current=nodes.get(path);return current};
 return{install(c){context=c;document=c.document;Object.setPrototypeOf(document,DocumentDouble.prototype);
  Object.assign(c,{Document:DocumentDouble,HTMLScriptElement:ScriptDouble,Node:NodeDouble,URL});if(!missing)select('bg/js/mscorlib.js');
 },select,node:path=>nodes.get(path),state:node=>states.get(node),ScriptDouble,DocumentDouble,
  replace(path){const node=new ScriptDouble();states.set(node,{...states.get(nodes.get(path))});nodes.set(path,node);return node}};
}
async function completed(f){const task=f.invoke();f.deliver();await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();return f.inspect()}
async function initialized(options){const s=scripts(options),f=await fresh({scriptContext:s});for(const kind of ['ObjectProxy','FileStorage','StreamPersist'])f.init(kind);return{f,s}}
test('original base/modifier/initializer script nodes retained; same RPC IIFE node for storage/persist',async()=>{
 const{f,s}=await initialized(),r=(await completed(f)).acquisition.loadedDefinitions.initializers;
 assert.equal(r.scriptIdentityComplete,true);assert.equal(r.initialScript.script,s.node('bg/js/mscorlib.js'));
 assert.equal(r.modifierScript.script,s.node('bg/js/bg.mscorlib.js'));
 for(const record of r.records){const expected=record.kind==='ObjectProxy'?'bg/js/rpc.js':'bg/js/bg.rtl.rpc.js';assert.equal(record.execution.script,s.node(expected));assert.equal(record.execution.document,f.c.document);assert.equal(record.execution.url,'https://app.loginom.ai/app/'+expected);assert(Object.isFrozen(record.execution))}
 assert.equal(r.sourceExecutionQualified,false);assert.equal(r.closureIdentityQualified,false);assert.deepEqual(f.counts(),[1,1,1]);
});
for(const key of ['src','integrity','document','connected'])test('pending script '+key+' drift stops resolver without new dispatch',async()=>{
 const{f,s}=await initialized();f.invoke();const state=s.state(s.node('bg/js/rpc.js'));state[key]=key==='connected'?false:key==='document'?{}:'foreign';
 f.deliver();await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.deepEqual(f.counts(),[1,1,0]);
});
for(const key of ['src','integrity'])test('script own '+key+' shadow accessor refuses getter0',async()=>{
 const{f,s}=await initialized();f.invoke();let gets=0;Object.defineProperty(s.node('bg/js/rpc.js'),key,{get(){gets++;return ''},configurable:true});
 f.deliver();await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(gets,0);assert.deepEqual(f.counts(),[1,1,0]);
});
test('fixed original DOM reader replacement refuses foreign getter0',async()=>{
 const{f,s}=await initialized();f.invoke();let gets=0;Object.defineProperty(s.ScriptDouble.prototype,'src',{get(){gets++;return 'foreign'},configurable:true});
 f.deliver();await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.equal(gets,0);assert.deepEqual(f.counts(),[1,1,0]);
});
test('separate equal-URL script nodes cannot form one storage/persist initializer witness',async()=>{
 const s=scripts(),f=await fresh({scriptContext:s});f.init('ObjectProxy');f.init('FileStorage');s.replace('bg/js/bg.rtl.rpc.js');f.init('StreamPersist');
 await assert.rejects(f.invoke(),/UNAVAILABLE/);assert.deepEqual(f.counts(),[0,0,0]);
});
test('missing initial currentScript is not repaired by later URL/source labels',async()=>{
 const s=scripts({missing:true}),f=await fresh({scriptContext:s});for(const kind of ['ObjectProxy','FileStorage','StreamPersist'])f.init(kind);
 const task=f.invoke();f.deliver();await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();
 assert.throws(f.inspect,/UNAVAILABLE/);assert.deepEqual(f.counts(),[1,1,1]);
});
test('opaque integrity text is retained evidence and never executed-source authority',async()=>{
 const{f}=await initialized({integrity:'sha256-copied-label'});const r=(await completed(f)).acquisition.loadedDefinitions.initializers;
 assert.equal(r.scriptIdentityComplete,true);assert.equal(r.sourceExecutionQualified,false);assert.equal(r.closureIdentityQualified,false);
 assert.equal(r.initialScript.integrity,'sha256-copied-label');
});
for(const error of [false,0,null,undefined,'',Error('first',{cause:0})])test('first lower rejection wins secondary script drift '+String(error),async()=>{
 const{f,s}=await initialized();const task=f.invoke();s.state(s.node('bg/js/rpc.js')).src='foreign';f.fail(error);f.deliver();await assert.rejects(task,e=>Object.is(e,error));await f.settle();
 let failed=false,caught;try{f.inspect()}catch(e){failed=true;caught=e}assert(failed);assert.equal(caught,error);assert.deepEqual(f.counts(),[1,1,0]);
});

test('same original script witness retained through production private workspace/packet/readonly',async()=>{
 const realm=await setup(60000,'retain-only');try{
  const s=scripts(),f=await fresh({realm,scriptContext:s});
  for(const kind of ['ObjectProxy','FileStorage','StreamPersist']){
   s.select(kind==='ObjectProxy'?'bg/js/rpc.js':'bg/js/bg.rtl.rpc.js');const ctor=f.constructors[kind];f.ss.initClass(ctor,f.asm,ctor.prototype);
  }
  const receipt=(await completed(f)).acquisition.loadedDefinitions.initializers;assert.equal(receipt.scriptIdentityComplete,true);
  const input={loginomUrl:'http://loginom.example/app?testable=true',compatibility:{profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},platform:'darwin',sessionId:'own-session',operationId:'own-prepare'};
  const result=await invokeTerminalPrepareInvocation(retainTerminalPrepareInvocation({custody:realm.custody,native:realm.receivers,loaded:realm.loaded,preparation:realm.preparation},input,{signal:realm.controller.signal,deadline:realm.custody.deadline}));
  assert.equal(realm.preparation.terminalOriginalRealm.userInitializers,receipt);
  for(const key of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(result.facts[key],false);
  assert.equal(receipt.sourceExecutionQualified,false);assert.equal(receipt.closureIdentityQualified,false);
 }finally{await realm.native.drain();await realm.native.cleanup()}
});
test('post-success original script detachment refuses without reader replay',async()=>{
 const{f,s}=await initialized();await completed(f);s.state(s.node('bg/js/rpc.js')).connected=false;
 assert.throws(f.inspect,/UNAVAILABLE/);assert.deepEqual(f.counts(),[1,1,1]);
});
test('script prototype replacement refuses pending resolver',async()=>{
 const{f,s}=await initialized();f.invoke();Object.setPrototypeOf(s.node('bg/js/rpc.js'),{});
 f.deliver();await f.settle();assert.throws(f.inspect,/UNAVAILABLE/);assert.deepEqual(f.counts(),[1,1,0]);
});
