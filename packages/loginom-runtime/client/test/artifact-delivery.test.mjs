import test from 'node:test';
import assert from 'node:assert/strict';
import {createArtifactDelivery} from '../lib/artifact-delivery.mjs';
const request={operation_id:'delivery',artifact_id:'artifact',upload_grant_id:'grant',budget_ms:120000};
function fixture(fault,initialDirectory='/') {
 const artifact={artifact_id:'artifact',name:'input.csv',bytes:3,sha256:'a'.repeat(64),upload:{grant_id:'grant',directory:'/user/dock-p3',destination:'/user/dock-p3/input.csv',overwrite:'replace'}};
 const calls=[],events=[];let directory=initialDirectory,verified=false;
 const prefix='MF;TF-2',nav=prefix+';NavigationBar;NavigationPanel';
 const entry=(tid,kind)=>({tid,ref:'ui-'+tid,label:tid.split(';colName_')[1]??'',allowed_actions:['click','double_click'],...(kind?{storage_entry:{kind}}:{})});
 const state=()=>({observation_id:'obs',dom_epoch:{document:'doc',revision:1},active_tab_ref:'tab',workflow_ref:{prefix},file_storage:{status:'observed',directory},ui:{elements:[entry(nav),entry(prefix+';FileStorageForm;pnlFileStorage;tbl'),entry(prefix+';cnrNaviMode;b.s_Сервер>Файлы'),entry(prefix+';FileStorageForm;colName_'+(directory==='/'?'user':directory==='/user'?'dock-p3':'input.csv'),directory==='/user/dock-p3'?undefined:'folder')]}});
 const runtime={observe:async()=>({status:'SUCCEEDED',output:state()}),uiAct:async a=>{calls.push(a.verb);if(a.verb==='click'&&a.ref.endsWith(';cnrNaviMode;b.s_Сервер>Файлы'))directory='/';if(a.verb==='double_click')directory+='/'+a.ref.split('colName_')[1];directory=directory.replace('//','/');return {status:'SUCCEEDED',cleanup_complete:true}},
  uploadDeliveredArtifact:async()=>{calls.push('upload');if(fault==='upload')throw Error('Lost browser response');return {status:'AMBIGUOUS',cleanup_complete:true,output:{upload_submitted:true}};},
  inspect:async()=>{calls.push('inspect');return {output:{state:verified?'resolved':'pending',cleanup_confirmed:true,outcome:{status:verified?'SUCCEEDED':'AMBIGUOUS',output:{upload_submitted:true,server_copy_verification:{bytes_verified:true,upload_completion_verified:true,destination:artifact.upload.destination,bytes:3,sha256:fault==='digest'?'b'.repeat(64):artifact.sha256,verification_id:'delivery:verify'}}}}};},
  verifyDeliveredArtifact:async()=>{calls.push('verify');if(fault==='verify')throw Error('Lost download receipt');verified=true;return {status:'SUCCEEDED',cleanup_complete:true,output:{bytes_verified:true}};}};
 const service=createArtifactDelivery({runtime,artifactStore:{getUploadGrant:(id,grant)=>{assert.equal(id,'artifact');assert.equal(grant,'grant');return artifact;}},admit:()=>{},record:async e=>{events.push(e);if(fault==='journal'&&e.phase==='artifact_delivery_completed')throw Error('Disk unavailable');return e;}});
 return {service,artifact,calls,events,runtime};
}
test('delivery navigates exact authorized folders and reuses upload and byte verification once',async()=>{
 const f=fixture(),first=f.service.deliver(request),second=f.service.deliver(request);assert.equal(first,second);assert.equal(f.service.busy,true);
 const result=await first;assert.equal(result.outcome.status,'SUCCEEDED');assert.equal(result.outcome.destination,'/user/dock-p3/input.csv');
 assert.deepEqual(f.calls,['double_click','double_click','upload','inspect','verify','inspect']);assert.equal(f.service.busy,false);
 assert.equal(f.service.deliver(request),first);assert.equal(f.events.at(-1).phase,'artifact_delivery_completed');
 result.outcome.sha256='forged';assert.equal(f.service.status('delivery').outcome.sha256,'a'.repeat(64));
 assert.throws(()=>f.service.deliver({...request,budget_ms:1000}),/different parameters/);
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
 assert.equal(result.outcome.status,change?'AMBIGUOUS':'SUCCEEDED');
 assert.equal(f.calls.filter(c=>c==='upload').length,change?0:1);
 if(change)assert.equal(result.outcome.upload_submitted_or_unknown,false);
});
for(const fault of ['upload','verify','digest','journal'])test('delivery preserves '+fault+' uncertainty without resubmission',async()=>{
 const f=fixture(fault),promise=f.service.deliver(request),result=await promise;assert.equal(result.outcome.status,'AMBIGUOUS');assert.equal(result.outcome.inspection_required,true);
 assert.equal(f.service.deliver(request),promise);assert.equal(f.calls.filter(c=>c==='upload').length,1);
 assert.ok(f.calls.filter(c=>c==='verify').length<=1);assert.equal(result.upload_operation_id,'delivery:upload');
});
test('confirmed no-effect upload refusal remains NOT_APPLIED and never downloads or resubmits',async()=>{
 const f=fixture();f.runtime.uploadDeliveredArtifact=async()=>{f.calls.push('upload');return {status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true,error:{code:'UPLOAD_CONTEXT_CHANGED'}};};
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


test('delivery returns a terminal path conflict without byte verification or another submission',async()=>{
 const f=fixture();f.artifact.upload.overwrite='reject';
 f.runtime.uploadDeliveredArtifact=async()=>{f.calls.push('upload');return {status:'FAILED',cleanup_complete:true,output:{upload_submitted:false,conflict_rejected:true}};};
 const first=f.service.deliver(request),result=await first;
 assert.equal(result.state,'settled');assert.equal(result.phase,'rejected');assert.equal(result.outcome.code,'UPLOAD_PATH_CONFLICT');
 assert.equal(result.outcome.upload_completion_verified,false);assert.equal(f.service.busy,false);
 assert.deepEqual(f.calls,['double_click','double_click','upload']);assert.equal(f.service.deliver(request),first);
 assert.equal(f.events.at(-1).phase,'artifact_delivery_rejected');
});


for(const stage of ['upload','verify'])test('delivery reconciles lost '+stage+' reply from the original receipt without repeating it',async()=>{
 const f=fixture(),originalInspect=f.runtime.inspect;
 if(stage==='upload')f.runtime.uploadDeliveredArtifact=async()=>{f.calls.push('upload');return {status:'AMBIGUOUS',cleanup_complete:false,error:{code:'BROWSER_CALL_UNCERTAIN'}};};
 else {const verify=f.runtime.verifyDeliveredArtifact;f.runtime.verifyDeliveredArtifact=async()=>{await verify();return {status:'FAILED',error:{code:'BROWSER_CALL_UNCERTAIN'}};};}
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
  f.runtime.verifyDeliveredArtifact=async()=>{await verify();throw Error('Verification return lost after commit');};
 }
 return f;
}
for(const stage of ['upload','verify'])test('explicit resume after '+stage+' keeps original transfer IDs and skips completed effects',async()=>{
 const f=resumeFixture(stage),initial=await f.service.deliver(request);assert.equal(initial.outcome.status,'AMBIGUOUS');
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
 f.runtime.uiAct=async action=>{stale=await observe();const result=await act(action);remaining=4;return result;};
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
  return {status:'SUCCEEDED',output:{observation_id:root?'graph-observation':'toolbar-observation',dom_epoch:{document:'doc',revision:1},
   ui:{elements:root?[{ref:'toolbar',tid:'MF;cntMain;tlbMainToolbar',allowed_actions:[]}]:[{ref:'files',tid:'MF;cntMain;tlbMainToolbar;btnFilestorage',allowed_actions:['click']}],dialogs:[],masks:[]}}};
 };
 f.runtime.uiAct=async(a,o)=>{if(a.ref==='files'){assert.equal(o.observationId,'toolbar-observation');opened=true;return {status:'SUCCEEDED',cleanup_complete:true};}return act(a,o);};
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
