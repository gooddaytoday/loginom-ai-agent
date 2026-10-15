import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile,mkdtemp,mkdir,rm,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.env.RETAINED_RUNTIME_ROOT??new URL('../',import.meta.url).pathname;
const helpers=await import(pathToFileURL(join(root,'src/retained-capture.mjs')).href);
const source=await readFile(process.env.RETAINED_STARTUP_ENTRY??join(root,'src/managed-entry.mjs'),'utf8');
const body=source.slice(source.indexOf('async function handle(message)'))+';handle';
const fields=['session','metadata','directory','sessionId','owner','page','context','account','origin','generation','chat','bridge','client'];
function drift(state,field){
 if(field==='session')state.session={...state.session};
 else if(field==='metadata')state.session.metadata={...state.session.metadata};
 else if(field==='directory')state.session.directory+='/foreign';
 else if(field==='sessionId')state.session.metadata.sessionId='foreign';
 else if(field==='owner')state.startupOwner={...state.startupOwner};
 else if(field==='page')state.startupOwner.page={...state.startupOwner.page};
 else if(field==='context')state.startupOwner.context={...state.startupOwner.context};
 else if(field==='bridge')state.bridge={...state.bridge};
 else if(field==='client')state.client={...state.client};
 else state.startupOwner[field]='foreign';
}
async function fixture({stage,field}={}){
 const directory=await mkdtemp(join(tmpdir(),'retained-startup-receiving-'));let reply,calls=0;const state={inputs:new Map()};
 const resourcePath='runtime/src/acceptance/calculator-grouped-before-done-v1.mjs';
 const module='export const captureMode="readonly";export function captureCalculator(){};export function validateCaptureResult(){return true;}';
 await mkdir(join(directory,'runtime/src/acceptance'),{recursive:true});await writeFile(join(directory,resourcePath),module);
 const page={isClosed:()=>false},context={pages:()=>[page]},session={directory,metadata:{sessionId:'original-session',clientRevision:'a'.repeat(64)},browserConfig:join(directory,'browser.json')};
 await writeFile(session.browserConfig,'{}');
 const mutate=at=>{if(stage===at)drift(state,field)};
 const bridge={server:{connect:async()=>mutate('bridge-connect')},hasActiveWork:()=>false,hasUnsettledWork:()=>false};
 class Client {async connect(){mutate('client-connect')}async callTool(){calls++;mutate('read-after');return {raw:'read-only-double'}}}
 const handle=vm.runInNewContext(body,{...helpers,setImmediate:()=>{},state,Error,AbortController,URL,process:{platform:'linux'},
  join,mkdir,mkdtemp,readFile,realpath,pathToFileURL,createHash,randomUUID,send:v=>reply=v,closeRejection:()=>{},
  validateStartInput:input=>({acceptanceCapture:input.acceptanceCapture}),
  verifyResources:async()=>({browserPath:'double',browserRoot:'double',manifestHash:'a',browserHash:'b',manifest:{files:[{path:resourcePath,sha256:createHash('sha256').update(module).digest('hex')}]}}),
  loginBrowser:async({owner})=>{Object.assign(owner,{id:'original-owner',account:'worker',origin:'https://fixture.invalid',page,context});return {context}},
  loginomAddress:value=>value,
  createSession:async()=>{mutate('create-session');return session},
  createBridge:async()=>{mutate('create-bridge');return bridge},
  require:name=>name.includes('inMemory')?{InMemoryTransport:{createLinkedPair:()=>[{},{}]}}:
   name==='@playwright/mcp'?{createConnection:async()=>{mutate('create-connection');return {connect:async()=>mutate('browser-connect')}}}:{Client}
 },{importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
 const capture={revision:1,harness:'calculator-grouped-before-done-v1',owner:'host',run:'run',lease:'host:run',generation:7,chat:'chat',account:'worker',packagePath:'/worker/draft.lgp',admission:'grant',expires:Date.now()+600000};
 await handle({id:'start',operation:'start',input:{acceptanceCapture:capture,generation:7,chat:'chat',stateDir:directory,resources:directory,connection:{username:'worker',url:'https://fixture.invalid/app/'}}});
 return {state,handle,directory,get reply(){return reply},get calls(){return calls},async clean(){await rm(directory,{recursive:true,force:true})}};
}
test('canonical startup keeps original handles and qualified read',async()=>{const f=await fixture();try{assert.equal(f.reply.result.ready,true);await f.handle({id:'read',operation:'call',input:{name:'dock_diagnostics',arguments:{checkConnections:false}}});assert.equal(f.calls,1);assert.equal(f.reply.result.result.raw,'read-only-double')}finally{await f.clean()}});
for(const [stage,field] of [['create-session','account'],['create-session','generation'],['create-session','chat'],['create-connection','page'],['browser-connect','context'],['create-bridge','session'],['create-bridge','metadata'],['create-bridge','directory'],['create-bridge','sessionId'],['bridge-connect','owner'],['client-connect','origin']])test(`startup refuses ${stage}/${field}`,async()=>{const f=await fixture({stage,field});try{assert.equal(f.reply.result,undefined);assert.ok(f.reply.error);assert.equal(f.calls,0)}finally{await f.clean()}});
for(const stage of ['read-before','read-after'])for(const field of fields)test(`qualified read refuses ${stage}/${field}`,async()=>{const f=await fixture({stage,field});try{assert.equal(f.reply.result.ready,true);if(stage==='read-before')drift(f.state,field);await f.handle({id:'read',operation:'call',input:{name:'dock_diagnostics',arguments:{checkConnections:false}}});assert.equal(f.reply.result,undefined);assert.ok(f.reply.error);assert.equal(f.calls,stage==='read-before'?0:1)}finally{await f.clean()}});
