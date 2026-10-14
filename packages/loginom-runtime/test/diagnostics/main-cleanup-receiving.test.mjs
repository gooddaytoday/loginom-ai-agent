import test,{mock,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const entry=process.env.CLEANUP_ENTRY??fileURLToPath(new URL('../../client/lib/bridge.mjs',import.meta.url));
const entryURL=pathToFileURL(entry),actualRequire=createRequire(new URL('../package.json',entryURL));
const {Client:AgentClient}=actualRequire('@modelcontextprotocol/sdk/client/index.js');
const {InMemoryTransport}=actualRequire('@modelcontextprotocol/sdk/inMemory.js');
const executor=await import(new URL('./executor.mjs',entryURL));
const catalog=await import(new URL('./action-catalog.mjs',entryURL));
const skill=await import(new URL('./skill.mjs',entryURL));
const workspace=await import(new URL('./workspace.mjs',entryURL));
let current;
const target={profile_id:'test',loginom_build:'7.4.2',platform:'macos',browser:'chromium'};
const path='/test-2/packages/result.lgp';
class ExternalClient {
  constructor(identity){this.browser=identity.name==='loginom-dock-browser';this.f=current;}
  async connect(t){this.transport=t;}
  async close(){this.f.events.push(this.browser?'browser-close':'remote-close');this.transport?.onclose?.();if(!this.browser&&this.f.case.startsWith('transport-')){this.f.session.directory=this.f.replacement;throw failValues[this.f.case.slice(10)]}}
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
      if(this.f.native){value=await this.f.native.execute(code);this.f.nativeReceipts.push(structuredClone(value));if(this.f.case==='native-directory')this.f.session.directory=this.f.replacement;if(this.f.case==='native-session')this.f.session.metadata.sessionId='foreign-session';return {content:[{type:'text',text:JSON.stringify(value)}]};}
      const blocked=['native-blocked','managed-unsaved'].includes(this.f.scenario);
      value={version:1,session_id:'own-session',document_id:'own-doc',status:blocked?'BLOCKED':'SUCCEEDED',package_closed:!blocked,
        logged_out:!blocked,account:this.f.scenario==='managed-identity'?'foreign':'test-2',package_path:path,unsaved_changes_discarded:false,packages_before:1,packages_after:0,reason:blocked?'UNSAVED_CHANGES':null};
    } else throw Error('Unexpected browser code');
    return {content:[{type:'text',text:JSON.stringify(value)}]};
  }
}
class ExternalTransport{}
mock.module(actualRequire.resolve('@modelcontextprotocol/sdk/client/index.js').replace('/dist/cjs/','/dist/esm/'),{namedExports:{Client:ExternalClient}});
mock.module(actualRequire.resolve('@modelcontextprotocol/sdk/client/stdio.js').replace('/dist/cjs/','/dist/esm/'),{namedExports:{StdioClientTransport:ExternalTransport,getDefaultEnvironment:()=>({})}});
mock.module(actualRequire.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js').replace('/dist/cjs/','/dist/esm/'),{namedExports:{StreamableHTTPClientTransport:ExternalTransport}});
mock.module(new URL('./action-catalog.mjs','file://'+entry).href,{namedExports:{...catalog,pinActionCatalog:async()=>({pins:{},compatibility:target,manifest:{compatibility:target},actions:new Map()})}});
mock.module(new URL('./skill.mjs','file://'+entry).href,{namedExports:{...skill,skillTransport:()=>({}),createSkillLoader:()=>({prepare:async()=>({main:'/test/skill',directory:'/test',detail:{revision:'test',source:'test',content:'test'}})})}});
mock.module(new URL('./workspace.mjs','file://'+entry).href,{namedExports:{...workspace,
  makeWorkspacePrepareCode:options=>workspace.makeWorkspacePrepareCode({...options,platform:'darwin'})}});
mock.module(new URL('./executor.mjs','file://'+entry).href,{namedExports:{...executor,createActionRuntime:()=>{
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
  const f=current;if(f)f.events.push('open-path:'+String(name));const kind=String(name).endsWith('/package-cleanup.json')||String(name).includes('/.package-cleanup.')&&String(name).endsWith('.tmp')?'file':String(name)===f?.directory?'directory':null;
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
  nativeCallbackFs.close(fd,e=>{if(!e)owned.delete(fd);f.events.push(kind+'-close-callback');callback(e);if(kind==='file'&&f.case==='late-directory'&&!f.selected){f.selected=true;f.session.directory=f.replacement;f.events.push('supplied-directory-changed')}});
 }
}});

const {createBridge}=await import(process.env.CLEANUP_ENTRY?pathToFileURL(entry).href:entryURL.href);


import vm from 'node:vm';
import {mkdir,writeFile} from 'node:fs/promises';
const {makePackageCleanupCode}=await import(new URL('./package-cleanup.mjs',entryURL));
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



const scenarios=['normal','io-open','io-write','io-sync','native-directory','native-session',...Object.keys(failValues).map(k=>'transport-'+k)];
for(const scenario of scenarios)test('cleanup closure post-await boundary '+scenario,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'reviewer-cleanup-await-')),replacement=directory+'-B';await mkdir(replacement);
 let signal;const ready=new Promise(resolve=>signal=resolve);
 const f=current={case:scenario,scenario:'hybrid-success',directory,replacement,events:[],native:nativeFixture(),nativeReceipts:[],saves:0,signal,finished:false};
 const session=f.session={directory,metadata:{client:'test',sessionId:'own-session',clientRevision:'a'.repeat(64)},async save(){},artifactStore:{list:()=>[],async releaseUploads(){f.events.push('release-uploads')}}};
 const originalMetadata=session.metadata;
 const bridge=await createBridge({mode:'executor-replay',resultProfile:'user-v1',apiKey:'test-only',endpoint:'https://dock.invalid/mcp',stateDir:directory,loginomUrl:'http://loginom.invalid/app/?testable=true',acceptanceCleanupPackage:path},session);
 const [a,b]=InMemoryTransport.createLinkedPair(),client=new AgentClient({name:'test',version:'1'},{capabilities:{}});await bridge.server.connect(a);await client.connect(b);
 const inspect=async()=>({replacementFiles:await nativeFs.readdir(replacement),receipt:await readFile(join(directory,'package-cleanup.json'),'utf8').then(bytes=>{try{return JSON.parse(bytes)}catch{return {unparsed_bytes:bytes}}},()=>null),nativeClose:f.native.events.filter(x=>x==='close').length,nativeLogout:f.native.events.filter(x=>x==='logout').length,transport:f.events.includes('browser-close'),released:f.events.includes('release-uploads'),ownedDescriptors:owned.size,publicationRefusal:originalMetadata.cleanupFailurePublicationRefusal??null});
 try{
  await client.callTool({name:'dock_prepare',arguments:{}});
  await client.callTool({name:'dock_action_run',arguments:{action_key:'package.save_checkpoint',parameters:{path},operation_id:'save'}});
  const first=await bridge.close().then(result=>({ok:true,result}),error=>({ok:false,error}));
  if(scenario.startsWith('io-')){
   await ready;assert.equal(first.ok,false);assert.equal(first.error.cause,0);
   const before=await inspect(),opens=f.events.filter(e=>e.startsWith('open-path:')).length;
   await assert.rejects(bridge.close());assert.equal(f.events.filter(e=>e.startsWith('open-path:')).length,opens);assert.equal(physical(f.fd),true);
   f.original();await Promise.resolve();
   const repair=await bridge.close().then(result=>({ok:true,result}),error=>({ok:false,error}));
   const after=await inspect();console.log(JSON.stringify({scenario,originalCallbackDelivered:f.finished,before,after,repairCompleted:repair.ok,repairValue:repair.ok?null:repair.error}));
   assert.equal(repair.ok,true,'delivered open/write/sync callback must permit closing the original FD and storage-only repair');
   assert.equal(repair.result.cleanup_complete,true);assert.equal(after.ownedDescriptors,0);assert.equal(after.nativeClose,1);assert.equal(after.nativeLogout,1);
  }else if(scenario.startsWith('native-')){
   assert.equal(first.ok,false);const facts=await inspect();console.log(JSON.stringify({scenario,...facts,firstMessage:first.error.message,firstCause:first.error.cause?.message??null}));
   assert.equal(facts.transport,false);assert.equal(facts.released,false);
   assert.equal(facts.replacementFiles.length,0,'original shutdown destination must be enforced before the first receipt write');
   assert.equal(facts.receipt,null,'changed original session identity must refuse before receipt IO');
   await assert.rejects(bridge.close());
   assert.deepEqual(await nativeFs.readdir(replacement),[],'repeated refusal cannot mint a replacement diagnostic destination');
   session.directory=directory;session.metadata.sessionId='own-session';
   const repaired=await bridge.close();
   const restored=await inspect();
   assert.equal(repaired.cleanup_complete,true);assert.equal(restored.receipt.session_id,'own-session');
   assert.equal(restored.nativeClose,1);assert.equal(restored.nativeLogout,1);assert.equal(restored.ownedDescriptors,0);
   console.log(JSON.stringify({scenario,restoredVerifiedNativeReceipt:restored,storageOnlyRepair:true}));
  }else if(scenario.startsWith('transport-')){
   assert.equal(first.ok,false);const facts=await inspect(),expected=failValues[scenario.slice(10)];
   console.log(JSON.stringify({scenario,...facts,firstMessage:first.error?.message??null,firstCause:first.error?.cause instanceof Error?{message:first.error.cause.message,cause:first.error.cause.cause}:first.error?.cause,expectedIsUndefined:expected===undefined}));
   assert.equal(first.error.message,'LOGINOM_BRIDGE_CLEANUP_FAILED');
   assert.equal(first.error.cause,expected,'transport failure returned by the original close must precede later binding/persistence refusal');
   assert.equal(facts.replacementFiles.length,0);assert.equal(facts.released,false);
  }else{const facts=await inspect();console.log(JSON.stringify({scenario,...facts}));assert.equal(first.ok,true);assert.equal(first.result.cleanup_complete,true);assert.equal(facts.nativeClose,1);assert.equal(facts.nativeLogout,1);assert.equal(facts.ownedDescriptors,0)}
 }finally{
  if(f.original&&!f.finished){f.original();await Promise.resolve()}
  for(const fd of owned)await new Promise(resolve=>nativeCallbackFs.close(fd,()=>resolve()));owned.clear();
  await client.close();await rm(directory,{recursive:true,force:true});await rm(replacement,{recursive:true,force:true});
 }
});
after(()=>{if(process.connected)process.disconnect()});
