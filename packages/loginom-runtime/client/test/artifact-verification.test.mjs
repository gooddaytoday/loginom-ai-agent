import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createArtifactStore} from '../lib/artifacts.mjs';
import {Page,runtime} from './support/executor-fixture.mjs';

async function fixture({submissionFailure=false,name='sales.csv',bytes=Buffer.from('abc'),conflict=false}={}) {
  const directory=await mkdtemp(join(tmpdir(),'dock-verify-'));
  const sourcePath=join(directory,'source');await writeFile(sourcePath,bytes);
  const store=await createArtifactStore({directory:join(directory,'store')});
  const artifact=await store.admit({sourcePath,name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
    upload:{directory:'/test',overwrite:conflict?'reject':'replace'}});
  const page=new Page(),elements=page.elements.bind(page),snapshot=page.uiSnapshot.bind(page),locator=page.locator.bind(page);
  const tid=page.prefix+';FileStorageForm;colName_'+name;
  page.elements=()=>[...elements(),page.element(tid,{label:name,kind:'file'})];
  page.uiSnapshot=()=>({...snapshot(),file_storage:{status:'observed',directory:'/test',listing_complete:false}});
  const counts={uploads:0,downloads:0,verifications:0};
  const input={count:async()=>1,isEnabled:async()=>true,elementHandle:async()=>input,dispose:async()=>{},
    evaluate:async fn=>fn({isConnected:true,tagName:'INPUT',type:'file'}),setInputFiles:async path=>{
      assert.deepEqual(await readFile(path),bytes);counts.uploads++;
      if(submissionFailure)throw new Error('input completion not confirmed');
    }};
  page.locator=selector=>selector.includes('FileStorageForm;tbrActions') ? {
    count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,locator:()=>input} : locator(selector);
  let event;page.downloadBytes=bytes;page.dropReply=false;
  const download={url:()=> 'https://loginom.invalid/download',suggestedFilename:()=>name,failure:async()=>null,cancel:async()=>{},
    saveAs:async path=>{counts.downloads++;await writeFile(path,page.downloadBytes);}};
  page.waitForEvent=async()=>new Promise(resolve=>{event=resolve;});
  const click=page.mouse.click;page.mouse.click=async(...args)=>{await click(...args);event(download);};
  const stage=store.stageDownload;store.stageDownload=async id=>{
    const lease=await stage(id);return {...lease,verify:async name=>{counts.verifications++;return lease.verify(name);},
      release:async()=>{if(page.failDownloadRelease)throw new Error('cleanup failed');return lease.release();}};
  };
  const events=[];
  const rt=runtime(page,{artifactStore:store,onRecord:async record=>{
    if(page.failJournalPhase===record.phase){page.failJournalPhase=null;throw new Error('journal unavailable');}
    events.push(record);
  },execute:async code=>{
    if(conflict&&code.includes('async function browserArtifactUpload'))return {
      status:'FAILED',action_key:'artifact.upload',action_revision:'1',operation_id:'upload',phase:'submitted',
      effect_possible:true,cleanup_complete:true,error:{code:'UPLOAD_PATH_CONFLICT',message:'UPLOAD_PATH_CONFLICT'},trace:[],
      output:{upload_submitted:false,conflict_rejected:true,destination:'/test/'+name}};
    const result=await page.execute(code);
    if(page.dropReply && result.action_key==='artifact.download'){page.dropReply=false;throw new Error('response lost');}
    return result;
  }});
  const observed=await rt.observe();
  await rt[conflict?'uploadDeliveredArtifact':'upload']({artifactId:artifact.artifact_id,grantId:artifact.upload.grant_id,
    observationId:observed.output.observation_id,operationId:'upload',...(conflict?{deliveryOperationId:'delivery'}:{})});
  const request=async()=>{
    const row=await rt.observe();return {operationId:'upload',verificationId:'verify',observationId:row.output.observation_id,
      fileRef:row.output.ui.elements.find(item=>item.tid===tid).ref};
  };
  return {rt,page,events,counts,request,artifact,cleanup:async()=>{await store.releaseUploads();await rm(directory,{recursive:true,force:true});}};
}

for(const content of ['abc','bad','longer'])test('current server bytes settle an owned reject conflict: '+content,async()=>{
 const f=await fixture({conflict:true});
 try {
  const request=await f.request();f.page.downloadBytes=content;
  await assert.rejects(()=>f.rt.verifyArtifact(request),/pending upload browser/);
  const result=await f.rt.verifyArtifact({...request,compareExisting:true});
  const inspected=await f.rt.inspect({operationId:'upload'});
  assert.equal(inspected.output.state,'resolved');assert.equal(inspected.output.outcome.output.upload_submitted,false);
  assert.equal(inspected.output.outcome.status,content==='abc'?'SUCCEEDED':'FAILED');
  assert.equal(result.output.bytes_verified,content==='abc');
  assert.deepEqual(f.counts,{uploads:0,downloads:1,verifications:1});
  if(content==='abc'){
   const {verifyTextImportSource}=await import('../lib/text-import-node.mjs');
   const outcome=inspected.output.outcome;
   const source=verifyTextImportSource({source:{artifact_id:f.artifact.artifact_id,upload_operation_id:'upload'},settings:{}},
    [{operation_id:'upload',artifact:f.artifact,outcome}],{complete:true,records:[{sequence:0,operation_id:'upload',
     destination:f.artifact.upload.destination,artifact:f.artifact,outcome,cleanup_confirmed:true}]}).source;
   assert.equal(source.destination,'/test/sales.csv');assert.equal(source.bytes,3);assert.equal(source.sha256,f.artifact.sha256);
  }
  assert.doesNotThrow(()=>f.rt.assertPreparationAllowed());
  assert.deepEqual(await f.rt.verifyArtifact({...request,compareExisting:true}),result);
 }finally{await f.cleanup();}
});

test('lost response during an existing-file comparison reconciles without another download',async()=>{
 const f=await fixture({conflict:true});
 try{
  const request={...await f.request(),compareExisting:true};f.page.dropReply=true;
  assert.equal((await f.rt.verifyArtifact(request)).error.code,'BROWSER_CALL_UNCERTAIN');
  assert.throws(()=>f.rt.assertPreparationAllowed(),/action/);
  const inspected=await f.rt.inspect({operationId:'upload'});
  assert.equal(inspected.output.state,'resolved');assert.equal(inspected.output.outcome.status,'SUCCEEDED');
  assert.deepEqual(f.counts,{uploads:0,downloads:1,verifications:1});
  assert.equal((await f.rt.verifyArtifact(request)).status,'SUCCEEDED');
 }finally{await f.cleanup();}
});

test('failed comparison with unconfirmed local cleanup keeps the runtime blocked',async()=>{
 const f=await fixture({conflict:true});
 try{
  const request={...await f.request(),compareExisting:true};f.page.downloadBytes='bad';f.page.failDownloadRelease=true;
  const result=await f.rt.verifyArtifact(request);
  assert.equal(result.status,'AMBIGUOUS');assert.equal(result.cleanup_complete,false);
  assert.equal(result.error.code,'TRANSFER_CLEANUP_FAILED');
  assert.throws(()=>f.rt.assertPreparationAllowed(),/action/);
  f.page.failDownloadRelease=false;
  assert.equal((await f.rt.inspect({operationId:'upload'})).output.state,'resolved');
  assert.deepEqual(f.counts,{uploads:0,downloads:1,verifications:1});
 }finally{f.page.failDownloadRelease=false;await f.cleanup();}
});

test('verification hashes downloaded bytes once and completes the confirmed transfer',async()=>{
  const f=await fixture();
  try {
    const request=await f.request(),result=await f.rt.verifyArtifact(request);
    assert.equal(result.status,'SUCCEEDED');assert.equal(result.action_key,'artifact.verify');
    assert.equal(result.output.bytes_verified,true);assert.equal(result.output.upload_completion_verified,true);
    assert.equal(result.output.sha256,createHash('sha256').update('abc').digest('hex'));
    assert.deepEqual(await f.rt.verifyArtifact(request),result);
    assert.deepEqual(f.counts,{uploads:1,downloads:1,verifications:1});
    const inspected=await f.rt.inspect({operationId:'upload'});
    assert.equal(inspected.output.state,'resolved');
    assert.equal(inspected.output.outcome.output.server_copy_verification.bytes_verified,true);
    assert.equal(inspected.output.outcome.status,'SUCCEEDED');
    assert.doesNotThrow(()=>f.rt.assertPreparationAllowed());
    assert.ok(!JSON.stringify(f.events).includes('dock-verify-'));
    assert.equal(f.events.filter(e=>e.phase==='download_completed').length,1);
    assert.equal(f.events.filter(e=>e.phase==='download_verified').length,1);
    assert.equal(f.events.filter(e=>e.phase==='transfer_completed').length,1);
    assert.equal(f.events.filter(e=>e.phase==='verification_completed').length,1);
    await assert.rejects(()=>f.rt.verifyArtifact({...request,fileRef:'other'}),/different/);
  } finally {await f.cleanup();}
});

test('completion journal failure retains byte proof and retries only finalization after files were released',async()=>{
  for(const phase of ['transfer_completed','verification_completed']) {
    const f=await fixture();
    try {
      const request=await f.request();f.page.failJournalPhase=phase;
      await assert.rejects(()=>f.rt.verifyArtifact(request),/journal unavailable/);
      assert.throws(()=>f.rt.assertPreparationAllowed(),/action/);
      assert.deepEqual(f.counts,{uploads:1,downloads:1,verifications:1});
      const inspected=await f.rt.inspect({operationId:'upload'});
      assert.equal(inspected.output.state,'resolved');
      assert.equal((await f.rt.verifyArtifact(request)).output.upload_completion_verified,true);
      assert.deepEqual(f.counts,{uploads:1,downloads:1,verifications:1});
      assert.equal(f.events.filter(e=>e.phase==='transfer_completed').length,1);
      assert.equal(f.events.filter(e=>e.phase==='verification_completed').length,1);
    } finally {await f.cleanup();}
  }
});

test('matching bytes without confirmed native submission do not complete the upload',async()=>{
  const f=await fixture({submissionFailure:true});
  try {
    const result=await f.rt.verifyArtifact(await f.request());
    assert.equal(result.output.bytes_verified,true);assert.equal(result.output.upload_completion_verified,false);
    assert.equal((await f.rt.inspect({operationId:'upload'})).output.state,'pending');
    assert.equal(f.events.filter(e=>e.phase==='transfer_completed').length,0);
  } finally {await f.cleanup();}
});

test('unconfirmed cleanup preserves the pending gate despite matching bytes',async()=>{
  const f=await fixture();
  try {
    const request=await f.request();f.page.failDownloadRelease=true;
    const result=await f.rt.verifyArtifact(request);
    assert.equal(result.status,'AMBIGUOUS');assert.equal(result.error.code,'TRANSFER_CLEANUP_FAILED');
    assert.equal(result.output.bytes_verified,true);assert.equal(result.output.upload_completion_verified,false);
    assert.throws(()=>f.rt.assertPreparationAllowed(),/action/);
    assert.equal((await f.rt.inspect({operationId:'upload'})).output.state,'pending');
    assert.equal(f.events.filter(e=>e.phase==='transfer_completed').length,0);
    assert.deepEqual(f.counts,{uploads:1,downloads:1,verifications:1});
  } finally {await f.cleanup();}
});

test('same-sized wrong downloaded content fails SHA without repeating upload',async()=>{
  const f=await fixture();
  try {
    f.page.downloadBytes='bad';const result=await f.rt.verifyArtifact(await f.request());
    assert.equal(result.status,'FAILED');assert.equal(result.error.code,'DOWNLOADED_ARTIFACT_MISMATCH');
    assert.equal(result.output.bytes_verified,false);
    assert.equal((await f.rt.inspect({operationId:'upload'})).output.state,'pending');
    assert.deepEqual(f.counts,{uploads:1,downloads:1,verifications:1});
  } finally {await f.cleanup();}
});

test('lost download response is recovered and hashed from the existing private copy',async()=>{
  const f=await fixture();
  try {
    const request=await f.request();f.page.dropReply=true;
    assert.equal((await f.rt.verifyArtifact(request)).error.code,'BROWSER_CALL_UNCERTAIN');
    assert.deepEqual(f.counts,{uploads:1,downloads:1,verifications:0});
    assert.equal((await f.rt.verifyArtifact(request)).error.code,'BROWSER_CALL_UNCERTAIN');
    await assert.rejects(()=>f.rt.verifyArtifact({...request,verificationId:'other'}),/pending upload browser/);
    const inspected=await f.rt.inspect({operationId:'upload'});
    assert.equal(inspected.output.state,'resolved');
    assert.equal(inspected.output.outcome.output.server_copy_verification.bytes_verified,true);
    assert.equal((await f.rt.verifyArtifact(request)).status,'SUCCEEDED');
    assert.deepEqual(f.counts,{uploads:1,downloads:1,verifications:1});
  } finally {await f.cleanup();}
});

test('verification rejects unissued file refs, wrong operation and ID collisions before download',async()=>{
  const f=await fixture();
  try {
    const request=await f.request();
    for(const change of [{fileRef:'ui-unissued'},{operationId:'unknown'},{verificationId:'upload'},{observationId:'expired'}])
      await assert.rejects(()=>f.rt.verifyArtifact({...request,...change}));
    assert.deepEqual(f.counts,{uploads:1,downloads:0,verifications:0});
  } finally {await f.cleanup();}
});

test('local validation or staging failure never marks verification as dispatched and permits safe continuation',async()=>{
 const f=await fixture();let dispatched=0;
 try{
  const initial=await f.request();
  await assert.rejects(()=>f.rt.verifyArtifact({...initial,fileRef:'unissued',onDispatched:()=>dispatched++}));
  assert.equal(dispatched,0);assert.equal(f.counts.downloads,0);
  f.page.failJournalPhase='download_prepared';
  await assert.rejects(()=>f.rt.verifyArtifact({...initial,onDispatched:()=>dispatched++}),/journal unavailable/);
  assert.equal(dispatched,0);assert.equal(f.counts.downloads,0);
  const request=await f.request();
  const result=await f.rt.verifyArtifact({...request,onDispatched:()=>dispatched++});
  assert.equal(result.status,'SUCCEEDED');assert.equal(dispatched,1);assert.equal(f.counts.uploads,1);assert.equal(f.counts.downloads,1);
 }finally{await f.cleanup();}
});


test('XLSX preflight and download retain exact byte/hash verification and format refusals',async()=>{
 const bytes=Buffer.from([0x50,0x4b,0xff,0x00]);
 const f=await fixture({name:'sales.XLSX',bytes});
 try {
  for(const name of ['sales.xlsx','sales.XLSX','sales.csv','sales.tsv','sales.txt'])assert.doesNotThrow(()=>f.rt.preflightDeliveredArtifact({name}));
  for(const name of ['sales.xls','sales.xlsm','file.lgp','sales.xlsx.exe','file.json'])assert.throws(()=>f.rt.preflightDeliveredArtifact({name}),e=>e.code==='ARTIFACT_VERIFICATION_UNSUPPORTED');
  const result=await f.rt.verifyArtifact(await f.request());
  assert.equal(result.status,'SUCCEEDED');assert.equal(result.output.bytes_verified,true);
  assert.equal(result.output.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(f.counts,{uploads:1,downloads:1,verifications:1});
 }finally{await f.cleanup();}
 const wrong=await fixture({name:'wrong.xlsx',bytes});
 try {
  wrong.page.downloadBytes=Buffer.from([0x50,0x4b,0xfe,0x00]);
  const r=await wrong.rt.verifyArtifact(await wrong.request());
  assert.equal(r.status,'FAILED');assert.equal(r.error.code,'DOWNLOADED_ARTIFACT_MISMATCH');
  assert.equal(r.output.bytes_verified,false);
 }finally{await wrong.cleanup();}
});
