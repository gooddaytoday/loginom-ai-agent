// CODE/OFFLINE: real Node/VM/Promise/MessageChannel; DOM/Page/SDK/native/session/task doubles.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {runInContext,runInThisContext} from 'node:vm';
import {parse} from '../../../loginom-host/node_modules/acorn/dist/acorn.mjs';
import {fresh} from './terminal-initializers.test.mjs';import {setup} from './terminal-provider-boundary-fixture.mjs';
const lib=process.env.TERMINAL_PACKET_ROOT?new URL('file://'+process.env.TERMINAL_PACKET_ROOT+'/'):new URL('../lib/',import.meta.url);
const witness=await import(new URL('terminal-script-witness.mjs',lib)),packet=await import(new URL('terminal-original-packet.mjs',lib));
const text=await readFile(new URL('terminal-script-load.test.mjs',import.meta.url),'utf8'),ast=parse(text,{ecmaVersion:'latest',sourceType:'module'}),node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='scripts');
const scripts=runInThisContext('('+text.slice(node.start,node.end)+')');
async function control(fn){const realm=await setup(60000,'retain-only');try{
 const s=scripts(),f=await fresh({realm,scriptContext:s});
 for(const kind of ['ObjectProxy','FileStorage','StreamPersist']){s.select(kind==='ObjectProxy'?'bg/js/rpc.js':'bg/js/bg.rtl.rpc.js');const ctor=f.constructors[kind];f.ss.initClass(ctor,f.asm,ctor.prototype)}
 f.receiver.FUsername='test-account';f.c.bg.app.Application.FInstance.FMainForm.FMapTree.FServerConnection=f.receiver;
 const task=f.invoke();f.deliver();await task;await f.c.bg.app.CurrentUser.Set(f.user);await f.settle();
 f.c.__loginomStartupV1={document:f.c.document,id:'original',account:'test-account'};
 f.c.__witnessArgs=witness.terminalScriptWitnessArguments('original','test-account');
 const capsule=runInContext('('+witness.collectTerminalScriptWitness.toString()+')(__witnessArgs)',f.c);
 const provider=Object.getOwnPropertyDescriptor(capsule,'originalProvider').value;
 const request={operationId:'own-prepare',sessionId:'own-session',intent:'new_draft'};
 const prepare=()=>packet.prepareTerminalOriginalPacket(packet.captureTerminalInitialCustody({custody:realm.custody,native:realm.receivers,
  loaded:packet.captureTerminalLoadedExports(realm.loaded),preparation:realm.preparation}),{
   loginomUrl:'http://loginom.example/app?testable=true',compatibility:{profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},platform:'darwin',sessionId:'own-session',operationId:'own-prepare'});
 await fn({realm,f,s,capsule,provider,request,prepare});
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
