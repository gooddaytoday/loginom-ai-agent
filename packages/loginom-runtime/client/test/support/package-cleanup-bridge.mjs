import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client as AgentClient} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import * as executor from '../../lib/executor.mjs';
import * as workspace from '../../lib/workspace.mjs';
import {createBundledSkillFixture} from './bundled-skill-fixture.mjs';
import {createActionCatalogFixture} from './action-catalog-fixture.mjs';

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
  async callTool(request){
    if(!this.browser){
      assert.equal(request.name,'read');
      const text=this.f.catalog.files.get(request.arguments.uris[0]);assert.equal(typeof text,'string');
      return {content:[{type:'text',text}]};
    }
    const code=request.arguments.code;
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
      if(this.f.scenario==='product-native-error')throw Error('native response lost');
      if(this.f.scenario==='product-native-malformed')return {content:[{type:'text',text:'invalid native receipt'}]};
      value={version:1,session_id:'own-session',document_id:'own-doc',status:this.f.scenario.endsWith('native-blocked')?'BLOCKED':'SUCCEEDED',package_closed:!this.f.scenario.endsWith('native-blocked'),
        logged_out:!this.f.scenario.endsWith('native-blocked'),account:'test-2',package_path:path,unsaved_changes_discarded:false,packages_before:1,packages_after:0,reason:null};
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
mock.module(new URL('../../lib/executor.mjs',import.meta.url).href,{namedExports:{...executor,createActionRuntime:()=>{
  const f=current;return {tools:[],describe:()=>({actions:[],node_types:[]}),assertPreparationAllowed(){if(f.busy)throw Error('busy');},hasUnsettledWork:()=>f.unsettled || (f.scenario==='product-gate-unsettled' && ++f.workChecks>1),
    run:async(key,parameters,{operationId})=>{f.saves++;return {status:'SUCCEEDED',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}};},
  };
}}});
const {createBridge}=await import('../../lib/bridge.mjs');

for(const scenario of ['success','unprepared','no-save','native-blocked','busy','dirty-after-save','state-unavailable','product-success','product-unsettled','product-gate-unsettled','product-native-blocked','product-evidence-directory','product-journal-directory','product-no-save','product-multiple-paths','product-busy','product-native-error','product-native-malformed'])test('isolated shutdown lifecycle: '+scenario,async t=>{
  const directory=await mkdtemp(join(tmpdir(),'cleanup-bridge-'));
  const resources=await createBundledSkillFixture(t),catalog=await createActionCatalogFixture(target);
  const f=current={scenario,events:[],busy:false,saves:0,catalog};
  const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
    metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
    artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads');}}};
  let bridge,client;
  try{
    bridge=await createBridge({resources:resources.resources,actionManifestUri:catalog.manifestUri,actionManifestSha256:catalog.manifestSha256,
      mode:'executor-replay',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
      loginomUrl:'http://loginom.invalid/app',replayBootstrap:!scenario.startsWith('product-'),replayLoginUser:scenario.startsWith('product-')?null:'test-2',...(scenario.startsWith('product-')?{resultProfile:'user-v1'}:{acceptanceCleanupPackage:path})},session);
    client=new AgentClient({name:'test',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
    if(scenario!=='unprepared'){
      const prep=await client.callTool({name:'dock_prepare',arguments:{}});assert.notEqual(prep.isError,true,JSON.stringify(prep));
      if(!scenario.endsWith('no-save')){
        const saved=await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'own-save'}});
        const values=saved.content.filter(c=>c.type==='text').map(c=>{try{return JSON.parse(c.text);}catch{return {};}});
        assert.equal(values[0].status,'SUCCEEDED');if(!scenario.startsWith('product-'))assert.deepEqual(values[0].output,{package_ref:{path}});
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
    if(scenario==='product-multiple-paths'){
      const second=await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path:'/test-2/packages/second.lgp'},operation_id:'own-save-2'}});
      assert.notEqual(second.isError,true,JSON.stringify(second));
    }
    f.busy=scenario.endsWith('busy');f.unsettled=scenario==='product-unsettled';f.workChecks=0;
    if(scenario==='product-evidence-directory')await mkdir(join(directory,'package-cleanup.json'));
    if(scenario==='product-journal-directory'){
      await rm(join(directory,'execution-events.jsonl'));await mkdir(join(directory,'execution-events.jsonl'));
    }
    const first=bridge.close();assert.equal(bridge.close(),first);const result=await first;
    if(['product-evidence-directory','product-journal-directory'].includes(scenario)){
      assert.equal(result.package_cleanup.status,'BLOCKED');assert.equal(result.package_cleanup.reason,'CLEANUP_EVIDENCE_UNCONFIRMED');
      assert.equal(result.browser_transport_closed,true);assert.equal(f.events.includes('browser-close'),true);return;
    }
    if(['product-no-save','product-multiple-paths'].includes(scenario)){
      assert.equal(result.package_cleanup,undefined);assert.equal(result.browser_transport_closed,true);
      assert.equal(f.events.includes('package-cleanup'),false);
      await assert.rejects(readFile(join(directory,'package-cleanup.json'),'utf8'),{code:'ENOENT'});return;
    }
    const receipt=JSON.parse(await readFile(join(directory,'package-cleanup.json'),'utf8'));
    if(['product-native-blocked','product-native-error','product-native-malformed'].includes(scenario)){
      assert.equal(receipt.status,'BLOCKED');assert.equal(result.package_cleanup.status,'BLOCKED');
      assert.equal(result.browser_transport_closed,true);assert.equal(f.events.includes('package-cleanup'),true);return;
    }
    if(['product-unsettled','product-gate-unsettled','product-busy'].includes(scenario)){
      assert.equal(receipt.status,'BLOCKED');assert.equal(result.browser_transport_closed,true);
      assert.equal(f.events.includes('package-cleanup'),false);return;
    }
    if(['success','unprepared','dirty-after-save','state-unavailable','product-success'].includes(scenario)){
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
    assert.equal(f.events.filter(e=>e==='package-cleanup').length,['success','native-blocked','dirty-after-save','state-unavailable','product-success'].includes(scenario)?1:0);
  }finally{try{await client?.close();await bridge?.close();}finally{await rm(directory,{recursive:true,force:true});}}
});
