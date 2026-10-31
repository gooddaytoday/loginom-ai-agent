import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Page,build,runtime} from './support/executor-fixture.mjs';
import {mkdtemp,writeFile,rm,readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createArtifactStore} from '../lib/artifacts.mjs';
import {withStorageIdentity} from '../lib/storage-policy.mjs';
import {parseCapabilityResult} from '../lib/executor.mjs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {makeArtifactDownloadCode,makeNativeOutputDownloadCode,makeServerSourceDownloadCode,browserServerDownloadControl} from '../lib/executor.mjs';

function fixture(name = 'sales.csv') {
  const page=new Page(),elements=page.elements.bind(page),snapshot=page.uiSnapshot.bind(page);
  const tid=page.prefix+';FileStorageForm;colName_'+name;
  page.elements=()=>[...elements(),page.element(tid,{label:name,kind:'file'})];
  page.directory='/test';
  page.uiSnapshot=()=>({...snapshot(),file_storage:{status:'observed',directory:page.directory,listing_complete:false}});
  const observed=page.uiSnapshot(),file=observed.ui.elements.find(item=>item.tid===tid);
  const artifact={artifact_id:'a',name,bytes:3,sha256:'a'.repeat(64),upload:{grant_id:'g',directory:'/test',destination:'/test/'+name}};
  const options={artifact,snapshot:observed,file_ref:file.ref,observation_id:'read',operation_id:'download',upload_operation_id:'upload',
    expected_origin:'https://loginom.invalid',expected_build:build,download_path:'/private/new-download/'+name};
  const calls=[];let resolveDownload;
  const download={url:()=> 'https://loginom.invalid/download?private=not-for-output',suggestedFilename:()=>name,
    saveAs:async path=>{assert.equal(path,options.download_path);calls.push('save');},failure:async()=>null,cancel:async()=>{calls.push('cancel');}};
  page.waitForEvent=async type=>{assert.equal(type,'download');calls.push('listen');return new Promise(resolve=>{resolveDownload=resolve;});};
  const click=page.mouse.click;
  page.mouse.click=async(...args)=>{calls.push('click');await click(...args);resolveDownload?.(download);};
  return {page,options,download,calls,run:()=>page.execute(makeArtifactDownloadCode(options))};
}

test('server-only browser download retains its native Download, drains cancellation and never sends bytes',async()=>{
 const f=fixture(),snapshot=f.page.uiSnapshot.bind(f.page);
 // The real MCP unsafe-code VM exposes page only, with no Node timer globals.
 await f.page.execute('async page=>null');
 const native={kind:'file',path:'/test/sales.csv',bytes:2147483648,bytes_source:'native_file_store',mtime:'native-time'};
 f.page.uiSnapshot=()=>{const s=snapshot();s.ui.elements.find(e=>e.ref===f.options.file_ref).storage_entry=structuredClone(native);return s;};
 f.options.snapshot=f.page.uiSnapshot();delete f.options.artifact.upload;
 f.options.server_source_binding={directory:'/test',destination:native.path,bytes:native.bytes,mtime:native.mtime};
 f.options.deadline_at=Date.now()+10000;
 let finish;
 f.download.saveAs=async()=>{f.calls.push('save');await new Promise(resolve=>{finish=resolve;});};
 f.download.cancel=async()=>{f.calls.push('cancel');finish?.();};
 f.download.delete=async()=>{f.calls.push('delete');};
 const started=await f.page.execute(makeServerSourceDownloadCode(f.options));
 assert.equal(started.status,'SUCCEEDED');assert.equal(started.output.download_started,true);
 assert.deepEqual(f.calls,['listen','click','save']);
 const control=mode=>{f.page.context=null;return f.page.execute(`async page=>(${browserServerDownloadControl.toString()})(page,${JSON.stringify({operation_id:f.options.operation_id,mode})})`);};
 assert.equal((await control('status')).output.state,'running');
 assert.equal((await control('cancel')).output.state,'settled');
 await control('release');assert.deepEqual(f.calls,['listen','click','save','cancel','delete']);
 assert.equal((await control('status')).status,'FAILED');
});

test('retained server precondition refusal releases without a nonexistent Download',async()=>{
 const f=fixture(),snapshot=f.page.uiSnapshot.bind(f.page);
 const native={kind:'file',path:'/test/sales.csv',bytes:3,bytes_source:'native_file_store',mtime:'native-time'};
 f.page.uiSnapshot=()=>{const s=snapshot();s.ui.elements.find(e=>e.ref===f.options.file_ref).storage_entry=structuredClone(native);return s;};
 f.options.snapshot=f.page.uiSnapshot();delete f.options.artifact.upload;
 f.options.server_source_binding={directory:'/test',destination:native.path,bytes:3,mtime:native.mtime};
 f.options.deadline_at=Date.now()+10000;f.options.browser_downloads_path='/private/browser-downloads';
 const code=makeServerSourceDownloadCode(f.options);native.mtime='changed';
 const start=await f.page.execute(code);assert.equal(start.output.download_started,true);
 const control=mode=>f.page.execute(`async page=>(${browserServerDownloadControl.toString()})(page,${JSON.stringify({operation_id:f.options.operation_id,mode})})`);
 let status=await control('status');
 while(status.output.state==='running'){await new Promise(resolve=>setImmediate(resolve));status=await control('status');}
 assert.equal(status.output.failed,true);assert.equal(status.output.outcome.effect_possible,false);
 assert.equal(status.output.outcome.cleanup_complete,true);assert.deepEqual(f.calls,[]);
 assert.equal((await control('cancel')).output.state,'settled');
 assert.equal((await control('release')).status,'SUCCEEDED');
 assert.equal((await control('status')).error.code,'LOGINOM_DOWNLOAD_MISSING');
});

test('server event and RPC consume the original operation deadline instead of the small artifact timeout',async t=>{
 const f=fixture(),snapshot=f.page.uiSnapshot.bind(f.page),root=await mkdtemp(join(tmpdir(),'server-event-'));
 t.after(()=>rm(root,{recursive:true,force:true}));f.page.clock=Date.now();
 const native={kind:'file',path:'/test/sales.csv',bytes:3,bytes_source:'native_file_store',mtime:'native-time'};
 f.page.uiSnapshot=()=>{const s=snapshot();s.ui.elements.find(e=>e.ref===f.options.file_ref).storage_entry=structuredClone(native);return s;};
 let rpc,eventTimeout,rpcStarted;
 const listeners=new Map();
 const context=()=>({newCDPSession:async()=>({on:(event,callback)=>listeners.set(event,callback),off:event=>listeners.delete(event),
  send:async method=>method==='Target.getTargetInfo'?{targetInfo:{browserContextId:'owned'}}:method==='Page.getFrameTree'?{frameTree:{frame:{id:'frame'}}}:{}})});
 f.page.waitForEvent=async(type,options)=>{
  assert.equal(type,'download');eventTimeout=options.timeout;
  // LAB-386 server4/b:448: a successful gesture, then the native event
  // misses the old 15s window. The external Page owns this delayed event.
  if(options.timeout<20000)throw Object.assign(Error('event has not arrived yet'),{name:'TimeoutError'});
  listeners.get('Browser.downloadWillBegin')?.({guid:'owned',frameId:'frame',suggestedFilename:'sales.csv',url:f.download.url()});
  listeners.get('Browser.downloadProgress')?.({guid:'owned',receivedBytes:3});
  return f.download;
 };
 f.download.saveAs=path=>writeFile(path,'abc');f.download.delete=async()=>{};
 const r=runtime(f.page,{cacheDirectory:join(root,'cache'),getStorageBinding:()=>({session_id:'s',document_id:'d',
  origin:'https://loginom.invalid',loginom_account:'worker',directories:{inputs:'/test',packages:'/test',exports:'/test'}}),
  execute:async(code,options)=>{
   if(code.includes('"download_path":')){
    rpc=options;rpcStarted=f.page.clock;f.page.clock+=5000;
    const page=new Proxy(f.page,{get:(target,key)=>key==='context'?context:Reflect.get(target,key)});
    return structuredClone(await vm.runInContext(`(${code})`,f.page.context)(page));
   }
   return f.page.execute(code);
  }});
 const roots=await r.observe({scope:'roots'});assert.equal(roots.status,'SUCCEEDED',JSON.stringify(roots));
 const file=roots.output.ui.elements.find(e=>e.ref===f.options.file_ref);
 const detail=await r.observe({rootRef:file.ref,observationId:roots.output.observation_id});
 const source=detail.output.ui.elements.find(e=>e.storage_entry?.path===native.path).storage_entry.server_source_ref;
 await r.serverDownload({operation_id:'late-event',server_source_ref:source},'dock_storage_download_start');
 let result;
 do{result=await r.serverDownload({operation_id:'late-event',timeout_ms:100},'dock_storage_download_wait');}while(result.state==='running');
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 assert.equal(eventTimeout,result.progress.deadline_at-f.page.clock);
 assert.equal(rpc.timeout,result.progress.deadline_at-rpcStarted);assert.equal(rpc.timeout-eventTimeout,5000);
 assert.ok(eventTimeout>60000);assert.ok(rpc.signal instanceof AbortSignal);
 assert.equal(result.output.bytes,3);assert.equal(f.calls.filter(c=>c==='click').length,1);
 await r.cleanupServerCache();
});

for(const fault of ['restored','midstream','session','mtime','bytes','partial','unconfirmed','cleanup','deadline','cancel'])test('server cache retains one production download across connection loss: '+fault,async t=>{
 const f=fixture(),snapshot=f.page.uiSnapshot.bind(f.page),root=await mkdtemp(join(tmpdir(),'server-reconnect-'));
 t.after(()=>rm(root,{recursive:true,force:true}));f.page.clock=Date.now();
 const native={kind:'file',path:'/test/sales.csv',bytes:3,bytes_source:'native_file_store',mtime:'native-time'};
 f.page.uiSnapshot=()=>{const s=snapshot();s.ui.elements.find(e=>e.ref===f.options.file_ref).storage_entry=structuredClone(native);return s;};
 const connection={Connected:true,UserName:'worker',FRemoteSession:{},FSession:{}};
 const globals={document:{},location:{origin:'https://loginom.invalid'},__loginomDockPreparationV1:{id:'d'},
  bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FReconnecting:false,FMapTree:{FServerConnection:connection,
   PackageNodes:{Count:0,Items:()=>assert.fail('No package')}}}}}}}};
 const binding={session_id:'s',document_id:'d',origin:'https://loginom.invalid',loginom_build:'7.4.2',loginom_account:'worker',
  directories:{inputs:'/test',packages:'/test',exports:'/test'}};
 const listeners=new Map(),records=[];let disconnected=0,copied=false,copyPending=false,deadline,releaseCopy;
 const context=()=>({newCDPSession:async()=>({on:(event,callback)=>listeners.set(event,callback),off:event=>listeners.delete(event),
  send:async method=>method==='Target.getTargetInfo'?{targetInfo:{browserContextId:'owned'}}:method==='Page.getFrameTree'?{frameTree:{frame:{id:'frame'}}}:{}})});
 f.page.waitForEvent=async()=>{
  listeners.get('Browser.downloadWillBegin')?.({guid:'owned',frameId:'frame',suggestedFilename:'sales.csv',url:f.download.url()});
  listeners.get('Browser.downloadProgress')?.({guid:'owned',receivedBytes:fault==='midstream'?1:3});return f.download;
 };
 f.download.saveAs=async path=>{
  f.calls.push('save');if(fault==='midstream'){copyPending=true;connection.Connected=false;}
  await new Promise(resolve=>{releaseCopy=resolve;});
  await writeFile(path,fault==='partial'?'ab':'abc');copied=true;if(fault!=='midstream')connection.Connected=false;
  if(fault==='mtime')native.mtime='changed';
  if(fault==='bytes')native.bytes=4;
  if(fault==='unconfirmed')throw Error('saveAs did not confirm completion');
 };
 f.download.cancel=async()=>{f.calls.push('cancel');releaseCopy?.();};
 f.download.delete=async()=>{f.calls.push('delete');if(fault==='cleanup'||fault==='unconfirmed')throw Error('cleanup secondary error');};
 const evaluate=f.page.evaluate.bind(f.page),locator=f.page.locator.bind(f.page);
 f.page.evaluate=async(fn,arg)=>{
  if(!fn.toString().includes('const same=location.origin===b.origin'))return evaluate(fn,arg);
  if((copied||copyPending)&&!connection.Connected&&++disconnected===3){
   connection.Connected=true;
   if(fault==='midstream')listeners.get('Browser.downloadProgress')?.({guid:'owned',receivedBytes:3});
   if(fault==='session')connection.FSession={};
   if(fault==='deadline')f.page.clock=deadline;
  }
  return vm.runInNewContext('('+fn.toString()+')(input)',{...globals,input:arg});
 };
 f.page.locator=selector=>selector.includes('msgbox')?{waitFor:async()=>{throw Error('Reconnect is still pending');}}:locator(selector);
 const r=runtime(f.page,{cacheDirectory:join(root,'cache'),getStorageBinding:()=>binding,onRecord:async record=>{records.push(record);return record;},
  execute:async(code,options)=>{
   if(fault==='cleanup'&&code.includes('"mode":"status"')&&copied)throw Object.assign(Error('LOGINOM_FILE_CHANGED'),{code:'LOGINOM_FILE_CHANGED'});
   if(code.includes('"download_path":'))deadline=Number(code.match(/"deadline_at":(\d+)/)[1]);
   // Same serialized guard and error boundary as bridge.mjs. Only the external
   // Playwright page, connection and Chromium byte events are deterministic.
   try{
    if(!f.page.context)await f.page.execute('async page=>null');
    const page=new Proxy(f.page,{get:(target,key)=>key==='context'?context:Reflect.get(target,key)});
    const result=structuredClone(await vm.runInContext('('+withStorageIdentity(code,binding,options?.storageSession)+')',f.page.context)(page));
    if(code.includes('"mode":"status"')){
     if(fault==='midstream'&&!connection.Connected)f.page.clock+=30000;
     if(result.output.bytes===3)releaseCopy?.();
    }
    return result;
   }catch(error){return parseCapabilityResult({isError:true,content:[{type:'text',text:String(error)}]});}
  }});
 const roots=await r.observe({scope:'roots'});assert.equal(roots.status,'SUCCEEDED',JSON.stringify(roots));
 const file=roots.output.ui.elements.find(e=>e.ref===f.options.file_ref);
 const detail=await r.observe({rootRef:file.ref,observationId:roots.output.observation_id});
 const source=detail.output.ui.elements.find(e=>e.storage_entry?.path===native.path).storage_entry.server_source_ref;
 const request={operation_id:'reconnecting-download',server_source_ref:source};
 await r.serverDownload(request,'dock_storage_download_start');
 let result;
 do{
  result=await r.serverDownload({operation_id:request.operation_id,timeout_ms:100},'dock_storage_download_wait');
  if(fault==='cancel'&&copied&&result.state==='running')await r.serverDownload({operation_id:request.operation_id},'dock_storage_download_cancel');
 }while(result.state==='running');
 assert.equal(result.operation_id,request.operation_id);assert.equal(result.progress.deadline_at,deadline);
 assert.equal(f.calls.filter(c=>c==='click').length,1);assert.equal(f.calls.filter(c=>c==='save').length,1);
 if(['restored','midstream'].includes(fault)){
  assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(result.phase,'cached');
  assert.equal(createHash('sha256').update(await readFile(result.output.path)).digest('hex'),createHash('sha256').update('abc').digest('hex'));
  assert.equal((await stat(result.output.path)).size,3);assert.ok(disconnected>=3);
  assert.equal((await r.serverDownload(request,'dock_storage_download_start')).phase,'cached');
 }else{
  assert.equal(result.status,'FAILED',JSON.stringify(result));assert.equal(result.output.path,undefined);
  if(fault==='cleanup')assert.equal(result.error.code,'LOGINOM_FILE_CHANGED',JSON.stringify(result));
  if(fault==='deadline')assert.equal(result.error.code,'LOGINOM_DOWNLOAD_DEADLINE');
  if(fault==='cancel')assert.equal(result.error.code,'LOGINOM_DOWNLOAD_CANCELLED');
 }
 if(['cleanup','unconfirmed'].includes(fault)){
  assert.equal(result.cleanup_complete,false);assert.ok(records.some(r=>r.phase==='storage_download_cleanup_failed'));
  f.download.delete=async()=>{};
 }
 assert.ok(records.some(r=>r.phase==='storage_download_connection_wait'||r.phase==='storage_download_failed'));
 await r.cleanupServerCache();
});

test('download binds the checked file gesture to its page event and exact private save destination',async()=>{
  const f=fixture(),wait=f.page.waitForEvent;
  f.page.waitForEvent=(type,options)=>{assert.equal(options.timeout,15000);return wait(type,options);};
  const result=await f.run();
  assert.equal(result.status,'SUCCEEDED');assert.equal(result.cleanup_complete,true);
  assert.deepEqual(f.calls,['listen','click','save']);
  assert.equal(result.output.destination,'/test/sales.csv');
  assert.equal(result.output.upload_operation_id,'upload');
  assert.equal(result.output.bytes_verification_required,true);
  assert.ok(!JSON.stringify(result).includes('/private/'));
  assert.ok(!JSON.stringify(result).includes('not-for-output'));
});

test('download preserves bounded stale-reference reason/checks without replaying the denied gesture',async()=>{
  const f=fixture('javascript-native-input-real.csv'),snapshot=f.page.uiSnapshot.bind(f.page);
  f.page.uiSnapshot=()=>{const s=snapshot();s.ui.elements=s.ui.elements.map(e=>e.ref===f.options.file_ref?{...e,allowed_actions:[]}:e);return s;};
  f.page.waitForEvent=async()=>{f.calls.push('listen');throw Object.assign(Error('private download URL'),{name:'TimeoutError'});};
  const result=await f.run();assert.equal(result.status,'NOT_APPLIED');assert.equal(result.effect_possible,false);assert.equal(result.cleanup_complete,true);
  assert.equal(result.error.code,'DOWNLOAD_GESTURE_NOT_CONFIRMED');
  const refused=result.trace.find(e=>e.event==='download_gesture_result');
  assert.equal(refused.reference_reason,'control_changed_or_action_denied');
  assert.deepEqual(refused.reference_checks,{present:true,identity_matches:true,signature_matches:true,action_allowed:false});
  assert.deepEqual(f.calls,['listen']);assert.ok(!JSON.stringify(result).includes('private download URL'));
});

test('TSV download retains exact-name, destination and event ownership checks',async()=>{
  const f=fixture('sales.tsv'),result=await f.run();
  assert.equal(result.status,'SUCCEEDED');assert.equal(result.cleanup_complete,true);
  assert.equal(result.output.destination,'/test/sales.tsv');
  assert.equal(result.output.bytes_verification_required,true);
  assert.deepEqual(f.calls,['listen','click','save']);
  for(const name of ['sales.tsv.lgp','sales.tsv.html','sales.zip']) {
    const other=fixture(name);assert.throws(()=>makeArtifactDownloadCode(other.options));
    assert.deepEqual(other.calls,[]);
  }
});
test('download failure preserves bounded stage and cause flags without URLs or private errors',async()=>{
 const f=fixture();f.page.isClosed=()=>true;
 f.download.saveAs=async()=>{throw new Error('save https://private.invalid/?secret=hidden',{cause:new Error('Target page, context or browser has been closed')});};
 f.download.cancel=async()=>{throw new Error('private cancellation detail');};
 const result=await f.run();assert.equal(result.status,'AMBIGUOUS');assert.equal(result.cleanup_complete,false);
 const failure=result.trace.find(e=>e.event==='download_browser_failure');
 assert.equal(failure.step,'download.saveAs');assert.equal(failure.page_closed,true);assert.equal(failure.causes[1].target_closed,true);
 assert.equal(result.trace.find(e=>e.event==='download_cleanup_failure').step,'download.cancel');
 assert.ok(!JSON.stringify(result).includes('secret=hidden'));assert.ok(!JSON.stringify(result).includes('private cancellation'));
 assert.deepEqual(f.calls,['listen','click']);
});

test('download refuses a different file label, formatted-name collision or package before the browser',()=>{
  for(const change of [f=>{f.options.artifact.name='other.csv';},f=>{f.options.artifact.name='sales.lgp';},
    f=>{f.options.snapshot.ui.elements.find(item=>item.ref===f.options.file_ref).label='sale,s.csv';},
    f=>{f.options.file_ref='unissued';}]) {
    const f=fixture();change(f);assert.throws(()=>makeArtifactDownloadCode(f.options),/exact observed authorized CSV/);
    assert.deepEqual(f.calls,[]);
  }
});

test('changed directory or epoch prevents the download gesture',async()=>{
  for(const kind of ['directory','epoch']) {
    const f=fixture();
    if(kind==='directory')f.page.directory='/other';
    else {const before=f.page.uiSnapshot.bind(f.page);f.page.uiSnapshot=()=>({...before(),dom_epoch:{document:'new',revision:1}});}
    const result=await f.run();assert.equal(result.status,'NOT_APPLIED');assert.equal(result.effect_possible,false);
    const checks=result.trace.find(e=>e.event==='download_context_refused').checks;
    assert.equal(checks[kind==='directory'?'storage':'epoch'],false);
    assert.ok(Object.values(checks).every(v=>typeof v==='boolean'));
    assert.deepEqual(f.calls,[]);
  }
});

test('wrong filename or foreign origin cancels instead of persisting the download',async()=>{
  for(const kind of ['filename','origin']) {
    const f=fixture();
    if(kind==='filename')f.download.suggestedFilename=()=> 'sales.zip';
    else f.download.url=()=> 'https://loginom.invalid.evil.test/download';
    const result=await f.run();assert.equal(result.status,'AMBIGUOUS');assert.equal(result.cleanup_complete,true);
    assert.deepEqual(f.calls,['listen','click','cancel']);assert.equal(result.output.download_completed,undefined);
  }
});

test('failed gesture drains and cancels the captured download',async()=>{
  const f=fixture(),click=f.page.mouse.click;
  f.page.mouse.click=async(...args)=>{await click(...args);throw new Error('private click failure');};
  const result=await f.run();assert.equal(result.status,'AMBIGUOUS');
  assert.equal(result.error.code,'DOWNLOAD_GESTURE_NOT_CONFIRMED');
  assert.deepEqual(f.calls,['listen','click','cancel']);
  assert.equal(result.trace.find(e=>e.event==='download_gesture_result').error_code,'UI_BROWSER_CALL_FAILED');
  assert.ok(!JSON.stringify(result).includes('private click failure'));
});

test('missing event and post-download context change cannot claim a verified copy',async()=>{
  const missing=fixture();missing.page.waitForEvent=()=>Promise.reject(new Error('timeout'));
  const absent=await missing.run();assert.equal(absent.status,'AMBIGUOUS');assert.equal(absent.cleanup_complete,false);
  assert.equal(absent.error.code,'DOWNLOAD_EVENT_MISSING');
  const changed=fixture(),save=changed.download.saveAs;
  changed.download.saveAs=async path=>{await save(path);changed.page.directory='/other';};
  const result=await changed.run();assert.equal(result.error.code,'DOWNLOAD_CONTEXT_CHANGED');
  assert.equal(result.status,'AMBIGUOUS');assert.equal(result.output.download_completed,undefined);
  const refused=result.trace.find(e=>e.event==='download_post_context_refused');
  assert.equal(refused.checks.storage,false);assert.equal(refused.checks.document,true);
  assert.ok(Object.values(refused.checks).every(v=>typeof v==='boolean'));
});

function downloadToastFixture(mode='closes') {
  const f=fixture('sample.xlsx'),snapshot=f.page.uiSnapshot.bind(f.page),evaluate=f.page.evaluate.bind(f.page);
  let saved=false,reads=0;
  // Native data-tid=toast DOM captured in LAB-449/LAB-625. Its disappearance may
  // happen between the workspace snapshot and the bound-element read.
  const toast=()=>({isConnected:true,className:'x-window bg-notify-msg-color-info x-layer x-window-default x-closable x-window-closable x-window-default-closable x-border-box',
    textContent:['unknown_text','absent_unknown_text'].includes(mode)?'Сохранение пакета':'\u00a0Скачивание файловОтменить все',
    getAttribute:key=>key==='data-tid'?'toast':null,
    getBoundingClientRect:()=>({width:100,height:50})});
  let element=toast();
  const document={querySelectorAll:()=>element.isConnected?[element]:[]};
  const sandbox={document,getComputedStyle:()=>({visibility:'visible',display:'block'})};
  sandbox[Symbol.for('loginom-dock.workspace-ui.identity.v1')]={document,refs:new Map([['toast-ref',{deref:()=>original}]])};
  const original=element;
  const save=f.download.saveAs;
  f.download.saveAs=async path=>{await save(path);saved=true;};
  f.page.uiSnapshot=()=>{
    const s=snapshot();
    if(saved){
      const visible=['closes','closes_between_reads'].includes(mode)?reads++<2:['replaced_hidden','closes_after_binding','closes_before_binding','cleared_before_binding'].includes(mode)||mode.startsWith('absent_')&&mode!=='absent_replaced'?reads++<1:true;
      element.isConnected=visible;
      s.ui.dialogs=visible?[{ref:'toast-ref',identity:{anchor_tid:mode==='foreign_dialog'?'other':'toast',path:[]},title:'',text:element.textContent,class_name:element.className}]:[];
      // Recorded sequence: snapshot still has the original toast/ref, then
      // inspect sees it detached; only the next snapshot has no dialogs.
      if(mode==='closes_between_reads'&&reads===2)element.isConnected=false;
      if(mode==='observed_unknown_text')s.ui.dialogs[0].text='Сохранение пакета';
      if(mode==='observed_unknown_class')s.ui.dialogs[0].class_name='x-window foreign';
      if(mode==='mask')s.ui.masks=[{ref:'foreign-mask'}];
    }
    return s;
  };
  f.page.evaluateHandle=async(fn,arg)=>{
    if(['closes_before_binding','cleared_before_binding','cleared_without_hidden'].includes(mode)||mode.startsWith('absent_'))element.isConnected=false;
    if(!element.isConnected&&mode!=='cleared_without_hidden')element.className+=' x-hidden-offsets';
    if(['cleared_before_binding','cleared_without_hidden'].includes(mode))element.textContent='';
    if(mode==='unknown_class')element.className='x-window foreign';
    if(mode==='absent_unknown_class')element.className='x-window foreign';
    if(mode==='absent_unknown_text')element.textContent='Сохранение пакета';
    if(mode==='replaced_before_binding')element=toast();
    const handle={value:vm.runInNewContext('('+fn.toString()+')',sandbox)(arg),dispose:async()=>{}};
    if(mode==='closes_after_binding')element.isConnected=false;
    return handle;
  };
  f.page.evaluate=async(fn,arg)=>fn.name.includes('DownloadToast')||!fn.toString().includes('workspace-ui.identity.v1')&&fn.toString().includes('[role="dialog"],.x-window,.bg-dialog')
    ?vm.runInNewContext('('+fn.toString()+')',sandbox)(arg?.value??arg):evaluate(fn,arg);
  const wait=f.page.waitForTimeout.bind(f.page);
  f.page.waitForTimeout=async ms=>{
    await wait(ms);if(mode==='directory')f.page.directory='/other';if(mode.startsWith('replaced'))element=toast();
    if(mode==='absent_directory')f.page.directory='/other';
    if(mode==='absent_replaced')element=toast();
    if(mode==='absent_deadline')f.page.clock=f.options.deadline_at;
    if(mode==='changed_classes')element.className+=' foreign';
    if(mode==='changed_text')element.textContent='Сохранение пакета';
  };
  f.options.deadline_at=f.page.clock+300;
  return f;
}

test('completed XLSX download waits read-only for the owned Loginom download toast to close',async()=>{
  const f=downloadToastFixture(),result=await f.run();
  assert.equal(result.status,'SUCCEEDED');assert.equal(result.cleanup_complete,true);
  assert.deepEqual(f.calls,['listen','click','save']);
  assert.ok(result.trace.some(e=>e.event==='download_toast_settled'));
  assert.ok(f.page.clock<=f.options.deadline_at);
});

test('native toast closes between observation and binding or inspection without changing download context',async()=>{
  for(const mode of ['closes_between_reads','closes_after_binding','closes_before_binding','cleared_before_binding']){
    const f=downloadToastFixture(mode),result=await f.run();
    assert.equal(result.status,'SUCCEEDED',mode);assert.equal(result.output.download_completed,true,mode);
    assert.equal(result.cleanup_complete,true);assert.deepEqual(f.calls,['listen','click','save']);
    assert.ok(result.trace.some(e=>e.event==='download_toast_settled'));
    assert.ok(!result.trace.some(e=>e.event==='download_toast_guard_refused'));
    assert.ok(f.page.clock<=f.options.deadline_at);
  }
});

test('download toast refusal names the changed native guard and predicate',async()=>{
  for(const [mode,predicate] of [['replaced','same_element'],['changed_classes','same_classes'],['changed_text','download_text']]){
    const f=downloadToastFixture(mode),result=await f.run();
    assert.equal(result.status,'AMBIGUOUS');assert.equal(result.output.download_completed,undefined);
    const guard=result.trace.find(e=>e.event==='download_toast_guard_refused');
    assert.deepEqual(guard,{event:'download_toast_guard_refused',guard:'native_toast',predicate,observed:'changed'});
    assert.deepEqual(f.calls,['listen','click','save']);
  }
});

test('download toast settlement refuses foreign dialogs, owner changes and the original deadline',async()=>{
  for(const mode of ['unknown_text','unknown_class','foreign_dialog','directory','mask','replaced','replaced_hidden','persistent','no_deadline',
    'observed_unknown_text','observed_unknown_class','cleared_without_hidden','absent_directory','absent_replaced','absent_deadline','absent_unknown_class','absent_unknown_text','replaced_before_binding']) {
    const f=downloadToastFixture(mode);
    if(mode==='no_deadline')delete f.options.deadline_at;
    const result=await f.run();
    assert.equal(result.status,'AMBIGUOUS',mode);assert.equal(result.error.code,'DOWNLOAD_CONTEXT_CHANGED',mode);
    assert.equal(result.output.download_completed,undefined,mode);assert.equal(result.cleanup_complete,true,mode);
    assert.deepEqual(f.calls,['listen','click','save'],mode);
    assert.ok(f.page.clock<=1300,mode);
  }
});

test('failed toast binding records the actual bounded class and text',async()=>{
  for(const mode of ['unknown_class','unknown_text']){
    const f=downloadToastFixture(mode),result=await f.run();
    const diagnostic=result.trace.find(e=>e.event==='download_toast_binding_diagnostic');
    assert.equal(diagnostic.count,1);
    assert.equal(mode==='unknown_class'?diagnostic.class_name:diagnostic.text,
      mode==='unknown_class'?'x-window foreign':'Сохранение пакета');
  }
});

test('toast closure before binding completes upload byte/SHA verification and releases both transfers once',async t=>{
  const f=downloadToastFixture('cleared_before_binding'),root=await mkdtemp(join(tmpdir(),'toast-transfer-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const source=join(root,'source');await writeFile(source,'abc');
  const store=await createArtifactStore({directory:join(root,'store')});
  t.after(()=>store.releaseUploads());
  const artifact=await store.admit({sourcePath:source,name:f.options.artifact.name,bytes:3,
    sha256:createHash('sha256').update('abc').digest('hex'),upload:{directory:'/test',overwrite:'replace'}});
  let uploads=0;
  const locator=f.page.locator.bind(f.page),input={count:async()=>1,isEnabled:async()=>true,elementHandle:async()=>input,dispose:async()=>{},
    evaluate:async fn=>fn({isConnected:true,tagName:'INPUT',type:'file'}),setInputFiles:async path=>{
      assert.equal(await readFile(path,'utf8'),'abc');uploads++;
    }};
  f.page.locator=selector=>selector.includes('FileStorageForm;tbrActions')?{
    count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,locator:()=>input}:locator(selector);
  const save=f.download.saveAs;
  f.download.saveAs=async path=>{f.options.download_path=path;await save(path);await writeFile(path,'abc');};
  const rt=runtime(f.page,{artifactStore:store});
  const observed=await rt.observe();
  await rt.upload({artifactId:artifact.artifact_id,grantId:artifact.upload.grant_id,
    observationId:observed.output.observation_id,operationId:'upload'});
  const row=await rt.observe(),request={operationId:'upload',verificationId:'verify',observationId:row.output.observation_id,
    fileRef:row.output.ui.elements.find(e=>e.label===artifact.name).ref};
  const result=await rt.verifyArtifact(request);
  assert.equal(result.status,'SUCCEEDED');assert.equal(result.output.sha256,artifact.sha256);
  assert.equal(result.output.bytes_verified,true);assert.equal(result.output.upload_completion_verified,true);
  assert.equal(result.cleanup_complete,true);assert.equal(uploads,1);assert.deepEqual(f.calls,['listen','click','save']);
  assert.deepEqual(await rt.verifyArtifact(request),result);
  assert.equal((await rt.inspect({operationId:'upload'})).output.state,'resolved');
  assert.doesNotThrow(()=>rt.assertPreparationAllowed());
});

function revealFixture(mode='success') {
  const f=fixture(),snapshot=f.page.uiSnapshot.bind(f.page),ownerRef='observed-owner';
  let waits=0;
  const wait=f.page.waitForTimeout.bind(f.page);
  f.page.waitForTimeout=async ms=>{waits++;await wait(ms);if(mode==='context_while_settling' && waits===1)f.page.directory='/other';};
  const owner={isConnected:true,scrollTop:0,scrollHeight:mode==='too_far'?2000:850,clientHeight:800,clientWidth:1000,
    parentElement:null,contains:e=>e===file || e===owner,getBoundingClientRect:()=>({x:0,y:0,width:1000,height:800})};
  const file={isConnected:true,parentElement:owner,textContent:f.options.artifact.name,
    getAttribute:()=>f.options.snapshot.ui.elements.find(e=>e.ref===f.options.file_ref).tid,
    getBoundingClientRect:()=>({x:30,y:(mode==='too_far'?1900:825)-owner.scrollTop,width:100,height:25})};
  f.page.uiSnapshot=()=>{
    const state=snapshot(),row=state.ui.elements.find(e=>e.ref===f.options.file_ref);
    row.scroll={ref:ownerRef,top:owner.scrollTop,max_top:owner.scrollHeight-owner.clientHeight};
    row.interaction={state:owner.scrollTop>=50?'point_observed':'outside_viewport',point:owner.scrollTop>=50?{x:50,y:780}:null};
    if(mode==='delayed_repaint' && waits<2)row.interaction={state:'outside_viewport',point:null};
    if(mode==='clipped')row.interaction.state=owner.scrollTop>=50?'point_observed':'point_not_observed';
    return state;
  };
  f.options.snapshot=f.page.uiSnapshot();
  const state={epoch:f.options.snapshot.dom_epoch.document,revision:f.options.snapshot.dom_epoch.revision,
    refs:new Map([[f.options.file_ref,{deref:()=>file}],[ownerRef,{deref:()=>owner}]]),observer:{takeRecords:()=>[]},captureMutations:()=>{}};
  const context=vm.createContext({innerHeight:800,innerWidth:1000,
    document:{elementFromPoint:()=>mode==='blocked'?{}:owner},getComputedStyle:()=>({overflowY:'auto',display:'block',visibility:'visible'}),
    state});
  vm.runInContext('globalThis[Symbol.for("loginom-dock.workspace-ui.identity.v1")]=state',context);
  const evaluate=f.page.evaluate.bind(f.page);
  f.page.evaluate=async(fn,arg)=>{
    if(fn.toString().includes('DOWNLOAD_REVEAL_EPOCH_CHANGED')) {
      f.calls.push('reveal');
      if(mode==='owner_changed')owner.scrollTop=1;
      if(mode==='file_changed')file.textContent='other.csv';
      if(mode==='document_changed')state.epoch='foreign';
      if(mode==='horizontal')file.getBoundingClientRect=()=>({x:1100,y:825,width:100,height:25});
      if(mode==='already_inside')file.getBoundingClientRect=()=>({x:30,y:100,width:100,height:25});
      const output=vm.runInContext('('+fn.toString()+')',context)(arg);
      if(mode==='extent_rounding')owner.scrollHeight+=1;
      if(mode==='extent_changed')owner.scrollHeight+=2;
      if(mode==='context_after')f.page.directory='/other';
      if(mode==='still_hidden')f.page.uiSnapshot=()=>{const s=snapshot();const row=s.ui.elements.find(e=>e.ref===f.options.file_ref);row.scroll={ref:ownerRef,top:owner.scrollTop,max_top:50};row.interaction={state:'outside_viewport'};return s;};
      return output;
    }
    return evaluate(fn,arg);
  };
  return {...f,owner,waitCount:()=>waits};
}

test('verification reveals its original clipped or offscreen file owner once before one download',async()=>{
  for(const mode of ['success','clipped','delayed_repaint','extent_rounding']) {
    const f=revealFixture(mode),result=await f.run();
    assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
    assert.equal(f.owner.scrollTop,50);
    assert.deepEqual(f.calls,['reveal','listen','click','save']);
    assert.equal(result.trace.filter(t=>t.event==='download_file_revealed').length,1);
    assert.equal(result.trace.find(t=>t.event==='download_file_revealed').delta,50);
    assert.equal(result.trace.find(t=>t.event==='download_reveal_confirmed').interaction,'point_observed');
    assert.equal(f.waitCount(),mode==='delayed_repaint'?5:3);
  }
});

function nativeRevealEpochFixture(mode='once') {
  const f=revealFixture(),snapshot=f.page.uiSnapshot.bind(f.page),evaluate=f.page.evaluate.bind(f.page);
  const rowOnly=['visible_row','row_replaced','row_missing','scroll_appeared','unknown_file'].includes(mode);
  let revision=0,checks=0,resolveEvent;
  const elements=f.page.elements.bind(f.page);
  f.page.elements=()=>elements().map(e=>e.kind==='file'?{...e,box:{x:30,y:825-f.owner.scrollTop,width:100,height:25}}:e);
  if(mode==='visible'||mode==='visible_no_scroll'||rowOnly)f.owner.scrollTop=50;
  f.page.directory='/test-2';
  f.page.uiSnapshot=()=>{
    const s=snapshot(),file=s.ui.elements.find(e=>e.ref===f.options.file_ref);
    s.dom_epoch.revision=revision;s.scan={mutation_counts:{other_style:revision}};
    file.storage_entry={kind:'file',bytes:revision&&mode==='size_changed'?4:3};
    if(mode==='visible_no_scroll')file.scroll=null;
    if(rowOnly){delete file.scroll;file.storage_entry.row_ref='same-dom-row';}
    if(mode==='unknown_file')file.storage_entry.kind='unknown';
    if(revision) {
      if(mode==='owner_changed')file.scroll.ref='different-owner';
      if(mode==='scroll_changed')file.scroll.top++;
      if(mode==='file_changed')file.label='different.csv';
      if(mode==='identity_changed')file.identity={...file.identity,tid:'different'};
      if(mode==='signature_changed')file.signature={...file.signature,label:'different'};
      if(mode==='document_changed')s.dom_epoch.document='different';
      if(mode==='context_changed')s.file_storage.directory='/other';
      if(mode==='blocked')s.ui.masks=[{kind:'busy'}];
      if(mode==='row_replaced')file.storage_entry.row_ref='different-dom-row';
      if(mode==='row_missing')delete file.storage_entry.row_ref;
      if(mode==='scroll_appeared')file.scroll={ref:'new-owner',top:0,max_top:50};
    }
    return s;
  };
  f.options={...f.options,artifact:{artifact_id:'output',name:'sales.csv'},snapshot:f.page.uiSnapshot(),expected_bytes:3,
    output_binding:{session_id:'session',node_id:'node',execution_id:'execution',directory:'/test-2',destination:'/test-2/sales.csv'}};
  f.page.waitForEvent=type=>{
    assert.equal(type,'download');f.calls.push('listen');
    return new Promise((resolve,reject)=>{resolveEvent=resolve;setImmediate(()=>reject(Object.assign(Error('timeout'),{name:'TimeoutError'})));});
  };
  const click=f.page.mouse.click;
  f.page.mouse.click=async(...args)=>{await click(...args);resolveEvent(f.download);if(mode==='applied_failure')throw Error('click failed');};
  f.page.evaluate=async(fn,arg)=>{
    if(fn.toString().includes('return {document:state.epoch,revision:state.revision}')) {
      checks++;if(checks===1||mode==='persistent')revision++;
      if(mode==='event_arrived')resolveEvent(f.download);
    }
    return evaluate(fn,arg);
  };
  return {...f,checks:()=>checks,run:()=>f.page.execute(makeNativeOutputDownloadCode(f.options))};
}

test('native pre-gesture epoch refusal reobserves the same owner before exactly one download gesture',async()=>{
 for(const mode of ['once','visible']) {
  const f=nativeRevealEpochFixture(mode),result=await f.run();
  assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
  assert.deepEqual(f.calls,mode==='visible'?['listen','click','save']:['reveal','listen','click','save']);assert.equal(f.checks(),2);
  const step=result.trace.find(e=>e.event==='download_gesture_result');
  assert.equal(step.epoch_refreshes.length,1);assert.equal(step.epoch_refreshes[0].mutation_delta.other_style,1);
 }
});

test('LAB-109 visible file without scroll keeps its native DOM row owner across an epoch refusal',async()=>{
 const f=nativeRevealEpochFixture('visible_row'),result=await f.run();
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 assert.deepEqual(f.calls,['listen','click','save']);assert.equal(f.checks(),2);
 assert.equal(result.trace.find(e=>e.event==='download_gesture_result').epoch_refreshes.length,1);
 for(const mode of ['row_replaced','row_missing','scroll_appeared','unknown_file']) {
  const denied=nativeRevealEpochFixture(mode),outcome=await denied.run();
  assert.equal(outcome.status,'NOT_APPLIED',mode);assert.equal(outcome.effect_possible,false,mode);
  assert.deepEqual(denied.calls,['listen'],mode);assert.equal(denied.checks(),1,mode);
 }
});

test('native epoch refresh never redirects the revealed file or repeats an applied gesture',async()=>{
  for(const mode of ['owner_changed','scroll_changed','file_changed','identity_changed','signature_changed','size_changed','document_changed','context_changed','blocked','event_arrived','applied_failure','persistent']) {
    const f=nativeRevealEpochFixture(mode),result=await f.run();
    assert.equal(result.status,'AMBIGUOUS',mode+JSON.stringify(result));assert.equal(result.output.download_completed,undefined,mode);
    assert.equal(f.calls.filter(c=>c==='reveal').length,1,mode);assert.equal(f.calls.filter(c=>c==='listen').length,1,mode);
    assert.equal(f.calls.filter(c=>c==='click').length,mode==='applied_failure'?1:0,mode);
    assert.equal(f.checks(),mode==='persistent'?3:mode==='applied_failure'?2:1,mode);
  }
});

test('epoch refusal reports the rejected reobservation guard without changing its decision',async()=>{
  const cases={owner_changed:['scroll'],scroll_changed:['scroll'],identity_changed:['identity'],signature_changed:['signature'],
    size_changed:['bytes'],document_changed:['context'],context_changed:['context'],blocked:['context'],
    event_arrived:['event_pending'],persistent:['attempt_available'],visible_no_scroll:['owner']};
  for(const [mode,failed] of Object.entries(cases)) {
    const f=nativeRevealEpochFixture(mode),result=await f.run();
    const refusal=result.trace.find(e=>e.event==='download_epoch_refresh_refused');
    assert.ok(refusal,mode);assert.equal(refusal.stage,['event_arrived','persistent'].includes(mode)?'eligibility':'observation',mode);
    for(const key of failed)assert.equal(refusal.checks[key],false,mode+':'+key);
    assert.ok(Object.values(refusal.checks).every(v=>typeof v==='boolean'),mode);
    assert.equal(result.error.code,'DOWNLOAD_GESTURE_NOT_CONFIRMED',mode);
    assert.equal(f.calls.filter(c=>c==='click').length,0,mode);assert.equal(f.calls.filter(c=>c==='listen').length,1,mode);
    if(mode==='visible_no_scroll') {
      // LAB-109:3048's public failure alone cannot distinguish this guard
      // from identity/signature/context changes; preserve the missing evidence.
      assert.equal(result.status,'NOT_APPLIED');assert.equal(result.effect_possible,false);assert.equal(result.cleanup_complete,true);
      assert.deepEqual(Object.entries(refusal.checks).filter(([,value])=>!value).map(([key])=>key),['owner']);
    }
  }
});

test('verification reads its issued CSV when upload observed a separate folder tree',async()=>{
  const f=revealFixture(),roots=[];
  f.options.storage_root_ref='upload-folder-tree';
  f.options.snapshot.observation_root={ref:'issued-file-row'};
  const evaluate=f.page.evaluate.bind(f.page);
  f.page.evaluate=async(fn,arg)=>{
    if(arg && Object.hasOwn(arg,'rootRef')) {
      roots.push(arg.rootRef);
      // Native tree observations retain the /test breadcrumb but cannot
      // contain the sibling grid's CSV. This reproduced the live failure.
      if(arg.rootRef==='upload-folder-tree') {
        const snapshot=f.page.uiSnapshot();snapshot.ui.elements=[];
        return snapshot;
      }
    }
    return evaluate(fn,arg);
  };
  const result=await f.run();
  assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
  assert.equal(roots[0],f.options.file_ref);
  assert.equal(roots.includes('upload-folder-tree'),false);
  assert.equal(roots.includes('issued-file-row'),false);
  assert.deepEqual(f.calls,['reveal','listen','click','save']);
});

test('reveal rejects other owners files documents obstruction and unbounded movement before scroll',async()=>{
  for(const mode of ['owner_changed','file_changed','document_changed','too_far','horizontal','already_inside','blocked']) {
    const f=revealFixture(mode),result=await f.run();
    assert.equal(result.status,'NOT_APPLIED',mode+JSON.stringify(result));
    assert.equal(result.effect_possible,false,mode);
    assert.deepEqual(f.calls,['reveal'],mode);
    if(mode==='too_far')assert.equal(result.error.code,'DOWNLOAD_REVEAL_LIMIT');
  }
});

test('post-scroll failure retains effect and never retries reveal or download',async()=>{
  for(const mode of ['context_after','still_hidden','context_while_settling','extent_changed']) {
    const f=revealFixture(mode),result=await f.run();
    assert.equal(result.status,'AMBIGUOUS',mode+JSON.stringify(result));
    assert.equal(result.effect_possible,true);assert.equal(result.cleanup_complete,true);
    assert.equal(f.owner.scrollTop,50);assert.deepEqual(f.calls,['reveal']);
    assert.equal(f.waitCount(),mode==='still_hidden'?11:mode==='context_while_settling'?1:0);
  }
});

test('native export download requires its fresh output binding without an input grant',async()=>{
 const {makeNativeOutputDownloadCode}=await import('../lib/executor.mjs');
 const f=fixture('native.csv');f.page.directory='/test-2';
 const original=f.page.uiSnapshot.bind(f.page);
 f.page.uiSnapshot=()=>{const s=original();for(const e of s.ui.elements)if(e.label==='native.csv')e.storage_entry={bytes:3,kind:'file'};return s;};
 const snapshot=f.page.uiSnapshot(),file=snapshot.ui.elements.find(e=>e.label==='native.csv');
 const options={...f.options,artifact:{artifact_id:'output',name:'native.csv'},snapshot,file_ref:file.ref,expected_bytes:3,output_binding:{session_id:'session',document_id:'doc',workflow_id:'flow',node_id:'node',execution_id:'execution',directory:'/test-2',destination:'/test-2/native.csv'}};
 const result=await f.page.execute(makeNativeOutputDownloadCode(options));assert.equal(result.status,'SUCCEEDED');assert.equal(result.output.upload_operation_id,undefined);assert.equal(result.output.output_binding.execution_id,'execution');
 for(const patch of [{expected_bytes:4},{output_binding:{...options.output_binding,execution_id:''}},{artifact:{name:'other.csv'}}])assert.throws(()=>makeNativeOutputDownloadCode({...options,...patch}));
});
test('changed native output size refuses download before the gesture',async()=>{
 const {makeNativeOutputDownloadCode}=await import('../lib/executor.mjs');const f=fixture('native.csv');f.page.directory='/test-2';
 const original=f.page.uiSnapshot.bind(f.page);let bytes=3;
 f.page.uiSnapshot=()=>{const s=original();for(const e of s.ui.elements)if(e.label==='native.csv')e.storage_entry={bytes,kind:'file'};return s;};
 const snapshot=f.page.uiSnapshot(),file=snapshot.ui.elements.find(e=>e.label==='native.csv');
 const code=makeNativeOutputDownloadCode({...f.options,artifact:{artifact_id:'output',name:'native.csv'},snapshot,file_ref:file.ref,expected_bytes:3,output_binding:{session_id:'session',node_id:'node',execution_id:'execution',directory:'/test-2',destination:'/test-2/native.csv'}});
 bytes=4;const result=await f.page.execute(code);assert.equal(result.status,'NOT_APPLIED');assert.equal(result.error.code,'DOWNLOAD_OUTPUT_SIZE_CHANGED');assert.deepEqual(f.calls,[]);
});

test('TXT download preserves exact name and destination and delegates one owned gesture',async()=>{
 const f=fixture('transactions.txt'),r=await f.run();
 assert.equal(r.status,'SUCCEEDED');assert.equal(r.cleanup_complete,true);
 assert.equal(r.output.destination,'/test/transactions.txt');assert.deepEqual(f.calls,['listen','click','save']);
});

test('completed download waits out a post-copy dialog using observations and one gesture',async()=>{
 const f=fixture(),snapshot=f.page.uiSnapshot.bind(f.page),save=f.download.saveAs;let copied=false,reads=0;
 f.download.saveAs=async path=>{await save(path);copied=true;};
 f.page.uiSnapshot=()=>{const s=snapshot();if(copied&&++reads===1)s.ui.dialogs=[{ref:'late-dialog',identity:{anchor_tid:'toast'}}];return s;};
 const result=await f.run();assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 assert.equal(f.calls.filter(c=>c==='click').length,1);assert.equal(f.calls.filter(c=>c==='save').length,1);
 assert.ok(reads>=3);assert.ok(result.trace.some(e=>e.event==='download_post_observation_settled'));
});
test('post-copy blocking dialog cannot extend the original download deadline',async()=>{
 const f=fixture(),snapshot=f.page.uiSnapshot.bind(f.page),save=f.download.saveAs;let copied=false;
 f.options.deadline_at=f.page.clock+1000;
 f.download.saveAs=async path=>{await save(path);copied=true;};
 f.page.uiSnapshot=()=>{const s=snapshot();if(copied)s.ui.dialogs=[{ref:'persistent-dialog',identity:{anchor_tid:'msgbox'}}];return s;};
 const result=await f.run();assert.equal(result.error.code,'DOWNLOAD_CONTEXT_CHANGED');
 assert.equal(f.calls.filter(c=>c==='click').length,1);assert.equal(result.cleanup_complete,true);
 assert.equal(result.output.download_completed,undefined);
});
