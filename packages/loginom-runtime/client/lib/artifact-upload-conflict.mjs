// Private, serialized continuation of an admitted upload. No file submission,
// native RPC, or implicit choice for all files occurs in this operation.
export async function resolveArtifactUploadConflict(page,task) {
 const trace=[];let gesture=false,handle;
 const result=(status,code,output={},cleanup=!gesture)=>({status,action_key:'artifact.upload.conflict',action_revision:'1',
  operation_id:task.operation_id,phase:gesture?'decision':'preconditions',effect_possible:gesture,cleanup_complete:cleanup,
  output,error:code?{code,message:code}:null,trace});
 try {
  if(!['reject','replace'].includes(task.overwrite))return result('NOT_APPLIED','UPLOAD_CONFLICT_POLICY');
  const buttonTid='msgbox;tlb;'+(task.overwrite==='reject'?'no':'yes');
  const button=page.locator('[data-tid='+JSON.stringify(buttonTid)+']');
  if(await button.count()!==1||!await button.isVisible()||!await button.isEnabled())return result('NOT_APPLIED','UPLOAD_CONFLICT_BUTTON');
  handle=await button.elementHandle();
  const check=await handle.evaluate((element,task)=>{
   const state=globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')];
   const tab=bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
   const form=tab?.Controller?.FController,sender=form?.FFileSenderManager,input=form?.FFileInput;
   const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&r.x>=0&&r.y>=0&&s.display!=='none'&&s.visibility!=='hidden';};
   const windows=[...document.querySelectorAll('.x-window')].filter(visible),window=windows[0];
   const one=tid=>{const es=[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];return es.length===1?es[0]:null;};
   if(location.origin!==task.expected_origin||bg?.app?.Version!==task.expected_build||state?.epoch!==task.document
     ||form?.constructor?.name!=='FileStorageForm'||sender?.constructor?.name!=='FileSenderManager'
     ||form.FView?.el?.dom?.getAttribute('data-tid')!==task.prefix+';FileStorageForm'
     ||!input?.isConnected||input.files?.length!==1||input.files[0].name!==task.name||input.files[0].size!==task.bytes
     ||sender.CurrentDirectory!==task.directory.replace(/\/?$/,'/')||sender.FActiveLoadersCount!==0||sender.FLastConflictResult!==undefined
     ||Object.keys(sender.FCurrentUploadFilePaths??{}).length!==0)return {ok:false,code:'UPLOAD_CONFLICT_OWNER'};
   const title=one('msgbox;p.h;p.t'),message=one('msgbox;cnt;cnt;cmp'),check=one('msgbox;tlb;chb;InputEl');
   if(windows.length!==1||!window.contains(element)||!element.isConnected||!visible(element)||element.getAttribute('aria-disabled')==='true'
     ||!title||!message||!check||![title,message,check].every(e=>window.contains(e))
     ||title.textContent.trim()!=='Конфликт файлов с одинаковыми именами'||check.checked||check.indeterminate
     ||!message.textContent.startsWith('Файл с таким же именем уже существует в этом расположении:"'+task.destination+'".')
     ||element.textContent.trim()!==(task.overwrite==='reject'?'Пропустить':'Заменить'))return {ok:false,code:'UPLOAD_CONFLICT_DIALOG'};
   const r=element.getBoundingClientRect(),point={x:r.x+r.width/2,y:r.y+r.height/2},hit=document.elementFromPoint(point.x,point.y);
   if(!hit||!(hit===element||element.contains(hit)))return {ok:false,code:'UPLOAD_CONFLICT_OBSCURED'};
   return {ok:true,point};
  },task);
  if(!check.ok)return result('NOT_APPLIED',check.code);
  trace.push({event:'upload_conflict_bound',destination:task.destination,policy:task.overwrite,button_tid:buttonTid});
  // The original handle is retained through the gesture; no locator reacquisition.
  gesture=true;await handle.click({timeout:5000});
  trace.push({event:'upload_conflict_decision_clicked',policy:task.overwrite});
  const deadline=Date.now()+10000;
  while(Date.now()<deadline) {
   const settled=await page.evaluate(task=>{
    const state=globalThis[Symbol.for('loginom-dock.workspace-ui.identity.v1')];
    const f=bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
    const s=f?.FFileSenderManager;
    return state?.epoch===task.document&&location.origin===task.expected_origin
      &&f?.constructor?.name==='FileStorageForm'&&s?.CurrentDirectory===task.directory.replace(/\/?$/,'/')
      &&f.FView?.el?.dom?.getAttribute('data-tid')===task.prefix+';FileStorageForm'
      &&f.FFileInput?.files?.length===0&&s.FLastConflictResult===undefined&&s.FActiveLoadersCount===0
      &&![...document.querySelectorAll('.x-window')].some(e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.width>0&&r.height>0;});
   },task);
   if(settled)return result('SUCCEEDED',null,{conflict_resolved:true,disposition:task.overwrite==='reject'?'rejected':'replace',destination:task.destination,upload_completion_verified:false},true);
   await page.waitForTimeout(100);
  }
  return result('AMBIGUOUS','UPLOAD_CONFLICT_SETTLEMENT_UNKNOWN');
 }catch{return result(gesture?'AMBIGUOUS':'NOT_APPLIED','UPLOAD_CONFLICT_BROWSER_UNCERTAIN');}
 finally {if(handle)try{await handle.dispose();}catch{}}
}
