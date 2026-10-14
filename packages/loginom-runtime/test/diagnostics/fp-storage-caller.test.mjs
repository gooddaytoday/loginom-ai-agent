import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {mkdtemp,rm,writeFile,mkdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const root=resolve(process.env.FP_RUNTIME??new URL('../..',import.meta.url).pathname),lib=p=>pathToFileURL(join(root,'client/lib',p)).href;
const require=createRequire(join(root,'client/package.json'));
const {Client:Caller}=require('@modelcontextprotocol/sdk/client/index.js');
const {InMemoryTransport}=require('@modelcontextprotocol/sdk/inMemory.js');
const sdk=p=>pathToFileURL(require.resolve('@modelcontextprotocol/sdk/'+p).replace('/cjs/','/esm/')).href;
const catalog=await import(lib('action-catalog.mjs')),executor=await import(lib('executor.mjs'));
let current;
class ExternalClient{
 constructor(identity){this.browser=identity.name==='loginom-dock-browser';this.f=current;}
 async connect(){} async close(){this.f.events.push('fixture-transport-close');}
 async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]};}
 async callTool(){this.f.browserCalls++;throw Error('Browser/native dispatch forbidden in this diagnostic');}
}
class ExternalTransport{}
mock.module(sdk('client/index.js'),{namedExports:{Client:ExternalClient}});
mock.module(sdk('client/stdio.js'),{namedExports:{StdioClientTransport:ExternalTransport,getDefaultEnvironment:()=>({})}});
mock.module(sdk('client/streamableHttp.js'),{namedExports:{StreamableHTTPClientTransport:ExternalTransport}});
const target={profile_id:'fixture',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
mock.module(lib('action-catalog.mjs'),{namedExports:{...catalog,pinActionCatalog:async()=>({pins:{},compatibility:target,manifest:{compatibility:target},actions:new Map(),selectors:new Map()})}});
// Instrument the real execute closure; no readiness, channel or FP authority supplied.
mock.module(lib('executor.mjs'),{namedExports:{...executor,createActionRuntime:options=>{
 const execute=options.execute;
 return executor.createActionRuntime({...options,execute:(code,opts)=>{current.executeInputs.push({code,signal:opts.signal,timeout:opts.timeout});return execute(code,opts)}});
}}});
const {Server}=await import(sdk('server/index.js'));
const setHandler=Server.prototype.setRequestHandler;
mock.method(Server.prototype,'setRequestHandler',function(schema,handler){return setHandler.call(this,schema,async(request,extra)=>{
 if(request.method==='tools/call'){current.inboundSignals.push(extra.signal);current.callerInputs.push(structuredClone(request.params));}
 return handler(request,extra);
})});
const {createBridge}=await import(lib('bridge.mjs'));
const results=[];
for(const phase of ['unprepared','indeterminate'])test('actual MCP bootstrap caller refuses storage before READY: '+phase,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'fp-storage-route-'));
 const f=current={phase,events:[],browserCalls:0,executeInputs:[],inboundSignals:[],callerInputs:[]};
 const metadata={client:'fixture',sessionId:'fixture-session',clientRevision:'fixture',workspaceReady:false};
 if(phase==='indeterminate')metadata.workspacePreparation={attempted:true,state:{status:'AMBIGUOUS'}};
 const session={directory,metadata,save:async()=>{},browserRoot:directory};
 const config={endpoint:'https://remote.invalid/mcp',apiKey:'fixture',loginomUrl:'https://worker.invalid/app',stateDir:directory,mode:'executor-replay',storageDirectories:{inputs:'/worker',exports:'/worker',packages:'/worker'}};
 let caller,bridge;
 try{
  bridge=await createBridge(config,session,{browserTransport:{}});
  const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);
  caller=new Caller({name:'fp-phase-diagnostic',version:'1'});await caller.connect(a);
  const reply=await caller.callTool({name:'dock_workspace_observe',arguments:{scope:'bootstrap'}});
  const text=reply.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
  assert.match(text,/Prepare Loginom before using the selected directories/);
  const outcome=JSON.parse(reply.content.find(x=>x.type==='text').text);assert.equal(outcome.status,'FAILED');assert.equal(outcome.effect_possible,false);assert.equal(f.browserCalls,0);assert.equal(f.executeInputs.length,1);
  assert.equal(f.executeInputs[0].signal,f.inboundSignals.at(-1));assert.equal(f.executeInputs[0].timeout,5000);
  assert.equal(f.executeInputs[0].signal.aborted,false);assert.match(f.executeInputs[0].code,/bootstrapWorkspace/);
  assert.deepEqual(f.callerInputs,[{name:'dock_workspace_observe',arguments:{scope:'bootstrap'}}]);
  assert.equal(metadata.storageBinding,undefined);assert.equal(metadata.workspaceReady,false);
  const captureBefore=f.executeInputs.length;await assert.rejects(bridge.captureAcceptance(),/LOGINOM_CAPTURE_UNAVAILABLE/);
  assert.equal(f.executeInputs.length,captureBefore);assert.equal(f.browserCalls,0);
  const result={phase,fixture:true,reply,execute:{timeout:f.executeInputs[0].timeout,original_inbound_signal:true,code_kind:'serialized bootstrap',absolute_original_deadline_observed:false},metadata:{workspaceReady:metadata.workspaceReady,storageBinding:metadata.storageBinding??null},browser_calls:0,apply_next_done_cancel_native_release_replay:0,
   authority:{original_owner_page:'NOT_VERIFIED',retained_host_run_lease:'NOT_VERIFIED',FP_grant:'NOT_VERIFIED'},scope:'real whole bridge/executor/storage helper and MCP caller; external catalog/transport/session doubles; no supplied READY/FP binding/owner/nonce or native Page'};
  results.push(result);
 }finally{await caller?.close();await bridge?.server.close();await rm(directory,{recursive:true,force:true});}
});
test.after(async()=>{await mkdir(process.env.FP_ROUTE_RESULTS,{recursive:true});await writeFile(join(process.env.FP_ROUTE_RESULTS,'phase-receipts.json'),JSON.stringify(results,null,2)+'\n')});

test('proposed model task excludes closed oracle at this diagnostic caller boundary',async()=>{
 const path=process.env.FP_MODEL_INPUT??new URL('../fixtures/field-parameters/storage-model-input.json',import.meta.url);
 const input=JSON.parse(await readFile(path,'utf8'));
 assert.deepEqual(Object.keys(input).sort(),['input','input_port','node_type','scope','task']);
 assert.equal(input.node_type,'transform.reform_columns');assert.equal(input.input_port,0);
 assert.equal(input.input,'rowid-ab-c.csv');
 assert.ok(!/expected_rows|expected_values|input_rows|output_rows|oracle|consumer|101|2147483647|alpha|semi;colon/.test(JSON.stringify(input)));
 // Actual model filesystem/runtime isolation is intentionally not asserted.
});
