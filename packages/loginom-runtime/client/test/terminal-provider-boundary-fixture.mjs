// Explicit CODE/OFFLINE Page/native/task/loader doubles; no production initial provider.
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

export {setup};
