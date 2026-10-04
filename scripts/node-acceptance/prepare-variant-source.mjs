import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const [root,dir]=process.argv.slice(2),load=n=>import(pathToFileURL(root+'/runtime/'+n).href);
const config=JSON.parse(await fs.readFile(dir+'/config.json'));
const {verifyResources}=await load('src/resources.mjs'),resources=await verifyResources(root);
// Preflight pinned catalog paths before login or any package mutation.
const actions=JSON.parse(await fs.readFile(root+'/runtime/executor/catalog/actions.json')).actions,selectors=JSON.parse(await fs.readFile(root+'/runtime/executor/catalog/selectors.json')).selectors;
const {loginBrowser}=await load('src/connection-check.mjs');
const {makeWorkspacePrepareCode}=await load('client/lib/workspace.mjs');
const {makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
const {createActionRuntime,withBrowserReceipt}=await load('client/lib/executor.mjs');
const {createCandidateNodeSupport}=await load('client/lib/node-support.mjs');
const {createArtifactStore}=await load('client/lib/artifacts.mjs');
const {createExecutionJournal}=await load('client/lib/execution-journal.mjs');
const sid=randomUUID(),storage='/'+config.username,packagePath=storage+'/'+config.source_name+'.lgp';
const record=createExecutionJournal({directory:dir,metadata:{sessionId:sid},knownSecrets:[config.password,config.api_key]});
const {context}=await loginBrowser({browserPath:resources.browserPath,profile:dir+'/browser',candidate:config,keepOpen:true,headless:false});
const page=context.pages()[0];
const execute=async code=>{const r=await new Function('page',`return (${code})(page)`)(page);await record({phase:'diagnostic_browser_return',value:r});return r;};
const need=(v,m)=>{if(!v)throw Error(m);};
const save=(name,r)=>fs.writeFile(dir+'/'+name+'.json',JSON.stringify(r,null,2));
let prepared,clean;
try {
 const compatibility={loginom_build:'7.4.2',platform:'linux',browser:'chromium'};
 prepared=await execute(makeWorkspacePrepareCode({loginomUrl:config.url,compatibility,sessionId:sid,operationId:'draft',intent:'new_draft'}));
 need(prepared.status==='READY','draft failed');
 actions.find(a=>a.action_key==='package.save_checkpoint').effect.allowed_roots=[storage];
 const artifactStore=await createArtifactStore({directory:dir+'/artifacts',sessionId:sid});
 const runtimeConfig={targetOrigin:new URL(config.url).origin,targetBuild:'7.4.2'};
 const runtime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,...runtimeConfig,artifactStore,allowCandidate:true,...createCandidateNodeSupport(runtimeConfig)});
 const saved=await runtime.run('package.save_checkpoint',{path:packagePath,conflict_policy:'fail'},{operationId:'bootstrap'});await save('bootstrap',saved);
 need(saved.status==='SUCCEEDED'&&saved.output.save_completed,'bootstrap failed');
 prepared={...prepared,package_ref:saved.output.package_ref};
 const initialCleanup=await execute(makePackageCleanupCode({sessionId:sid,documentId:prepared.document_id,account:config.username,packagePath,loginomUrl:config.url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid}));
 need(initialCleanup.package_closed&&initialCleanup.logged_out,'bootstrap cleanup failed');
 // Same browser context, fresh login and canonical open of the saved bootstrap.
 const {loginPage}=await load('src/connection-check.mjs');await loginPage(page,config);
 prepared=await execute(makeWorkspacePrepareCode({loginomUrl:config.url,compatibility,sessionId:sid,operationId:'open',intent:'open_package',packagePath}));need(prepared.status==='READY','saved open failed');
 await save('prepared',prepared);
 const bytes=await fs.readFile(dir+'/types.csv'),artifact=await artifactStore.admit({sourcePath:dir+'/types.csv',name:'types-'+dir.split('/').at(-1)+'.csv',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),upload:{directory:storage,overwrite:'reject'}});
 const delivered=await runtime.deliverArtifact({operation_id:'deliver-types',artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:120000});await save('delivered',delivered);need(delivered.outcome?.status==='SUCCEEDED','delivery failed');
 const base={contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,inputs:[],mappings:[],finish:'execute',read:{ports:[0],sample_rows:10,require_exact_numbers:true},budgets:{configure_ms:240000,execute_ms:60000,total_ms:360000}};
 const columns=[['Key','string'],['RealValue','real'],['TextValue','string'],['FlagValue','boolean'],['WhenValue','datetime']].map(([name,type])=>({name,label:name,type,data_kind:type==='real'?'Непрерывный':'Дискретный',used:true}));
 const importParameters={source:{artifact_id:artifact.artifact_id,upload_operation_id:'deliver-types:upload'},settings:{source:{source_path:artifact.upload.destination,encoding:'UTF-8 (65001)',rows_to_skip:0,first_line_as_title:true},format:{delimiter:',',decimal_separator:'.',null_marker:'?',text_qualifier:'"'},columns}};
 const source=await runtime.runNodeApply({...base,operation_id:'import-types',mode:'delimited',target:{kind:'new',type:'imports.text',label:'VariantInput',position:{x:120,y:100}},parameters:importParameters});await save('import',source);need(source.status==='SUCCEEDED','import failed');
 const field=name=>({kind:'input_field',name});

 const collapsed=await runtime.runNodeApply({...base,operation_id:'collapse-source',finish:'execute',read:{ports:[0],sample_rows:0,require_exact_numbers:false},mode:'unpivot',target:{kind:'new',type:'transform.collapse_columns',label:'VariantSource',position:{x:330,y:260}},inputs:[{source:source.output.node,input:0,output:0}],parameters:{information:['Key'].map(field),transposed:['RealValue','TextValue','FlagValue','WhenValue'].map(field),ignore_empty:false}});await save('variant-source',collapsed);need(collapsed.status==='SUCCEEDED','collapse source failed');
 need(prepared.package_ref.path===saved.output.package_ref.path&&prepared.package_ref.path===packagePath,'own bootstrap path changed');
 const sourceSave=await runtime.run('package.save_checkpoint',{path:packagePath,conflict_policy:'replace'},{operationId:'save-source'});await save('source-save',sourceSave);need(sourceSave.status==='SUCCEEDED'&&sourceSave.output.save_completed,'source-only save failed');
 await save('source-manifest',{kind:'source_only',csv:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},sourcePackage:packagePath,nodes:[source.output.node,collapsed.output.node],import:source.output.configuration.readback,collapse:collapsed.output.configuration.readback});
 const closing=await execute(makePackageCleanupCode({sessionId:sid,documentId:prepared.document_id,account:config.username,packagePath,loginomUrl:config.url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid}));need(closing.package_closed&&closing.logged_out,'source save cleanup failed');await save('source-cleanup',closing);
 clean=closing;prepared=null;await save('result',{status:'PASS',phase:'prepared_variant_source_only',packagePath,csv:{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},cleanup:{package_closed:closing.package_closed,logged_out:closing.logged_out}});
} catch(error) {await save('failure',{error:error.message});console.log(JSON.stringify({status:'FAIL',error:error.message}));process.exitCode=1;}
finally {
 if(prepared?.package_ref?.path===packagePath)try{clean=await execute(makePackageCleanupCode({sessionId:sid,documentId:prepared.document_id,account:config.username,packagePath,loginomUrl:config.url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid,diagnosticDiscard:true}));}catch{}
 await save('cleanup',clean??{package_closed:false,logged_out:false});await context.close();console.log(JSON.stringify({cleanup:clean?.status,package_closed:clean?.package_closed,logged_out:clean?.logged_out}));
}
