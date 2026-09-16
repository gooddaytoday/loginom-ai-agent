import {makeWorkspaceUiCode} from './workspace-ui.mjs';
import {makeNativeOutputDownloadCode,withBrowserReceipt} from './executor.mjs';
import {readPreparedNodeContext} from './node-context.mjs';
import {createHash} from 'node:crypto';
import {storageTidSuffix,requireExportDestination} from './storage-policy.mjs';
const need=(v,m)=>{if(!v)throw Error(m);},one=xs=>{need(xs.length===1,'Unique export file control required');return xs[0];};
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
 let sequence=0,uncertain=false,retained=false;
 const guard=()=>{ctx.signal?.throwIfAborted();need(Date.now()<ctx.deadline,'Export file read deadline elapsed');};
 const record=async(phase,data)=>{const r=await onRecord({phase,operation_id:operation.id,...data});need(r?.phase===phase&&r.operation_id===operation.id,'Export file receipt not acknowledged');};
 const base={expected_origin:targetOrigin,expected_build:targetBuild};
 const read=async options=>{guard();const r=await execute(makeWorkspaceUiCode({mode:'observe',...base,...options}));need(r.status==='SUCCEEDED','Export storage observation failed: '+(r.error?.code??'UNKNOWN')+' '+(r.error?.message??''));return r.output;};
 const quiet=s=>s.authenticated&&s.origin===targetOrigin&&s.loginom_build===targetBuild&&!s.ui.dialogs.length&&!s.ui.masks.length;
 const ready=async(fn,condition)=>{for(let i=0;i<100;i++){guard();const s=await fn();if(quiet(s)&&condition(s))return s;await new Promise(r=>setTimeout(r,100));}throw Error('Export storage did not settle');};
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
 const inDirectory=expected=>ready(async()=>{const r=await roots(),e=r.ui.elements.find(e=>e.tid===r.workflow_ref?.prefix+';NavigationBar;NavigationPanel');return e?read({root_ref:e.ref}):r;},s=>s.file_storage?.status==='observed'&&(expected===undefined||s.file_storage.directory===expected));
 const row=name=>findNativeStorageRow({name,read,roots,ready,act,guard});
 try{
  await record('export_file_lease_prepared',{binding:fileBinding,artifact_id:lease.artifact_id});
  let r=await roots(),toolbar=one(r.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar'));
  r=await read({root_ref:toolbar.ref});await act(r,one(r.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar;btnFilestorage')));
  let s=await inDirectory();
  if(s.file_storage.directory!=='/'&&s.file_storage.directory!==directory){
   await act(s,one(s.ui.elements.filter(e=>e.tid===s.workflow_ref.prefix+';cnrNaviMode;b.s_Сервер>Файлы')));s=await inDirectory('/');
  }
  if(s.file_storage.directory!==directory){let current='';for(const part of directory.split('/').filter(Boolean)){
   s=await row(part);need(s.file_storage?.directory===(current||'/'),'Export storage parent differs');
   const e=one(s.ui.elements.filter(e=>e.tid===s.workflow_ref.prefix+';FileStorageForm;colName_'+storageTidSuffix(part)&&e.label===part&&e.storage_entry?.kind==='folder'));
   await act(s,e,'double_click');current+='/'+part;s=await inDirectory(current);
  }}
  r=await roots();const refreshRoot=one(r.ui.elements.filter(e=>e.tid===r.workflow_ref.prefix+';FileStorageForm;btnRefresh'));
  const details=await read({root_ref:refreshRoot.ref}),refresh=one(details.ui.elements.filter(e=>e.tid===details.workflow_ref.prefix+';FileStorageForm;btnRefresh'));
  await act(details,refresh);await inDirectory(directory);
  s=await row(name);need(s.file_storage?.directory===directory,'Export file directory differs');
  const e=one(s.ui.elements.filter(e=>e.tid===s.workflow_ref.prefix+';FileStorageForm;colName_'+storageTidSuffix(name)&&e.label===name)),bytes=e.storage_entry?.bytes;
  need(Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=16*1024*1024,'Export output size is unavailable or exceeds limit');
  const id=operation.id+':export-download',task={...base,storage_directories:options.storageDirectories,operation_id:id,artifact:{artifact_id:lease.artifact_id,name},output_binding:{...fileBinding,directory},expected_bytes:bytes,
   snapshot:s,file_ref:e.ref,observation_id:s.observation_id,download_path:lease.path};
  const signature=createHash('sha256').update(JSON.stringify({...task,download_path:undefined})).digest('hex');
  await record('export_file_download_prepared',{binding:fileBinding,artifact_id:lease.artifact_id,bytes,id,signature});
  guard();uncertain=true;
  const downloaded=await execute(withBrowserReceipt('('+makeNativeOutputDownloadCode(task)+')(page)',{...receiptOptions(id,'artifact.download',signature),operation_id:id}));
  await record('export_file_download_completed',{id,outcome:downloaded});uncertain=downloaded.cleanup_complete!==true;
  need(downloaded.status==='SUCCEEDED'&&!uncertain&&downloaded.output?.destination===destination&&downloaded.output.artifact_id===lease.artifact_id
   &&downloaded.output.download_completed&&downloaded.output.output_binding?.execution_id===ctx.execution.execution_id,'Native export download unconfirmed');
  const artifact=await lease.verify(downloaded.output.suggested_name,bytes);
  const result={artifact_id:artifact.artifact_id,destination,bytes:artifact.bytes,sha256:artifact.sha256,execution_id:ctx.execution.execution_id,verification_id:id,freshness_basis:check.existed?'explicit_replace_and_completed_native_execution':'native_absence_check_and_completed_execution'};
  await record('export_file_bytes_verified',{binding:fileBinding,result});
  // Return through a newly observed tab; then verify the prepared node again.
  r=await roots();const workspace=one(r.ui.elements.filter(e=>e.tid==='MF;cntMain;cntWorkspace;Workspace;t.br'));
  r=await read({root_ref:workspace.ref});await act(r,one(r.ui.elements.filter(e=>e.tid===ctx.workflow_ref.tab_tid)));
  let restored=false;for(let i=0;i<50;i++){guard();const actual=await execute(`async page=>(${readPreparedNodeContext.toString()})(page,${JSON.stringify(binding)})`);if(actual.verified&&actual.surface==='graph'){restored=true;break;}await new Promise(r=>setTimeout(r,100));}
  need(restored,'Export file read did not return to its workflow');
  await lease.retain();retained=true;await record('export_file_read_completed',{result,workflow_return_verified:true});return result;
 }finally{if(!uncertain&&!retained)await lease.release();}
}
