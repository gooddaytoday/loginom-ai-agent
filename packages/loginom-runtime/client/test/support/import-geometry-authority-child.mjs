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
  async callTool({arguments:{code}},_unused,options){
    if(code.includes('async function prepareWorkspace'))this.f.events.push({event:'native-prepare-dispatched',at:Date.now(),helper_timeout_ms:Number(code.match(/"timeoutMs":([0-9]+)/)?.[1]),transport_timeout_ms:options?.timeout,helper_absolute_deadline:Number(code.match(/const deadline = Math.min\(([0-9]+),Date.now/)?.[1])});
    if(code.includes('async function prepareWorkspace')&&this.f.scenario==='import-expired-response')await new Promise(r=>setTimeout(r,Math.max(1,this.f.binding.expires-Date.now()+25)));
    if(code.includes('async function prepareWorkspace')&&this.f.scenario==='import-changed-binding')this.f.binding.account='foreign';
    if(code.includes('async function observeGeometry'))this.f.events.push({event:'geometry-dispatched',at:Date.now(),timeout:options?.timeout});
    if(code.includes('async function observeGeometry')&&this.f.scenario==='import-expired-geometry')await new Promise(r=>setTimeout(r,Math.max(1,this.f.binding.expires-Date.now()+25)));
    if(code.includes('async function observeGeometry')&&this.f.scenario==='import-changed-geometry')this.f.binding.lease='foreign';
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
mock.module(new URL('../../lib/skill.mjs',import.meta.url).href,{namedExports:{...skill,skillTransport:()=>({}),createSkillLoader:()=>({prepare:async()=>{if(current.waitSkill){current.skillEntered();await current.waitSkill;}return {main:'/test/skill',directory:'/test',detail:{revision:'test',source:'test',content:'test'}}}})}});
mock.module(new URL('../../lib/workspace.mjs',import.meta.url).href,{namedExports:{...workspace,
  makeWorkspacePrepareCode:options=>workspace.makeWorkspacePrepareCode({...options,platform:'darwin'})}});
mock.module(new URL('../../lib/executor.mjs',import.meta.url).href,{namedExports:{...executor,createActionRuntime:()=>{
  const f=current;return {tools:[{name:'dock_node_status',inputSchema:{type:'object'}}],describe:()=>({actions:[],node_types:[],available_node_types:[]}),assertPreparationAllowed(){if(f.busy||f.unknown)throw Error('busy');},
    hasUnsettledWork:()=>!!f.unknown,hasActiveWork:()=>!!f.busy,
    observe:async()=>{f.observationEntered();await f.holdObservation;throw Error('REVIEW_OBSERVATION_STOPPED_BEFORE_NATIVE');},
    run:async(key,parameters,{operationId})=>{f.saves++;return {status:'SUCCEEDED',cleanup_complete:f.scenario!=='managed-unsettled-save',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}};},
  };
}}});
mock.module(new URL('../../lib/node-api.mjs',import.meta.url).href,{namedExports:{...nodeApi,dispatchNodeApi:async()=>({state:'settled',outcome:{status:'SUCCEEDED',cleanup_complete:true,output:current.ordinary}})}});
const {createBridge}=await import('../../lib/bridge.mjs');

import {mkdir} from 'node:fs/promises';
const forbidden=['dock_node_apply','dock_node_resume','dock_node_read','dock_ui_action','dock_action_run','dock_artifact_upload','dock_artifact_deliver','browser_run_code_unsafe','read'];

import {writeFile} from 'node:fs/promises';
for(const scenario of ['import-timely','ordinary-timely','import-expired-response','import-changed-binding','import-expired-geometry','import-changed-geometry'])test('remaining original Import authority before geometry: '+scenario,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'review-import-geometry-'));
 const binding={revision:1,harness:scenario==='ordinary-timely'?'sorting-before-close-v1':'import-before-configure-v1',owner:'o',run:'r',lease:'o:r',generation:1,chat:'c',admission:'a',session:'own-session',account:'test-2',packagePath:path,expires:Date.now()+700};
 const f=current={scenario,events:[],saves:0,binding};
 const session={directory,metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads')}}};
 const bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,loginomUrl:'http://loginom.invalid/app/?testable=true',acceptanceCleanupPackage:path},session,{acceptanceCapture:{binding,harness:async()=>{throw Error('capture not reached')}}});
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new AgentClient({name:'review',version:'1'},{capabilities:{}});await bridge.server.connect(a);await client.connect(b);
 try{
  let outcome;try{outcome={result:await client.callTool({name:'dock_prepare',arguments:{intent:'open_package',package_path:path}})}}catch(error){outcome={error:{name:error.name,message:error.message}}}
  const first=f.events.filter(e=>e.event==='native-prepare-dispatched'),geometry=f.events.filter(e=>e.event==='geometry-dispatched');
  await writeFile(join(process.env.REVIEW_RESULTS_DIR??directory,scenario+'.json'),JSON.stringify({fixture:true,module:process.env.REVIEW_BRIDGE_PIN,binding,events:f.events,outcome,workspaceReady:session.metadata.workspaceReady===true,workspacePreparation:session.metadata.workspacePreparation,Page:'double; no native Loginom; delayed response intentionally tests post-await admission independently of external timer'},null,2)+'\n');
  assert.equal(first.length,1);
  if(['import-expired-response','import-changed-binding'].includes(scenario))assert.equal(geometry.length,0,'changed/expired Import authority must refuse the next Page dispatch');
  else if(['import-expired-geometry','import-changed-geometry'].includes(scenario)){assert.equal(geometry.length,1);assert.equal(session.metadata.workspaceReady,false)}
  else{
   assert.equal(geometry.length,1);assert.equal(session.metadata.workspaceReady,true);
   if(scenario==='ordinary-timely')assert.equal(geometry[0].timeout,15000);
   else assert.ok(geometry[0].timeout<=binding.expires-geometry[0].at+2,'Import geometry transport must consume only the original remaining deadline');
  }
 if(!['import-timely','ordinary-timely'].includes(scenario)){assert.equal(session.metadata.workspaceReady,false);assert.equal(session.metadata.workspacePreparation.effect_possible,true);assert.equal(session.metadata.workspacePreparation.state.created_draft,true);assert.equal(session.metadata.workspacePreparation.admission_failed,true);assert.equal(f.events.includes('release-uploads'),false)}
 }finally{await client.close();await rm(directory,{recursive:true,force:true})}
});
