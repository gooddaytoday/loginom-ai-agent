import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';

// Independent, destructive-to-its-own-draft diagnostic. Never opens an acceptance package.
// Uses only the exact candidate's normal guarded browser procedures, stopping before output mapping.
process.umask(0o077);
const args=parseArgs({options:{resources:{type:'string'},config:{type:'string'},output:{type:'string'}},strict:true}).values;
if(!args.resources||!args.config||!args.output)throw Error('Required: --resources --config --output');
const root=resolve(args.resources),out=resolve(args.output),load=p=>import(pathToFileURL(join(root,'runtime',p)).href);
await mkdir(out,{recursive:false,mode:0o700});
const cfg=JSON.parse(await readFile(args.config,'utf8')),login=cfg.loginom,folder='/'+login.username;
if(cfg.package_directory!==folder)throw Error('Personal package directory required');
const {verifyResources}=await load('src/resources.mjs'),resources=await verifyResources(root);
const {loginBrowser}=await load('src/connection-check.mjs');
const {makeWorkspacePrepareCode}=await load('client/lib/workspace.mjs');
const {makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
const {createActionRuntime,withBrowserReceipt}=await load('client/lib/executor.mjs');
const {createCandidateNodeSupport}=await load('client/lib/node-support.mjs');
const {createArtifactStore}=await load('client/lib/artifacts.mjs');
const {createExecutionJournal}=await load('client/lib/execution-journal.mjs');
const {createNodeTargetBrowserAdapter}=await load('client/lib/node-target-browser.mjs');
const {prepareNodeTarget}=await load('client/lib/node-target.mjs');
const {createNodeProcedure}=await load('client/lib/node-procedure.mjs');
const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
const {configureCalculator}=await load('client/lib/calculator-procedure.mjs');
const sid=randomUUID(),packagePath=folder+'/calculator-edit-diagnostic-'+sid+'.lgp';
const record=createExecutionJournal({directory:out,metadata:{sessionId:sid,clientRevision:resources.manifestHash},knownSecrets:[login.password,login.api_key]});
const persist=(name,v)=>writeFile(join(out,name+'.json'),JSON.stringify(v,null,2)+'\n',{mode:0o600});
const need=(v,m)=>{if(!v)throw Error(m);};
const actions=JSON.parse(await readFile(join(root,'runtime/executor/catalog/actions.json'))).actions;
const selectors=JSON.parse(await readFile(join(root,'runtime/executor/catalog/selectors.json'))).selectors;
const pinned={actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}};
const {context}=await loginBrowser({browserPath:resources.browserPath,profile:join(out,'browser'),candidate:login,headless:true,keepOpen:true});
const page=context.pages()[0],execute=code=>new Function('page',`return (${code})(page)`)(page);
const runtimeConfig={targetOrigin:new URL(login.url).origin,targetBuild:'7.4.2'},directories={packages:folder,inputs:folder,exports:folder};
let prepared,binding,channel,cleanup,failure;
const matrix={scope:'calculator_editing_and_syntax_before_output_mapping',full_acceptance:false,packagePath,resource_manifest_sha256:resources.manifestHash,checks:{}};
try {
 const inventory=await page.evaluate(()=>{const m=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;return {account:m?.FServerConnection?.UserName,packages:m?.PackageNodes?.Count};});
 need(inventory.account===login.username&&inventory.packages===0,'OWN_EMPTY_PROFILE_REQUIRED');await persist('initial-inventory',inventory);
 const artifactStore=await createArtifactStore({directory:join(out,'artifacts'),sessionId:sid});
 const runtime=createActionRuntime({pinned,execute,onRecord:record,artifactStore,allowCandidate:true,...runtimeConfig,...createCandidateNodeSupport({...runtimeConfig,storageDirectories:directories}),getStorageBinding:()=>binding});
 prepared=await execute(makeWorkspacePrepareCode({loginomUrl:login.url,compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId:sid,operationId:'diagnostic-new-draft',intent:'new_draft'}));
 need(prepared.status==='READY','DIAGNOSTIC_DRAFT_UNCONFIRMED');
 binding={version:1,session_id:sid,origin:runtimeConfig.targetOrigin,loginom_build:'7.4.2',document_id:prepared.document_id,loginom_account:login.username,directories};
 const saved=await runtime.run('package.save_checkpoint',{path:packagePath,conflict_policy:'fail'},{operationId:'diagnostic-empty-bootstrap'});await persist('bootstrap',saved);
 need(saved.status==='SUCCEEDED'&&saved.output.save_completed,'DIAGNOSTIC_BOOTSTRAP_UNCONFIRMED');
 const csvPath=join(out,'diagnostic.csv'),bytes=Buffer.from('Id;Quantity;UnitPrice;Comment\n1;2;3;ok\n');await writeFile(csvPath,bytes);
 const artifact=await artifactStore.admit({sourcePath:csvPath,name:'diagnostic-'+sid+'.csv',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),upload:{directory:folder,overwrite:'reject'}});
 const delivered=await runtime.deliverArtifact({operation_id:'diagnostic-delivery',artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:120000});await persist('delivery',delivered);need(delivered.outcome?.status==='SUCCEEDED','DIAGNOSTIC_DELIVERY_UNCONFIRMED');
 const columns=[['Id','integer'],['Quantity','real'],['UnitPrice','real'],['Comment','string']].map(([name,type])=>({source_name:name,name,label:name,type,data_kind:type==='real'?'Непрерывный':'Дискретный',used:true}));
 const imported=await runtime.runNodeApply({operation_id:'diagnostic-import',contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,target:{kind:'new',type:'imports.text',label:'Diagnostic input',position:{x:120,y:100}},inputs:[],mode:'delimited',parameters:{source:{artifact_id:artifact.artifact_id,upload_operation_id:'diagnostic-delivery:upload'},settings:{source:{source_path:artifact.upload.destination,encoding:'UTF-8 (65001)',rows_to_skip:0,first_line_as_title:true},format:{delimiter:';',decimal_separator:'.',null_marker:'\\N',text_qualifier:'"'},columns}},mappings:[],finish:'execute',read:{ports:[0],sample_rows:10,require_exact_numbers:true},budgets:{configure_ms:240000,execute_ms:60000,total_ms:360000}});
 await persist('import',imported);need(imported.status==='SUCCEEDED','DIAGNOSTIC_IMPORT_UNCONFIRMED');
 const adapter=createNodeTargetBrowserAdapter({execute,origin:runtimeConfig.targetOrigin,build:'7.4.2',pinned});
 const operation={id:'diagnostic-calculator-target',action:{action_key:'acceptance.calculator_edit',revision:'1'},deadline:Date.now()+540000};
 const target=await prepareNodeTarget({request:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,target:{kind:'new',type:'transform.calculator',label:'Editing diagnostic',position:{x:400,y:180}},inputs:[{source:imported.output.node,input:0,output:0}]},operation,adapter,record});await persist('target',target);
 need(target.status==='SUCCEEDED','DIAGNOSTIC_TARGET_UNCONFIRMED');
 const node=target.node.ref;
 channel=createNodeProcedure({operation:{id:'diagnostic-calculator-edit',action:{action_key:'acceptance.calculator_edit',revision:'1'},deadline:Date.now()+540000},execute,record,...runtimeConfig,maxSteps:4096,preparedNodeContext:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node},wrapMutation:(code,r)=>withBrowserReceipt(`(${code})(page)`,{receipt_namespace:sid,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
 await openPreparedWizard(channel);
 const baselineResult=await configureCalculator(channel,{expressions:[['Revenue','real','Quantity * UnitPrice',false],['Adjusted','real','Revenue + 0.0001',false],['UnitPrice','real','UnitPrice * 2',true],['Note','string','Concat(Comment, "!")',false]].map(([name,type,formula,replace])=>({target:{kind:'new'},name,label:name,type,formula,replace}))},{newNode:true});
 const baseline=baselineResult.configuration;await persist('baseline',baseline);
 const changed=await configureCalculator(channel,{expressions:[{target:{kind:'existing',name:'Note'},name:'ReportNote'}],order:['Revenue','Adjusted','ReportNote','UnitPrice']});
 const after=changed.configuration,keys=['record_id','expression_id','formula','type','label','replace','cached','intermediate','description'];
 need(JSON.stringify(baseline.input_fields)===JSON.stringify(after.input_fields),'INPUT_FIELDS_CHANGED');
 for(const before of baseline.expressions){const next=after.expressions.find(e=>e.record_id===before.record_id);need(next&&keys.every(k=>JSON.stringify(before[k])===JSON.stringify(next[k])),'UNREQUESTED_EXPRESSION_PROPERTY_CHANGED');need(next.name===(before.name==='Note'?'ReportNote':before.name),'EXPRESSION_RENAME_MISMATCH');}
 need(after.expressions.map(e=>e.name).join(',')==='Revenue,Adjusted,ReportNote,UnitPrice','EXPRESSION_ORDER_MISMATCH');
 matrix.checks.edit={status:'PASS',properties:keys,input_fields_preserved:true};await persist('edit-preservation',{before:baseline,after,receipt:changed});
 const invalid='Quantity * (';await configureCalculator(channel,{expressions:[{target:{kind:'existing',name:'Revenue'},formula:invalid}]});
 const ready=s=>s.wizard?.stage==='calculator'&&s.node_calculator?.verified===true;
 const beforeInvalid=await channel.observe({condition:'invalid syntax draft before native Next',readCalculator:true,ready});
 let rejected;
 try {await channel.perform({condition:'native syntax refusal',initialObservation:beforeInvalid,ready,identity:s=>s.prepared_node_context,resolve:s=>({verb:'wizard_step',ref:s.ui.elements.find(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step')).ref,expected_stage:['output_mapping','done']})});}
 catch(error){rejected={name:error.name,message:error.message,receipt:error.receipt};await persist('syntax-step',rejected);}
 const refusal=await channel.observe({condition:'native calculator refusal and unchanged invalid formula',readCalculator:true,ready});
 need(rejected&&refusal.node_calculator.syntax_error&&refusal.node_calculator.expressions.find(e=>e.name==='Revenue')?.formula===invalid,'NATIVE_SYNTAX_REFUSAL_UNCONFIRMED');
 matrix.checks.syntax={status:'PASS',formula:invalid,native_error:refusal.node_calculator.syntax_error,auto_repaired:false};await persist('syntax-refusal',{...matrix.checks.syntax,observed:refusal.node_calculator});
 const cancelled=await closePreparedWizard(channel);await persist('cancel',cancelled);need(cancelled.verified&&cancelled.draft_discarded&&!cancelled.settings_applied,'WIZARD_CANCEL_UNCONFIRMED');channel=null;
 matrix.checks.cancel={status:'PASS',draft_discarded:true,settings_applied:false};
} catch(error){failure=String(error.message);await persist('failure',{error:failure});process.exitCode=1;}
finally {
 if(channel)try{await persist('failure-cancel',await closePreparedWizard(channel));}catch(error){await persist('failure-cancel',{confirmed:false,error:String(error.message)});}
 if(prepared?.status==='READY')try{cleanup=await execute(makePackageCleanupCode({sessionId:sid,documentId:prepared.document_id,account:login.username,packagePath,loginomUrl:login.url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid,diagnosticDiscard:true}));}catch{}
 matrix.cleanup={package_closed:cleanup?.package_closed===true,logged_out:cleanup?.logged_out===true};
 matrix.status=!failure&&matrix.cleanup.package_closed&&matrix.cleanup.logged_out?'PASS':'FAIL';matrix.error=failure??(matrix.status==='PASS'?null:'DIAGNOSTIC_CLEANUP_UNCONFIRMED');
 await persist('cleanup',cleanup??matrix.cleanup);await persist('result',matrix);await context.close();if(matrix.status!=='PASS')process.exitCode=1;console.log(JSON.stringify(matrix));
}
