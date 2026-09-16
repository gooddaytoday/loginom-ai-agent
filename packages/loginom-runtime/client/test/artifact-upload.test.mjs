import test from 'node:test';
import assert from 'node:assert/strict';
import {Page,runtime} from './support/executor-fixture.mjs';

function fixture() {
  const page=new Page(),baseSnapshot=page.uiSnapshot.bind(page),baseLocator=page.locator.bind(page);
  let submitted=0,released=0,staged=0;
  const artifact={artifact_id:'artifact-1',name:'data.csv',bytes:3,sha256:'a'.repeat(64),
    upload:{grant_id:'grant-1',directory:'/test',destination:'/test/data.csv',overwrite:'replace'}};
  page.storage='/test';page.blocked=false;page.inputCount=1;page.failSubmission=false;
  page.uiSnapshot=()=>({...baseSnapshot(),file_storage:{status:'observed',directory:page.storage,listing_complete:false}});
  const element={isConnected:true,tagName:'INPUT',type:'file',files:[]};
  const input={count:async()=>page.inputCount,isEnabled:async()=>true,elementHandle:async()=>input,
    evaluate:async(fn,arg)=>fn(element,arg),dispose:async()=>{},
    setInputFiles:async path=>{assert.equal(path,'/private/staged/data.csv');submitted++;if(page.failSubmission)throw new Error('private error');}};
  page.locator=selector=>selector.includes('FileStorageForm;tbrActions')
    ? {count:async()=>1,isVisible:async()=>!page.blocked,isEnabled:async()=>true,locator:()=>input} : baseLocator(selector);
  const store={list:()=>[structuredClone(artifact)],getUploadGrant(id,grant){if(id!==artifact.artifact_id || grant!==artifact.upload.grant_id)throw new Error('not authorized');return structuredClone(artifact);},
    stageUpload:async()=>{staged++;return {path:'/private/staged/data.csv',verify:async()=>artifact,release:async()=>{released++;}};}};
  const events=[];
  const rt=runtime(page,{artifactStore:store,onRecord:async event=>events.push(event)});
  const request=async()=>({artifactId:artifact.artifact_id,grantId:artifact.upload.grant_id,
    observationId:(await rt.observe()).output.observation_id,operationId:'upload-1'});
  const native=()=>{
    class FileSenderManager {constructor(){this.CurrentDirectory='/test/';this.FActiveLoadersCount=0;this.FCurrentUploadFilePaths={};}}
    class FileStorageForm {constructor(){this.FFileInput=element;this.FFileSenderManager=new FileSenderManager();}}
    const form=new FileStorageForm();page.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab=()=>({Controller:{FController:form}});
    return form;
  };
  return {page,rt,artifact,request,events,store,native,counts:()=>({submitted,released,staged})};
}

test('upload uses the admitted path once and leaves server verification pending',async()=>{
  const f=fixture(),request=await f.request();
  const result=await f.rt.upload(request);
  assert.equal(result.status,'AMBIGUOUS');assert.equal(result.output.upload_submitted,true);
  assert.equal(result.output.destination,'/test/data.csv');
  assert.equal(result.error.code,'UPLOAD_SERVER_VERIFICATION_REQUIRED');
  assert.deepEqual(await f.rt.upload(request),result);
  assert.deepEqual(f.counts(),{submitted:1,released:0,staged:1});
  const inspected=await f.rt.inspect({operationId:'upload-1'});
  assert.equal(inspected.output.state,'pending');assert.deepEqual(inspected.output.recovery_options,[]);
  assert.equal(inspected.output.outcome.output.upload_submitted,true);
  await assert.rejects(()=>f.rt.upload({...request,operationId:'upload-2'}),/pending/);
  await assert.rejects(()=>f.rt.upload({...request,observationId:'changed'}),/different/);
  await assert.rejects(()=>f.rt.recover('upload-1',{strategy:'abandon_operation',recoveryOperationId:'abandon'}),/server transfer/);
  const uiRequest={observationId:'new',operationId:'repair',recoveryOperationId:'upload-1'};
  const beforeUi=[...f.page.events],refused=await f.rt.uiAct({verb:'click',ref:'ui-ref'},uiRequest);
  assert.equal(refused.status,'FAILED');assert.equal(refused.effect_possible,false);
  assert.equal(refused.output.request_refusal.browser_invoked,false);
  assert.equal(refused.output.operation.state,'pending');assert.equal(refused.output.operation.effect_state,'partial_or_unverified');
  assert.deepEqual(f.page.events,beforeUi);
  const record=f.events.find(e=>e.phase==='ui_request_rejected');assert.deepEqual(record.outcome,refused);
  assert.equal(record.pending_operation_id,'upload-1');assert.equal(record.operation_id,'repair');
  assert.deepEqual(await f.rt.uiAct({verb:'click',ref:'ui-ref'},uiRequest),refused);
  assert.equal(f.events.filter(e=>e.phase==='ui_request_rejected').length,1);
  await assert.rejects(()=>f.rt.uiAct({verb:'scroll',ref:'ui-ref',delta_y:100},uiRequest),/different parameters/);
  assert.throws(()=>f.rt.assertPreparationAllowed(),/action/);
  assert.ok(!JSON.stringify(f.events).includes('/private/'));
  assert.deepEqual(f.events.filter(e=>e.action_key==='artifact.upload').map(e=>e.phase),['prepared','completed','reconciled']);
});

test('upload refuses unsupported reject and absent grants without browser submission',async()=>{
  const f=fixture(),request=await f.request();f.artifact.upload.overwrite='reject';
  await assert.rejects(()=>f.rt.upload(request),/reject upload policy/);
  await assert.rejects(()=>f.rt.upload({...request,grantId:'other'}),/not authorized/);
  assert.deepEqual(f.counts(),{submitted:0,released:0,staged:0});
  const normal=runtime(f.page,{artifactStore:f.store,allowCandidate:false});
  assert.ok(!normal.tools.some(t=>t.name==='dock_artifact_upload'));
  await assert.rejects(()=>normal.upload(request),/candidate/);
});

test('fresh browser guards reject directory changes and unavailable upload inputs',async()=>{
  for(const change of [f=>{f.page.storage='/analyst';},f=>{f.page.blocked=true;},f=>{f.page.inputCount=2;}]) {
    const f=fixture(),request=await f.request();change(f);
    const result=await f.rt.upload(request);
    assert.equal(result.status,'NOT_APPLIED');assert.equal(result.effect_possible,false);
    assert.deepEqual(f.counts(),{submitted:0,released:1,staged:1});
    assert.equal((await f.rt.inspect({operationId:'upload-1'})).output.state,'resolved');
    assert.deepEqual(await f.rt.upload(request),result);
  }
});

test('upload refuses changed identity, epoch, authentication, masks and dialogs before file input',async()=>{
  for(const change of [{origin:'https://other.invalid'},{loginom_build:'other'},{authenticated:false},
    {dom_epoch:{document:'new',revision:0}},{workflow_ref:{prefix:'MF;TF-99',tab_tid:'other'}},
    {ui:{elements:[],dialogs:[{ref:'dialog'}],masks:[]}},{ui:{elements:[],dialogs:[],masks:[{ref:'mask'}]}}]) {
    const f=fixture(),request=await f.request(),snapshot=f.page.uiSnapshot();
    f.page.uiSnapshot=()=>({...snapshot,...change});
    const result=await f.rt.upload(request);
    assert.equal(result.status,'NOT_APPLIED');assert.equal(result.effect_possible,false);
    assert.equal(f.counts().submitted,0);
  }
});

test('concurrent repeat reports the running operation and cancellation before dispatch releases staging',async()=>{
  const f=fixture();let finish,started;
  const didStart=new Promise(resolve=>{started=resolve;});
  const wait=new Promise(resolve=>{finish=resolve;});
  const rt=runtime(f.page,{artifactStore:f.store,execute:async code=>{
    if(code.includes('async function browserArtifactUpload')){started();await wait;}
    return f.page.execute(code);
  }});
  const request={artifactId:'artifact-1',grantId:'grant-1',observationId:(await rt.observe()).output.observation_id,operationId:'concurrent'};
  const pending=rt.upload(request);await didStart;
  assert.equal((await rt.upload(request)).error.code,'OPERATION_STILL_PENDING');
  assert.equal(f.counts().staged,1);finish();await pending;
  assert.equal(f.counts().submitted,1);
  const cancelled=fixture(),controller=new AbortController();
  const cancelRuntime=runtime(cancelled.page,{artifactStore:cancelled.store,onRecord:async record=>{
    if(record.phase==='prepared')controller.abort();
  }});
  await assert.rejects(()=>cancelRuntime.upload({...request,observationId:undefined,signal:controller.signal}),/Observe/);
  const observationId=(await cancelRuntime.observe()).output.observation_id;
  await assert.rejects(()=>cancelRuntime.upload({...request,observationId,signal:controller.signal}),/abort/i);
  assert.deepEqual(cancelled.counts(),{submitted:0,released:1,staged:1});
});

test('a lost upload reply is reconciled from the existing browser receipt without another submission',async()=>{
  const f=fixture();let lost=false;
  const rt=runtime(f.page,{artifactStore:f.store,execute:async code=>{
    const result=await f.page.execute(code);
    if(result.action_key==='artifact.upload' && !lost){lost=true;throw new Error('response lost');}
    return result;
  }});
  const request={artifactId:'artifact-1',grantId:'grant-1',observationId:(await rt.observe()).output.observation_id,operationId:'lost-upload'};
  assert.equal((await rt.upload(request)).error.code,'BROWSER_CALL_UNCERTAIN');
  const inspected=await rt.inspect({operationId:'lost-upload'});
  assert.equal(inspected.output.state,'pending');assert.equal(inspected.output.outcome.output.upload_submitted,true);
  assert.equal((await rt.upload(request)).error.code,'UPLOAD_SERVER_VERIFICATION_REQUIRED');
  assert.deepEqual(f.counts(),{submitted:1,released:0,staged:1});
});

test('a native input error after submission begins stays ambiguous and does not expose private errors',async()=>{
  const f=fixture(),request=await f.request();f.page.failSubmission=true;
  const result=await f.rt.upload(request);
  assert.equal(result.error.code,'UPLOAD_SUBMISSION_UNCERTAIN');assert.equal(result.effect_possible,true);
  assert.ok(!JSON.stringify(result).includes('private error'));
  assert.equal((await f.rt.inspect({operationId:'upload-1'})).output.state,'pending');
  assert.deepEqual(f.counts(),{submitted:1,released:0,staged:1});
});

test('recovery of a lost not-applied receipt releases its lease only after browser confirmation',async()=>{
  const f=fixture();let lost=false;
  const rt=runtime(f.page,{artifactStore:f.store,execute:async code=>{
    const result=await f.page.execute(code);
    if(result.action_key==='artifact.upload' && !lost){lost=true;throw new Error('lost');}
    return result;
  }});
  const request={artifactId:'artifact-1',grantId:'grant-1',observationId:(await rt.observe()).output.observation_id,operationId:'not-applied'};
  f.page.blocked=true;await rt.upload(request);
  assert.deepEqual(f.counts(),{submitted:0,released:0,staged:1});
  assert.equal((await rt.inspect({operationId:'not-applied'})).output.state,'resolved');
  assert.deepEqual(f.counts(),{submitted:0,released:1,staged:1});
});


test('grant rejection returns only current public pairs without staging or relaxing authorization',async()=>{
  const f=fixture();
  const error=Object.assign(new Error('not authorized'),{code:'ARTIFACT_GRANT_NOT_FOUND'});
  const result=f.rt.requestFailure(error);
  assert.equal(result.effect_possible,false);assert.equal(result.request_rejected,true);
  assert.deepEqual(result.output.input_artifacts,[f.artifact]);
  result.output.input_artifacts[0].upload.directory='/changed';
  const description=f.rt.describe();assert.deepEqual(description.input_artifacts,[f.artifact]);
  description.input_artifacts[0].artifact_id='changed';
  assert.deepEqual(f.rt.describe().input_artifacts,[f.artifact]);
  assert.deepEqual(f.counts(),{submitted:0,released:0,staged:0});
  const request=await f.request();
  await assert.rejects(()=>f.rt.upload({...request,grantId:'wrong'}),/not authorized/);
  assert.deepEqual(f.counts(),{submitted:0,released:0,staged:0});
  assert.ok(!JSON.stringify(result).includes('/private/'));
});


test('private delivered upload supports reject for a new file and retains server-byte verification',async()=>{
 const f=fixture();f.artifact.upload.overwrite='reject';f.native();
 const request=await f.request();f.page.context.document={querySelectorAll:()=>[]};
 const result=await f.rt.uploadDeliveredArtifact(request);
 assert.equal(result.status,'AMBIGUOUS');assert.equal(result.output.upload_submitted,true);
 assert.equal(result.trace.at(-1).event,'upload_native_input_settled');
 assert.equal(result.trace.at(-1).policy,'reject');assert.equal(f.counts().submitted,1);
});

test('private delivered upload refuses cached replacement state before selecting a file',async()=>{
 const f=fixture(),native=f.native();native.FFileSenderManager.FLastConflictResult=1;
 const result=await f.rt.uploadDeliveredArtifact(await f.request());
 assert.equal(result.status,'NOT_APPLIED');assert.equal(result.error.code,'UPLOAD_SENDER_NOT_IDLE');
 assert.deepEqual(f.counts(),{submitted:0,released:1,staged:1});
});

test('delivered upload refreshes only the same directory and document before selecting a file',async()=>{
 const f=fixture();f.native();
 const request=await f.request(),base=f.page.uiSnapshot.bind(f.page);f.page.context.document={querySelectorAll:()=>[]};
 f.page.uiSnapshot=()=>({...base(),dom_epoch:{document:'fixture-document',revision:1}});
 const r=await f.rt.uploadDeliveredArtifact(request);
 assert.equal(r.output.upload_submitted,true);assert.equal(f.counts().submitted,1);
 const refreshed=r.trace.filter(t=>t.event==='upload_precondition_refreshed');assert.equal(refreshed.length,1);
 assert.equal(refreshed[0].status,'NOT_APPLIED');assert.equal(refreshed[0].effect_possible,false);
 assert.equal(refreshed[0].before.document,refreshed[0].after.document);
 assert.deepEqual(await f.rt.uploadDeliveredArtifact(request),r);assert.equal(f.counts().submitted,1);
});

test('delivered upload bounds precondition refreshes and refuses a different document',async()=>{
 for(const mode of ['churn','foreign']) {
  const f=fixture();f.native();
  const request=await f.request(),base=f.page.uiSnapshot.bind(f.page);let revision=0;f.page.context.document={querySelectorAll:()=>[]};
  f.page.uiSnapshot=()=>({...base(),dom_epoch:{document:mode==='foreign'?'foreign':'fixture-document',revision:++revision}});
  const r=await f.rt.uploadDeliveredArtifact(request);assert.equal(r.status,'NOT_APPLIED');assert.equal(r.effect_possible,false);
  assert.equal(r.cleanup_complete,true);assert.equal(r.error.code,'UPLOAD_CONTEXT_CHANGED');
  assert.equal(r.trace.filter(t=>t.event==='upload_precondition_refreshed').length,mode==='churn'?2:0);
  assert.deepEqual(f.counts(),{submitted:0,released:1,staged:1});
 }
});
