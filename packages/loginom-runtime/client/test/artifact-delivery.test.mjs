import test from 'node:test';
import assert from 'node:assert/strict';
import {createArtifactDelivery} from '../lib/artifact-delivery.mjs';
const request={operation_id:'delivery',artifact_id:'artifact',upload_grant_id:'grant',budget_ms:120000};
const noEffect=(id,changes={})=>({operation_id:id,action_key:'ui.act',status:'NOT_APPLIED',phase:'preconditions',
 effect_possible:false,cleanup_complete:true,trace:[],error:{code:'UI_REFERENCE_OFFSCREEN'},...changes});

test('folder navigation reobserves after a proven no-effect stale epoch with a new action ID',async()=>{
 const f=fixture(),observe=f.runtime.observe,act=f.runtime.uiAct;let stale=true,reads=0;const attempts=[];
 f.runtime.observe=async options=>{reads++;const r=await observe(options);r.output.observation_id='obs-'+reads;r.output.ui.elements.forEach(e=>{e.ref+=':read-'+reads;});return r;};
 f.runtime.uiAct=async(a,o)=>{
  attempts.push({id:o.operationId,observation:o.observationId,ref:a.ref});
  if(stale){stale=false;return noEffect(o.operationId,{error:{code:'UI_EPOCH_CHANGED'}});}
  return act({...a,ref:a.ref.replace(/:read-\d+$/,'')},o);
 };
 const result=await f.service.deliver(request);
 assert.equal(result.outcome.status,'SUCCEEDED');assert.equal(f.calls.filter(x=>x==='upload').length,1);
 assert.equal(attempts.length,3);assert.notEqual(attempts[0].id,attempts[1].id);
 assert.notEqual(attempts[0].observation,attempts[1].observation);assert.notEqual(attempts[0].ref,attempts[1].ref);
});

for(const fault of ['ambiguous','effect','missing_effect','cleanup','foreign','phase','code','throw','owner','tab','directory','kind','persistent'])test('stale folder navigation refuses unsafe or unbounded continuation: '+fault,async()=>{
 const f=fixture(),observe=f.runtime.observe;let attempts=0;
 f.runtime.observe=async options=>{const r=await observe(options);if(attempts&&fault==='owner')r.output.dom_epoch.document='foreign';if(attempts&&fault==='tab')r.output.active_tab_ref='foreign';if(attempts&&fault==='directory')r.output.file_storage.directory='/foreign';if(attempts&&fault==='kind')r.output.ui.elements.forEach(e=>{if(e.storage_entry)e.storage_entry.kind='file';});return r;};
 f.runtime.uiAct=async(a,o)=>{
  attempts++;if(fault==='throw')throw Error('Browser reply lost');
  return {...noEffect(o.operationId),operation_id:fault==='foreign'?'foreign':o.operationId,status:fault==='ambiguous'?'AMBIGUOUS':'NOT_APPLIED',
   phase:fault==='phase'?'execution':'preconditions',effect_possible:fault==='missing_effect'?undefined:fault==='effect',cleanup_complete:fault!=='cleanup',
   error:{code:fault==='code'?'BROWSER_CALL_UNCERTAIN':'UI_EPOCH_CHANGED'}};
 };
 const result=await f.service.deliver(request);
 assert.equal(result.outcome.status,['owner','tab','directory','kind','persistent'].includes(fault)?'NOT_APPLIED':'AMBIGUOUS');assert.equal(result.outcome.upload_submitted_or_unknown,false);
 assert.equal(attempts,fault==='persistent'?3:1);assert.ok(!f.calls.includes('upload'));
});

test('cancellation after a no-effect stale refusal prevents the next navigation attempt',async()=>{
 const f=fixture(),controller=new AbortController();let attempts=0;
 f.runtime.uiAct=async(a,o)=>{attempts++;controller.abort();return noEffect(o.operationId,{error:{code:'UI_EPOCH_CHANGED'}});};
 const result=await f.service.deliver(request,{signal:controller.signal});
 assert.equal(attempts,1);assert.equal(result.outcome.status,'NOT_APPLIED');assert.ok(!f.calls.includes('upload'));
});
function fixture(fault,initialDirectory='/',options={}) {
 const artifact={artifact_id:'artifact',name:'input.csv',bytes:3,sha256:'a'.repeat(64),upload:{grant_id:'grant',directory:'/user/dock-p3',destination:'/user/dock-p3/input.csv',overwrite:'replace'}};
 const calls=[],events=[];let directory=initialDirectory,verified=false;
 const prefix='MF;TF-2',nav=prefix+';NavigationBar;NavigationPanel';
 const entry=(tid,kind)=>({tid,ref:'ui-'+tid,label:tid.split(';colName_')[1]??'',allowed_actions:['click','double_click'],...(kind?{storage_entry:{kind}}:{})});
 const state=()=>({observation_id:'obs',dom_epoch:{document:'doc',revision:1},active_tab_ref:'tab',workflow_ref:{prefix},file_storage:{status:'observed',directory},ui:{elements:[entry(nav),entry(prefix+';FileStorageForm;pnlFileStorage;tbl'),entry(prefix+';cnrNaviMode;b.s_Сервер>Файлы'),entry(prefix+';FileStorageForm;colName_'+(directory==='/'?'user':directory==='/user'?'dock-p3':'input.csv'),directory==='/user/dock-p3'?undefined:'folder')]}});
 const runtime={preflightDeliveredArtifact:()=>{},observe:async()=>({status:'SUCCEEDED',output:state()}),uiAct:async(a,o)=>{calls.push(a.verb);if(a.verb==='click'&&a.ref.endsWith(';cnrNaviMode;b.s_Сервер>Файлы'))directory='/';if(a.verb==='double_click')directory+='/'+a.ref.split('colName_')[1];directory=directory.replace('//','/');return {operation_id:o.operationId,action_key:'ui.act',status:'SUCCEEDED',cleanup_complete:true}},
  uploadDeliveredArtifact:async()=>{calls.push('upload');if(fault==='upload')throw Error('Lost browser response');return {status:'AMBIGUOUS',cleanup_complete:true,output:{upload_submitted:true}};},
  inspect:async()=>{calls.push('inspect');return {output:{state:verified?'resolved':'pending',cleanup_confirmed:true,outcome:{status:verified?'SUCCEEDED':'AMBIGUOUS',output:{upload_submitted:true,server_copy_verification:{bytes_verified:true,upload_completion_verified:true,destination:artifact.upload.destination,bytes:3,sha256:fault==='digest'?'b'.repeat(64):artifact.sha256,verification_id:'delivery:verify'}}}}};},
  verifyDeliveredArtifact:async({onDispatched}={})=>{onDispatched?.();calls.push('verify');if(fault==='verify')throw Error('Lost download receipt');verified=true;return {status:'SUCCEEDED',cleanup_complete:true,output:{bytes_verified:true}};}};
 const service=createArtifactDelivery({runtime,artifactStore:{getUploadGrant:(id,grant)=>{assert.equal(id,'artifact');assert.equal(grant,'grant');return artifact;}},admit:()=>{},record:async e=>{events.push(e);if(fault==='journal'&&e.phase==='artifact_delivery_completed')throw Error('Disk unavailable');return e;},...options});
 return {service,artifact,calls,events,runtime};
}
for(const fault of [null,'document','workflow','tab','offscreen','disabled','masked'])test('Files navigation waits for an owned reachable toolbar before delivery: '+fault,async()=>{
 let clock=0,opened=false,reads=0;
 const f=fixture(undefined,'/',{now:()=>clock}),observe=f.runtime.observe,act=f.runtime.uiAct;
 f.runtime.observe=async options=>{
  const result=await observe(options);
  if(opened)return result;
  const s=result.output;s.file_storage={status:'unobserved'};
  const narrow=!!options.rootRef;
  if(!narrow)delete s.active_tab_ref;
  if(narrow)reads++;
  if(reads>=2){
   if(fault==='document')s.dom_epoch.document='foreign';
   if(fault==='workflow')s.workflow_ref={prefix:'foreign'};
   if(fault==='tab')s.active_tab_ref='foreign';
   if(fault==='masked')s.ui.masks=[{ref:'mask'}];
   if(['offscreen','disabled','masked'].includes(fault))clock+=16000;
  }
  s.observation_id='toolbar-observation-'+reads;
  s.ui.elements=[{tid:'MF;cntMain;tlbMainToolbar',ref:'toolbar'},
   ...(narrow?[{tid:'MF;cntMain;tlbMainToolbar;btnFilestorage',ref:'files-'+reads,enabled:fault!=='disabled',visible:true,
    allowed_actions:['click'],interaction:{state:reads>=2&&fault!=='offscreen'?'point_observed':'outside_viewport'}}]:[])];
  return result;
 };
 f.runtime.uiAct=async(a,o)=>{
  if(!opened){
   assert.equal(a.ref,'files-2');assert.equal(o.observationId,'toolbar-observation-2');
   opened=true;f.calls.push('Files');return {operation_id:o.operationId,action_key:'ui.act',status:'SUCCEEDED',cleanup_complete:true};
  }
  return act(a,o);
 };
 const result=await f.service.deliver(request);
 assert.ok(reads>=2);
 if(fault){
  assert.equal(result.outcome.status,'NOT_APPLIED');assert.equal(result.outcome.upload_submitted_or_unknown,false);
  assert.equal(f.calls.length,0);assert.equal(f.service.unsettled,false);
 }else{
  assert.equal(result.outcome.status,'SUCCEEDED');assert.equal(f.calls[0],'Files');
  assert.equal(f.calls.filter(c=>c==='upload').length,1);assert.equal(f.calls.filter(c=>c==='verify').length,1);
 }
});
test('delivery navigates exact authorized folders and reuses upload and byte verification once',async()=>{
 const f=fixture(),first=f.service.deliver(request),second=f.service.deliver(request);assert.equal(first,second);assert.equal(f.service.busy,true);
 const result=await first;assert.equal(result.outcome.status,'SUCCEEDED');assert.equal(result.outcome.destination,'/user/dock-p3/input.csv');
 assert.deepEqual(f.calls,['double_click','double_click','upload','inspect','verify','inspect']);assert.equal(f.service.busy,false);
 assert.equal(f.service.deliver(request),first);assert.equal(f.events.at(-1).phase,'artifact_delivery_completed');
 result.outcome.sha256='forged';assert.equal(f.service.status('delivery').outcome.sha256,'a'.repeat(64));
 assert.throws(()=>f.service.deliver({...request,budget_ms:1000}),/different parameters/);
});
test('private package delivery reuses folder navigation and native completion while ordinary delivery keeps byte verification',async()=>{
 const f=fixture();f.artifact.name='source.lgp';f.artifact.upload.destination='/user/dock-p3/source.lgp';f.artifact.upload.overwrite='reject';
 const signal=new AbortController().signal,observe=f.runtime.observe,act=f.runtime.uiAct;
 f.runtime.observe=async options=>{assert.equal(options.signal,signal);assert.ok(options.deadlineAt>Date.now()&&options.deadlineAt<=Date.now()+120000);return observe(options);};
 f.runtime.uiAct=async(a,options)=>{assert.equal(options.signal,signal);assert.ok(options.deadlineAt>Date.now()&&options.deadlineAt<=Date.now()+120000);return act(a,options);};
 f.runtime.preflightDeliveredArtifact=()=>{throw Error('LGP is not a data verification format');};
 f.runtime.uploadPackageArtifact=async options=>{
  assert.ok(options.deadline>Date.now());f.calls.push('package-upload');
  return {status:'AMBIGUOUS',cleanup_complete:true,output:{upload_submitted:true},error:{code:'UPLOAD_SERVER_VERIFICATION_REQUIRED'}};
 };
 f.runtime.completePackageArtifact=async()=>{
  f.calls.push('package-complete');return {status:'SUCCEEDED',destination:f.artifact.upload.destination,bytes:f.artifact.bytes,
   source_sha256:f.artifact.sha256,upload_completion_verified:true,cleanup_complete:true};
 };
 const result=await f.service.deliver(request,{packageUpload:true,signal});
 assert.equal(result.outcome.status,'SUCCEEDED');assert.equal(result.outcome.source_sha256,f.artifact.sha256);
 assert.equal(Object.hasOwn(result.outcome,'sha256'),false);
 assert.deepEqual(f.calls,['double_click','double_click','package-upload','package-complete']);
 assert.equal(f.service.unsettled,false);
 assert.equal(f.events.find(e=>e.phase==='artifact_delivery_upload_receipt').upload.status,'AMBIGUOUS');
 const ordinary=await f.service.deliver({...request,operation_id:'ordinary'});
 assert.equal(ordinary.outcome.status,'NOT_APPLIED');assert.deepEqual(f.calls,['double_click','double_click','package-upload','package-complete']);
});
test('pre-upload read failure resumes the same attachment with fresh navigation IDs',async()=>{
 const f=fixture(),observe=f.runtime.observe,act=f.runtime.uiAct;let clicks=0,failed=false;const ids=[];
 f.runtime.uiAct=async(a,options)=>{ids.push(options.operationId);clicks++;return act(a,options);};
 f.runtime.observe=async options=>{
  if(clicks===1&&!failed){failed=true;throw Error('Transient read transport failed');}
  return observe(options);
 };
 const first=await f.service.deliver(request);
 assert.equal(first.outcome.upload_submitted_or_unknown,false);assert.equal(first.outcome.next_step.tool,'dock_artifact_delivery_resume');
 assert.equal(first.outcome.effect_possible,true);assert.equal(first.outcome.cleanup_complete,true);
 assert.equal(first.outcome.status,'NOT_APPLIED');
 assert.equal(f.service.busy,false);assert.equal(f.service.unsettled,false);
 assert.equal(f.calls.includes('upload'),false);
 const retry={operation_id:'delivery',resume_id:'resume-navigation',budget_ms:120000};
 const promise=f.service.resume(retry),result=await promise;
 assert.equal(result.outcome.status,'SUCCEEDED');assert.equal(f.service.resume(retry),promise);
 assert.deepEqual(ids,['delivery:nav1','delivery:nav2']);assert.equal(f.calls.filter(c=>c==='upload').length,1);
 assert.equal(f.service.unsettled,false);
});
test('a safe pre-upload pause cannot hide uncertainty from a later navigation reply',async()=>{
 const f=fixture(),observe=f.runtime.observe,act=f.runtime.uiAct;let clicks=0,failed=false;
 f.runtime.uiAct=async(...args)=>{clicks++;return act(...args);};
 f.runtime.observe=async options=>{if(clicks===1&&!failed){failed=true;throw Error('Transient read failed');}return observe(options);};
 await f.service.deliver(request);assert.equal(f.service.unsettled,false);
 f.runtime.uiAct=async()=>{throw Error('Navigation reply lost');};
 const resumed=f.service.resume({operation_id:'delivery',resume_id:'lost-navigation',budget_ms:120000});
 assert.equal(f.service.busy,true);assert.equal(f.service.unsettled,true);
 const result=await resumed;
 assert.equal(result.outcome.inspection_required,true);assert.equal(f.service.busy,false);assert.equal(f.service.unsettled,true);
 assert.ok(!f.calls.includes('upload'));
});
test('pre-upload continuation refuses changed document and unknown navigation effects',async()=>{
 for(const uncertain of [false,true]){
  const f=fixture(),observe=f.runtime.observe,act=f.runtime.uiAct;let started=false;
  f.runtime.uiAct=async(a,options)=>{started=true;if(uncertain)throw Error('Reply lost');return act(a,options);};
  f.runtime.observe=async options=>{if(started)throw Error('Read failed');return observe(options);};
  await f.service.deliver(request);
  const retry={operation_id:'delivery',resume_id:'resume-check',budget_ms:120000};
  if(uncertain)assert.throws(()=>f.service.resume(retry),/inspect navigation/);
  else{
   f.runtime.observe=async options=>{const r=await observe(options);r.output.dom_epoch.document='foreign';return r;};
   const result=await f.service.resume(retry);assert.match(result.error.message,/document changed/);
  }
  assert.equal(f.calls.includes('upload'),false);
 }
});
for(const changed of [false,true])test('stale navigation detail is rebound only in its original workspace: '+changed,async()=>{
 const f=fixture(),observe=f.runtime.observe;let stale=false;
 f.runtime.observe=async options=>{
  if(options.rootRef?.endsWith(';NavigationBar;NavigationPanel')&&!stale){stale=true;return {status:'NOT_APPLIED',error:{code:'UI_ROOT_STALE'}};}
  const result=await observe(options);
  if(stale&&changed)result.output.dom_epoch.document='foreign';
  return result;
 };
 const result=await f.service.deliver(request);assert.equal(stale,true);
 assert.equal(result.outcome.status,changed?'NOT_APPLIED':'SUCCEEDED');
 assert.equal(f.calls.filter(c=>c==='upload').length,changed?0:1);
 assert.equal(f.calls.filter(c=>c==='double_click').length,changed?0:2);
});
for(const change of [null,'document','tab','directory'])test('delivery scrolls a virtual folder and refuses changed '+(change??'nothing'),async()=>{
 const f=fixture(),observe=f.runtime.observe,act=f.runtime.uiAct;let scrolled=false;
 f.runtime.observe=async options=>{
  const r=await observe(options),s=r.output,prefix=s.workflow_ref.prefix;
  if(s.file_storage.directory==='/'&&!scrolled){
   s.ui.elements=s.ui.elements.filter(e=>!e.tid.endsWith(';colName_user'));
   if(!options.storageName)s.ui.elements.push({tid:prefix+';FileStorageForm;colName_anchor',ref:'anchor',label:'anchor',
    scroll:{ref:'table-owner',top:0,max_top:2000},allowed_actions:['scroll'],interaction:{state:'point_observed'}});
  }
  if(scrolled&&change==='document')s.dom_epoch.document='foreign';
  if(scrolled&&change==='tab')s.active_tab_ref='foreign';
  if(scrolled&&change==='directory')s.file_storage.directory='/foreign';
  return r;
 };
 f.runtime.uiAct=async(a,options)=>{
  if(a.verb==='scroll'){assert.equal(a.delta_y,1000);assert.equal(options.observationId,'obs');scrolled=true;}
  return act(a,options);
 };
 const result=await f.service.deliver(request);
 assert.equal(f.calls.filter(c=>c==='scroll').length,1);
 assert.equal(result.outcome.status,change?'NOT_APPLIED':'SUCCEEDED');
 assert.equal(f.calls.filter(c=>c==='upload').length,change?0:1);
 if(change)assert.equal(result.outcome.upload_submitted_or_unknown,false);
});
for(const fault of ['upload','verify','digest','journal'])test('delivery preserves '+fault+' uncertainty without resubmission',async()=>{
 const f=fixture(fault),promise=f.service.deliver(request),result=await promise;assert.equal(result.outcome.status,'AMBIGUOUS');assert.equal(result.outcome.inspection_required,true);
 assert.equal(f.service.deliver(request),promise);assert.equal(f.calls.filter(c=>c==='upload').length,1);
 assert.ok(f.calls.filter(c=>c==='verify').length<=1);assert.equal(result.upload_operation_id,'delivery:upload');
});
test('confirmed no-effect upload refusal remains NOT_APPLIED and never downloads or resubmits',async()=>{
 const f=fixture();f.runtime.uploadDeliveredArtifact=async()=>{f.calls.push('upload');return noEffect('delivery:upload',{action_key:'artifact.upload',error:{code:'UPLOAD_CONTEXT_CHANGED'}});};
 const promise=f.service.deliver(request),result=await promise;
 assert.equal(result.state,'settled');assert.equal(result.phase,'not_applied');assert.equal(result.outcome.status,'NOT_APPLIED');
 assert.equal(result.outcome.effect_possible,false);assert.equal(result.outcome.upload_submitted_or_unknown,false);
 assert.equal(f.calls.filter(c=>c==='upload').length,1);assert.ok(!f.calls.includes('verify'));assert.equal(f.service.busy,false);
 assert.equal(f.service.deliver(request),promise);
 assert.throws(()=>f.service.resume({operation_id:'delivery',resume_id:'retry',budget_ms:1000}),/upload|Upload/);
});
test('a no-effect claim without cleanup does not authorize another transfer',async()=>{
 const f=fixture();f.runtime.uploadDeliveredArtifact=async()=>({status:'NOT_APPLIED',effect_possible:false,cleanup_complete:false,error:{code:'UPLOAD_CONTEXT_CHANGED'}});
 const r=await f.service.deliver(request);assert.equal(r.outcome.status,'AMBIGUOUS');assert.equal(r.outcome.inspection_required,true);
 assert.ok(!f.calls.includes('verify'));
});
test('delivery refuses unsupported policy and extra recipe fields before navigation',()=>{
 const f=fixture();f.artifact.upload.overwrite='invalid';assert.throws(()=>f.service.deliver(request),/Unsupported upload conflict policy/);assert.deepEqual(f.calls,[]);
 assert.throws(()=>f.service.deliver({...request,steps:[]}),/Exact delivery/);
});
test('delivery rejects concurrent jobs while retaining the first operation identity',async()=>{
 const f=fixture();let release;f.runtime.uploadDeliveredArtifact=async()=>{await new Promise(r=>{release=r});return {status:'AMBIGUOUS',cleanup_complete:true,output:{upload_submitted:true}};};
 const promise=f.service.deliver(request);for(let i=0;!release&&i<100;i++)await new Promise(r=>setImmediate(r));assert.ok(release);
 assert.throws(()=>f.service.deliver({...request,operation_id:'other'}),/in progress/);assert.equal(f.service.status('delivery').phase,'upload');
 release();await promise;
});

test('delivery combines only pages of the same retained observation',async()=>{
 for(const changed of [false,true]) {
  const f=fixture(),original=f.runtime.observe;let tail;
  f.runtime.observe=async options=>{
   if(options.cursor)return {status:'SUCCEEDED',output:{...tail,...(changed?{observation_id:'foreign'}:{})}};
   const r=await original(options),elements=r.output.ui.elements;
   tail={...structuredClone(r.output),ui:{elements:elements.slice(2)},page:{next_cursor:null}};
   r.output.ui.elements=elements.slice(0,2);r.output.page={next_cursor:'next'};return r;
  };
  const result=await f.service.deliver(request);
  assert.equal(result.outcome.status,changed?'NOT_APPLIED':'SUCCEEDED');
  if(changed)assert.deepEqual(f.calls,[]);
 }
});

test('runtime delivery gate blocks competing UI and preparation until the operation settles',async()=>{
 const {createActionRuntime}=await import('../lib/executor.mjs');
 const f=fixture();let release;
 const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},allowCandidate:true,
  artifactStore:{getUploadGrant:()=>f.artifact},execute:async()=>{throw Error('Diagnostic end before navigation')},
  onRecord:e=>new Promise(resolve=>{release=()=>resolve(e);})});
 const p=runtime.deliverArtifact(request);assert.ok(release);
 assert.equal(runtime.deliverArtifact(request),p);
 assert.equal(runtime.artifactDeliveryStatus('delivery').state,'running');
 assert.throws(()=>runtime.assertPreparationAllowed(),/delivery is in progress/);
 await assert.rejects(runtime.observe(),/delivery is in progress/);
 await assert.rejects(runtime.runNodeApply({}),/delivery is in progress/);
 release();await p;runtime.assertPreparationAllowed();
});


test('delivery returns from a different storage branch before entering the granted directory',async()=>{
 const f=fixture(undefined,'/user/another-folder');
 const result=await f.service.deliver(request);
 assert.equal(result.outcome.status,'SUCCEEDED');
 assert.deepEqual(f.calls,['click','double_click','double_click','upload','inspect','verify','inspect']);
 assert.equal(result.outcome.destination,'/user/dock-p3/input.csv');
});


for(const comparison of ['equal','different','unreadable','uncertain'])test('reject delivery compares the existing file without overwriting: '+comparison,async()=>{
 const f=fixture();f.artifact.upload.overwrite='reject';
 f.runtime.uploadDeliveredArtifact=async()=>{f.calls.push('upload');return {status:'FAILED',cleanup_complete:true,output:{upload_submitted:false,conflict_rejected:true}};};
 const verify=f.runtime.verifyDeliveredArtifact;
 f.runtime.verifyDeliveredArtifact=async options=>{
  if(comparison==='equal')return verify(options);
  if(comparison==='unreadable')throw Error('No readable row');
  options.onDispatched();f.calls.push('verify');
  return {status:'FAILED',cleanup_complete:comparison!=='uncertain',output:{bytes_verified:false}};
 };
 const first=f.service.deliver(request),result=await first;
 assert.equal(result.state,'settled');assert.equal(f.service.busy,false);assert.equal(f.service.deliver(request),first);
 assert.equal(f.calls.filter(c=>c==='upload').length,1);
 if(comparison==='equal')assert.equal(result.outcome.status,'SUCCEEDED');
 else if(comparison==='uncertain'){assert.equal(result.outcome.status,'AMBIGUOUS');assert.equal(f.service.unsettled,true);}
 else {
  assert.equal(result.phase,'rejected');assert.equal(result.outcome.code,'UPLOAD_PATH_CONFLICT');
  assert.equal(result.outcome.upload_completion_verified,false);assert.equal(f.service.unsettled,false);
  assert.equal(f.events.at(-1).phase,'artifact_delivery_rejected');
 }
});


for(const stage of ['upload','verify'])test('delivery reconciles lost '+stage+' reply from the original receipt without repeating it',async()=>{
 const f=fixture(),originalInspect=f.runtime.inspect;
 if(stage==='upload')f.runtime.uploadDeliveredArtifact=async()=>{f.calls.push('upload');return {status:'AMBIGUOUS',cleanup_complete:false,error:{code:'BROWSER_CALL_UNCERTAIN'}};};
 else {const verify=f.runtime.verifyDeliveredArtifact;f.runtime.verifyDeliveredArtifact=async options=>{await verify(options);return {status:'FAILED',error:{code:'BROWSER_CALL_UNCERTAIN'}};};}
 f.runtime.inspect=async options=>{assert.equal(options.operationId,'delivery:upload');const r=await originalInspect();r.output.operation_id='delivery:upload';r.output.outcome.operation_id='delivery:upload';r.output.outcome.cleanup_complete=true;return r;};
 const p=f.service.deliver(request),r=await p;assert.equal(r.outcome.status,'SUCCEEDED');
 assert.deepEqual(f.calls,['double_click','double_click','upload','inspect','verify','inspect']);
 assert.ok(f.events.some(e=>e.phase==='artifact_delivery_'+(stage==='upload'?'upload':'verification')+'_reconciled'));
 assert.equal(f.service.deliver(request),p);
});

for(const fault of ['running','foreign'])test('delivery never proceeds from '+fault+' upload recovery evidence',async()=>{
 const f=fixture();f.runtime.uploadDeliveredArtifact=async()=>({status:'AMBIGUOUS',error:{code:'BROWSER_CALL_UNCERTAIN'}});
 f.runtime.inspect=async()=>({output:{operation_id:fault==='foreign'?'foreign':'delivery:upload',cleanup_confirmed:fault!=='running',outcome:{operation_id:'delivery:upload',output:{upload_submitted:true}}}});
 const r=await f.service.deliver(request);assert.equal(r.outcome.status,'AMBIGUOUS');assert.ok(!f.calls.includes('verify'));
});


function resumeFixture(stage) {
 const f=fixture(),inspect=f.runtime.inspect;
 f.runtime.inspect=async()=>{const r=await inspect();r.output.operation_id='delivery:upload';r.output.outcome.operation_id='delivery:upload';r.output.outcome.cleanup_complete=true;return r;};
 if(stage==='upload') {
  f.runtime.uploadDeliveredArtifact=async()=>{f.calls.push('upload');return {status:'AMBIGUOUS',error:{code:'BROWSER_CALL_UNCERTAIN'}};};
  let first=true;const normal=f.runtime.inspect;
  f.runtime.inspect=async()=>{if(first){first=false;return {output:{operation_id:'delivery:upload',cleanup_confirmed:false}};}return normal();};
 } else {
  const verify=f.runtime.verifyDeliveredArtifact;
  f.runtime.verifyDeliveredArtifact=async options=>{await verify(options);throw Error('Verification return lost after commit');};
 }
 return f;
}
for(const stage of ['upload','verify'])test('explicit resume after '+stage+' keeps original transfer IDs and skips completed effects',async()=>{
 const f=resumeFixture(stage),initial=await f.service.deliver(request);assert.equal(initial.outcome.status,'AMBIGUOUS');
 assert.equal(f.service.busy,false);assert.equal(f.service.unsettled,true);
 const resume={operation_id:'delivery',resume_id:'resume-1',budget_ms:120000};
 const p=f.service.resume(resume);assert.equal(f.service.resume(resume),p);
 const r=await p;assert.equal(r.state,'settled');assert.equal(r.outcome.status,'SUCCEEDED');
 assert.equal(f.calls.filter(c=>c==='upload').length,1);assert.equal(f.calls.filter(c=>c==='verify').length,1);
 assert.equal(f.calls.filter(c=>c==='double_click').length,2);assert.equal(f.service.resume(resume),p);
 assert.throws(()=>f.service.resume({...resume,budget_ms:2000}),/different parameters/);
});
for(const fault of ['document','tab','missing_receipt','changed_artifact'])test('resume refuses '+fault+' without another transfer',async()=>{
 const f=resumeFixture('upload');await f.service.deliver(request);
 const original=f.runtime.observe;
 if(fault==='document'||fault==='tab')f.runtime.observe=async(...args)=>{const r=await original(...args);if(fault==='document')r.output.dom_epoch.document='foreign';else r.output.active_tab_ref='foreign';return r;};
 if(fault==='missing_receipt')f.runtime.inspect=async()=>{throw Error('Browser receipt missing');};
 if(fault==='changed_artifact')f.artifact.sha256='foreign';
 const resume={operation_id:'delivery',resume_id:'resume-refused',budget_ms:120000};
 if(fault==='changed_artifact')assert.throws(()=>f.service.resume(resume),/artifact changed/);
 else assert.equal((await f.service.resume(resume)).outcome.status,'AMBIGUOUS');
 assert.equal(f.calls.filter(c=>c==='upload').length,1);assert.equal(f.calls.filter(c=>c==='verify').length,0);
});

test('an unresolved started download is never dispatched again on resume',async()=>{
 const f=fixture('verify'),inspect=f.runtime.inspect;
 f.runtime.inspect=async()=>{const r=await inspect();r.output.operation_id='delivery:upload';r.output.outcome.operation_id='delivery:upload';return r;};
 await f.service.deliver(request);
 const result=await f.service.resume({operation_id:'delivery',resume_id:'resume-pending',budget_ms:120000});
 assert.equal(result.outcome.status,'AMBIGUOUS');assert.match(result.error.message,/no repeated download/);
 assert.equal(f.calls.filter(c=>c==='verify').length,1);assert.equal(f.calls.filter(c=>c==='upload').length,1);
});

test('folder navigation waits for the requested breadcrumb without repeating its gesture',async()=>{
 const f=fixture(undefined,'/user/another-folder'),observe=f.runtime.observe,act=f.runtime.uiAct;
 let stale,remaining=0;
 f.runtime.observe=async(...args)=>remaining-->0?structuredClone(stale):observe(...args);
 f.runtime.uiAct=async(action,options)=>{stale=await observe();const result=await act(action,options);remaining=4;return result;};
 const result=await f.service.deliver(request);
 assert.equal(result.outcome.status,'SUCCEEDED');
 assert.deepEqual(f.calls,['click','double_click','double_click','upload','inspect','verify','inspect']);
});

test('delivery reads the observed toolbar when a populated graph only yields roots',async()=>{
 const f=fixture(),observe=f.runtime.observe,act=f.runtime.uiAct;let opened=false;
 f.runtime.observe=async options=>{
  if(opened)return observe(options);
  assert.notEqual(options?.scope,'all','a global scan can fall back to roots');
  const root=options?.scope==='roots';
  if(!root)assert.deepEqual(options,{rootRef:'toolbar',observationId:'graph-observation'});
  return {status:'SUCCEEDED',output:{observation_id:root?'graph-observation':'toolbar-observation',dom_epoch:{document:'doc',revision:1},...(root?{}:{active_tab_ref:'tab'}),
   ui:{elements:root?[{ref:'toolbar',tid:'MF;cntMain;tlbMainToolbar',allowed_actions:[]}]:[{ref:'files',tid:'MF;cntMain;tlbMainToolbar;btnFilestorage',enabled:true,visible:true,interaction:{state:'point_observed'},allowed_actions:['click']}],dialogs:[],masks:[]}}};
 };
 f.runtime.uiAct=async(a,o)=>{if(a.ref==='files'){assert.equal(o.observationId,'toolbar-observation');opened=true;return {operation_id:o.operationId,action_key:'ui.act',status:'SUCCEEDED',cleanup_complete:true};}return act(a,o);};
 const result=await f.service.deliver(request);assert.equal(result.outcome.status,'SUCCEEDED');assert.equal(opened,true);
});

test('an inaccessible input folder reports an admitted artifact and never uploads',async()=>{
 const f=fixture(),observe=f.runtime.observe;
 f.runtime.observe=async options=>{
  const r=await observe(options),s=r.output;
  if(s.file_storage.directory==='/')s.ui.elements=s.ui.elements.filter(e=>!e.tid.endsWith(';colName_user'));
  return r;
 };
 const result=await f.service.deliver(request);
 assert.equal(result.error.code,'ARTIFACT_DESTINATION_UNAVAILABLE');
 assert.equal(result.error.input_artifact_admitted,true);
 assert.equal(result.error.artifact_id,'artifact');
 assert.equal(result.error.directory,'/user/dock-p3');
 assert.deepEqual(result.error.storage_entry,{name:'user',directory:'/',reason:'no_scroll_owner'});
 assert.equal(result.outcome.upload_submitted_or_unknown,false);
 assert.ok(!f.calls.includes('upload'));assert.ok(!f.calls.includes('verify'));
 assert.equal(await f.service.deliver(request),result);
});

test('unsupported verification route refuses before navigation or upload',async()=>{
 const f=fixture();f.runtime.preflightDeliveredArtifact=()=>{throw Object.assign(Error('Unsupported verification route'),{code:'ARTIFACT_VERIFICATION_UNSUPPORTED'});};
 const r=await f.service.deliver(request);
 assert.equal(r.outcome.status,'NOT_APPLIED');assert.equal(r.error.code,'ARTIFACT_VERIFICATION_UNSUPPORTED');
 assert.equal(r.outcome.cleanup_complete,true);assert.equal(r.outcome.inspection_required,false);
 assert.deepEqual(f.calls,[]);assert.equal(f.service.unsettled,false);
});

test('local verification refusal resumes the original upload without another submission',async()=>{
 const f=fixture(),verify=f.runtime.verifyDeliveredArtifact,inspect=f.runtime.inspect;let refused=false;
 f.runtime.inspect=async()=>{const r=await inspect();r.output.operation_id='delivery:upload';r.output.outcome.operation_id='delivery:upload';r.output.outcome.cleanup_complete=true;return r;};
 f.runtime.verifyDeliveredArtifact=async options=>{if(!refused){refused=true;throw Error('Local observation missing before dispatch');}return verify(options);};
 const initial=await f.service.deliver(request);assert.equal(initial.outcome.status,'AMBIGUOUS');
 assert.equal(initial.outcome.next_step.tool,'dock_artifact_delivery_resume');
 const result=await f.service.resume({operation_id:'delivery',resume_id:'local-refusal',budget_ms:120000});
 assert.equal(result.outcome.status,'SUCCEEDED',JSON.stringify(result));assert.equal(f.calls.filter(c=>c==='upload').length,1);assert.equal(f.calls.filter(c=>c==='verify').length,1);
});

test('resume never extends the original delivery deadline',async()=>{
 const f=resumeFixture('upload');await f.service.deliver({...request,budget_ms:1000});
 await new Promise(resolve=>setTimeout(resolve,1050));
 assert.throws(()=>f.service.resume({operation_id:'delivery',resume_id:'expired',budget_ms:120000}),/deadline elapsed/);
 assert.equal(f.calls.filter(c=>c==='upload').length,1);assert.ok(!f.calls.includes('verify'));
});

for(const completed of [0,1])test('matched offscreen refusal settles delivery after '+completed+' completed navigations',async()=>{
 const f=fixture(),act=f.runtime.uiAct,ids=[];let refused=false;
 f.runtime.uiAct=async(a,o)=>{
  ids.push(o.operationId);
  if(!refused&&ids.length===completed+1){refused=true;return noEffect(o.operationId);}
  return act(a,o);
 };
 const r=await f.service.deliver(request);
 assert.equal(r.outcome.status,'NOT_APPLIED');assert.equal(r.outcome.effect_possible,completed>0);
 assert.equal(r.outcome.inspection_required,false);assert.equal(r.outcome.cleanup_complete,true);
 assert.equal(r.outcome.upload_submitted_or_unknown,false);assert.equal(f.service.unsettled,false);
 assert.equal(ids.length,completed+1);assert.ok(!f.calls.includes('upload'));
 assert.deepEqual(await f.service.deliver(request),r);assert.equal(ids.length,completed+1);
 const resumed=await f.service.resume({operation_id:'delivery',resume_id:'fresh-navigation',budget_ms:120000});
 assert.equal(resumed.outcome.status,'SUCCEEDED');assert.equal(ids[completed+1],'delivery:nav'+(completed+2));
 assert.equal(f.calls.filter(c=>c==='upload').length,1);assert.equal(f.calls.filter(c=>c==='verify').length,1);
});

for(const fault of ['foreign','key','effect','cleanup','phase','trace_missing','gesture','verified','uncertain','success_foreign'])test('navigation keeps an unconfirmed receipt unsettled: '+fault,async()=>{
 const f=fixture();f.runtime.uiAct=async(a,o)=>noEffect(o.operationId,{
  ...(fault==='foreign'||fault==='success_foreign'?{operation_id:'foreign'}:{}),
  ...(fault==='key'?{action_key:'artifact.upload'}:{}),...(fault==='effect'?{effect_possible:true}:{}),
  ...(fault==='cleanup'?{cleanup_complete:false}:{}),...(fault==='phase'?{phase:'applying'}:{}),
  ...(fault==='trace_missing'?{trace:undefined}:{}),...(fault==='gesture'?{trace:[{event:'ui_gesture_applied'}]}:{}),
  ...(fault==='verified'?{trace:[{event:'ui_preconditions_verified'}]}:{}),
  ...(fault==='uncertain'?{error:{code:'BROWSER_CALL_UNCERTAIN'}}:{}),...(fault==='success_foreign'?{status:'SUCCEEDED'}:{})});
 const r=await f.service.deliver(request);
 assert.equal(r.outcome.status,'AMBIGUOUS');assert.equal(r.outcome.inspection_required,true);
 assert.equal(f.service.unsettled,true);assert.ok(!f.calls.includes('upload'));
});

for(const mode of ['direct','inspect','resume'])test('matched no-effect upload settles via '+mode+' without resubmission',async()=>{
 const f=fixture();let inspections=0;
 const refusal=noEffect('delivery:upload',{action_key:'artifact.upload'});
 f.runtime.uploadDeliveredArtifact=async()=>{f.calls.push('upload');return mode==='direct'?refusal:
  {operation_id:'delivery:upload',status:'AMBIGUOUS',error:{code:'BROWSER_CALL_UNCERTAIN'}};};
 f.runtime.inspect=async()=>{inspections++;return {output:{operation_id:'delivery:upload',
  cleanup_confirmed:mode!=='resume'||inspections>1,outcome:refusal}};};
 let r=await f.service.deliver(request);
 if(mode==='resume'){
  assert.equal(r.outcome.status,'AMBIGUOUS');assert.equal(f.service.unsettled,true);
  r=await f.service.resume({operation_id:'delivery',resume_id:'inspect-original',budget_ms:120000});
 }
 assert.equal(r.outcome.status,'NOT_APPLIED');assert.equal(r.outcome.effect_possible,false);
 assert.equal(r.outcome.cleanup_complete,true);assert.equal(r.outcome.upload_submitted_or_unknown,false);
 assert.equal(f.service.unsettled,false);assert.deepEqual(f.calls,['double_click','double_click','upload']);
});

for(const fault of ['foreign','key','phase','cleanup','effect','trace','submitted','uncertain'])test('inconsistent no-effect upload cannot release delivery: '+fault,async()=>{
 const f=fixture();f.runtime.uploadDeliveredArtifact=async()=>noEffect('delivery:upload',{action_key:'artifact.upload',
  ...(fault==='foreign'?{operation_id:'foreign'}:{}),...(fault==='key'?{action_key:'ui.act'}:{}),
  ...(fault==='phase'?{phase:'submitted'}:{}),...(fault==='cleanup'?{cleanup_complete:false}:{}),
  ...(fault==='effect'?{effect_possible:true}:{}),...(fault==='trace'?{trace:[{event:'upload_input_submitted'}]}:{}),
  ...(fault==='submitted'?{output:{upload_submitted:true}}:{}),...(fault==='uncertain'?{error:{code:'BROWSER_CALL_UNCERTAIN'}}:{})});
 const r=await f.service.deliver(request);
 assert.equal(r.outcome.status,'AMBIGUOUS');assert.equal(f.service.unsettled,true);assert.ok(!f.calls.includes('verify'));
});

test('no-effect verification cannot erase an already submitted upload',async()=>{
 const f=fixture();f.runtime.verifyDeliveredArtifact=async({onDispatched})=>{
  onDispatched();f.calls.push('verify');return noEffect('delivery:verify',{action_key:'artifact.download'});
 };
 const r=await f.service.deliver(request);
 assert.equal(r.outcome.status,'AMBIGUOUS');assert.equal(r.outcome.upload_submitted_or_unknown,true);
 assert.equal(r.outcome.inspection_required,true);assert.equal(f.service.unsettled,true);
 assert.equal(f.calls.filter(c=>c==='upload').length,1);assert.equal(f.calls.filter(c=>c==='verify').length,1);
});

for(const mode of ['still_offscreen','offscreen_after_ready'])test('owned Files readiness and safe refusal clear the runtime delivery gate: '+mode,async()=>{
 const vm=await import('node:vm');
 const {createActionRuntime}=await import('../lib/executor.mjs');
 const {Page,origin,build}=await import('./support/workspace-ui-fixture.mjs');
 const page=new Page(),toolbar=page.add('div','MF;cntMain;tlbMainToolbar');
 page.context.innerWidth=1000;page.context.innerHeight=800;
 const files=page.add('button','MF;cntMain;tlbMainToolbar;btnFilestorage','Файлы',{x:2000,y:100,width:40,height:20},toolbar);
 const f=fixture(),events=[];let clock=0,offscreenReads=0,reachableReads=0;
 const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},allowCandidate:true,
  targetOrigin:origin,targetBuild:build,artifactStore:{getUploadGrant:()=>f.artifact},
  now:()=>clock,onRecord:async e=>{
   events.push(e);
   if(e.phase==='observation_completed'){
    const control=e.outcome?.output?.ui?.elements.find(item=>item.tid===files.getAttribute('data-tid'));
    if(control?.interaction?.state==='outside_viewport'){
     offscreenReads++;
     // The next owned observation can become reachable; the action must use it.
     if(mode==='offscreen_after_ready')files.box.x=40;
    }
    if(control?.interaction?.state==='point_observed'){
     reachableReads++;
     // Layout changes after the readiness read but before native uiAct preflight.
     files.box.x=2000;
    }
    if(mode==='still_offscreen')clock+=16000;
   }
   return e;
  },execute:code=>vm.runInContext(`(${code})`,page.context)(page)});
 const r=await runtime.deliverArtifact(request);
 assert.equal(r.outcome.status,'NOT_APPLIED',JSON.stringify(r));assert.equal(r.outcome.effect_possible,false);
 assert.equal(r.outcome.cleanup_complete,true);assert.equal(r.outcome.inspection_required,false);
 assert.equal(r.outcome.upload_submitted_or_unknown,false);assert.ok(offscreenReads>=1);
 const refusals=events.filter(e=>e.outcome?.error?.code==='UI_REFERENCE_OFFSCREEN');
 if(mode==='offscreen_after_ready'){
  assert.equal(reachableReads,1);assert.equal(refusals.length,1);
  const refusal=refusals[0].outcome;
  assert.equal(refusal.operation_id,'delivery:nav1');assert.equal(refusal.effect_possible,false);
  assert.equal(refusal.cleanup_complete,true);assert.equal(refusal.status,'NOT_APPLIED');
  assert.ok(!refusal.trace.some(e=>['ui_preconditions_verified','ui_gesture_applied','ui_scroll_applied'].includes(e.event)));
 }else{
  assert.equal(reachableReads,0);assert.equal(refusals.length,0);
  assert.match(r.error.message,/readiness timeout: Files workspace control reachable/);
  assert.equal(events.some(e=>e.operation_id?.startsWith('delivery:nav')),false);
 }
 assert.equal(events.some(e=>e.phase==='artifact_delivery_upload_receipt'),false);
 assert.equal(runtime.hasUnsettledWork(),false);assert.equal(runtime.hasActiveWork(),false);
 assert.doesNotThrow(()=>runtime.assertPreparationAllowed());assert.equal(page.events.includes('click'),false);
});


test('large delivery starts asynchronously, reports progress and never downloads its bytes',async()=>{
 const f=fixture();f.artifact.bytes=2**32+1048576;f.artifact.upload.overwrite='reject';
 let done;const gate=new Promise(resolve=>{done=resolve;});
 f.runtime.uploadLargeArtifact=async options=>{await gate;options.onProgress({bytes:f.artifact.bytes,phase:'verifying_size'});return {status:'SUCCEEDED',destination:f.artifact.upload.destination,bytes:f.artifact.bytes,source_sha256:f.artifact.sha256,cleanup_complete:true,upload_completion_verified:true};};
 const first=await f.service.deliver(request);assert.equal(first.state,'running');assert.equal(first.status,'authorizing');
 assert.equal((await f.service.deliver(request)).operation_id,first.operation_id);
 done();await f.service.drain();const ready=f.service.status(request.operation_id);
 assert.equal(ready.status,'ready');assert.equal(ready.percent,100);assert.equal(ready.bytes,f.artifact.bytes);
 assert.ok(!f.calls.includes('verify'));assert.ok(!f.calls.includes('upload'));
});

for(const confirmed of [true,false])test('large cancellation retains ID, confirmed cleanup and uncertainty: '+confirmed,async()=>{
 const f=fixture();f.artifact.bytes=1024**3;f.artifact.upload.overwrite='reject';
 let entered;const started=new Promise(resolve=>{entered=resolve;});let sends=0,cancels=0;
 f.runtime.uploadLargeArtifact=async options=>{sends++;entered();await new Promise(resolve=>options.signal.addEventListener('abort',resolve,{once:true}));options.signal.throwIfAborted();};
 f.runtime.cancelLargeArtifact=async()=>{cancels++;return confirmed;};
 const first=await f.service.deliver(request);await started;
 assert.equal(f.service.cancel(first.operation_id).status,'cancelling');
 await f.service.drain();const settled=f.service.status(first.operation_id);
 assert.equal(settled.status,confirmed?'cancelled':'uncertain');assert.equal(settled.error.code,confirmed?'LOGINOM_UPLOAD_CANCELLED':'LOGINOM_UPLOAD_UNCERTAIN');
 assert.equal(settled.outcome.cleanup_complete,confirmed);assert.equal(f.service.unsettled,!confirmed);
 assert.equal((await f.service.deliver(request)).status,settled.status);assert.equal(sends,1);assert.equal(cancels,1);
 if(!confirmed)assert.throws(()=>f.service.deliver({...request,operation_id:'another'}),/uncertain/);
});

test('large-file shutdown cancels the worker and awaits native cleanup',async()=>{
 const f=fixture();f.artifact.bytes=1024**3;f.artifact.upload.overwrite='reject';
 let entered,clean;const started=new Promise(resolve=>{entered=resolve;}),cleanup=new Promise(resolve=>{clean=resolve;});
 f.runtime.uploadLargeArtifact=async options=>{entered();await new Promise(resolve=>options.signal.addEventListener('abort',resolve,{once:true}));throw Error('cancelled');};
 f.runtime.cancelLargeArtifact=async()=>{await cleanup;return true;};
 await f.service.deliver(request);await started;
 let closed=false;const close=f.service.close().then(()=>{closed=true;});
 await Promise.resolve();assert.equal(closed,false);clean();await close;assert.equal(closed,true);
 assert.equal(f.service.status(request.operation_id).status,'cancelled');
});

test('large-file deadline is derived from safe size arithmetic, independently of legacy request budget',async()=>{
 const f=fixture(undefined,'/',{now:()=>20000});f.artifact.bytes=2**32+1048576;
 f.runtime.uploadLargeArtifact=async()=>{throw Error('LOGINOM_FILE_CHANGED');};f.runtime.cancelLargeArtifact=async()=>true;
 const started=await f.service.deliver({...request,budget_ms:1000});
 assert.equal(started.deadline_at,20000+120000+Math.ceil(f.artifact.bytes/5242880)*1000);
 await f.service.drain();assert.equal(f.service.status(request.operation_id).error.code,'LOGINOM_FILE_CHANGED');
});
