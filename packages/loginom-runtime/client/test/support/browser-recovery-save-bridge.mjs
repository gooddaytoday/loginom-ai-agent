import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client as AgentClient} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createExecutionJournal,journalCopy} from '../../lib/execution-journal.mjs';
import * as executor from '../../lib/executor.mjs';
import * as workspace from '../../lib/workspace.mjs';
import {createBundledSkillFixture} from './bundled-skill-fixture.mjs';
import {linkPage,runtime} from './executor-fixture.mjs';
import {createActionCatalogFixture} from './action-catalog-fixture.mjs';

// Exercise the production Save executor against a deterministic Loginom page.
// The bridge owns the save-state reread, the lease and the recovery receipt.
const target={profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
const path='/user/data/packages/result.lgp';
const f={stateReads:0,modified:false};
class ExternalClient {
  constructor(identity){this.browser=identity.name==='loginom-dock-browser';}
  async connect(t){this.transport=t;}
  async close(){this.transport?.onclose?.();}
  async listTools(){return {tools:[{name:this.browser?'browser_run_code_unsafe':'read',inputSchema:{type:'object'}}]};}
  async callTool(request){
    if(!this.browser)return {content:[{type:'text',text:f.catalog.files.get(request.arguments.uris[0])}]};
    const code=request.arguments.code;
    let value;
    if(code.includes('async function prepareWorkspace'))value={status:'READY',authenticated:true,target_verified:true,
      target,loginom_account:'user',document_id:'own-doc',created_draft:true,effect_possible:true,workflow_ref:{tab_tid:'own-tab',prefix:'own',workflow_id:'own-workflow',navigation_path:[]},package_ref:{path:null}};
    else if(code.includes('async function observeGeometry'))value={version:1,source:'prepare_same_browser_page',observed:{document_id:'own-doc'}};
    else if(code.includes('browser_recovery_page'))
      return {content:[{type:'text',text:JSON.stringify(JSON.stringify({kind:'browser_recovery_page',pages:1,origin:'http://loginom.invalid',document_id:'own-doc',tab_present:true}))}]};
    else if(code.includes('function readSavedPackageState')){
      // The first read after Save is lost; the recovery reread succeeds.
      if(f.stateReads++===0 && f.externalFailure)throw Error('Read response lost');
      value={version:1,session_id:'own-session',document_id:'own-doc',account:'user',package_path:f.page?.packagePath??path,
        modified:f.page?JSON.stringify(f.page.nodes)!==JSON.stringify(f.page.storage.get(f.page.packagePath).nodes):f.modified,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
    } else throw Error('Unexpected browser code');
    return {content:[{type:'text',text:JSON.stringify(value)}]};
  }
}
class ExternalTransport{}
mock.module(new URL('../../lib/execution-journal.mjs',import.meta.url).href,{namedExports:{journalCopy,createExecutionJournal:options=>{
  const record=createExecutionJournal(options);
  return (event,...args)=>f.markerFailure&&event.phase==='acceptance_fault_triggered'
    ?Promise.reject(Object.assign(Error('No space left'),{code:'ENOSPC'})):record(event,...args);
}}});
mock.module('@modelcontextprotocol/sdk/client/index.js',{namedExports:{Client:ExternalClient}});
mock.module('@modelcontextprotocol/sdk/client/stdio.js',{namedExports:{StdioClientTransport:ExternalTransport,getDefaultEnvironment:()=>({})}});
mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js',{namedExports:{StreamableHTTPClientTransport:ExternalTransport}});
mock.module(new URL('../../lib/workspace.mjs',import.meta.url).href,{namedExports:{...workspace,
  makeWorkspacePrepareCode:options=>workspace.makeWorkspacePrepareCode({...options,platform:'darwin'})}});
mock.module(new URL('../../lib/executor.mjs',import.meta.url).href,{namedExports:{...executor,createActionRuntime:()=>({
  tools:executor.executorTools,describe:()=>({actions:[],node_types:[],available_node_types:[]}),assertPreparationAllowed(){},hasUnsettledWork:()=>false,hasActiveWork:()=>false,async cleanupServerCache(){},closeArtifactDeliveries:async()=>{},
  run:async(key,parameters,{operationId})=>{
    if(f.page){
      const outcome=await f.engine.run(key,parameters,{operationId});
      f.saved=outcome;
      if(f.modified)f.page.addNode('Unsaved edit',0,0);
      return f.foreignReceipt?{...outcome,operation_id:'previous-save'}:outcome;
    }
    f.saved={status:'SUCCEEDED',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}};
    return f.lost?{...f.saved,status:'AMBIGUOUS',output:{}}:f.saved;
  },
  inspect:async({operationId})=>({status:'SUCCEEDED',action_key:'operation.inspect',operation_id:operationId,
    output:{state:'resolved',cleanup_confirmed:true,outcome:f.saved}}),
  browserRecoveryBasis(){throw Error('No browser recovery trigger for this operation');},
})}});
const {createBridge}=await import('../../lib/bridge.mjs');

for(const scenario of ['P5','external failure','foreign package','foreign receipt','marker write failure','control'])
test('a confirmed Save followed by an independent read: '+scenario,async t=>{
  const modified=scenario==='external failure';
  f.stateReads=0;f.modified=modified;f.lost=false;f.externalFailure=modified;
  f.foreignReceipt=scenario==='foreign receipt';f.markerFailure=scenario==='marker write failure';f.page=linkPage();f.engine=runtime(f.page);
  const saves=t.mock.method(f.page,'save');
  const directory=await mkdtemp(join(tmpdir(),'recovery-save-bridge-'));
  const resources=await createBundledSkillFixture(t);f.catalog=await createActionCatalogFixture(target);
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){}}};
  const bridge=await createBridge({resources:resources.resources,actionManifestUri:f.catalog.manifestUri,actionManifestSha256:f.catalog.manifestSha256,
    mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
    loginomUrl:'http://loginom.invalid/app',replayBootstrap:false,replayLoginUser:null,browserRecovery:true,
    acceptanceSaveReadPackage:scenario==='P5'||f.foreignReceipt||f.markerFailure?path:scenario==='foreign package'?'/user/other.lgp':undefined},session,{browserTransport:new ExternalTransport()});
  const client=new AgentClient({name:'recovery-save',version:'1'});
  try{
    const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
    await client.callTool({name:'dock_prepare',arguments:{}});
    const saved=await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path,conflict_policy:'replace'},operation_id:'own-save'}});
    const advice=saved.content.map(c=>{try{return JSON.parse(c.text);}catch{return {};}}).find(v=>v.kind==='dock_saved_package_state');
    assert.equal(saves.mock.callCount(),1);assert.ok(f.page.storage.has(path));
    if(scenario==='foreign package'||f.foreignReceipt||f.markerFailure||scenario==='control'){
      assert.equal(advice.modified,false);assert.equal(f.stateReads,1);return;
    }
    assert.equal(advice.state,'unavailable');
    assert.deepEqual(advice.next_step.arguments,{action:'start',operation_id:'own-save'});
    const started=await client.callTool({name:'dock_browser_recovery',arguments:{action:'start',operation_id:'own-save'}});
    assert.equal(started.structuredContent.phase,'browser',JSON.stringify(started));
    assert.equal(started.structuredContent.reason,'SAVE_STATE_UNCONFIRMED');
    const refused=await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path,conflict_policy:'replace'},operation_id:'other-save'}});
    assert.equal(refused.isError,true);
    const finished=await client.callTool({name:'dock_browser_recovery',arguments:{action:'finish',operation_id:'own-save',
      actions_performed:['Closed a notification over the scenario']}});
    const verification=finished.structuredContent.verification;
    assert.equal(finished.structuredContent.phase,'dock');
    assert.equal(verification.status,modified?'continuable':'completed');
    assert.equal(verification.state.modified,modified);
    assert.ok(verification.facts.includes(modified?'package_modified_after_save':'package_unmodified_after_save'));
    assert.deepEqual(verification.attested_by_model.actions_performed,['Closed a notification over the scenario']);
    if(scenario==='P5'){
      const inspected=await client.callTool({name:'dock_operation_inspect',arguments:{operation_id:'own-save'}});
      const state=inspected.content.filter(c=>c.text.startsWith('{')).map(c=>JSON.parse(c.text)).find(v=>v.kind==='dock_saved_package_state');
      assert.equal(state.modified,false);
    }
    const journal=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(saves.mock.callCount(),1);
    assert.equal(f.stateReads,2);
    assert.deepEqual(journal.filter(e=>e.phase==='acceptance_fault_triggered').map(e=>[e.condition,e.operation_id,e.package_path]),
      scenario==='P5'?[['P5','own-save',path]]:[]);
    assert.ok(journal.some(e=>e.phase==='browser_recovery_receipt'&&e.receipt.id==='own-save:br-save'));
    const again=await client.callTool({name:'dock_browser_recovery',arguments:{action:'start',operation_id:'own-save'}});
    assert.equal(again.isError,true);
  }finally{await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
});

test('inspection of an ambiguous Save delivers the original saved-package follow-up',async t=>{
  f.page=null;f.stateReads=1;f.modified=false;f.lost=true;
  const directory=await mkdtemp(join(tmpdir(),'reconciled-save-bridge-'));
  const resources=await createBundledSkillFixture(t);f.catalog=await createActionCatalogFixture(target);
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){}}};
  const bridge=await createBridge({resources:resources.resources,actionManifestUri:f.catalog.manifestUri,actionManifestSha256:f.catalog.manifestSha256,
    mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
    loginomUrl:'http://loginom.invalid/app',replayBootstrap:false,replayLoginUser:null,browserRecovery:true},session,{browserTransport:new ExternalTransport()});
  const client=new AgentClient({name:'reconciled-save',version:'1'});
  try{
    const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
    await client.callTool({name:'dock_prepare',arguments:{}});
    await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path,conflict_policy:'replace'},operation_id:'own-save'}});
    const inspected=await client.callTool({name:'dock_operation_inspect',arguments:{operation_id:'own-save'}});
    const blocks=inspected.content.map(c=>{try{return JSON.parse(c.text);}catch{return {};}});
    assert.equal(blocks[0].action_key,'operation.inspect');
    const state=blocks.find(v=>v.kind==='dock_saved_package_state');
    assert.equal(state?.save_operation_id,'own-save',JSON.stringify(inspected));
    assert.equal(state.package_path,path);assert.equal(state.modified,false);assert.equal(f.stateReads,2);
  }finally{await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
});
