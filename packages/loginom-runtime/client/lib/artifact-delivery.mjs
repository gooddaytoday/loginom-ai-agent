import {storageTidSuffix} from './storage-policy.mjs';
import {findNativeStorageRow} from './text-export-output.mjs';
import {createHash} from 'node:crypto';
const requireValue=(value,message)=>{if(!value)throw Error(message);};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const one=(values,message)=>{requireValue(values.length===1,message);return values[0];};

// Private orchestration over the existing upload/inspect/download verifiers.
// Never submits bytes itself and never repeats an uncertain child operation.
export function createArtifactDelivery({runtime,artifactStore,record,admit,admitResume=()=>{},now=Date.now}) {
 const jobs=new Map();let active=null;
 const acknowledge=async(job,phase,details={})=>{
  const saved=await record({phase,operation_id:job.id,internal_provenance:'artifact_delivery_v1',...details});
  requireValue(saved?.phase===phase&&saved.operation_id===job.id,'Delivery evidence was not durably acknowledged');
 };
 const snapshot=job=>structuredClone({operation_id:job.id,state:job.state,phase:job.phase,
  upload_operation_id:job.uploadId,outcome:job.outcome??null,error:job.error??null});
 const finish=async(job,artifact,final)=>{
  const outcome=final.output?.outcome,proof=outcome?.output?.server_copy_verification;
  requireValue(final.output?.state==='resolved'&&final.output?.cleanup_confirmed===true&&outcome.status==='SUCCEEDED'
    &&proof?.bytes_verified===true&&proof.upload_completion_verified===true&&proof.destination===artifact.upload.destination
    &&proof.bytes===artifact.bytes&&proof.sha256===artifact.sha256,'Final transfer proof mismatch');
  const result={status:'SUCCEEDED',upload_operation_id:job.uploadId,destination:proof.destination,bytes:proof.bytes,sha256:proof.sha256,
    verification_id:proof.verification_id,cleanup_complete:true,upload_completion_verified:true};
  await acknowledge(job,'artifact_delivery_completed',{result});job.outcome=result;job.phase='completed';job.error=null;
 };
 async function run(job,artifact,signal,resumeId=null) {
  let step=0,submitted=job.uploadStarted===true,effectPossible=submitted;
  const check=()=>{signal?.throwIfAborted();requireValue(now()<job.deadline,'Artifact delivery deadline elapsed');};
  const readPages=async options=>{
   check();const r=await runtime.observe(options);requireValue(r.status==='SUCCEEDED','Delivery observation failed');
   const output=structuredClone(r.output);let cursor=output.page?.next_cursor,pages=0;
   while(cursor) {
    check();requireValue(++pages<=32,'Delivery observation page limit exceeded');
    const next=await runtime.observe({cursor});
    requireValue(next.status==='SUCCEEDED'&&next.output.observation_id===output.observation_id
      &&JSON.stringify(next.output.dom_epoch)===JSON.stringify(output.dom_epoch),'Delivery observation changed during pagination');
    for(const key of ['elements','dialogs','masks'])output.ui[key]=[...(output.ui[key]??[]),...(next.output.ui[key]??[])];cursor=next.output.page?.next_cursor;
   }
   return output;
  };
  const observe=async options=>{
   for(let attempt=0;attempt<3;attempt++) {
    try{return await readPages(options);}
    catch(error){
     if(attempt===2||!String(error.message).startsWith('Workspace changed between observation pages;'))throw error;
     // Only an invalidated read is repeated. No old references escape this call.
     check();await new Promise(resolve=>setTimeout(resolve,100));
    }
   }
  };
  const roots=()=>observe({scope:'roots'});
  const click=async(s,element,verb='click',extra={},allowStaleFolder=false)=>{
   check();const id=job.id+':nav'+(++step);
   effectPossible=true;const r=await runtime.uiAct({verb,ref:element.ref,...extra},{operationId:id,observationId:s.observation_id,signal});
   // Only a matched, cleaned-up precondition refusal permits a fresh folder lookup.
   // Never reuse its ref/observation or repeat an uncertain child operation.
   if(allowStaleFolder&&r.operation_id===id&&r.status==='NOT_APPLIED'&&r.phase==='preconditions'
     &&r.effect_possible===false&&r.cleanup_complete===true&&r.error?.code==='UI_EPOCH_CHANGED')return false;
   requireValue(r.status==='SUCCEEDED'&&r.cleanup_complete===true,'Delivery navigation requires inspection: '+id);
   return true;
  };
  const detail=async(r,element)=>observe({rootRef:element.ref,observationId:r.observation_id});
  const ready=async(condition,read,predicate)=>{
   const deadline=Math.min(job.deadline,now()+15000);
   for(let sample=0;sample<80&&now()<deadline;sample++) {
    const s=await read();
    if(s&&!(s.ui.masks??[]).length&&!(s.ui.dialogs??[]).length&&predicate(s))return s;
    await new Promise(resolve=>setTimeout(resolve,100));
   }
   throw Error('Delivery readiness timeout: '+condition);
  };
  const directory=expected=>ready('storage navigation loaded',async()=>{
   const r=await roots(),prefix=r.workflow_ref?.prefix;
   const bars=r.ui.elements.filter(e=>e.tid===prefix+';NavigationBar;NavigationPanel');
   requireValue(bars.length<=1,'Storage navigation is ambiguous');
   return bars.length?detail(r,bars[0]):null;
  },s=>s.file_storage?.status==='observed'&&(expected===undefined||s.file_storage.directory===expected));
  const readRow=async(name,parent)=>{
   const owner=JSON.stringify({document:parent.dom_epoch?.document,workflow:parent.workflow_ref});
   let last=null;
   const read=async options=>{
    const s=await observe(options.root_ref
     ? {rootRef:options.root_ref,observationId:last?.observation_id}
     : {scope:'roots',...(options.storage_name===undefined?{}:{storageName:options.storage_name})});
    requireValue(JSON.stringify({document:s.dom_epoch?.document,workflow:s.workflow_ref})===owner,'Delivery search owner changed');
    if(s.file_storage?.status==='observed')requireValue(s.file_storage.directory===parent.file_storage.directory
     &&s.active_tab_ref===parent.active_tab_ref,'Delivery search folder or tab changed');
    last=s;return s;
   };
   return findNativeStorageRow({name,read,roots:()=>read({discover_roots:true}),
    ready:(read,predicate)=>ready('authorized storage entry '+name,read,predicate),act:click,guard:check});
  };
  try {
   let upload,inspected;
   if(resumeId) {
    await acknowledge(job,'artifact_delivery_resume_started',{resume_id:resumeId,upload_operation_id:job.uploadId,
      verification_started:job.verificationStarted===true,deadline_at:job.deadline});
    check();inspected=await runtime.inspect({operationId:job.uploadId});
    await acknowledge(job,'artifact_delivery_resume_inspected',{resume_id:resumeId,inspection:inspected});
    requireValue(inspected.output?.operation_id===job.uploadId&&inspected.output?.cleanup_confirmed===true
      &&inspected.output?.outcome?.operation_id===job.uploadId,'Original delivery receipt remains uncertain');
    if(inspected.output?.state==='resolved'&&inspected.output.outcome.status==='SUCCEEDED') {
     await finish(job,artifact,inspected);job.state='settled';return snapshot(job);
    }
    requireValue(!job.verificationStarted,'The existing verification remains unresolved; no repeated download allowed');
    upload=inspected.output.outcome;
   } else {
   await acknowledge(job,'artifact_delivery_prepared',{artifact_id:artifact.artifact_id,destination:artifact.upload.destination,
    bytes:artifact.bytes,sha256:artifact.sha256,overwrite:artifact.upload.overwrite,deadline_at:job.deadline});
   job.phase='destination';
   let r=await roots();
   if(!r.ui.elements.some(e=>e.tid?.includes(';FileStorageForm;'))) {
    // Global all-scope scans can fall back to roots on a populated graph.
    // Read the already observed toolbar directly to retain complete controls.
    const toolbar=one(r.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar'),'Main toolbar root unavailable');
    const full=await detail(r,toolbar);
    const files=one(full.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar;btnFilestorage'&&e.allowed_actions.includes('click')),'Files workspace control unavailable');
    await click(full,files);
   }
   let s=await directory();
   requireValue(s.file_storage?.status==='observed','Storage path is not observed');
   if(s.file_storage.directory!==artifact.upload.directory) {
    const prefix=s.workflow_ref.prefix;
    if(s.file_storage.directory!=='/'&&!artifact.upload.directory.startsWith(s.file_storage.directory+'/')) {
    const root=one(s.ui.elements.filter(e=>e.tid===prefix+';cnrNaviMode;b.s_Сервер>Файлы'&&e.allowed_actions.includes('click')),'Files root breadcrumb unavailable');
    await click(s,root);s=await directory('/');
    }
    let current=s.file_storage.directory==='/'?'':s.file_storage.directory;
    requireValue(artifact.upload.directory.startsWith(current+'/'),'Files root did not open');
    for(const part of artifact.upload.directory.slice(current.length).split('/').filter(Boolean)) {
     for(let attempt=0;;attempt++) {
      check();const rowRead=await readRow(part,s),folder=one(rowRead.ui.elements.filter(e=>e.tid===rowRead.workflow_ref.prefix+';FileStorageForm;colName_'+storageTidSuffix(part)&&e.label===part
        &&e.storage_entry?.kind==='folder'&&e.allowed_actions.includes('double_click')),'Destination segment is not a verified folder');
      requireValue(rowRead.file_storage?.directory===(current||'/'),'Storage parent changed');
      if(await click(rowRead,folder,'double_click',{},true))break;
      requireValue(attempt<2,'Delivery folder navigation remained stale; inspection required');
      await new Promise(resolve=>setTimeout(resolve,100));
     }
     current+='/'+part;s=await directory(current);
     requireValue(s.file_storage?.directory===current,'Opened folder differs from authorized path');
    }
   }
   requireValue(s.file_storage?.directory===artifact.upload.directory,'Authorized destination mismatch');
   check();job.phase='upload';submitted=true;effectPossible=true;job.uploadStarted=true;
   job.binding={document:s.dom_epoch?.document,workflow_ref:s.workflow_ref,active_tab_ref:s.active_tab_ref};
   upload=await runtime.uploadDeliveredArtifact({artifactId:artifact.artifact_id,grantId:artifact.upload.grant_id,
    observationId:s.observation_id,operationId:job.uploadId,signal});
   await acknowledge(job,'artifact_delivery_upload_receipt',{upload});
   if(upload.status==='NOT_APPLIED'&&upload.effect_possible===false&&upload.cleanup_complete===true) {
    submitted=false;effectPossible=false;job.uploadStarted=false;
    const refused={status:'NOT_APPLIED',effect_possible:false,upload_submitted_or_unknown:false,
      upload_operation_id:job.uploadId,cleanup_complete:true,code:upload.error?.code??'UPLOAD_NOT_APPLIED'};
    await acknowledge(job,'artifact_delivery_not_applied',{result:refused});job.outcome=refused;job.phase='not_applied';job.state='settled';job.error=null;
    return snapshot(job);
   }
   check();
   if(upload.error?.code==='BROWSER_CALL_UNCERTAIN') {
    check();inspected=await runtime.inspect({operationId:job.uploadId});
    requireValue(inspected.output?.operation_id===job.uploadId&&inspected.output?.cleanup_confirmed===true
      &&inspected.output?.outcome?.operation_id===job.uploadId,'Original upload receipt remains uncertain');
    upload=inspected.output.outcome;
    await acknowledge(job,'artifact_delivery_upload_reconciled',{inspection:inspected});
   }

   }
   if(upload.status==='FAILED'&&upload.output?.conflict_rejected===true&&upload.cleanup_complete===true) {
    const refused={status:'FAILED',code:'UPLOAD_PATH_CONFLICT',destination:artifact.upload.destination,
      upload_operation_id:job.uploadId,upload_completion_verified:false,cleanup_complete:true};
    await acknowledge(job,'artifact_delivery_rejected',{result:refused});job.outcome=refused;job.phase='rejected';job.state='settled';return snapshot(job);
   }
   requireValue(upload.output?.upload_submitted===true&&upload.cleanup_complete===true,'Upload submission requires inspection');
   inspected??=await runtime.inspect({operationId:job.uploadId});
   requireValue(inspected.output?.cleanup_confirmed===true&&inspected.output?.outcome?.output?.upload_submitted===true,'Upload cleanup is not confirmed');
   job.phase='verify';
   const destination=await directory();
   requireValue(destination.file_storage.directory===artifact.upload.directory,'Verification directory changed');
   if(resumeId)requireValue(typeof job.binding?.document==='string'&&job.binding.document.length>0
     &&destination.dom_epoch?.document===job.binding.document
     &&JSON.stringify(destination.workflow_ref)===JSON.stringify(job.binding.workflow_ref)
     &&destination.active_tab_ref===job.binding.active_tab_ref,'Delivery browser context changed; no verification dispatched');
   check();job.verificationStarted=true;
   const verification=await runtime.verifyDeliveredArtifact({operationId:job.uploadId,verificationId:job.id+':verify',
    observationId:destination.observation_id,signal});
   const lostVerification=verification.error?.code==='BROWSER_CALL_UNCERTAIN';
   requireValue(lostVerification||verification.status==='SUCCEEDED'&&verification.cleanup_complete===true&&verification.output?.bytes_verified===true,'Destination bytes require inspection');
   check();const final=await runtime.inspect({operationId:job.uploadId});
   if(lostVerification)await acknowledge(job,'artifact_delivery_verification_reconciled',{inspection:final});
   await finish(job,artifact,final);
  } catch(error) {
   job.error=error.code==='STORAGE_ENTRY_UNAVAILABLE'&&!submitted
    ? {code:'ARTIFACT_DESTINATION_UNAVAILABLE',message:String(error.message).slice(0,1000),
      artifact_id:artifact.artifact_id,input_artifact_admitted:true,directory:artifact.upload.directory,
      storage_entry:error.storage_entry,recovery:'Check the selected input directory and the signed-in Loginom account. The attachment was received; do not ask to attach it again.'}
    : {code:'ARTIFACT_DELIVERY_INCOMPLETE',message:String(error.message).slice(0,1000)};
   job.outcome={status:effectPossible?'AMBIGUOUS':'NOT_APPLIED',effect_possible:effectPossible,upload_submitted_or_unknown:submitted,upload_operation_id:job.uploadId,inspection_required:true};
  } finally {job.state='settled';active=null;}
  return snapshot(job);
 }
 return Object.freeze({
  get busy(){return active!==null;},
  get unsettled(){return active!==null || [...jobs.values()].some(job=>job.phase!=='completed' && job.outcome?.effect_possible===true);},
  deliver(request,{signal}={}) {
   requireValue(request&&Object.keys(request).sort().join(',')==='artifact_id,budget_ms,operation_id,upload_grant_id','Exact delivery request required');
   requireValue(typeof request.operation_id==='string'&&/^[A-Za-z0-9_.:-]{1,80}$/.test(request.operation_id),'Bounded delivery ID required');
   requireValue(Number.isInteger(request.budget_ms)&&request.budget_ms>=1000&&request.budget_ms<=1800000,'Delivery budget must be 1000..1800000 ms');
   const signature=hash([request.artifact_id,request.upload_grant_id,request.budget_ms]),previous=jobs.get(request.operation_id);
   if(previous){requireValue(previous.signature===signature,'Delivery ID has different parameters');return previous.promise;}
   requireValue(!active,'Another artifact delivery is in progress');signal?.throwIfAborted();
   requireValue(artifactStore,'Artifact delivery requires an admitted artifact store');
   const artifact=artifactStore.getUploadGrant(request.artifact_id,request.upload_grant_id);
   requireValue(['replace','reject'].includes(artifact.upload.overwrite),'Unsupported upload conflict policy');
   admit(request.operation_id,signature);
   const job={artifact:structuredClone(artifact),resumeRequests:new Map(),id:request.operation_id,uploadId:request.operation_id+':upload',signature,state:'running',phase:'prepared',deadline:now()+request.budget_ms};
   jobs.set(job.id,job);active=job;job.promise=run(job,artifact,signal);return job.promise;
  },
  resume(request,{signal}={}) {
   requireValue(request&&Object.keys(request).sort().join(',')==='budget_ms,operation_id,resume_id','Exact delivery resume request required');
   requireValue(typeof request.resume_id==='string'&&/^[A-Za-z0-9_.:-]{1,80}$/.test(request.resume_id),'Bounded resume ID required');
   requireValue(Number.isInteger(request.budget_ms)&&request.budget_ms>=1000&&request.budget_ms<=1800000,'Delivery resume budget must be 1000..1800000 ms');
   const job=jobs.get(request.operation_id);requireValue(job,'Unknown delivery operation in this session');
   const signature=hash(request),prior=job.resumeRequests.get(request.resume_id);
   if(prior){requireValue(prior.signature===signature,'Resume ID has different parameters');return prior.promise;}
   requireValue(!active,'Another delivery or resume is in progress');signal?.throwIfAborted();
   if(['completed','rejected'].includes(job.phase))return Promise.resolve(snapshot(job));
   requireValue(job.uploadStarted===true,'Delivery stopped before upload; inspect navigation before a new request');
   const artifact=artifactStore.getUploadGrant(job.artifact.artifact_id,job.artifact.upload.grant_id);
   requireValue(JSON.stringify(artifact)===JSON.stringify(job.artifact),'Admitted artifact changed');
   admitResume(job.uploadId,request.resume_id,signature);
   job.deadline=now()+request.budget_ms;job.state='running';job.error=null;active=job;
   const promise=run(job,artifact,signal,request.resume_id);
   job.resumeRequests.set(request.resume_id,{signature,promise});return promise;
  },
  status(id){const job=jobs.get(id);requireValue(job,'Unknown delivery operation');return snapshot(job);},
 });
}
