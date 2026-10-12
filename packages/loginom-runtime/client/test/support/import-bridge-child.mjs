import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client as AgentClient} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import * as executor from '../../lib/executor.mjs';
import * as catalog from '../../lib/action-catalog.mjs';
import * as skill from '../../lib/skill.mjs';
import * as nodeApi from '../../lib/node-api.mjs';
import * as workspace from '../../lib/workspace.mjs';

// Bridge lifecycle test: external services and the action executor are fixtures.
// The serialized Loginom close body is exercised separately in package-cleanup.test.
let current;
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
      target,loginom_account:'test-2',document_id:'own-doc',created_draft:true,effect_possible:true,workflow_ref:{tab_tid:'own-tab',prefix:'own',workflow_id:'own-workflow',navigation_path:[]},package_ref:{path}};
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
  const f=current;return {tools:[{name:'dock_node_status',inputSchema:{type:'object'}}],describe:()=>({actions:[],node_types:[],available_node_types:[]}),assertPreparationAllowed(){if(f.busy||f.unknown)throw Error('busy');},
    hasUnsettledWork:()=>!!f.unknown,hasActiveWork:()=>!!f.busy,
    run:async(key,parameters,{operationId})=>{f.saves++;return {status:'SUCCEEDED',cleanup_complete:f.scenario!=='managed-unsettled-save',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}};},
  };
}}});
mock.module(new URL('../../lib/node-api.mjs',import.meta.url).href,{namedExports:{...nodeApi,dispatchNodeApi:async()=>({state:'settled',outcome:{status:'SUCCEEDED',cleanup_complete:true,output:current.ordinary}})}});
const {createBridge}=await import('../../lib/bridge.mjs');

import {mkdir} from 'node:fs/promises';
const forbidden=['dock_node_apply','dock_node_resume','dock_node_read','dock_ui_action','dock_action_run','dock_artifact_upload','dock_artifact_deliver','browser_run_code_unsafe','read'];
for(const scenario of ['partial','foreign-account','foreign-session','foreign-path','foreign-build','expired','pending','running','persistence','affirmative','throw-error','throw-undefined','throw-null','throw-false','throw-zero','throw-empty']) test('Import bridge '+scenario+' (services/Page/harness explicitly doubles; real bridge/SDK/filesystem)',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'import-bridge-'));
 const binding={revision:1,harness:'import-before-configure-v1',owner:'o',run:'r',lease:'o:r',generation:1,chat:'c',admission:'a',session:'own-session',account:'test-2',packagePath:path,expires:Date.now()+100000};
 const f=current={scenario,events:[],saves:0};
 const session={directory,metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads')}}};
 let calls=0, primary;
 const values={'throw-error':new Error('native fixture',{cause:0}),'throw-undefined':undefined,'throw-null':null,'throw-false':false,'throw-zero':0,'throw-empty':''};
 const harness=async({identity})=>{
  calls++;f.events.push('capture');
  if(scenario.startsWith('throw-')){primary=values[scenario];throw primary}
  return {revision:1,harness:binding.harness,session_id:identity.session_id,document_id:identity.document_id,account:identity.account,
   status:'PARTIAL',complete:scenario==='affirmative',close_authority:false,settings_applied:false,effect_possible:false,
   unknown:['type','data_kind','activity','freshness']};
 };
 const bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,loginomUrl:'http://loginom.invalid/app/?testable=true',acceptanceCleanupPackage:path},session,{acceptanceCapture:{binding,harness}});
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new AgentClient({name:'test',version:'1'},{capabilities:{}});await bridge.server.connect(a);await client.connect(b);
 try{
  await client.callTool({name:'dock_prepare',arguments:{}});
  for(const tool of forbidden)await assert.rejects(()=>client.callTool({name:tool,arguments:{}}),/PRECONFIGURE_GATE/);
  assert.equal(f.saves,0);
  if(scenario==='foreign-account')binding.account='foreign';
  if(scenario==='foreign-session')binding.session='foreign';
  if(scenario==='foreign-path')binding.packagePath='/foreign/draft.lgp';
  if(scenario==='foreign-build')session.metadata.targetIdentity.loginom_build='foreign';
  if(scenario==='expired')binding.expires=Date.now()-1;
  if(scenario==='pending')f.unknown=true;
  if(scenario==='running')f.busy=true;
  if(scenario==='persistence')await mkdir(join(directory,'acceptance-capture.json'));
  await assert.rejects(()=>bridge.captureAcceptance(),e=>{if(scenario.startsWith('throw-'))assert.equal(e,primary);return true});
  assert.equal(calls,['foreign-account','foreign-session','foreign-path','foreign-build','expired','pending','running'].includes(scenario)?0:1);
  if(scenario==='partial'){
   const saved=JSON.parse(await readFile(join(directory,'acceptance-capture.json'),'utf8'));
   assert.equal(saved.receipt.complete,false);assert.equal(saved.receipt.close_authority,false);
   await assert.rejects(()=>bridge.close(),e=>e.cause.complete===false);
  }
  if(scenario.startsWith('throw-'))await assert.rejects(()=>bridge.close(),e=>e===primary);
  if(scenario==='persistence'){
   await rm(join(directory,'acceptance-capture.json'),{recursive:true});
   await assert.rejects(()=>bridge.close());assert.equal(calls,1);
  }
  for(const tool of forbidden)await assert.rejects(()=>client.callTool({name:tool,arguments:{}}),/PRECONFIGURE_GATE/);
  assert.equal(f.events.includes('browser-close'),false);assert.equal(f.events.includes('package-cleanup'),false);assert.equal(f.events.includes('release-uploads'),false);
  await assert.rejects(()=>bridge.captureAcceptance());
 } finally {await client.close();await rm(directory,{recursive:true,force:true})}
});
