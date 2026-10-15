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
 let originalCompletion;
 if(realCompletion){const c=realm.page.context;runInContext('window=globalThis',c);runInContext(await readFile(process.env.TERMINAL_INPUT_DIR+'/mscorlib.js','utf8'),c);runInContext(await readFile(process.env.TERMINAL_INPUT_DIR+'/Task.js','utf8'),c);originalCompletion=c.ss.TaskCompletionSource}
 const s=scripts(),f=await fresh({realm,scriptContext:s,originalCompletion});
 for(const kind of ['ObjectProxy','FileStorage','StreamPersist']){s.select(kind==='ObjectProxy'?'bg/js/rpc.js':'bg/js/bg.rtl.rpc.js');const ctor=f.constructors[kind];f.ss.initClass(ctor,f.asm,ctor.prototype)}
 f.receiver.FUsername='test-account';f.c.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection=f.receiver;
 const probe={tasks:[],requests:[],readers:0,resolvers:0,continuations:0,releases:0};
 if(instrument){
  const transport=realm.native.session,dispatch=transport.DispatchMessageAsync,resolver=transport.$R;
  transport.$R=function(){probe.resolvers++;return Reflect.apply(resolver,this,arguments)};
  transport.DispatchMessageAsync=function(request){
   const task=Reflect.apply(dispatch,this,arguments),reader=task.getAwaitedResult,continuation=task.continueWith,deliver=task.deliver;
   probe.tasks.push(task);probe.requests.push(request);task.getAwaitedResult=function(){probe.readers++;return Reflect.apply(reader,this,arguments)};
   task.continueWith=function(callback){probe.callback=callback;return Reflect.apply(continuation,this,[function(){probe.continuations++;return Reflect.apply(callback,this,arguments)}])};
   task.deliver=function(){Reflect.apply(deliver,this,arguments);if(probe.response)probe.response(Reflect.apply(reader,task,[]))};return task;
  };
 }
 const task=f.invoke();f.deliver();await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();
 f.c.__loginomStartupV1={document:f.c.document,id:'original',account:'test-account'};
 f.c.__witnessArgs=witness.terminalScriptWitnessArguments('original','test-account');
 const capsule=runInContext('('+witness.collectTerminalScriptWitness.toString()+')(__witnessArgs)',f.c);
 probe.tasks.length=0;probe.readers=0;probe.resolvers=0;probe.continuations=0;
 const provider=Object.getOwnPropertyDescriptor(capsule,'originalProvider').value;
 const request={operationId:'own-prepare',sessionId:'own-session',intent:'new_draft'};
 const prepare=()=>packet.prepareTerminalOriginalPacket(packet.captureTerminalInitialCustody({custody:realm.custody,native:realm.receivers,
  loaded:packet.captureTerminalLoadedExports(realm.loaded),preparation:realm.preparation}),{
   loginomUrl:'http://loginom.example/app?testable=true',compatibility:{profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},platform:'darwin',sessionId:'own-session',operationId:'own-prepare'});
 await fn({realm,f,s,capsule,provider,request,prepare,probe});
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

async function creationControl(fn,{pageFailure,phaseHook,originalSdk=false,invokeSdk=false,instrument=false}={}){return control(async x=>{
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
},instrument)}
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
