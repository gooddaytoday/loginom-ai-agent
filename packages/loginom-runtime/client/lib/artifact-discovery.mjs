import {workspaceUiCapability} from './workspace-ui.mjs';

// Serialized, private extension of artifact.download. It only reveals the
// authorized file in the already verified directory, then reuses its downloader.
export async function discoverArtifactAndDownload(page,task,ui,download,reveal) {
 const trace=[];let moved=false,owner,uncertain=false;
 const result=(code)=>({status:moved||uncertain?'AMBIGUOUS':'NOT_APPLIED',action_key:'artifact.download',action_revision:'1',
  operation_id:task.operation_id,phase:'discovery',effect_possible:moved||uncertain,cleanup_complete:!uncertain,output:{},error:{code,message:code},trace});
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),base={expected_build:task.expected_build,expected_origin:task.expected_origin};
 const context=s=>s.authenticated===true&&s.origin===task.expected_origin&&s.loginom_build===task.expected_build
  &&same(s.workflow_ref,task.snapshot.workflow_ref)&&s.dom_epoch?.document===task.snapshot.dom_epoch?.document
  &&s.active_tab_ref===task.snapshot.active_tab_ref&&same(s.package_identity,task.snapshot.package_identity)
  &&s.file_storage?.status==='observed'&&s.file_storage.directory===task.artifact.upload.directory
  &&s.ui.masks.length===0&&s.ui.dialogs.length===0;
 const readDirectory=()=>ui(page,{...base,mode:'observe',root_ref:task.snapshot.observation_root.ref});
 const suffix=task.artifact.name.replace(/\s/g,'_').replace(/,/g,''),prefix=task.snapshot.workflow_ref.prefix;
 const tid=prefix+';FileStorageForm;colName_'+suffix,gridTid=prefix+';FileStorageForm;pnlFileStorage;tbl';
 const deadline=Date.now()+18000;
 try {
  let reset=false;
  for(let step=0;step<16&&Date.now()<deadline;step++) {
   const directory=await readDirectory();
   if(directory.status!=='SUCCEEDED'||!context(directory.output))return result('DISCOVERY_DIRECTORY_CHANGED');
   const roots=await ui(page,{...base,mode:'observe',discover_roots:true,storage_name:task.artifact.name});
   if(roots.status!=='SUCCEEDED'||!same(roots.output.workflow_ref,task.snapshot.workflow_ref))return result('DISCOVERY_CONTEXT_CHANGED');
   const matches=roots.output.ui.elements.filter(e=>e.tid===tid);
   if(matches.length>1)return result('DISCOVERY_FILE_AMBIGUOUS');
   if(matches.length===1) {
    const ref=matches[0].ref,observed=await ui(page,{...base,mode:'observe',root_ref:ref});
    if(observed.status!=='SUCCEEDED'||!context(observed.output))return result('DISCOVERY_FILE_CONTEXT_CHANGED');
    const files=observed.output.ui.elements.filter(e=>e.ref===ref&&e.tid===tid&&e.label===task.artifact.name);
    if(files.length!==1)return result('DISCOVERY_FILE_IDENTITY_CHANGED');
    trace.push({event:'artifact_file_discovered',file_ref:ref,file_tid:tid,directory:task.artifact.upload.directory,scrolls:trace.length,document:observed.output.dom_epoch.document,workflow_ref:observed.output.workflow_ref,active_tab_ref:observed.output.active_tab_ref});
    const read=p=>ui(p,{...base,mode:'observe',root_ref:ref});
    const act=(p,snapshot)=>ui(p,{...base,mode:'act',snapshot,action:{verb:'double_click',ref}});
    uncertain=true;const outcome=await download(page,{...task,file_ref:ref,snapshot:observed.output},read,act,reveal);
    uncertain=false;return {...outcome,status:moved&&outcome.status==='NOT_APPLIED'?'AMBIGUOUS':outcome.status,
      effect_possible:moved||outcome.effect_possible,trace:[...trace,...outcome.trace]};
   }
   const grid=page.locator('[data-tid='+JSON.stringify(gridTid)+']');
   if(await grid.count()!==1||!await grid.isVisible())return result('DISCOVERY_GRID_UNAVAILABLE');
   owner??=await grid.elementHandle();
   uncertain=true;
   const move=await owner.evaluate((element,{tid,reset,epoch})=>{
    const state=globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')];
    if(!state?.observer)return {applied:false,code:'DISCOVERY_EPOCH_UNAVAILABLE'};
    const records=state.observer.takeRecords();
    if(state.captureMutations)state.captureMutations(records);else state.revision+=records.length;
    if(state.epoch!==epoch.document||state.revision!==epoch.revision)return {applied:false,code:'DISCOVERY_EPOCH_CHANGED'};
    const matches=document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']');
    if(!element.isConnected||matches.length!==1||matches[0]!==element)return {applied:false,code:'DISCOVERY_GRID_CHANGED'};
    const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
    if(rect.width<=0||rect.height<=0||style.visibility==='hidden'||style.display==='none')return {applied:false,code:'DISCOVERY_GRID_HIDDEN'};
    const hit=document.elementFromPoint(rect.x+Math.min(rect.width/2,300),rect.y+Math.min(rect.height/2,200));
    if(!hit||!element.contains(hit))return {applied:false,code:'DISCOVERY_GRID_BLOCKED'};
    const from=element.scrollTop,max=element.scrollHeight-element.clientHeight;
    const to=!reset&&from>0?Math.max(0,from-700):Math.min(max,from+700);
    if(to===from)return {applied:false,code:'DISCOVERY_FILE_NOT_FOUND'};
    element.scrollTop=to;
    return {applied:true,from,to,actual:element.scrollTop,max,reset:reset||from===0||to===0};
   },{tid:gridTid,reset,epoch:roots.output.dom_epoch});
   uncertain=false;
   if(!move.applied&&move.code==='DISCOVERY_EPOCH_CHANGED')continue;
   if(!move.applied)return result(move.code);
   moved=true;reset=move.reset;
   trace.push({event:'artifact_discovery_scroll',grid_tid:gridTid,directory:task.artifact.upload.directory,...move});
   if(move.actual!==move.to)return result('DISCOVERY_SCROLL_UNCONFIRMED');
   await page.waitForTimeout(100);
  }
  return result('DISCOVERY_LIMIT');
 } catch {return result('DISCOVERY_BROWSER_UNCERTAIN');}
 finally {if(owner)try{await owner.dispose();}catch{}}
}

export function makeArtifactDiscoveryDownloadCode(options,{download,reveal}) {
 if(!options?.artifact?.upload||!options.snapshot?.observation_root?.ref||options.snapshot.file_storage?.status!=='observed'
   ||options.snapshot.file_storage.directory!==options.artifact.upload.directory||!/^MF;TF(?:-\d+)?$/.test(options.snapshot.workflow_ref?.prefix)
   ||!(/\.(csv|tsv)$/i.test(options.artifact.name)))throw Error('Discovery requires the exact observed authorized storage');
 return `async page=>(${discoverArtifactAndDownload.toString()})(page,${JSON.stringify(options)},${workspaceUiCapability.toString()},${download.toString()},${reveal.toString()})`;
}

// The discovered reference did not exist at lease preparation. Accept it only
// through the pinned discovery receipt bound to that preparation's native context.
export function verifiedDiscoveryReference(artifact,binding,raw) {
 const matches=raw.trace?.filter(e=>e.event==='artifact_file_discovered')??[];
 const proof=matches[0],tid=binding?.workflow_ref?.prefix+';FileStorageForm;colName_'+artifact.name.replace(/\s/g,'_').replace(/,/g,'');
 if(matches.length!==1||!/^ui-[a-zA-Z0-9-]{1,124}$/.test(proof.file_ref)||proof.file_ref!==raw.output?.file_ref
   ||proof.file_tid!==tid||proof.directory!==artifact.upload.directory||proof.document!==binding.document
   ||proof.active_tab_ref!==binding.active_tab_ref||JSON.stringify(proof.workflow_ref)!==JSON.stringify(binding.workflow_ref))
  throw Error('Discovered download reference is not bound to the prepared destination');
 return proof.file_ref;
}
