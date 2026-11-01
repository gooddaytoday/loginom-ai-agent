import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,stat,rm,truncate} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServerDownloadRegistry,serverDownloadBudget} from '../lib/storage-policy.mjs';
import {Page,runtime,actions,selectors,build} from './support/executor-fixture.mjs';
import {createActionRuntime} from '../lib/executor.mjs';
import {runtimeCallTimeout} from '../../src/call-timeout.mjs';
import {createTextImportNodeSupport,verifyDeferredTextImportSources} from '../lib/text-import-node.mjs';
import {NodeProcedureStepError} from '../lib/node-procedure.mjs';

async function sourceNavigation(t,fault,options={}) {
 const f=await fixture(t),page=new Page(),base=page.uiSnapshot(),records=[],deadlines=[];
 let epoch=0,checks=0,opened=false,refreshed=false;
 const native={kind:'file',path:'/worker/full.csv',bytes:3,mtime:'native-time',bytes_source:'native_file_store'};
 const toolbar='MF;cntMain;tlbMainToolbar',button=toolbar+';btnFilestorage';
 const element=tid=>({ref:page.uiReference(tid),tid,kind:'control',scope:'workspace',label:'',enabled:true,visible:true,
  identity:{anchor_tid:tid,path:[]},signature:{tag:'button',tid},bounding_box:{x:10,y:10,width:20,height:20},
  interaction:{state:'point_observed',point:{x:20,y:20}},allowed_actions:['click']});
 const evaluate=page.evaluate.bind(page),elements=page.elements.bind(page);
 page.elements=()=>[...elements(),page.element(button)];
 page.click=async()=>{opened=true;};
 page.evaluate=async(fn,arg)=>{
  if(fn.toString().includes('return {document:state.epoch,revision:state.revision}')){
   if(++checks===1){epoch++;if(fault==='replaced')page.uiRefs.set(button,'ui-replaced-button');}
   return {...base.dom_epoch,revision:epoch};
  }
  if(!fn.toString().includes("Symbol.for('loginom-dock.workspace-ui.identity.v1')"))return evaluate(fn,arg);
  const state=structuredClone(base);state.dom_epoch.revision=epoch;
  if(arg.discoverRoots)state.observation_kind='roots';
  if(epoch&&arg.discoverRoots)refreshed=true;
  if(!opened){state.ui.elements=[element(toolbar),element(button)];
   if(refreshed&&fault==='owner')state.package_identity={name:'foreign',path:'/foreign.lgp'};
   if(refreshed&&fault==='directory')state.file_storage={status:'observed',directory:'/foreign'};
   if(refreshed&&fault==='target')state.ui.elements[1].signature.tag='foreign';
   if(arg.discoverRoots){state.ui.elements=[element(toolbar)];delete state.package_identity;}
   else state.observation_root={ref:arg.rootRef,identity:element(arg.rootRef===page.uiReference(toolbar)?toolbar:button).identity};
  }else{
   const nav=element(page.prefix+';NavigationBar;NavigationPanel'),file=element(page.prefix+';FileStorageForm;colName_full.csv');
   file.label='full.csv';file.storage_entry={...native};
   state.ui.elements=[nav,element(page.prefix+';FileStorageForm;pnlFileStorage;tbl'),file];
   state.file_storage={status:'observed',directory:'/worker'};
  }
  return state;
 };
 const r=runtime(page,{...options,cacheDirectory:join(f.root,'navigation'),onRecord:async record=>{records.push(record);return record;},
  execute:code=>{for(const match of code.matchAll(/"deadline_at":(\d+)/g))deadlines.push(Number(match[1]));return page.execute(code);},
  getStorageBinding:()=>({session_id:'s',document_id:'d',origin:base.origin,loginom_account:'worker',directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}})});
 const result=await r.serverDownload({operation_id:'source',path:'/worker/full.csv'},'dock_storage_source');
 return {result,records,deadlines,page,refreshed,runtime:r,native,showGraph:()=>{opened=false;}};
}

for(const change of ['unchanged','bytes','mtime'])test('import retry after released STALE reopens Files and rechecks the original native witness: '+change,async t=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'import'},workflow={workflow_id:'flow',prefix:'MF;TF-1',
  tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]};
 const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref:node,type:'imports.text',label:'Source',inputs:[],outputs:[0]}],links:[],foreign_links:[]};
 const ok=async()=>({verified:true,cleanup_complete:true,effect_possible:false});let stale=true,opens=0;
 const f=await sourceNavigation(t,undefined,{
  nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),preflight:ok,reconcile:ok,
   activateWorkflow:async()=>{f.showGraph();return {...await ok(),status:'SUCCEEDED',document_id:'doc',workflow_ref:workflow};}}),
  nodeApplyHandlers:new Map([['imports.text',{revision:'1',modes:['delimited'],validate:()=>{},configure:ok}]]),
  nodeApplyDriverFactory:context=>({
   verifySource:createTextImportNodeSupport({}).nodeApplyDriverFactory(context).verifySource,
   mapPorts:ok,openWizard:async()=>{opens++;if(stale){stale=false;throw new NodeProcedureStepError({
    status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true,error:{code:'UI_REFERENCE_STALE',message:'Observed control replaced'}});}return ok();},
   finish:async mode=>({...await ok(),mode,execution_started:false}),waitExecution:ok,readOutput:()=>assert.fail('no old rows may be read'),
   verifyContinuation:async()=>true,releasePending:async()=>({...await ok(),node_context:node,cleanup:{wizard_closed:false}}),
  }),
 });
 const source=f.result.output.source,request={operation_id:'import-first',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
  target:{kind:'existing',type:'imports.text',ref:node},inputs:[],mode:'delimited',parameters:{source:{kind:'storage',server_source_ref:source.server_source_ref},
   settings:{source:{source_path:'/worker/full.csv'}}},mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},
  budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 f.runtime.startNodeApply(request);
 const first=await f.runtime.waitNodeApply(request.operation_id,{timeoutMs:10000});
 assert.equal(first.outcome.error?.cause?.code,'UI_REFERENCE_STALE',JSON.stringify(first));
 const released=await f.runtime.recover(request.operation_id,{strategy:'abandon_operation',recoveryOperationId:'release-import'});
 assert.equal(released.status,'SUCCEEDED');
 if(change==='bytes')f.native.bytes++;
 if(change==='mtime')f.native.mtime='replaced';
 const deadline=f.page.clock+request.budgets.total_ms,click=f.page.click;
 f.page.click=async item=>{f.page.clock+=2000;return click(item);};
 f.runtime.startNodeApply({...request,operation_id:'import-retry'});
 const retry=await f.runtime.waitNodeApply('import-retry',{timeoutMs:10000});
 if(change==='unchanged'){
  assert.equal(retry.outcome.status,'SUCCEEDED',JSON.stringify(retry));assert.equal(opens,2);
 }else{
  assert.equal(retry.outcome.error.code,'LOGINOM_FILE_CHANGED',JSON.stringify(retry));
  assert.equal(retry.outcome.effect_possible,false);assert.equal(opens,1);
  assert.deepEqual(retry.outcome.output.output.ports,[]);
 }
 assert.ok(f.page.events.filter(e=>e==='mouse_click').length>=2,'retry must reacquire Files through the guarded UI');
 assert.equal(f.records.find(e=>e.operation_id==='import-retry'&&e.phase==='node_apply_prepared').deadline_at,deadline);
});

for(const fault of [undefined,'replaced'])test('source navigation reissues observation/ref after proven no-effect epoch refusal: '+fault,async t=>{
 const f=await sourceNavigation(t,fault);
 assert.equal(f.result.status,'SUCCEEDED',JSON.stringify(f.records.find(r=>r.phase==='storage_source_failed')??f.result));
 const actions=f.records.filter(r=>r.phase==='completed'&&r.action_key==='ui.act');
 assert.equal(actions.length,2);assert.equal(actions[0].outcome.error.code,'UI_EPOCH_CHANGED');
 assert.equal(actions[0].outcome.effect_possible,false);assert.equal(actions[1].outcome.status,'SUCCEEDED');
 assert.notEqual(actions[0].parameters.observation_id,actions[1].parameters.observation_id);
 if(fault==='replaced')assert.notEqual(actions[0].parameters.action.ref,actions[1].parameters.action.ref);
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,1);assert.equal(f.refreshed,true);
 assert.ok(f.deadlines.length);assert.ok(f.deadlines.every(d=>d-1000<runtimeCallTimeout('dock_storage_source',{})));
});
for(const fault of ['owner','directory','target'])test('source epoch refresh refuses changed '+fault,async t=>{
 const f=await sourceNavigation(t,fault);assert.equal(f.result.status,'FAILED');
 assert.equal(f.page.events.filter(e=>e==='mouse_click').length,0);
 assert.equal(f.records.filter(r=>r.phase==='completed'&&r.action_key==='ui.act').length,1);
});

for(const change of ['unchanged','bytes','mtime'])test('deferred source validation restores Files before a new Execute: '+change,async t=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'import'},group={...node,node_id:'group'};
 const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
  navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Сервер',label:''}]};
 const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[
  {ref:node,type:'imports.text',label:'Source',inputs:[],outputs:[0]},
  {ref:group,type:'transform.group_data',label:'Group',inputs:[],outputs:[0]}],links:[],foreign_links:[]};
 const scan={basis:'backend_exact_scan',profile_id:'p',records:1,bytes:3,sha256:'a'.repeat(64),identity:{canonical_path:'/cache/full.csv',size:3,file_id:'1:2'}};
 const ok=async()=>({verified:true,cleanup_complete:true,effect_possible:false});let executions=0;
 const f=await sourceNavigation(t,undefined,{
  nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),preflight:ok,reconcile:ok,
   activateWorkflow:async()=>{f.showGraph();return {...await ok(),status:'SUCCEEDED',document_id:'doc',workflow_ref:workflow};}}),
  nodeApplyHandlers:new Map(['imports.text','transform.group_data'].map(type=>[type,{revision:'1',modes:['delimited'],validate:()=>{},configure:ok}])),
  nodeApplyDriverFactory:context=>({verifySource:async()=>{
   const checked=await verifyDeferredTextImportSources(context.operation.parameters,context.nodeHistory(),context.resolveStorageSource);
   return {...await ok(),...(context.operation.parameters.target.type==='imports.text'
    ?{source:{kind:'verified_delivery',bytes:3,sha256:scan.sha256,native_source:await context.resolveStorageSource(context.operation.parameters.parameters.source.server_source_ref)}}
    :{switched_sources:checked})};
  },mapPorts:ok,openWizard:ok,finish:async mode=>{if(mode==='execute')executions++;return {...await ok(),mode,execution_started:mode==='execute',execution_id:mode==='execute'?'exec':null};},
   waitExecution:async()=>({...await ok(),status:'completed',execution_id:'exec'}),readOutput:async()=>{
    assert.equal(executions,1,'output is read only after this execution');
    return {...await ok(),status:'complete',execution_id:'exec',evidence_ref:'fresh-execution',ports:[]};
   },verifyContinuation:async()=>true}),
 });
 const request={operation_id:'switch-done',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,target:{kind:'existing',type:'imports.text',ref:node},
  inputs:[],mode:'delimited',parameters:{source:{kind:'storage',server_source_ref:f.result.output.source.server_source_ref},source_switch:{profile_id:'p',save_operation_id:'saved'}},
  mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 f.runtime.startNodeApply(request,{scanReceipt:scan});
 assert.equal((await f.runtime.waitNodeApply('switch-done',{timeoutMs:10000})).outcome.status,'SUCCEEDED');
 if(change==='bytes')f.native.bytes++;
 if(change==='mtime')f.native.mtime='replaced';
 f.runtime.startNodeApply({...request,operation_id:'execute-group',target:{kind:'existing',type:'transform.group_data',ref:group},parameters:{},finish:'execute'});
 const result=await f.runtime.waitNodeApply('execute-group',{timeoutMs:10000});
 if(change==='unchanged'){assert.equal(result.outcome.status,'SUCCEEDED',JSON.stringify(result));assert.equal(executions,1);}
 else {assert.equal(result.outcome.error.code,'LOGINOM_FILE_CHANGED');assert.match(result.outcome.error.message,/native storage size\/mtime/);
  assert.equal(result.outcome.effect_possible,false);assert.deepEqual(result.outcome.output.output.ports,[]);assert.equal(executions,0);}
});

test('source lookup reads only a delivered scroll anchor before rechecking a newly rendered row',async t=>{
 const f=await fixture(t),page=new Page(),base=page.uiSnapshot(),table='ui-table',file='ui-file',nav='ui-navigation';let queries=0,tableReads=0;
 const element=(ref,tid)=>({ref,tid,kind:'region',label:'',allowed_actions:[],identity:{anchor_tid:tid,path:[]}});
 const tableTid=page.prefix+';FileStorageForm;pnlFileStorage;tbl',fileTid=page.prefix+';FileStorageForm;colName_full.csv';
 const evaluate=page.evaluate.bind(page);
 page.evaluate=async(fn,arg)=>{
  if(!fn.toString().includes("Symbol.for('loginom-dock.workspace-ui.identity.v1')"))return evaluate(fn,arg);
  page.clock+=5000;
  const state=structuredClone(base);state.active_tab_ref='files';
  if(arg.discoverRoots){state.observation_kind='roots';state.ui.elements=arg.storageName
   ?(++queries>1?[element(file,fileTid)]:[]):[element(nav,page.prefix+';NavigationBar;NavigationPanel'),element(table,tableTid)];return state;}
  state.file_storage={status:'observed',directory:'/worker'};state.observation_root={ref:arg.rootRef,identity:{anchor_tid:arg.rootRef===table?tableTid:arg.rootRef===file?fileTid:page.prefix+';NavigationBar;NavigationPanel',path:[]}};
  if(arg.rootRef===table){tableReads++;state.ui.elements=Array.from({length:60},(_,i)=>({...element('ui-row-'+i,page.prefix+';FileStorageForm;colName_row'+i),
   kind:'control',label:'row'+i,description:'x'.repeat(1800),scroll:{ref:'ui-scroll',top:0,max_top:28633},allowed_actions:['scroll'],interaction:{state:'point_observed'}}));}
  else if(arg.rootRef===file)state.ui.elements=[{...element(file,fileTid),label:'full.csv',storage_entry:{kind:'file',path:'/worker/full.csv',bytes:3,mtime:'native-time',bytes_source:'native_file_store'}}];
  else state.ui.elements=[];
  return state;
 };
 const started=page.clock,r=runtime(page,{cacheDirectory:join(f.root,'bounded-pages'),getStorageBinding:()=>({session_id:'s',document_id:'d',origin:base.origin,
  loginom_account:'worker',directories:{inputs:'/worker',packages:'/worker',exports:'/worker'}})});
 const result=await r.serverDownload({operation_id:'bounded-source',path:'/worker/full.csv'},'dock_storage_source');
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(result.output.source.bytes,3);
 assert.equal(tableReads,1);assert.ok(page.clock-started<90000);assert.equal(page.events.filter(e=>e==='mouse_click').length,0);
});

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
test('complete native bytes allow cache finalization under the original absolute deadline',async t=>{
 const f=await fixture(t);let clock=0;
 const native={...source(),bytes:2*1024**3};
 const registry=createServerDownloadRegistry({directory:join(f.root,'finalizing'),now:()=>clock,inspect:async()=>native,
  download:async({path,onProgress,signal})=>{
   clock=60000;onProgress(native.bytes);
   clock=190000;onProgress(native.bytes);signal.throwIfAborted();
   await writeFile(path,'');await truncate(path,native.bytes);
  }});
 registry.start(f.request);const result=await settled(registry);
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 assert.equal(result.progress.deadline_at,serverDownloadBudget(native.bytes));
 assert.equal(result.progress.elapsed_ms,190000);
 assert.equal((await stat(result.output.path)).size,native.bytes);await registry.cleanup();
});
test('complete native bytes never extend the absolute deadline or authorize an unverified cache',async t=>{
 for(const fault of ['deadline','native','copy']){
  const f=await fixture(t);let clock=0,reads=0;
  const native={...source(),bytes:2*1024**3};
  const registry=createServerDownloadRegistry({directory:join(f.root,'finalizing-'+fault),now:()=>clock,
   inspect:async()=>({...native,mtime:++reads>1&&fault==='native'?'changed':native.mtime}),
   download:async({path,onProgress,signal})=>{
    clock=60000;onProgress(native.bytes);
    clock=fault==='deadline'?serverDownloadBudget(native.bytes):190000;
    onProgress(native.bytes);signal.throwIfAborted();
    await writeFile(path,'');await truncate(path,native.bytes-(fault==='copy'?1:0));
   }});
  registry.start(f.request);const result=await settled(registry);
  assert.equal(result.status,'FAILED',JSON.stringify(result));
  assert.equal(result.error.code,fault==='deadline'?'LOGINOM_DOWNLOAD_DEADLINE':'LOGINOM_FILE_CHANGED');
  assert.equal(result.progress.deadline_at,serverDownloadBudget(native.bytes));
  assert.equal(result.cleanup_complete,true);
  assert.deepEqual(await readdir(join(f.root,'finalizing-'+fault)),[]);
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
