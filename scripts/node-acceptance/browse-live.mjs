import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {withDiagnosticSession} from './diagnostic-session.mjs';
// Import and await in the existing foreground Node REPL; no standalone top-level run.
// The caller must keep `owner` reachable until guarded recovery completes.
export async function runBrowseLive(args, owner) {
 if (!owner || typeof owner !== 'object' || owner.context) throw Error('FOREGROUND_OWNER_REQUIRED');
 process.umask(0o077);
 try {
const [resourceArg,configArg,outArg]=args,root=resolve(resourceArg),out=resolve(outArg),load=n=>import(pathToFileURL(join(root,'runtime',n)));
const {verifyResources}=await load('src/resources.mjs'),resources=await verifyResources(root);
const config=JSON.parse(await readFile(configArg)),account=config.workflow_profile.loginom_user,storage='/'+account,sessionId=randomUUID();
const {loginBrowser}=await load('src/connection-check.mjs');
const {makeWorkspacePrepareCode}=await load('client/lib/workspace.mjs');
const {makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
const {createActionRuntime}=await load('client/lib/executor.mjs');
const {createCandidateNodeSupport}=await load('client/lib/node-support.mjs');
const {createArtifactStore}=await load('client/lib/artifacts.mjs');
const {createExecutionJournal}=await load('client/lib/execution-journal.mjs');
await mkdir(out,{recursive:true,mode:0o700});
const persist=(n,v)=>writeFile(join(out,n+'.json'),JSON.stringify(v,null,2)+'\n',{mode:0o600});
const record=createExecutionJournal({directory:out,metadata:{sessionId},knownSecrets:[config.api_key,config.workflow_profile.password]});
const {context}=await loginBrowser({browserPath:resources.browserPath,profile:join(out,'browser'),candidate:{url:config.loginom_url,username:account,password:config.workflow_profile.password},headless:true,keepOpen:true});
const page=context.pages()[0],execute=code=>new Function('page',`return (${code})(page)`)(page);
Object.assign(owner,{context,page,execute,failed:false,closed:false});
const actions=JSON.parse(await readFile(join(root,'runtime/executor/catalog/actions.json'))).actions,selectors=JSON.parse(await readFile(join(root,'runtime/executor/catalog/selectors.json'))).selectors;
actions.find(a=>a.action_key==='package.save_checkpoint').effect.allowed_roots=[storage];
const runtimeConfig={targetOrigin:new URL(config.loginom_url).origin,targetBuild:'7.4.2'};
const artifactStore=await createArtifactStore({directory:join(out,'artifacts'),sessionId});
const runtime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,...runtimeConfig,artifactStore,allowCandidate:true,...createCandidateNodeSupport(runtimeConfig)});
owner.runtime=runtime;
const packagePath=storage+'/matrix-'+sessionId+'.lgp';
const identity={sessionId,account,packagePath,loginomUrl:config.loginom_url,loginomBuild:'7.4.2',diagnosticDiscard:false};
owner.identity=identity;
owner.recover=async()=>{
 if(owner.closed)throw Error('DIAGNOSTIC_CONTEXT_ALREADY_CLOSED');
 const value=await withDiagnosticSession({context,page,execute,directory:join(out,'recovery'),identity:owner.identity,makeCleanupCode:makePackageCleanupCode},async({bindPrepared})=>bindPrepared(owner.prepared));
 owner.closed=true;return value;
};
const need=(v,m)=>{if(!v)throw Error(m)};

 const before=await page.evaluate(()=>{const m=bg.app.Application.FInstance.FMainForm.FMapTree;return {account:m.FServerConnection.UserName,packages:m.PackageNodes.Count};});await persist('original-profile-before',before);need(before.account===account&&before.packages===0,'ORIGINAL_PROFILE_NOT_RELEASED');
 let prepared=await execute(makeWorkspacePrepareCode({loginomUrl:page.url(),compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId,operationId:'matrix-draft',intent:'new_draft'}));
 owner.prepared=prepared;need(prepared.status==='READY','MATRIX_DRAFT_FAILED');
 const saved=await runtime.run('package.save_checkpoint',{path:packagePath,conflict_policy:'fail'},{operationId:'matrix-bootstrap'});await persist('bootstrap',saved);
 need(saved.status==='SUCCEEDED'&&saved.output.save_completed,'MATRIX_BOOTSTRAP_FAILED');
 const bootstrapCleanup=await execute(makePackageCleanupCode({...identity,diagnosticDiscard:false,documentId:prepared.document_id,tabTid:prepared.workflow_ref.tab_tid}));await persist('bootstrap-cleanup',bootstrapCleanup);need(bootstrapCleanup.package_closed&&bootstrapCleanup.logged_out,'MATRIX_BOOTSTRAP_CLEANUP_FAILED');
 const {loginPage}=await load('src/connection-check.mjs');await loginPage(page,{url:config.loginom_url,username:account,password:config.workflow_profile.password});
 prepared=await execute(makeWorkspacePrepareCode({loginomUrl:page.url(),compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId,operationId:'matrix-open-saved',intent:'open_package',packagePath}));
 owner.prepared=prepared;need(prepared.status==='READY','MATRIX_OPEN_FAILED');
 const sourcePath=resolve(args[3]),bytes=await readFile(sourcePath);
 const artifact=await artifactStore.admit({sourcePath,name:'matrix-'+sessionId+'.csv',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),upload:{directory:storage,overwrite:'reject'}});
 const delivered=await runtime.deliverArtifact({operation_id:'matrix-upload',artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:120000});await persist('delivery',delivered);need(delivered.outcome?.status==='SUCCEEDED','MATRIX_UPLOAD_FAILED');
 const template=JSON.parse(await readFile(args[4]));
 const base={contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,inputs:[],mappings:[],finish:'execute',read:{ports:[0,1],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:240000,execute_ms:60000,total_ms:360000}};
 template.parameters.source={artifact_id:artifact.artifact_id,upload_operation_id:'matrix-upload:upload'};
 template.parameters.settings.source.source_path=artifact.upload.destination;
 const imported=await runtime.runNodeApply({...base,operation_id:'matrix-import',target:{kind:'new',type:'imports.text',label:'Данные',position:{x:120,y:100}},mode:'delimited',parameters:template.parameters,read:{...base.read,ports:[0]}});await persist('import',imported);need(imported.status==='SUCCEEDED','MATRIX_IMPORT_FAILED');
 const finalPath=storage+'/matrix-final-'+sessionId+'.lgp';
 owner.finalPath=finalPath;
 const finalSave=await runtime.run('package.save_checkpoint',{path:finalPath,conflict_policy:'fail'},{operationId:'browse-final-save'});
 owner.finalSave=finalSave;await persist('final-save',finalSave);need(finalSave.status==='SUCCEEDED'&&finalSave.output.save_completed,'FINAL_SAVE_UNCONFIRMED');
 owner.identity={...identity,packagePath:finalPath};
 owner.prepared=await execute(makeWorkspacePrepareCode({loginomUrl:page.url(),compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId,operationId:'matrix-final-prepare',intent:'open_package',packagePath:finalPath}));
 await persist('result',{status:'IMPORT_COMPLETED',scope:'original import-read bound Table Filter',source_sha:'5430915edcfdc91f215a53852360e596ba38fbd0',operation:imported});
 await withDiagnosticSession({context,execute,directory:out,identity:owner.identity,makeCleanupCode:makePackageCleanupCode},async({bindPrepared})=>bindPrepared(owner.prepared));
 owner.closed=true;

 } catch (error) { owner.failed=true;owner.error=error; }
 return owner;
}
