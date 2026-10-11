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
  const f=current;return {tools:[],describe:()=>({actions:[],node_types:[],available_node_types:[]}),assertPreparationAllowed(){if(f.busy||f.unknown)throw Error('busy');},
    hasUnsettledWork:()=>!!f.unknown,hasActiveWork:()=>!!f.busy,
    run:async(key,parameters,{operationId})=>{f.saves++;return {status:'SUCCEEDED',cleanup_complete:f.scenario!=='managed-unsettled-save',action_key:key,operation_id:operationId,output:{package_ref:{path:parameters.path}}};},
  };
}}});
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

// Appended to the published lifecycle fixture's setup. MCP services and action
// execution are doubles. The exact serialized native cleanup helper executes
// against the independent VM/Page fixture; real journal and receipt files are used.
for(const scenario of ['hybrid-success','hybrid-missing-tab','hybrid-foreign-tab','hybrid-journal-failure'])test(scenario,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'review-hybrid-cleanup-'));
 const f=current={scenario,events:[],busy:false,saves:0,nativeReceipts:[],
  native:nativeFixture(scenario==='hybrid-missing-tab'?{tab:false}:scenario==='hybrid-foreign-tab'?{foreignTab:true}:{})};
 const session={directory,browserCli:'/test/browser',browserRoot:'/test',browserConfig:'/test/config',
  metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},
  artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads');}}};
 let bridge,client;
 try {
  bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,
   loginomUrl:'http://loginom.invalid/app',replayBootstrap:false,replayLoginUser:null},session);
  client=new AgentClient({name:'test',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();await bridge.server.connect(b);await client.connect(a);
  assert.notEqual((await client.callTool({name:'dock_prepare',arguments:{}})).isError,true);
  assert.notEqual((await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'own-save'}})).isError,true);
  if(scenario==='hybrid-journal-failure'){
   const journal=join(directory,'execution-events.jsonl'),receiptPath=join(directory,'package-cleanup.json');
   await rm(journal);await mkdir(journal);
   await assert.rejects(bridge.close());
   const first=await readFile(receiptPath,'utf8');assert.equal(JSON.parse(first).status,'SUCCEEDED');
   assert.equal(f.events.includes('browser-close'),false);assert.equal(bridge.hasUnsettledWork(),true);
   await assert.rejects(client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'forbidden'}}),/only read-only diagnosis/);
   // Restore only this fixture's journal sink. Retry close on the SAME bridge.
   await rm(journal,{recursive:true});
   const retry=await bridge.close(),second=await readFile(receiptPath,'utf8');
   const diagnostic={scenario,first_receipt:JSON.parse(first),second_receipt:JSON.parse(second),
    retry,native_events:f.native.events,bridge_events:f.events,native_responses:f.nativeReceipts};
   await writeFile(join(directory,scenario+'.json'),JSON.stringify(diagnostic,null,2)+'\n');
   assert.equal(f.native.events.filter(x=>x==='close').length,1);
   assert.equal(f.native.events.filter(x=>x==='logout').length,1);
   assert.equal(second,first,'A failed journal write must not destroy the successful native cleanup receipt');
   assert.equal(retry.browser_transport_closed,true,'Retry persistence without repeating the completed native cleanup');
  } else {
   const result=await bridge.close(),receipt=JSON.parse(await readFile(join(directory,'package-cleanup.json'),'utf8'));
   await writeFile(join(directory,scenario+'.json'),JSON.stringify({scenario,result,receipt,native_events:f.native.events,bridge_events:f.events},null,2)+'\n');
   if(scenario==='hybrid-success'){
    assert.equal(result.browser_transport_closed,true);assert.equal(receipt.status,'SUCCEEDED');
    assert.equal(f.native.events.filter(x=>x==='close').length,1);assert.equal(f.native.events.filter(x=>x==='logout').length,1);
   }else{
    assert.equal(result.browser_transport_closed,false,'An absent bound tab must refuse before native close');
    assert.equal(f.native.events.includes('close'),false);
   }
  }
 }finally{await client?.close();await rm(directory,{recursive:true,force:true});}
});
