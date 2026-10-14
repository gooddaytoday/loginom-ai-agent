import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createArtifactStore} from '../lib/artifacts.mjs';
import {Page,runtime} from './support/executor-fixture.mjs';

async function fixture({submissionFailure=false,managementFailure,failManagement=false,holdManagement}={}) {
  const directory=await mkdtemp(join(tmpdir(),'dock-verify-'));
  const sourcePath=join(directory,'source');await writeFile(sourcePath,'abc');
  const store=await createArtifactStore({directory:join(directory,'store')});
  const artifact=await store.admit({sourcePath,name:'sales.csv',bytes:3,sha256:createHash('sha256').update('abc').digest('hex'),
    upload:{directory:'/test',overwrite:'replace'}});
  const page=new Page(),elements=page.elements.bind(page),snapshot=page.uiSnapshot.bind(page),locator=page.locator.bind(page);
  const tid=page.prefix+';FileStorageForm;colName_sales.csv';
  page.elements=()=>[...elements(),page.element(page.prefix+';NavigationBar;NavigationPanel',{label:'Navigation'}),page.element(tid,{label:'sales.csv',kind:'file'})];
  page.uiSnapshot=()=>({...snapshot(),observation_root:{ref:page.uiReference(page.prefix+';NavigationBar;NavigationPanel')},file_storage:{status:'observed',directory:'/test',listing_complete:false},ui:{...snapshot().ui,elements:snapshot().ui.elements.map(e=>e.tid===tid?{...e,storage_entry:{bytes:3,kind:'file'}}:e)}});
  const counts={uploads:0,downloads:0,verifications:0};
  const inputElement={isConnected:true,tagName:'INPUT',type:'file',files:[]};
  class FileSenderManager {constructor(){this.CurrentDirectory='/test/';this.FActiveLoadersCount=0;this.FCurrentUploadFilePaths={};}}
  class FileStorageForm {constructor(){this.FFileInput=inputElement;this.FFileSenderManager=new FileSenderManager();}}
  page.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab=()=>({Controller:{FController:new FileStorageForm()}});
  const input={count:async()=>1,isEnabled:async()=>true,elementHandle:async()=>input,dispose:async()=>{},
    evaluate:async(fn,arg)=>{page.context.document??={querySelectorAll:()=>[]};page.context.inputElement=inputElement;page.context.inputTask=arg;return vm.runInContext('('+fn.toString()+')(inputElement,inputTask)',page.context);},setInputFiles:async path=>{
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
    if(record.phase==='artifact_delivery_completed'){if(failManagement){failManagement=false;throw managementFailure;}await holdManagement?.();}
    if(page.failJournalPhase===record.phase){page.failJournalPhase=null;throw new Error('journal unavailable');}
    events.push(record);
    if(record.phase==='verification_completed')page.clock+=120001;
    return record;
  },execute:async code=>{
    const result=await page.execute(code);
    if(page.dropReply && result.action_key==='artifact.download'){page.dropReply=false;throw new Error('response lost');}
    return result;
  }});
  const observed=await rt.observe();
  const deliveryRequest={operation_id:'delivery',artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:120000};
  const initial=await rt.deliverArtifact(deliveryRequest);
  const request=async()=>{
    const row=await rt.observe();return {operationId:'upload',verificationId:'verify',observationId:row.output.observation_id,
      fileRef:row.output.ui.elements.find(item=>item.tid===tid).ref};
  };
  return {rt,page,events,counts,request,initial,deliveryRequest,cleanup:async()=>{await store.releaseUploads();await rm(directory,{recursive:true,force:true});}};
}


test('whole executor inspect reconciles completed transfer after delivery deadline without replay',async()=>{
 const f=await fixture();try {
  assert.equal(f.initial.outcome.status,'AMBIGUOUS',JSON.stringify(f.initial));
  assert.equal(f.rt.hasUnsettledWork(),true);
  const before={...f.counts},pageEvents=[...f.page.events];
  const inspected=await f.rt.inspect({operationId:'delivery:upload'});
  assert.equal(inspected.output.state,'resolved',JSON.stringify({initial:f.initial,inspected,counts:f.counts}));
  assert.equal(f.rt.hasUnsettledWork(),false);
  const status=f.rt.artifactDeliveryStatus('delivery');
  assert.equal(status.outcome.status,'SUCCEEDED');
  assert.equal(status.original_refusal.outcome.status,'AMBIGUOUS');
  assert.match(status.original_refusal.error.message,/deadline/);
  await f.rt.inspect({operationId:'delivery:upload'});
  assert.deepEqual(f.counts,before);assert.deepEqual(f.page.events,pageEvents);
  assert.deepEqual(before,{uploads:1,downloads:1,verifications:1});
  assert.equal(f.events.filter(e=>e.phase==='artifact_delivery_completed').length,1);
  assert.equal((await f.rt.deliverArtifact(f.deliveryRequest)).outcome.status,'AMBIGUOUS');
 }finally{await f.cleanup();}
});

for(const failure of [Object.assign(Error('write failed'),{cause:0}),undefined,null,false,0,''])
 test('whole executor retains uncertainty on raw management failure '+String(failure),async()=>{
  const f=await fixture({managementFailure:failure,failManagement:true});try {
   const before={...f.counts};let caught=false;
   try{await f.rt.inspect({operationId:'delivery:upload'});}catch(error){caught=true;assert.equal(error,failure);}
   assert.equal(caught,true);assert.equal(f.rt.hasUnsettledWork(),true);
   assert.deepEqual(f.rt.artifactDeliveryStatus('delivery'),f.initial);
   await f.rt.inspect({operationId:'delivery:upload'});
   assert.equal(f.rt.hasUnsettledWork(),false);assert.deepEqual(f.counts,before);
   assert.equal(f.rt.artifactDeliveryStatus('delivery').original_refusal.outcome.status,'AMBIGUOUS');
  }finally{await f.cleanup();}
 });

test('management acknowledgement retains serial custody until completion',async()=>{
 let release,entered;const held=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 const f=await fixture({holdManagement:()=>{entered();return held;}});try {
  const inspect=f.rt.inspect({operationId:'delivery:upload'});await started;
  assert.equal(f.rt.hasUnsettledWork(),true);
  await assert.rejects(f.rt.inspect({operationId:'delivery:upload'}),/in progress/);
  assert.equal(f.rt.artifactDeliveryStatus('delivery').outcome.status,'AMBIGUOUS');
  release();await inspect;assert.equal(f.rt.hasUnsettledWork(),false);
  assert.deepEqual(f.counts,{uploads:1,downloads:1,verifications:1});
 }finally{release();await f.cleanup();}
});
