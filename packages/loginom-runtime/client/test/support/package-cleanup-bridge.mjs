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
      target,document_id:'own-doc',loginom_account:'test-2',created_draft:true,effect_possible:true,workflow_ref:{tab_tid:'own-tab',prefix:'own',workflow_id:'own-workflow',navigation_path:[]},package_ref:{path:null}};
    else if(code.includes('async function observeGeometry'))value={version:1,source:'prepare_same_browser_page',observed:{document_id:'own-doc'}};
    else if(code.includes('function readSavedPackageState')){
      this.f.events.push('saved-state');
      if(this.f.scenario==='state-unavailable')throw Error('Read response lost');
      value={version:1,session_id:'own-session',document_id:'own-doc',account:'test-2',package_path:path,
        modified:this.f.scenario==='dirty-after-save'&&this.f.saves===1,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
    }
    else if(code.includes('async function closeOwnedPackage')){
      this.f.events.push('package-cleanup');
      if(this.f.scenario==='lost-response')throw Error('Lost cleanup response');
      value={version:1,session_id:'own-session',document_id:'own-doc',status:this.f.scenario==='native-blocked'?'BLOCKED':'SUCCEEDED',package_closed:this.f.scenario!=='native-blocked',
        logged_out:this.f.scenario!=='native-blocked',account:'test-2',package_path:path,unsaved_changes_discarded:false,packages_before:1,packages_after:0,reason:null};
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
  const f=current;return {tools:[],describe:()=>({}),assertPreparationAllowed(){if(f.busy)throw Error('busy');},
    run:async(key,parameters,{operationId})=>{f.outcomes??=new Map(); if(f.outcomes.has(operationId))return f.outcomes.get(operationId);
      f.saves++;const outcome={status:'SUCCEEDED',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}};f.outcomes.set(operationId,outcome);return outcome;},
  };
}}});
const {createBridge}=await import('../../lib/bridge.mjs');

for(const scenario of ['success','unprepared','no-save','native-blocked','busy','dirty-after-save','state-unavailable'])test('isolated shutdown lifecycle: '+scenario,async()=>{
  const directory=await mkdtemp(join(tmpdir(),'cleanup-bridge-'));
  const f=current={scenario,events:[],busy:false,saves:0};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads');}}};
  let bridge,client;
  try{
    bridge=await createBridge({mode:'executor-replay',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
      loginomUrl:'http://loginom.invalid/app',replayBootstrap:true,replayLoginUser:'test-2',acceptanceCleanupPackage:path},session);
    client=new AgentClient({name:'test',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
    if(scenario!=='unprepared'){
      const prep=await client.callTool({name:'dock_prepare',arguments:{}});assert.notEqual(prep.isError,true,JSON.stringify(prep));
      if(scenario!=='no-save'){
        const saved=await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'own-save'}});
        const values=saved.content.filter(c=>c.type==='text').map(c=>{try{return JSON.parse(c.text);}catch{return {};}});
        assert.equal(values[0].status,'SUCCEEDED');assert.deepEqual(values[0].output,{package_ref:{path}});
        const advice=values.find(v=>v.kind==='dock_saved_package_state');assert.ok(advice);
        assert.equal(advice.modified,scenario==='state-unavailable'?null:scenario==='dirty-after-save');
        if(scenario==='dirty-after-save'){
          assert.equal(advice.next_step.arguments.action_key,'package.save_checkpoint');assert.equal(advice.next_step.arguments.parameters.path,path);
          const second=await client.callTool({name:advice.next_step.tool,arguments:{...advice.next_step.arguments,operation_id:'own-save-2'}});
          const clean=second.content.map(c=>{try{return JSON.parse(c.text);}catch{return {};}}).find(v=>v.kind==='dock_saved_package_state');
          assert.equal(clean.modified,false);assert.equal(clean.next_step,undefined);assert.equal(f.saves,2);
        }
      }
    }
    f.busy=scenario==='busy';
    const first=bridge.close();assert.equal(bridge.close(),first);const result=await first;
    const receipt=JSON.parse(await readFile(join(directory,'package-cleanup.json'),'utf8'));
    if(['success','unprepared','dirty-after-save','state-unavailable'].includes(scenario)){
      assert.equal(result.browser_transport_closed,true);assert.equal(result.clipboard_leases_retained,0);
      assert.equal(receipt.status,scenario!=='unprepared'?'SUCCEEDED':'SKIPPED_UNPREPARED');
      if(scenario!=='unprepared')assert.ok(f.events.indexOf('package-cleanup')<f.events.indexOf('browser-close'));
      else assert.equal(f.events.includes('package-cleanup'),false);
      assert.ok(f.events.indexOf('browser-close')<f.events.indexOf('release-uploads'));
    }else{
      assert.equal(result.browser_transport_closed,false);assert.equal(receipt.status,'BLOCKED');
      assert.equal(f.events.includes('browser-close'),false);assert.equal(f.events.includes('release-uploads'),false);
      assert.equal(f.events.includes('package-cleanup'),scenario==='native-blocked');
    }
    assert.equal(f.events.filter(e=>e==='package-cleanup').length,['success','native-blocked','dirty-after-save','state-unavailable'].includes(scenario)?1:0);
  }finally{await client?.close();await bridge?.close();await rm(directory,{recursive:true,force:true});}
});

for(const scenario of ['success','native-blocked','mutation-after-save','lost-response','cached-save-replay']) test('private completion through real bridge: '+scenario,async()=>{
  const directory=await mkdtemp(join(tmpdir(),'private-completion-bridge-'));
  const f=current={scenario,events:[],busy:false,saves:0};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){}}};
  let bridge,client;
  try{
    bridge=await createBridge({mode:'executor-replay',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
      loginomUrl:'http://loginom.invalid/app',replayBootstrap:true,replayLoginUser:'test-2',
      trustedAttempt:{attemptId:'attempt-fixture',generation:7,chat:'b'.repeat(64)}},session);
    client=new AgentClient({name:'test',version:'1'}); const [a,b]=InMemoryTransport.createLinkedPair(); await bridge.server.connect(b); await client.connect(a);
    const catalog=await client.listTools(); assert.equal(catalog.tools.some(tool=>/session.*finish|completion/.test(tool.name)),false);
    await client.callTool({name:'dock_prepare',arguments:{}});
    const save=()=>client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'own-save-'+f.saves}});
    await save();
    const binding=bridge.sessionCompletionOptions();
    assert.equal(binding.attemptId,'attempt-fixture');assert.equal(binding.generation,7);assert.equal(binding.account,'test-2');
    const request={completionId:'complete-private',binding};
    if(scenario==='cached-save-replay'){
      await client.callTool({name:'dock_prepare',arguments:{operation_id:'prepare-again'}});
      await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'own-save-0'}});
      assert.equal(f.saves,1,'cached save must not execute twice');
      assert.throws(()=>bridge.sessionCompletionOptions(),/LOGINOM_SESSION_SAVE_REQUIRED/);
      await assert.rejects(bridge.finishOwnSession(request),/LOGINOM_SESSION_SAVE_REQUIRED/);
      await save();request.binding=bridge.sessionCompletionOptions();
    }
    if(scenario==='mutation-after-save'){
      await save();
      await assert.rejects(bridge.finishOwnSession(request),/LOGINOM_SESSION_COMPLETION_CONFLICT/);
      assert.equal(f.events.includes('package-cleanup'),false);
      request.binding=bridge.sessionCompletionOptions();
    }
    const receipt=await bridge.finishOwnSession(request);
    assert.equal(receipt.status,scenario==='native-blocked'?'BLOCKED':scenario==='lost-response'?'UNKNOWN':'SUCCEEDED');
    assert.deepEqual(await bridge.finishOwnSession(request),receipt);
    assert.equal(f.events.filter(event=>event==='package-cleanup').length,1);
    assert.deepEqual(bridge.sessionCompletionStatus(request.completionId),receipt);
    assert.deepEqual(JSON.parse(await readFile(join(directory,'session-completion.json'),'utf8')),receipt);
    await assert.rejects(client.callTool({name:'dock_prepare',arguments:{}}),/LOGINOM_SESSION_COMPLETION_PENDING/);
  } finally {await client?.close();await bridge?.close();await rm(directory,{recursive:true,force:true});}
});
