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
import {captureDraft} from '../../../src/acceptance/calculator-grouped-before-done-v1.mjs';
import {closePreparedWizard,wizardCloseBinding} from '../../lib/node-wizard-close.mjs';

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
  const f=current;return {tools:[],describe:()=>({actions:[],node_types:[],available_node_types:[]}),assertPreparationAllowed(){if(f.busy||f.unknown)throw Error('busy');},
    hasUnsettledWork:()=>!!f.unknown,hasActiveWork:()=>!!f.busy,
    run:async(key,parameters,{operationId})=>{f.saves++;return {status:'SUCCEEDED',cleanup_complete:f.scenario!=='managed-unsettled-save',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}};},
  };
}}});
const {createBridge}=await import('../../lib/bridge.mjs');


const scenarios=(process.env.CALCULATOR_CAPTURE_CASES?.split(',')??['success','no-binding','wrong-session','wrong-account','wrong-path','wrong-document','expired','pending','unknown','unsaved','cancel-missing','cancel-applied','identity-after','receipt-write','falsy-false','falsy-zero','falsy-empty','falsy-null','falsy-undefined','resource-error','resource-falsy','resource-foreign','resource-count','resource-running']);
for(const scenario of scenarios)test('private capture transaction: '+scenario,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'capture-bridge-'));
 const f=current={scenario,events:[],busy:false,saves:0};
 const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
  metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
  artifactStore:{list:()=>[],async releaseUploads(){
   assert.equal(JSON.parse(await readFile(join(directory,'package-cleanup.json'),'utf8')).status,'SUCCEEDED');f.events.push('release-uploads');
  }}};
 const binding={revision:1,harness:'calculator-grouped-before-done-v1',owner:'actual-owner',run:'actual-run',lease:'actual-owner:actual-run',
  generation:7,chat:'actual-chat',account:'test-2',packagePath:path,admission:'once',session:'own-session',expires:Date.now()+60000};
 if(scenario==='wrong-session')binding.session='foreign';if(scenario==='wrong-account')binding.account='foreign';
 if(scenario==='wrong-path')binding.packagePath='/foreign/pkg.lgp';if(scenario==='expired')binding.expires=0;
 const falsy={'falsy-false':false,'falsy-zero':0,'falsy-empty':'','falsy-null':null,'falsy-undefined':undefined};
 const harness=async({identity,browser,record})=>{
  assert.ok(browser);f.events.push('capture-before');f.events.push('capture-after');
  if(scenario.startsWith('confirmed-refusal')||scenario.startsWith('foreign-cancel')){
   const owner={...identity,...Object.fromEntries(['owner','lease','run','generation','chat'].map(k=>[k,binding[k]])),workflow_id:'own-workflow',node_id:'own-node'};
   const primary={'confirmed-refusal-undefined':undefined,'confirmed-refusal-null':null,'confirmed-refusal-false':false,'confirmed-refusal-zero':0,'confirmed-refusal-empty':''};
   const rejection=scenario==='confirmed-refusal-error'?Error('original mapping',{cause:0}):scenario in primary?primary[scenario]:false;
   let closed=false;
   const draft={prepared_node_context:{...owner,verified:true,surface:'wizard'},
    wizard:{status:'observed',stage:'output_mapping',root_tid:'root',root_ref:'ref',owner_context:{status:'observed',node_id:owner.node_id}},
    ui:{elements:[{tid:'root;btnClose',ref:'close',allowed_actions:['click']}],dialogs:[],masks:[]},
    node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',
     target_fields:[{name:'Region',record_id:'target',excluded:false,source:{record_id:'source',field_id:'20'}}]}};
   const graph={prepared_node_context:{...draft.prepared_node_context,surface:'graph',locked:false},wizard:{status:'absent'},ui:{dialogs:[],masks:[],elements:[]}};
   const channel={observe:async({ready})=>{const s=closed?graph:draft;assert.equal(ready(s),true);return s;},
    perform:async({ready,initialObservation})=>{assert.equal(ready(initialObservation),true);f.events.push('draft-close');closed=true;}};
   return captureDraft({owner,current:()=>{},observe:async()=>draft,observeCancellation:async()=>draft,
    snapshot:async()=>{throw rejection;},exclude:async()=>{throw Error('unexpected exclusion');},
    cancel:s=>closePreparedWizard(channel,wizardCloseBinding(s)),record:async event=>{
     if(scenario==='foreign-cancel-node')event.cancellation.node_context={...event.cancellation.node_context,node_id:'foreign'};
     if(scenario==='foreign-cancel-owner')event.owner={...event.owner,lease:'foreign'};
     if(scenario==='foreign-cancel-flag')event.cancellation={...event.cancellation,draft_discarded:false};
     await record(event);
     if(scenario==='confirmed-refusal-drift')session.metadata.workspacePreparation.state.document_id='foreign';
    }});
  }
  if(scenario in falsy)throw falsy[scenario];
  if(scenario==='identity-after')session.metadata.workspacePreparation.state.document_id='foreign';
  f.events.push('verified-cancel');await record({event:'fixture_cancel',identity});
  return {...identity,settings_applied:scenario==='cancel-applied',cancel_verified:scenario!=='cancel-missing'};
 };
 let bridge,client;
 try{
  bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
   loginomUrl:'http://loginom.invalid/app',replayBootstrap:false,replayLoginUser:null},session,
   {acceptanceCapture:scenario==='no-binding'?undefined:{binding,harness,resourceReader:{async read(){
     f.events.push('resource-read');
     if(scenario==='resource-error')throw Error('resource', {cause:0});
     if(scenario==='resource-falsy')throw 0;
     return {scope:'current-owned-session',account:scenario==='resource-foreign'?'foreign':binding.account,
       package_count:scenario==='resource-count'?2:1,running:scenario==='resource-running'};
   }}}});
  client=new AgentClient({name:'test',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
  assert.equal(bridge.catalog.tools.some(t=>t.name==='acceptance.capture'),false);
  assert.notEqual((await client.callTool({name:'dock_prepare',arguments:{}})).isError,true);
  if(scenario!=='unsaved')await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'own-save'}});
  if(scenario==='wrong-document')session.metadata.workspacePreparation.state.document_id='foreign';
  f.busy=scenario==='pending';f.unknown=scenario==='unknown';
  if(scenario==='receipt-write')await (await import('node:fs/promises')).mkdir(join(directory,'acceptance-capture.json'));
  const result=await bridge.captureAcceptance().then(value=>({ok:true,value}),error=>({ok:false,error}));
  if(scenario==='success'){
   assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.value.cleanupComplete,true);
   assert.ok(f.events.indexOf('verified-cancel')<f.events.indexOf('package-cleanup'));
   assert.ok(f.events.indexOf('package-cleanup')<f.events.indexOf('browser-close'));
   assert.ok(f.events.indexOf('browser-close')<f.events.indexOf('release-uploads'));
   assert.equal(JSON.parse(await readFile(join(directory,'acceptance-capture.json'),'utf8')).binding.lease,binding.lease);
   await assert.rejects(bridge.captureAcceptance());
  }else if(scenario.startsWith('confirmed-refusal')||scenario.startsWith('foreign-cancel')){
   assert.equal(result.ok,false);
   if(scenario==='confirmed-refusal-error'){assert.equal(result.error.message,'original mapping');assert.equal(result.error.cause,0);}
   else if(scenario.startsWith('confirmed-refusal'))assert.equal(result.error,{'confirmed-refusal-undefined':undefined,'confirmed-refusal-null':null,'confirmed-refusal-false':false,'confirmed-refusal-zero':0,'confirmed-refusal-empty':'','confirmed-refusal-drift':false}[scenario]);
   await assert.rejects(bridge.captureAcceptance());
   const close=await bridge.close().then(value=>({ok:true,value}),error=>({ok:false,error}));
   const confirmed=scenario.startsWith('confirmed-refusal')&&scenario!=='confirmed-refusal-drift';
   assert.equal(close.ok,confirmed,JSON.stringify(close));
   assert.equal(f.events.includes('package-cleanup'),confirmed);
   assert.equal(f.events.includes('release-uploads'),confirmed);
   assert.equal(f.events.filter(e=>e==='capture-before').length,1);assert.equal(f.events.filter(e=>e==='draft-close').length,1);
   if(confirmed){assert.ok(f.events.indexOf('package-cleanup')<f.events.indexOf('browser-close'));assert.ok(f.events.indexOf('browser-close')<f.events.indexOf('release-uploads'));}
  }else{
   assert.equal(result.ok,false);assert.equal(f.events.includes('browser-close'),false);assert.equal(f.events.includes('release-uploads'),false);
   if(scenario in falsy){
    assert.equal(result.error,falsy[scenario]);const close=await bridge.close().then(()=>({ok:true}),error=>({ok:false,error}));
    assert.equal(close.ok,false);assert.equal(close.error,falsy[scenario]);assert.equal(f.events.includes('package-cleanup'),false);
    await assert.rejects(client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'replay'}}));
   }
   if(['no-binding','wrong-session','wrong-account','wrong-path','wrong-document','expired','pending','unknown','unsaved',
     'resource-error','resource-falsy','resource-foreign','resource-count','resource-running'].includes(scenario))
    assert.equal(f.events.includes('capture-before'),false);
  }
 }finally{await client?.close();await rm(directory,{recursive:true,force:true});}
});
