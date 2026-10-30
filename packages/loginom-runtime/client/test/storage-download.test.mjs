import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,stat,rm,truncate} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServerDownloadRegistry,serverDownloadBudget} from '../lib/storage-policy.mjs';
import {Page,runtime,actions,selectors,build} from './support/executor-fixture.mjs';
import {createActionRuntime} from '../lib/executor.mjs';

const source=()=>({verified:true,kind:'storage',server_source_ref:'storage-one',destination:'/worker/full.csv',
 bytes:3,mtime:'2026-10-28T00:00:00Z',origin:'https://app.loginom.ai',account:'worker',document_id:'doc'});
async function fixture(t,transfer) {
 const root=await mkdtemp(join(tmpdir(),'server-cache-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const current=source(),registry=createServerDownloadRegistry({directory:join(root,'cache'),
  inspect:async()=>structuredClone(current),download:transfer??(async({path})=>writeFile(path,'abc'))});
 return {root,current,registry,request:{operation_id:'download',server_source_ref:'storage-one'}};
}
async function settled(registry,id='download') {
 while(registry.status(id).state==='running')await registry.wait(id,{timeoutMs:100});
 return registry.status(id);
}
test('explicitly disabled server cache refuses before lookup or download and retains source tools',async t=>{
 const f=await fixture(t),directory=join(f.root,'disabled-cache');
 const r=createActionRuntime({pinned:{actions,selectors,pins:{},compatibility:{loginom_build:build}},
  allowCandidate:true,cacheDirectory:directory,serverSourceCache:false,execute:()=>assert.fail('Disabled cache must not inspect or click the browser')});
 const outcome=await r.serverDownload(f.request,'dock_storage_download_start');
 assert.equal(outcome.status,'FAILED');assert.equal(outcome.error.code,'SERVER_CACHE_DISABLED');
 assert.match(outcome.error.message,/для серверного файла точная сверка N недоступна/);
 assert.equal(outcome.effect_possible,false);assert.equal(outcome.cleanup_complete,true);assert.equal(r.hasActiveWork(),false);
 assert.ok(r.tools.some(tool=>tool.name==='dock_storage_source'));
 assert.match(r.tools.find(tool=>tool.name==='dock_storage_download_start').description,/disabled/i);
 await assert.rejects(stat(directory),{code:'ENOENT'});await r.cleanupServerCache();
});
test('production default enables server cache and requires an observed native source before any browser download',async t=>{
 const f=await fixture(t),directory=join(f.root,'unobserved-cache');
 const r=createActionRuntime({pinned:{actions,selectors,pins:{},compatibility:{loginom_build:build}},
  allowCandidate:true,cacheDirectory:directory,execute:()=>assert.fail('An unobserved reference must not reach the browser')});
 const started=await r.serverDownload(f.request,'dock_storage_download_start');
 assert.equal(started.state,'running',JSON.stringify(started));
 const outcome=await r.serverDownload({operation_id:'download',timeout_ms:100},'dock_storage_download_wait');
 assert.equal(outcome.status,'FAILED');assert.equal(outcome.error.code,'LOGINOM_DOWNLOAD_FAILED');
 assert.equal(outcome.effect_possible,false);assert.equal(outcome.cleanup_complete,true);assert.equal(r.hasActiveWork(),false);
 assert.ok(r.tools.some(tool=>tool.name==='dock_storage_source'));
 assert.doesNotMatch(r.tools.find(tool=>tool.name==='dock_storage_download_start').description,/disabled/i);
 await assert.rejects(stat(directory),{code:'ENOENT'});await r.cleanupServerCache();
});
test('server download deadline is size-derived and capped without a global timeout change',()=>{
 assert.equal(serverDownloadBudget(0),120000);
 assert.equal(serverDownloadBudget(2*1024**3),2168000);
 assert.equal(serverDownloadBudget(100*1024**3),7200000);
 for(const value of [-1,NaN,Infinity,1.5])assert.throws(()=>serverDownloadBudget(value));
});
test('growing Chromium bytes keep a slow download alive beyond the old fixed deadline',async t=>{
 const f=await fixture(t);let clock=0;
 const native={...source(),bytes:2*1024**3};
 const registry=createServerDownloadRegistry({directory:join(f.root,'slow'),now:()=>clock,inspect:async()=>native,
  download:async({path,onProgress})=>{
   for(let n=1;n<=15;n++){clock=n*60000;onProgress(n*100*1024**2);}
   await writeFile(path,'');await truncate(path,native.bytes);
  }});
 registry.start(f.request);const result=await settled(registry);
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(result.progress.elapsed_ms,900000);
 assert.equal(result.progress.bytes,native.bytes);await registry.cleanup();
});
test('unchanged byte reports cannot renew the no-progress deadline; late growth cannot revive it',async t=>{
 for(const late of [false,true]){
  const f=await fixture(t);let clock=0;
  const registry=createServerDownloadRegistry({directory:join(f.root,'stalled'),now:()=>clock,inspect:async()=>({...source(),bytes:2*1024**3}),
   download:async({path,onProgress,signal})=>{
    await writeFile(path,'a');clock=60000;onProgress(1);clock=179999;onProgress(1);
    clock=180000;onProgress(late?2:1);signal.throwIfAborted();
   }});
  registry.start(f.request);const result=await settled(registry);
  assert.equal(result.status,'FAILED');assert.equal(result.error.code,'LOGINOM_DOWNLOAD_NO_PROGRESS');
  assert.equal(result.cleanup_complete,true);assert.deepEqual(await readdir(join(f.root,'stalled')),[]);
 }
});
test('no-progress timer cancels and drains a stalled transfer even without status reports',async t=>{
 const f=await fixture(t);t.mock.timers.enable({apis:['Date','setTimeout'],now:0});
 let started=false;
 const registry=createServerDownloadRegistry({directory:join(f.root,'silent'),inspect:async()=>({...source(),bytes:2*1024**3}),
  download:async({path,signal})=>{await writeFile(path,'a');started=true;
   await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));signal.throwIfAborted();}});
 registry.start(f.request);while(!started)await new Promise(resolve=>setImmediate(resolve));
 t.mock.timers.tick(120000);await registry.cleanup();
 const result=registry.status('download');
 assert.equal(result.status,'FAILED');assert.equal(result.error.code,'LOGINOM_DOWNLOAD_NO_PROGRESS');
 assert.equal(result.cancel_requested,true);assert.equal(result.cleanup_complete,true);
 assert.deepEqual(await readdir(join(f.root,'silent')),[]);
});
test('download writes a private cache, binds its receipt to native identity and never uploads',async t=>{
 const f=await fixture(t);f.registry.start(f.request);
 const result=await settled(f.registry);assert.equal(result.status,'SUCCEEDED');
 const path=result.output.path;assert.equal((await stat(join(f.root,'cache'))).mode&0o777,0o700);
 assert.equal((await stat(path)).size,3);
 const receipt={basis:'backend_exact_scan',profile_id:'p',records:1,bytes:3,sha256:'a'.repeat(64),
  identity:{canonical_path:path,size:3,file_id:`${(await stat(path)).dev}:${(await stat(path)).ino}`,
   mtime:(await stat(path)).mtimeMs,ctime:(await stat(path)).ctimeMs}};
 assert.equal((await f.registry.bind(source(),receipt)).sha256,receipt.sha256);
 assert.equal((await f.registry.bind({...source(),server_source_ref:'refreshed-native-ref'},receipt)).sha256,receipt.sha256);
 assert.equal((await f.registry.bind({...source(),account:'foreign'},receipt)).sha256,undefined);
 assert.equal((await f.registry.bind(source(),{...receipt,identity:{...receipt.identity,canonical_path:'/foreign'}})).sha256,undefined);
 assert.equal((await f.registry.bind({...source(),mtime:'changed'},receipt)).sha256,undefined);
 await f.registry.cleanup();assert.deepEqual(await readdir(join(f.root,'cache')),[]);
});

test('public server source discovery refuses foreign roots and unsupported files before browser navigation',async t=>{
 const f=await fixture(t),page=new Page();
 page.execute=()=>assert.fail('Invalid source must not invoke the browser');
 const r=runtime(page,{cacheDirectory:join(f.root,'runtime-cache'),getStorageBinding:()=>({directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}})});
 assert.ok(r.tools.some(t=>t.name==='dock_storage_source'));
 for(const path of ['/foreign/full.csv','/worker/../foreign.csv','/worker/full.lgp'])
  await assert.rejects(r.serverDownload({operation_id:'source',path},'dock_storage_source'));
 assert.equal(r.hasActiveWork(),false);await r.cleanupServerCache();
});

test('source discovery waits through the old graph tab before reading the new Files navigation root',async t=>{
 const f=await fixture(t),page=new Page(),base=page.uiSnapshot();
 const nav='ui-navigation',old='ui-old-navigation',file='ui-file',table='ui-table';let roots=0;
 const element=(ref,tid)=>({ref,tid,kind:'region',label:'',allowed_actions:[],identity:{anchor_tid:tid,path:[]}});
 const files={...base,observation_kind:'roots',active_tab_ref:'files',ui:{...base.ui,elements:[
  element(nav,page.prefix+';NavigationBar;NavigationPanel'),element(table,page.prefix+';FileStorageForm;pnlFileStorage;tbl'),
  element(file,page.prefix+';FileStorageForm;colName_full.csv')]}};
 const graph={...base,observation_kind:'roots',ui:{...base.ui,elements:[element(old,page.prefix+';NavigationBar;NavigationPanel')]}};
 const evaluate=page.evaluate.bind(page);
 page.evaluate=async(fn,arg)=>{
  if(!fn.toString().includes("Symbol.for('loginom-dock.workspace-ui.identity.v1')"))return evaluate(fn,arg);
  if(arg.discoverRoots){
   const state=structuredClone(++roots===2?graph:files);
   // Real workspace-ui storage_name selects only matching file rows, omitting
   // NavigationPanel and the global toolbar (LAB-386 server-a/0.jsonl:2-3).
   if(arg.storageName)state.ui.elements=state.ui.elements.filter(e=>e.tid.endsWith(';colName_'+arg.storageName));
   page.clock+=1000;return state;
  }
  if(arg.rootRef===old)throw Error('Detached graph navigation root must not be read');
  const state=structuredClone(files);delete state.observation_kind;
  state.file_storage={status:'observed',directory:'/worker'};
  if(arg.rootRef===file)state.ui.elements=[{...element(file,page.prefix+';FileStorageForm;colName_full.csv'),label:'full.csv',
   storage_entry:{kind:'file',path:'/worker/full.csv',bytes:3,mtime:'native-time',bytes_source:'native_file_store'}}];
  return state;
 };
 const r=runtime(page,{serverSourceCache:false,cacheDirectory:join(f.root,'navigation-cache'),getStorageBinding:()=>({session_id:'s',document_id:'d',
  origin:'https://loginom.invalid',loginom_account:'worker',directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}})});
 const result=await r.serverDownload({operation_id:'source',path:'/worker/full.csv'},'dock_storage_source');
 assert.equal(result.status,'SUCCEEDED');assert.ok(result.output.source.server_source_ref);
 assert.equal(page.events.filter(e=>e==='mouse_click').length,0);
});

test('source discovery reacquires invalidated read pages without replaying any gesture',async t=>{
 const f=await fixture(t),page=new Page(),base=page.uiSnapshot();let reads=0;
 const element=(ref,tid)=>({ref,tid,kind:'region',label:'',allowed_actions:[],identity:{anchor_tid:tid,path:[]}});
 const files={...base,observation_kind:'roots',active_tab_ref:'files',ui:{...base.ui,elements:[
  element('ui-navigation',page.prefix+';NavigationBar;NavigationPanel'),element('ui-table',page.prefix+';FileStorageForm;pnlFileStorage;tbl'),
  element('ui-file',page.prefix+';FileStorageForm;colName_full.csv'),
  ...Array.from({length:40},(_,i)=>element('ui-extra-'+i,page.prefix+';FileStorageForm;extra'+i))]}};
 const evaluate=page.evaluate.bind(page);
 page.evaluate=async(fn,arg)=>{
  if(!fn.toString().includes("Symbol.for('loginom-dock.workspace-ui.identity.v1')"))return evaluate(fn,arg);
  // LAB-374 s-server-a:8-9 and last-a:8-10: tab replacement followed by
  // several DOM revisions. None of these no-effect reads authorizes a click.
  const state=structuredClone(files),sequence=[0,21,341,455,1387,1417,1598,2681];
  state.dom_epoch.revision=sequence[Math.min(reads++,sequence.length-1)];
  if(reads===1){state.workflow_ref={prefix:'MF;TF-1',tab_tid:'tb-1'};}
  else {state.workflow_ref={prefix:'MF;TF-2',tab_tid:'tb-2'};
   for(const e of state.ui.elements){e.tid=e.tid.replace(page.prefix,'MF;TF-2');e.identity.anchor_tid=e.tid;}}
  if(!arg.discoverRoots){delete state.observation_kind;state.file_storage={status:'observed',directory:'/worker'};
   if(arg.rootRef==='ui-file')state.ui.elements=[{...element('ui-file',state.workflow_ref.prefix+';FileStorageForm;colName_full.csv'),label:'full.csv',
    storage_entry:{kind:'file',path:'/worker/full.csv',bytes:3,mtime:'native-time',bytes_source:'native_file_store'}}];
  }
  return state;
 };
 const r=runtime(page,{cacheDirectory:join(f.root,'pages-cache'),getStorageBinding:()=>({session_id:'s',document_id:'d',
  origin:'https://loginom.invalid',loginom_account:'worker',directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}})});
 assert.equal((await r.serverDownload({operation_id:'source',path:'/worker/full.csv'},'dock_storage_source')).status,'SUCCEEDED');
 assert.equal(page.events.filter(e=>e==='mouse_click').length,0);
});
test('changed native size/mtime or wrong copy size invalidates download and removes partials',async t=>{
 for(const kind of ['size','mtime','copy']){
  const f=await fixture(t,async({path})=>{await writeFile(path,kind==='copy'?'abcd':'abc');
   if(kind==='size')f.current.bytes++;if(kind==='mtime')f.current.mtime='changed';});
  f.registry.start(f.request);const result=await settled(f.registry);
  assert.equal(result.status,'FAILED');assert.equal(result.cleanup_complete,true);
  assert.match(result.error.code,/FILE_CHANGED/);assert.deepEqual(await readdir(join(f.root,'cache')),[]);
 }
});
test('cancel drains the actual transfer before deleting partials; IDs cannot replay a download',async t=>{
 let transfers=0,release;
 const f=await fixture(t,async({path,signal})=>{transfers++;await writeFile(path,'a');
  await new Promise(resolve=>{release=resolve;signal.addEventListener('abort',resolve,{once:true});});signal.throwIfAborted();});
 f.registry.start(f.request);while(!release)await new Promise(resolve=>setTimeout(resolve,1));
 f.registry.start(f.request);assert.equal(transfers,1);
 assert.throws(()=>f.registry.start({...f.request,server_source_ref:'other'}),/different/);
 f.registry.cancel('download');const result=await settled(f.registry);
 assert.equal(result.status,'FAILED');assert.equal(result.cancel_requested,true);assert.equal(result.cleanup_complete,true);
 assert.deepEqual(await readdir(join(f.root,'cache')),[]);
 await f.registry.cleanup();
});

test('a transfer finishing beyond its original deadline is invalid and removed',async t=>{
 let clock=0;
 const f=await fixture(t);
 const registry=createServerDownloadRegistry({directory:join(f.root,'timed'),now:()=>clock,inspect:async()=>source(),
  download:async({path,deadline})=>{await writeFile(path,'abc');clock=deadline+1;}});
 registry.start(f.request);const result=await settled(registry);
 assert.equal(result.status,'FAILED');assert.equal(result.error.code,'LOGINOM_DOWNLOAD_DEADLINE');
 assert.deepEqual(await readdir(join(f.root,'timed')),[]);
});

test('native validation time consumes the original download deadline',async t=>{
 const f=await fixture(t);let clock=0;
 const registry=createServerDownloadRegistry({directory:join(f.root,'expired-before-transfer'),now:()=>clock,
  inspect:async()=>{clock=serverDownloadBudget(3)+1;return source();},
  download:async()=>assert.fail('No browser gesture after the original deadline')});
 registry.start(f.request);const result=await settled(registry);
 assert.equal(result.status,'FAILED');assert.equal(result.error.code,'LOGINOM_DOWNLOAD_DEADLINE');
});

test('unknown browser cleanup retains the lease and partial until actual recovery',async t=>{
 const f=await fixture(t);let recovered=false;
 const registry=createServerDownloadRegistry({directory:join(f.root,'unknown'),inspect:async()=>source(),
  download:async({path})=>{await writeFile(path,'a');throw Object.assign(Error('transport lost'),{cleanupUnconfirmed:true});},
  recover:async id=>{assert.equal(id,'download');recovered=true;}});
 registry.start(f.request);const result=await settled(registry);
 assert.equal(result.cleanup_complete,false);assert.equal(registry.unsettled,true);
 assert.equal(result.error.code,'LOGINOM_DOWNLOAD_FAILED');
 assert.equal(result.output.cleanup_error.code,'LOGINOM_DOWNLOAD_CLEANUP_FAILED');
 assert.equal((await readdir(join(f.root,'unknown'))).length,1);
 assert.throws(()=>registry.start({...f.request,operation_id:'other'}),/cleanup/);
 await registry.cleanup('download');assert.equal(recovered,true);assert.equal(registry.unsettled,false);
 assert.deepEqual(await readdir(join(f.root,'unknown')),[]);
});

test('aborting a long status wait releases the caller without cancelling the retained download',async t=>{
 let active;
 const f=await fixture(t,async({path,signal})=>{
  await writeFile(path,'a');active=true;
  await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));signal.throwIfAborted();
 });
 f.registry.start(f.request);while(!active)await new Promise(resolve=>setTimeout(resolve,1));
 const controller=new AbortController();
 const waiting=f.registry.wait('download',{timeoutMs:60000,signal:controller.signal});
 controller.abort(Error('owner interrupted'));
 await assert.rejects(waiting,/owner interrupted/);assert.equal(f.registry.busy,true);
 await f.registry.cleanup();assert.equal(f.registry.unsettled,false);
});
