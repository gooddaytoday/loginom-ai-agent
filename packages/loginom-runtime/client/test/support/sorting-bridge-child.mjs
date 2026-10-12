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


import vm from 'node:vm';
import {mkdir,writeFile} from 'node:fs/promises';
import {makePackageCleanupCode} from '../../lib/package-cleanup.mjs';
const options = {sessionId:'own-session', documentId:'own-doc', account:'test-2',
  packagePath:'/test-2/packages/result.lgp', loginomUrl:'http://loginom.invalid/app/?testable=true',
  loginomBuild:'7.4.2', tabTid:'own-tab', timeoutMs:100};

// Run the serialized browser body. Replace only the external Loginom and UI,
// retaining the actual guards, async close, prompt handling and logout order.
function nativeFixture(overrides = {}) {
  const events = [], state = {account:'test-2', path:options.packagePath, modified:false, running:false,
    count:1, tab:true, dialog:false, loggedOut:false, readonly:false, closeResult:true, ...overrides};
  const node = {DisplayName:'result',get PackageFileName(){return state.path;}, get ReadOnly(){return state.readonly;},
    Package:{}, HasRunningNodes:() => state.running};
  const m = {PackageNodes:{get Count(){return state.count;}, Items:() => node}, HasRunningNodes:() => state.running,
    FServerConnection:{get UserName(){return state.account;}, Connected:true, Session:{IsPackageModified:async () => {
      events.push('modified-read'); if (state.racePath) state.path = state.racePath; if(state.raceReadOnly!==undefined)state.readonly=state.raceReadOnly; return state.modified;
    }}}, async ClosePackage(target, suppressEvents, processAfterCall) {
      events.push('close'); assert.equal(target,node); assert.equal(suppressEvents,false); assert.equal(processAfterCall,true);
      if (state.closePrompt || state.modified) { state.dialog=true; return new Promise(resolve => {
        state.confirm=()=>{state.count=0;state.tab=false;state.dialog=false;resolve(true);};
      }); }
      if (state.closeThrows) throw Error('upstream private failure');
      if (state.closeResult) { state.count=0; state.tab=false; }
      return state.closeResult;
    }};
  const dialog = {getBoundingClientRect:() => ({width:10,height:10})};
  const tab={getAttribute:()=>state.foreignTab?'foreign-tab':'own-tab',getBoundingClientRect:()=>({width:10,height:10})};
  const doc = {querySelectorAll:selector => selector==='[data-tid]'?(state.tab?[tab]:[]):state.dialog?[dialog]:[]};
  const context = vm.createContext({document:doc, location:{origin:'http://loginom.invalid'},
    getComputedStyle:() => ({visibility:'visible'}), bg:{app:{Version:'7.4.2', Application:{FInstance:{FMainForm:{FMapTree:m}}}}}});
  vm.runInContext(`globalThis.__loginomDockPreparationV1={document,id:'own-doc',receipts:new Map([['prepare',{request:JSON.stringify({session:'own-session'})}]])}`,context);
  const locator = query => ({
    locator:() => locator(query+' input'),
    async waitFor() {
      events.push(query.includes('LoginForm') ? 'login-visible' : 'tab-detached');
      if (query.includes('LoginForm') ? !state.loggedOut : state.tab) throw Error('UI wait failed');
    }, async click() {
      if (query.includes('tlb;no')) {events.push('discard');state.confirm();}
      else if (query.includes('btnLogOut')) { events.push('logout'); state.loggedOut=true; }
      else events.push('avatar');
    }, async count(){return state.dialog?1:0;},
    async innerText(){return query.includes('cnt;cnt;cmp')?(state.prompt??'Сохранить изменения в пакете "result"?'):state.account;},
    async isVisible(){return !state.loggedOut;},
  });
  const page = {locator,
    async evaluate(fn,arg){return vm.runInContext('('+fn.toString()+')',context)(arg);},
    async waitForFunction(fn,arg){for(let i=0;i<8;i++){if(await this.evaluate(fn,arg))return;await Promise.resolve();}throw Error('timeout');},
  };
  return {state,events,context, execute:code=>vm.runInThisContext('('+code+')')(page), run:changed => vm.runInThisContext('('+makePackageCleanupCode({...options,...changed})+')')(page)};
}


for(const scenario of ['success','journal-refusal','capture-refused','native-blocked','pending'])test('Sorting bridge '+scenario+'; services and Page are doubles, filesystem/native close functions are real',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'sorting-bridge-'));
 const binding={revision:1,harness:'sorting-before-close-v1',owner:'o',run:'r',lease:'o:r',generation:1,chat:'c',admission:'a',session:'own-session',account:'test-2',packagePath:path,expires:Date.now()+600000};
 const f=current={scenario,events:[],saves:0,nativeReceipts:[],native:nativeFixture(),ordinary:{status:'SUCCEEDED',cleanup_complete:true,configuration:{readback:{kind:'sorting'}},execution:{status:'completed'}}};
 const session={directory,metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads')}}};
 let calls=0;const harness=async({identity,ordinary})=>{calls++;assert.equal(ordinary.configuration.readback.kind,'sorting');f.events.push('capture');if(scenario==='capture-refused')throw 0;return {...identity,settings_applied:false,readonly:true,capture_complete:true}};
 const bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,loginomUrl:'http://loginom.invalid/app/?testable=true',acceptanceCleanupPackage:path},session,{acceptanceCapture:{binding,harness}});
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new AgentClient({name:'test',version:'1'},{capabilities:{}});await bridge.server.connect(a);await client.connect(b);
 try{
 await client.callTool({name:'dock_prepare',arguments:{}});
 await client.callTool({name:'dock_node_status',arguments:{operation_id:'ordinary'}});
 await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'save'}});
 if(scenario==='pending')f.busy=true;
 if(scenario==='native-blocked')f.native.state.modified=true;
 if(scenario==='journal-refusal')await mkdir(join(directory,'acceptance-capture.json'));
 if(scenario==='success') {const r=await bridge.captureAcceptance();assert.equal(r.cleanupComplete,true);assert.equal(calls,1);assert.equal(JSON.parse(await readFile(join(directory,'acceptance-capture.json'),'utf8')).binding.run,'r');assert.equal(f.native.events.filter(x=>x==='close').length,1);assert.equal(f.native.events.filter(x=>x==='logout').length,1)}
 else {
 await assert.rejects(()=>bridge.captureAcceptance());assert.equal(f.events.includes('browser-close'),false);
 if(scenario==='pending')assert.equal(calls,0);
 if(scenario==='capture-refused'){assert.equal(JSON.parse(await readFile(join(directory,'acceptance-capture-failure.json'),'utf8')).rejection.value,0);await assert.rejects(()=>bridge.close(),e=>e===0)}
 if(scenario==='journal-refusal'){assert.equal(f.native.events.includes('close'),false);await rm(join(directory,'acceptance-capture.json'),{recursive:true});const r=await bridge.close();assert.equal(r.browser_transport_closed,true);assert.equal(calls,1);assert.equal(f.native.events.filter(x=>x==='close').length,1)}
 }
 await assert.rejects(()=>bridge.captureAcceptance());
 }finally{await client.close();await rm(directory,{recursive:true,force:true})}
});
