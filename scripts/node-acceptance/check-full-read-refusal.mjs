import fs from 'node:fs/promises';
import {writePrivateJson} from './private-json.mjs';
import {matchesExpectedOutput} from './expected-outputs.mjs';
process.umask(0o077);
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const [root,dir]=process.argv.slice(2),load=n=>import(pathToFileURL(root+'/runtime/'+n).href);
const config=JSON.parse(await fs.readFile(dir+'/config.json'));
if(config.source_name!=='lab12-stage2-source-v3'||typeof config.report_name!=='string'||!/^native-refusal-[A-Za-z0-9_-]+$/.test(config.report_name))throw Error('OWN_NEW_DIAGNOSTIC_PATH_REQUIRED');
const {verifyResources}=await load('src/resources.mjs'),resources=await verifyResources(root);
// Preflight pinned catalog paths before login or any package mutation.
const actions=JSON.parse(await fs.readFile(root+'/runtime/executor/catalog/actions.json')).actions,selectors=JSON.parse(await fs.readFile(root+'/runtime/executor/catalog/selectors.json')).selectors;
const {loginBrowser}=await load('src/connection-check.mjs');
const {makeWorkspacePrepareCode}=await load('client/lib/workspace.mjs');
const {makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
const {createActionRuntime}=await load('client/lib/executor.mjs');
const {createCandidateNodeSupport}=await load('client/lib/node-support.mjs');
const {createArtifactStore}=await load('client/lib/artifacts.mjs');
const {createExecutionJournal}=await load('client/lib/execution-journal.mjs');
const sid=randomUUID(),storage='/'+config.username,packagePath=storage+'/'+config.source_name+'.lgp';
let cleanupPath=packagePath;
const record=createExecutionJournal({directory:dir,metadata:{sessionId:sid},knownSecrets:[config.password,config.api_key]});
const {context}=await loginBrowser({browserPath:resources.browserPath,profile:dir+'/browser',candidate:config,keepOpen:true,headless:false});
const page=context.pages()[0];
const execute=async code=>{const r=await new Function('page',`return (${code})(page)`)(page);await record({phase:'diagnostic_browser_return',value:r});return r;};
const need=(v,m)=>{if(!v)throw Error(m);};
const save=(name,r)=>writePrivateJson(dir+'/'+name+'.json',r);
let prepared,clean,failure,proof;
try {
 const compatibility={loginom_build:'7.4.2',platform:'linux',browser:'chromium'};
 actions.find(a=>a.action_key==='package.save_checkpoint').effect.allowed_roots=[storage];
 const artifactStore=await createArtifactStore({directory:dir+'/artifacts',sessionId:sid});
 const runtimeConfig={targetOrigin:new URL(config.url).origin,targetBuild:'7.4.2'};
 const runtime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,...runtimeConfig,artifactStore,allowCandidate:true,...createCandidateNodeSupport(runtimeConfig)});
 prepared=await execute(makeWorkspacePrepareCode({loginomUrl:config.url,compatibility,sessionId:sid,operationId:'reopen-source',intent:'open_package',packagePath}));need(prepared.status==='READY','source reopen failed');
 const base={contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,inputs:[],mappings:[],finish:'execute',read:{ports:[0],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:240000,execute_ms:60000,total_ms:360000}};
 const activeBase=base,field=name=>({kind:'input_field',name});
 const typedBytes=await fs.readFile(dir+'/typed.csv'),typedArtifact=await artifactStore.admit({sourcePath:dir+'/typed.csv',name:'typed-'+dir.split('/').at(-1)+'.csv',bytes:typedBytes.length,sha256:createHash('sha256').update(typedBytes).digest('hex'),upload:{directory:storage,overwrite:'reject'}});
 const typedDelivery=await runtime.deliverArtifact({operation_id:'deliver-typed',artifact_id:typedArtifact.artifact_id,upload_grant_id:typedArtifact.upload.grant_id,budget_ms:120000});await save('typed-delivery',typedDelivery);need(typedDelivery.outcome?.status==='SUCCEEDED','typed delivery failed');
 const typedColumns=[['Region','string'],['Month','string'],['Category','string'],['Channel','string'],['Amount','real'],['Units','integer'],['Text','string'],['Flag','boolean'],['When','datetime']].map(([name,type])=>({name,label:name,type,data_kind:type==='real'?'Непрерывный':'Дискретный',used:true}));
 const typed=await runtime.runNodeApply({...activeBase,operation_id:'typed-source',mode:'delimited',target:{kind:'new',type:'imports.text',label:'TypedInput',position:{x:100,y:550}},parameters:{source:{artifact_id:typedArtifact.artifact_id,upload_operation_id:'deliver-typed:upload'},settings:{source:{source_path:typedArtifact.upload.destination,encoding:'UTF-8 (65001)',rows_to_skip:0,first_line_as_title:true},format:{delimiter:',',decimal_separator:'.',null_marker:'?',text_qualifier:'"'},columns:typedColumns}}});await save('typed-import',typed);need(typed.status==='SUCCEEDED','typed import failed');
 runtime.startNodeRead({operation_id:'typed-readonly-reexecution',source_operation_id:'typed-source',read:{ports:[0],sample_rows:100,require_exact_numbers:true},budget_ms:300000});
 let sourceJob;
 do{sourceJob=await runtime.waitNodeApply('typed-readonly-reexecution',{timeoutMs:10000});}while(sourceJob.state==='running');
 need(sourceJob.state==='settled'&&sourceJob.outcome,'source reread job did not settle');
 const refreshed=sourceJob.outcome;
 await save('source-reread',refreshed);need(refreshed.status==='SUCCEEDED'&&refreshed.cleanup_complete,'source readonly reexecution failed');
 const multi=await runtime.runNodeApply({...activeBase,operation_id:'multi',read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},mode:'pivot',target:{kind:'new',type:'transform.cross_table',label:'Two dimensions',position:{x:700,y:300}},inputs:[{source:typed.output.node,input:0,output:0}],parameters:{row_keys:['Region','Month'].map(field),columns:['Category','Channel'].map(field),facts:[{field:field('Amount'),functions:['sum','count']}],category_mode:'sliding'}});await save('multi',multi);need(multi.status==='FAILED'&&multi.cleanup_complete===true&&multi.output.pending_phase===null&&multi.output.execution.status==='completed','full refusal did not settle with cleanup');
 runtime.assertPreparationAllowed();
 if(config.report_name){
  const path=storage+'/'+config.report_name+'.lgp';
  const savedReport=await runtime.run('package.save_checkpoint',{path,conflict_policy:'fail'},{operationId:'save-diagnostic-report'});await save('report-save',savedReport);need(savedReport.status==='SUCCEEDED'&&savedReport.output.save_completed,'diagnostic report save failed');
  prepared={...prepared,package_ref:savedReport.output.package_ref};cleanupPath=path;
 }
 // Save As changes the package breadcrumb. Rebind the saved owned workflow
 // through standard preparation rather than editing or guessing its identity.
 runtime.assertPreparationAllowed();
 const reopened=await execute(makeWorkspacePrepareCode({loginomUrl:config.url,compatibility,sessionId:sid,
  operationId:'rebind-saved-report',intent:'open_package',packagePath:cleanupPath}));
 need(reopened.status==='READY'&&reopened.package_ref.path===cleanupPath,'saved report rebind failed');
 prepared=reopened;
 const {createNodeTargetBrowserAdapter}=await load('client/lib/node-target-browser.mjs');
 const adapter=createNodeTargetBrowserAdapter({execute,origin:runtimeConfig.targetOrigin,build:'7.4.2'});
 const graph=await adapter.observe({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},Date.now()+30000);
 const retained=graph.nodes.filter(n=>n.ref.node_id===multi.output.node.node_id&&n.type==='transform.cross_table');
 need(graph.complete&&graph.foreign_links.length===0&&retained.length===1,'saved report GUID changed');
 const corrected=await runtime.runNodeApply({...base,document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,
  operation_id:'scalar-after-refusal',mode:'pivot',target:{kind:'existing',type:'transform.cross_table',ref:retained[0].ref},
  parameters:{},inputs:[],mappings:[],read:{ports:[0],sample_rows:100,require_exact_numbers:true}});
 await save('corrected-read',corrected);need(corrected.status==='SUCCEEDED'&&corrected.cleanup_complete,'corrected scalar read failed');
 const expected=JSON.parse(await fs.readFile(dir+'/expected.json'));
 need(corrected.output.node.node_id===multi.output.node.node_id&&corrected.output.output.ports[0].schema.length===10
  &&matchesExpectedOutput(corrected.output.output.ports[0],expected),'10-field exact scalar report differs');
 need(cleanupPath!==packagePath,'source overwrite forbidden');
 const finalSave=await runtime.run('package.save_checkpoint',{path:cleanupPath,conflict_policy:'replace'},{operationId:'save-after-corrected-read'});
 await save('final-save',finalSave);need(finalSave.status==='SUCCEEDED'&&finalSave.output.save_completed,'second save failed');
 proof={refusal_status:multi.status,refusal_cleanup:multi.cleanup_complete,pending_phase:multi.output.pending_phase,
  source_readonly_reexecution:true,first_save_after_refusal:true,corrected_read:true,columns:10,node_id:multi.output.node.node_id,final_save:true};
} catch(error) {failure=error.message;await save('failure',{error:error.message});console.log(JSON.stringify({status:'FAIL',error:error.message}));process.exitCode=1;}
finally {
 if(prepared?.package_ref?.path===cleanupPath)try{clean=await execute(makePackageCleanupCode({sessionId:sid,documentId:prepared.document_id,account:config.username,packagePath:cleanupPath,loginomUrl:config.url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid,diagnosticDiscard:true}));}catch{}
 await save('cleanup',clean??{package_closed:false,logged_out:false});
 const cleanup={package_closed:clean?.package_closed===true,logged_out:clean?.logged_out===true};
 const passed=!failure&&cleanup.package_closed&&cleanup.logged_out;
 await save('result',{status:passed?'PASS':'FAIL',phase:'native_full_refusal_then_save',proof,packagePath:cleanupPath,error:failure??null,cleanup});
 if(!passed)process.exitCode=1;await context.close();console.log(JSON.stringify({cleanup:clean?.status,package_closed:clean?.package_closed,logged_out:clean?.logged_out}));
}
