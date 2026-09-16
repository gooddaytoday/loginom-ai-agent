// Contract 2: narrow, closed host policy. No caller-supplied JavaScript.
export const REVISION='node17-reject-read-observer.2-unadmitted';
export const NATIVE_SMOKE_ADMITTED=false;
export const need=(v,m)=>{if(!v)throw Error(m);};
export const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Only this proven pre-gesture refusal permits a new return observation.
export const safeReturnRefusal=r=>r?.status==='NOT_APPLIED'&&r.phase==='preconditions'
 &&r.error?.code==='UI_EPOCH_CHANGED'&&r.effect_possible===false&&r.cleanup_complete===true
 &&Array.isArray(r.trace)&&!r.trace.some(e=>['ui_preconditions_verified','ui_gesture_applied'].includes(e.event));
export const returnBinding=(s,e)=>({document:s.dom_epoch?.document,workflow:s.workflow_ref,
 active_identity:s.active_identity,package:s.package_identity,target:{tid:e.tid,label:e.label,kind:e.kind,scope:e.scope}});
export function checkStep(step,c){
 const kinds=['graph','roots','root','row','files','home','folder','download','return','search_scroll'];
 need(step&&kinds.includes(step.kind),'Unregistered observer action');
 const path=c.baseline.destination,name=path.split('/').at(-1),directory=path.slice(0,-name.length-1);
 need(/^\/test-2\/[A-Za-z0-9_.-]+\.(csv|tsv)$/.test(path),'Exact flat test-2 export required');
 if(['graph','roots'].includes(step.kind))need(Object.keys(step).length===1,'Unexpected observation arguments');
 if(step.kind==='row')need([name,'test-2'].includes(step.name)&&Object.keys(step).length===2,'Foreign row');
 if(step.kind==='root')need(typeof step.ref==='string'&&Object.keys(step).length===2,'Unknown root');
 if(step.kind==='search_scroll'){
  const s=step.snapshot,e=step.element;
  need(s?.authenticated===true&&s.origin===c.origin&&s.loginom_build==='7.4.2'&&!s.ui?.dialogs?.length&&!s.ui?.masks?.length,'Search owner blocked');
  need(Object.keys(step).sort().join(',')==='delta_y,element,kind,name,snapshot'&&step.name===name,'Foreign search');
  need(s.file_storage?.directory===directory&&s.observation_root?.identity?.anchor_tid===s.workflow_ref.prefix+';FileStorageForm;pnlFileStorage;tbl','Search table owner differs');
  need(s.ui.elements.filter(x=>same(x,e)).length===1&&e.tid?.startsWith(s.workflow_ref.prefix+';FileStorageForm;colName_')&&e.allowed_actions?.includes('scroll')&&e.interaction?.state==='point_observed','Unissued scroll anchor');
  need(e.scroll?.ref===s.observation_root.ref&&Number.isSafeInteger(e.scroll.top)&&Number.isSafeInteger(e.scroll.max_top)&&e.scroll.top>=0&&e.scroll.max_top>=e.scroll.top,'Unknown scroll owner');
  need(Number.isInteger(step.delta_y)&&step.delta_y!==0&&Math.abs(step.delta_y)<=1000,'Search scroll budget');
 }
 if(['files','home','folder','return','download'].includes(step.kind)){
  const s=step.snapshot,e=step.element;
  need(s?.authenticated===true&&s.origin===c.origin&&s.loginom_build==='7.4.2'&&!s.ui?.dialogs?.length&&!s.ui?.masks?.length,'Observer owner blocked');
  need(s.ui.elements.filter(x=>same(x,e)).length===1,'Unissued observer element');
  const prefix=s.workflow_ref?.prefix;
  const tid=step.kind==='files'?'MF;cntMain;tlbMainToolbar;btnFilestorage':step.kind==='home'?prefix+';cnrNaviMode;b.s_Сервер>Файлы':step.kind==='return'?c.workflow_ref.tab_tid:prefix+';FileStorageForm;colName_'+(step.kind==='folder'?'test-2':name);
  need(e.tid===tid,'Forbidden observer gesture');
  const verb=['folder','download'].includes(step.kind)?'double_click':'click';need(e.allowed_actions?.includes(verb),'Observer action unavailable');
  if(step.kind==='folder')need(s.file_storage?.directory==='/'&&e.storage_entry?.kind==='folder'&&e.label==='test-2','Foreign directory navigation');
  if(step.kind==='download'){
   need(s.file_storage?.directory===directory&&e.label===name&&e.storage_entry?.bytes===c.baseline.bytes,'Exact bound file required');
   if(e.interaction?.state==='point_observed')need(step.reveal===undefined,'Unexpected file reveal');
   else {
    need(e.interaction?.state==='outside_viewport'&&e.scroll?.ref&&Number.isSafeInteger(e.scroll.top)&&Number.isSafeInteger(e.scroll.max_top)&&e.scroll.top>=0&&e.scroll.max_top>=e.scroll.top,'Bound vertical file scroll unavailable');
    need(same(step.reveal,{file_ref:e.ref,owner_ref:e.scroll.ref,from:e.scroll.top,max_top:e.scroll.max_top,limit:1000}),'Explicit bounded file reveal required');
   }
  }
 }
 return true;
}
export function checkDownloadReveal(step,r){
 const trace=r.trace??[],names=trace.map(e=>e.event),s=step.snapshot,e=step.element;
 if(!step.reveal){need(!names.includes('download_file_revealed')&&!names.includes('download_reveal_confirmed'),'Unrequested reveal');return;}
 need(same(names,['download_file_revealed','download_reveal_confirmed','download_gesture_result']),'Incomplete reveal proof');
 const [m,c,g]=trace,b=step.reveal;
 need(m.applied===true&&m.file_ref===b.file_ref&&m.owner_ref===b.owner_ref&&m.from===b.from&&m.max_top===b.max_top&&m.document===s.dom_epoch.document
  &&Number.isInteger(m.delta)&&Math.abs(m.delta)>0&&Math.abs(m.delta)<=b.limit&&m.to===m.from+m.delta&&m.to>=0&&m.to<=m.max_top,'Reveal movement differs');
 need(c.file_ref===e.ref&&c.owner_ref===b.owner_ref&&c.document===s.dom_epoch.document&&c.interaction==='point_observed'&&c.file_tid===e.tid
  &&c.origin.replace(/\/$/,'')===s.origin.replace(/\/$/,'')&&c.loginom_build===s.loginom_build&&same(c.workflow_ref,s.workflow_ref)
  &&c.active_tab_ref===s.active_tab_ref&&same(c.package_identity,s.package_identity)&&c.directory===s.file_storage.directory
  &&c.max_top_before===m.max_top&&Number.isSafeInteger(c.max_top_after)&&c.max_top_after>=m.to&&Math.abs(c.max_top_after-m.max_top)<=1,'Reveal owner/readback differs');
 need(g.status==='SUCCEEDED'&&g.effect_possible===true&&g.cleanup_complete===true&&g.error_code===null,'Reveal download gesture incomplete');
}
export function checkSearchScroll(step,r){
 if(safeReturnRefusal(r))return;
 need(r.status==='SUCCEEDED'&&r.cleanup_complete===true&&r.output?.gesture_applied===true,'Search gesture incomplete');
 const moves=(r.trace??[]).filter(e=>e.event==='ui_scroll_applied'),b=step.element.scroll;
 need(moves.length===1&&moves[0].owner_ref===b.ref&&moves[0].from===b.top&&moves[0].to===Math.max(0,Math.min(b.max_top,b.top+step.delta_y))&&moves[0].to!==b.top,'Search scroll proof differs');
 need(same(r.output.workflow_ref,step.snapshot.workflow_ref)&&r.output.file_storage?.directory===step.snapshot.file_storage.directory&&r.output.dom_epoch?.document===step.snapshot.dom_epoch.document,'Search post-owner differs');
}
export function checkActionLedger(ledger,c){
 need(Array.isArray(ledger)&&ledger.length>=6&&ledger.length<=512,'Incomplete action ledger');
 for(const [i,e] of ledger.entries()){
  need(e.seq===i+1&&e.session_id===c.session_id&&e.run_id===c.run_id&&e.cleanup_complete===true&&e.mono_end>=e.mono_start&&(i===0||e.mono_start>=ledger[i-1].mono_end),'Action chain differs');
  checkStep(e.step,c);if(e.step.kind==='search_scroll')checkSearchScroll(e.step,e.response);if(e.step.kind==='download')checkDownloadReveal(e.step,e.response);need(/^[a-f0-9]{64}$/.test(e.code_sha256)&&e.response!==undefined,'Raw browser evidence missing');
 }
 need(ledger[0].step.kind==='graph'&&ledger.at(-1).step.kind==='graph','Graph observations required');
 for(const kind of ['download','files'])need(ledger.filter(e=>e.step.kind===kind).length===1,'Exactly one '+kind+' required');
 const returns=ledger.filter(e=>e.step.kind==='return');need(returns.length>=1&&returns.length<=3&&returns.at(-1).response.status==='SUCCEEDED','One completed return required');
 need(returns.slice(0,-1).every(e=>safeReturnRefusal(e.response)),'Unsafe return retry');
 need(returns.every(e=>same(returnBinding(e.step.snapshot,e.step.element),returnBinding(returns[0].step.snapshot,returns[0].step.element))),'Return target changed');
 const search=ledger.filter(e=>e.step.kind==='search_scroll');need(search.length<=36&&search.filter(e=>e.response.status==='SUCCEEDED').length<=12,'Search gesture count exceeded');
 const d=ledger.findIndex(e=>e.step.kind==='download'),r=ledger.findLastIndex(e=>e.step.kind==='return');need(d>0&&r>d&&r<ledger.length-1,'Return/download order differs');
 need(!ledger.slice(d+1).some(e=>['files','folder','home','download','search_scroll'].includes(e.step.kind)),'Navigation after download differs');
 return true;
}
