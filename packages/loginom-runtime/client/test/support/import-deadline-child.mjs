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
for(const expired of [false,true])test('Import allowed preparation rechecks deadline after awaited skill '+expired,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'review-import-deadline-'));
 let release,entered;const seen=new Promise(r=>entered=r);
 const binding={revision:1,harness:'import-before-configure-v1',owner:'o',run:'r',lease:'o:r',generation:1,chat:'c',admission:'a',session:'own-session',account:'test-2',packagePath:path,expires:Date.now()+600};
 const f=current={scenario:'deadline',events:[],saves:0,waitSkill:new Promise(r=>release=r),skillEntered:entered};
 const session={directory,metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads')}}};
 const bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,loginomUrl:'http://loginom.invalid/app/?testable=true',acceptanceCleanupPackage:path},session,{acceptanceCapture:{binding,harness:async()=>{throw Error('capture not reached')}}});
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new AgentClient({name:'review',version:'1'},{capabilities:{}});await bridge.server.connect(a);await client.connect(b);
 try{
  const work=client.callTool({name:'dock_prepare',arguments:{intent:'open_package',package_path:path}}).then(result=>({result}),error=>({error:{name:error.name,message:error.message}}));
  await Promise.race([seen,new Promise((_,reject)=>setTimeout(()=>reject(Error('FIXTURE_SKILL_NOT_REACHED')),1500))]);
  if(expired)await new Promise(r=>setTimeout(r,Math.max(1,binding.expires-Date.now()+30)));
  release();const outcome=await work;
  const dispatch=f.events.filter(e=>e.event==='native-prepare-dispatched');
  const evidence={fixture:true,binding,outcome,events:f.events,native_dispatches:dispatch.length,workspaceReady:session.metadata.workspaceReady===true,Page:'double; no native Loginom',deadline_mutated:false};
  await writeFile(join(process.env.REVIEW_RESULTS_DIR,'awaited-deadline-'+expired+'.json'),JSON.stringify(evidence,null,2)+'\n');
  assert.equal(dispatch.length,expired?0:1,'Expired Import deadline must refuse before Page preparation dispatch');
  if(!expired){assert.equal(session.metadata.workspaceReady,true);assert.equal(dispatch[0].helper_absolute_deadline,binding.expires);assert.ok(dispatch[0].helper_timeout_ms>0&&dispatch[0].helper_timeout_ms<=600);assert.ok(dispatch[0].transport_timeout_ms>0&&dispatch[0].transport_timeout_ms<=binding.expires-dispatch[0].at+2)}
 }finally{release();await client.close();await rm(directory,{recursive:true,force:true})}
});

for(const expired of [false,true])test('Import queued preparation rechecks deadline inside existing serial gate '+expired,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'review-import-serial-deadline-'));
 let releaseObservation,observationEntered,skillEntered;
 const observed=new Promise(r=>observationEntered=r),skill=new Promise(r=>skillEntered=r);
 const binding={revision:1,harness:'import-before-configure-v1',owner:'o',run:'r',lease:'o:r',generation:1,chat:'c',admission:'a',session:'own-session',account:'test-2',packagePath:path,expires:Date.now()+600};
 const f=current={scenario:'serial-deadline',events:[],saves:0,holdObservation:new Promise(r=>releaseObservation=r),observationEntered,waitSkill:Promise.resolve(),skillEntered};
 const session={directory,metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads')}}};
 const bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,loginomUrl:'http://loginom.invalid/app/?testable=true',acceptanceCleanupPackage:path},session,{acceptanceCapture:{binding,harness:async()=>{throw Error('capture not reached')}}});
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new AgentClient({name:'review',version:'1'},{capabilities:{}});await bridge.server.connect(a);await client.connect(b);
 const bounded=p=>Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(Error('FIXTURE_QUEUE_NOT_REACHED')),1500))]);
 try{
  const blocker=client.callTool({name:'dock_workspace_observe',arguments:{scope:'bootstrap'}}).then(()=>({ok:true}),error=>({error:error.message}));await bounded(observed);
  const work=client.callTool({name:'dock_prepare',arguments:{intent:'open_package',package_path:path}}).then(result=>({ok:true,isError:result.isError===true}),error=>({error:error.message}));await bounded(skill);
  assert.equal(f.events.filter(e=>e.event==='native-prepare-dispatched').length,0,'native preparation waits behind the real serial gate');
  if(expired)await new Promise(r=>setTimeout(r,Math.max(1,binding.expires-Date.now()+30)));
  releaseObservation();await blocker;const outcome=await work;const dispatch=f.events.filter(e=>e.event==='native-prepare-dispatched');
  await writeFile(join(process.env.REVIEW_RESULTS_DIR,'serial-deadline-'+expired+'.json'),JSON.stringify({fixture:true,binding,events:f.events,outcome,native_dispatches:dispatch.length,workspaceReady:session.metadata.workspaceReady===true,Page:'double; no native Loginom',deadline_mutated:false},null,2)+'\n');
  assert.equal(dispatch.length,expired?0:1,'Expired original deadline must stop queued native preparation before dispatch');
 }finally{releaseObservation();await client.close();await rm(directory,{recursive:true,force:true})}
});

for(const field of ['session','run','lease','account','packagePath','expires'])test('Import refuses changed retained binding after await: '+field,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'import-binding-deadline-'));let release,entered;const seen=new Promise(r=>entered=r);
 const binding={revision:1,harness:'import-before-configure-v1',owner:'o',run:'r',lease:'o:r',generation:1,chat:'c',admission:'a',session:'own-session',account:'test-2',packagePath:path,expires:Date.now()+5000};
 const f=current={scenario:'binding-change',events:[],saves:0,waitSkill:new Promise(r=>release=r),skillEntered:entered};
 const session={directory,metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads')}}};
 const bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,loginomUrl:'http://loginom.invalid/app/?testable=true',acceptanceCleanupPackage:path},session,{acceptanceCapture:{binding,harness:async()=>{throw Error('capture not reached')}}});
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new AgentClient({name:'test',version:'1'},{capabilities:{}});await bridge.server.connect(a);await client.connect(b);
 try{const work=client.callTool({name:'dock_prepare',arguments:{intent:'open_package',package_path:path}}).catch(e=>e);await seen;binding[field]=field==='expires'?binding.expires+5000:'foreign';release();await work;assert.equal(f.events.some(e=>e.event==='native-prepare-dispatched'),false);assert.equal(f.events.includes('browser-close'),false);assert.equal(f.events.includes('release-uploads'),false)}
 finally{release();await client.close();await rm(directory,{recursive:true,force:true})}
});
