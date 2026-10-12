import test, {mock,after} from 'node:test';
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

import * as nativeFs from 'node:fs/promises';
import * as nativeCallbackFs from 'node:fs';
import {pbkdf2} from 'node:crypto';
const fdKind=new Map(),owned=new Set();
const physical=fd=>{try{nativeCallbackFs.fstatSync(fd);return true}catch{return false}};
const failValues={error:Error('receipt primary',{cause:0}),undefined:undefined,null:null,false:false,zero:0,empty:''};
mock.module('node:fs',{defaultExport:{},namedExports:{...nativeCallbackFs,
 open(p,flags,mode,cb){const f=current;return nativeCallbackFs.open(p,flags,mode,(e,fd)=>{if(!e){owned.add(fd);fdKind.set(fd,p)}f.events.push('open:'+String(p));cb(e,fd)})},
 writeFile(fd,bytes,cb){return nativeCallbackFs.writeFile(fd,bytes,cb)},
 fsync(fd,cb){const f=current;
  if((f.case.startsWith('primary-')||f.case.startsWith('diagnostic-')||f.case==='secondary-false')&&!f.fault){f.fault=true;return new Promise((resolve,reject)=>nativeCallbackFs.fsync(fd,e=>{cb(e);reject(f.case.startsWith('primary-')?failValues[f.case.slice(8)]:0)}))}
  return nativeCallbackFs.fsync(fd,cb);
 },
 close(fd,cb){const f=current,p=fdKind.get(fd);const done=e=>{
  if(!e)owned.delete(fd);f.events.push('original-close:'+p);
  if(f.case==='pending-close'&&!f.deliver&&String(p).endsWith('package-cleanup.json')){f.deliver=()=>{f.events.push('callback-delivered');cb(e)};f.ready();return}
  cb(e);
  if(!f.changed&&f.case==='file-directory'&&String(p).endsWith('package-cleanup.json')){f.changed=true;f.session.directory=f.replacement}
  if(!f.changed&&f.case==='directory-session'&&p===f.directory){f.changed=true;f.session.metadata.sessionId='foreign'}
 };
  if(f.case==='secondary-false'&&!f.secondary){f.secondary=true;return new Promise((resolve,reject)=>nativeCallbackFs.close(fd,e=>{done(e);reject(false)}))}
  return nativeCallbackFs.close(fd,done);},
}});

mock.module('node:fs/promises',{namedExports:{...nativeFs,writeFile(p,...args){
 const f=current;
 if(String(p).endsWith('bridge-shutdown-failure.json')&&f.case==='diagnostic-false')return Promise.reject(false);
 if(String(p).endsWith('bridge-shutdown-failure.json')&&f.case==='diagnostic-redirect')f.session.directory=f.replacement;
 return nativeFs.writeFile(p,...args);
}}});
const {pathToFileURL}=await import('node:url');
const {createBridge}=await import(process.env.CLEANUP_ENTRY?pathToFileURL(process.env.CLEANUP_ENTRY).href:'../../lib/bridge.mjs');
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


const scenarios=['normal','file-directory','directory-session','pending-close','diagnostic-false','diagnostic-redirect','secondary-false',...Object.keys(failValues).map(k=>'primary-'+k)];
for(const scenario of scenarios)test('whole cleanup binding closure '+scenario,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'closure-binding-')),replacement=directory+'-B';await mkdir(replacement);
 let ready;const callbackReady=new Promise(resolve=>ready=resolve);
 const f=current={case:scenario,scenario:'hybrid-success',directory,replacement,events:[],native:nativeFixture(),nativeReceipts:[],saves:0,ready};
 const session=f.session={directory,metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads')}}};
 const bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,loginomUrl:'http://loginom.invalid/app/?testable=true',acceptanceCleanupPackage:path},session);
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new AgentClient({name:'test',version:'1'},{capabilities:{}});await bridge.server.connect(a);await client.connect(b);
 let first;
 try{
  await client.callTool({name:'dock_prepare',arguments:{}});
  await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'save'}});
  const raw=bridge.close(),pending=raw.then(result=>({result}),error=>{first=error;return {error}});
  if(scenario==='pending-close'){
   let finished=false;pending.then(()=>finished=true);await callbackReady;
   assert.equal(finished,false);assert.equal(physical([...fdKind].find(([fd,p])=>p.endsWith('package-cleanup.json'))[0]),false);
   assert.equal(bridge.close(),raw);assert.equal(f.events.includes('release-uploads'),false);f.deliver();
  }
  const outcome=await pending;
  if(['file-directory','directory-session'].includes(scenario)){
   assert.ok(outcome.error);assert.match(first.cause.message,/BINDING_CHANGED/);
   assert.equal(f.events.includes('browser-close'),false);assert.equal(f.events.includes('release-uploads'),false);
   assert.equal(await nativeFs.stat(join(replacement,'bridge-shutdown-failure.json')).then(()=>true,()=>false),false);
   assert.equal(f.events.some(e=>e.startsWith('open:'+replacement)),false);
   session.directory=directory;session.metadata.sessionId='own-session';
   assert.equal((await bridge.close()).cleanup_complete,true);
  }else if(scenario.startsWith('diagnostic-')||scenario==='secondary-false'){
   assert.ok(outcome.error);assert.equal(first.cause,0);
   assert.equal(await nativeFs.stat(join(replacement,'bridge-shutdown-failure.json')).then(()=>true,()=>false),false);
   if(scenario==='diagnostic-false')assert.equal(session.metadata.cleanupFailurePublicationRefusal.value,false);
   if(scenario==='diagnostic-redirect')assert.ok(await readFile(join(directory,'bridge-shutdown-failure.json'),'utf8'));
   if(scenario==='secondary-false'){const failure=JSON.parse(await readFile(join(directory,'bridge-shutdown-failure.json'),'utf8'));assert.equal(failure.rejections.at(-1).rejection.value,false)}
   session.directory=directory;assert.equal((await bridge.close()).cleanup_complete,true);
  }else if(scenario.startsWith('primary-')){
   assert.ok(outcome.error);assert.equal(first.cause,failValues[scenario.slice(8)]);
   const failure=JSON.parse(await readFile(join(directory,'bridge-shutdown-failure.json'),'utf8'));
   assert.equal(failure.primary_rejection.is_undefined,scenario==='primary-undefined'?true:scenario==='primary-error'?undefined:false);
   assert.equal((await bridge.close()).cleanup_complete,true);
  }else assert.equal(outcome.result.cleanup_complete,true);
  assert.equal(f.native.events.filter(e=>e==='close').length,1);assert.equal(f.native.events.filter(e=>e==='logout').length,1);
  assert.equal(owned.size,0);
  const report={scenario,events:f.events,native:f.native.events,nativeReceipts:f.nativeReceipts,
   first:first?{message:first.message,cause:first.cause instanceof Error?{message:first.cause.message,cause:first.cause.cause}:first.cause,isUndefined:first.cause===undefined}:null,
   replacementFiles:await nativeFs.readdir(replacement),scope:'whole bridge/real callback FS/MCP InMemory; native Page/helper/SDK/service doubles'};
  if(process.env.CLOSURE_RESULTS){await mkdir(process.env.CLOSURE_RESULTS,{recursive:true});await nativeFs.writeFile(join(process.env.CLOSURE_RESULTS,scenario+'.json'),JSON.stringify(report,null,2))}
  if(process.connected)await new Promise(r=>process.send({scenario,nativeClose:1,nativeLogout:1},r));
 }finally{
  for(const fd of owned)await new Promise(r=>nativeCallbackFs.close(fd,()=>r()));owned.clear();await client.close();await rm(directory,{recursive:true,force:true});await rm(replacement,{recursive:true,force:true});
 }
});
after(()=>{if(process.connected)process.disconnect()});
