// Prepare only this scenario's unique seed destinations through the existing
// artifact delivery protocol. The model never receives the oracle or seeds.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const [root,configPath,output]=process.argv.slice(2);
process.umask(0o077);await mkdir(output,{recursive:true,mode:0o700});
const config=JSON.parse(await readFile(configPath,'utf8')),load=name=>import(pathToFileURL(root+'/runtime/'+name).href);
const {verifyResources}=await load('src/resources.mjs'),resources=await verifyResources(root);
const {loginBrowser,loginomAddress}=await load('src/connection-check.mjs');
const {makeWorkspacePrepareCode}=await load('client/lib/workspace.mjs');
const {makeWorkspaceUiCode}=await load('client/lib/workspace-ui.mjs');
const {makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
const {createActionRuntime}=await load('client/lib/executor.mjs');
const {createArtifactStore}=await load('client/lib/artifacts.mjs');
const {createExecutionJournal}=await load('client/lib/execution-journal.mjs');
const {createStorageBinding}=await load('client/lib/storage-policy.mjs');
const {context}=await loginBrowser({browserPath:resources.browserPath,profile:output+'/browser',candidate:config.login,keepOpen:true,headless:true});
const page=context.pages()[0],sessionId=randomUUID(),record=createExecutionJournal({directory:output,metadata:{sessionId},knownSecrets:[config.login.password]});
const execute=code=>new Function('page',`return (${code})(page)`)(page);
try{
 const identity=await execute(makeWorkspacePrepareCode({loginomUrl:loginomAddress(config.login.url),compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId,operationId:'excel-seed-workspace',intent:'new_draft'}));
 if(identity.status!=='READY')throw Error('SEED_WORKSPACE');
 const mask=config.text_mask_directory;
 if(mask&&(!/^[A-Za-z0-9_-]{1,100}$/.test(mask.name)||typeof mask.create!=='boolean'))throw Error('TEXT_MASK_DIRECTORY_INVALID');
 // text-folder-masks: one parent (a space is part of the request) and its
 // child folders, created empty before seeding; never an existing folder.
 const folders=config.text_folders;
 if(folders&&(mask||typeof folders.parent!=='string'||!/^[A-Za-z0-9_-](?:[A-Za-z0-9 _-]{0,98}[A-Za-z0-9_-])?$/.test(folders.parent)
  ||!Array.isArray(folders.children)||!folders.children.length||folders.children.some(c=>typeof c!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(c))))throw Error('TEXT_FOLDERS_INVALID');
 const directory=config.login.package_directory+(mask?'/'+mask.name:folders?'/'+folders.parent:'');
 if(mask?.create){
  const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
  await at('MF;cntMain;tlbMainToolbar;btnFilestorage').click();
  const grid=page.locator('[data-tid$=";FileStorageForm;pnlFileStorage;tbl"]:visible');
  await grid.waitFor({state:'visible'});
  if(await grid.count()!==1)throw Error('TEXT_MASK_STORAGE_AMBIGUOUS');
  const prefix=(await grid.getAttribute('data-tid')).split(';FileStorageForm;')[0];
  const breadcrumb=value=>at(prefix+';cnrNaviMode;b.s_Сервер>Файлы'+value);
  await breadcrumb('').click();
  let trail='';
  for(const part of config.login.package_directory.slice(1).split('/')){
   await at(prefix+';FileStorageForm;colName_'+part.replace(/\s/g,'_').replace(/,/g,'')).dblclick();
   trail+='>'+part;await breadcrumb(trail).waitFor({state:'visible'});
  }
  if(await at(prefix+';FileStorageForm;colName_'+mask.name).count())throw Error('TEXT_MASK_DIRECTORY_EXISTS');
  await at(prefix+';FileStorageForm;btnCreateDirectory').click();
  await record({phase:'text_mask_directory_dialog',observation:await execute(makeWorkspaceUiCode({mode:'observe',expected_origin:new URL(config.login.url).origin,expected_build:'7.4.2'}))});
  const field=at('msgbox;cnt;cnt;txt').locator('input');
  if(await field.count()!==1)throw Error('TEXT_MASK_DIRECTORY_DIALOG_UNOBSERVED');
  await field.fill(mask.name);await at('msgbox;tlb;ok').click();
  await at(prefix+';FileStorageForm;colName_'+mask.name).waitFor({state:'visible'});
 }
 if(folders){
  const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']'),cell=name=>name.replace(/\s/g,'_').replace(/,/g,'');
  await at('MF;cntMain;tlbMainToolbar;btnFilestorage').click();
  const grid=page.locator('[data-tid$=";FileStorageForm;pnlFileStorage;tbl"]:visible');
  await grid.waitFor({state:'visible'});
  if(await grid.count()!==1)throw Error('TEXT_FOLDERS_STORAGE_AMBIGUOUS');
  const prefix=(await grid.getAttribute('data-tid')).split(';FileStorageForm;')[0],row=name=>at(prefix+';FileStorageForm;colName_'+cell(name));
  const breadcrumb=value=>at(prefix+';cnrNaviMode;b.s_Сервер>Файлы'+value);
  await breadcrumb('').click();
  let trail='';
  for(const part of config.login.package_directory.slice(1).split('/')){
   await row(part).dblclick();trail+='>'+part;await breadcrumb(trail).waitFor({state:'visible'});
  }
  const create=async name=>{
   if(await row(name).count())throw Error('TEXT_FOLDERS_DIRECTORY_EXISTS');
   await at(prefix+';FileStorageForm;btnCreateDirectory').click();
   const field=at('msgbox;cnt;cnt;txt').locator('input');
   await field.waitFor({state:'visible'});
   if(await field.count()!==1)throw Error('TEXT_FOLDERS_DIALOG_UNOBSERVED');
   await field.fill(name);await at('msgbox;tlb;ok').click();
   await row(name).waitFor({state:'visible'});
  };
  await create(folders.parent);
  await row(folders.parent).dblclick();await row(folders.parent).waitFor({state:'detached'});
  await record({phase:'text_folders_parent_opened',observation:await execute(makeWorkspaceUiCode({mode:'observe',expected_origin:new URL(config.login.url).origin,expected_build:'7.4.2'}))});
  for(const child of folders.children)await create(child);
 }
 const binding=createStorageBinding({sessionId,origin:new URL(config.login.url).origin,build:'7.4.2',documentId:identity.document_id,account:identity.loginom_account,directories:{inputs:directory,packages:directory,exports:directory}});
 const actions=JSON.parse(await readFile(root+'/runtime/executor/catalog/actions.json','utf8')).actions;
 const selectors=JSON.parse(await readFile(root+'/runtime/executor/catalog/selectors.json','utf8')).selectors;
 const artifactStore=await createArtifactStore({directory:output+'/artifacts',sessionId});
 const runtime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,artifactStore,allowCandidate:true,targetOrigin:new URL(config.login.url).origin,targetBuild:'7.4.2',getStorageBinding:()=>binding});
 const delivered=[];
 for(const [index,book]of config.books.entries()){
  const target=book.destination.slice(0,book.destination.lastIndexOf('/'));
  if(folders?!folders.children.some(c=>target===directory+'/'+c):target!==directory)throw Error('SEED_DIRECTORY');
  const bytes=await readFile(book.fixture),artifact=await artifactStore.admit({sourcePath:book.fixture,name:book.destination.split('/').at(-1),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),upload:{directory:target,overwrite:config.overwrite??'replace'}});
  const result=await runtime.deliverArtifact({operation_id:'excel-seed-'+index,artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:120000});
  if(result.outcome?.status!=='SUCCEEDED'||result.outcome.destination!==book.destination||result.outcome.upload_completion_verified!==true||result.outcome.cleanup_complete!==true)throw Error('SEED_UPLOAD:'+JSON.stringify(result));
  delivered.push(result.outcome);
 }
 const cleanup=await execute(makePackageCleanupCode({sessionId,documentId:identity.document_id,account:config.login.username,packagePath:null,unsavedDraft:true,loginomUrl:config.login.url,loginomBuild:'7.4.2',tabTid:identity.workflow_ref.tab_tid}));
 await record({phase:'excel_seed_cleanup',cleanup});await writeFile(output+'/result.json',JSON.stringify({delivered,cleanup}));
 if(cleanup.package_closed!==true||cleanup.logged_out!==true)throw Error('SEED_CLEANUP');
}finally{await context.close();}
