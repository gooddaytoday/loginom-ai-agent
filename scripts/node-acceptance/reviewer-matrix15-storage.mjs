import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {withDiagnosticSession} from './diagnostic-session.mjs';

// The foreground caller owns these original handles through refusal and recovery.
export async function runReviewerStorage(options, owner) {
 const {context,page,execute,directory:output,identity,makePrepareCode,makeCleanupCode}=options;
 if(!owner || owner.context || !context || !page || typeof execute!=='function')throw Error('FOREGROUND_OWNER_REQUIRED');
 Object.assign(owner,{context,page,execute,identity,failed:false,closed:false});
 const runtime=options.runtime;
 const settled=()=>{
  if(!runtime || owner.runtime!==runtime || typeof runtime.hasUnsettledWork!=='function')throw Error('DIAGNOSTIC_RUNTIME_UNVERIFIED');
  if(runtime.hasUnsettledWork())throw Error('DIAGNOSTIC_RUNTIME_UNSETTLED');
 };
 owner.runtime=runtime;
 owner.recover=async()=>{
  settled();
  const state=await options.observeIdentity();
  if(state.account!==identity.account || state.sessionId!==identity.sessionId || state.documentId!==owner.prepared?.document_id
    || state.tabTid!==owner.prepared?.workflow_ref?.tab_tid || state.path!==owner.identity.packagePath || state.running!==false || state.readOnly!==false || state.owned!==true)
    throw Error('DIAGNOSTIC_RECOVERY_IDENTITY_UNCONFIRMED');
  if(state.modified!==false){
   if(state.modified!==true)throw Error('DIAGNOSTIC_DIRTY_UNCONFIRMED');
   if(state.personalDirectory!==identity.personalDirectory)throw Error('DIAGNOSTIC_PERSONAL_PATH_UNCONFIRMED');
   const path=identity.personalDirectory+'/'+randomUUID()+'.lgp';
   if(!identity.personalDirectory || identity.personalDirectory==='/' || !identity.personalDirectory.startsWith('/') || /[\\]|\.\./.test(identity.personalDirectory))throw Error('DIAGNOSTIC_PERSONAL_PATH_UNCONFIRMED');
   if(await options.pathExists(path)!==false)throw Error('DIAGNOSTIC_SAVE_PATH_EXISTS');
   settled();
   const result=await runtime.run('package.save_checkpoint',{path,conflict_policy:'fail'},{operationId:'reviewer-preserve-'+randomUUID()});
   await writeFile(join(output,'preservation.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
   if(result?.status!=='SUCCEEDED' || result.output?.save_completed!==true || result.output?.package_ref?.path!==path)throw Error('DIAGNOSTIC_SAVE_UNCONFIRMED');
   owner.identity={...identity,packagePath:path};
   owner.prepared={...owner.prepared,package_ref:result.output.package_ref};
  }
  settled();
  await withDiagnosticSession({context,execute,directory:output,identity:owner.identity,makeCleanupCode},async({bindPrepared})=>bindPrepared(owner.prepared));
  owner.closed=true;
  return owner;
 };
 try{
  await withDiagnosticSession({context,execute,directory:output,identity,makeCleanupCode},async({bindPrepared})=>{
   const bind=async p=>{owner.prepared=p;return bindPrepared(p)};
   if(options.scenario){const value=await options.scenario({...owner,bindPrepared:bind});settled();return value;}
   const {config,archive}=options,report=owner.report={account:identity.account,files:[]};
   const sessionId=identity.sessionId,makeWorkspacePrepareCode=makePrepareCode;
   const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
   const need=(v,m)=>{if(!v)throw Error(m)};
   const inventory=()=>page.evaluate(()=>{const main=globalThis.bg?.app?.Application?.FInstance?.FMainForm;return {account:main?.FMapTree?.FServerConnection?.UserName,packages:main?.FMapTree?.PackageNodes?.Count,build:globalThis.bg?.app?.Version}});
   const visible=()=>page.locator('[data-tid]:visible').evaluateAll(es=>es.map(e=>({tid:e.getAttribute('data-tid'),text:(e.innerText??'').slice(0,150)})));
   let prepared;
 report.before=await inventory();
 need(report.before.account===report.account&&report.before.packages===0&&report.before.build==='7.4.2','Initial account/package inventory differs');
 prepared=await execute(makeWorkspacePrepareCode({loginomUrl:config.loginom.url,compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId,operationId:'reviewer-matrix15-original-read',intent:'open_package',packagePath:identity.packagePath}));
 report.prepared=prepared;
 await bind(prepared);
 need(prepared.status==='READY','Original package open not ready');
 await at('MF;cntMain;tlbMainToolbar;btnFilestorage').click();
 await page.locator('[data-tid$=";FileStorageForm;btnRefresh"]').waitFor({state:'visible',timeout:30000});
 await page.locator('[data-tid$=";cnrNaviMode;b.s_Сервер>Файлы"]').waitFor({state:'visible',timeout:30000});
 let rows=await visible();
 report.files_initial=rows;
 const root=rows.filter(e=>e.tid.endsWith(';cnrNaviMode;b.s_Сервер>Файлы'));
 need(root.length===1,'Exact storage root control required');
 await at(root[0].tid).click();
 const shared=page.locator('[data-tid$=";FileStorageForm;colName_lab-72-union"]');
 await shared.waitFor({state:'visible',timeout:30000});
 need(await shared.count()===1,'Exact shared folder required');
 await shared.dblclick();
 await page.locator('[data-tid$=";FileStorageForm;colName_union-matrix15-12-saved.lgp"]').waitFor({state:'visible',timeout:30000});
 report.shared_controls=await visible();
 const transferred=JSON.parse(await readFile(join(archive,'shared-artifact-manifest.json'),'utf8'));
 const manifest={files:transferred.map(f=>({...f,shared:f.path,name:f.path.split('/').at(-1)}))};
 await mkdir(join(output,'files'),{recursive:true});
 for(const item of manifest.files){
  if(report.files.some(f=>f.shared===item.shared&&f.bytes===item.bytes&&f.sha256===item.sha256&&f.download_completed))continue;
  need(item.shared==='/lab-72-union/'+item.name,'Manifest directory differs');
  const file=page.locator('[data-tid$='+JSON.stringify(';FileStorageForm;colName_'+item.name)+']');
  need(await file.count()===1&&await file.isVisible(),'Exact native file row required');
  await page.locator('[data-tid$=";cnrNaviMode;b.s_Сервер>Файлы>lab-72-union"]').waitFor({state:'visible'});
  const row=await file.evaluate(e=>({tid:e.getAttribute('data-tid'),text:e.closest('tr')?.innerText??e.parentElement?.innerText}));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await file.click({button:'right'});
  need(await at('mn;btnDownload').count()===1&&await at('mn;btnDownload').isVisible(),'Native download command required');
  await at('mn;btnDownload').click();
  const controls=await(await page.waitForFunction(()=>{
   const es=[...document.querySelectorAll('[data-tid]')].filter(e=>e.checkVisibility()&&e.getAttribute('data-tid').includes('Download')&&e.getAttribute('data-tid').startsWith('mn')&&e.getAttribute('data-tid')!=='mn;btnDownload'&&e.innerText.trim()==='Скачать');
   return es.length===1?es.map(e=>({tid:e.getAttribute('data-tid'),text:e.innerText})):false;
  },undefined,{timeout:15000})).jsonValue();
  report.download_controls=controls;
  need(controls.length===1,'Exact uncompressed download command required');
  const pending=page.waitForEvent('download',{timeout:30000});
  await at(controls[0].tid).click();
  const download=await pending;
  const name=download.suggestedFilename();
  need(name===item.name,'Downloaded filename differs');
  const failure=await download.failure();need(failure===null,'Native download failed');
  const destination=join(output,'files',item.name);
  await download.saveAs(destination);
  const bytes=await readFile(destination);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const archived=await readFile(join(archive,item.name));
  need(bytes.length===item.bytes&&sha256===item.sha256&&bytes.equals(archived),'Downloaded bytes differ');
  report.files.push({shared:item.shared,name,bytes:bytes.length,sha256,manifest_match:true,archive_byte_match:true,download_completed:true,download_failure:failure,url_scheme:new URL(download.url()).protocol,native_row:row,download_tid:controls[0].tid});
  await page.keyboard.press('Escape');
  await writeFile(join(output,'storage-download.json'),JSON.stringify(report,null,2)+'\n');
 }
   settled();
   await writeFile(join(output,'storage-download.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
   return report;
  });
  owner.closed=true;
 }catch(error){owner.failed=true;owner.error=error;}
 return owner;
}
