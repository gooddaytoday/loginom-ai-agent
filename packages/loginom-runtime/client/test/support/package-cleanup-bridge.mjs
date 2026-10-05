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
import {Page,runtime} from './executor-fixture.mjs';

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
    requestFailure:error=>{
      f.failureMessages??=[];f.failureMessages.push(error.message);
      return {status:'NOT_APPLIED',operation_id:'refused-save',effect_possible:false,cleanup_complete:true};
    },
    run:async(key,parameters,{operationId})=>{
      // Keep the real executor's explicit-null validation authoritative.
      if(operationId===null)return runtime(new Page()).run(key,parameters,{operationId});
      operationId??='generated-save-id';
      if(f.throwOnce===operationId){f.throwOnce=null;throw Error('Invalid Save parameters');}
      if(f.returnOlderOnce===operationId){f.returnOlderOnce=null;return f.receipts.get('own-save');}
      if(f.refuseOnce===operationId){f.refuseOnce=null;return {status:'NOT_APPLIED',action_key:key,operation_id:operationId,effect_possible:false,cleanup_complete:true,output:{}};}
      if(f.receipts.has(operationId))return f.receipts.get(operationId);
      if(f.scenario==='failed-new-save'&&operationId==='failed-save')return {status:'NOT_APPLIED',action_key:key,operation_id:operationId,effect_possible:false,output:{}};
      f.saves++;f.path=parameters.path;
      const result={status:'SUCCEEDED',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}};
      f.receipts.set(operationId,result);return f.loseId===operationId?{...result,status:'AMBIGUOUS'}:result;
    },
    inspect:async({operationId})=>f.inspection??{status:'SUCCEEDED',action_key:'operation.inspect',operation_id:operationId,
      output:{state:'resolved',cleanup_confirmed:true,outcome:f.receipts.get(operationId)}},
  };
}}});
const {createBridge}=await import('../../lib/bridge.mjs');

for(const action_key of ['package.save_checkpoint','package.save_as'])
 test('Save rejects explicit null but permits an omitted ID: '+action_key,async()=>{
  const directory=await mkdtemp(join(tmpdir(),'cleanup-null-save-'));
  const f=current={scenario:'success',events:[],busy:false,saves:0,path,receipts:new Map()};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
   metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
   artifactStore:{list:()=>[],async releaseUploads(){}}};
  const bridge=await createBridge({mode:'executor-replay',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
   loginomUrl:'http://loginom.invalid/app',replayBootstrap:true,replayLoginUser:'test-2',closeSavedPackageOnShutdown:true},session);
  const client=new AgentClient({name:'null-save',version:'1'});
  try{
   const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
   await client.callTool({name:'dock_prepare',arguments:{}});
   for(let attempt=0;attempt<2;attempt++){
    const response=await client.callTool({name:'dock_action_run',arguments:{action_key,parameters:{path,conflict_policy:'replace'},operation_id:null}});
    const refusal=JSON.parse(response.content[0].text);
    assert.equal(refusal.status,'NOT_APPLIED');assert.equal(refusal.effect_possible,false);
    assert.match(f.failureMessages.at(-1),/operation_id must be a stable identifier/);
    assert.equal(f.saves,0);assert.equal(f.receipts.size,0);assert.equal(f.events.includes('saved-state'),false);
   }
   const response=await client.callTool({name:'dock_action_run',arguments:{action_key,parameters:{path,conflict_policy:'replace'}}});
   const saved=JSON.parse(response.content[0].text);
   assert.equal(saved.status,'SUCCEEDED');assert.match(saved.operation_id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
   assert.equal(f.saves,1);
   assert.equal((await bridge.close()).browser_transport_closed,true);
   const cleanup=JSON.parse(await readFile(join(directory,'saved-package-cleanup.json'),'utf8'));
   assert.equal(cleanup.status,'SUCCEEDED');assert.equal(cleanup.save_operation_id,saved.operation_id);
  }finally{await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
 });

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

for(const scenario of ['generated-id','reconciled-own','reconciled-older','reconciled-not-admitted','noeffect-retry','validation-retry','changed-document-reconciled',
 'foreign-id','wrong-path','wrong-action','unresolved-inspection','unclean-inspection','unknown-inspection'])
 test('normal shutdown binds only an admitted confirmed Save: '+scenario,async()=>{
  const directory=await mkdtemp(join(tmpdir(),'cleanup-save-admission-'));
  const f=current={scenario,events:[],busy:false,saves:0,path,receipts:new Map(),loseId:scenario==='generated-id'?null:'own-save'};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
   metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},artifactStore:{list:()=>[],async releaseUploads(){}}};
  const bridge=await createBridge({mode:'executor-replay',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
   loginomUrl:'http://loginom.invalid/app',replayBootstrap:true,replayLoginUser:'test-2',closeSavedPackageOnShutdown:true},session);
  const client=new AgentClient({name:'save-admission',version:'1'});
  try{
   const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
   await client.callTool({name:'dock_prepare',arguments:{}});
   const response=await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},
    ...(scenario==='generated-id'?{}:{operation_id:'own-save'})}});
   const save=JSON.parse(response.content[0].text);
   assert.equal(save.status,scenario==='generated-id'?'SUCCEEDED':'AMBIGUOUS');
   assert.equal(typeof save.operation_id,'string');
   if(scenario==='reconciled-older')
    await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_as',parameters:{path:secondPath},operation_id:'newer-save'}});
   if(['reconciled-not-admitted','noeffect-retry','validation-retry'].includes(scenario)){
    if(scenario==='reconciled-not-admitted')f.returnOlderOnce='deferred-save';
    if(scenario==='noeffect-retry')f.refuseOnce='deferred-save';
    if(scenario==='validation-retry')f.throwOnce='deferred-save';
    const args={action_key:'package.save_checkpoint',parameters:{path},operation_id:'deferred-save'};
    await client.callTool({name:'dock_action_run',arguments:args});
    await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_as',parameters:{path:secondPath},operation_id:'newer-save'}});
    await client.callTool({name:'dock_action_run',arguments:args});
   }
   if(scenario==='changed-document-reconciled')session.metadata.workspacePreparation.state.document_id='foreign-doc';
   if(scenario!=='generated-id'){
    const outcome=structuredClone(f.receipts.get('own-save'));
    if(['foreign-id','unknown-inspection'].includes(scenario))outcome.operation_id='foreign-save';
    if(scenario==='wrong-path')outcome.output.package_ref.path=secondPath;
    if(scenario==='wrong-action')outcome.action_key='package.save_as';
    f.inspection={status:'SUCCEEDED',action_key:'operation.inspect',operation_id:scenario==='unknown-inspection'?'foreign-save':'own-save',
     output:{state:scenario==='unresolved-inspection'?'pending':'resolved',cleanup_confirmed:scenario!=='unclean-inspection',outcome}};
    await client.callTool({name:'dock_operation_inspect',arguments:{operation_id:scenario==='unknown-inspection'?'foreign-save':'own-save'}});
   }
   const closed=await bridge.close();
   const cleanup=JSON.parse(await readFile(join(directory,'saved-package-cleanup.json'),'utf8'));
   const accepted=['generated-id','reconciled-own','reconciled-older','reconciled-not-admitted','noeffect-retry','validation-retry'].includes(scenario);
   assert.equal(closed.browser_transport_closed,accepted);
   assert.equal(cleanup.status,accepted?'SUCCEEDED':'BLOCKED');
   assert.equal(cleanup.save_operation_id,accepted?(scenario==='reconciled-older'?'newer-save'
    :['reconciled-not-admitted','noeffect-retry','validation-retry'].includes(scenario)?'deferred-save':save.operation_id):null);
   assert.equal(cleanup.package_path,accepted?(scenario==='reconciled-older'?secondPath:path):null);
   assert.equal(f.events.filter(event=>event==='package-cleanup').length,accepted?1:0);
   if(!accepted)assert.equal(closed.package_cleanup.reason,'CONFIRMED_SAVE_REQUIRED');
  }finally{await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
 });
