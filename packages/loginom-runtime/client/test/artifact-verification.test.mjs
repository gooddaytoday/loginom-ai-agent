import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createArtifactStore} from '../lib/artifacts.mjs';
import {Page,runtime} from './support/executor-fixture.mjs';

async function fixture({submissionFailure=false}={}) {
  const directory=await mkdtemp(join(tmpdir(),'dock-verify-'));
  const sourcePath=join(directory,'source');await writeFile(sourcePath,'abc');
  const store=await createArtifactStore({directory:join(directory,'store')});
  const artifact=await store.admit({sourcePath,name:'sales.csv',bytes:3,sha256:createHash('sha256').update('abc').digest('hex'),
    upload:{directory:'/test',overwrite:'replace'}});
  const page=new Page(),elements=page.elements.bind(page),snapshot=page.uiSnapshot.bind(page),locator=page.locator.bind(page);
  const tid=page.prefix+';FileStorageForm;colName_sales.csv';
  page.elements=()=>[...elements(),page.element(tid,{label:'sales.csv',kind:'file'})];
  page.uiSnapshot=()=>({...snapshot(),file_storage:{status:'observed',directory:'/test',listing_complete:false}});
  const counts={uploads:0,downloads:0,verifications:0};
  const input={count:async()=>1,isEnabled:async()=>true,elementHandle:async()=>input,dispose:async()=>{},
    evaluate:async fn=>fn({isConnected:true,tagName:'INPUT',type:'file'}),setInputFiles:async path=>{
      assert.equal((await readFile(path)).toString(),'abc');counts.uploads++;
      if(submissionFailure)throw new Error('input completion not confirmed');
    }};
  page.locator=selector=>selector.includes('FileStorageForm;tbrActions') ? {
    count:async()=>1,isVisible:async()=>true,isEnabled:async()=>true,locator:()=>input} : locator(selector);
  let event;page.downloadBytes='abc';page.dropReply=false;
  const download={url:()=> 'https://loginom.invalid/download',suggestedFilename:()=> 'sales.csv',failure:async()=>null,cancel:async()=>{},
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
    const result=await page.execute(code);
    if(page.dropReply && result.action_key==='artifact.download'){page.dropReply=false;throw new Error('response lost');}
    return result;
  }});
  const observed=await rt.observe();
  await rt.upload({artifactId:artifact.artifact_id,grantId:artifact.upload.grant_id,observationId:observed.output.observation_id,operationId:'upload'});
  const request=async()=>{
    const row=await rt.observe();return {operationId:'upload',verificationId:'verify',observationId:row.output.observation_id,
      fileRef:row.output.ui.elements.find(item=>item.tid===tid).ref};
  };
  return {rt,page,events,counts,request,cleanup:async()=>{await store.releaseUploads();await rm(directory,{recursive:true,force:true});}};
}

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
