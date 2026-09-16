// Diagnostic-only download of an existing CSV. No upload or receipt injection.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {makeArtifactDownloadCode} from '../../client/lib/executor.mjs';
const one=(xs,message)=>{if(xs.length!==1)throw Error(message);return xs[0];};
export async function downloadSavedSource(ctx,{operationId,sourcePath,bytes,sha256}) {
 if(!/^\/test-3\/[^/]+\.csv$/.test(sourcePath)||!Number.isSafeInteger(bytes)||!/^[a-f0-9]{64}$/.test(sha256))throw Error('Exact diagnostic source required');
 const name=path.posix.basename(sourcePath),directory='/test-3';let step=0;
 const observe=async options=>{
  const r=await ctx.rawRuntime.observe(options);if(r.status!=='SUCCEEDED')throw Error('Source observation failed');
  const s=structuredClone(r.output);let cursor=s.page?.next_cursor;
  for(let page=0;cursor;page++){
   if(page>=32)throw Error('Source observation page limit');
   const next=await ctx.rawRuntime.observe({cursor});if(next.status!=='SUCCEEDED'||next.output.observation_id!==s.observation_id)throw Error('Source observation changed');
   for(const k of ['elements','dialogs','masks'])s.ui[k].push(...next.output.ui[k]);cursor=next.output.page?.next_cursor;
  }return s;
 };
 const roots=()=>observe({scope:'roots'}),detail=(s,e)=>observe({rootRef:e.ref,observationId:s.observation_id});
 const click=async(s,e,verb='click')=>{
  if(!e.allowed_actions.includes(verb))throw Error('Source navigation unavailable');
  const r=await ctx.rawRuntime.uiAct({verb,ref:e.ref},{operationId:operationId+':nav'+(++step),observationId:s.observation_id});
  if(r.status!=='SUCCEEDED'||!r.cleanup_complete)throw Error('Source navigation unresolved');
 };
 const current=async()=>{
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
   try {
    const r=await roots(),bars=r.ui.elements.filter(e=>e.tid===r.workflow_ref?.prefix+';NavigationBar;NavigationPanel');
    if(bars.length===1){const s=await detail(r,bars[0]);if(s.file_storage?.status==='observed'&&!s.ui.dialogs.length&&!s.ui.masks.length)return s;}
   } catch(error) {
    // Storage can still render after navigation. Discard the stale observation;
    // only retry reads with new roots, never repeat the navigation gesture.
    if(!/^Workspace changed between observation pages;/.test(error.message))throw error;
   }
  }throw Error('Source directory unavailable');
 };
 const row=async filename=>{
  const r=await observe({scope:'roots',storageName:filename});
  const e=one(r.ui.elements.filter(e=>e.tid===r.workflow_ref.prefix+';FileStorageForm;colName_'+filename.replace(/\s/g,'_').replace(/,/g,'')),'Exact source row unavailable');
  return detail(r,e);
 };
 let r=await roots();
 if(!r.ui.elements.some(e=>e.tid?.includes(';FileStorageForm;'))){
  const bar=await detail(r,one(r.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar'),'Main toolbar unavailable'));
  await click(bar,one(bar.ui.elements.filter(e=>e.tid==='MF;cntMain;tlbMainToolbar;btnFilestorage'),'Files control unavailable'));
 }
 let s=await current();
 if(s.file_storage.directory!==directory){
  if(s.file_storage.directory!=='/'){await click(s,one(s.ui.elements.filter(e=>e.tid===s.workflow_ref.prefix+';cnrNaviMode;b.s_Сервер>Файлы'),'Files root unavailable'));s=await current();}
  if(s.file_storage.directory!=='/')throw Error('Files root differs');
  const folder=await row('test-3');await click(folder,one(folder.ui.elements.filter(e=>e.storage_entry?.kind==='folder'&&e.label==='test-3'),'Exact diagnostic folder unavailable'),'double_click');s=await current();
 }
 if(s.file_storage.directory!==directory)throw Error('Source directory differs');
 const snapshot=await row(name),entry=one(snapshot.ui.elements.filter(e=>e.label===name&&e.storage_entry?.kind!=='folder'),'Exact CSV identity unavailable');
 if(snapshot.file_storage.directory!==directory)throw Error('Source row directory differs');
 const downloadDirectory=path.join(ctx.dir,operationId+'-download');await ctx.fs.mkdir(downloadDirectory);
 const downloadPath=path.join(downloadDirectory,name);
 const task={operation_id:operationId,observation_id:snapshot.observation_id,file_ref:entry.ref,snapshot,
  artifact:{name,upload:{directory,destination:sourcePath}},download_path:downloadPath,
  expected_origin:'http://logi-test-plan.bg.local',expected_build:'7.4.2'};
 await ctx.record({phase:'diagnostic_source_download_prepared',operation_id:operationId,source_path:sourcePath,expected_bytes:bytes,expected_sha256:sha256,snapshot});
 const outcome=await ctx.execute(makeArtifactDownloadCode(task));
 if(outcome.status!=='SUCCEEDED'||!outcome.cleanup_complete||!outcome.output.download_completed)throw Error('Saved source download unresolved');
 const data=await ctx.fs.readFile(downloadPath),actualSha=createHash('sha256').update(data).digest('hex');
 const receipt={source_path:sourcePath,name,bytes:data.length,sha256:actualSha,download_file:path.relative(ctx.dir,downloadPath),outcome};
 await ctx.record({phase:'diagnostic_source_download_completed',operation_id:operationId,receipt});
 if(data.length!==bytes||actualSha!==sha256)throw Error('Saved source bytes differ');
 const tabSelector='[data-tid='+JSON.stringify(ctx.prep.workflow_ref.tab_tid)+']';
 await ctx.execute(`async page=>{await page.locator(${JSON.stringify(tabSelector)}).click();return true;}`);
 return receipt;
}
