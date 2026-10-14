import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const runtimeRoot=process.env.PREREADY_RUNTIME_ROOT??fileURLToPath(new URL('../../../',import.meta.url));
const runtimeURL=pathToFileURL(runtimeRoot+'/');
const runtimeRequire=createRequire(new URL('client/package.json',runtimeURL));
const {admitStartupArtifacts}=await import(new URL('client/lib/artifacts.mjs',runtimeURL));
import test,{mock,after} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {InMemoryTransport}=await import(pathToFileURL(runtimeRequire.resolve('@modelcontextprotocol/sdk/inMemory.js')).href);
const {decodePreReadyRejection}=await import(new URL('src/qualified-pre-ready.mjs',runtimeURL));
const catalog=await import(new URL('client/lib/action-catalog.mjs',runtimeURL));
const skill=await import(new URL('client/lib/skill.mjs',runtimeURL));
const executor=await import(new URL('client/lib/executor.mjs',runtimeURL));
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
mock.module(pathToFileURL(runtimeRequire.resolve('@modelcontextprotocol/sdk/client/index.js').replace('/dist/cjs/','/dist/esm/')).href,{namedExports:{Client}});
mock.module(pathToFileURL(runtimeRequire.resolve('@modelcontextprotocol/sdk/client/stdio.js').replace('/dist/cjs/','/dist/esm/')).href,{namedExports:{StdioClientTransport:Transport,getDefaultEnvironment:()=>({})}});
mock.module(pathToFileURL(runtimeRequire.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js').replace('/dist/cjs/','/dist/esm/')).href,{namedExports:{StreamableHTTPClientTransport:Transport}});
mock.module(new URL('client/lib/action-catalog.mjs',runtimeURL).href,{namedExports:{...catalog,pinActionCatalog:async()=>({pins:{},compatibility:target,manifest:{compatibility:target},actions:new Map()})}});
mock.module(new URL('client/lib/skill.mjs',runtimeURL).href,{namedExports:{...skill,skillTransport:()=>({}),createSkillLoader:()=>({})}});
mock.module(new URL('client/lib/executor.mjs',runtimeURL).href,{namedExports:{...executor,createActionRuntime:()=>({tools:[],describe:()=>({}),hasActiveWork:()=>!!current.busy,hasUnsettledWork:()=>!!current.unknown})}});
const {createBridge}=await import(new URL('client/lib/bridge.mjs',runtimeURL));
const root=runtimeRoot;
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
  admitStartupArtifacts,validateStartInput:()=>({}),verifyResources:async()=>({browserPath:'double',browserRoot:'double'}),
  loginBrowser:async({owner})=>{Object.assign(owner,{id:'original',account:'worker',origin:'https://fixture.invalid',page:f.page,context:f.context});return {context:f.context}},loginomAddress:x=>x,
  createSession:async(config,{managed})=>{const browserConfig=join(managed.directory,'browser.json');await writeFile(browserConfig,'{}');return {save:async()=>writeFile(join(managed.directory,'session.json'),'{}'),directory:managed.directory,browserConfig,metadata:{sessionId:'original-session',clientRevision:'fixture'}}},
  createBridge:async(...args)=>{const bridge=await createBridge(...args);if(lateSession)f.state.session={...f.state.session};return bridge},require:s=>s.includes('inMemory')?{InMemoryTransport}:s==='@playwright/mcp'?{createConnection:async()=>({connect:async()=>{}})}:{Client}});
 await f.handle({id:'start',operation:'start',input:{generation:7,chat:'original-chat',stateDir:directory,resources:'fixture',endpoint:'https://fixture.invalid/mcp',connection:{username:'worker',apiKey:'fixture',url:'https://fixture.invalid/app/'}}});
 if(!lateSession)assert.equal(f.reply.result?.ready,true,String(f.state.startupFailure?.stack));return f;
}
async function read(f){await f.handle({id:'read',operation:'readonly.preReady',input:{deadline:f.deadline}});return f.reply}
async function unchanged(f){const before=f.dispatches;await f.handle({id:'mutation',operation:'call',input:{name:'dock_node_apply',arguments:{}}});assert.equal(f.dispatches,before);assert.equal(f.reply.error,'LOGINOM_RECOVERY_REQUIRED');assert.equal(f.state.session.metadata.workspaceReady,undefined);assert.equal(f.state.bridgeCleanup,undefined);for(const operation of ['admit','close']){await f.handle({id:operation,operation,input:{}});assert.equal(f.reply.error,'LOGINOM_RECOVERY_REQUIRED')}assert.equal(f.state.closing,undefined)}
// Production handle + production admission validator. The store is a labelled
// controllable service double; its eventual write uses a real fixture file.
test('pending ordinary call refuses pre-READY read before dispatch',async()=>{
 const f=await fixture();let unblock;
 f.state.client.callTool=()=>new Promise(resolve=>unblock=resolve);
 const call=f.handle({id:'call',operation:'call',input:{name:'dock_prepare',arguments:{}}});
 while(!unblock)await new Promise(r=>setImmediate(r));
 try{const result=await read(f);console.log(JSON.stringify({scenario:'pending-call',dispatches:f.dispatches,error:result.error,held:f.state.preReadyReadHeld}));assert.equal(result.error,'LOGINOM_PRE_READY_READ_REFUSED');assert.equal(f.dispatches,0)}finally{unblock({fixture:true});await call}
});
test('pending admission must refuse pre-READY dispatch and held-state ACK',async()=>{
 const f=await fixture();let unblock,started;const entered=new Promise(resolve=>started=resolve);
 const file=join(f.state.session.directory,'admitted-after-read.txt');
 f.state.session.artifactStore={async admit(request){started();await new Promise(resolve=>unblock=resolve);await writeFile(file,'fixture');return {artifact_id:'fixture',name:request.name}}};
 await writeFile(join(f.state.session.directory,'input.txt'),'');
 const admission=f.handle({id:'admit',operation:'admit',input:{userMessage:'original',files:[{name:'input.txt',bytes:0,sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',sourcePath:join(f.state.session.directory,'input.txt')}]}});
 await entered;let result;
 try{result=await read(f)}finally{unblock();await admission}
 const facts={scenario:'pending-admission',readAccepted:result.result?.readonlyPreReady===true,dispatches:f.dispatches,held:f.state.preReadyReadHeld,admissionAcknowledged:f.reply.id==='admit'&&!!f.reply.result,inputsPublished:f.state.inputs.has('original'),writtenAfterRead:await readFile(file,'utf8')};
 console.log(JSON.stringify(facts));
 assert.notEqual(result.result?.readonlyPreReady,true,'read must refuse while the original admission is still in flight');
 assert.equal(f.dispatches,0,'no fixed read dispatch overlaps an active artifact admission');
});

for(const value of [new Error('original admission',{cause:0}),undefined,null,false,0,''])test('original admission rejection retains counter boundary '+String(value),async()=>{
 const f=await fixture();let unblock,started;const entered=new Promise(r=>started=r);
 f.state.session.artifactStore={async admit(){started();await new Promise(r=>unblock=r);throw value}};
 const input=join(f.state.session.directory,'input.txt');await writeFile(input,'');
 const admission=f.handle({id:'admit',operation:'admit',input:{userMessage:'original',files:[{name:'input.txt',bytes:0,sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',sourcePath:input}]}});
 await entered;assert.equal(f.state.admitting,1);const result=await read(f);assert.equal(result.error,'LOGINOM_PRE_READY_READ_REFUSED');assert.equal(f.state.preReadyReadHeld,undefined);
 unblock();await admission;assert.equal(f.state.admitting,0);assert.equal(f.state.inputs.has('original'),false);assert.equal(f.dispatches,0);
});
test('all overlapping original admissions retain the boundary until their publications',async()=>{
 const f=await fixture(),unblocks=[];f.state.session.artifactStore={async admit(request){await new Promise(r=>unblocks.push(r));return {artifact_id:request.name,name:request.name}}};
 const input=join(f.state.session.directory,'input.txt');await writeFile(input,'');
 const start=id=>f.handle({id,operation:'admit',input:{userMessage:id,files:[{name:'input.txt',bytes:0,sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',sourcePath:input}]}});
 const first=start('first'),second=start('second');while(unblocks.length<2)await new Promise(r=>setImmediate(r));assert.equal(f.state.admitting,2);
 assert.equal((await read(f)).error,'LOGINOM_PRE_READY_READ_REFUSED');unblocks[0]();await first;assert.equal(f.state.admitting,1);
 assert.equal((await read(f)).error,'LOGINOM_PRE_READY_READ_REFUSED');unblocks[1]();await second;assert.equal(f.state.admitting,0);
 assert.equal(f.state.inputs.has('first'),true);assert.equal(f.state.inputs.has('second'),true);assert.equal(f.dispatches,0);assert.equal(f.state.preReadyReadHeld,undefined);
});
