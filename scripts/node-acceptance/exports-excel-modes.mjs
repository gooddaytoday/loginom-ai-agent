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
const {createActionRuntime,makeArtifactUploadCode}=await load('client/lib/executor.mjs');
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
 const nodeSupport=config.fs_error_seed?(await load('client/lib/node-support.mjs')).createCandidateNodeSupport({targetOrigin:new URL(config.login.url).origin,targetBuild:'7.4.2'}):{};
 const runtime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},...nodeSupport,execute,onRecord:record,artifactStore,allowCandidate:true,targetOrigin:new URL(config.login.url).origin,targetBuild:'7.4.2',getStorageBinding:()=>binding,...(config.fs_error_audit===true?{cacheDirectory:output+'/server-download-cache'}:{})});
 if(config.fs_error_seed){
  // Trusted stage-zero fixture preparation through the production JS node
  // lifecycle. Its source/expected bytes never enter the model conversation.
  if(config.fs_error_seed!==directory+'/errors'||folders?.children.join(',')!=='errors')throw Error('FS_ERROR_SEED_SCOPE');
  const dir=JSON.stringify(config.fs_error_seed);
  const source='import * as fs from "builtIn/FS";\nimport {OutputTable,DataType} from "builtIn/Data";\n'
   +'if(!fs.existsSync('+dir+'+"/keep.txt"))fs.writeFileSync('+dir+'+"/keep.txt","KEEP",{encoding:"utf8",flag:"wx"});\n'
   +'const denied='+dir+'+"/denied.txt";let present=false;try{fs.statSync(denied);present=true;}catch(e){}\n'
   +'if(!present){const fd=fs.openSync(denied,"wx",0o000);try{fs.writeSync(fd,"DENIED");}finally{fs.closeSync(fd);}}\n'
   +'OutputTable.AssignColumns([{Name:"Seed",DataType:DataType.Integer}]);\nOutputTable.Append();OutputTable.Set("Seed",1);\n';
  const result=await runtime.runNodeApply({operation_id:'fs-error-seed',contract_revision:'1.0.0',document_id:identity.document_id,
   workflow_ref:identity.workflow_ref,target:{kind:'new',type:'programming.javascript',label:'Private FS fixture',position:{x:240,y:80}},
   inputs:[],mode:'script',parameters:{input_state:'unconnected',schema_mode:'code',source_text:source},mappings:[],finish:'execute',
   read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:120000,execute_ms:30000,total_ms:180000}});
  if(result.status!=='SUCCEEDED'||result.output?.execution?.status!=='completed'||result.cleanup_complete!==true)throw Error('FS_ERROR_SEED_FAILED:'+JSON.stringify(result));
 }
 const delivered=[];
 for(const [index,book]of config.books.entries()){
  const target=book.destination.slice(0,book.destination.lastIndexOf('/'));
  const scoped=config.fs_fixture===true&&typeof config.fs_scope==='string'
   &&config.fs_scope.startsWith(config.login.package_directory+'/')
   &&/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/.test(config.fs_scope)
   &&['original','moved'].some(child=>target===config.fs_scope+'/'+child);
  if(!scoped&&(folders?!folders.children.some(c=>target===directory+'/'+c):target!==directory))throw Error('SEED_DIRECTORY');
  const bytes=await readFile(book.fixture),artifact=await artifactStore.admit({sourcePath:book.fixture,name:book.destination.split('/').at(-1),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),upload:{directory:target,overwrite:config.overwrite??'replace'}});
  if(config.fs_fixture===true){
   // Private binary fixtures use the same native upload. Their completion and
   // bytes are proved by the independent folder ZIP below, never by this reply.
   await storageDirectory(target);
   const observed=await execute(makeWorkspaceUiCode({mode:'observe',expected_origin:new URL(config.login.url).origin,expected_build:'7.4.2'}));
   if(observed.status!=='SUCCEEDED'||observed.output?.file_storage?.directory!==target)throw Error('FS_SEED_DIRECTORY_UNOBSERVED');
   const lease=await artifactStore.stageUpload(artifact.artifact_id);
   try{
    const result=await execute(makeArtifactUploadCode({operation_id:'fs-seed-'+index,artifact,upload_path:lease.path,
     snapshot:observed.output,decide_conflicts:true,expected_origin:new URL(config.login.url).origin,expected_build:'7.4.2'}));
    await record({phase:'fs_fixture_upload_submitted',result});
    if(result.error?.code!=='UPLOAD_SERVER_VERIFICATION_REQUIRED'||result.output?.upload_submitted!==true)throw Error('FS_SEED_UPLOAD_UNCONFIRMED');
    delivered.push({destination:book.destination,submitted:true});
   }finally{await lease.release();}
   continue;
  }
  const result=await runtime.deliverArtifact({operation_id:'excel-seed-'+index,artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:120000});
  if(result.outcome?.status!=='SUCCEEDED'||result.outcome.destination!==book.destination||result.outcome.upload_completion_verified!==true||result.outcome.cleanup_complete!==true)throw Error('SEED_UPLOAD:'+JSON.stringify(result));
  delivered.push(result.outcome);
 }
 if(config.fs_move){
  const {from,to}=config.fs_move,scope=config.fs_scope;
  if(typeof scope!=='string'||!scope.startsWith(config.login.package_directory+'/')
    ||!/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/.test(scope)
    ||from!==scope+'/original/paths.lgp'||to!==scope+'/moved/paths.lgp')throw Error('FS_MOVE_SCOPE');
  let {prefix,at}=await storageDirectory(scope+'/moved');
  const tid=prefix+';FileStorageForm;colName_paths.lgp';
  if(await at(tid).count())throw Error('FS_MOVE_DESTINATION_EXISTS');
  ({prefix,at}=await storageDirectory(scope+'/original'));
  const source=at(prefix+';FileStorageForm;colName_paths.lgp');
  await source.waitFor({state:'visible'});if(await source.count()!==1)throw Error('FS_MOVE_SOURCE_AMBIGUOUS');
  await record({phase:'fs_package_move_prepared',from,to,
   observation:await execute(makeWorkspaceUiCode({mode:'observe',expected_origin:new URL(config.login.url).origin,expected_build:'7.4.2'}))});
  await source.click();await at(prefix+';FileStorageForm;btnCut').click();
  ({prefix,at}=await storageDirectory(scope+'/moved'));
  if(await at(prefix+';FileStorageForm;colName_paths.lgp').count())throw Error('FS_MOVE_DESTINATION_CHANGED');
  await at(prefix+';FileStorageForm;btnPaste').click();
  await at(prefix+';FileStorageForm;colName_paths.lgp').waitFor({state:'visible'});
  ({prefix,at}=await storageDirectory(scope+'/original'));
  if(await at(prefix+';FileStorageForm;colName_paths.lgp').count())throw Error('FS_MOVE_SOURCE_REMAINS');
  await record({phase:'fs_package_move_completed',from,to});
 }
 if(config.fs_audit){
  const target=config.fs_audit;
  if(typeof target!=='string'||!target.startsWith(config.login.package_directory+'/')
    ||!/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/.test(target))throw Error('FS_AUDIT_SCOPE');
  if(config.fs_error_audit===true){
   const listed=await runtime.serverDownload({operation_id:'fs-error-inventory',path:target},'dock_storage_list');
   if(listed.status!=='SUCCEEDED'||listed.output?.complete!==true||listed.output.truncated!==false)throw Error('FS_ERROR_INVENTORY_INCOMPLETE');
   await writeFile(output+'/inventory.json',JSON.stringify(listed.output.entries));
   const {prefix,at}=await storageDirectory(target);
   const row=at(prefix+';FileStorageForm;colName_keep.txt');await row.waitFor({state:'visible'});
   await row.click();
   const pending=page.waitForEvent('download',{timeout:60000});await at(prefix+';FileStorageForm;btnDownload').click();
   const download=await pending;await download.saveAs(output+'/keep.txt');
   if(await download.failure())throw Error('FS_ERROR_KEEP_DOWNLOAD_FAILED');
   await download.delete();
  }else{
  const {prefix,at}=await storageDirectory(target.slice(0,target.lastIndexOf('/')));
  const name=target.split('/').at(-1),row=at(prefix+';FileStorageForm;colName_'+name);
  await row.waitFor({state:'visible'});if(await row.count()!==1)throw Error('FS_AUDIT_ROW_AMBIGUOUS');
  await row.click();
  await record({phase:'fs_folder_download_prepared',directory:target,
   observation:await execute(makeWorkspaceUiCode({mode:'observe',expected_origin:new URL(config.login.url).origin,expected_build:'7.4.2'}))});
  const pending=page.waitForEvent('download',{timeout:60000});
  await at(prefix+';FileStorageForm;btnDownload').click();
  const download=await pending;await download.saveAs(output+'/files.zip');
  if(await download.failure())throw Error('FS_AUDIT_DOWNLOAD_FAILED');
  await download.delete();
  }
 }
 const cleanup=await execute(makePackageCleanupCode({sessionId,documentId:identity.document_id,account:config.login.username,
  packagePath:null,unsavedDraft:true,loginomUrl:config.login.url,loginomBuild:'7.4.2',tabTid:identity.workflow_ref.tab_tid}));
 await record({phase:'excel_seed_cleanup',cleanup});await writeFile(output+'/result.json',JSON.stringify({delivered,cleanup}));
 if(cleanup.package_closed!==true||cleanup.logged_out!==true)throw Error('SEED_CLEANUP');
}finally{await context.close();}

// Existing Files UI only; each destination is confined to this run's directory.
async function storageDirectory(directory){
 if(!directory.startsWith(config.login.package_directory)||directory.split('/').some(p=>p==='.'||p==='..'))throw Error('FS_STORAGE_SCOPE');
 const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']');
 const grids=page.locator('[data-tid$=";FileStorageForm;pnlFileStorage;tbl"]:visible');
 if(await grids.count()===0)await at('MF;cntMain;tlbMainToolbar;btnFilestorage').click();
 await grids.waitFor({state:'visible'});if(await grids.count()!==1)throw Error('FS_STORAGE_AMBIGUOUS');
 const prefix=(await grids.getAttribute('data-tid')).split(';FileStorageForm;')[0];
 await at(prefix+';cnrNaviMode;b.s_Сервер>Файлы').click();let trail='';
 for(const part of directory.slice(1).split('/')){
  await at(prefix+';FileStorageForm;colName_'+part.replace(/\s/g,'_').replace(/,/g,'')).dblclick();
  trail+='>'+part;await at(prefix+';cnrNaviMode;b.s_Сервер>Файлы'+trail).waitFor({state:'visible'});
 }
 return {prefix,at};
}
