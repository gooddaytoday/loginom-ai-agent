import {makeWorkspaceUiCode} from './workspace-ui.mjs';
import {makeNativeOutputDownloadCode,withBrowserReceipt} from './executor.mjs';
import {readPreparedNodeContext} from './node-context.mjs';
import {createHash} from 'node:crypto';
import {storageTidSuffix,requireExportDestination} from './storage-policy.mjs';
const need=(v,m)=>{if(!v)throw Error(m);},one=xs=>{need(xs.length===1,'Unique export file control required');return xs[0];};
export function retainedExportStorageTab(snapshot,retained,documentId){
 if(!retained||retained.document_id!==documentId||retained.document!==snapshot.dom_epoch?.document)return null;
 const matches=snapshot.ui.elements.filter(e=>e.ref===retained.ref&&e.tid===retained.tid&&e.allowed_actions.includes('click'));
 return matches.length===1?matches[0]:null;
}
// A completed navigation can detach its old breadcrumb before a detail read.
// Repeat the logical observation (including fresh roots), never the gesture.
export async function waitForExportStorageObservation({observe,condition,guard,quiet,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 let staleReads=0,lastObservation=null;
 for(let i=0;i<100;i++){
  guard();
  try{const state=await observe();lastObservation=state;if(quiet(state)&&condition(state))return state;}
  catch(error){if(error.code!=='UI_ROOT_STALE'||++staleReads>3)throw error;}
  await sleep(100);
 }
 throw Object.assign(Error('Export storage did not settle'),{exportStorageObservation:lastObservation});
}
// Native tab reuse can restore a different ancestor, including Files root.
// Navigate only from newly confirmed ancestors, never repeat an unresolved
// gesture or traverse an unrelated restored subtree.
export async function navigateExportDirectory({directory,inDirectory,row,act}){
 const parts=directory.split('/').filter(Boolean),ancestors=['/'];
 need(parts.length>0&&parts.length<=32,'Bounded export path required');
 for(let i=1;i<=parts.length;i++)ancestors.push('/'+parts.slice(0,i).join('/'));
 let s=await inDirectory();
 if(!ancestors.includes(s.file_storage.directory)){
  await act(s,one(s.ui.elements.filter(e=>e.tid===s.workflow_ref.prefix+';cnrNaviMode;b.s_Сервер>Файлы')));s=await inDirectory(['/'],s);
 }
 const visited=new Set();
 for(let step=0;step<parts.length+4;step++){
  if(s.file_storage.directory===directory)return s;
  const current=s.file_storage.directory,index=ancestors.indexOf(current),workflow=JSON.stringify(s.workflow_ref);
  need(index>=0&&index<parts.length,'Export storage is outside the requested ancestry');
  const identity=JSON.stringify([workflow,current]);need(!visited.has(identity),'Export storage navigation cycle');visited.add(identity);
  const part=parts[index];s=await row(part);
  need(s.file_storage?.directory===current&&JSON.stringify(s.workflow_ref)===workflow,'Export storage parent differs');
  const e=one(s.ui.elements.filter(e=>e.tid===s.workflow_ref.prefix+';FileStorageForm;colName_'+storageTidSuffix(part)&&e.label===part&&e.storage_entry?.kind==='folder'));
  await act(s,e,'double_click');s=await inDirectory(ancestors,s);
 }
 need(s.file_storage.directory===directory,'Export destination not reached');return s;
}
export async function downloadExportWithFreshObservation({snapshot,file,download,refresh,guard}){
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),original=snapshot;
 for(let attempt=0;attempt<3;attempt++){
  guard();const outcome=await download(snapshot,file,attempt);
  const checks=outcome.trace?.find(t=>t.event==='download_context_refused')?.checks;
  if(attempt===2||outcome.status!=='NOT_APPLIED'||outcome.effect_possible!==false||outcome.cleanup_complete!==true
   ||outcome.error?.code!=='DOWNLOAD_CONTEXT_CHANGED'||!checks||checks.epoch!==false
   ||!['observation','authenticated','origin','build','workflow','tab','package','storage','dialogs','masks'].every(k=>checks[k]===true))return outcome;
  const fresh=await refresh(file.ref),matches=fresh.ui.elements.filter(e=>e.ref===file.ref&&e.tid===file.tid&&e.label===file.label&&e.storage_entry?.bytes===file.storage_entry.bytes);
  need(fresh.authenticated&&fresh.origin===original.origin&&fresh.loginom_build===original.loginom_build
   &&fresh.dom_epoch.document===original.dom_epoch.document&&same(fresh.workflow_ref,original.workflow_ref)
   &&fresh.active_tab_ref===original.active_tab_ref&&same(fresh.package_identity,original.package_identity)
   &&fresh.file_storage?.status==='observed'&&fresh.file_storage.directory===original.file_storage.directory
   &&!fresh.ui.dialogs.length&&!fresh.ui.masks.length&&matches.length===1,'Export download target changed during pre-gesture refresh');
  snapshot=fresh;file=matches[0];
 }
}
// A virtual file row may not exist in the DOM until its page is rendered.
// Search only the observed folder, through bounded native scroll gestures.
export async function findNativeStorageRow({name,read,roots,ready,act,guard}) {
 const suffix=';FileStorageForm;colName_'+storageTidSuffix(name);
 let binding=null,owner=null,lastTop=null,direction=null;
 const unavailable=(s,reason)=>Object.assign(new Error('Storage entry is unavailable in the observed folder: '+JSON.stringify(name)+' in '+JSON.stringify(s.file_storage.directory)),
  {code:'STORAGE_ENTRY_UNAVAILABLE',storage_entry:{name,directory:s.file_storage.directory,reason}});
 const bind=s=>{
  need(s.file_storage?.status==='observed','Export search folder unavailable');
  const value=JSON.stringify({workflow:s.workflow_ref,directory:s.file_storage.directory});
  if(binding===null)binding=value;else need(value===binding,'Export search folder changed');
 };
 const table=()=>ready(async()=>{const r=await roots();const es=r.ui.elements.filter(e=>e.tid===r.workflow_ref?.prefix+';FileStorageForm;pnlFileStorage;tbl');need(es.length<=1,'Export table ambiguous');return es.length?read({root_ref:es[0].ref}):r;},s=>s.file_storage?.status==='observed');
 guard();
 const initial=await read({discover_roots:true,storage_name:name});
 const issued=initial.ui.elements.filter(e=>e.tid===initial.workflow_ref?.prefix+suffix);need(issued.length<=1,'Export file row is ambiguous');
 if(issued.length){const found=await read({root_ref:issued[0].ref});bind(found);need(found.ui.elements.filter(e=>e.tid===found.workflow_ref.prefix+suffix&&e.label===name).length===1,'Export file name changed');return found;}
 let s=await table();bind(s);
 for(let step=0;step<=12;step++){
  guard();
  const r=await read({discover_roots:true,storage_name:name});
  const matches=r.ui.elements.filter(e=>e.tid===r.workflow_ref?.prefix+suffix);
  need(matches.length<=1,'Export file row is ambiguous');
  if(matches.length){const found=await read({root_ref:matches[0].ref});bind(found);need(found.ui.elements.filter(e=>e.tid===found.workflow_ref.prefix+suffix&&e.label===name).length===1,'Export file name changed');return found;}
  s=await table();bind(s);
  const anchors=s.ui.elements.filter(e=>e.tid?.startsWith(s.workflow_ref.prefix+';FileStorageForm;colName_')&&e.scroll&&e.allowed_actions.includes('scroll')&&e.interaction?.state==='point_observed');
  if(!anchors.length)throw unavailable(s,'no_scroll_owner');
  const e=anchors[0],scroll=e.scroll;
  need(anchors.every(a=>a.scroll.ref===scroll.ref),'Export search scroll owner ambiguous');
  if(owner===null){owner=scroll.ref;direction=scroll.top>0?'up':'down';}
  need(scroll.ref===owner,'Export search scroll owner changed');
  if(lastTop!==null)need(direction==='up'?scroll.top<lastTop:scroll.top>lastTop,'Export search scroll did not advance');
  if(direction==='up'&&scroll.top===0){direction='down';lastTop=null;}
  if(direction==='down'&&scroll.top>=scroll.max_top)throw unavailable(s,'folder_end');
  need(step<12,'Export file search scroll budget exhausted');
  const delta=direction==='up'?-Math.min(1000,scroll.top):Math.min(1000,scroll.max_top-scroll.top);
  lastTop=scroll.top;await act(s,e,'scroll',{delta_y:delta});
 }
 throw Error('Export file search exhausted');
}
// Navigates only the assigned storage path using the existing observed UI
// controls. Downloads use the shared artifact primitive, never a network API.
export async function readNativeExportFile(options,ctx,configuration,execution){
 const {operation,execute,onRecord,receiptOptions,artifactStore,targetOrigin,targetBuild}=options;
 const destination=configuration?.destination,check=configuration?.configured?.destination_check;
 need(typeof destination==='string'&&check?.verified&&check.destination===destination&&!check.rejected
  &&(!check.existed||check.overwrite==='replace'&&check.decision==='replace')
  &&execution?.verified&&execution.owner_verified&&execution.status==='completed'&&execution.execution_id===ctx.execution.execution_id,'Native export provenance incomplete');
 requireExportDestination(destination,options.storageDirectories);
 const binding={document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node};
 const owner=await execute(`async page=>(${readPreparedNodeContext.toString()})(page,${JSON.stringify(binding)})`);
 need(owner.verified&&owner.surface==='graph','Export graph changed before file read');
 const fileBinding={session_id:artifactStore.outputSessionId,document_id:ctx.document_id,workflow_id:ctx.workflow_ref.workflow_id,node_id:ctx.node.node_id,execution_id:ctx.execution.execution_id,destination};
 const lease=await artifactStore.stageOutput(fileBinding),name=destination.split('/').at(-1),directory=destination.slice(0,-name.length-1);
 let sequence=0,uncertain=false,retained=false,observationDocument=null;
 const guard=()=>{ctx.signal?.throwIfAborted();need(Date.now()<ctx.deadline,'Export file read deadline elapsed');};
 const record=async(phase,data)=>{const r=await onRecord({phase,operation_id:operation.id,...data});need(r?.phase===phase&&r.operation_id===operation.id,'Export file receipt not acknowledged');};
 const base={expected_origin:targetOrigin,expected_build:targetBuild};
 const read=async options=>{
  guard();const r=await execute(makeWorkspaceUiCode({mode:'observe',...base,...options}));
  if(r.status!=='SUCCEEDED')throw Object.assign(Error('Export storage observation failed: '+(r.error?.code??'UNKNOWN')+' '+(r.error?.message??'')),{code:r.error?.code});
  const document=r.output?.dom_epoch?.document;
  need(typeof document==='string'&&document.length>0&&(!observationDocument||document===observationDocument),'Export observation document changed');
  observationDocument??=document;return r.output;
 };
 const quiet=s=>s.authenticated&&s.origin===targetOrigin&&s.loginom_build===targetBuild&&!s.ui.dialogs.length&&!s.ui.masks.length;
 const ready=async(observe,condition)=>{
  try{return await waitForExportStorageObservation({observe,condition,guard,quiet});}
  catch(error){const s=error.exportStorageObservation;if(s)await record('export_file_observation_unsettled',{
   observed:{authenticated:s.authenticated,origin:s.origin,build:s.loginom_build,workflow:s.workflow_ref,storage:s.file_storage,
    dialogs:s.ui.dialogs.map(d=>({kind:d.kind,ref:d.ref})),masks:s.ui.masks.map(m=>({kind:m.kind,target_tid:m.target_tid})),epoch:s.dom_epoch},
   quiet:quiet(s),condition:condition(s)});throw error;}
 };
 const roots=()=>read({discover_roots:true});
 const act=async(s,e,verb='click',extra={})=>{
  const original={workflow:s.workflow_ref,directory:s.file_storage?.directory,package:s.package_identity,tid:e.tid,label:e.label,root:s.observation_root?.ref};
  for(let attempt=0;attempt<3;attempt++){
  guard();need(quiet(s)&&e.allowed_actions.includes(verb),'Export storage gesture unavailable');
  const id=operation.id+':export-file-'+(++sequence),action={verb,ref:e.ref,...extra},signature=createHash('sha256').update(JSON.stringify({action,snapshot:s})).digest('hex');
  await record('export_file_step_prepared',{id,action,signature});uncertain=true;
  const r=await execute(withBrowserReceipt('('+makeWorkspaceUiCode({mode:'act',snapshot:s,action,...base})+')(page)',{...receiptOptions(id,'ui.act',signature),operation_id:id}));
  await record('export_file_step_completed',{id,outcome:r});uncertain=r.cleanup_complete!==true;
  if(r.status==='NOT_APPLIED'&&r.effect_possible===false&&r.cleanup_complete===true&&r.error?.code==='UI_EPOCH_CHANGED'&&attempt<2){
   // Keep the stable table root during scroll retries: virtual rows can
   // detach after the gesture, so they cannot own its post-observation.
   const fresh=await read({root_ref:verb==='scroll'?original.root:e.ref}),matches=fresh.ui.elements.filter(x=>x.ref===e.ref&&x.tid===original.tid&&x.label===original.label);
   need(quiet(fresh)&&JSON.stringify(fresh.workflow_ref)===JSON.stringify(original.workflow)&&fresh.file_storage?.directory===original.directory&&JSON.stringify(fresh.package_identity)===JSON.stringify(original.package)&&matches.length===1,'Export control changed during pre-gesture refresh');
   s=fresh;e=matches[0];continue;
  }
  need(r.status==='SUCCEEDED'&&!uncertain,'Export storage gesture requires inspection');
  return;
  }
 };
 const inDirectory=(expected,previous)=>ready(async()=>{const r=await roots(),e=r.ui.elements.find(e=>e.tid===r.workflow_ref?.prefix+';NavigationBar;NavigationPanel');return e?read({root_ref:e.ref}):r;},s=>s.file_storage?.status==='observed'
  &&(expected===undefined||(Array.isArray(expected)?expected:[expected]).includes(s.file_storage.directory))
  &&(!previous||s.file_storage.directory!==previous.file_storage.directory||JSON.stringify(s.workflow_ref)!==JSON.stringify(previous.workflow_ref)));
 const row=name=>findNativeStorageRow({name,read,roots,ready,act,guard});
 try{
  await record('export_file_lease_prepared',{binding:fileBinding,artifact_id:lease.artifact_id});
  let r=await roots(),retainedTab=null;
  if(options.storageContinuation){
   const tabs=one(r.ui.elements.filter(e=>e.tid==='MF;cntMain;cntWorkspace;Workspace;t.br'));
   const observed=await read({root_ref:tabs.ref});retainedTab=retainedExportStorageTab(observed,options.storageContinuation,ctx.document_id);
   if(retainedTab){await record('export_file_tab_reused',{document_id:ctx.document_id,tab_tid:retainedTab.tid,tab_ref:retainedTab.ref});await act(observed,retainedTab);}
  }
  if(!retainedTab){
   r=await roots();const toolbar=one(r.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar'));
   r=await read({root_ref:toolbar.ref});await act(r,one(r.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar;btnFilestorage')));
  }
  let s=await navigateExportDirectory({directory,inDirectory,row,act});
  r=await roots();const refreshRoot=one(r.ui.elements.filter(e=>e.tid===r.workflow_ref.prefix+';FileStorageForm;btnRefresh'));
  const details=await read({root_ref:refreshRoot.ref}),refresh=one(details.ui.elements.filter(e=>e.tid===details.workflow_ref.prefix+';FileStorageForm;btnRefresh'));
  await act(details,refresh);await inDirectory(directory);
  s=await row(name);need(s.file_storage?.directory===directory,'Export file directory differs');
  const e=one(s.ui.elements.filter(e=>e.tid===s.workflow_ref.prefix+';FileStorageForm;colName_'+storageTidSuffix(name)&&e.label===name)),bytes=e.storage_entry?.bytes;
  need(Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=16*1024*1024,'Export output size is unavailable or exceeds limit');
  let id;
  const downloaded=await downloadExportWithFreshObservation({snapshot:s,file:e,guard,refresh:ref=>read({root_ref:ref}),download:async(snapshot,file,attempt)=>{
   id=operation.id+':export-download'+(attempt?'-'+attempt:'');
   const task={...base,storage_directories:options.storageDirectories,operation_id:id,artifact:{artifact_id:lease.artifact_id,name},output_binding:{...fileBinding,directory},expected_bytes:bytes,
    snapshot,file_ref:file.ref,observation_id:snapshot.observation_id,download_path:lease.path};
   const signature=createHash('sha256').update(JSON.stringify({...task,download_path:undefined})).digest('hex');
   await record('export_file_download_prepared',{binding:fileBinding,artifact_id:lease.artifact_id,bytes,id,signature});
   guard();uncertain=true;
   const result=await execute(withBrowserReceipt('('+makeNativeOutputDownloadCode(task)+')(page)',{...receiptOptions(id,'artifact.download',signature),operation_id:id}));
   await record('export_file_download_completed',{id,outcome:result});uncertain=result.cleanup_complete!==true;return result;
  }});
  need(downloaded.status==='SUCCEEDED'&&!uncertain&&downloaded.output?.destination===destination&&downloaded.output.artifact_id===lease.artifact_id
   &&downloaded.output.download_completed&&downloaded.output.output_binding?.execution_id===ctx.execution.execution_id,'Native export download unconfirmed');
  const artifact=await lease.verify(downloaded.output.suggested_name,bytes);
  const result={artifact_id:artifact.artifact_id,destination,bytes:artifact.bytes,sha256:artifact.sha256,execution_id:ctx.execution.execution_id,verification_id:id,freshness_basis:check.existed?'explicit_replace_and_completed_native_execution':'native_absence_check_and_completed_execution'};
  await record('export_file_bytes_verified',{binding:fileBinding,result});
  // Return through a newly observed tab; then verify the prepared node again.
  r=await roots();const workspace=one(r.ui.elements.filter(e=>e.tid==='MF;cntMain;cntWorkspace;Workspace;t.br'));
  r=await read({root_ref:workspace.ref});const storageTab=one(r.ui.elements.filter(e=>e.tid===r.workflow_ref.tab_tid));
  const continuation={document_id:ctx.document_id,document:r.dom_epoch.document,tid:storageTab.tid,ref:storageTab.ref};
  await act(r,one(r.ui.elements.filter(e=>e.tid===ctx.workflow_ref.tab_tid)));
  let restored=false;for(let i=0;i<50;i++){guard();const actual=await execute(`async page=>(${readPreparedNodeContext.toString()})(page,${JSON.stringify(binding)})`);if(actual.verified&&actual.surface==='graph'){restored=true;break;}await new Promise(r=>setTimeout(r,100));}
  need(restored,'Export file read did not return to its workflow');
  await lease.retain();retained=true;await record('export_file_read_completed',{result,workflow_return_verified:true});options.rememberStorageContinuation?.(continuation);return result;
 }finally{if(!uncertain&&!retained)await lease.release();}
}
