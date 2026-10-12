import test,{mock,after} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {decodePreReadyRejection} from '../../src/qualified-pre-ready.mjs';
import * as catalog from '../lib/action-catalog.mjs';
import * as skill from '../lib/skill.mjs';
import * as executor from '../lib/executor.mjs';
// Production managed start + qualification + whole bridge + serialized fixed read.
// FS is real; auth/resources/Page/DOM/native services and SDK transport are doubles.
let current;
const target={profile_id:'fixture',loginom_build:'7.4.2',platform:'linux',browser:'chromium'};
class Client {
 constructor(identity){this.fixture=current;this.browser=identity.name==='loginom-dock-browser'}
 async connect(){} async close(){throw Error('unexpected release')}
 async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]}}
 async callTool({name,arguments:args},unused,options){
   const f=this.fixture;f.dispatches++;
   assert.equal(name,'browser_run_code_unsafe');assert.equal(options.signal,f.state.controller.signal);
   assert.ok(options.timeout<=f.deadline-Date.now()+2);assert.ok(!args.code.includes('storageBinding'));
   assert.ok(args.code.includes('bootstrapWorkspace'));await f.hook?.();
   if(f.failure)throw f.failure.value;
   const value=await vm.runInThisContext('('+args.code+')')(f.page);
   return {content:[{type:'text',text:JSON.stringify(value)}]};
 }
}
class Transport {}
mock.module('@modelcontextprotocol/sdk/client/index.js',{namedExports:{Client}});
mock.module('@modelcontextprotocol/sdk/client/stdio.js',{namedExports:{StdioClientTransport:Transport,getDefaultEnvironment:()=>({})}});
mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js',{namedExports:{StreamableHTTPClientTransport:Transport}});
mock.module(new URL('../lib/action-catalog.mjs',import.meta.url).href,{namedExports:{...catalog,pinActionCatalog:async()=>({pins:{},compatibility:target,manifest:{compatibility:target},actions:new Map()})}});
mock.module(new URL('../lib/skill.mjs',import.meta.url).href,{namedExports:{...skill,skillTransport:()=>({}),createSkillLoader:()=>({})}});
mock.module(new URL('../lib/executor.mjs',import.meta.url).href,{namedExports:{...executor,createActionRuntime:()=>({tools:[],describe:()=>({}),hasActiveWork:()=>!!current.busy,hasUnsettledWork:()=>!!current.unknown})}});
const {createBridge}=await import('../lib/bridge.mjs');
const root=process.env.PREREADY_RUNTIME_ROOT??new URL('../../',import.meta.url).pathname;
const text=await readFile(join(root,'src/managed-entry.mjs'),'utf8');
const handleCode=text.slice(text.indexOf('async function handle(message)'))+';handle';
const directories=[];after(async()=>{for(const d of directories)await rm(d,{recursive:true,force:true})});
async function fixture({lateSession=false}={}){
 const directory=await mkdtemp(join(tmpdir(),'pre-ready-control-'));directories.push(directory);
 const f={state:{inputs:new Map()},dispatches:0,deadline:Date.now()+30000};current=f;
 const avatar={getAttribute:()=> 'MF;cntMain;tlbMainToolbar;btnAvatar',matches:()=>false,getBoundingClientRect:()=>({width:10,height:10}),hasAttribute:()=>false};
 const realm=vm.createContext({URL,Date,location:{origin:'https://fixture.invalid'},bg:{app:{Version:'7.4.2'}},getComputedStyle:()=>({visibility:'visible',opacity:'1'}),document:{documentElement:{},createTreeWalker:()=>{let i=0;return {nextNode:()=>i++===0?avatar:null}}}});
 f.page={url:()=> 'https://fixture.invalid/app/',isClosed:()=>false,evaluate:async(fn,args)=>fn.toString().includes('__loginomDockReadinessV1')?{documentId:args.documentId,account:args.account,loginomBuild:'7.4.2'}:vm.runInContext('('+fn.toString()+')',realm)(args)};
 f.context={pages:()=>[f.page]};
 f.handle=vm.runInNewContext(handleCode,{decodePreReadyRejection,setImmediate:()=>{},state:f.state,preReadyRequests:new Map(),Error,AbortController,URL,Date,process:{platform:'linux'},join,mkdir,mkdtemp,readFile,randomUUID,closeRejection:value=>value instanceof Error?{kind:'Error',name:value.name,message:value.message,...('cause' in value?{cause:{kind:'value',value:value.cause}}:{})}:{kind:'value',value:value===undefined?null:value,is_undefined:value===undefined},send:r=>f.reply=r,
  validateStartInput:()=>({}),verifyResources:async()=>({browserPath:'double',browserRoot:'double'}),
  loginBrowser:async({owner})=>{Object.assign(owner,{id:'original',account:'worker',origin:'https://fixture.invalid',page:f.page,context:f.context});return {context:f.context}},loginomAddress:x=>x,
  createSession:async(config,{managed})=>{const browserConfig=join(managed.directory,'browser.json');await writeFile(browserConfig,'{}');return {save:async()=>writeFile(join(managed.directory,'session.json'),'{}'),directory:managed.directory,browserConfig,metadata:{sessionId:'original-session',clientRevision:'fixture'}}},
  createBridge:async(...args)=>{const bridge=await createBridge(...args);if(lateSession)f.state.session={...f.state.session};return bridge},require:s=>s.includes('inMemory')?{InMemoryTransport}:s==='@playwright/mcp'?{createConnection:async()=>({connect:async()=>{}})}:{Client}});
 await f.handle({id:'start',operation:'start',input:{generation:7,chat:'original-chat',stateDir:directory,resources:'fixture',endpoint:'https://fixture.invalid/mcp',connection:{username:'worker',apiKey:'fixture',url:'https://fixture.invalid/app/'}}});
 if(!lateSession)assert.equal(f.reply.result?.ready,true,String(f.state.startupFailure?.stack));return f;
}
async function read(f){await f.handle({id:'read',operation:'readonly.preReady',input:{deadline:f.deadline}});return f.reply}
async function unchanged(f){const before=f.dispatches;await f.handle({id:'mutation',operation:'call',input:{name:'dock_node_apply',arguments:{}}});assert.equal(f.dispatches,before);assert.equal(f.reply.error,'LOGINOM_RECOVERY_REQUIRED');assert.equal(f.state.session.metadata.workspaceReady,undefined);assert.equal(f.state.bridgeCleanup,undefined);for(const operation of ['admit','close']){await f.handle({id:operation,operation,input:{}});assert.equal(f.reply.error,'LOGINOM_RECOVERY_REQUIRED')}assert.equal(f.state.closing,undefined)}
test('canonical original startup fixed read, no storage/preparation/release authority',async()=>{const f=await fixture();assert.equal(f.state.bridge.readonlyContinuation('dock_workspace_observe',{scope:'bootstrap'}),false);const r=await read(f);assert.equal(r.result.readonlyPreReady,true);assert.equal(r.result.result.observation.target_state,'ready_for_prepare');assert.equal(f.dispatches,1);await unchanged(f)});
for(const key of ['owner','page','context','account','origin','generation','chat','client','bridge','session','metadata','directory','sessionId'])test('initial tuple refuses '+key+' before dispatch',async()=>{const f=await fixture(),o=f.state.startupOwner;if(key==='owner')f.state.startupOwner={...o};else if(['client','bridge','session'].includes(key))f.state[key]={...f.state[key]};else if(['metadata','directory','sessionId'].includes(key)){if(key==='sessionId')f.state.session.metadata.sessionId='foreign';else f.state.session[key]=key==='directory'?'foreign':{...f.state.session.metadata}}else o[key]=key==='generation'?8:'foreign';assert.equal((await read(f)).result.readonlyPreReady,false);assert.equal(f.dispatches,0);await unchanged(f)});
for(const key of ['preparation','ready','storage','busy','unknown'])test('unknown/mixed phase refuses '+key,async()=>{const f=await fixture();if(key==='preparation')f.state.session.metadata.workspacePreparation={attempted:true};if(key==='ready')f.state.session.metadata.workspaceReady=true;if(key==='storage')f.state.session.metadata.storageBinding={};if(['busy','unknown'].includes(key))f[key]=true;assert.equal((await read(f)).result.readonlyPreReady,false);assert.equal(f.dispatches,0)});
test('first await Page replacement withholds projection',async()=>{const f=await fixture();f.hook=()=>{f.state.startupOwner.page={}};assert.equal((await read(f)).result.readonlyPreReady,false);assert.equal(f.dispatches,1);await unchanged(f)});
test('original cancellation during read retains raw cause',async()=>{const f=await fixture();f.hook=()=>f.handle({id:'abort',operation:'readonly.preReady.cancel',input:{requestId:'read',rejection:{kind:'value',value:0}}});assert.equal((await read(f)).result.readonlyPreReady,false);assert.equal(f.state.preReadyReadRefusal.value,0);await unchanged(f)});
test('original expired absolute deadline no dispatch',async()=>{const f=await fixture();f.deadline=Date.now()-1;assert.equal((await read(f)).result.readonlyPreReady,false);assert.equal(f.dispatches,0)});
test('deadline expiration inside first await no projection',async()=>{const f=await fixture();f.deadline=Date.now()+20;f.hook=()=>new Promise(r=>setTimeout(r,25));assert.equal((await read(f)).result.readonlyPreReady,false);assert.equal(f.dispatches,1)});
for(const value of [new Error('lost',{cause:0}),undefined,null,false,0,''])test('original lost/Error/falsy retained '+String(value),async()=>{const f=await fixture();f.failure={value};assert.equal((await read(f)).result.readonlyPreReady,false);assert.equal(f.state.preReadyReadRefusal.value,value);assert.equal(f.dispatches,1);await unchanged(f)});

for(const mode of ['missing','mixed','closed','multiple','controller','origin'])test('refuse unqualified '+mode,async()=>{const f=await fixture();if(mode==='missing')f.state.preReadyOwner=undefined;if(mode==='mixed')f.state.startupBinding=Object.freeze({...f.state.startupBinding});if(mode==='closed')f.page.isClosed=()=>true;if(mode==='multiple')f.context.pages=()=>[f.page,{}];if(mode==='controller')f.hook=()=>{f.state.controller=new AbortController()};if(mode==='origin')f.page.url=()=> 'https://foreign.invalid/app/';assert.equal((await read(f)).result.readonlyPreReady,false);assert.equal(f.dispatches,['controller','origin'].includes(mode)?1:0)});

test('indeterminate observation never projected or READY',async()=>{const f=await fixture();f.page.evaluate=async()=>({origin:'https://fixture.invalid',target_state:'indeterminate',observation_only:true});assert.equal((await read(f)).result.readonlyPreReady,false);await unchanged(f)});
test('pending original read refuses second dispatch, original refusal retained',async()=>{const f=await fixture();let unblock;f.hook=()=>new Promise(r=>unblock=r);const original=read(f);while(!unblock)await new Promise(r=>setImmediate(r));await f.handle({id:'second',operation:'readonly.preReady',input:{deadline:f.deadline}});assert.equal(f.reply.error,'LOGINOM_PRE_READY_READ_REFUSED');assert.equal(f.dispatches,1);unblock();await original;assert.equal(f.dispatches,1);await unchanged(f)});

test('session replacement during bridge creation is refused before READY/mint',async()=>{const f=await fixture({lateSession:true});assert.equal(f.reply.error,'LOGINOM_STARTUP_OWNER_CHANGED');assert.equal(f.state.preReadyOwner,undefined);assert.equal(f.dispatches,0)});
