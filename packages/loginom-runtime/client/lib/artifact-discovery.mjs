import {workspaceUiCapability} from './workspace-ui.mjs';

// Private package path: retain the native owner before the existing upload,
// then observe completion without changing its original submission receipt.
export async function completePackageUpload(page,task,upload,waitReady=waitArtifactDiscoveryReady) {
 let binding,receipt=null;
 const trace=[];
 const result=(status,completion=null,error=null)=>({status,action_key:'artifact.package_completion',action_revision:'1',
  operation_id:task.operation_id,phase:'native_completion',effect_possible:receipt?.effect_possible===true,
  cleanup_complete:receipt?.cleanup_complete!==false,output:{upload:receipt,...(completion?{completion}:{})},error,trace});
 try {
  if(Date.now()>=task.deadline_at)throw Error('PACKAGE_UPLOAD_DEADLINE');
  binding=await page.evaluateHandle(t=>{
   const prep=globalThis.__loginomDockPreparationV1,main=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
   const card=main?.Items?.Workspace?.getActiveTab?.(),controller=card?.Controller,form=controller?.FController;
   const sender=form?.FFileSenderManager,input=form?.FFileInput,prefix=t.snapshot.workflow_ref.prefix;
   const gridTid=prefix+';FileStorageForm;pnlFileStorage;tbl';
   const grids=[...document.querySelectorAll('[data-tid='+JSON.stringify(gridTid)+']')];
   const tabs=[...document.querySelectorAll('[data-tid='+JSON.stringify(t.snapshot.workflow_ref.tab_tid)+']')];
   const grid=grids[0],view=grid&&globalThis.Ext?.getCmp?.(grid.id),store=view?.getStore?.(),records=store?.getRange?.();
   if(location.origin!==t.expected_origin||globalThis.bg?.app?.Version!==t.expected_build
     ||prep?.document!==document||prep.id!==t.binding.document_id||main.FMapTree?.FServerConnection?.UserName!==t.binding.loginom_account
     ||grids.length!==1||tabs.length!==1||!tabs[0].classList.contains('x-tab-active')
     ||form?.constructor?.name!=='FileStorageForm'||sender?.constructor?.name!=='FileSenderManager'
     ||!input?.isConnected||input.files?.length!==0||sender.FActiveLoadersCount!==0||sender.FLastConflictResult!==undefined
     ||Object.keys(sender.FCurrentUploadFilePaths??{}).length||sender.CurrentDirectory!==t.artifact.upload.directory+'/'
     ||view.el?.dom!==grid||!form.FView?.el?.dom?.contains(grid)||store?.isLoading?.()!==false||store.isBufferedStore
     ||!Number.isSafeInteger(store.loadCount)||!Array.isArray(records)||store.getCount?.()!==records.length||store.getTotalCount?.()!==records.length
     ||records.some(r=>r.data?.FileName===t.artifact.name||r.data?.FilePath===t.artifact.upload.destination||r.data?.id===t.artifact.upload.destination))
    throw Error('PACKAGE_UPLOAD_BINDING_UNAVAILABLE');
   return {document,prep,card,controller,form,sender,input,grid,gridTid,tab:tabs[0],view,store,loadCount:store.loadCount};
  },task);
  const minimum=(await page.evaluate(b=>b.loadCount,binding))+1;
  if(Date.now()>=task.deadline_at)throw Error('PACKAGE_UPLOAD_DEADLINE');
  receipt=await upload(page);
  if(receipt.status!=='AMBIGUOUS'||receipt.error?.code!=='UPLOAD_SERVER_VERIFICATION_REQUIRED'
    ||receipt.output?.upload_submitted!==true||receipt.cleanup_complete!==true)
   return result(receipt.status==='NOT_APPLIED'?'NOT_APPLIED':'AMBIGUOUS',null,{code:'PACKAGE_UPLOAD_NOT_CONFIRMED',message:'Original upload did not confirm a completed submission'});
  await waitReady(page,task,task.deadline_at,trace,minimum);
  const completion=await page.evaluate(({b,t,minimum})=>{
   const main=globalThis.bg?.app?.Application?.FInstance?.FMainForm,card=main?.Items?.Workspace?.getActiveTab?.();
   const grids=[...document.querySelectorAll('[data-tid='+JSON.stringify(b.gridTid)+']')];
   const visible=e=>e.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
   const blocked=[...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message'),...document.querySelectorAll('[role="dialog"],.x-message-box')].some(visible);
   if(document!==b.document||globalThis.__loginomDockPreparationV1!==b.prep||b.prep.id!==t.binding.document_id
     ||location.origin!==t.expected_origin||globalThis.bg?.app?.Version!==t.expected_build||main.FMapTree?.FServerConnection?.UserName!==t.binding.loginom_account
     ||card!==b.card||card.Controller!==b.controller||card.Controller.FController!==b.form||b.form.FFileSenderManager!==b.sender
     ||b.form.FFileInput!==b.input||!b.input.isConnected||b.input.files.length!==0||b.sender.FActiveLoadersCount!==0
     ||Object.keys(b.sender.FCurrentUploadFilePaths??{}).length||b.sender.FLastConflictResult!==undefined
     ||b.sender.CurrentDirectory!==t.artifact.upload.directory+'/'||!b.tab.isConnected||!b.tab.classList.contains('x-tab-active')
     ||grids.length!==1||grids[0]!==b.grid||globalThis.Ext?.getCmp?.(b.grid.id)!==b.view||b.view.el?.dom!==b.grid||b.view.getStore()!==b.store
     ||b.store.isLoading()||b.store.isBufferedStore||!Number.isSafeInteger(b.store.loadCount)||b.store.loadCount<minimum||blocked)
    throw Error('PACKAGE_UPLOAD_OWNER_CHANGED');
   const records=b.store.getRange(),data=b.store.getData?.(),source=data?.getSource?.()?.items;
   if(!Array.isArray(records)||b.store.getCount()!==records.length||b.store.getTotalCount()!==records.length
     ||!Array.isArray(data?.items)||data.items.length!==records.length||data.items.some(r=>!records.includes(r))
     ||source&&(!Array.isArray(source)||source.length!==records.length||source.some(r=>!records.includes(r))))throw Error('PACKAGE_UPLOAD_STORE_INCOMPLETE');
   const matches=records.filter(r=>r.data?.FileName===t.artifact.name||r.data?.FilePath===t.artifact.upload.destination||r.data?.id===t.artifact.upload.destination);
   const row=matches[0]?.data;
   if(matches.length!==1||row.Type!==0||row.FileName!==t.artifact.name||row.FilePath!==t.artifact.upload.destination
     ||row.id!==t.artifact.upload.destination||row.Size!==t.artifact.bytes)throw Error('PACKAGE_UPLOAD_ROW_MISMATCH');
   return {artifact_id:t.artifact.artifact_id,destination:t.artifact.upload.destination,bytes:row.Size,bytes_source:'native_file_store',
    upload_completion_verified:true,load_count:b.store.loadCount,
    files_entry:{document_id:b.prep.id,tab_tid:t.snapshot.workflow_ref.tab_tid,directory:t.artifact.upload.directory}};
  },{b:binding,t:task,minimum});
  if(Date.now()>=task.deadline_at)throw Error('PACKAGE_UPLOAD_DEADLINE');
  return result('SUCCEEDED',completion);
 }catch(error){return result(receipt?.effect_possible?'AMBIGUOUS':'NOT_APPLIED',null,
  {code:'PACKAGE_UPLOAD_COMPLETION_UNCONFIRMED',message:String(error.message).slice(0,500)});}
 finally{if(binding)await binding.dispose();}
}

// Upload submission can settle before its file grid reload does. Wait on the
// same native directory/view/store before discovery or scrolling, without
// refreshing, downloading, or resubmitting anything while it is covered.
export async function waitArtifactDiscoveryReady(page,task,deadline,trace,minimumLoadCount=null,refresh=null) {
 const binding=await page.evaluateHandle(({snapshot,origin,build})=>{
  const prefix=snapshot.workflow_ref.prefix,gridTid=prefix+';FileStorageForm;pnlFileStorage;tbl';
  const elements=[...document.querySelectorAll('[data-tid='+JSON.stringify(gridTid)+']')];
  const tabs=[...document.querySelectorAll('[data-tid='+JSON.stringify(snapshot.workflow_ref.tab_tid)+']')];
  const state=globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')];
  const card=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
  const element=elements[0],view=element&&globalThis.Ext?.getCmp?.(element.id),store=view?.getStore?.();
  if(location.origin!==origin||globalThis.bg?.app?.Version!==build||state?.epoch!==snapshot.dom_epoch.document
    ||elements.length!==1||tabs.length!==1||!tabs[0].classList.contains('x-tab-active')
    ||view?.el?.dom!==element||!store||typeof store.isLoading!=='function'||!card?.Controller?.Node?.data?.node)
    throw Error('DISCOVERY_READY_BINDING_UNAVAILABLE');
  return {document,element,view,store,tab:tabs[0],card,controller:card.Controller,directoryNode:card.Controller.Node.data.node,gridTid};
 },{snapshot:task.snapshot,origin:task.expected_origin,build:task.expected_build});
 const inspect=({binding:b,task:t,minimumLoadCount,poll=false,busyOnly=false})=>{
  const state=globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')];
  const card=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
  const matches=[...document.querySelectorAll('[data-tid='+JSON.stringify(b.gridTid)+']')];
  if(document!==b.document||location.origin!==t.expected_origin||globalThis.bg?.app?.Version!==t.expected_build
    ||state?.epoch!==t.snapshot.dom_epoch.document||card!==b.card||card.Controller!==b.controller||card.Controller.Node?.data?.node!==b.directoryNode
    ||!b.tab.isConnected||!b.tab.classList.contains('x-tab-active')||matches.length!==1||matches[0]!==b.element
    ||globalThis.Ext?.getCmp?.(b.element.id)!==b.view||b.view.el?.dom!==b.element||b.view.getStore()!==b.store)
    throw Error('DISCOVERY_READY_OWNER_CHANGED');
  const visible=e=>e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const masks=[...document.querySelectorAll('.x-mask,.x-mask-msg,.bg-mask-message')].filter(visible);
  const dialogs=[...document.querySelectorAll('[role="dialog"],.x-message-box')].filter(visible);
  const rect=b.element.getBoundingClientRect(),x=rect.x+Math.min(rect.width/2,300),y=rect.y+Math.min(rect.height/2,200),hit=document.elementFromPoint(x,y);
  const fileTid=t.snapshot.workflow_ref.prefix+';FileStorageForm;colName_'+t.artifact.name.replace(/\s/g,'_').replace(/,/g,'');
  const files=[...b.element.querySelectorAll('[data-tid='+JSON.stringify(fileTid)+']')].filter(visible);
  const fileReady=files.length===1&&files[0].textContent.trim()===t.artifact.name&&(()=>{
    const box=files[0].getBoundingClientRect(),top=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
    return !!top&&(top===files[0]||files[0].contains(top));
  })();
  const loading=b.store.isLoading()===true;
  const loadCount=Number.isSafeInteger(b.store.loadCount)?b.store.loadCount:null;
  const data=b.store.getData?.(),records=data?.items,source=data?.getSource?.()?.items;
  const count=b.store.getCount?.(),total=b.store.getTotalCount?.();
  const complete=Array.isArray(records)&&!b.store.isBufferedStore&&count===records.length&&total===records.length
    &&(!source||Array.isArray(source)&&source.length===records.length&&source.every(record=>records.includes(record)));
  const nameCells=[...b.element.querySelectorAll('[data-tid^='+JSON.stringify(t.snapshot.workflow_ref.prefix+';FileStorageForm;colName_')+']')].filter(visible);
  const onlyParent=complete&&records.length===1&&nameCells.length===1&&nameCells[0].textContent.trim()==='..'
    &&nameCells[0].closest('table.x-grid-item')?.getAttribute('data-recordid')===String(records[0].internalId);
  const roots=[...document.querySelectorAll('[data-tid='+JSON.stringify(t.snapshot.workflow_ref.prefix+';FileStorageForm')+']')];
  const emptyText='Папка пуста. Перетащите файлы в эту область, чтобы загрузить их';
  let placeholder=false;
  for(let element=hit,depth=0;element&&depth<8;depth++,element=element.parentElement){
    if(roots.length!==1||!roots[0].contains(element)||element===roots[0])break;
    if((element.textContent??'').replace(/\s+/g,' ').trim()===emptyText){placeholder=true;break;}
  }
  const empty=complete&&(records.length===0||onlyParent)&&files.length===0&&placeholder;
  const generation=minimumLoadCount===null||loadCount!==null&&loadCount>=minimumLoadCount;
  const busySameOwner=dialogs.length===0&&(loading||masks.length>0)&&roots.length===1
    &&!!hit&&roots[0].contains(hit)&&masks.every(mask=>mask===roots[0]
      &&typeof mask.className==='string'&&mask.className.split(/\s+/).includes('bg-mask-message'));
  const observed={ready:visible(b.element)&&!loading&&generation&&masks.length===0&&dialogs.length===0&&((!!hit&&b.element.contains(hit))||fileReady||empty),
    busy_same_owner:busySameOwner,
    loading,load_count:loadCount,empty_native_store:empty,grid_hit:!!hit&&b.element.contains(hit),file_ready:fileReady,
    store_class:String(b.store.$className??b.store.constructor?.name??'').slice(0,160),
    count:Number.isSafeInteger(count)?count:null,total:Number.isSafeInteger(total)?total:null,
    materialized_length:Array.isArray(records)?records.length:null,filter_source_length:Array.isArray(source)?source.length:null,
    buffered:b.store.isBufferedStore===true,complete,only_parent:onlyParent,placeholder,generation_ready:generation,
    hit:hit?{tid:hit.getAttribute('data-tid'),classes:typeof hit.className==='string'?hit.className.slice(0,200):''}:null,
    masks:masks.slice(0,8).map(e=>({tid:e.getAttribute('data-tid'),classes:e.className})),dialogs:dialogs.length};
  if(busyOnly&&!observed.ready&&!busySameOwner)throw Error('DISCOVERY_REFRESH_BLOCKED');
  return poll?(observed.ready?observed:false):observed;
 };
 const revalidateReady=async()=>{
  // A completed poll does not reserve readiness. Keep the original binding and
  // deadline across final-read races, and bound repeated transitions as well.
  for(let attempt=0;attempt<16;attempt++){
   if(Date.now()>=deadline)throw Error('DISCOVERY_READY_DEADLINE');
   const observed=await page.evaluate(inspect,{binding,task,minimumLoadCount});
   if(Date.now()>=deadline)throw Error('DISCOVERY_READY_DEADLINE');
   if(observed.ready)return observed;
   if(!observed.busy_same_owner)throw Error('DISCOVERY_READY_CHANGED');
   trace.push({event:'artifact_discovery_ready_recheck',attempt,...observed});
   if(attempt===15)throw Error('DISCOVERY_READY_RECHECK_LIMIT');
   const remaining=deadline-Date.now();if(remaining<=0)throw Error('DISCOVERY_READY_DEADLINE');
   const ready=await page.waitForFunction(inspect,
    {binding,task,minimumLoadCount,poll:true,busyOnly:true},{timeout:remaining,polling:250});
   await ready.dispose();
  }
 };
 try {
  const before=await page.evaluate(inspect,{binding,task,minimumLoadCount});trace.push({event:'artifact_discovery_readiness',...before});
  if(!before.ready){
   const remaining=deadline-Date.now();if(remaining<=0)throw Error('DISCOVERY_READY_DEADLINE');
   const ready=await page.waitForFunction(inspect,
    {binding,task,minimumLoadCount,poll:true},{timeout:remaining,polling:250});
   await ready.dispose();
  }
  const after=await revalidateReady();
  trace.push({event:'artifact_discovery_ready',...after});
  if(refresh){
   if(!Number.isSafeInteger(after.load_count)||Date.now()>=deadline)throw Error('DISCOVERY_REFRESH_GENERATION_UNAVAILABLE');
   minimumLoadCount=after.load_count+1;
   await refresh(async()=>{
    // A read-only context settlement inside the callback may complete another
    // load. Pin the generation immediately before the sole Refresh gesture.
    const dispatch=await page.evaluate(inspect,{binding,task,minimumLoadCount:null});
    trace.push({event:'artifact_refresh_native_preflight',...dispatch});
    if(Date.now()>=deadline)throw Error('DISCOVERY_READY_DEADLINE');
    if(!dispatch.ready){
     if(!dispatch.busy_same_owner)throw Error('DISCOVERY_REFRESH_BLOCKED');
     // No gesture has been sent. Retain this binding and original deadline,
     // settle only known same-owner loading, then require a full new preflight.
     const remaining=deadline-Date.now();if(remaining<=0)throw Error('DISCOVERY_READY_DEADLINE');
     const ready=await page.waitForFunction(inspect,
      {binding,task,minimumLoadCount:null,poll:true,busyOnly:true},{timeout:remaining,polling:250});
     await ready.dispose();
     trace.push({event:'artifact_refresh_native_settled',...await page.evaluate(inspect,{binding,task,minimumLoadCount:null,busyOnly:true})});
     return false;
    }
    if(!Number.isSafeInteger(dispatch.load_count))throw Error('DISCOVERY_REFRESH_GENERATION_UNAVAILABLE');
    minimumLoadCount=dispatch.load_count+1;
    return true;
   });
   const remaining=deadline-Date.now();if(remaining<=0)throw Error('DISCOVERY_READY_DEADLINE');
   const loaded=await page.waitForFunction(inspect,
    {binding,task,minimumLoadCount,poll:true},{timeout:remaining,polling:250});
   await loaded.dispose();
   const settled=await revalidateReady();
   trace.push({event:'artifact_discovery_refresh_settled',...settled});
   return settled;
  }
  return after;
 }catch(error){
  trace.push({event:'artifact_discovery_readiness_refused',reason:String(error.message).slice(0,240)});
  try{trace.push({event:'artifact_discovery_readiness_terminal',...await page.evaluate(inspect,{binding,task,minimumLoadCount})});}catch{}
  throw error;
 }finally{await binding.dispose();}
}

// Serialized, private extension of artifact.download. It only reveals the
// authorized file in the already verified directory, then reuses its downloader.
export async function discoverArtifactAndDownload(page,task,ui,download,reveal,waitReady=waitArtifactDiscoveryReady) {
 const trace=[];let moved=false,owner,uncertain=false;
 const result=(code)=>({status:moved||uncertain?'AMBIGUOUS':'NOT_APPLIED',action_key:'artifact.download',action_revision:'1',
  operation_id:task.operation_id,phase:'discovery',effect_possible:moved||uncertain,cleanup_complete:!uncertain,output:{},error:{code,message:code},trace});
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),base={expected_build:task.expected_build,expected_origin:task.expected_origin};
 const ownedContext=s=>s.authenticated===true&&s.origin===task.expected_origin&&s.loginom_build===task.expected_build
  &&same(s.workflow_ref,task.snapshot.workflow_ref)&&s.dom_epoch?.document===task.snapshot.dom_epoch?.document
  &&s.active_tab_ref===task.snapshot.active_tab_ref&&same(s.package_identity,task.snapshot.package_identity)
  &&s.file_storage?.status==='observed'&&s.file_storage.directory===task.artifact.upload.directory;
 const context=s=>ownedContext(s)&&s.ui.masks.length===0&&s.ui.dialogs.length===0;
 const contextEvidence=r=>{
  const s=r.output??{};
  return {status:r.status,error:r.error?.code??null,authenticated:s.authenticated===true,
   origin_matches:s.origin===task.expected_origin,build_matches:s.loginom_build===task.expected_build,
   workflow_matches:same(s.workflow_ref,task.snapshot.workflow_ref),document_matches:s.dom_epoch?.document===task.snapshot.dom_epoch?.document,
   tab_matches:s.active_tab_ref===task.snapshot.active_tab_ref,package_matches:same(s.package_identity,task.snapshot.package_identity),
   storage_status:s.file_storage?.status??null,directory_matches:s.file_storage?.directory===task.artifact.upload.directory,
   masks_count:s.ui?.masks?.length??null,dialogs_count:s.ui?.dialogs?.length??null,
   masks:(s.ui?.masks??[]).slice(0,8).map(e=>({tid:e.target_tid??null,kind:e.kind??null})),
   dialogs:(s.ui?.dialogs??[]).slice(0,8).map(e=>({ref:e.ref??null,title:String(e.title??'').slice(0,160)}))};
 };
 const readDirectory=()=>ui(page,{...base,mode:'observe',root_ref:task.snapshot.observation_root.ref});
 const suffix=task.artifact.name.replace(/\s/g,'_').replace(/,/g,''),prefix=task.snapshot.workflow_ref.prefix;
 const tid=prefix+';FileStorageForm;colName_'+suffix,gridTid=prefix+';FileStorageForm;pnlFileStorage;tbl';
 // Artifact verification already owns a 60-second browser budget. Leave a
 // small transport margin, but allow slow Windows/Loginom uploads to publish
 // their final size instead of imposing a separate short discovery timeout.
 const deadline=Date.now()+55000;
 const settledDirectory=async()=>{
  for(let attempt=0;attempt<16;attempt++){
   if(Date.now()>=deadline)throw Error('DISCOVERY_DIRECTORY_SETTLEMENT_DEADLINE');
   const observed=await readDirectory(),s=observed.output;
   if(observed.status!=='SUCCEEDED'||context(s))return observed;
   const busy=ownedContext(s)&&s.ui?.dialogs?.length===0&&s.ui?.masks?.length>0
    &&s.ui.truncated?.masks!==true&&s.ui.truncated?.dialogs!==true
    &&s.ui.masks.every(mask=>mask.kind==='busy'&&mask.target_tid===prefix+';FileStorageForm'&&mask.dialog_ref===null);
   trace.push({event:'artifact_directory_settlement',attempt,busy_same_owner:busy,...contextEvidence(observed)});
   if(!busy)return observed;
   await waitReady(page,task,deadline,trace);
  }
  throw Error('DISCOVERY_DIRECTORY_SETTLEMENT_LIMIT');
 };
 let refreshes=0;
 const refreshDirectory=async()=>{
  const before=await settledDirectory();
  trace.push({event:'artifact_refresh_preconditions',...contextEvidence(before)});
  if(before.status!=='SUCCEEDED'||!context(before.output)){
   trace.push({event:'artifact_refresh_refused',reason:'directory_context'});return false;
  }
  const tid=before.output.workflow_ref.prefix+';FileStorageForm;btnRefresh';
  const control=page.locator('[data-tid='+JSON.stringify(tid)+']');
  const count=await control.count(),visible=count===1&&await control.isVisible(),enabled=count===1&&await control.isEnabled();
  trace.push({event:'artifact_refresh_control',tid,count,visible,enabled});
  if(count!==1||!visible||!enabled){trace.push({event:'artifact_refresh_refused',reason:'control_unavailable'});return false;}
  await waitReady(page,task,deadline,trace,null,async checkNative=>{
   for(let attempt=0;attempt<16;attempt++){
    const checked=await settledDirectory();
    trace.push({event:'artifact_refresh_dispatch_preconditions',attempt,...contextEvidence(checked)});
    if(checked.status!=='SUCCEEDED'||!context(checked.output))throw Error('DISCOVERY_REFRESH_CONTEXT_CHANGED');
    if(Date.now()>=deadline)throw Error('DISCOVERY_DIRECTORY_SETTLEMENT_DEADLINE');
    if(await control.count()!==1||!await control.isVisible()||!await control.isEnabled())throw Error('DISCOVERY_REFRESH_CONTROL_CHANGED');
    if(await checkNative()===false)continue;
    if(Date.now()>=deadline)throw Error('DISCOVERY_DIRECTORY_SETTLEMENT_DEADLINE');
    uncertain=true;
    await control.click({timeout:Math.max(1,Math.min(10000,deadline-Date.now()))});
    return;
   }
   throw Error('DISCOVERY_REFRESH_PREFLIGHT_LIMIT');
  });
  moved=true;
  const after=await settledDirectory();
  uncertain=false;
  if(after.status!=='SUCCEEDED'||!context(after.output)){
   trace.push({event:'artifact_refresh_refused',reason:'directory_after_refresh',...contextEvidence(after)});return false;
  }
  refreshes++;
  trace.push({event:'artifact_directory_refreshed',attempt:refreshes});
  return true;
 };
 try {
  let reset=false;
  for(let step=0;step<96&&Date.now()<deadline;step++) {
   const readiness=await waitReady(page,task,deadline,trace);
   const directory=await settledDirectory();
   if(directory.status!=='SUCCEEDED'||!context(directory.output))return result('DISCOVERY_DIRECTORY_CHANGED');
   const roots=await ui(page,{...base,mode:'observe',discover_roots:true,storage_name:task.artifact.name});
   if(roots.status!=='SUCCEEDED'||!same(roots.output.workflow_ref,task.snapshot.workflow_ref))return result('DISCOVERY_CONTEXT_CHANGED');
   const matches=roots.output.ui.elements.filter(e=>e.tid===tid);
   if(matches.length>1)return result('DISCOVERY_FILE_AMBIGUOUS');
   if(matches.length===1) {
    const ref=matches[0].ref;let observed=await ui(page,{...base,mode:'observe',root_ref:ref});
    if(observed.status!=='SUCCEEDED'||!context(observed.output))return result('DISCOVERY_FILE_CONTEXT_CHANGED');
    let files=observed.output.ui.elements.filter(e=>e.ref===ref&&e.tid===tid&&e.label===task.artifact.name);
    if(files.length!==1)return result('DISCOVERY_FILE_IDENTITY_CHANGED');
    // Loginom can publish a file row before its asynchronous server upload has
    // committed the bytes. The rendered row is cached, so passive observation
    // never updates it on Windows. Refresh the already verified directory and
    // rediscover the row; never download or resubmit while its size differs.
    if(files[0].storage_entry?.bytes!==task.artifact.bytes) {
     trace.push({event:'artifact_file_size_pending',observed_bytes:files[0].storage_entry?.bytes??null,expected_bytes:task.artifact.bytes});
     if(refreshes>=20||!await refreshDirectory())return result('DISCOVERY_FILE_SIZE_CHANGED');
     continue;
    }
    trace.push({event:'artifact_file_size_verified',bytes:task.artifact.bytes});
    trace.push({event:'artifact_file_discovered',file_ref:ref,file_tid:tid,directory:task.artifact.upload.directory,scrolls:trace.length,document:observed.output.dom_epoch.document,workflow_ref:observed.output.workflow_ref,active_tab_ref:observed.output.active_tab_ref});
    const read=p=>ui(p,{...base,mode:'observe',root_ref:ref});
    const act=(p,snapshot)=>ui(p,{...base,mode:'act',snapshot,action:{verb:'double_click',ref}});
    uncertain=true;const outcome=await download(page,{...task,file_ref:ref,snapshot:observed.output},read,act,reveal);
    uncertain=false;return {...outcome,status:moved&&outcome.status==='NOT_APPLIED'?'AMBIGUOUS':outcome.status,
      effect_possible:moved||outcome.effect_possible,trace:[...trace,...outcome.trace]};
   }
   if(readiness.empty_native_store){
    trace.push({event:'artifact_empty_directory_pending',load_count:readiness.load_count});
    if(refreshes>=20||!await refreshDirectory())return result('DISCOVERY_EMPTY_DIRECTORY_UNCONFIRMED');
    continue;
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
 } catch(error) {trace.push({event:'artifact_discovery_error',message:String(error.message).slice(0,240)});return result('DISCOVERY_BROWSER_UNCERTAIN');}
 finally {if(owner)try{await owner.dispose();}catch{}}
}

export function makeArtifactDiscoveryDownloadCode(options,{download,reveal}) {
 if(!options?.artifact?.upload||!options.snapshot?.observation_root?.ref||options.snapshot.file_storage?.status!=='observed'
   ||options.snapshot.file_storage.directory!==options.artifact.upload.directory||!/^MF;TF(?:-\d+)?$/.test(options.snapshot.workflow_ref?.prefix)
   ||!(/\.(csv|tsv|txt|xlsx)$/i.test(options.artifact.name)))throw Error('Discovery requires the exact observed authorized storage');
 return `async page=>(${discoverArtifactAndDownload.toString()})(page,${JSON.stringify(options)},${workspaceUiCapability.toString()},${download.toString()},${reveal.toString()},${waitArtifactDiscoveryReady.toString()})`;
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

// Private native upload lifecycle. Only reads Loginom objects; all mutations
// below are Playwright gestures on the observed data-tid of the owned control.
// The binding holds original object identities across short MCP calls.
export async function largeUploadNative(page, task) {
 const read=await page.evaluate(t=>{
  const fail=()=>{throw Error('LOGINOM_UPLOAD_UNCERTAIN');};
  const key=Symbol.for('loginom-dock.large-upload.v1');
  const jobs=globalThis[key]??(globalThis[key]=new Map());
  const prep=globalThis.__loginomDockPreparationV1,main=globalThis.bg?.app?.Application?.FInstance?.FMainForm;
  const card=main?.Items?.Workspace?.getActiveTab?.(),form=card?.Controller?.FController,sender=form?.FFileSenderManager;
  const prefix=t.snapshot.workflow_ref.prefix,gridTid=prefix+';FileStorageForm;pnlFileStorage;tbl';
  const all=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const grid=all(gridTid),tab=all(t.snapshot.workflow_ref.tab_tid),component=grid[0]&&globalThis.Ext?.getCmp?.(grid[0].id),store=component?.getStore?.();
  if(location.origin!==t.expected_origin||bg?.app?.Version!==t.expected_build||prep?.document!==document
    ||prep.id!==t.binding.document_id||main.FMapTree?.FServerConnection?.UserName!==t.binding.loginom_account
    ||grid.length!==1||tab.length!==1||!tab[0].classList.contains('x-tab-active')
    ||form?.constructor?.name!=='FileStorageForm'||sender?.constructor?.name!=='FileSenderManager'
    ||sender.CurrentDirectory!==t.artifact.upload.directory+'/'||component.el?.dom!==grid[0]
    ||!form.FView?.el?.dom?.contains(grid[0])||store?.$className!=='bg.filedialog.FileStore'||store.isBufferedStore)fail();
  const visible=e=>e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0
    &&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
  const inventory=()=>{
   if(store.isLoading?.()!==false)fail();
   const records=store.getRange?.(),data=store.getData?.(),source=data?.getSource?.()?.items;
   if(!Array.isArray(records)||records.length>10000||store.getCount()!==records.length||store.getTotalCount()!==records.length
     ||!Array.isArray(data?.items)||data.items.length!==records.length||data.items.some(r=>!records.includes(r))
     ||source&&(!Array.isArray(source)||source.length!==records.length||source.some(r=>!records.includes(r))))fail();
   return records.map(r=>({Type:r.data.Type,FileName:r.data.FileName,FilePath:r.data.FilePath,id:r.data.id,Size:r.data.Size,Time:r.data.Time instanceof Date?r.data.Time.toISOString():r.data.Time}));
  };
  const matches=r=>r.FileName===t.artifact.name||r.FilePath===t.artifact.upload.destination||r.id===t.artifact.upload.destination;
  const exact=r=>r.Type===0&&r.FileName===t.artifact.name&&r.FilePath===t.artifact.upload.destination&&r.id===t.artifact.upload.destination
    &&Number.isSafeInteger(r.Size)&&r.Size===t.artifact.bytes;
  if(t.mode==='bind'){
   if(jobs.has(t.operation_id))fail();
   if([...document.querySelectorAll('.x-message-box')].some(visible))fail();
   if(!form.FFileInput?.isConnected||form.FFileInput.files.length||sender.FActiveLoadersCount!==0
     ||sender.FLastConflictResult!==undefined||Object.keys(sender.FCurrentUploadFilePaths??{}).length)fail();
   const before=inventory(),existing=before.filter(matches);
   // Same size/name is never proof of local origin. The receipt comes only
   // from this runtime's acknowledged private completion journal.
   const reused=existing.length===1&&exact(existing[0])&&typeof t.artifact.sha256==='string'&&t.receipt
     &&t.receipt.sha256===t.artifact.sha256&&t.receipt.account===t.binding.loginom_account&&t.receipt.origin===t.expected_origin
     &&t.receipt.directory===t.artifact.upload.directory&&JSON.stringify(t.receipt.row)===JSON.stringify(existing[0]);
   if(existing.length&&!reused)throw Error('UPLOAD_PATH_CONFLICT');
   jobs.set(t.operation_id,{document,prep,main,card,controller:card.Controller,form,sender,input:form.FFileInput,grid:grid[0],tab:tab[0],component,store,before,
    loadCount:store.loadCount,artifact:JSON.stringify(t.artifact),reused,cancelClicked:false,
    errorInfo:globalThis.bg?.ext?.errormessage?.ErrorMsg?.FInstance?.FErrorMessageInfo});
   return {active:0,bytes:reused?t.artifact.bytes:0,reused:!!reused,row:reused?existing[0]:null};
  }
  const b=jobs.get(t.operation_id);
  if(!b||document!==b.document||prep!==b.prep||main!==b.main||card!==b.card||card.Controller!==b.controller||form!==b.form||sender!==b.sender
    ||form.FFileInput!==b.input||grid[0]!==b.grid||tab[0]!==b.tab||component!==b.component||store!==b.store||JSON.stringify(t.artifact)!==b.artifact)fail();
  const paths=Object.keys(sender.FCurrentUploadFilePaths??{});
  if(paths.some(p=>p!==t.artifact.upload.destination)||![0,1].includes(sender.FActiveLoadersCount))fail();
  const loaders=sender.FUploadViewController?.FFileLoaders??[];
  if(!Array.isArray(loaders)||loaders.length>1||loaders.some(l=>l.FullFilename!==t.artifact.upload.destination||l.File?.size!==t.artifact.bytes))fail();
  const loader=loaders[0];
  if(loader){if(b.loader&&b.loader!==loader)fail();b.loader=loader;}
  const bytes=loader?.FStart??b.loader?.FStart??0;
  if(!Number.isSafeInteger(bytes)||bytes<0||bytes>t.artifact.bytes)fail();
  const errors=[...document.querySelectorAll('.bg-error-messages')].filter(visible).concat([...document.querySelectorAll('[data-tid$=";p.h;p.t"]')].filter(e=>/^msgbox(?:-\d+)?;p\.h;p\.t$/.test(e.getAttribute('data-tid')??'')&&visible(e)));
  const quiet=sender.FActiveLoadersCount===0&&paths.length===0&&b.input.files?.length===0&&sender.FLastConflictResult===undefined;
  const gesture=(tid,kind)=>{const elements=all(tid);if(elements.length!==1)fail();b.gesture={tid,element:elements[0]};return {tid,kind};};
  if(t.mode==='poll')return {active:sender.FActiveLoadersCount,bytes,quiet,error:errors.length>0};
  if(t.mode==='cancel'&&quiet){
   // OnDispose decrements active before the awaited DeleteFile and OnLoadEnd
   // refresh finish. active=0 alone cannot authorize the next refresh.
   if((t.source_changed===true&&b.loader?.IsDisposed===true&&b.loader.FFileDeleted!==true)
     ||store.isLoading?.()!==false)return {active:0,bytes,quiet:false,waiting:true};
   const dialogs=[...document.querySelectorAll('.x-message-box')].filter(visible);
   if(dialogs.length){
    // FileReader errors first Dispose/delete the owned uploader, then open a
    // native ErrorMsg. It covers Refresh even after sender active reaches zero.
    // Acknowledge only a new error of this metadata-changed, deleted source.
    const instance=globalThis.bg?.ext?.errormessage?.ErrorMsg?.FInstance;
    const root=dialogs[0],message=instance?.FMessageBox,body=instance?.FMessages?.el?.dom;
    const text=body?.textContent?.trim(),tid=root?.getAttribute('data-tid');
    if(t.source_changed!==true||dialogs.length!==1||b.loader?.IsDisposed!==true||b.loader.FFileDeleted!==true
      ||instance?.FErrorMessageInfo===b.errorInfo||message?.el?.dom!==root||globalThis.Ext?.getCmp?.(root.id)!==message
      ||!body||!root.contains(body)||!visible(body)||!/^Ошибка загрузки файла(?:: [^\r\n]{1,512})?$/.test(text??'')
      ||!/^msgbox(?:-\d+)?$/.test(tid??''))fail();
    if(b.errorAck){
     if(b.errorAck.root!==root||b.errorAck.info!==instance.FErrorMessageInfo||b.errorAck.text!==text)fail();
     return {active:0,bytes,quiet:false,waiting:true};
    }
    const buttons=[...document.querySelectorAll('[data-tid^='+JSON.stringify(tid+';tlb;')+']')]
      .filter(e=>visible(e)&&/;(ok|yes|no|cancel)$/.test(e.getAttribute('data-tid')??''));
    const ok=all(tid+';tlb;ok'),control=ok[0]&&globalThis.Ext?.getCmp?.(ok[0].id);
    if(ok.length!==1||buttons.length!==1||buttons[0]!==ok[0]||!root.contains(ok[0])||!visible(ok[0])
      ||ok[0].innerText?.trim()!=='OK'||control?.el?.dom!==ok[0]||control.disabled!==false)fail();
    let parent=control;const seen=new Set();
    for(let i=0;parent&&parent!==message&&i<16&&!seen.has(parent);i++){seen.add(parent);parent=parent.ownerCt;}
    if(parent!==message)fail();
    b.errorAck={root,body,instance,message,info:instance.FErrorMessageInfo,text};
    return {active:0,bytes,quiet:false,server_delete_confirmed:true,gesture:gesture(tid+';tlb;ok','acknowledge_source_error')};
   }
   return {active:0,bytes,quiet:true};
  }
  if(t.mode==='cancel'&&!quiet){
   if(b.cancelClicked)return {active:sender.FActiveLoadersCount,bytes,quiet:false};
   if(loader?.IsDisposed===true)return {active:sender.FActiveLoadersCount,bytes,quiet:false,waiting:true};
   if(!loader?.Container?.el?.dom?.isConnected)return {active:sender.FActiveLoadersCount,bytes,quiet:false};
   const container=loader.Container,items=container.items?.items,button=items?.[3],el=button?.el?.dom,tid=el?.getAttribute('data-tid');
   if(!Array.isArray(items)||items.length!==4||!container.el.dom.contains(el)
      ||!el.querySelector('.bg-icon-cancel-negative'))fail();
   // FileReader failure can dispose this exact loader while cancellation is
   // being captured. Without a data-tid, wait only; never select a substitute.
   if(!tid||!visible(el)||button.disabled)return {active:sender.FActiveLoadersCount,bytes,quiet:false,waiting:true};
   if(all(tid).length!==1)fail();
   b.cancelClicked=true;return {active:sender.FActiveLoadersCount,bytes,quiet:false,gesture:gesture(tid,'cancel')};
  }
  if(!quiet)fail();
  if(t.mode==='refresh'){
   const tid=prefix+';FileStorageForm;btnRefresh',els=all(tid);
   if(els.length!==1||!visible(els[0]))fail();b.refreshCount=store.loadCount;
   return {gesture:gesture(tid,'refresh')};
  }
  if(t.mode==='verify'){
   if(errors.length||!Number.isSafeInteger(store.loadCount))fail();
   if(store.isLoading?.()!==false||store.loadCount<=b.loadCount)return {waiting:true};
   const rows=inventory().filter(matches);if(rows.length!==1||!exact(rows[0]))return {waiting:true};
   return {active:0,bytes:rows[0].Size,quiet:true,row:rows[0],reused:b.reused};
  }
  if(t.mode==='cleanup'){
   if(store.isLoading?.()!==false||!Number.isSafeInteger(b.refreshCount)||!Number.isSafeInteger(store.loadCount)||store.loadCount<=b.refreshCount)return {clean:false,waiting:true};
   const rows=inventory(),own=rows.filter(matches),others=rows.filter(r=>!matches(r));
   const order=a=>a.map(r=>JSON.stringify(r)).sort();
   // Cleanup must restore the complete original inventory, including metadata.
   if(JSON.stringify(order(others))!==JSON.stringify(order(b.before))||b.reused)fail();
   if(own.length===0)return {clean:true};
   if(own.length!==1||own[0].Type!==0||own[0].FilePath!==t.artifact.upload.destination||own[0].FileName!==t.artifact.name||own[0].id!==t.artifact.upload.destination)fail();
   if(b.deleteClicked)fail();
   const tid=prefix+';FileStorageForm;colName_'+t.artifact.name.replace(/\s/g,'_').replace(/,/g,''),els=all(tid);
   if(els.length!==1||!visible(els[0])||!b.grid.contains(els[0]))fail();
   return {clean:false,gesture:gesture(tid,'select')};
  }
  if(t.mode==='delete'){
   const selected=component.getSelectionModel?.().getSelection?.();
   if(!Array.isArray(selected)||selected.length!==1||!matches(selected[0].data)||selected[0].data.Type!==0||b.deleteClicked)fail();
   const tid=prefix+';FileStorageForm;btnDelete',els=all(tid);if(els.length!==1||!visible(els[0]))fail();
   b.deleteClicked=true;return {gesture:gesture(tid,'delete')};
  }
  if(t.mode==='confirm_delete'){
   if(!b.deleteClicked||b.confirmClicked)fail();
   const messages=[...document.querySelectorAll('[data-tid$=";cnt;cnt;cmp"]')].filter(visible);
   if(messages.length!==1||messages[0].textContent.trim()!=='Вы действительно хотите удалить выделенное?')fail();
   const root=messages[0].getAttribute('data-tid').slice(0,-12),tid=root+';tlb;yes',els=all(tid);
   if(els.length!==1||!visible(els[0])||els[0].textContent.trim()!=='Удалить')fail();
   b.confirmClicked=true;return {gesture:gesture(tid,'confirm_delete')};
  }
  fail();
 },task);
 if(read.gesture){
  const target=page.locator('[data-tid='+JSON.stringify(read.gesture.tid)+']');
  if(await target.count()!==1||!await target.isVisible()||!await target.isEnabled()){
   if(read.gesture.kind==='cancel')return {...read,gesture:undefined,quiet:false,waiting:true};
   throw Error('LOGINOM_UPLOAD_UNCERTAIN');
  }
  const handle=await target.elementHandle();
  try{
   if(!handle||!await handle.evaluate((el,t)=>{const b=globalThis[Symbol.for('loginom-dock.large-upload.v1')]?.get(t.id);const form=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
    if(t.kind==='acknowledge_source_error'){
     const e=b?.errorAck,instance=globalThis.bg?.ext?.errormessage?.ErrorMsg?.FInstance;
     if(!e||instance!==e.instance||instance.FMessageBox!==e.message||instance.FErrorMessageInfo!==e.info
       ||instance.FMessages?.el?.dom!==e.body||e.message.el?.dom!==e.root||!e.root.contains(el)
       ||e.body.textContent?.trim()!==e.text||b.loader?.IsDisposed!==true||b.loader.FFileDeleted!==true
       ||b.sender.FActiveLoadersCount!==0||Object.keys(b.sender.FCurrentUploadFilePaths??{}).length||b.input.files?.length)return false;
    }
    return b&&document===b.document&&form===b.form&&form.FFileSenderManager===b.sender&&form.FFileInput===b.input&&b.gesture?.element===el&&b.gesture.tid===t.tid&&el.isConnected&&el.getAttribute('data-tid')===t.tid;},{id:task.operation_id,tid:read.gesture.tid,kind:read.gesture.kind})){
    if(read.gesture.kind==='cancel')return {...read,gesture:undefined,quiet:false,waiting:true};
    throw Error('LOGINOM_UPLOAD_UNCERTAIN');
   }
   await handle.click({timeout:Math.max(1,Math.min(5000,task.deadline_at-Date.now()))});
  }finally{await handle?.dispose();}
 }
 return read;
}

export function makeLargeUploadCode(task) {
 return `async page=>{const task=${JSON.stringify(task)};try{const output=await (${largeUploadNative.toString()})(page,task);return {status:'SUCCEEDED',action_key:'artifact.large.native',action_revision:'1',operation_id:task.operation_id,phase:task.mode,effect_possible:!!output.gesture,cleanup_complete:true,output,error:null,trace:[]};}catch(error){const code=/^[A-Z][A-Z0-9_]{1,100}$/.test(error.message)?error.message:'LARGE_UPLOAD_NATIVE_REFUSED';return {status:'FAILED',action_key:'artifact.large.native',action_revision:'1',operation_id:task.operation_id,phase:task.mode,effect_possible:!['bind','poll','verify'].includes(task.mode),cleanup_complete:false,output:{},error:{code,message:code},trace:[]};}}`;
}
