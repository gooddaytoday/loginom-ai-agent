// CODE/OFFLINE: real Node/VM/Promise/MessageChannel; DOM/Page/SDK/native/session/task doubles.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {runInContext,runInThisContext} from 'node:vm';
import {parse} from '../../../loginom-host/node_modules/acorn/dist/acorn.mjs';
import {fresh} from './terminal-initializers.test.mjs';import {setup} from './terminal-provider-boundary-fixture.mjs';
const lib=process.env.TERMINAL_PACKET_ROOT?new URL('file://'+process.env.TERMINAL_PACKET_ROOT+'/'):new URL('../lib/',import.meta.url);
const witness=await import(new URL('terminal-script-witness.mjs',lib)),packet=await import(new URL('terminal-original-packet.mjs',lib));
const text=await readFile(new URL('terminal-script-load.test.mjs',import.meta.url),'utf8'),ast=parse(text,{ecmaVersion:'latest',sourceType:'module'}),node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='scripts');
const scripts=runInThisContext('('+text.slice(node.start,node.end)+')');
async function control(fn,instrument=false){const realm=await setup(60000,'retain-only');try{
 const s=scripts(),f=await fresh({realm,scriptContext:s});
 for(const kind of ['ObjectProxy','FileStorage','StreamPersist']){s.select(kind==='ObjectProxy'?'bg/js/rpc.js':'bg/js/bg.rtl.rpc.js');const ctor=f.constructors[kind];f.ss.initClass(ctor,f.asm,ctor.prototype)}
 f.receiver.FUsername='test-account';f.c.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection=f.receiver;
 const probe={tasks:[],readers:0,resolvers:0,continuations:0,releases:0};
 if(instrument){
  const transport=realm.native.session,dispatch=transport.DispatchMessageAsync,resolver=transport.$R;
  transport.$R=function(){probe.resolvers++;return Reflect.apply(resolver,this,arguments)};
  transport.DispatchMessageAsync=function(request){
   const task=Reflect.apply(dispatch,this,arguments),reader=task.getAwaitedResult,continuation=task.continueWith,deliver=task.deliver;
   probe.tasks.push(task);task.getAwaitedResult=function(){probe.readers++;return Reflect.apply(reader,this,arguments)};
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
