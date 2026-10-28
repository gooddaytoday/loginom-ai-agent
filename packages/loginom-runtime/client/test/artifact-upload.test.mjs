import test from 'node:test';
import assert from 'node:assert/strict';
import {Page,runtime} from './support/executor-fixture.mjs';
import {verifyTextImportSource,verifyFullImportCount} from '../lib/text-import-node.mjs';
import {makeArtifactUploadCode} from '../lib/executor.mjs';

function fixture(name='data.csv') {
  const page=new Page(),baseSnapshot=page.uiSnapshot.bind(page),baseLocator=page.locator.bind(page);
  let submitted=0,released=0,staged=0;
  const timeouts=[];
  const artifact={artifact_id:'artifact-1',name,bytes:3,sha256:'a'.repeat(64),
    upload:{grant_id:'grant-1',directory:'/test',destination:'/test/'+name,overwrite:'replace'}};
  page.storage='/test';page.blocked=false;page.inputCount=1;page.failSubmission=false;
  page.uiSnapshot=()=>({...baseSnapshot(),file_storage:{status:'observed',directory:page.storage,listing_complete:false}});
  const element={isConnected:true,tagName:'INPUT',type:'file',files:[]};
  const input={count:async()=>page.inputCount,isEnabled:async()=>true,elementHandle:async()=>input,
    evaluate:async(fn,arg)=>fn(element,arg),dispose:async()=>{},
    setInputFiles:async(path,options)=>{assert.equal(path,'/private/staged/'+name);timeouts.push(options.timeout);submitted++;
      await page.afterUpload?.();if(page.failSubmission)throw new Error('private error');}};
  page.locator=selector=>selector.includes('FileStorageForm;tbrActions')
    ? {count:async()=>1,isVisible:async()=>!page.blocked,isEnabled:async()=>true,locator:()=>input} : baseLocator(selector);
  const store={list:()=>[structuredClone(artifact)],getUploadGrant(id,grant){if(id!==artifact.artifact_id || grant!==artifact.upload.grant_id)throw new Error('not authorized');return structuredClone(artifact);},
    stageUpload:async()=>{staged++;return {path:'/private/staged/'+name,verify:async()=>artifact,release:async()=>{released++;}};}};
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
  return {page,rt,artifact,request,events,store,native,timeouts,counts:()=>({submitted,released,staged})};
}

test('private delivery observations bound browser transport to the remaining deadline',async()=>{
  const f=fixture(),timeouts=[],signal=new AbortController().signal;
  const rt=runtime(f.page,{execute:async(code,options)=>{timeouts.push(options.timeout);assert.equal(options.signal,signal);return f.page.execute(code);}});
  await rt.observe({scope:'roots',signal,deadlineAt:f.page.clock+250});
  assert.deepEqual(timeouts,[250]);
});

test('private delivery navigation bounds browser transport to its remaining deadline',async()=>{
  const f=fixture(),timeouts=[];f.page.addNode('Target',104,104);
  const rt=runtime(f.page,{execute:async(code,options)=>{timeouts.push(options.timeout);return f.page.execute(code);}});
  const read=await rt.observe(),target=read.output.ui.elements.find(element=>element.label==='Target');
  const result=await rt.uiAct({verb:'click',ref:target.ref},{operationId:'navigation',observationId:read.output.observation_id,
    deadlineAt:f.page.clock+250});
  assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(timeouts.at(-1),250);
});

test('an expired package deadline refuses the native upload before file selection',async()=>{
  const f=fixture('data.lgp');f.artifact.upload.overwrite='reject';f.native();
  const result=await f.page.execute(makeArtifactUploadCode({operation_id:'expired',artifact:f.artifact,
    upload_path:'/private/staged/data.lgp',snapshot:f.page.uiSnapshot(),decide_conflicts:true,
    expected_build:f.page.app.Version,expected_origin:'https://loginom.invalid',deadline_at:f.page.clock}));
  assert.equal(result.status,'NOT_APPLIED');assert.equal(result.effect_possible,false);
  assert.equal(f.counts().submitted,0);
});

test('package upload and sender settlement share the remaining original deadline',async()=>{
  const f=fixture('data.lgp');f.artifact.upload.overwrite='reject';const form=f.native();
  await f.rt.observe();f.page.context.document={querySelectorAll:()=>[]};
  f.page.afterUpload=()=>{form.FFileSenderManager.FActiveLoadersCount=1;};
  const deadline=f.page.clock+2500;
  const result=await f.page.execute(makeArtifactUploadCode({operation_id:'short-budget',artifact:f.artifact,
    upload_path:'/private/staged/data.lgp',snapshot:f.page.uiSnapshot(),decide_conflicts:true,
    expected_build:f.page.app.Version,expected_origin:'https://loginom.invalid',deadline_at:deadline}));
  assert.equal(result.status,'AMBIGUOUS');assert.equal(result.error.code,'UPLOAD_DECISION_UNKNOWN');
  assert.equal(f.counts().submitted,1);assert.deepEqual(f.timeouts,[2500]);assert.ok(f.page.clock<=deadline);
});

for(const fault of [null,'journal','missing_ack','cleanup','proof','cancel'])test('private package completion settles only with durable proof and cleanup: '+fault,async()=>{
  const f=fixture('data.lgp');f.artifact.upload.overwrite='reject';let browserUploads=0;
  const controller=new AbortController();
  if(fault==='cleanup'){
    const stage=f.store.stageUpload;
    f.store.stageUpload=async()=>{const lease=await stage();return {...lease,release:async()=>{await lease.release();throw Error('Lease cleanup unconfirmed');}};};
  }
  const original={status:'AMBIGUOUS',action_key:'artifact.upload',action_revision:'1',operation_id:'package-upload',phase:'submitted',
    effect_possible:true,cleanup_complete:true,output:{upload_submitted:true,destination:'/test/data.lgp'},
    error:{code:'UPLOAD_SERVER_VERIFICATION_REQUIRED',message:'pending'},trace:[]};
  const proof={artifact_id:'artifact-1',destination:'/test/data.lgp',bytes:fault==='proof'?2:3,bytes_source:'native_file_store',upload_completion_verified:true,
    files_entry:{document_id:'prep-doc',tab_tid:f.page.tabTid,directory:'/test'}};
  const rt=runtime(f.page,{artifactStore:f.store,now:Date.now,getStorageBinding:()=>({document_id:'prep-doc',loginom_account:'user'}),
    onRecord:async event=>{f.events.push(event);if(event.phase==='package_upload_completed'){
      if(fault==='journal')throw Error('Journal unavailable');if(fault==='missing_ack')return;
    }return event;},execute:async(code,options)=>{
      if(!code.includes('async function completePackageUpload'))return f.page.execute(code);
      assert.ok(options.timeout>0&&options.timeout<=10000);
      browserUploads++;
      if(fault==='cancel')controller.abort();
      return {status:'SUCCEEDED',action_key:'artifact.package_completion',action_revision:'1',operation_id:'package-upload',phase:'native_completion',
        effect_possible:true,cleanup_complete:true,output:{upload:structuredClone(original),completion:proof},error:null,trace:[]};
    }});
  const request={artifactId:'artifact-1',grantId:'grant-1',operationId:'package-upload',
    observationId:(await rt.observe()).output.observation_id,deadline:Date.now()+10000,signal:controller.signal};
  assert.deepEqual(await rt.uploadPackageArtifact(request),original);
  assert.equal(rt.hasUnsettledWork(),true);assert.equal(f.counts().released,0);
  if(fault&&fault!=='cancel'){
    await assert.rejects(()=>rt.completePackageArtifact({operationId:'package-upload'}),
      fault==='journal'?/Journal/:fault==='missing_ack'?/acknowledged/:fault==='cleanup'?/cleanup/:/unconfirmed/);
    assert.equal(rt.hasUnsettledWork(),true);assert.equal(browserUploads,1);
    return;
  }
  const completed=await rt.completePackageArtifact({operationId:'package-upload'});
  assert.equal(completed.upload_completion_verified,true);assert.equal(completed.source_sha256,f.artifact.sha256);
  assert.equal(Object.hasOwn(completed,'sha256'),false);assert.equal(completed.cleanup_complete,true);
  assert.equal(browserUploads,1);assert.equal(f.counts().released,1);assert.equal(rt.hasUnsettledWork(),false);
  assert.deepEqual((await rt.inspect({operationId:'package-upload'})).output.outcome,original);
  assert.equal(f.events.filter(event=>event.phase==='package_upload_completed').length,1);
});

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

test('delivery-owned recovery names public delivery continuation instead of hidden verification',async()=>{
 const f=fixture(),request=await f.request();
 await f.rt.upload({...request,deliveryOperationId:'delivery'});
 const inspected=await f.rt.inspect({operationId:request.operationId});
 assert.ok(!inspected.output.next_steps.some(s=>s.tool==='dock_artifact_verify'));
 const resume=inspected.output.next_steps.find(s=>s.tool==='dock_artifact_delivery_resume');
 assert.equal(resume.arguments.operation_id,'delivery');
});

for(const reused of [false,true])test('large runtime completion retains trusted native receipt and never downloads: '+reused,async()=>{
 const f=fixture();f.artifact.bytes=2**32+1048576;f.artifact.upload.overwrite='reject';f.native();
 const events=[],nativeModes=[];let uploads=0;
 const row={Type:0,FileName:f.artifact.name,FilePath:f.artifact.upload.destination,id:f.artifact.upload.destination,Size:f.artifact.bytes,Time:'native-time'};
 const rt=runtime(f.page,{artifactStore:f.store,getStorageBinding:()=>({document_id:'prep',loginom_account:'operator'}),
  onRecord:async e=>{events.push(e);return e;},execute:async code=>{
   if(code.includes('largeUploadNative')){
    const native=output=>({status:'SUCCEEDED',action_key:'artifact.large.native',action_revision:'1',phase:code.match(/"mode":"([^"]+)/)?.[1],operation_id:code.includes('large-2')?'large-2':'large-1',output});
    if(code.includes('"mode":"bind"')){nativeModes.push('bind');return native({reused:uploads>0||reused,row});}
    if(code.includes('"mode":"poll"')){nativeModes.push('poll');return native({quiet:true,bytes:f.artifact.bytes});}
    if(code.includes('"mode":"refresh"')){nativeModes.push('refresh');return native({});}
    if(code.includes('"mode":"verify"')){nativeModes.push('verify');return native({bytes:f.artifact.bytes,row});}
    throw Error('Unexpected native lifecycle step');
   }
   if(code.includes('browserArtifactUpload'))uploads++;
   return f.page.execute(code);
  }});
 const options={artifactId:f.artifact.artifact_id,grantId:f.artifact.upload.grant_id,observationId:(await rt.observe()).output.observation_id,
  operationId:'large-1',deliveryOperationId:'delivery',signal:new AbortController().signal,deadline:f.page.clock+60000};
 const result=await rt.uploadLargeArtifact(options);
 assert.equal(result.status,'SUCCEEDED');assert.equal(result.bytes,f.artifact.bytes);assert.equal(result.bytes_source,'native_file_store');
 assert.equal(result.source_sha256,f.artifact.sha256);assert.equal(result.reused===true,reused);
 assert.equal(f.counts().submitted,reused?0:1);assert.equal(rt.hasUnsettledWork(),false);
 assert.ok(!events.some(e=>String(e.phase).includes('download')));
 const checkSource=async id=>{
  const inspected=await rt.inspect({operationId:id}),outcome=inspected.output.outcome;
  const record={sequence:0,operation_id:id,destination:f.artifact.upload.destination,artifact:f.artifact,outcome,cleanup_confirmed:true,transport_uncertain:false};
  const source=verifyTextImportSource({source:{kind:'verified_delivery',artifact_id:f.artifact.artifact_id,upload_operation_id:id},settings:{source:{source_path:f.artifact.upload.destination}}},[record],{complete:true,records:[record]}).source;
  assert.equal(source.sha256,f.artifact.sha256);assert.equal(source.bytes,f.artifact.bytes);
  assert.equal(source.verification_basis,'native_size_and_local_sha256');assert.equal(outcome.output.server_copy_verification,undefined);
  assert.equal(verifyFullImportCount('profile',{basis:'backend_exact_scan',profile_id:'profile',records:17,bytes:source.bytes,sha256:source.sha256,
   identity:{canonical_path:'/private/input.csv',size:source.bytes,file_id:'1:2'}},source,
   {port:0,fresh:true,execution_id:'full',freshness_basis:'completed_execution_port_source',row_count:17},
   {verified:true,owner_verified:true,status:'completed',execution_id:'full'}).status,'verified');

  for(const mutate of [o=>o.output.native_size_verification.source_sha256='b'.repeat(64),o=>o.output.native_size_verification.bytes++,
   o=>o.output.native_size_verification.upload_operation_id='foreign',o=>o.output.native_size_verification.cleanup_complete=false,
   o=>o.output.native_size_verification.upload_completion_verified=false,o=>delete o.output.native_size_verification]){
   const changed=structuredClone(record);mutate(changed.outcome);
   assert.throws(()=>verifyTextImportSource({source:{artifact_id:f.artifact.artifact_id,upload_operation_id:id},settings:{}},[changed]));
  }
  const uncertain={...structuredClone(record),sequence:1,operation_id:'later',transport_uncertain:true};
  assert.throws(()=>verifyTextImportSource({source:{artifact_id:f.artifact.artifact_id,upload_operation_id:id},settings:{}},[record],{complete:true,records:[record,uncertain]}),/superseded/);

 };
 await checkSource('large-1');

 if(!reused){
  const next=await rt.uploadLargeArtifact({...options,operationId:'large-2',observationId:(await rt.observe()).output.observation_id});
  assert.equal(next.reused,true);assert.equal(f.counts().submitted,1);await checkSource('large-2');
  assert.ok(events.some(e=>e.phase==='large_upload_completed'));assert.ok(events.some(e=>e.phase==='large_upload_reused'));
 }
});
