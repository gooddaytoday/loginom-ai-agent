import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client as AgentClient} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import * as executor from '../../lib/executor.mjs';
import * as workspace from '../../lib/workspace.mjs';
import {createBundledSkillFixture} from './bundled-skill-fixture.mjs';
import {createActionCatalogFixture} from './action-catalog-fixture.mjs';

// T4 for saves: the action executor and external services are fixtures; the
// bridge owns the save-state reread, the lease and the recovery receipt.
const target={profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
const path='/test-2/packages/result.lgp';
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
      target,loginom_account:'test-2',document_id:'own-doc',created_draft:true,effect_possible:true,workflow_ref:{tab_tid:'own-tab',prefix:'own',workflow_id:'own-workflow',navigation_path:[]},package_ref:{path:null}};
    else if(code.includes('async function observeGeometry'))value={version:1,source:'prepare_same_browser_page',observed:{document_id:'own-doc'}};
    else if(code.includes('browser_recovery_page'))
      return {content:[{type:'text',text:JSON.stringify(JSON.stringify({kind:'browser_recovery_page',pages:1,origin:'http://loginom.invalid',document_id:'own-doc'}))}]};
    else if(code.includes('function readSavedPackageState')){
      // The first read after Save is lost; the recovery reread succeeds.
      if(f.stateReads++===0)throw Error('Read response lost');
      value={version:1,session_id:'own-session',document_id:'own-doc',account:'test-2',package_path:path,
        modified:f.modified,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
    } else throw Error('Unexpected browser code');
    return {content:[{type:'text',text:JSON.stringify(value)}]};
  }
}
class ExternalTransport{}
mock.module('@modelcontextprotocol/sdk/client/index.js',{namedExports:{Client:ExternalClient}});
mock.module('@modelcontextprotocol/sdk/client/stdio.js',{namedExports:{StdioClientTransport:ExternalTransport,getDefaultEnvironment:()=>({})}});
mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js',{namedExports:{StreamableHTTPClientTransport:ExternalTransport}});
mock.module(new URL('../../lib/workspace.mjs',import.meta.url).href,{namedExports:{...workspace,
  makeWorkspacePrepareCode:options=>workspace.makeWorkspacePrepareCode({...options,platform:'darwin'})}});
mock.module(new URL('../../lib/executor.mjs',import.meta.url).href,{namedExports:{...executor,createActionRuntime:()=>({
  tools:executor.executorTools,describe:()=>({actions:[],node_types:[]}),assertPreparationAllowed(){},hasUnsettledWork:()=>false,hasActiveWork:()=>false,
  run:async(key,parameters,{operationId})=>({status:'SUCCEEDED',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}}),
  browserRecoveryBasis(){throw Error('No browser recovery trigger for this operation');},
})}});
const {createBridge}=await import('../../lib/bridge.mjs');

for(const modified of [false,true])
test('a confirmed Save with an unreadable package state is recovered by a runtime reread: modified='+modified,async t=>{
  f.stateReads=0;f.modified=modified;
  const directory=await mkdtemp(join(tmpdir(),'recovery-save-bridge-'));
  const resources=await createBundledSkillFixture(t);f.catalog=await createActionCatalogFixture(target);
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){}}};
  const bridge=await createBridge({resources:resources.resources,actionManifestUri:f.catalog.manifestUri,actionManifestSha256:f.catalog.manifestSha256,
    mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
    loginomUrl:'http://loginom.invalid/app',replayBootstrap:false,replayLoginUser:null,browserRecovery:true},session,{browserTransport:new ExternalTransport()});
  const client=new AgentClient({name:'recovery-save',version:'1'});
  try{
    const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
    await client.callTool({name:'dock_prepare',arguments:{}});
    const saved=await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path,conflict_policy:'replace'},operation_id:'own-save'}});
    const advice=saved.content.map(c=>{try{return JSON.parse(c.text);}catch{return {};}}).find(v=>v.kind==='dock_saved_package_state');
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
    const journal=(await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    assert.ok(journal.some(e=>e.phase==='browser_recovery_receipt'&&e.receipt.id==='own-save:br-save'));
    const again=await client.callTool({name:'dock_browser_recovery',arguments:{action:'start',operation_id:'own-save'}});
    assert.equal(again.isError,true);
  }finally{await client.close();await bridge.close();await rm(directory,{recursive:true,force:true});}
});
