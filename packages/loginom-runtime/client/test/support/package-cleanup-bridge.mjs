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
const secondPath='/test-2/packages/other.lgp';
class ExternalClient {
  constructor(identity){this.browser=identity.name==='loginom-dock-browser';this.f=current;}
  async connect(t){this.transport=t;}
  async close(){this.f.events.push(this.browser?'browser-close':'remote-close');this.transport?.onclose?.();}
  async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]};}
  async callTool({arguments:{code}}){
    let value;
    if(code.includes('async function prepareWorkspace'))value={status:'READY',authenticated:true,target_verified:true,
      target,document_id:'own-doc',created_draft:true,effect_possible:true,workflow_ref:{tab_tid:'own-tab',prefix:'own',workflow_id:'own-workflow',navigation_path:[]},package_ref:{path:null}};
    else if(code.includes('async function observeGeometry'))value={version:1,source:'prepare_same_browser_page',observed:{document_id:'own-doc'}};
    else if(code.includes('function readSavedPackageState')){
      this.f.events.push('saved-state');
      if(this.f.scenario==='state-unavailable')throw Error('Read response lost');
      value={version:1,session_id:'own-session',document_id:'own-doc',account:'test-2',package_path:this.f.path,
        modified:this.f.scenario==='dirty-after-save'&&this.f.saves===1,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
    }
    else if(code.includes('async function closeOwnedPackage')){
      this.f.events.push('package-cleanup');
      const options=JSON.parse(code.slice(code.lastIndexOf(')(page,')+7,-1));
      this.f.cleanupOptions=options;
      value={version:1,session_id:'own-session',document_id:'own-doc',status:this.f.scenario==='native-blocked'?'BLOCKED':'SUCCEEDED',package_closed:this.f.scenario!=='native-blocked',
        logged_out:this.f.scenario!=='native-blocked',account:'test-2',package_path:this.f.path,unsaved_changes_discarded:false,packages_before:1,packages_after:0,reason:null};
      if(this.f.scenario==='foreign-path')value.package_path=secondPath;
      if(this.f.scenario==='foreign-account')value.account='foreign';
      if(this.f.scenario==='discard-receipt')value.unsaved_changes_discarded=true;
      if(this.f.scenario==='mutated-after-save')value={...value,status:'BLOCKED',package_closed:false,logged_out:false,reason:'UNSAVED_CHANGES'};
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
  const f=current;return {tools:executor.executorTools,describe:()=>({}),assertPreparationAllowed(){if(f.busy)throw Error('busy');},
    run:async(key,parameters,{operationId})=>{
      if(f.receipts.has(operationId))return f.receipts.get(operationId);
      if(f.scenario==='failed-new-save'&&operationId==='failed-save')return {status:'NOT_APPLIED',action_key:key,operation_id:operationId,effect_possible:false,output:{}};
      f.saves++;f.path=parameters.path;
      const result={status:'SUCCEEDED',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}};
      f.receipts.set(operationId,result);return result;
    },
    inspect:async({operationId})=>f.receipts.get(operationId),
  };
}}});
const {createBridge}=await import('../../lib/bridge.mjs');

const cases=['success','unprepared','no-save','native-blocked','busy','dirty-after-save','state-unavailable'];
for(const mode of ['isolated','normal'])for(const scenario of mode==='isolated'?cases:[...cases,
  'latest-same-path','older-save-retry','inspected-older-save','failed-new-save','mutated-after-save',
  'foreign-path','foreign-account','discard-receipt','changed-document'])test(mode+' shutdown lifecycle: '+scenario,async()=>{
  const directory=await mkdtemp(join(tmpdir(),'cleanup-bridge-'));
  const f=current={scenario,events:[],busy:false,saves:0,path,receipts:new Map()};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads');}}};
  let bridge,client;
  try{
    bridge=await createBridge({mode:'executor-replay',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
      loginomUrl:'http://loginom.invalid/app',replayBootstrap:true,replayLoginUser:'test-2',
      ...(mode==='normal'?{closeSavedPackageOnShutdown:true}:{acceptanceCleanupPackage:path})},session);
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
    let expectedSave=scenario==='dirty-after-save'?'own-save-2':'own-save';
    if(['latest-same-path','older-save-retry','inspected-older-save'].includes(scenario)){
      const newer=await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_as',parameters:{path:secondPath},operation_id:'newer-save'}});
      assert.notEqual(newer.isError,true,JSON.stringify(newer));expectedSave='newer-save';
      if(scenario==='latest-same-path'){
        await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'latest-save'}});expectedSave='latest-save';
      }
      if(scenario==='older-save-retry')await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'own-save'}});
      if(scenario==='inspected-older-save')await client.callTool({name:'dock_operation_inspect',arguments:{operation_id:'own-save'}});
    }
    if(scenario==='failed-new-save')await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_as',parameters:{path:secondPath},operation_id:'failed-save'}});
    if(scenario==='changed-document')session.metadata.workspacePreparation.state.document_id='other-doc';
    f.busy=scenario==='busy';
    const first=bridge.close();assert.equal(bridge.close(),first);const result=await first;
    const receipt=JSON.parse(await readFile(join(directory,mode==='normal'?'saved-package-cleanup.json':'package-cleanup.json'),'utf8'));
    if(mode==='normal'){
      assert.equal(receipt.policy,'last_confirmed_own_save');
      assert.equal(receipt.package_path,scenario==='unprepared'||scenario==='no-save'?null:f.path);
      assert.equal(receipt.save_operation_id,scenario==='unprepared'||scenario==='no-save'?null:expectedSave);
      await assert.rejects(readFile(join(directory,'package-cleanup.json')),{code:'ENOENT'});
      const journal=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
      assert.equal(journal.filter(row=>row.event==='managed_saved_package_cleanup').length,1);
      assert.equal(journal.some(row=>row.event==='isolated_package_cleanup'),false);
    }
    if(['success','unprepared','dirty-after-save','state-unavailable','latest-same-path','older-save-retry','inspected-older-save','failed-new-save'].includes(scenario)){
      assert.equal(result.browser_transport_closed,true);assert.equal(result.clipboard_leases_retained,0);
      assert.equal(receipt.status,scenario!=='unprepared'?'SUCCEEDED':'SKIPPED_UNPREPARED');
      if(scenario!=='unprepared')assert.ok(f.events.indexOf('package-cleanup')<f.events.indexOf('browser-close'));
      else assert.equal(f.events.includes('package-cleanup'),false);
      assert.ok(f.events.indexOf('browser-close')<f.events.indexOf('release-uploads'));
    }else{
      assert.equal(result.browser_transport_closed,false);assert.equal(receipt.status,'BLOCKED');
      assert.equal(f.events.includes('browser-close'),false);assert.equal(f.events.includes('release-uploads'),false);
      assert.equal(f.events.includes('package-cleanup'),!['no-save','busy','changed-document'].includes(scenario));
    }
    assert.equal(f.events.filter(e=>e==='package-cleanup').length,['unprepared','no-save','busy','changed-document'].includes(scenario)?0:1);
    if(f.cleanupOptions){
      assert.equal(f.cleanupOptions.packagePath,f.path);assert.equal(f.cleanupOptions.diagnosticDiscard,false);
      assert.equal(f.cleanupOptions.diagnosticReadOnly,false);assert.equal(f.cleanupOptions.sessionId,'own-session');
      assert.equal(f.cleanupOptions.documentId,'own-doc');assert.equal(f.cleanupOptions.account,'test-2');
    }
  }finally{await client?.close();await bridge?.close();await rm(directory,{recursive:true,force:true});}
});
