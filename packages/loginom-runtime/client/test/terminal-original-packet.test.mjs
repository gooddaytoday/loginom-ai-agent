import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {pathToFileURL} from 'node:url';
import {open,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fixture} from './terminal-packet-native-fixture.mjs';
import {pageFixture} from './terminal-packet-page-fixture.mjs';
const root=process.env.TERMINAL_PACKET_ROOT??new URL('../lib/',import.meta.url).pathname;
const {makeWorkspacePrepareCode}=await import(pathToFileURL(root+'/workspace.mjs'));
const {retainTerminalOriginalInterfaces}=await import(pathToFileURL(root+'/terminal-original-interfaces.mjs'));
const {captureTerminalLoadedExports,captureTerminalInitialCustody,bindTerminalCreationPacket,terminalPacketArguments,prepareTerminalOriginalPacket}=await import(pathToFileURL(root+'/terminal-original-packet.mjs'));

async function setup(budget=60000,beforeInitial){
 const native=await fixture(),page=pageFixture({authenticated:true,native});
 try {
 await page.page.goto('http://loginom.example/app?testable=true');
 const preparation={document:page.context.document,id:'original-doc',receipts:new Map()};
 page.context.__loginomDockPreparationV1=preparation;
 const nativeGlobal=native.closureContext;
 nativeGlobal.$rpc_TBGObjectProxy.prototype=native.definitions.ObjectProxyPrototype;
 const storageExport={prototype:native.definitions.FileStoragePrototype},persistExport={prototype:native.definitions.StreamPersistPrototype};
 nativeGlobal.rpc={TBGObjectProxy:nativeGlobal.$rpc_TBGObjectProxy,GuidHelper:nativeGlobal.$rpc_GuidHelper,
  TBGMessageDynamicData:nativeGlobal.$rpc_TBGMessageDynamicData,HResult:nativeGlobal.$rpc_HResult};
 Object.assign(nativeGlobal.bg,{IBGStreamPersist:native.definitions.StreamPersist,rpc:{TIBGFileStorage_Proxy:storageExport,TIBGStreamPersist_Proxy:persistExport}});
 const loaded={page:page.page,context:page.context,document:page.context.document,
  global:nativeGlobal,sourceInputs:{...native.inputs}};
 const controller=new AbortController();
 const custody={...native.original,page:page.page,context:page.context,document:page.context.document,
  documentId:preparation.id,account:'test-account',session:'own-session',operationId:'own-prepare',
  signal:controller.signal,deadline:Date.now()+budget,path:null,pending:false,running:false,unknown:false,writerPending:false,dirty:false,targetSelected:false};
 const receivers={currentUser:native.original.currentUser,fileStorage:native.storage,nativeSession:native.session};
 if(beforeInitial)beforeInitial({native,page,preparation,loaded,custody,receivers});
 const load=captureTerminalLoadedExports(loaded);
 const initial=captureTerminalInitialCustody({custody,native:receivers,loaded:load,preparation});
 const prepare=()=>runInNewContext(makeWorkspacePrepareCode({loginomUrl:'http://loginom.example/app?testable=true',
  compatibility:{profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},platform:'darwin',
  sessionId:'own-session',operationId:'own-prepare'}))(page.page);
 const packet=await prepareTerminalOriginalPacket(initial,{loginomUrl:'http://loginom.example/app?testable=true',
  compatibility:{profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},platform:'darwin',
  sessionId:'own-session',operationId:'own-prepare'});
 const receipt=preparation.receipts.get(custody.operationId);
 let writes=0;
 let writerFailure,writerHook=async()=>{};
 const build=()=>retainTerminalOriginalInterfaces({...terminalPacketArguments(packet),record:async facts=>{
  writes++;if(writerFailure)throw writerFailure.value;
  const handle=await open(join(native.dir,'packet.json'),'w',0o600);
  try{await handle.writeFile(JSON.stringify(facts));await handle.sync()}finally{await handle.close()}
  await writerHook();return JSON.parse(await readFile(join(native.dir,'packet.json'),'utf8'));
 }});
 return {native,page,preparation,loaded,load,custody,receivers,controller,initial,packet,receipt,prepare,build,writes:()=>writes,
  writerFail:value=>{writerFailure=value},writerHook:fn=>{writerHook=fn}};
 } catch(error){await native.cleanup();throw error}
}
async function control(fn){const f=await setup();try{await fn(f)}finally{await f.native.drain();await f.native.cleanup()}}
test('production preparation -> branded initial packet -> original task completion -> component',()=>control(async f=>{
 const creation=f.receipt.terminalOriginalCreation;
 assert.equal(creation.tab,f.receipt.tab);assert.equal(creation.packageNode,f.receipt.packageNode);
 assert.equal(creation.packageProxy,f.native.packageProxy);assert.equal(creation.nativeSession,f.native.session);
 assert.equal(creation.path,null);assert.ok(Object.isFrozen(creation));
 const scope=f.build(),token=await scope.read();
 assert.deepEqual(f.native.calls,[907,0,909,910,911]);
 assert.deepEqual(['nativeAuthority','contentAuthority','saveAuthority','closeAuthority'].map(k=>scope.inspect(token)[k]),[false,false,false,false]);
 await scope.persist();assert.equal(f.writes(),1);scope.end();
 assert.deepEqual(f.native.calls,[907,0,909,910,911]);
 assert.throws(()=>f.build(),/COMPONENT_REPLAY|ENDED/);
}));
for(const key of ['owner','run','lease','generation','chat','document','documentId','account','session','operation','operationId','page','context','gate','signal','deadline','path'])
 test('original custody substitution before dispatch: '+key,()=>control(async f=>{
  f.custody[key]=key==='generation'?99:key==='deadline'?Date.now()+90000:key==='path'?'/foreign.lgp':{};
  assert.throws(()=>f.build());assert.deepEqual(f.native.calls,[]);assert.equal(f.writes(),0);
 }));
for(const key of ['currentUser','fileStorage','nativeSession'])test('foreign initial native receiver: '+key,()=>control(async f=>{
 f.receivers[key]={};assert.throws(()=>f.build());assert.deepEqual(f.native.calls,[]);
}));
for(const key of ['pending','running','unknown','writerPending','dirty','targetSelected'])test('unsettled state refuses: '+key,()=>control(async f=>{
 f.custody[key]=true;assert.throws(()=>f.build());assert.deepEqual(f.native.calls,[]);
}));
test('copied initial/packet/creation provenance cannot qualify',()=>control(async f=>{
 assert.throws(()=>bindTerminalCreationPacket({...f.initial},f.preparation,f.receipt));
 assert.throws(()=>terminalPacketArguments({...f.packet}));
 assert.throws(()=>bindTerminalCreationPacket(f.initial,f.preparation,f.receipt),/CREATION_REPLAY/);
 f.receipt.terminalOriginalCreation={...f.receipt.terminalOriginalCreation};assert.throws(()=>f.build());
}));
for(const variant of ['exports','closure','dependency','source','creation','path','signal','deadline','task'])
 test('replacement during original QueryInterface completion: '+variant,()=>control(async f=>{
  const scope=f.build();f.native.queryReply(p=>{f.native.hold();return p});
  const work=scope.read();
  const until=Date.now()+5000;while(f.native.calls.length<3&&Date.now()<until)await new Promise(r=>setImmediate(r));
  assert.deepEqual(f.native.calls,[907,0,909]);
  if(variant==='exports')f.loaded.global.bg.rpc.TIBGStreamPersist_Proxy={};
  if(variant==='closure')f.loaded.global.rpc.GuidHelper={};
  if(variant==='dependency')f.native.session.$R=()=>({});
  if(variant==='source')f.loaded.sourceInputs['rpc.js']='foreign';
  if(variant==='creation')f.receipt.packageNode={};
  if(variant==='path')f.receipt.packageNode.PackageFileName='foreign.lgp';
  if(variant==='signal')f.custody.signal=new AbortController().signal;
  if(variant==='deadline')f.custody.deadline+=1000;
  if(variant==='task')f.native.completionTasks.at(-1).getAwaitedResult=()=>({foreign:true});
  await f.native.drain();await assert.rejects(work);assert.equal(f.writes(),0);
  assert.deepEqual(f.native.calls,[907,0,909]);
 }));
for(const value of [Error('original task rejection',{cause:0}),undefined,null,false,0,''])
 test('raw original task rejection survives later packet drift: '+String(value),()=>control(async f=>{
  const scope=f.build();f.native.queryReply(p=>{f.native.hold();return p});const work=scope.read();
  while(f.native.calls.length<3)await new Promise(r=>setImmediate(r));
  f.native.fail(value);f.custody.chat={};await f.native.drain();
  let caught=false;try{await work}catch(error){caught=true;assert.equal(error,value)}
  assert.ok(caught);assert.equal(scope.primary,value);assert.equal(scope.originalRefusal,f.native.original.refusal);
  assert.deepEqual(f.native.calls,[907,0,909]);assert.equal(f.writes(),0);
 }));
test('receipt reverify never repins native original after package substitution',()=>control(async f=>{
 const creation=f.receipt.terminalOriginalCreation;
 f.receipt.packageNode.Package={...f.native.packageProxy};
 const result=await f.prepare();assert.equal(result.status,'NOT_READY');
 assert.equal(result.reason,'WORKFLOW_CHANGED');assert.equal(f.receipt.terminalOriginalCreation,creation);
 assert.throws(()=>f.build());assert.deepEqual(f.native.calls,[]);
}));
test('late initial custody cannot mint a creation packet',()=>control(async f=>{
 assert.throws(()=>captureTerminalInitialCustody({custody:f.custody,native:f.receivers,loaded:f.load,preparation:f.preparation}),/LATE_INITIAL/);
}));
test('initial provenance cannot move to a copied preparation map',()=>control(async f=>{
 const copied={...f.preparation,receipts:new Map(f.preparation.receipts)};
 assert.throws(()=>bindTerminalCreationPacket(f.initial,copied,f.receipt));
}));
test('expiry and abort use the original absolute deadline and raw signal',()=>control(async f=>{
 f.controller.abort(false);let caught;try{f.build()}catch(error){caught=error}assert.equal(caught,false);
 assert.deepEqual(f.native.calls,[]);
}));
test('missing original completion remains pending, then late completion refuses expiry',()=>control(async f=>{
 const scope=f.build();f.native.queryReply(p=>{f.native.hold();return p});const work=scope.read();
 while(f.native.calls.length<3)await new Promise(r=>setImmediate(r));
 assert.equal(scope.state.read,'pending');assert.throws(()=>scope.persist());assert.throws(()=>scope.end());
 f.custody.deadline=Date.now()-1;await f.native.drain();await assert.rejects(work);
 assert.equal(f.writes(),0);assert.deepEqual(f.native.calls,[907,0,909]);
}));
test('original absolute deadline expires without renewal',async()=>{
 const f=await setup(100);
 try {const deadline=f.custody.deadline;await new Promise(r=>setTimeout(r,Math.max(1,deadline-Date.now()+5)));
  assert.throws(()=>f.build(),/DEADLINE/);assert.equal(f.custody.deadline,deadline);assert.deepEqual(f.native.calls,[]);
 } finally {await f.native.cleanup()}
});
test('loaded accessor refuses without getter invocation',()=>control(async f=>{
 let gets=0;Object.defineProperty(f.loaded.global.bg.rpc,'TIBGFileStorage_Proxy',{get(){gets++;return {}},configurable:true});
 assert.throws(()=>f.build(),/ACCESSOR/);assert.equal(gets,0);assert.deepEqual(f.native.calls,[]);
}));
test('task accessor drift refuses without invoking substituted getter',()=>control(async f=>{
 let gets=0;const scope=f.build();f.native.queryReply(p=>{f.native.hold();return p});const work=scope.read();
 while(f.native.calls.length<3)await new Promise(r=>setImmediate(r));
 Object.defineProperty(f.native.completionTasks.at(-1),'getAwaitedResult',{get(){gets++;return ()=>({})},configurable:true});
 await f.native.drain();await assert.rejects(work);assert.equal(gets,0);assert.equal(f.writes(),0);
 assert.deepEqual(f.native.calls,[907,0,909]);
}));
test('same original packet repairs only evidence, never repeats native reader',()=>control(async f=>{
 const scope=f.build(),token=await scope.read(),primary=Error('storage',{cause:0});
 f.writerFail({value:primary});let caught;try{await scope.persist()}catch(error){caught=error}assert.equal(caught,primary);
 f.writerFail(undefined);await scope.persist();scope.end();
 assert.equal(f.writes(),2);assert.deepEqual(f.native.calls,[907,0,909,910,911]);
 assert.equal(scope.secondary[0],primary);assert.equal(scope.originalRefusal,f.native.original.refusal);
}));
test('custody drift during evidence await refuses and restore retries writer only',()=>control(async f=>{
 const scope=f.build();await scope.read();const chat=f.custody.chat;
 f.writerHook(async()=>{f.custody.chat={}});await assert.rejects(scope.persist());
 f.custody.chat=chat;f.writerHook(async()=>{});await scope.persist();scope.end();
 assert.deepEqual(f.native.calls,[907,0,909,910,911]);assert.equal(f.writes(),2);
}));
test('original signal accessor drift never invokes getter',()=>control(async f=>{
 const scope=f.build();let gets=0;Object.defineProperty(f.custody.signal,'throwIfAborted',{get(){gets++;return ()=>{}},configurable:true});
 assert.throws(()=>scope.read(),/ACCESSOR/);assert.equal(gets,0);assert.deepEqual(f.native.calls,[]);
}));
test('original message allocator substitution refuses before dispatch',()=>control(async f=>{
 const scope=f.build();let calls=0;f.native.session.$M.GetDynamicData=()=>{calls++;return {}};
 assert.throws(()=>scope.read(),/DEPENDENCY/);assert.equal(calls,0);assert.deepEqual(f.native.calls,[]);
}));
test('HRESULT zero is never treated as returned proxy',()=>control(async f=>{
 const scope=f.build();f.native.queryReply(()=>0);await assert.rejects(scope.read(),/SUPPORT_UNKNOWN/);
 assert.deepEqual(f.native.calls,[907,0]);assert.equal(f.writes(),0);
}));
for(const stage of ['effect','verify'])for(const key of ['generation','chat','document','signal'])
 test('original preparation guards custody after await '+stage+': '+key,async()=>{
  let observed;
  await assert.rejects(setup(60000,f=>{
   observed=f;const evaluate=f.page.page.evaluate;
   f.page.page.evaluate=async function(fn,args){const reply=await evaluate.call(this,fn,args);
    if(args?.mode===stage)f.custody[key]=key==='generation'?99:{};
    return reply;
   };
  }));
  assert.equal(observed.page.events.filter(x=>x==='create_draft').length,stage==='effect'?0:1);
  assert.deepEqual(observed.native.calls,[]);
 });
test('original preparation method cannot be replaced after initial capture',()=>control(async f=>{
 let calls=0;f.page.page.evaluate=async()=>{calls++;return {}};
 assert.throws(()=>f.build());assert.equal(calls,0);assert.deepEqual(f.native.calls,[]);
}));
test('Page document replacement refuses before packet use',()=>control(async f=>{
 const scope=f.build();f.loaded.global.document={};assert.throws(()=>scope.read(),/DOCUMENT_REPLACED/);
 assert.deepEqual(f.native.calls,[]);
}));
