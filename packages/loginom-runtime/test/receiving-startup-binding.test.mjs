import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

// Exact production managed start AND call handle. No authentication/browser/native effects.
// Resources/auth/Page/context/SDK/service/bridge are labelled doubles, FS is real.
// Original object references and startup binding are constructed by production start.
const root=process.env.READONLY_RUNTIME_ROOT ?? new URL('../',import.meta.url).pathname;
const text=await readFile(join(root,'src/managed-entry.mjs'),'utf8');
const code=text.slice(text.indexOf('async function handle(message)'))+';handle';
const cases=['owner','page','context','account','origin','generation','chat','client','session','bridge'];
const directories=new Set();
after(async()=>{for(const p of directories)await rm(p,{recursive:true,force:true})});
const report=(label,f)=>console.log(JSON.stringify({case:label,dispatches:f.calls,
  error:f.reply.error??null,resultPublished:!!f.reply.result,
  readonlyContinuation:f.reply.result?.readonlyContinuation??null,
  retained:f.state.readonlyRetained===true}));
async function fixture({stage,field}={}) {
  const drift=at=>{if(stage!==at)return; if(field==='session')state.session={...state.session}; else if(field==='metadata')createdSession.metadata={...createdSession.metadata}; else if(field==='sessionId')createdSession.metadata.sessionId='foreign'; else if(field==='directory')createdSession.directory+='-foreign'; else if(field==='owner')state.startupOwner={...state.startupOwner}; else if(field==='binding')state.startupBinding={...state.startupBinding}; else state.startupOwner[field]='foreign';};
  let calls=0, reply, createdSession;
  const directory=await mkdtemp(new URL('./reviewer-start-',import.meta.url).pathname);directories.add(directory);
  const raw={observed:'original-or-foreign-double'};
  const page={evaluate:async(fn,o)=>{drift('readiness');return {documentId:o.documentId,account:o.account,loginomBuild:'7.4.2'}}};
  const context={pages:()=>[page]};
  const bridge={server:{connect:async()=>{drift('bridge-connect')}},readonlyContinuation:()=>true,hasUnsettledWork:()=>true,hasActiveWork:()=>false};
  class Client {constructor(){this.callTool=async()=>{calls++;return raw}}async connect(){drift('client')}}
  const state={inputs:new Map()};
  const handle=vm.runInNewContext(code,{setImmediate:()=>{},state,Error,AbortController,URL,process:{platform:'linux'},
    join,mkdir,mkdtemp,readFile,randomUUID,send:v=>reply=v,
    validateStartInput:()=>({}),
    verifyResources:async()=>({browserPath:'fixture',browserRoot:'fixture',manifestHash:'a'.repeat(64),browserHash:'b'.repeat(64)}),
    loginBrowser:async({owner})=>{Object.assign(owner,{id:'original',account:'worker',origin:'https://fixture.invalid',page,context});return {context}},
    loginomAddress:x=>x,
    createSession:async(config,{managed})=>{const browserConfig=join(managed.directory,'browser.json');await writeFile(browserConfig,'{}');return createdSession={directory:managed.directory,browserConfig,metadata:{sessionId:'own-session',clientRevision:'c'.repeat(64)}}},
    createBridge:async()=>{drift('bridge');return bridge},
    require:specifier=>specifier.includes('inMemory')?{InMemoryTransport:{createLinkedPair:()=>[{},{}]}}:
      specifier==='@playwright/mcp'?{createConnection:async()=>{drift('connection');return {connect:async()=>{drift('browser-connect')}}}}:{Client},
  });
  await handle({id:'start',operation:'start',input:{generation:7,chat:'a'.repeat(64),stateDir:directory,resources:'fixture',endpoint:'https://fixture.invalid/mcp',connection:{username:'worker',apiKey:'test-only',url:'https://fixture.invalid/app/'}}});

  return {state,createdSession,owner:state.startupOwner,bridge,client:state.client,handle,raw,dispatch(){calls++},get calls(){return calls},get reply(){return reply}};
}


// Production startup; Page/auth/SDK doubles, real session FS. No call/native dispatch.
for(const stage of ['readiness','connection','browser-connect','bridge','bridge-connect','client']) {
 test('original startup positive '+stage,async()=>{const f=await fixture({stage});assert.equal(f.reply.result?.ready,true);assert.equal(f.calls,0)});
 for(const field of ['session','metadata','sessionId','directory','owner','binding','id','page','context','account','origin','generation','chat'])test('original startup drift '+stage+' '+field,async()=>{const f=await fixture({stage,field});assert.equal(f.reply.result,undefined);assert.match(f.reply.error,/LOGINOM_STARTUP_OWNER_CHANGED/);assert.equal(f.calls,0)});
}
