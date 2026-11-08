// Prepare only this scenario's unique seed destinations through the existing
// artifact delivery protocol. The model never receives the oracle or seeds.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const [root,configPath,output]=process.argv.slice(2);
process.umask(0o077);await mkdir(output,{recursive:true,mode:0o700});
const config=JSON.parse(await readFile(configPath,'utf8')),load=name=>import(pathToFileURL(root+'/runtime/'+name).href);
const {verifyResources}=await load('src/resources.mjs'),resources=await verifyResources(root);
const {loginBrowser}=await load('src/connection-check.mjs');
const {makeWorkspacePrepareCode}=await load('client/lib/workspace.mjs');
const {makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
const {createActionRuntime}=await load('client/lib/executor.mjs');
const {createArtifactStore}=await load('client/lib/artifacts.mjs');
const {createExecutionJournal}=await load('client/lib/execution-journal.mjs');
const {createStorageBinding}=await load('client/lib/storage-policy.mjs');
const {context}=await loginBrowser({browserPath:resources.browserPath,profile:output+'/browser',candidate:config.login,keepOpen:true,headless:true});
const page=context.pages()[0],sessionId=randomUUID(),record=createExecutionJournal({directory:output,metadata:{sessionId},knownSecrets:[config.login.password]});
const execute=code=>new Function('page',`return (${code})(page)`)(page);
try{
 const identity=await execute(makeWorkspacePrepareCode({loginomUrl:config.login.url,compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId,operationId:'excel-seed-workspace',intent:'new_draft'}));
 if(identity.status!=='READY')throw Error('EXCEL_SEED_WORKSPACE');
 const directory=config.login.package_directory;
 const binding=createStorageBinding({sessionId,origin:new URL(config.login.url).origin,build:'7.4.2',documentId:identity.document_id,account:identity.loginom_account,directories:{inputs:directory,packages:directory,exports:directory}});
 const actions=JSON.parse(await readFile(root+'/runtime/executor/catalog/actions.json','utf8')).actions;
 const selectors=JSON.parse(await readFile(root+'/runtime/executor/catalog/selectors.json','utf8')).selectors;
 const artifactStore=await createArtifactStore({directory:output+'/artifacts',sessionId});
 const runtime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,artifactStore,allowCandidate:true,targetOrigin:new URL(config.login.url).origin,targetBuild:'7.4.2',getStorageBinding:()=>binding});
 const delivered=[];
 for(const [index,book]of config.books.entries()){
  if(book.destination.slice(0,book.destination.lastIndexOf('/'))!==directory)throw Error('EXCEL_SEED_DIRECTORY');
  const bytes=await readFile(book.fixture),artifact=await artifactStore.admit({sourcePath:book.fixture,name:book.destination.split('/').at(-1),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),upload:{directory,overwrite:'replace'}});
  const result=await runtime.deliverArtifact({operation_id:'excel-seed-'+index,artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:120000});
  if(result.outcome?.status!=='SUCCEEDED'||result.outcome.destination!==book.destination||result.outcome.upload_completion_verified!==true||result.outcome.cleanup_complete!==true)throw Error('EXCEL_SEED_UPLOAD:'+JSON.stringify(result));
  delivered.push(result.outcome);
 }
 const cleanup=await execute(makePackageCleanupCode({sessionId,documentId:identity.document_id,account:config.login.username,packagePath:null,unsavedDraft:true,loginomUrl:config.login.url,loginomBuild:'7.4.2',tabTid:identity.workflow_ref.tab_tid}));
 await record({phase:'excel_seed_cleanup',cleanup});await writeFile(output+'/result.json',JSON.stringify({delivered,cleanup}));
 if(cleanup.package_closed!==true||cleanup.logged_out!==true)throw Error('EXCEL_SEED_CLEANUP');
}finally{await context.close();}
