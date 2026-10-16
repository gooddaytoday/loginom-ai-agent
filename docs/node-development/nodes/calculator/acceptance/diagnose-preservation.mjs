import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
import {configureSessionStorage} from '../../../../../services/loginom-ai/deploy/loginom-dock/build-action-catalog.mjs';

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
const {loginBrowser,loginPage}=await load('src/connection-check.mjs');
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
const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
// Keep the full native breadcrumb visible; overflow prevents guarded wizard ownership.
const sid=randomUUID(),packagePath=folder+'/cdiag_'+sid.replaceAll('-','').slice(0,16)+'.lgp';
const record=createExecutionJournal({directory:out,metadata:{sessionId:sid,clientRevision:resources.manifestHash},knownSecrets:[login.password,login.api_key]});
const persist=(name,v)=>writeFile(join(out,name+'.json'),JSON.stringify(v,null,2)+'\n',{mode:0o600});
const need=(v,m)=>{if(!v)throw Error(m);};
// Apply the repository's standard session-storage catalog builder, as the host does.
// Do not widen a legacy catalog's allowed_roots or remove any destination checks.
const actions=configureSessionStorage(JSON.parse(await readFile(join(root,'runtime/executor/catalog/actions.json')))).actions;
const selectors=JSON.parse(await readFile(join(root,'runtime/executor/catalog/selectors.json'))).selectors;
const pinned={actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}};
const {context}=await loginBrowser({browserPath:resources.browserPath,profile:join(out,'browser'),candidate:login,headless:true,keepOpen:true});
const page=context.pages()[0],execute=code=>new Function('page',`return (${code})(page)`)(page);
const runtimeConfig={targetOrigin:new URL(login.url).origin,targetBuild:'7.4.2'},directories={packages:folder,inputs:folder,exports:folder};
let prepared,binding,channel,cleanup,failure;
const matrix={scope:'calculator_nondefault_property_preservation_before_output_mapping',full_acceptance:false,packagePath,resource_manifest_sha256:resources.manifestHash,checks:{}};
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
 cleanup=await execute(makePackageCleanupCode({sessionId:sid,documentId:prepared.document_id,account:login.username,packagePath,loginomUrl:login.url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid}));
 await persist('bootstrap-cleanup',cleanup);need(cleanup.package_closed&&cleanup.logged_out,'DIAGNOSTIC_BOOTSTRAP_CLEANUP_UNCONFIRMED');
 prepared=null;cleanup=null;
 await loginPage(page,login);
 runtime.assertPreparationAllowed();
 prepared=await execute(makeWorkspacePrepareCode({loginomUrl:login.url,compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId:sid,operationId:'diagnostic-canonical-open',intent:'open_package',packagePath}));
 need(prepared.status==='READY'&&prepared.package_ref.path===packagePath,'DIAGNOSTIC_SAVED_IDENTITY_UNCONFIRMED');
 const csvPath=join(out,'diagnostic.csv'),bytes=Buffer.from('Id;Quantity;UnitPrice;Comment\n1;2;3;ok\n');await writeFile(csvPath,bytes);
 const artifact=await artifactStore.admit({sourcePath:csvPath,name:'diagnostic-'+sid+'.csv',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),upload:{directory:folder,overwrite:'reject'}});
 const delivered=await runtime.deliverArtifact({operation_id:'diagnostic-delivery',artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:120000});await persist('delivery',delivered);need(delivered.outcome?.status==='SUCCEEDED','DIAGNOSTIC_DELIVERY_UNCONFIRMED');
 const columns=[['Id','integer'],['Quantity','real'],['UnitPrice','real'],['Comment','string']].map(([name,type])=>({source_name:name,name,label:name,type,data_kind:type==='real'?'Непрерывный':'Дискретный',used:true}));
 const imported=await runtime.runNodeApply({operation_id:'diagnostic-import',contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,target:{kind:'new',type:'imports.text',label:'DiagInput',position:{x:120,y:100}},inputs:[],mode:'delimited',parameters:{source:{artifact_id:artifact.artifact_id,upload_operation_id:'diagnostic-delivery:upload'},settings:{source:{source_path:artifact.upload.destination,encoding:'UTF-8 (65001)',rows_to_skip:0,first_line_as_title:true},format:{delimiter:';',decimal_separator:'.',null_marker:'\\N',text_qualifier:'"'},columns}},mappings:[],finish:'execute',read:{ports:[0],sample_rows:10,require_exact_numbers:true},budgets:{configure_ms:240000,execute_ms:60000,total_ms:360000}});
 await persist('import',imported);
 if(imported.status!=='SUCCEEDED')await persist('import-inspect',await runtime.inspect({operationId:'diagnostic-import'}));
 need(imported.status==='SUCCEEDED','DIAGNOSTIC_IMPORT_UNCONFIRMED');
 const adapter=createNodeTargetBrowserAdapter({execute,origin:runtimeConfig.targetOrigin,build:'7.4.2',pinned});
 const operation={id:'diagnostic-calculator-target',action:{action_key:'acceptance.calculator_edit',revision:'1'},deadline:Date.now()+540000};
 const target=await prepareNodeTarget({request:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,target:{kind:'new',type:'transform.calculator',label:'DiagCalc',position:{x:400,y:180}},inputs:[{source:imported.output.node,input:0,output:0}]},operation,adapter,record});await persist('target',target);
 need(target.status==='SUCCEEDED','DIAGNOSTIC_TARGET_UNCONFIRMED');
 const node=target.node.ref;
 channel=createNodeProcedure({operation:{id:'diagnostic-calculator-edit',action:{action_key:'acceptance.calculator_edit',revision:'1'},deadline:Date.now()+540000},execute,record,...runtimeConfig,maxSteps:4096,preparedNodeContext:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node},wrapMutation:(code,r)=>withBrowserReceipt(`(${code})(page)`,{receipt_namespace:sid,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
 const graph=await channel.observe({condition:'owned diagnostic calculator on graph',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,graph,'select owned diagnostic calculator');
 await openPreparedWizard(channel);
 const baselineResult=await configureCalculator(channel,{expressions:[['Revenue','real','Quantity * UnitPrice',false],['Adjusted','real','Revenue + 0.0001',false],['UnitPrice','real','UnitPrice * 2',true],['Note','string','Concat(Comment, "!")',false]].map(([name,type,formula,replace])=>({target:{kind:'new'},name,label:name,type,formula,replace}))},{newNode:true});
 // Native fixture preparation uses existing observed UI contracts. These are
 // deliberately not new node.apply parameters or proof of execution semantics.
 const ready=s=>s.wizard?.stage==='calculator'&&s.node_calculator?.verified===true;
 const fixtures=[
  {name:'Revenue',cached:true,intermediate:false,description:'Cached revenue preservation fixture'},
  {name:'Adjusted',cached:false,intermediate:true,description:'Intermediate adjustment preservation fixture'},
  {name:'Note',cached:true,intermediate:true,description:'Cached intermediate note preservation fixture'},
 ];
 for(const fixture of fixtures){
  let state=await channel.observe({condition:'owned fixture expression inventory',readCalculator:true,ready});
  const original=state.node_calculator.expressions.find(e=>e.name===fixture.name);
  need(original,'FIXTURE_EXPRESSION_MISSING');
  const row=s=>s.ui.elements.find(e=>e.tid===s.wizard.root_tid+';CalcDataWizard;colExpressionName_'+fixture.name);
  if(!original.selected){
   await channel.perform({condition:'select retained fixture expression',initialObservation:state,ready,identity:()=>({record_id:original.record_id}),resolve:s=>({verb:'click',ref:row(s).ref})});
   state=await channel.observe({condition:'fixture expression selected',readCalculator:true,ready});
  }
  need(state.node_calculator.expressions.find(e=>e.record_id===original.record_id)?.selected,'FIXTURE_SELECTION_UNCONFIRMED');
  await channel.perform({condition:'open native fixture parameters',initialObservation:state,ready,identity:()=>({record_id:original.record_id}),resolve:s=>({verb:'double_click',ref:row(s).ref})});
  const editorReady=s=>s.wizard?.stage==='calculator'&&s.wizard.expression_parameters?.status==='observed'
   &&s.wizard.expression_parameters.fields.name.value===fixture.name;
  state=await channel.observe({condition:'native fixture parameter contracts',ready:editorReady});
  await persist('fixture-'+fixture.name+'-before',state);
  const editorIdentity=s=>({record_id:original.record_id,editor:s.wizard.expression_parameters.root_ref,selected:s.wizard.expression_parameters.selected_expression});
  for(const key of ['intermediate','cached']){
   const option=state.wizard.expression_parameters.options[key];
   need(option?.status==='observed'&&option.enabled,'NATIVE_FIXTURE_OPTION_UNAVAILABLE: '+key);
   if(option.value!==fixture[key]){
    const ref=option.display_ref;
    need(state.ui.elements.some(e=>e.ref===ref&&e.allowed_actions.includes('set_checked')),'NATIVE_FIXTURE_CHECK_CONTRACT_UNAVAILABLE: '+key);
    await channel.perform({condition:'prepare fixture '+key,initialObservation:state,ready:editorReady,identity:editorIdentity,resolve:()=>({verb:'set_checked',ref,checked:fixture[key]})});
    state=await channel.observe({condition:'fixture '+key+' readback',ready:editorReady});
    need(state.wizard.expression_parameters.options[key].value===fixture[key],'NATIVE_FIXTURE_OPTION_UNCONFIRMED: '+key);
   }
  }
  const description=s=>s.ui.elements.filter(e=>e.identity?.anchor_tid===s.wizard.root_tid+';ExprDataEditForm;txtDescription'&&e.signature?.tag==='textarea'&&e.scope==='dialog');
  const fields=description(state);
  need(fields.length===1&&fields[0].allowed_actions.includes('fill')&&fields[0].signature.dialog_ref===state.wizard.expression_parameters.root_ref,'NATIVE_DESCRIPTION_FILL_UNAVAILABLE');
  await channel.perform({condition:'prepare nonempty native fixture description',initialObservation:state,ready:editorReady,identity:editorIdentity,resolve:s=>({verb:'fill',ref:description(s)[0].ref,text:fixture.description})});
  state=await channel.observe({condition:'nondefault fixture parameter readback',ready:editorReady});
  need(description(state)[0]?.value===fixture.description&&['intermediate','cached'].every(k=>state.wizard.expression_parameters.options[k].value===fixture[k]),'NATIVE_FIXTURE_PARAMETERS_UNCONFIRMED');
  await persist('fixture-'+fixture.name+'-prepared',state);
  await channel.perform({condition:'apply owned native fixture parameters',initialObservation:state,ready:editorReady,identity:editorIdentity,resolve:s=>({verb:'apply_expression_parameters',ref:s.ui.elements.find(e=>e.tid===s.wizard.root_tid+';ExprDataEditForm;btnApply'&&e.allowed_actions.includes('apply_expression_parameters')).ref})});
  state=await channel.observe({condition:'complete nondefault fixture inventory',readCalculator:true,ready});
  const actual=state.node_calculator.expressions.find(e=>e.record_id===original.record_id);
  need(actual&&['cached','intermediate','description'].every(k=>actual[k]===fixture[k]),'NATIVE_FIXTURE_APPLY_UNCONFIRMED');
  need(['expression_id','name','label','type','formula','replace'].every(k=>JSON.stringify(actual[k])===JSON.stringify(original[k])),'FIXTURE_PREPARATION_CHANGED_UNREQUESTED_PROPERTY');
  await persist('fixture-'+fixture.name+'-applied',state.node_calculator);
 }
 const fixtureState=await channel.observe({condition:'full nondefault baseline before rename and reorder',readCalculator:true,ready});
 const baseline=fixtureState.node_calculator;
 need(JSON.stringify(baseline.input_fields)===JSON.stringify(baselineResult.configuration.input_fields),'FIXTURE_PREPARATION_CHANGED_INPUT_FIELDS');
 need(fixtures.every(f=>baseline.expressions.some(e=>e.name===f.name&&['cached','intermediate','description'].every(k=>e[k]===f[k]))),'NONDEFAULT_BASELINE_UNCONFIRMED');
 await persist('baseline',baseline);
 const changed=await configureCalculator(channel,{expressions:[{target:{kind:'existing',name:'Note'},name:'ReportNote'},{target:{kind:'existing',name:'Adjusted'},name:'AdjustedInternal'}],order:['ReportNote','Revenue','UnitPrice','AdjustedInternal']});
 const after=changed.configuration,keys=['record_id','expression_id','formula','type','label','replace','cached','intermediate','description'];
 need(JSON.stringify(baseline.input_fields)===JSON.stringify(after.input_fields),'INPUT_FIELDS_CHANGED');
 for(const before of baseline.expressions){const next=after.expressions.find(e=>e.record_id===before.record_id);need(next&&keys.every(k=>JSON.stringify(before[k])===JSON.stringify(next[k])),'UNREQUESTED_EXPRESSION_PROPERTY_CHANGED');need(next.name===({Note:'ReportNote',Adjusted:'AdjustedInternal'}[before.name]??before.name),'EXPRESSION_RENAME_MISMATCH');}
 need(after.expressions.map(e=>e.name).join(',')==='ReportNote,Revenue,UnitPrice,AdjustedInternal','EXPRESSION_ORDER_MISMATCH');
 matrix.checks.nondefault_preservation={status:'PASS',fixtures,properties:keys,input_fields_preserved:true};
 await persist('edit-preservation',{before:baseline,after,receipt:changed});
 const beforeCancel=await channel.observe({condition:'calculator remains before output mapping',readCalculator:true,ready});
 await persist('before-cancel',beforeCancel.node_calculator);
 const cancelled=await closePreparedWizard(channel);await persist('cancel',cancelled);need(cancelled.verified&&cancelled.draft_discarded&&!cancelled.settings_applied,'WIZARD_CANCEL_UNCONFIRMED');channel=null;
 matrix.checks.cancel={status:'PASS',draft_discarded:true,settings_applied:false};
} catch(error){failure=String(error.message);await persist('failure',{error:failure,receipt:error.receipt??null});process.exitCode=1;}
finally {
 if(channel)try{
  let state=await channel.observe({condition:'diagnostic surface before failure cancellation',ready:s=>s.prepared_node_context?.verified===true&&['graph','wizard'].includes(s.prepared_node_context.surface)});
  if(state.wizard?.expression_parameters?.status==='observed'){
   await channel.perform({condition:'cancel exact owned fixture parameter editor after failure',initialObservation:state,ready:s=>s.wizard?.expression_parameters?.status==='observed',identity:s=>s.wizard.expression_parameters.selected_expression,resolve:s=>({verb:'cancel_expression_parameters',ref:s.ui.elements.find(e=>e.tid===s.wizard.root_tid+';ExprDataEditForm;btnCancel'&&e.allowed_actions.includes('cancel_expression_parameters')).ref})});
   state=await channel.observe({condition:'fixture parameter editor closed before wizard cancellation',ready:s=>s.prepared_node_context?.verified===true&&!s.wizard?.expression_parameters&&['graph','wizard'].includes(s.prepared_node_context.surface)});
  }
  await persist('failure-cancel',state.wizard?.status==='absent'?{confirmed:true,wizard_absent:true}:await closePreparedWizard(channel));
 }catch(error){await persist('failure-cancel',{confirmed:false,error:String(error.message)});}
 if(prepared?.status==='READY')try{cleanup=await execute(makePackageCleanupCode({sessionId:sid,documentId:prepared.document_id,account:login.username,packagePath,loginomUrl:login.url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid,diagnosticDiscard:true}));}catch{}
 matrix.cleanup={package_closed:cleanup?.package_closed===true,logged_out:cleanup?.logged_out===true};
 matrix.status=!failure&&matrix.cleanup.package_closed&&matrix.cleanup.logged_out?'PASS':'FAIL';matrix.error=failure??(matrix.status==='PASS'?null:'DIAGNOSTIC_CLEANUP_UNCONFIRMED');
 await persist('cleanup',cleanup??matrix.cleanup);await persist('result',matrix);await context.close();if(matrix.status!=='PASS')process.exitCode=1;console.log(JSON.stringify(matrix));
}
