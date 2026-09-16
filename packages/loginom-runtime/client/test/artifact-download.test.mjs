import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Page,build} from './support/executor-fixture.mjs';
import {makeArtifactDownloadCode} from '../lib/executor.mjs';

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

test('download binds the checked file gesture to its page event and exact private save destination',async()=>{
  const f=fixture(),result=await f.run();
  assert.equal(result.status,'SUCCEEDED');assert.equal(result.cleanup_complete,true);
  assert.deepEqual(f.calls,['listen','click','save']);
  assert.equal(result.output.destination,'/test/sales.csv');
  assert.equal(result.output.upload_operation_id,'upload');
  assert.equal(result.output.bytes_verification_required,true);
  assert.ok(!JSON.stringify(result).includes('/private/'));
  assert.ok(!JSON.stringify(result).includes('not-for-output'));
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
    assert.equal(f.waitCount(),mode==='delayed_repaint'?4:2);
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
