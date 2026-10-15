import {joined} from '../../test/terminal-provider-h0.test.mjs';
// CODE/OFFLINE: real Node/VM/Promise/MessageChannel; DOM/Page/SDK/native/session/task doubles.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {runInContext,runInThisContext} from 'node:vm';
import {parse} from '../../../loginom-host/node_modules/acorn/dist/acorn.mjs';
import {fresh} from './terminal-initializers.test.mjs';import {setup} from './terminal-provider-boundary-fixture.mjs';
const lib=process.env.TERMINAL_PACKET_ROOT?new URL('file://'+process.env.TERMINAL_PACKET_ROOT+'/'):new URL('../lib/',import.meta.url);
const witness=await import(new URL('terminal-script-witness.mjs',lib)),packet=await import(new URL('terminal-original-packet.mjs',lib));
const text=await readFile(new URL('terminal-script-load.test.mjs',import.meta.url),'utf8'),ast=parse(text,{ecmaVersion:'latest',sourceType:'module'}),node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='scripts');
const scripts=runInThisContext('('+text.slice(node.start,node.end)+')');
async function control(fn,instrument=false,realCompletion=false){const realm=await setup(60000,'retain-only');try{
 let originalCompletion;const originalSources=[];
 if(realCompletion){const c=realm.page.context;runInContext('window=globalThis',c);runInContext(await readFile(process.env.TERMINAL_INPUT_DIR+'/mscorlib.js','utf8'),c);runInContext(await readFile(process.env.TERMINAL_INPUT_DIR+'/Task.js','utf8'),c);originalCompletion=c.ss.TaskCompletionSource;
  if(realCompletion.trackSources){const ctor=originalCompletion;originalCompletion=new Proxy(ctor,{construct(target,args){const source=Reflect.construct(target,args,target);originalSources.push(source);return source}})}
  if(realCompletion.continuation){const original=c.ss.Task.prototype.continueWith;c.ss.Task.prototype.continueWith=function(callback){return realCompletion.continuation({primary:this,callback,original,sourcePrototype:originalCompletion.prototype,ss:c.ss})}}
 }
 const s=scripts(),f=await fresh({realm,scriptContext:s,originalCompletion});
 for(const kind of ['ObjectProxy','FileStorage','StreamPersist']){s.select(kind==='ObjectProxy'?'bg/js/rpc.js':'bg/js/bg.rtl.rpc.js');const ctor=f.constructors[kind];f.ss.initClass(ctor,f.asm,ctor.prototype)}
 f.receiver.FUsername='test-account';f.c.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection=f.receiver;
 const probe={tasks:[],requests:[],readers:0,resolvers:0,continuations:0,releases:0};
 if(instrument){
  const transport=realm.native.session,dispatch=transport.DispatchMessageAsync,resolver=transport.$R;
  transport.$R=function(){probe.resolvers++;return Reflect.apply(resolver,this,arguments)};
  transport.DispatchMessageAsync=function(request){
   const task=Reflect.apply(dispatch,this,arguments),reader=task.getAwaitedResult,continuation=task.continueWith,deliver=task.deliver;
   probe.tasks.push(task);probe.requests.push(request);if(probe.onDispatch)probe.onDispatch(request,task);task.getAwaitedResult=function(){probe.readers++;return Reflect.apply(reader,this,arguments)};
   task.continueWith=function(callback){probe.callback=callback;return Reflect.apply(continuation,this,[function(){probe.continuations++;return Reflect.apply(callback,this,arguments)}])};
   task.deliver=function(){Reflect.apply(deliver,this,arguments);if(probe.response)probe.response(Reflect.apply(reader,task,[]))};return task;
  };
 }
 const task=f.invoke();f.deliver();await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();
 f.c.__loginomStartupV1={document:f.c.document,id:'original',account:'test-account'};
 if(realCompletion.beforeCapture)realCompletion.beforeCapture(f);
 f.c.__witnessArgs=witness.terminalScriptWitnessArguments('original','test-account');
 const capsule=runInContext('('+witness.collectTerminalScriptWitness.toString()+')(__witnessArgs)',f.c);
 originalSources.length=0;probe.tasks.length=0;probe.readers=0;probe.resolvers=0;probe.continuations=0;
 const provider=Object.getOwnPropertyDescriptor(capsule,'originalProvider').value;
 const request={operationId:'own-prepare',sessionId:'own-session',intent:'new_draft'};
 const prepare=()=>packet.prepareTerminalOriginalPacket(packet.captureTerminalInitialCustody({custody:realm.custody,native:realm.receivers,
  loaded:packet.captureTerminalLoadedExports(realm.loaded),preparation:realm.preparation}),{
   loginomUrl:'http://loginom.example/app?testable=true',compatibility:{profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},platform:'darwin',sessionId:'own-session',operationId:'own-prepare'});
 await fn({realm,f,s,capsule,provider,request,prepare,probe,originalSources});
 }finally{await realm.native.drain();await realm.native.cleanup()}}
test('capsule provider retains original store/user/query before creation then same original task/support, no reader replay',()=>control(async x=>{
 const before=x.provider.inspect();assert.equal(before.preparation,x.realm.preparation);assert.equal(before.receipts,x.realm.preparation.receipts);
 assert.equal(before.currentUser,x.f.user);assert.equal(before.transport,x.realm.native.session);assert.equal(before.query,x.realm.native.definitions.ObjectProxyPrototype.QueryInterface);
 assert.equal(x.realm.page.events.includes('create_draft'),false);assert.equal(x.realm.native.calls.length,0);
 const b=x.provider.arm(x.request);await x.prepare();const work=b.query();assert.equal(b.query(),work);
 assert.equal(await work,x.realm.native.support);assert.equal(await b.query(),x.realm.native.support);
 const r=b.inspect();assert.equal(r.task,x.f.tasks.at(-1));assert.equal(r.proxy,x.realm.native.packageProxy);assert.equal(r.receipt,x.realm.preparation.receipts.get('own-prepare'));
 assert.equal(r.creation,r.receipt.terminalOriginalCreation);assert.equal(x.realm.native.calls.length,1);
 assert.deepEqual(witness.inspectTerminalOriginalProvider(x.capsule),{providerRetained:true,creationArmed:true,nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false});
}));
test('capsule provider fixed host projection cannot arm/query and copied capsule/provider/binding refuse',()=>control(async x=>{
 assert.equal(witness.inspectTerminalOriginalProvider(x.capsule).creationArmed,false);assert.equal(x.realm.native.calls.length,0);
 const copy=Object.create(Object.getPrototypeOf(x.capsule),Object.getOwnPropertyDescriptors(x.capsule));Object.freeze(copy);
 assert.throws(()=>witness.inspectTerminalOriginalProvider(copy),/UNAVAILABLE/);
 assert.throws(()=>x.provider.arm.call({...x.provider},x.request),/RECEIVER/);
 const b=x.provider.arm(x.request);assert.throws(()=>b.query.call({...b}),/RECEIVER/);assert.throws(()=>b.query(),/CREATION_REQUIRED/);
 assert.equal(x.realm.native.calls.length,0);
}));
for(const target of ['get','receipts','store'])test('capsule provider '+target+' accessor substitution refuses getter0 before creation',()=>control(async x=>{
 let gets=0;const object=target==='get'?x.realm.preparation.receipts:target==='receipts'?x.realm.preparation:x.f.c,key=target==='store'?'__loginomDockPreparationV1':target;
 Object.defineProperty(object,key,{get(){gets++;throw Error('foreign getter')},configurable:true});
 assert.throws(()=>x.provider.arm(x.request),/CHANGED/);assert.equal(gets,0);assert.equal(x.realm.native.calls.length,0);
}));
test('capsule provider refused original Map reader cannot be repaired by restoring its slot',()=>control(async x=>{
 const map=x.realm.preparation.receipts;Object.defineProperty(map,'get',{get(){throw Error('must not run')},configurable:true});
 let first;try{x.provider.arm(x.request)}catch(e){first=e}assert.match(first.message,/CHANGED/);delete map.get;
 assert.throws(()=>x.provider.arm(x.request),e=>e===first);assert.equal(x.realm.native.calls.length,0);
}));
test('capsule provider late verified creation cannot be adopted by a new arm',()=>control(async x=>{
 await x.prepare();assert.throws(()=>x.provider.arm(x.request),/LATE/);assert.equal(x.realm.native.calls.length,0);
}));
test('capsule provider copied or changed typed request refuses before query',()=>control(async x=>{
 const b=x.provider.arm(x.request);assert.throws(()=>x.provider.arm({...x.request}),/REPLAY/);
 await x.prepare();Object.defineProperty(x.request,'intent',{get(){throw Error('foreign getter')}});
 assert.throws(()=>b.query(),/REQUEST_CHANGED/);assert.equal(x.realm.native.calls.length,0);
}));
for(const reason of [false,0,null,undefined,'',Error('first',{cause:0})])test('capsule provider raw task rejection '+String(reason)+' wins secondary document drift',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();x.realm.native.fail(reason);const work=b.query();
 x.f.c.__loginomStartupV1.document={};await x.realm.native.drain();let failed=false,caught;try{await work}catch(e){failed=true;caught=e}
 assert(failed);assert.equal(caught,reason);assert.equal(b.query(),work);
}));
test('capsule provider pending original task reader accessor refuses getter0 without second dispatch',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query(),r=b.inspect();let gets=0;
 Object.defineProperty(r.task,'getAwaitedResult',{get(){gets++;throw Error('foreign getter')},configurable:true});
 await x.realm.native.drain();await assert.rejects(work,/CHANGED/);assert.equal(gets,0);assert.equal(x.realm.native.calls.length,1);
}));
for(const target of ['resolver','storage'])test('capsule provider original '+target+' accessor drift refuses before query getter0',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();let gets=0;
 const object=target==='resolver'?x.realm.native.session:x.f.c.bg.app.Application.FInstance.FMainForm.FUrlUtils,key=target==='resolver'?'$R':'FFileStorage';
 Object.defineProperty(object,key,{get(){gets++;throw Error('foreign')},configurable:true});
 assert.throws(()=>b.query(),/UNAVAILABLE|CHANGED/);assert.equal(gets,0);assert.equal(x.realm.native.calls.length,0);
}));
test('capsule provider pending proxy identity replacement refuses support without replay',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query();
 x.realm.native.packageProxy.$={...x.realm.native.packageProxy.$};await x.realm.native.drain();await assert.rejects(work,/CHANGED/);
 assert.equal(b.query(),work);assert.equal(x.realm.native.calls.length,1);
}));
test('capsule provider original QueryInterface function prototype drift refuses before dispatch',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();Object.setPrototypeOf(x.realm.native.definitions.ObjectProxyPrototype.QueryInterface,{});
 assert.throws(()=>b.query(),/CHANGED/);assert.equal(x.realm.native.calls.length,0);
}));
for(const target of ['session','method'])test('capsule provider foreign returned support '+target+' refuses without replay getter0',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();let gets=0;
 x.realm.native.queryReply(original=>{const foreign=Object.create(Object.getPrototypeOf(original),Object.getOwnPropertyDescriptors(original));
  if(target==='session')foreign.$S={};else Object.defineProperty(foreign,'SaveToStream',{get(){gets++;throw Error('foreign getter')},configurable:true});return foreign});
 const work=b.query();await assert.rejects(work,/SUPPORT|ACCESSOR/);assert.equal(b.query(),work);assert.equal(gets,0);assert.equal(x.realm.native.calls.length,1);
}));

// Lower dispatch/tasks are explicit native doubles. The pinned original
// QueryInterface body and the production provider execute unchanged in VM.
test('capsule provider lower retains exact response/task/continuation and restores own overlays',()=>control(async x=>{
 const transport=x.realm.native.session,dispatch=Object.getOwnPropertyDescriptor(transport,'DispatchMessageAsync'),resolver=Object.getOwnPropertyDescriptor(transport,'$R');
 const b=x.provider.arm(x.request);await x.prepare();const work=b.query();assert.equal(await work,x.realm.native.support);
 const r=b.inspect().lower;assert.equal(r.dispatchTask,x.probe.tasks[0]);assert.equal(r.support,x.realm.native.support);
 assert.equal(r.observed,true);assert.equal(r.completed,true);assert.equal(r.restored,true);assert.equal(r.w,11);assert.equal(r.o,73);assert.equal(r.hresult,0);assert.equal(r.returnedType,1291);
 assert.equal(typeof r.continuation,'function');assert.equal(typeof r.reader,'function');assert(r.request);assert(r.response);
 assert.equal(x.probe.readers,1);assert.equal(x.probe.resolvers,1);assert.equal(x.probe.continuations,1);
 assert.deepEqual(Object.getOwnPropertyDescriptor(transport,'DispatchMessageAsync'),dispatch);assert.deepEqual(Object.getOwnPropertyDescriptor(transport,'$R'),resolver);
 assert.equal(b.query(),work);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);
},true));
for(const target of ['resolver','dispatch','reader','continuation','requestRelease','taskConstructor','messageFactory','exceptionWrap'])test('capsule provider lower pending '+target+' accessor refuses getter0 without original completion',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query(),snapshot=b.inspect(),r=snapshot.lower;let gets=0,originalSettled=false;
 snapshot.task.continueWith(()=>{originalSettled=true});
 const [object,key]=target==='resolver'?[x.realm.native.session,'$R']:target==='dispatch'?[x.realm.native.session,'DispatchMessageAsync']:
  target==='reader'?[r.dispatchTask,'getAwaitedResult']:target==='continuation'?[r.dispatchTask,'continueWith']:
  target==='requestRelease'?[r.request,'Release']:target==='messageFactory'?[x.realm.native.session.$M,'GetDynamicData']:
  target==='exceptionWrap'?[x.f.ss.Exception,'wrap']:[x.f.ss,'TaskCompletionSource'];
 const foreign={get(){gets++;throw Error('foreign getter')},configurable:true};Object.defineProperty(object,key,foreign);
 const rejected=assert.rejects(work,/CHANGED|UNAVAILABLE/);await x.realm.native.drain();await rejected;await x.f.settle();
 assert.equal(gets,0);assert.equal(originalSettled,false);assert.equal(x.probe.resolvers,0);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);
 assert.equal(Object.getOwnPropertyDescriptor(object,key).get,foreign.get);assert.equal(b.query(),work);
},true));
test('capsule provider lower response accessor refuses without getter/resolver or replay',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();let gets=0;
 x.probe.response=response=>Object.defineProperty(response,'ReadParameterInt32',{get(){gets++;throw Error('foreign response getter')},configurable:true});
 const work=b.query(),rejected=assert.rejects(work,/ACCESSOR|CHANGED/);await x.realm.native.drain();await rejected;
 assert.equal(gets,0);assert.equal(x.probe.resolvers,0);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(b.query(),work);
},true));
test('capsule provider lower duplicate dispatch continuation cannot replay reader or resolver',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();await b.query();const reads=x.probe.readers,resolves=x.probe.resolvers;
 x.probe.callback();await x.f.settle();assert.equal(x.probe.readers,reads);assert.equal(x.probe.resolvers,resolves);
 assert.throws(()=>b.inspect(),/CONTINUATION_REPLAY/);assert.deepEqual(x.realm.native.calls,[0]);
},true));

for(const reason of [false,0,null,undefined,'',Error('lower-first',{cause:0})])test('capsule provider lower raw '+String(reason)+' wins foreign exception wrapper getter0',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();x.realm.native.fail(reason);const work=b.query();let gets=0;
 Object.defineProperty(x.f.ss.Exception,'wrap',{get(){gets++;throw Error('foreign wrap')},configurable:true});
 const rejected=assert.rejects(work,e=>Object.is(e,reason));await x.realm.native.drain();await rejected;
 assert.equal(gets,0);assert.equal(x.probe.readers,1);assert.equal(x.probe.resolvers,0);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(b.query(),work);
},true));

test('capsule fixed entry retains realm request before creation and reaches existing same-realm packet/query',()=>control(async x=>{
 x.f.c.__capsule=x.capsule;
 const entry='('+witness.retainTerminalPrepareOnCapsule.toString()+')';
 runInContext("globalThis.__request={operationId:'own-prepare',sessionId:'own-session',intent:'new_draft'}",x.f.c);
 const summary=runInContext(entry+'(__capsule,__request)',x.f.c);
 assert.equal(summary.creationArmed,true);assert.equal(summary.queryDispatched,false);assert.equal(x.realm.preparation.receipts.size,0);assert.equal(x.realm.native.calls.length,0);
 const b=x.provider.arm(x.f.c.__request);assert.equal(b.inspect().request,x.f.c.__request);
 await x.prepare();assert.equal(await b.query(),x.realm.native.support);assert.deepEqual(x.realm.native.calls,[0]);
 for(const k of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(summary[k],false);
}));
for(const mode of ['accessor','copy','wrong-intent','late'])test('capsule fixed entry '+mode+' refuses before native dispatch getter0',()=>control(async x=>{
 x.f.c.__capsule=x.capsule;x.f.c.getterCalls=0;
 const entry='('+witness.retainTerminalPrepareOnCapsule.toString()+')';
 runInContext("globalThis.__request={operationId:'own-prepare',sessionId:'own-session',intent:'new_draft'}",x.f.c);
 if(mode==='accessor')runInContext("Object.defineProperty(__request,'intent',{get(){getterCalls++;throw Error('foreign')}})",x.f.c);
 if(mode==='wrong-intent')x.f.c.__request.intent='open_package';
 if(mode==='copy')runInContext('globalThis.__capsule=Object.freeze(Object.create(Object.getPrototypeOf(__capsule),Object.getOwnPropertyDescriptors(__capsule)))',x.f.c);
 if(mode==='late')await x.prepare();
 assert.throws(()=>runInContext(entry+'(__capsule,__request)',x.f.c),/REQUEST|UNAVAILABLE|LATE/);assert.equal(x.f.c.getterCalls,0);assert.equal(x.realm.native.calls.length,0);
}));

async function creationControl(fn,{pageFailure,phaseHook,originalSdk=false,invokeSdk=false,instrument=false,realCompletion=false}={}){return control(async x=>{
 x.f.c.__capsule=x.capsule;
 if(pageFailure){x.realm.page.page.evaluate=async()=>{pageFailure(x);throw pageFailure.value}}
 const host=await joined({pageOverride:x.realm.page.page,account:'test-account',sessionId:'own-session',originalSdk,
  preparation(_f,input){x.f.c.__armInput=runInContext('('+JSON.stringify(input)+')',x.f.c);return runInContext('('+witness.retainTerminalPrepareOnCapsule.toString()+')(__capsule,__armInput)',x.f.c)},
  continuation(fn,mode){if(phaseHook){const intercepted=phaseHook(x,fn,mode);if(intercepted!==undefined)return intercepted}x.f.c.__creationPhase=mode;return runInContext('('+fn.toString()+')(__capsule,__creationPhase)',x.f.c)}});
 if(invokeSdk)host.c.token.invoke({signal:host.c.token.inspect().signal});
 const request=Object.freeze({operationId:'original',sessionId:'own-session',intent:'new_draft'});
 await host.witness.retainPrepare(request,host.f.bridge);
 const options={loginomUrl:'http://loginom.example/app?testable=true',compatibility:{profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},platform:'darwin',sessionId:'own-session',operationId:'original',timeoutMs:1};
 await fn({...x,host,options});
},instrument,realCompletion)}
test('creation continuation original armed request drives fixed workspace reserve/effect/verify and same query once',()=>creationControl(async x=>{
 assert.equal(x.realm.preparation.receipts.size,0);assert.equal(x.realm.native.calls.length,0);
 const work=x.host.witness.createWorkspace(x.options,x.host.f.bridge);assert.equal(x.host.witness.createWorkspace(x.options,x.host.f.bridge),work);
 const result=await work;assert.equal(result.status,'READY');assert.equal(result.creationContinuationVerified,true);assert.equal(result.queryCompleted,true);
 const b=x.provider.arm(x.f.c.__armInput),r=b.inspect();assert.equal(r.request,x.f.c.__armInput);assert.equal(r.receipt,x.realm.preparation.receipts.get('original'));
 assert.equal(r.creation.packageProxy,x.realm.native.packageProxy);assert.equal(r.receipt.phase,'verified');assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);
 for(const key of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(result[key],false);
 assert.equal(x.host.witness.createWorkspace(x.options,x.host.f.bridge),work);
}));
test('creation continuation copied bridge refuses before workspace/dispatch',()=>creationControl(async x=>{
 assert.throws(()=>x.host.witness.createWorkspace(x.options,{...x.host.f.bridge}));assert.equal(x.realm.preparation.receipts.size,0);assert.equal(x.realm.native.calls.length,0);
}));
test('creation continuation options accessor refuses getter0 before workspace',()=>creationControl(async x=>{
 let gets=0;Object.defineProperty(x.options,'timeoutMs',{get(){gets++;throw Error('foreign getter')}});
 assert.throws(()=>x.host.witness.createWorkspace(x.options,x.host.f.bridge));assert.equal(gets,0);assert.equal(x.realm.preparation.receipts.size,0);
}));
for(const reason of [false,0,null,undefined,'',Error('first creation',{cause:0})])test('creation continuation raw '+String(reason)+' before UI wins secondary options drift without replay',()=>{
 const failure={value:reason};
 return creationControl(async x=>{
  // The hook receives the underlying control object. Share only this test value.
  failure.options=x.options;
  const work=x.host.witness.createWorkspace(x.options,x.host.f.bridge);let caught=false;
  try{await work}catch(value){caught=true;assert.equal(value,reason)}assert(caught);
  assert.equal(x.host.witness.createWorkspace(x.options,x.host.f.bridge),work);assert.deepEqual(x.realm.native.calls,[]);assert.equal(x.realm.preparation.receipts.size,0);
 },{pageFailure:Object.assign(()=>{failure.options.timeoutMs++},{value:reason})});
});

for(const drift of ['reader','receipt','before'])test('creation continuation pending '+drift+' refuses in same evaluator getter0 before create/query',()=>{
 let gets=0;return creationControl(async x=>{
  await assert.rejects(x.host.witness.createWorkspace(x.options,x.host.f.bridge),/CHANGED|UNAVAILABLE/);assert.equal(gets,0);assert.deepEqual(x.realm.native.calls,[]);assert.equal(x.realm.page.events.includes('create_draft'),false);
 },{phaseHook(x,fn,input){if(fn.name!=='inspectWorkspaceRealm'||input.mode!=='effect')return;
  const map=x.realm.preparation.receipts;
  if(drift==='reader')Object.defineProperty(map,'get',{get(){gets++;throw Error('foreign getter')},configurable:true});
  if(drift==='receipt')Map.prototype.set.call(map,'original',{phase:'reserved'});
  if(drift==='before')Map.prototype.get.call(map,'original').before.push({});
 }});
});
test('creation continuation completed managed call cannot be reacquired for creation',()=>creationControl(async x=>{
 assert.equal(x.host.c.token.finish(),true);assert.throws(()=>x.host.witness.createWorkspace(x.options,x.host.f.bridge));assert.equal(x.realm.preparation.receipts.size,0);assert.equal(x.realm.native.calls.length,0);
}));

test('creation continuation successful completion refuses later options drift without create/query replay',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);x.options.timeoutMs++;
 assert.throws(()=>x.host.witness.createWorkspace(x.options,x.host.f.bridge));assert.deepEqual(x.realm.native.calls,[0]);
 assert.equal(x.realm.page.events.filter(e=>e==='create_draft').length,1);
}));

test('packet continuation retains initial realm custody before creation and queries same packet with original managed control',()=>creationControl(async x=>{
 const initial=x.provider.arm(x.f.c.__armInput).inspect().initial;assert(Object.isFrozen(initial));assert.equal(initial.request,x.f.c.__armInput);assert.equal(initial.currentUser,x.f.user);
 assert.equal(initial.preparation,x.realm.preparation);assert.equal(initial.transport,x.realm.native.session);assert.equal(x.realm.preparation.receipts.size,0);
 assert.throws(()=>x.provider.packet(),/INCOMPLETE/);
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const packet=x.provider.packet();assert.equal(packet.initial,initial);assert.equal(packet.receipt,x.realm.preparation.receipts.get('original'));
 const before=x.host.c.token.inspect(),work=x.host.witness.continueComponent(x.host.f.bridge);assert.equal(x.host.witness.continueComponent(x.host.f.bridge),work);
 const result=await work;assert.equal(result.packetQueryContinuationVerified,true);assert.equal(result.componentReady,false);assert.equal(result.reason,'READONLY_STORAGE_COMPONENT_NOT_BOUND');assert.equal(result.originalManagedControlRetained,true);assert.equal(result.parentSignalSameReference,false);
 const after=x.host.c.token.inspect();for(const key of ['signal','controller','handleTask','sdkTask'])assert.equal(after[key],before[key]);assert(before.sdkTask instanceof Promise);
 for(const key of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(result[key],false);
 assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);assert.equal(x.host.witness.continueComponent(x.host.f.bridge),work);
},{originalSdk:true,invokeSdk:true}));
for(const mode of ['missing','late'])test('packet continuation '+mode+' SDK task cannot repair initial control',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);
 if(mode==='late')x.host.c.token.invoke({signal:x.host.c.token.inspect().signal});
 assert.throws(()=>x.host.witness.continueComponent(x.host.f.bridge),/SDK_TASK_UNAVAILABLE/);assert.deepEqual(x.realm.native.calls,[0]);
},{originalSdk:true}));
test('packet continuation copied packet cannot enter original provider or local packet registry',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const retained=x.provider.packet(),copy=Object.freeze({...retained});
 assert.throws(()=>x.provider.checkPacket(copy),/PACKET_FOREIGN/);assert.throws(()=>packet.checkTerminalOriginalPacket(copy,{}),/PACKET/);
 assert.throws(()=>x.provider.queryPacket(copy),/PACKET_FOREIGN/);await x.host.witness.continueComponent(x.host.f.bridge);assert.deepEqual(x.realm.native.calls,[0]);
},{originalSdk:true,invokeSdk:true}));
for(const reason of [false,0,null,undefined,'',Error('first component',{cause:0})])test('packet continuation raw '+String(reason)+' wins secondary controller drift',()=>{
 let host;return creationControl(async x=>{host=x.host;await x.host.witness.createWorkspace(x.options,x.host.f.bridge);
  const work=x.host.witness.continueComponent(x.host.f.bridge);let caught=false;try{await work}catch(value){caught=true;assert.equal(value,reason)}assert(caught);assert.equal(x.host.witness.continueComponent(x.host.f.bridge),work);assert.deepEqual(x.realm.native.calls,[0]);
 },{originalSdk:true,invokeSdk:true,phaseHook(x,fn){if(fn.name==='continueTerminalRealmComponent'){host.f.state.controller={};throw reason}}});
});
test('packet continuation initial controller accessor refuses getter0 before realm/component read',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);let gets=0;Object.defineProperty(x.host.f.state,'controller',{get(){gets++;throw Error('foreign controller')}});
 assert.throws(()=>x.host.witness.continueComponent(x.host.f.bridge),/CHANGED/);assert.equal(gets,0);assert.deepEqual(x.realm.native.calls,[0]);
},{originalSdk:true,invokeSdk:true}));

test('packet continuation before creation refuses exact missing completion without native call',()=>creationControl(async x=>{
 assert.throws(()=>x.host.witness.continueComponent(x.host.f.bridge),/CREATION_UNAVAILABLE/);assert.deepEqual(x.realm.native.calls,[]);assert.equal(x.realm.preparation.receipts.size,0);
},{originalSdk:true,invokeSdk:true}));
test('packet continuation original abort false precedes foreign Page getter',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);let gets=0;x.host.f.state.controller.abort(false);
 Object.defineProperty(x.host.f.owner,'page',{get(){gets++;throw Error('foreign Page')}});
 let caught=false;try{x.host.witness.continueComponent(x.host.f.bridge)}catch(value){caught=true;assert.equal(value,false)}assert(caught);assert.equal(gets,0);assert.deepEqual(x.realm.native.calls,[0]);
},{originalSdk:true,invokeSdk:true}));
for(const mode of ['accessor','native-flag'])test('packet continuation '+mode+' projected component cannot mint qualification getter0',()=>{
 let gets=0;return creationControl(async x=>{await x.host.witness.createWorkspace(x.options,x.host.f.bridge);await assert.rejects(x.host.witness.continueComponent(x.host.f.bridge));assert.equal(gets,0);assert.deepEqual(x.realm.native.calls,[0]);
 },{originalSdk:true,invokeSdk:true,phaseHook(x,fn){if(fn.name!=='continueTerminalRealmComponent')return;
  const result={packetQueryContinuationVerified:true,interface_reply:'original_proxy_observed',componentReady:false,reason:'READONLY_STORAGE_COMPONENT_NOT_BOUND',controlLocation:'host',sourceExecutionQualified:false,closureIdentityQualified:false,nativeReceiversQualified:false,nativeAuthority:false,contentAuthority:false,saveAuthority:false,closeAuthority:false};
  if(mode==='accessor')Object.defineProperty(result,'componentReady',{get(){gets++;throw Error('foreign metadata')}});else result.nativeReceiversQualified=true;
  return Promise.resolve(result);
 }});
});

test('packet continuation waits original pending creation while SDK task remains pending without remint',()=>creationControl(async x=>{
 const original=x.host.c.token.inspect().sdkTask,creation=x.host.witness.createWorkspace(x.options,x.host.f.bridge);
 const work=x.host.witness.continueComponent(x.host.f.bridge);assert.equal(x.host.witness.continueComponent(x.host.f.bridge),work);
 assert.equal((await work).packetQueryContinuationVerified,true);assert.equal((await creation).status,'READY');
 assert.equal(x.host.c.token.inspect().sdkTask,original);assert.equal(x.realm.page.events.filter(e=>e==='create_draft').length,1);assert.deepEqual(x.realm.native.calls,[0]);
},{originalSdk:true,invokeSdk:true}));


test('storage continuation fixed reads reuse original query and same packet/control, no writer authority',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);
 const initial=x.provider.packet().initial;assert(Object.isFrozen(initial.storageReaders));
 const work=x.host.witness.continueStorage(x.host.f.bridge);assert.equal(x.host.witness.continueStorage(x.host.f.bridge),work);
 const result=await work;assert.equal(result.readonlyStorageVerified,true);assert.equal(result.status,'PARTIAL');assert.equal(result.componentReady,false);
 assert.equal(result.connected,true);assert.equal(result.isOwnCurrentDirectory,true);assert.equal(typeof result.currentDirectory,'string');assert.equal(typeof result.rootPath,'string');
 for(const key of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority','nativeReceiversQualified','sourceExecutionQualified','closureIdentityQualified'])assert.equal(result[key],false);
 assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);assert.equal(x.realm.native.writes(),0);
 assert.equal(x.host.witness.continueStorage(x.host.f.bridge),work);assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);
},{originalSdk:true,invokeSdk:true}));

for(const [label,configure,expected,calls] of [
 ['disconnected',n=>n.connected(false),/DISCONNECTED/,[0,907]],
 ['nonpersonal',n=>n.own(false),/NON_PERSONAL/,[0,907,909,910]],
 ['unknown root',n=>n.root(''),/ROOT_UNKNOWN/,[0,907,909,910,911]],
])test('storage continuation '+label+' refuses without later native calls',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);configure(x.realm.native);
 const work=x.host.witness.continueStorage(x.host.f.bridge);await assert.rejects(work,expected);assert.equal(x.host.witness.continueStorage(x.host.f.bridge),work);
 assert.deepEqual(x.realm.native.calls,calls);assert.equal(x.realm.native.writes(),0);
},{originalSdk:true,invokeSdk:true}));
for(const method of ['get_Connected','get_CurrentDirectory','get_IsOwnCurrentDirectory','get_RootPath'])test('storage continuation original '+method+' accessor refuses getter0 before dispatch',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);let gets=0;
 Object.defineProperty(x.realm.native.storage,method,{get(){gets++;throw Error('foreign')},configurable:true});
 await assert.rejects(x.host.witness.continueStorage(x.host.f.bridge));assert.equal(gets,0);assert.deepEqual(x.realm.native.calls,[0]);
},{originalSdk:true,invokeSdk:true}));
// Each pending control starts the actual fixed 909 read, then changes an
// original operand before delivering the original dispatch task. No timer/poll.
for(const drift of ['reader','continuation','request release','response reader','transport','factory','Map reader','storage identity'])test('storage continuation pending '+drift+' refuses getter0 no 910/911 or reader replay',()=>{
 let held,gets=0;const ready=new Promise(resolve=>held=resolve);
 return creationControl(async x=>{
  await x.host.witness.createWorkspace(x.options,x.host.f.bridge);
  const work=x.host.witness.continueStorage(x.host.f.bridge);work.catch(()=>{});await ready;
  const task=x.probe.tasks.at(-1);const accessor=(object,key)=>Object.defineProperty(object,key,{get(){gets++;throw Error('foreign')},configurable:true});
  if(drift==='reader')accessor(task,'getAwaitedResult');
  if(drift==='continuation')accessor(task,'continueWith');
  if(drift==='transport')accessor(x.realm.native.session,'DispatchMessageAsync');
  if(drift==='factory')accessor(x.f.ss,'TaskCompletionSource');
  if(drift==='Map reader')accessor(x.realm.preparation.receipts,'get');
  if(drift==='storage identity')accessor(x.realm.native.storage.$,'$O');
  if(drift==='request release')accessor(x.probe.requests.at(-1),'Release');
  if(drift==='response reader')x.probe.response=response=>accessor(response,'ReadString');
  const before=x.probe.readers;await x.realm.native.drain();await assert.rejects(work);
  assert.equal(gets,0);assert.deepEqual(x.realm.native.calls,[0,907,909]);assert.equal(x.realm.native.writes(),0);
  assert.equal(x.host.witness.continueStorage(x.host.f.bridge),work);
  if(drift==='reader')assert.equal(x.probe.readers,before);
 },{originalSdk:true,invokeSdk:true,instrument:true,phaseHook(x,fn,method){if(fn.name==='readTerminalRealmStorage'&&method==='get_CurrentDirectory'){x.realm.native.hold();queueMicrotask(held)}}});
});
for(const reason of [false,0,null,undefined,'',Error('first storage',{cause:0})])test('storage continuation raw '+String(reason)+' wins secondary realm drift without next dispatch',()=>{
 let held;const ready=new Promise(resolve=>held=resolve);
 return creationControl(async x=>{
  await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const work=x.host.witness.continueStorage(x.host.f.bridge);work.catch(()=>{});await ready;
  x.realm.native.fail(reason);x.f.c.__loginomStartupV1.document={};await x.realm.native.drain();let caught=false;
  try{await work}catch(value){caught=true;assert.equal(value,reason)}assert(caught);
  assert.equal(x.host.witness.continueStorage(x.host.f.bridge),work);assert.deepEqual(x.realm.native.calls,[0,907,909]);assert.equal(x.realm.native.writes(),0);
 },{originalSdk:true,invokeSdk:true,phaseHook(x,fn,method){if(fn.name==='readTerminalRealmStorage'&&method==='get_CurrentDirectory'){x.realm.native.hold();queueMicrotask(held)}}});
});
for(const mode of ['abort','controller'])test('storage continuation post-read '+mode+' stops before next handle/native dispatch getter0',()=>{
 let host,gets=0;return creationControl(async x=>{
  host=x.host;await host.witness.createWorkspace(x.options,host.f.bridge);
  const work=host.witness.continueStorage(host.f.bridge);let caught=false;
  try{await work}catch(value){caught=true;if(mode==='abort')assert.equal(value,false)}assert(caught);assert.equal(gets,0);
  assert.deepEqual(x.realm.native.calls,[0,907]);assert.equal(x.realm.native.writes(),0);
 },{originalSdk:true,invokeSdk:true,phaseHook(x,fn,method){if(fn.name==='readTerminalRealmStorage'&&method==='get_Connected'){
  return (async()=>{x.f.c.__creationPhase=method;const value=await runInContext('('+fn.toString()+')(__capsule,__creationPhase)',x.f.c);
   if(mode==='abort')host.f.state.controller.abort(false);else Object.defineProperty(host.f.state,'controller',{get(){gets++;throw Error('foreign controller')},configurable:true});return value;})();
 }}});
});

test('storage continuation exact original lower readers/callbacks once and owned overlays restored',()=>creationControl(async x=>{
 const transport=x.realm.native.session,dispatch=Object.getOwnPropertyDescriptor(transport,'DispatchMessageAsync'),resolver=Object.getOwnPropertyDescriptor(transport,'$R');
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);await x.host.witness.continueStorage(x.host.f.bridge);
 assert.equal(x.probe.readers,5);assert.equal(x.probe.resolvers,1);assert.equal(x.probe.continuations,5);
 assert.deepEqual(Object.getOwnPropertyDescriptor(transport,'DispatchMessageAsync'),dispatch);assert.deepEqual(Object.getOwnPropertyDescriptor(transport,'$R'),resolver);
 const packet=x.provider.packet();const work=x.provider.readStoragePacket(packet,'get_RootPath');assert.equal(x.provider.readStoragePacket(packet,'get_RootPath'),work);await work;
 assert.throws(()=>x.provider.readStoragePacket({...packet},'get_RootPath'),/FOREIGN/);
 assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);
},{originalSdk:true,invokeSdk:true,instrument:true}));
test('storage continuation direct realm rejects copied packet, order and arbitrary method before dispatch',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const packet=x.provider.packet();
 assert.throws(()=>x.provider.readStoragePacket({...packet},'get_Connected'),/FOREIGN/);
 assert.throws(()=>x.provider.readStoragePacket(packet,'get_RootPath'),/ORDER/);
 assert.throws(()=>x.provider.readStoragePacket(packet,'SaveToStream'),/METHOD/);
 assert.deepEqual(x.realm.native.calls,[0]);
},{originalSdk:true,invokeSdk:true}));

test('completion source retains actual original source/task and original success value, no query replay',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();const result=await b.query(),lower=b.inspect().lower;
 assert.equal(lower.completionSourceCustodyVerified,true);assert.equal(lower.completionSource.task,lower.sourceTask);assert.equal(lower.sourceTask,b.inspect().task);
 assert.equal(lower.sourceSettled,true);assert.equal(lower.sourceMethod,'setResult');assert.equal(lower.sourceValue,result);
 assert.equal(Object.hasOwn(lower.completionSource,'setResult'),true);assert.equal(b.query(),b.inspect().work);assert.deepEqual(x.realm.native.calls,[0]);
}));
for(const target of ['task','setResult','setException','source prototype','task prototype','constructor prototype'])test('completion source pending '+target+' refuses getter0 without original settlement',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query(),r=b.inspect().lower;let gets=0,completed=false;
 r.sourceTask.continueWith(()=>{completed=true});
 if(target==='source prototype')Object.setPrototypeOf(r.completionSource,{});
 else if(target==='task prototype')Object.setPrototypeOf(r.sourceTask,{});
 else if(target==='constructor prototype')Object.setPrototypeOf(x.f.ss.TaskCompletionSource,{});
 else Object.defineProperty(r.completionSource,target,{get(){gets++;throw Error('foreign source')},configurable:true});
 const rejection=assert.rejects(work,/CHANGED|UNAVAILABLE/);await x.realm.native.drain();await rejection;await x.f.settle();
 assert.equal(gets,0);assert.equal(completed,false);assert.equal(x.probe.resolvers,0);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);assert.equal(b.query(),work);
},true));

test('completion source actual pinned mscorlib constructor and Task IIFE keep original same-realm source/task',()=>control(async x=>{
 const constructor=x.f.ss.TaskCompletionSource,prototype=constructor.prototype,taskPrototype=x.f.ss.Task.prototype;
 const b=x.provider.arm(x.request);await x.prepare();const support=await b.query(),lower=b.inspect().lower;
 assert.equal(Object.getPrototypeOf(lower.completionSource),prototype);assert.equal(Object.getPrototypeOf(lower.sourceTask),taskPrototype);
 assert.equal(lower.sourceTask,b.inspect().task);assert.equal(lower.sourceTask.status,5);assert.equal(lower.sourceValue,support);
 assert.equal(lower.completionSourceCustodyVerified,true);assert.equal(x.f.ss.TaskCompletionSource,constructor);
 assert.equal(Object.hasOwn(lower.completionSource,'setResult'),false);assert.equal(Object.hasOwn(lower.completionSource,'setException'),false);
 assert.equal(lower.sourceTask.getAwaitedResult(),support);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);
},false,true));

test('completion source foreign task and early settlement refuse without manufactured result',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query(),source=b.inspect().lower.completionSource;
 assert.throws(()=>source.setResult({}),/COMPLETION_RESULT/);await assert.rejects(work,/COMPLETION_RESULT/);
 assert.equal(b.query(),work);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);
}));

// New fixed birth window: full pinned mscorlib.js + Task.js in this same VM.
// Descriptor/return mutation wrappers below are labelled negative fixtures.
test('birth continuation observes one original lexical construction and restores prototype before return',()=>control(async x=>{
 const prototype=x.f.ss.TaskCompletionSource.prototype,initial=Object.getOwnPropertyDescriptor(prototype,'task');assert.equal(initial,undefined);
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query(),r=b.inspect().lower,birth=r.continuationBirth;
 assert(Object.isFrozen(birth));assert.equal(birth.observed,true);assert.equal(birth.assignmentObserved,true);assert.equal(birth.prototypeRestored,true);assert.equal(birth.lexicalCalleeIdentityQualified,true);
 assert.equal(birth.primarySource,r.completionSource);assert.equal(birth.primaryTask,r.sourceTask);assert.notEqual(birth.source,r.completionSource);assert.notEqual(birth.task,r.sourceTask);
 assert.equal(birth.returnedTask,birth.task);assert.equal(birth.source.task,birth.task);assert.equal(Object.getPrototypeOf(birth.source),prototype);assert.equal(Object.getPrototypeOf(birth.task),x.f.ss.Task.prototype);
 assert.equal(birth.statusAtReturn,3);assert.equal(birth.task.status,3);assert.equal(r.sourceTask.status,3);
 assert.deepEqual(Object.getOwnPropertyDescriptor(prototype,'task'),initial);
 const d=Object.getOwnPropertyDescriptor(birth.source,'task');assert.equal(d.value,birth.task);assert.equal(d.writable,true);assert.equal(d.enumerable,true);assert.equal(d.configurable,true);
 await x.realm.native.drain();assert.equal(await work,x.realm.native.support);assert.equal(birth.task.status,5);assert.equal(birth.task.getAwaitedResult(),undefined);assert.equal(b.query(),work);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);
},false,true));
test('birth continuation fixture dispatch and missing Task definition cannot qualify lexical birth',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();await b.query();const birth=b.inspect().lower.continuationBirth;
 assert.equal(birth.observed,false);assert.equal(birth.reason,'ORIGINAL_TASK_DEFINITION_UNAVAILABLE');assert.equal(birth.lexicalCalleeIdentityQualified,false);assert.deepEqual(x.realm.native.calls,[0]);
}));
for(const target of ['slot','source task','source prototype','task prototype'])test('birth continuation pending '+target+' drift refuses getter0 before resolver, original tasks pending',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query(),r=b.inspect().lower,birth=r.continuationBirth;let gets=0;
 if(target==='slot')Object.defineProperty(x.f.ss.TaskCompletionSource.prototype,'task',{get(){gets++;throw Error('foreign slot')},configurable:true});
 if(target==='source task')Object.defineProperty(birth.source,'task',{get(){gets++;throw Error('foreign task')},configurable:true});
 if(target==='source prototype')Object.setPrototypeOf(birth.source,{});
 if(target==='task prototype')Object.setPrototypeOf(birth.task,{});
 const failed=assert.rejects(work,/CHANGED|UNAVAILABLE/);await x.realm.native.drain();await failed;
 assert.equal(gets,0);assert.equal(r.sourceTask.status,3);assert.equal(birth.task.status,3);assert.equal(x.probe.resolvers,0);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);assert.equal(b.query(),work);
},true,true));
for(const reason of [false,0,null,undefined,'',Error('birth first',{cause:0})])test('birth continuation raw '+String(reason)+' reader rejection wins secondary birth drift',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query(),r=b.inspect().lower,birth=r.continuationBirth;let gets=0;
 x.realm.native.fail(reason);Object.defineProperty(birth.source,'task',{get(){gets++;throw Error('secondary birth drift')},configurable:true});
 const rejected=assert.rejects(work,e=>Object.is(e,reason));await x.realm.native.drain();await rejected;
 assert.equal(gets,0);assert.equal(r.sourceTask.status,3);assert.equal(birth.task.status,3);assert.equal(x.probe.readers,1);assert.equal(x.probe.resolvers,0);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(b.query(),work);
},true,true));
for(const mode of ['wrong return','duplicate','wrong status','flags','status accessor','source prototype chain'])test('birth continuation '+mode+' refuses and preserves pending primary without replay',()=>{
 let primary,foreign,gets=0;return control(async x=>{
  const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query();await assert.rejects(work,/BIRTH|CHANGED|UNAVAILABLE/);await x.realm.native.drain();assert.equal(gets,0);
  assert.equal(primary.status,3);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);assert.equal(b.query(),work);
  if(mode==='flags')assert.deepEqual(Object.getOwnPropertyDescriptor(x.f.ss.TaskCompletionSource.prototype,'task'),foreign);
  else assert.equal(Object.getOwnPropertyDescriptor(x.f.ss.TaskCompletionSource.prototype,'task'),undefined);
 },false,{continuation({primary:task,callback,original,sourcePrototype}){
  primary=task;const result=Reflect.apply(original,task,[callback]);
  if(mode==='wrong return')return {};
  if(mode==='duplicate')Reflect.apply(original,task,[callback]);
  if(mode==='wrong status')result.status=5;
  if(mode==='status accessor')Object.defineProperty(result,'status',{get(){gets++;throw Error('foreign status')},configurable:true});
  if(mode==='source prototype chain')Object.setPrototypeOf(sourcePrototype,{});
  if(mode==='flags'){foreign={...Object.getOwnPropertyDescriptor(sourcePrototype,'task'),enumerable:true};Object.defineProperty(sourcePrototype,'task',foreign)}
  return result;
 }});
});
for(const reason of [false,0,null,undefined,'',Error('continue first',{cause:0})])test('birth continuation first raw '+String(reason)+' original call throw survives foreign descriptor refusal',()=>{
 let primary,foreign,gets=0;return control(async x=>{
  const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query();await assert.rejects(work,e=>Object.is(e,reason));await x.realm.native.drain();
  assert.equal(primary.status,3);assert.equal(gets,0);assert.deepEqual(Object.getOwnPropertyDescriptor(x.f.ss.TaskCompletionSource.prototype,'task'),foreign);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(b.query(),work);
 },false,{continuation({primary:task,sourcePrototype}){
  primary=task;foreign={get(){gets++;throw Error('foreign slot')},set:undefined,enumerable:false,configurable:true};Object.defineProperty(sourcePrototype,'task',foreign);throw reason;
 }});
});
test('birth continuation pre-registration slot drift refuses getter0 with original primary task still pending',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();let gets=0;const prototype=x.f.ss.TaskCompletionSource.prototype;
 const foreign={get(){gets++;throw Error('foreign')},set:undefined,configurable:true,enumerable:false};
 x.probe.onDispatch=()=>Object.defineProperty(prototype,'task',foreign);
 x.realm.native.hold();const work=b.query();await assert.rejects(work,/BIRTH_SLOT_CHANGED|CHANGED/);await x.realm.native.drain();
 assert.equal(gets,0);assert.equal(x.originalSources.length,1);assert.equal(x.originalSources[0].task.status,3);assert.equal(x.probe.resolvers,0);assert.deepEqual(Object.getOwnPropertyDescriptor(prototype,'task'),foreign);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(b.query(),work);
},true,{trackSources:true}));
test('birth continuation real Task constructor stays linked through existing packet/control storage route',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const result=await x.host.witness.continueStorage(x.host.f.bridge);
 const birth=x.provider.arm(x.f.c.__armInput).inspect().lower.continuationBirth;assert.equal(birth.observed,true);assert.equal(birth.statusAtReturn,3);assert.equal(birth.task.status,5);
 assert.equal(Object.getOwnPropertyDescriptor(x.f.ss.TaskCompletionSource.prototype,'task'),undefined);
 assert.equal(result.readonlyStorageVerified,true);assert.equal(result.componentReady,false);assert.equal(result.reason,'NATIVE_LEXICAL_QUALIFICATION_MISSING');
 assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);assert.equal(x.realm.native.writes(),0);for(const key of ['nativeAuthority','contentAuthority','saveAuthority','closeAuthority','closureIdentityQualified'])assert.equal(result[key],false);
},{originalSdk:true,invokeSdk:true,realCompletion:true}));

// Forwarders execute the original pinned Task.js functions in the same VM as
// mscorlib.js. Native/session/dispatch remain explicitly labelled doubles.
test('derived forwarders retain original returned promises and same secondary reader/receiver',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query(),r=b.inspect().lower;let f=r.forwarders;
 assert.equal(f.task,r.continuationBirth.task);assert.equal(f.lexicalCalleeIdentityQualified,false);
 assert.equal(f.bases.length,4);assert.equal(f.outputs.length,4);assert.equal(f.reads.length,0);assert.equal(f.settlements.length,0);
 for(let i=0;i<4;i++){const row=f.outputs[i];assert.equal(row.task,f.task);assert.equal(row.method,x.f.ss.Task.prototype[row.kind]);assert.equal(Object.getPrototypeOf(row.promise),runInContext('Promise.prototype',x.f.c));assert.equal(f.bases[i].task,f.task)}
 assert.equal(f.outputs[0].promise,f.bases[0].promise);assert.notEqual(f.outputs[1].promise,f.bases[1].promise);
 assert.notEqual(f.outputs[2].promise,f.bases[2].promise);assert.notEqual(f.outputs[3].promise,f.bases[3].promise);
 await x.realm.native.drain();assert.equal(await work,x.realm.native.support);await Promise.all(f.outputs.map(row=>row.promise));await Promise.resolve();
 f=b.inspect().lower.forwarders;assert.equal(f.reads.length,4);assert.equal(f.settlements.length,4);assert(Object.isFrozen(f.reads));assert(Object.isFrozen(f.settlements));
 for(const row of f.reads){assert.equal(row.task,f.task);assert.equal(row.reader,f.reader);assert.equal(row.rejected,false);assert.equal(row.value,undefined)}
 for(const row of f.settlements){assert.equal(row.rejected,false);assert.equal(row.value,undefined)}
 for(const key of ['toPromise','then','getAwaitedResult'])assert.equal(Object.getOwnPropertyDescriptor(f.task,key),undefined);
 assert.equal(b.query(),work);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);
},true,true));
for(const key of ['toPromise','then','catch','finally','getAwaitedResult'])test('derived forwarders pending '+key+' accessor refuses getter0 before native resolver',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query(),r=b.inspect().lower;let gets=0;
 Object.defineProperty(r.continuationBirth.task,key,{get(){gets++;throw Error('foreign forwarder')},configurable:true});
 const failed=assert.rejects(work,/CHANGED|UNAVAILABLE/);await x.realm.native.drain();await failed;
 assert.equal(gets,0);assert.equal(r.sourceTask.status,3);assert.equal(r.continuationBirth.task.status,3);assert.equal(x.probe.resolvers,0);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(b.query(),work);
},true,true));
test('derived forwarders same packet/control route retains original task reads and qualification refusal',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const result=await x.host.witness.continueStorage(x.host.f.bridge);
 const binding=x.provider.arm(x.f.c.__armInput);let f=binding.inspect().lower.forwarders;await Promise.all(f.outputs.map(row=>row.promise));await Promise.resolve();f=binding.inspect().lower.forwarders;
 assert.equal(f.reads.length,4);assert.equal(f.settlements.length,4);assert.equal(f.lexicalCalleeIdentityQualified,false);
 assert.equal(result.readonlyStorageVerified,true);assert.equal(result.componentReady,false);assert.equal(result.reason,'NATIVE_LEXICAL_QUALIFICATION_MISSING');
 assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);assert.equal(x.realm.native.writes(),0);
},{originalSdk:true,invokeSdk:true,realCompletion:true}));

for(const target of ['Promise','task method','returned prototype'])test('derived forwarders '+target+' substitution cannot qualify or replay',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();let gets=0;
 if(target==='Promise')Object.defineProperty(x.f.c,'Promise',{get(){gets++;throw Error('foreign Promise')},configurable:true});
 if(target==='task method')Object.defineProperty(x.f.ss.Task.prototype,'toPromise',{get(){gets++;throw Error('late alias')},configurable:true});
 if(target!=='returned prototype'){assert.throws(()=>b.query(),/CHANGED|UNAVAILABLE/);assert.equal(x.realm.native.calls.length,0)}
 else{const work=b.query(),f=b.inspect().lower.forwarders;Object.setPrototypeOf(f.outputs[0].promise,{});const rejected=assert.rejects(work,/CHANGED|UNAVAILABLE/);await x.realm.native.drain();await rejected;assert.equal(f.task.status,3);assert.equal(b.query(),work)}
 assert.equal(gets,0);assert.equal(x.realm.native.writes(),0);
},true,true));
for(const reason of [false,0,null,undefined,'',Error('forward first',{cause:0})])test('derived forwarders raw '+String(reason)+' reader failure wins forwarder drift',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query(),r=b.inspect().lower;let gets=0;
 x.realm.native.fail(reason);Object.defineProperty(r.continuationBirth.task,'finally',{get(){gets++;throw Error('late finally')},configurable:true});
 const rejected=assert.rejects(work,e=>Object.is(e,reason));await x.realm.native.drain();await rejected;
 assert.equal(gets,0);assert.equal(r.sourceTask.status,3);assert.equal(r.forwarders.task.status,3);assert.equal(x.probe.resolvers,0);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(b.query(),work);
},true,true));


// Same pinned IIFEs/VM. Only the pair of observed constructor objects on this
// one original continueWith is qualified; broader native/closure flags stay false.
test('callee pair observes retained function prototypes and restores instances/descriptors before return',()=>control(async x=>{
 const tc=x.f.ss.TaskCompletionSource,task=x.f.ss.Task,ds=Object.getOwnPropertyDescriptor(tc,'prototype'),dt=Object.getOwnPropertyDescriptor(task,'prototype');
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query(),lower=b.inspect().lower,r=lower.continuationBirth;
 assert.equal(r.lexicalCalleeIdentityQualified,true);assert.equal(r.lexicalCalleeScope,'Task.continueWith:TaskCompletionSource/Task');assert.equal(r.sourceConstructor,tc);assert.equal(r.taskConstructor,task);
 assert.notEqual(r.sourceMarker,ds.value);assert.notEqual(r.taskMarker,dt.value);assert.equal(Object.getPrototypeOf(r.sourceMarker),ds.value);assert.equal(Object.getPrototypeOf(r.taskMarker),dt.value);
 assert(Object.isFrozen(r));assert(Object.isFrozen(r.sourceMarker));assert(Object.isFrozen(r.taskMarker));
 assert.deepEqual(Object.getOwnPropertyDescriptor(tc,'prototype'),ds);assert.deepEqual(Object.getOwnPropertyDescriptor(task,'prototype'),dt);
 assert.equal(Object.getPrototypeOf(r.source),ds.value);assert.equal(Object.getPrototypeOf(r.task),dt.value);assert.equal(r.returnedTask,r.task);assert.equal(r.task.status,3);assert.equal(lower.sourceTask.status,3);
 await x.realm.native.drain();assert.equal(await work,x.realm.native.support);assert.equal(r.task.status,5);assert.equal(b.query(),work);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);
},true,true));
test('callee pair remains scoped on same packet/control storage route',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const result=await x.host.witness.continueStorage(x.host.f.bridge);
 const r=x.provider.arm(x.f.c.__armInput).inspect().lower.continuationBirth;assert.equal(r.lexicalCalleeIdentityQualified,true);assert.equal(r.task.status,5);
 assert.equal(Object.getPrototypeOf(r.source),r.sourcePrototype);assert.equal(Object.getPrototypeOf(r.task),r.taskPrototype);
 assert.equal(result.reason,'NATIVE_LEXICAL_QUALIFICATION_MISSING');assert.equal(result.componentReady,false);assert.equal(result.readonlyStorageVerified,true);
 assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);assert.equal(x.realm.native.writes(),0);
 for(const key of ['closureIdentityQualified','nativeAuthority','contentAuthority','saveAuthority','closeAuthority'])assert.equal(result[key],false);
},{originalSdk:true,invokeSdk:true,realCompletion:true}));
for(const reason of [false,0,null,undefined,'',Error('callee first',{cause:0})])test('callee pair original throw '+String(reason)+' restores owned function descriptors before refusal',()=>{
 let tcCtor,taskCtor,tcDescriptor,taskDescriptor,born;return control(async x=>{
  const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query();await assert.rejects(work,e=>Object.is(e,reason));
  assert.deepEqual(Object.getOwnPropertyDescriptor(tcCtor,'prototype'),tcDescriptor);assert.deepEqual(Object.getOwnPropertyDescriptor(taskCtor,'prototype'),taskDescriptor);assert.equal(Object.getOwnPropertyDescriptor(tcDescriptor.value,'task'),undefined);assert.equal(Object.getPrototypeOf(born),taskDescriptor.value);assert.equal(born.status,3);
  await x.realm.native.drain();assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);assert.equal(b.query(),work);
 },true,{beforeCapture(f){tcCtor=f.ss.TaskCompletionSource;taskCtor=f.ss.Task;tcDescriptor=Object.getOwnPropertyDescriptor(tcCtor,'prototype');taskDescriptor=Object.getOwnPropertyDescriptor(taskCtor,'prototype')},continuation({primary,callback,original}){born=Reflect.apply(original,primary,[callback]);throw reason}});
});

for(const which of ['Task','TaskCompletionSource'])for(const alias of ['same prototype','different prototype','proxy'])test('callee pair dynamic '+which+' '+alias+' alias cannot replace lexical callee',async()=>{
 let entered=false;await control(async x=>{
  entered=true;let b,work;await assert.rejects(async()=>{b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();work=b.query();await work},/CALLEE|BIRTH|DEFINITION|CHANGED|UNAVAILABLE/);await x.realm.native.drain();assert.equal(x.probe.resolvers,0);assert.equal(x.realm.native.writes(),0);if(work)assert.equal(b.query(),work);
 },true,{beforeCapture(f){const original=f.ss[which];function foreign(...args){return Reflect.construct(original,args,original)}foreign.prototype=alias==='same prototype'?original.prototype:Object.create(original.prototype);f.ss[which]=alias==='proxy'?new Proxy(original,{}):foreign}}).catch(error=>{if(entered)throw error;assert.match(String(error),/CALLEE|BIRTH|DEFINITION|CHANGED|UNAVAILABLE/)})
});
for(const which of ['Task','TaskCompletionSource'])test('callee pair pending '+which+' prototype descriptor drift refuses before resolver',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query(),r=b.inspect().lower;const ctor=x.f.ss[which],foreign={foreign:true};ctor.prototype=foreign;
 const failed=assert.rejects(work,/CHANGED|UNAVAILABLE/);await x.realm.native.drain();await failed;assert.equal(ctor.prototype,foreign);assert.equal(x.probe.resolvers,0);assert.equal(r.sourceTask.status,3);assert.equal(r.continuationBirth.task.status,3);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(b.query(),work);
},true,true));
for(const which of ['Task','TaskCompletionSource'])test('callee pair foreign '+which+' descriptor is not overwritten after raw throw',()=>{
 const reason=which==='Task'?false:Error('original raw',{cause:0});let taskCtor,sourceCtor,originalTaskPrototype,originalSourcePrototype,born,foreign;
 return control(async x=>{
  const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query();await assert.rejects(work,e=>Object.is(e,reason));
  assert.equal(x.f.ss[which].prototype,foreign);assert.equal(Object.getPrototypeOf(born),originalTaskPrototype);
  assert.equal((which==='Task'?sourceCtor:taskCtor).prototype,which==='Task'?originalSourcePrototype:originalTaskPrototype);
  assert.equal(Object.getOwnPropertyDescriptor(originalSourcePrototype,'task'),undefined);await x.realm.native.drain();assert.equal(born.status,3);assert.equal(x.probe.resolvers,0);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(b.query(),work);
 },true,{beforeCapture(f){taskCtor=f.ss.Task;sourceCtor=f.ss.TaskCompletionSource;originalTaskPrototype=taskCtor.prototype;originalSourcePrototype=sourceCtor.prototype},continuation({primary,callback,original,ss}){
  born=Reflect.apply(original,primary,[callback]);foreign={foreign:true};ss[which].prototype=foreign;throw reason;
 }});
});
for(const which of ['Task','TaskCompletionSource'])test('callee pair pre-call '+which+' nonwritable prototype refuses before original continuation',()=>control(async x=>{
 const b=x.provider.arm(x.request);await x.prepare();const ctor=x.f.ss[which];
 x.probe.onDispatch=()=>Object.defineProperty(ctor,'prototype',{...Object.getOwnPropertyDescriptor(ctor,'prototype'),writable:false});
 x.realm.native.hold();const work=b.query();await assert.rejects(work,/CHANGED|UNAVAILABLE|PROTOTYPE/);await x.realm.native.drain();assert.equal(x.probe.resolvers,0);assert.equal(b.query(),work);
},true,true));

test('callee pair raw throw restores through retained intrinsic without foreign getter',()=>{
 const reason=false;let born,ctor,prototype,object,gets=0;return control(async x=>{
  const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query();await assert.rejects(work,e=>Object.is(e,reason));
  assert.equal(Object.getPrototypeOf(born),prototype);assert.equal(ctor.prototype,prototype);assert.equal(gets,0);await x.realm.native.drain();assert.equal(born.status,3);assert.equal(x.probe.resolvers,0);assert.equal(b.query(),work);
 },true,{beforeCapture(f){ctor=f.ss.Task;prototype=ctor.prototype;object=runInContext('Object',f.c)},continuation({primary,callback,original}){
  born=Reflect.apply(original,primary,[callback]);Object.defineProperty(object,'setPrototypeOf',{get(){gets++;throw Error('foreign intrinsic')},configurable:true});
  throw reason;
 }});
});

// Actual original initClass wrapper calls; constructor/assembly/DOM/native are
// explicit doubles here. A separate browser control executes complete IIFEs.
test('initializer call retains pre-original function/args and completions through packet/control',()=>creationControl(async x=>{
 const records=x.f.inspect().acquisition.loadedDefinitions.initializers.records;
 assert.equal(records.length,3);for(let i=0;i<3;i++){
  const r=records[i],c=r.call;assert(Object.isFrozen(c));assert(Object.isFrozen(r.completion));assert.equal(c.ordinal,i);assert.equal(c.beforeOriginalCall,true);
  for(const key of ['initializer','receiver','ctor','assembly','members','baseType','interfaces'])assert.equal(c[key],r[key]);
  assert.equal(c.values[0],r.ctor);assert.equal(c.values[1],r.assembly);assert.equal(c.values[2],r.members);assert.equal(c.arguments[0],r.ctor);assert.equal(c.arguments[1],r.assembly);assert.equal(c.arguments[2],r.members);
  assert.equal(r.completion.call,c);assert.equal(r.completion.originalReturned,true);assert.equal(r.completion.returned,undefined);assert.equal(c.closureIdentityQualified,false);assert.equal(c.nativeReceiversQualified,false);
 }
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const initial=x.provider.arm(x.f.c.__armInput).inspect().initial;
 for(let i=0;i<3;i++){assert.equal(initial.initializerCalls[i],records[i].call);assert.equal(initial.initializerCompletions[i],records[i].completion)}
 const result=await x.host.witness.continueStorage(x.host.f.bridge);assert.equal(result.reason,'NATIVE_LEXICAL_QUALIFICATION_MISSING');assert.equal(result.componentReady,false);assert.equal(result.readonlyStorageVerified,true);
 assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);assert.equal(x.realm.native.writes(),0);
},{originalSdk:true,invokeSdk:true,realCompletion:true}));
for(const target of ['arguments','argument flags','members','initializer','constructor alias','assembly'])test('initializer call pending '+target+' drift refuses getter0 before reader',()=>control(async x=>{
 const records=x.f.inspect().acquisition.loadedDefinitions.initializers.records,r=records[1];
 const b=x.provider.arm(x.request);await x.prepare();x.realm.native.hold();const work=b.query();let gets=0;
 if(target==='arguments')Object.defineProperty(r.call.arguments,'1',{get(){gets++;throw Error('foreign argument')},configurable:true});
 if(target==='argument flags')Object.defineProperty(r.call.arguments,'0',{...Object.getOwnPropertyDescriptor(r.call.arguments,'0'),writable:false});
 if(target==='members')Object.defineProperty(r.members,'get_Connected',{get(){gets++;throw Error('foreign member')},configurable:true});
 if(target==='initializer')Object.setPrototypeOf(r.call.initializer,{});
 if(target==='constructor alias')x.f.c.bg.rpc.TIBGFileStorage_Proxy=function foreign(){};
 if(target==='assembly')Object.defineProperty(r.assembly,'name',{get(){gets++;throw Error('foreign assembly')},configurable:true});
 const rejected=assert.rejects(work,/UNAVAILABLE|CHANGED/);await x.realm.native.drain();await rejected;assert.equal(gets,0);assert.equal(x.probe.resolvers,0);assert.equal(x.realm.native.writes(),0);assert.deepEqual(x.realm.native.calls,[0]);assert.equal(b.query(),work);
},true,true));
test('initializer call late constructor alias refuses before workspace creation',()=>control(async x=>{
 const original=x.f.constructors.ObjectProxy;x.f.c.rpc.TBGObjectProxy=function foreign(){};
 assert.throws(()=>x.provider.arm(x.request),/UNAVAILABLE|CHANGED/);assert.notEqual(x.f.c.rpc.TBGObjectProxy,original);assert.equal(x.realm.page.events.includes('create_draft'),false);assert.equal(x.realm.native.calls.length,0);
},true,true));
for(const reason of [false,0,null,undefined,'',Error('initializer first',{cause:0})])test('initializer call original throw '+String(reason)+' remains raw before completion',async()=>{
 // Negative original-base fixture; no native/session acquisition is performed.
 const f=await fresh({initializer(){throw reason}});let threw=false,first;
 try{f.init('ObjectProxy')}catch(error){threw=true;first=error}assert.equal(threw,true);assert.equal(first,reason);
 let gets=0;Object.defineProperty(f.ss,'initClass',{get(){gets++;throw Error('foreign initializer')},configurable:true});
 let refused=false,caught;try{f.inspect()}catch(error){refused=true;caught=error}assert.equal(refused,true);assert.equal(caught,reason);assert.equal(gets,0);
});

test('initializer call copied receipts or host DTO cannot replace original packet custody',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const original=x.provider.packet();
 const copied={...original,initial:{...original.initial,initializerCalls:original.initial.initializerCalls.map(call=>Object.freeze({...call}))}};
 assert.throws(()=>x.provider.checkPacket(copied),/FOREIGN/);assert.equal(x.provider.packet(),original);
 const dto=witness.projectTerminalScriptWitness(x.capsule);assert.equal(Object.hasOwn(dto,'initializerCalls'),false);assert.equal(Object.hasOwn(dto,'initializerCompletions'),false);
 assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);
},{originalSdk:true,invokeSdk:true,realCompletion:true}));

test('storage receiver original four dispatches retain exact precreation FileStorage, method and packet',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);
 const packet=x.provider.packet(),initial=packet.initial;
 assert.equal(x.provider.inspect().storageDispatches.length,0);
 const result=await x.host.witness.continueStorage(x.host.f.bridge);
 const receipts=x.provider.inspect().storageDispatches;
 assert(Object.isFrozen(receipts));assert.equal(receipts.length,4);
 for(const [i,name] of ['get_Connected','get_CurrentDirectory','get_IsOwnCurrentDirectory','get_RootPath'].entries()){
  const receipt=receipts[i],call=receipt.call;
  assert(Object.isFrozen(receipt));assert(Object.isFrozen(call));
  assert.equal(call.receiver,initial.storage);assert.equal(receipt.receiver,initial.storage);
  assert.equal(call.method,initial.storageReaders[name]);assert.equal(receipt.method,call.method);
  assert.equal(call.initial,initial);assert.equal(receipt.initial,initial);assert.equal(call.packet,packet);assert.equal(receipt.packet,packet);
  assert.equal(receipt.scope,'FileStorage.'+name+':dispatch');assert.equal(receipt.nativeReceiversQualified,true);
  assert.equal(call.nativeReceiversQualified,false);assert.equal(receipt.closureIdentityQualified,false);
 }
 assert.equal(result.nativeReceiversQualified,false);assert.equal(result.closureIdentityQualified,false);
 assert.equal(result.reason,'NATIVE_LEXICAL_QUALIFICATION_MISSING');assert.equal(result.componentReady,false);
 assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);assert.equal(x.realm.native.writes(),0);
 const again=x.provider.inspect().storageDispatches;assert.deepEqual([...again],[...receipts]);
 await x.host.witness.continueStorage(x.host.f.bridge);assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);
},{originalSdk:true,invokeSdk:true,realCompletion:true}));
for(const mode of ['provider copy','packet copy','storage copy','identity copy'])test('storage receiver '+mode+' refuses before storage dispatch',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);await x.host.witness.continueComponent(x.host.f.bridge);
 const packet=x.provider.packet();
 if(mode==='provider copy')assert.throws(()=>Reflect.apply(x.provider.readStoragePacket,{...x.provider},[packet,'get_Connected']),/RECEIVER/);
 if(mode==='packet copy')assert.throws(()=>x.provider.readStoragePacket({...packet},'get_Connected'),/PACKET_FOREIGN/);
 if(mode==='storage copy'){
  const owner=x.f.c.bg.app.Application.FInstance.FMainForm.FUrlUtils;
  owner.FFileStorage={...packet.initial.storage};
  assert.throws(()=>x.provider.readStoragePacket(packet,'get_Connected'));
 }
 if(mode==='identity copy'){
  const storage=packet.initial.storage;storage.$={...storage.$};
  assert.throws(()=>x.provider.readStoragePacket(packet,'get_Connected'));
 }
 assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);
},{originalSdk:true,invokeSdk:true}));
test('storage receiver pending accessor drift refuses without next dispatch or foreign getter',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);let gets=0;
 x.probe.onDispatch=(request)=>{if(x.realm.native.calls.at(-1)===909)Object.defineProperty(x.provider.packet().initial.storage,'get_RootPath',{configurable:true,get(){gets++;throw Error('foreign')}})};
 await assert.rejects(x.host.witness.continueStorage(x.host.f.bridge));assert.equal(gets,0);
 assert.deepEqual(x.realm.native.calls,[0,907,909]);assert.equal(x.realm.native.writes(),0);
},{originalSdk:true,invokeSdk:true,instrument:true}));
for(const reason of [false,0,null,undefined,'',Error('receiver first',{cause:0})])test('storage receiver raw '+String(reason)+' remains first over receiver drift',()=>{
 let held;const ready=new Promise(resolve=>held=resolve);
 return creationControl(async x=>{
  await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const work=x.host.witness.continueStorage(x.host.f.bridge);work.catch(()=>{});await ready;
  x.realm.native.fail(reason);x.f.c.bg.app.Application.FInstance.FMainForm.FUrlUtils.FFileStorage={...x.realm.native.storage};
  await x.realm.native.drain();let caught=false;try{await work}catch(value){caught=true;assert.equal(value,reason)}assert(caught);
  assert.equal(x.host.witness.continueStorage(x.host.f.bridge),work);assert.deepEqual(x.realm.native.calls,[0,907,909]);assert.equal(x.realm.native.writes(),0);
 },{originalSdk:true,invokeSdk:true,phaseHook(x,fn,method){if(fn.name==='readTerminalRealmStorage'&&method==='get_CurrentDirectory'){x.realm.native.hold();queueMicrotask(held)}}});
});

test('storage mkdel exact retained function and FileStorage delegate link through all four dispatches',()=>creationControl(async x=>{
 const mkdel=x.f.ss.mkdel,descriptor=Object.getOwnPropertyDescriptor(x.f.ss,'mkdel');
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const packet=x.provider.packet();
 const result=await x.host.witness.continueStorage(x.host.f.bridge),receipts=x.provider.inspect().storageDispatches;
 assert.equal(receipts.length,4);
 for(const [i,method] of ['get_Connected','get_CurrentDirectory','get_IsOwnCurrentDirectory','get_RootPath'].entries()){
  const dispatch=receipts[i],call=dispatch.mkdelCall,completion=dispatch.mkdelCompletion;
  assert(Object.isFrozen(call));assert(Object.isFrozen(completion));assert.equal(call.mkdel,mkdel);
  assert.equal(call.namespace,x.f.ss);assert.equal(call.receiver,packet.initial.storage);
  assert.equal(call.initial,packet.initial);assert.equal(call.packet,packet);assert.equal(call.storageCall,dispatch.call);
  assert.equal(call.scope,'FileStorage.'+method+':mkdel');assert.equal(call.mkdelIdentityQualified,true);assert.equal(typeof call.delegate,'function');
  assert.equal(completion.call,call);assert.equal(typeof completion.returned,'function');
  assert.equal(call.closureIdentityQualified,false);assert.equal(completion.closureIdentityQualified,false);
  assert.equal(call.nativeReceiversQualified,false);assert.equal(result.nativeReceiversQualified,false);
 }
 assert.equal(new Set(receipts.map(r=>r.mkdelCall.delegate)).size,4);
 assert.deepEqual(Object.getOwnPropertyDescriptor(x.f.ss,'mkdel'),descriptor);
 assert.deepEqual(x.realm.native.calls,[0,907,909,910,911]);assert.equal(x.realm.native.writes(),0);
 assert.equal(result.reason,'NATIVE_LEXICAL_QUALIFICATION_MISSING');assert.equal(result.componentReady,false);
},{originalSdk:true,invokeSdk:true,realCompletion:true}));
for(const mode of ['method','accessor','prototype'])test('storage mkdel pre-call '+mode+' refuses getter0 before storage dispatch',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);let gets=0;
 if(mode==='method')x.f.ss.mkdel=function(){gets++;throw Error('foreign')};
 if(mode==='accessor')Object.defineProperty(x.f.ss,'mkdel',{configurable:true,get(){gets++;throw Error('foreign')}});
 if(mode==='prototype')Object.setPrototypeOf(x.f.ss.mkdel,{});
 await assert.rejects(x.host.witness.continueStorage(x.host.f.bridge));assert.equal(gets,0);
 assert.deepEqual(x.realm.native.calls,[0]);assert.equal(x.realm.native.writes(),0);
},{originalSdk:true,invokeSdk:true}));
for(const mode of ['foreign receiver','foreign namespace','repeated call'])test('storage mkdel injected '+mode+' refuses without another qualified dispatch',()=>creationControl(async x=>{
 await x.host.witness.createWorkspace(x.options,x.host.f.bridge);
 x.probe.onDispatch=()=>{if(x.realm.native.calls.at(-1)!==907)return;
  // Negative reentrant call while the original method is on the stack.
  const ss=x.f.ss,storage=x.realm.native.storage;
  if(mode==='foreign receiver')ss.mkdel({...storage},function(){});
  if(mode==='foreign namespace')Reflect.apply(ss.mkdel,{...ss},[storage,function(){}]);
  if(mode==='repeated call')ss.mkdel(storage,function(){});
 };
 await assert.rejects(x.host.witness.continueStorage(x.host.f.bridge));
 assert.deepEqual(x.realm.native.calls,[0,907]);assert.equal(x.realm.native.writes(),0);
},{originalSdk:true,invokeSdk:true,instrument:true}));
for(const target of ['delegate','bound delegate','mkdel accessor'])test('storage mkdel pending '+target+' refuses getter0 before continuation/next dispatch',()=>{
 let held;const ready=new Promise(resolve=>held=resolve);return creationControl(async x=>{
  await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const work=x.host.witness.continueStorage(x.host.f.bridge);work.catch(()=>{});await ready;
  let gets=0;
  if(target==='delegate'||target==='bound delegate'){
   const receipt=x.provider.inspect().storageDispatches[0];assert.equal(receipt.mkdelCall.scope,'FileStorage.get_Connected:mkdel');Object.setPrototypeOf(target==='delegate'?receipt.mkdelCall.delegate:receipt.mkdelCompletion.returned,{});
  }else Object.defineProperty(x.f.ss,'mkdel',{configurable:true,get(){gets++;throw Error('foreign')}});
  await x.realm.native.drain();await assert.rejects(work);assert.equal(gets,0);
  assert.deepEqual(x.realm.native.calls,[0,907]);assert.equal(x.realm.native.writes(),0);
 },{originalSdk:true,invokeSdk:true,phaseHook(x,fn,method){if(fn.name==='readTerminalRealmStorage'&&method==='get_Connected'){x.realm.native.hold();queueMicrotask(held)}}});
});
for(const reason of [false,0,null,undefined,'',Error('mkdel first',{cause:0})])test('storage mkdel raw '+String(reason)+' remains first over pending mkdel drift',()=>{
 let held;const ready=new Promise(resolve=>held=resolve);return creationControl(async x=>{
  await x.host.witness.createWorkspace(x.options,x.host.f.bridge);const work=x.host.witness.continueStorage(x.host.f.bridge);work.catch(()=>{});await ready;
  let gets=0;x.realm.native.fail(reason);Object.defineProperty(x.f.ss,'mkdel',{configurable:true,get(){gets++;throw Error('foreign')}});
  await x.realm.native.drain();let caught=false;try{await work}catch(value){caught=true;assert.equal(value,reason)}assert(caught);assert.equal(gets,0);
  assert.equal(x.host.witness.continueStorage(x.host.f.bridge),work);assert.deepEqual(x.realm.native.calls,[0,907]);assert.equal(x.realm.native.writes(),0);
 },{originalSdk:true,invokeSdk:true,phaseHook(x,fn,method){if(fn.name==='readTerminalRealmStorage'&&method==='get_Connected'){x.realm.native.hold();queueMicrotask(held)}}});
});
