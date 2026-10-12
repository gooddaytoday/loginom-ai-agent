import test, {mock,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client as AgentClient} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import * as executor from '../lib/executor.mjs';
import * as catalog from '../lib/action-catalog.mjs';
import * as skill from '../lib/skill.mjs';
import * as workspace from '../lib/workspace.mjs';

// Whole bridge plus actual executor/node runner/phase validation and callback FS.
// Page/native driver, fixed reader/validator, external services and Save are doubles.
let current;
const target={profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
const path='/test-2/result.lgp';
class ExternalClient {
  constructor(identity){this.browser=identity.name==='loginom-dock-browser';this.f=current;}
  async connect(t){this.transport=t;}
  async close(){this.f.events.push(this.browser?'browser-close':'remote-close');this.transport?.onclose?.();}
  async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]};}
  async callTool({arguments:{code}}){
    let value;
    if(code.includes('async function prepareWorkspace'))value={status:'READY',authenticated:true,target_verified:true,
      target,loginom_account:'test-2',document_id:'own-doc',created_draft:true,effect_possible:true,workflow_ref:{tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',workflow_id:'own-workflow',navigation_path:[]},package_ref:{path:null}};
    else if(code.includes('async function observeGeometry'))value={version:1,source:'prepare_same_browser_page',observed:{document_id:'own-doc'}};
    else if(code.includes('function readSavedPackageState')){
      this.f.events.push('saved-state');
      if(this.f.scenario==='state-unavailable')throw Error('Read response lost');
      value={version:1,session_id:'own-session',document_id:'own-doc',account:'test-2',package_path:path,
        modified:this.f.scenario==='dirty-after-save'&&this.f.saves===1,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
    }
    else if(code.includes('async function closeOwnedPackage')){
      this.f.events.push('package-cleanup');
      if(this.f.native){value=await this.f.native.execute(code);this.f.nativeReceipts.push(structuredClone(value));return {content:[{type:'text',text:JSON.stringify(value)}]};}
      const blocked=['native-blocked','managed-unsaved'].includes(this.f.scenario);
      value={version:1,session_id:'own-session',document_id:'own-doc',status:blocked?'BLOCKED':'SUCCEEDED',package_closed:!blocked,
        logged_out:!blocked,account:this.f.scenario==='managed-identity'?'foreign':'test-2',package_path:path,unsaved_changes_discarded:false,packages_before:1,packages_after:0,reason:blocked?'UNSAVED_CHANGES':null};
    } else throw Error('Unexpected browser code');
    return {content:[{type:'text',text:JSON.stringify(value)}]};
  }
}
class ExternalTransport{}
mock.module('@modelcontextprotocol/sdk/client/index.js',{namedExports:{Client:ExternalClient}});
mock.module('@modelcontextprotocol/sdk/client/stdio.js',{namedExports:{StdioClientTransport:ExternalTransport,getDefaultEnvironment:()=>({})}});
mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js',{namedExports:{StreamableHTTPClientTransport:ExternalTransport}});
mock.module(new URL('../lib/action-catalog.mjs',import.meta.url).href,{namedExports:{...catalog,pinActionCatalog:async()=>({pins:{},compatibility:target,manifest:{compatibility:target},actions:new Map()})}});
mock.module(new URL('../lib/skill.mjs',import.meta.url).href,{namedExports:{...skill,skillTransport:()=>({}),createSkillLoader:()=>({prepare:async()=>({main:'/test/skill',directory:'/test',detail:{revision:'test',source:'test',content:'test'}})})}});
mock.module(new URL('../lib/workspace.mjs',import.meta.url).href,{namedExports:{...workspace,
  makeWorkspacePrepareCode:options=>workspace.makeWorkspacePrepareCode({...options,platform:'darwin'})}});
const workflow={workflow_id:'own-workflow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const request=()=>({operation_id:'own-node',contract_revision:'1.0.0',document_id:'own-doc',workflow_ref:workflow,
 target:{kind:'new',type:'imports.text',label:'Source',position:{x:320,y:280}},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'done',
 read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
function localRuntime(f) {
 const graph={complete:true,document_id:'own-doc',workflow_ref:workflow,nodes:[],links:[],foreign_links:[]};
 const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:()=>true,reconcile:async()=>({verified:true,cleanup_complete:true}),mutate:async e=>{if(e.kind==='create')graph.nodes.push({ref:{document_id:'own-doc',workflow_id:'own-workflow',node_id:'new'},type:e.parameters.type,label:'Source',position:e.parameters.position,inputs:[],outputs:[0]});return {status:'SUCCEEDED',cleanup_complete:true}}};
 const ok=extra=>async()=>({verified:true,cleanup_complete:true,effect_possible:false,...extra});
 const runtime=executor.createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},allowCandidate:true,
  execute:async()=>{throw Error('Unexpected native call')},artifactStore:{},nodeTargetAdapterFactory:()=>adapter,
  nodeApplyHandlers:new Map([['imports.text',{revision:'1',modes:['delimited'],validate(){},configure:ok()}]]),
  nodeApplyDriverFactory:()=>({verifySource:ok(),mapPorts:ok(),openWizard:ok({opening_operation_id:'own-node:open',epoch:'own'}),finish:ok({mode:'done',execution_started:false,execution_id:null}),waitExecution:ok(),readOutput:ok(),verifyContinuation:async()=>true}),
  onRecord:async e=>e});
 return {...runtime,run:async(key,parameters,{operationId})=>{f.saves++;return {status:'SUCCEEDED',cleanup_complete:true,action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}}}};
}
mock.module(new URL('../lib/executor.mjs',import.meta.url).href,{namedExports:{...executor,createActionRuntime:()=>localRuntime(current)}});

import {pathToFileURL} from 'node:url';
const {retainCaptureOwner,bindCaptureRuntime}=await import(process.env.RETAINED_HELPER_ENTRY??new URL('../../src/retained-capture.mjs',import.meta.url).href);
import {mkdir} from 'node:fs/promises';
const {createBridge}=await import(process.env.RETAINED_BRIDGE_ENTRY?pathToFileURL(process.env.RETAINED_BRIDGE_ENTRY).href:'../lib/bridge.mjs');
for(const scenario of ['valid','publication-array'])test('whole bridge retained diagnostic '+scenario,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'retained-bridge-'));
 const f=current={case:scenario,scenario:'hybrid-success',events:[],directory,saves:0};
 const session={directory,metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release')}}};
 const owner={id:'owner',generation:7,chat:'chat',context:{},page:{},account:'test-2',origin:'http://loginom.invalid'};
 const originalPage=owner.page;originalPage.isClosed=()=>false;owner.context.pages=()=>[originalPage];
 const state={startupOwner:owner,captureStartupBinding:Object.freeze({...owner,owner}),session};
 const binding=Object.freeze({revision:1,harness:'calculator-grouped-before-done-v1',owner:'host',run:'run',lease:'host:run',generation:7,chat:'chat',account:'test-2',packagePath:path,admission:'admission',session:'own-session',expires:Date.now()+600000});
 const resource=Object.freeze({path:'runtime/src/acceptance/calculator-grouped-before-done-v1.mjs',sha256:'a'.repeat(64)});
 const retained=retainCaptureOwner(state,binding,resource);let calls=0;const original=Error('original capture',{cause:false});
 const acceptanceCapture={binding,retained,registration:Object.freeze({mode:'readonly',resource,validate:async()=>true}),
  harness:async({retained:actual,node,publication})=>{
   calls++;assert.equal(actual.page,owner.page);assert.equal(node.request.operation_id,'own-node');node.assertCurrent();
   if(scenario==='unknown-reader')throw original;
   const receipt={status:'DIAGNOSTIC_READ',settings_applied:false,effect_possible:false,admission_confirmed:false,publication:{...publication},root:Object.fromEntries(['document_id','workflow_id','node_id','session_id','account','package_path'].map(key=>[key,publication[key]]))};
   if(scenario==='publication-array')receipt.publication=Object.assign([],{...publication});return receipt;
  }};
 const bridge=await createBridge({mode:'executor-replay',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,loginomUrl:'http://loginom.invalid/app/?testable=true',acceptanceCleanupPackage:path},session,{acceptanceCapture});state.bridge=bridge;
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new AgentClient({name:'test',version:'1'},{capabilities:{}});await bridge.server.connect(a);await client.connect(b);state.client=client;bindCaptureRuntime(retained,bridge,client);
 try {
  await client.callTool({name:'dock_prepare',arguments:{}});
  const started=await client.callTool({name:'dock_node_apply',arguments:request()});assert.equal(started.isError,undefined,JSON.stringify(started));
  const settled=await client.callTool({name:'dock_node_wait',arguments:{operation_id:'own-node',timeout_ms:1000}});assert.equal(settled.isError,undefined,JSON.stringify(settled));const job=settled.structuredContent??JSON.parse(settled.content[0].text);assert.equal(job.outcome?.status,'SUCCEEDED',JSON.stringify(job));
  await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'save'}});
  if(scenario==='write-refusal')await mkdir(join(directory,'acceptance-capture.json'));
  state.controller=new AbortController();const signal=state.controller.signal;
  if(scenario==='valid'){
   const result=await bridge.captureAcceptance({signal});assert.equal(result.diagnosticRead,true);assert.equal(result.cleanupComplete,false);
   const disk=JSON.parse(await readFile(join(directory,'acceptance-capture.json'),'utf8'));assert.equal(disk.receipt.publication.operation_id,'own-node');
  }else{
   let returned,rejection;try{returned=await bridge.captureAcceptance({signal})}catch(value){rejection=value}
   if(scenario==='publication-array'){
     let written;try{written=JSON.parse(await readFile(join(directory,'acceptance-capture.json'),'utf8'))}catch{}
     console.log(JSON.stringify({scenario,diagnosticRead:returned?.diagnosticRead??false,
       cleanupComplete:returned?.cleanupComplete??null,
       returnedPublicationKeys:returned?Object.keys(returned.receipt.publication):[],
       persistedPublication:written?.receipt?.publication??null,
       rejected:!!rejection,readerCalls:calls,nativeCalls:f.events.filter(x=>x==='package-cleanup').length}));
     assert.equal(returned?.diagnosticRead,undefined,'non-JSON publication must refuse before returning a diagnostic result');
     assert.equal(written,undefined,'a publication lost by JSON serialization must not reach evidence IO');
   }
   assert.ok(rejection,'malformed publication must refuse');
   if(scenario==='write-refusal'){await rm(join(directory,'acceptance-capture.json'),{recursive:true});await assert.rejects(bridge.close());assert.ok(await readFile(join(directory,'acceptance-capture.json'),'utf8'))}
  }
  await assert.rejects(bridge.close());await assert.rejects(bridge.captureAcceptance({signal}));assert.equal(calls,1);
  assert.equal(f.events.includes('package-cleanup'),false);assert.equal(f.events.includes('browser-close'),false);assert.equal(f.events.includes('release'),false);
  if(process.connected)await new Promise((resolve,reject)=>process.send({scenario,calls,native:false,release:false},e=>e?reject(e):resolve()));
 }finally{await client.close();await bridge.server.close();await rm(directory,{recursive:true,force:true})}
});
after(()=>{if(process.connected)process.disconnect()});
