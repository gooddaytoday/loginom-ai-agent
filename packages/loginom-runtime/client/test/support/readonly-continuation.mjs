import test, {mock,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client as AgentClient} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import * as executor from '../../lib/executor.mjs';
import * as catalog from '../../lib/action-catalog.mjs';
import * as skill from '../../lib/skill.mjs';
import * as workspace from '../../lib/workspace.mjs';

// Bridge lifecycle test: external services and the action executor are fixtures.
// The serialized Loginom close body is exercised separately in package-cleanup.test.
import * as journal from '../../lib/execution-journal.mjs';
const journalPrimary=Error('original journal rejection',{cause:0});
let current;
mock.module(new URL('../../lib/execution-journal.mjs',import.meta.url).href,{namedExports:{...journal,createExecutionJournal:options=>{const original=journal.createExecutionJournal(options);return async value=>{await original(value);if(value.event==='acceptance_capture'&&current.case==='journal-failure-close'&&!current.journalFault){current.journalFault=true;throw journalPrimary}}}}});
const target={profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
const path='/test-2/packages/result.lgp';
class ExternalClient {
  constructor(identity){this.browser=identity.name==='loginom-dock-browser';this.f=current;}
  async connect(t){this.transport=t;}
  async close(){this.f.events.push(this.browser?'browser-close':'remote-close');this.transport?.onclose?.();}
  async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]};}
  async callTool({arguments:{code}}){
    let value;
    if(code.includes('async function prepareWorkspace'))value={status:'READY',authenticated:true,target_verified:true,
      target,loginom_account:'test-2',document_id:'own-doc',created_draft:true,effect_possible:true,workflow_ref:{tab_tid:'own-tab',prefix:'own',workflow_id:'own-workflow',navigation_path:[]},package_ref:{path:null}};
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
mock.module(new URL('../../lib/action-catalog.mjs',import.meta.url).href,{namedExports:{...catalog,pinActionCatalog:async()=>({pins:{},compatibility:target,manifest:{compatibility:target},actions:new Map()})}});
mock.module(new URL('../../lib/skill.mjs',import.meta.url).href,{namedExports:{...skill,skillTransport:()=>({}),createSkillLoader:()=>({prepare:async()=>({main:'/test/skill',directory:'/test',detail:{revision:'test',source:'test',content:'test'}})})}});
mock.module(new URL('../../lib/workspace.mjs',import.meta.url).href,{namedExports:{...workspace,
  makeWorkspacePrepareCode:options=>workspace.makeWorkspacePrepareCode({...options,platform:'darwin'})}});
mock.module(new URL('../../lib/executor.mjs',import.meta.url).href,{namedExports:{...executor,createActionRuntime:()=>{
  const f=current;return {observe:async()=>({status:'FAILED',request_rejected:true,effect_possible:false,error:{code:'REQUEST_REJECTED',message:'known identity refusal'}}),tools:[],describe:()=>({actions:[],node_types:[],available_node_types:[]}),assertPreparationAllowed(){if(f.busy||f.unknown)throw Error('busy');},
    hasUnsettledWork:()=>!!f.unknown,hasActiveWork:()=>!!f.busy,
    run:async(key,parameters,{operationId})=>{f.saves++;return {status:'SUCCEEDED',cleanup_complete:f.scenario!=='managed-unsettled-save',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}};},
  };
}}});


import {pathToFileURL} from 'node:url';
import {mkdir} from 'node:fs/promises';
const {createBridge}=await import(process.env.READONLY_BRIDGE_ENTRY?pathToFileURL(process.env.READONLY_BRIDGE_ENTRY).href:'../../lib/bridge.mjs');
for(const scenario of ['pre-native-save-refusal','receipt-write-failure','unknown-work'])test('whole bridge readonly '+scenario,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'readonly-bridge-'));
 const f=current={case:'readonly',scenario,events:[],directory};
 const session={directory,metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release')}}};
 const bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,loginomUrl:'http://loginom.invalid/app/?testable=true'},session);
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new AgentClient({name:'test',version:'1'},{capabilities:{}});await bridge.server.connect(a);await client.connect(b);
 try{
  await client.callTool({name:'dock_prepare',arguments:{}});
  if(scenario==='receipt-write-failure')await mkdir(join(directory,'package-cleanup.json'));
  if(scenario==='unknown-work')f.unknown=true;
  let receipt;try{receipt=await bridge.close()}catch(e){assert.equal(scenario,'receipt-write-failure')}
  assert.equal(bridge.hasUnsettledWork(),true);assert.equal(f.events.includes('browser-close'),false);assert.equal(f.events.includes('package-cleanup'),false);assert.equal(f.events.includes('release'),false);
  assert.equal(bridge.readonlyContinuation('dock_workspace_observe',{scope:'all'}),scenario==='pre-native-save-refusal');
  assert.equal(bridge.readonlyContinuation('dock_diagnostics',{checkConnections:false}),scenario==='pre-native-save-refusal');
  assert.equal(bridge.readonlyContinuation('dock_diagnostics',{checkConnections:true}),false);
  assert.equal(bridge.readonlyContinuation('dock_workspace_observe',{code:'forbidden'}),false);
  assert.equal(bridge.readonlyContinuation('dock_ui_action',{}),false);
  if(scenario==='pre-native-save-refusal'){
    assert.equal(receipt.package_cleanup.reason,'CONFIRMED_SAVE_REQUIRED');
    const observed=await client.callTool({name:'dock_workspace_observe',arguments:{scope:'all'}});assert.equal(observed.isError,undefined);
    await assert.rejects(client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_as',parameters:{path},operation_id:'forbidden'}}));
  }
 if(process.connected)await new Promise((resolve,reject)=>process.send({scenario,nativeCalls:f.events.filter(x=>x==='package-cleanup').length,release:false},e=>e?reject(e):resolve()));
 }finally{await client.close();await bridge.server.close();await rm(directory,{recursive:true,force:true})}
});
