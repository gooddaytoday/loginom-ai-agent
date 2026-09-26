import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {discoverArtifactAndDownload,waitArtifactDiscoveryReady,makeArtifactDiscoveryDownloadCode} from '../lib/artifact-discovery.mjs';
function fixture(fault) {
 const moves=[],deadlines=[];let top=0,downloads=0,refreshes=0,waits=0,directoryReads=0,settlements=0,nativeChecks=0;
 const prefix='MF;TF-2',name='source.csv',fileTid=prefix+';FileStorageForm;colName_'+name;
 const snapshot={authenticated:true,origin:'https://test',loginom_build:'7.4.2',workflow_ref:{prefix},dom_epoch:{document:'doc',revision:1},
  active_tab_ref:'tab',package_identity:null,file_storage:{status:'observed',directory:'/user/dock-p3'},observation_root:{ref:'nav'},ui:{elements:[],masks:[],dialogs:[]}};
 const task={snapshot,artifact:{name,bytes:42,upload:{directory:'/user/dock-p3'}},expected_origin:'https://test',expected_build:'7.4.2',operation_id:'verify'};
 const owner={isConnected:true,scrollHeight:2500,clientHeight:500,contains:e=>e===owner,
  getBoundingClientRect:()=>({x:0,y:100,width:800,height:500}),get scrollTop(){return top;},set scrollTop(v){moves.push(v);top=v;}};
 const state={observer:{takeRecords:()=>[]},epoch:'doc',revision:1};
 const context=vm.createContext({document:{querySelectorAll:()=>fault==='owner'?[{}]:[owner],elementFromPoint:()=>fault==='blocked'?{}:owner},getComputedStyle:()=>({display:'block',visibility:'visible'})});
 context[Symbol.for('loginom-dock.workspace-ui.identity.v1')]=state;
 const page={waitForTimeout:async()=>{waits++},locator:selector=>({count:async()=>fault==='refresh_duplicate'?2:1,isVisible:async()=>fault!=='refresh_hidden',isEnabled:async()=>fault!=='refresh_disabled'&&!(fault==='refresh_native_control'&&nativeChecks>0),
  click:async()=>{if(selector.includes('btnRefresh')){refreshes++;if(fault==='refresh_native_lost')throw Error('Lost Refresh response');}},elementHandle:async()=>({dispose:async()=>{},evaluate:async(fn,arg)=>{
   const result=vm.runInContext('('+fn.toString()+')',context)(owner,arg);
   if(fault==='lost_scroll')throw Error('Transport lost after movement');return result;
 }})})};
 const ui=async(p,options)=>{
  const s=structuredClone(snapshot);
  if(options.root_ref==='nav')directoryReads++;
  if(fault?.startsWith('refresh_busy')&&directoryReads===2){
   s.ui.masks=[{kind:'busy',target_tid:prefix+';FileStorageForm',dialog_ref:null}];
   if(fault==='refresh_busy_foreign')s.ui.masks[0].target_tid='foreign';
  }
  if(fault==='refresh_busy_owner'&&directoryReads>=3)s.active_tab_ref='foreign';
  if(fault==='refresh_context'&&directoryReads>1||fault==='refresh_native_context'&&nativeChecks>0)s.active_tab_ref='foreign';
  if(fault==='directory'&&moves.length)s.file_storage.directory='/foreign';
  if(options.discover_roots&&(top>=1400||(fault==='empty'||fault?.startsWith('refresh_busy')||fault?.startsWith('refresh_native'))&&refreshes>0)&&fault!=='absent')s.ui.elements=[{tid:fileTid,ref:'file'}];
  if(options.root_ref==='file')s.ui.elements=[{tid:fileTid,ref:'file',label:name,storage_entry:{bytes:fault==='pending_size'&&refreshes===0?0:42}}];
  return {status:'SUCCEEDED',output:s};
 };
 const download=async(p,t)=>{downloads++;assert.equal(t.file_ref,'file');assert.equal(t.snapshot.ui.elements[0].label,name);
  if(fault==='lost_download')throw Error('Lost downloader response');
  return {status:'SUCCEEDED',effect_possible:true,cleanup_complete:true,trace:[{event:'download_saved'}]};};
 const ready=async(p,t,deadline,trace,minimum=null,refresh=null)=>{
  deadlines.push(deadline);
  if(trace.at(-1)?.event==='artifact_directory_settlement'){
   settlements++;
   if(fault==='refresh_busy_deadline')throw Error('DISCOVERY_READY_DEADLINE');
  }
  if(refresh)await refresh(async()=>{nativeChecks++;return fault!=='refresh_native_limit'&&(!fault?.startsWith('refresh_native')||nativeChecks>1);});
  if(fault==='readiness_timeout'||fault==='refresh_timeout'&&refreshes)throw Error('Readiness timeout');
  if(minimum!==null)assert.ok(refreshes>=minimum);
  return {load_count:refreshes,empty_native_store:(fault==='empty'||fault?.startsWith('refresh_'))&&refreshes===0};
 };
 return {run:()=>discoverArtifactAndDownload(page,task,ui,download,()=>{},ready),moves,deadlines,get settlements(){return settlements;},get downloads(){return downloads;},get refreshes(){return refreshes;},get waits(){return waits;}};
}
test('ready to same-owner busy to ready settles read-only then refreshes and downloads once',async()=>{
 const f=fixture('refresh_busy'),r=await f.run();assert.equal(r.status,'SUCCEEDED');assert.equal(f.settlements,1);
 assert.equal(f.refreshes,1);assert.equal(f.downloads,1);assert.equal(f.waits,0);assert.deepEqual(f.moves,[]);
 assert.equal(new Set(f.deadlines).size,1);
 assert.equal(r.trace.find(e=>e.event==='artifact_refresh_dispatch_preconditions').masks_count,0);
});
test('native busy preflight requires a fresh directory preflight before the only Refresh',async()=>{
 const f=fixture('refresh_native_busy'),r=await f.run();
 assert.equal(r.status,'SUCCEEDED');assert.equal(f.refreshes,1);assert.equal(f.downloads,1);
 assert.deepEqual(f.moves,[]);assert.equal(new Set(f.deadlines).size,1);
 assert.deepEqual(r.trace.filter(e=>e.event==='artifact_refresh_dispatch_preconditions').map(e=>e.attempt),[0,1]);
});
test('lost Refresh after native busy settlement remains ambiguous and is not retried',async()=>{
 const f=fixture('refresh_native_lost'),r=await f.run();
 assert.equal(r.status,'AMBIGUOUS');assert.equal(r.effect_possible,true);assert.equal(r.cleanup_complete,false);
 assert.equal(f.refreshes,1);assert.equal(f.downloads,0);
 assert.deepEqual(r.trace.filter(e=>e.event==='artifact_refresh_dispatch_preconditions').map(e=>e.attempt),[0,1]);
});
test('repeated pre-dispatch busy races exhaust a bounded preflight without a gesture',async()=>{
 const f=fixture('refresh_native_limit'),r=await f.run();
 assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);
 assert.equal(f.refreshes,0);assert.equal(f.downloads,0);
 assert.equal(r.trace.filter(e=>e.event==='artifact_refresh_dispatch_preconditions').length,16);
 assert.match(r.trace.at(-1).message,/PREFLIGHT_LIMIT/);
 assert.equal(new Set(f.deadlines).size,1);
});
test('new preflight after native settlement rechecks directory owner and Refresh control',async()=>{
 for(const fault of ['refresh_native_context','refresh_native_control']){
  const f=fixture(fault),r=await f.run();
  assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);
  assert.equal(f.refreshes,0);assert.equal(f.downloads,0);
  assert.match(r.trace.at(-1).message,fault.endsWith('context')?/CONTEXT_CHANGED/:/CONTROL_CHANGED/);
 }
});
test('busy settlement refuses changed owner, foreign mask or deadline without Refresh or download',async()=>{
 for(const fault of ['refresh_busy_owner','refresh_busy_foreign','refresh_busy_deadline']){
  const f=fixture(fault),r=await f.run();assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);
  assert.equal(f.refreshes,0);assert.equal(f.downloads,0);assert.deepEqual(f.moves,[]);assert.equal(new Set(f.deadlines).size,1);
  assert.equal(f.settlements,fault==='refresh_busy_foreign'?0:1);
 }
});
test('confirmed empty directory refreshes once then downloads without scrolling or fixed sleep',async()=>{
 const f=fixture('empty'),r=await f.run();assert.equal(r.status,'SUCCEEDED');assert.equal(f.refreshes,1);assert.equal(f.downloads,1);
 assert.deepEqual(f.moves,[]);assert.equal(f.waits,0);
});
test('Refresh refusal records the exact context or control precondition before any gesture',async()=>{
 for(const fault of ['refresh_context','refresh_duplicate','refresh_hidden','refresh_disabled']){
  const f=fixture(fault),r=await f.run();assert.equal(r.status,'NOT_APPLIED');assert.equal(f.refreshes,0);assert.equal(f.downloads,0);
  const reason=r.trace.find(e=>e.event==='artifact_refresh_refused');assert.equal(reason.reason,fault==='refresh_context'?'directory_context':'control_unavailable');
  if(fault==='refresh_context')assert.equal(r.trace.find(e=>e.event==='artifact_refresh_preconditions').tab_matches,false);
  else {const control=r.trace.find(e=>e.event==='artifact_refresh_control');assert.equal(control.count,fault==='refresh_duplicate'?2:1);
   if(fault==='refresh_hidden')assert.equal(control.visible,false);if(fault==='refresh_disabled')assert.equal(control.enabled,false);}
 }
});
test('readiness timeout before any gesture is no-effect; timeout after refresh remains ambiguous',async()=>{
 for(const fault of ['readiness_timeout','refresh_timeout']){
  const f=fixture(fault),r=await f.run();assert.equal(f.downloads,0);assert.deepEqual(f.moves,[]);
  assert.equal(r.status,fault==='readiness_timeout'?'NOT_APPLIED':'AMBIGUOUS');
  assert.equal(r.effect_possible,fault==='refresh_timeout');assert.equal(f.refreshes,fault==='refresh_timeout'?1:0);
 }
});
test('private discovery reveals a buffered authorized row and delegates exactly one download',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'SUCCEEDED');assert.deepEqual(f.moves,[700,1400]);assert.equal(f.downloads,1);
 assert.equal(r.trace.filter(e=>e.event==='artifact_discovery_scroll').length,2);assert.equal(r.trace.at(-1).event,'download_saved');
});
test('private discovery refreshes a cached pending row before downloading exact server-side bytes',async()=>{
 const f=fixture('pending_size'),r=await f.run();assert.equal(r.status,'SUCCEEDED');assert.equal(f.downloads,1);assert.ok(f.waits>=1);
 assert.equal(f.refreshes,1);
 assert.ok(r.trace.some(e=>e.event==='artifact_file_size_verified'&&e.bytes===42));
});
for(const fault of ['owner','blocked','directory','absent','lost_scroll','lost_download'])test('discovery preserves '+fault+' without another download',async()=>{
 const f=fixture(fault),r=await f.run();assert.notEqual(r.status,'SUCCEEDED');assert.ok(f.downloads<=1);
 if(['owner','blocked'].includes(fault)){assert.equal(r.effect_possible,false);assert.deepEqual(f.moves,[]);}
 if(['lost_scroll','lost_download'].includes(fault)){assert.equal(r.status,'AMBIGUOUS');assert.equal(r.cleanup_complete,false);}
});

test('host accepts a discovered reference only for the prepared document tab workflow and file',async()=>{
 const {verifiedDiscoveryReference}=await import('../lib/artifact-discovery.mjs');
 const artifact={name:'input.csv',upload:{directory:'/user/dock-p3'}};
 const binding={document:'doc',active_tab_ref:'tab',workflow_ref:{prefix:'MF;TF-2'}};
 const raw={output:{file_ref:'ui-file'},trace:[{event:'artifact_file_discovered',file_ref:'ui-file',file_tid:'MF;TF-2;FileStorageForm;colName_input.csv',
  directory:'/user/dock-p3',...binding}]};
 assert.equal(verifiedDiscoveryReference(artifact,binding,raw),'ui-file');
 for(const key of ['file_ref','file_tid','directory','document','active_tab_ref','workflow_ref']){
  const changed=structuredClone(raw);changed.trace[0][key]='foreign';assert.throws(()=>verifiedDiscoveryReference(artifact,binding,changed),/not bound/);
 }
 const duplicate=structuredClone(raw);duplicate.trace.push(duplicate.trace[0]);assert.throws(()=>verifiedDiscoveryReference(artifact,binding,duplicate));
});

// Execute the serialized browser predicates in an isolated realm; no browser or
// application globals in the test process are changed.
function nativeFixture({empty=false,parent=false,blocked=false,loading=false,mask=false,incomplete=false}={}) {
 const prefix='MF;TF-2',gridTid=prefix+';FileStorageForm;pnlFileStorage;tbl',rootTid=prefix+';FileStorageForm';
 const rect=()=>({x:0,y:0,width:800,height:500});
 const element=(tid,text='')=>({isConnected:true,textContent:text,className:'test',getBoundingClientRect:rect,
  getAttribute:name=>name==='data-tid'?tid:null,contains(other){return other===this;}});
 const tab=element('tab');tab.classList={contains:()=>true};
 const grid=element(gridTid);grid.id='grid';
 const placeholder=element('empty','Папка пуста. Перетащите файлы в эту область, чтобы загрузить их');
 const root=element(rootTid);root.contains=e=>[root,grid,placeholder].includes(e);placeholder.parentElement=root;
 const parentCell=element(prefix+';FileStorageForm;colName_..','..');parentCell.closest=()=>({getAttribute:()=> 'parent-record'});
 grid.querySelectorAll=selector=>selector.includes('data-tid^')&&parent?[parentCell]:[];
 const records=parent?[{internalId:'parent-record'}]:empty?[]:[{internalId:'file-record'}];
 const store={$className:'Ext.data.Store',loadCount:1,isLoading:()=>loading,getData:()=>({items:records}),getCount:()=>records.length,
  getTotalCount:()=>records.length+(incomplete?1:0)};
 let currentStore=store;
 const view={el:{dom:grid},getStore:()=>currentStore};
 const card={Controller:{Node:{data:{node:{}}}}};let active=card,hit=blocked?element('foreign'):empty||parent?placeholder:grid;
 const doc={querySelectorAll:selector=>selector.includes('x-mask')?mask?[mask==='foreign'?element('foreign-mask'):root]:[]:selector.includes('role=')?[]:
  selector==='[data-tid='+JSON.stringify(gridTid)+']'?[grid]:selector==='[data-tid="tab"]'?[tab]:selector==='[data-tid='+JSON.stringify(rootTid)+']'?[root]:[],
  elementFromPoint:()=>hit};
 const realm=vm.createContext({document:doc,location:{origin:'https://test'},getComputedStyle:()=>({visibility:'visible'}),
  bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>active}}}}}}},Ext:{getCmp:()=>view}});
 realm[Symbol.for('loginom-dock.workspace-ui.identity.v1')]={epoch:'doc'};
 const invoke=(fn,args)=>vm.runInContext('('+fn.toString()+')',realm)(args);
 let disposed=0,waits=0,onWait=()=>{loading=false;mask=false;root.className='test';if(!blocked)hit=empty||parent?placeholder:grid;store.loadCount++;};
 const timeouts=[];
 const page={evaluateHandle:async(fn,arg)=>{const value=invoke(fn,arg);value.dispose=async()=>{disposed++;};return value;},
  evaluate:async(fn,arg)=>invoke(fn,arg),waitForFunction:async(fn,arg,options)=>{
   assert.equal(typeof fn,'function','Playwright string expressions are not invoked with args');
   waits++;timeouts.push(options.timeout);assert.ok(options.timeout>0&&options.timeout<=5000);
   assert.equal(invoke(fn,arg),false,'first unsettled sample must keep polling');onWait();
   if(!invoke(fn,arg))throw Error('Readiness deadline');return {dispose:async()=>{}};
  }};
 const task={snapshot:{workflow_ref:{prefix,tab_tid:'tab'},dom_epoch:{document:'doc'}},expected_origin:'https://test',expected_build:'7.4.2',artifact:{name:'source.csv'}};
 const trace=[];
 return {run:(minimum=null,refresh=null,deadline=Date.now()+5000)=>waitArtifactDiscoveryReady(page,task,deadline,trace,minimum,refresh),trace,task,
  replaceStore:()=>{currentStore={...store};},
  startBusy:(foreign=false)=>{loading=true;mask=foreign?'foreign':true;root.className='bg-mask-message';hit=root;},
  failWait:()=>{onWait=()=>{throw Error('Original readiness deadline');};},
  foreignDuringWait:()=>{onWait=()=>{mask='foreign';};},
  timeouts,
  advanceLoad:()=>{store.loadCount++;},
  changeOwner:()=>{onWait=()=>{active={...card};};},get waits(){return waits;},get disposed(){return disposed;}};
}
test('native readiness waits for store load and mask settlement under the supplied deadline',async()=>{
 const f=nativeFixture({loading:true,mask:true}),r=await f.run(2);
 assert.equal(r.ready,true);assert.equal(r.load_count,2);assert.equal(f.waits,1);assert.equal(f.disposed,1);
});
test('expired discovery deadline never starts a fresh wait or Refresh',async()=>{
 const f=nativeFixture({loading:true});let clicks=0;
 await assert.rejects(f.run(null,async()=>{clicks++;},Date.now()-1),/DEADLINE/);
 assert.equal(f.waits,0);assert.equal(clicks,0);assert.equal(f.disposed,1);
});
test('Refresh retains the original native store through load-generation settlement',async()=>{
 const f=nativeFixture({empty:true});let clicks=0;
 const result=await f.run(null,async()=>{clicks++;});assert.equal(result.load_count,2);assert.equal(clicks,1);assert.equal(f.disposed,1);
 const changed=nativeFixture({empty:true});
 await assert.rejects(changed.run(null,async()=>changed.replaceStore()),/OWNER_CHANGED/);assert.equal(changed.disposed,1);
 const raced=nativeFixture({empty:true});
 const settled=await raced.run(null,async check=>{raced.advanceLoad();await check();});
 assert.equal(settled.load_count,3);assert.equal(raced.waits,1);
 const beforeDispatch=nativeFixture({empty:true});let dispatched=0;
 await assert.rejects(beforeDispatch.run(null,async check=>{
  beforeDispatch.replaceStore();await check();dispatched++;
 }),/OWNER_CHANGED/);
 assert.equal(dispatched,0);assert.equal(beforeDispatch.waits,0);assert.equal(beforeDispatch.disposed,1);
});
test('ready-to-busy race before Refresh settles the held native binding without sending a gesture',async()=>{
 const f=nativeFixture({empty:true,parent:true});let clicks=0;
 const result=await f.run(null,async check=>{
  f.startBusy();
  assert.equal(await check(),false);assert.equal(clicks,0);
  assert.equal(await check(),true);clicks++;
 });
 assert.equal(clicks,1);assert.equal(result.load_count,3);assert.equal(f.waits,2);assert.equal(f.disposed,1);
 const native=f.trace.filter(e=>e.event==='artifact_refresh_native_preflight');
 assert.equal(native[0].loading,true);assert.equal(native[0].busy_same_owner,true);assert.equal(native[0].load_count,1);
 assert.equal(native[1].ready,true);assert.equal(native[1].load_count,2);
 assert.ok(f.timeouts[1]<=f.timeouts[0]);
});
test('native pre-Refresh settlement refuses owner/store change, foreign mask and expired wait without gesture',async()=>{
 for(const fault of ['store','owner','foreign','foreign_late','deadline']){
  const f=nativeFixture({empty:true});let clicks=0;
  await assert.rejects(f.run(null,async check=>{
   f.startBusy(fault==='foreign');
   if(fault==='store')f.replaceStore();
   if(fault==='owner')f.changeOwner();
   if(fault==='deadline')f.failWait();
   if(fault==='foreign_late')f.foreignDuringWait();
   if(await check()===false)await check();
   clicks++;
  }),fault==='store'||fault==='owner'?/OWNER_CHANGED/:fault.startsWith('foreign')?/BLOCKED/:/deadline/);
  assert.equal(clicks,0);assert.equal(f.disposed,1);assert.ok(f.waits<=1);
 }
});
test('native empty dropzone requires complete local store including optional parent row',async()=>{
 for(const parent of [false,true]){
  const f=nativeFixture({empty:true,parent}),r=await f.run();assert.equal(r.empty_native_store,true);
  assert.equal(r.complete,true);assert.equal(r.only_parent,parent);assert.equal(r.placeholder,true);
  assert.equal(r.materialized_length,parent?1:0);assert.equal(f.waits,0);assert.equal(f.disposed,1);
 }
 const f=nativeFixture({empty:true,incomplete:true});await assert.rejects(f.run(),/deadline/);
 const terminal=f.trace.at(-1);assert.equal(terminal.complete,false);assert.equal(terminal.total,1);assert.equal(terminal.count,0);
 assert.equal(terminal.store_class,'Ext.data.Store');assert.equal(terminal.placeholder,true);assert.equal(f.disposed,1);
});
test('foreign cover and changed native owner cannot be admitted as an empty directory',async()=>{
 const f=nativeFixture({empty:true,blocked:true});await assert.rejects(f.run(),/deadline/);
 assert.equal(f.trace.at(-1).empty_native_store,false);assert.equal(f.trace.at(-1).hit.tid,'foreign');
 const changed=nativeFixture({loading:true});changed.changeOwner();await assert.rejects(changed.run(),/OWNER_CHANGED/);assert.equal(changed.disposed,1);
});
test('generated discovery includes its readiness function without a module closure',()=>{
 const f=nativeFixture();const task={...f.task,artifact:{name:'source.csv',upload:{directory:'/user'}},
  snapshot:{...f.task.snapshot,observation_root:{ref:'nav'},file_storage:{status:'observed',directory:'/user'}}};
 const code=makeArtifactDiscoveryDownloadCode(task,{download:async()=>{},reveal:async()=>{}});
 assert.equal(typeof vm.runInNewContext('('+code+')'),'function');assert.match(code,/DISCOVERY_READY_OWNER_CHANGED/);
});
