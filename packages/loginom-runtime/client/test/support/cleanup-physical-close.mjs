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
 open(name,mode,permissions,callback){
  const f=current,kind=(String(name).endsWith('/package-cleanup.json')||/\/\.package-cleanup\.[^/]+\.tmp$/.test(String(name)))?'file':String(name)===f?.directory?'directory':null;
  if(!kind)return nativeCallbackFs.open(name,mode,permissions,callback);
  if(f.selected&&!f.finished)f.events.push('new-open-before-completion');
  const fault=f.case==='io-open'&&!f.selected;
  if(fault)f.selected=true;
  nativeCallbackFs.open(name,mode,permissions,(e,fd)=>{
   if(!e){owned.add(fd);fdKind.set(fd,kind)}f.events.push(kind+'-open-callback');
   if(fault){f.fd=fd;f.original=()=>{f.finished=true;callback(e,fd)};f.signal()}else callback(e,fd);
  });if(fault)throw 0;
 },
 writeFile(fd,bytes,callback){const f=current;
  if(f.case==='io-write'&&!f.selected){f.selected=true;f.fd=fd;nativeCallbackFs.writeFile(fd,bytes,e=>{f.original=()=>{f.finished=true;callback(e)};f.signal()});throw 0}
  if(f.case.startsWith('write-')&&!f.selected){f.selected=true;f.fd=fd;return new Promise((r,j)=>nativeCallbackFs.writeFile(fd,bytes,e=>{callback(e);j(failValues[f.case.slice(6)])}))}
  nativeCallbackFs.writeFile(fd,bytes,e=>{f.events.push(fdKind.get(fd)+'-write-callback');callback(e)});
 },
 fsync(fd,callback){const f=current;
  if(f.case==='io-sync'&&!f.selected){f.selected=true;f.fd=fd;nativeCallbackFs.fsync(fd,e=>{f.original=()=>{f.finished=true;callback(e)};f.signal()});throw 0}
  if((f.case.startsWith('sync-')||f.case.startsWith('dirsync-')&&fdKind.get(fd)==='directory')&&!f.selected){f.selected=true;f.fd=fd;return new Promise((r,j)=>nativeCallbackFs.fsync(fd,e=>{callback(e);j(failValues[f.case.slice(f.case.startsWith('dirsync-')?8:5)])}))}
  nativeCallbackFs.fsync(fd,e=>{f.events.push(fdKind.get(fd)+'-sync-callback');callback(e)});
 },
 close(fd,callback){const f=current,kind=fdKind.get(fd);
  const fault=['lost-reply','early-fulfilled','missing-callback','directory-lost','callback-error'].includes(f.case)&&!f.selected&&kind===(f.case==='directory-lost'?'directory':'file')||['sync-','write-','dirsync-'].some(p=>f.case.startsWith(p))&&fd===f.fd&&!f.scheduled;
  if(fault&&f.case!=='normal'){
   f.selected=true;f.fd=fd;f.scheduled=true;
   if(f.case==='callback-error'){callback(Error('kernel callback refusal'));f.signal();return}
   f.blocker=new Promise((r,j)=>pbkdf2('fixture','fixture',1000000,8,'sha256',e=>e?j(e):r()));
   f.kernel=new Promise(resolve=>nativeCallbackFs.close(fd,e=>{owned.delete(fd);f.events.push(kind+'-kernel-close');
    if(f.case==='missing-callback')f.original=()=>{f.finished=true;callback(e)};
    else{f.finished=true;callback(e)}f.signal();resolve();
   }));
   f.events.push('close-scheduled');
   if(['early-fulfilled','missing-callback'].includes(f.case))return Promise.resolve('projection');
   throw ['sync-','write-','dirsync-'].some(p=>f.case.startsWith(p))?false:0;
  }
  nativeCallbackFs.close(fd,e=>{if(!e)owned.delete(fd);f.events.push(kind+'-close-callback');callback(e)});
 }
}});
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

const scenarios=['normal','lost-reply','early-fulfilled','missing-callback','directory-lost','callback-error','io-open','io-write','io-sync',...['sync-','write-','dirsync-'].flatMap(p=>Object.keys(failValues).map(x=>p+x)),'foreign-session','foreign-directory'];
for(const scenario of scenarios)test('whole bridge kernel receipt '+scenario,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cleanup-kernel-'));let signal;
 const ready=new Promise(r=>signal=r);
 const f=current={case:scenario,scenario:'hybrid-success',directory,events:[],native:nativeFixture(),nativeReceipts:[],saves:0,signal,finished:false};
 const session={directory,metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads')}}};
 const bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,loginomUrl:'http://loginom.invalid/app/?testable=true',acceptanceCleanupPackage:path},session);
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new AgentClient({name:'test',version:'1'},{capabilities:{}});await bridge.server.connect(a);await client.connect(b);
 let first,finished=false,receipt;
 try{
  await client.callTool({name:'dock_prepare',arguments:{}});
  await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'own-save'}});
  if(scenario.startsWith('foreign-'))f.case='io-sync';
  const pending=bridge.close().then(r=>{finished=true;return {r}},e=>{finished=true;first=e;return {e}});
  const concurrent=bridge.close().then(r=>({r}),e=>({e}));
  if(f.case!=='normal'){
   if(['early-fulfilled','missing-callback'].includes(f.case)){
    await ready;
    if(f.case==='missing-callback'){assert.equal(finished,false);assert.equal(physical(f.fd),false);assert.equal(f.events.includes('browser-close'),false);f.original()}
   }else{
    const result=await pending;assert.ok(result.e);assert.equal(f.events.includes('browser-close'),false);assert.equal(f.events.includes('release-uploads'),false);assert.equal(bridge.hasUnsettledWork(),true);
    if(['sync-','write-','dirsync-'].some(p=>f.case.startsWith(p))){assert.equal(first.cause,failValues[f.case.slice(f.case.indexOf('-')+1)]);const failure=JSON.parse(await readFile(join(directory,'bridge-shutdown-failure.json'),'utf8'));assert.equal(failure.primary_phase,'cleanup_receipt');assert.equal(failure.rejections.at(-1).rejection.value,false)}
    if(f.case==='callback-error'){assert.equal(physical(f.fd),true);await assert.rejects(bridge.close());return}
    await ready;
    if(f.case.startsWith('io-')){
     assert.equal(physical(f.fd),true);await assert.rejects(bridge.close());assert.equal(f.events.includes('browser-close'),false);
     if(scenario.startsWith('foreign-')){const field=scenario==='foreign-session'?'sessionId':'directory',obj=field==='sessionId'?session.metadata:session,old=obj[field];obj[field]='foreign';await assert.rejects(bridge.close());obj[field]=old}
     f.original();
    }
    if(f.kernel)await f.kernel;
    receipt=await bridge.close();
   }
  }
  const original=await pending;await concurrent;if(!receipt)receipt=original.r;
  assert.equal(receipt.cleanup_complete,true);assert.equal(f.native.events.filter(e=>e==='close').length,1);assert.equal(f.native.events.filter(e=>e==='logout').length,1);
  assert.equal(f.events.includes('new-open-before-completion'),false);
  assert.equal(owned.size,0);const e=f.events,ds=e.lastIndexOf('directory-sync-callback'),dc=e.lastIndexOf('directory-close-callback');assert.ok(ds>=0&&dc>ds&&e.indexOf('browser-close')>dc&&e.indexOf('release-uploads')>dc);
  assert.equal(JSON.parse(await readFile(join(directory,'package-cleanup.json'),'utf8')).status,'SUCCEEDED');
 }finally{
  if(f.blocker)await f.blocker;if(f.kernel)await f.kernel;
  const report={scenario,fixture:true,events:f.events,native:f.native.events,receipt,primary:first&&{message:first.message,cause:first.cause instanceof Error?{message:first.cause.message,cause:first.cause.cause}:first.cause},scope:'exact whole bridge, real filesystem/kernel and MCP InMemory request; native/Page/services and fault replies doubles'};
  if(process.send)await new Promise(r=>process.send({...report,fixture:'report'},r));
  if(process.env.CLEANUP_RESULTS){await nativeFs.mkdir(process.env.CLEANUP_RESULTS,{recursive:true});await nativeFs.writeFile(join(process.env.CLEANUP_RESULTS,scenario+'.json'),JSON.stringify(report,null,2))}
  for(const fd of owned)await new Promise(r=>nativeCallbackFs.close(fd,()=>r()));owned.clear();await client.close();await rm(directory,{recursive:true,force:true});
 }
});

after(()=>{if(process.connected)process.disconnect()});
