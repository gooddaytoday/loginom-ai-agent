// Addressed LAB-14 supplement; leaves the general cold reader unchanged.
import {parseArgs} from 'node:util';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {withDiagnosticSession} from '../../../../../scripts/node-acceptance/diagnostic-session.mjs';
import {verifyStaticSourceBytes} from '../../../../../scripts/node-acceptance/static-source-proof.mjs';
const args=parseArgs({options:Object.fromEntries(['config','resources','saved','expected','output'].map(k=>[k,{type:'string'}])),strict:true}).values;
const need=(v,m)=>{if(!v)throw Error(m);};
const root=resolve(args.resources),output=resolve(args.output),load=name=>import(pathToFileURL(join(root,'runtime',name)).href);
const config=JSON.parse(await readFile(args.config,'utf8')),saved=JSON.parse(await readFile(args.saved,'utf8')),expected=JSON.parse(await readFile(args.expected,'utf8'));
// Bind the independent native source read to the CLI's admitted transfer,
// without using the model's table values as expected data.
const transcript=(await readFile(join(dirname(args.saved),'stdout.raw'),'utf8')).split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
const terminal=transcript.filter(e=>e.type==='tool_use'&&['completed','error'].includes(e.part?.state?.status)).map(e=>{try{return {tool:e.part.tool,input:e.part.state.input,result:JSON.parse(e.part.state.output??e.part.state.error)};}catch{return null;}}).filter(Boolean);
const preparedReply=terminal.find(e=>e.tool==='loginom_dock_prepare')?.result;
const admitted=preparedReply?.input_artifacts?.filter(a=>a.bytes===expected.source.bytes&&a.sha256===expected.source.sha256&&a.name.endsWith(expected.source.name));
need(admitted?.length===1,'EXACT_ADMITTED_TXT_REQUIRED');
const deliveries=terminal.filter(e=>e.tool==='loginom_dock_artifact_deliver');
need(deliveries.length===1&&deliveries[0].input.artifact_id===admitted[0].artifact_id&&deliveries[0].input.upload_grant_id===admitted[0].upload.grant_id,'DELIVERY_ADMISSION_UNBOUND');
const transfer=deliveries[0].result.output;
need(deliveries[0].result.status==='SUCCEEDED'&&transfer.upload_completion_verified===true&&transfer.cleanup_complete===true&&transfer.destination===admitted[0].upload.destination&&transfer.bytes===expected.source.bytes&&transfer.sha256===expected.source.sha256,'CLI_SOURCE_COPY_UNVERIFIED');
await mkdir(output,{recursive:true,mode:0o700});
const {verifyResources}=await load('src/resources.mjs');const resources=await verifyResources(root);
const {loginBrowser}=await load('src/connection-check.mjs');
const {makeWorkspacePrepareCode}=await load('client/lib/workspace.mjs');
const {createNodeTargetBrowserAdapter}=await load('client/lib/node-target-browser.mjs');
const {createNodeProcedure}=await load('client/lib/node-procedure.mjs');
const {createNodeExecutionProcedure}=await load('client/lib/node-execution-procedure.mjs');
const {createExecutionJournal}=await load('client/lib/execution-journal.mjs');
const {createActionRuntime,withBrowserReceipt}=await load('client/lib/executor.mjs');
const {createCandidateNodeSupport}=await load('client/lib/node-support.mjs');
const {createArtifactStore}=await load('client/lib/artifacts.mjs');
const {makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
const {isTextImportSourceReady}=await load('client/lib/text-import-procedure.mjs');
const {readImportDefinitionPages,readOutputDefinitionPages}=await load('client/lib/import-definition-pages.mjs');
const {makeTextExportContextCode}=await load('client/lib/text-export-context.mjs');
const session=randomUUID(),origin=new URL(config.loginom_url).origin,account=config.workflow_profile.loginom_user;
const storageDirectories=preparedReply.storage_directories;
need(['inputs','exports','packages'].every(k=>storageDirectories?.[k]==='/'+account),'ASSIGNED_STORAGE_DIFFERS');
const journal=createExecutionJournal({directory:output,metadata:{sessionId:session,clientRevision:resources.manifestHash,actionManifestDigest:resources.manifest.actionManifestSha256},knownSecrets:[config.api_key,config.workflow_profile.password].filter(Boolean)});
let exportExecution;
const record=async event=>{const saved=await journal(event);
 if(event.operation_id==='txt-cold-export'&&event.phase==='node_phase_completed'&&event.receipt?.phase==='execute')exportExecution=structuredClone(event.receipt.value);
 return saved;
};
const {context}=await loginBrowser({browserPath:resources.browserPath,profile:join(output,'browser'),candidate:{url:config.loginom_url,username:account,password:config.workflow_profile.password},headless:false,keepOpen:true});
const page=context.pages()[0],execute=code=>new Function('page',`return (${code})(page)`)(page);
const identity={sessionId:session,account,packagePath:saved.path,loginomUrl:config.loginom_url,loginomBuild:'7.4.2'};
let report={status:'FAIL',all_values_compared:false};
try{
 await withDiagnosticSession({context,execute,directory:output,identity,makeCleanupCode:makePackageCleanupCode},async({bindPrepared})=>{
  const prepared=await bindPrepared(await execute(makeWorkspacePrepareCode({loginomUrl:page.url(),compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId:session,operationId:'txt-cold-open',intent:'open_package',packagePath:saved.path})));
  need(!prepared.workflow_ref.navigation_path.some(x=>x.label.endsWith('(только чтение)')),'SAVED_PACKAGE_READONLY');
  const adapter=createNodeTargetBrowserAdapter({execute,origin,build:'7.4.2'});
  const graph=await adapter.observe({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},Date.now()+30000);
  await writeFile(join(output,'graph.json'),JSON.stringify(graph,null,2));
  const imports=graph.nodes.filter(n=>n.type==='imports.text'&&n.label==='Продажи TXT'),exports=graph.nodes.filter(n=>n.type==='exports.text'&&n.label==='Полный экспорт TXT');
  need(imports.length===1&&exports.length===1&&graph.nodes.every(n=>['imports.text','exports.text','bg-vendor-icon-modelvariables'].includes(n.type)),'EXACT_IMPORT_EXPORT_GRAPH_REQUIRED');
  const source=imports[0],target=exports[0];
  const settled=new Map(terminal.filter(e=>e.result.state==='settled').map(e=>[e.result.operation_id,e.result]));
  const completed=type=>terminal.filter(e=>e.tool==='loginom_dock_node_apply'&&e.input.target?.type===type).map(e=>settled.get(e.input.operation_id)).filter(r=>r?.status==='SUCCEEDED');
  const warmImports=completed('imports.text'),warmExports=completed('exports.text');
  need(warmImports.length===1&&warmExports.length===1&&warmImports[0].node.node_id===source.ref.node_id&&warmExports[0].node.node_id===target.ref.node_id,'PERSISTED_CLI_NODE_IDENTITY_DIFFERS');
  for(const [type,node] of [['imports.text',source],['exports.text',target]]){
   const creation=terminal.filter(e=>e.tool==='loginom_dock_node_apply'&&e.input.target?.kind==='new'&&e.input.target.type===type);
   need(creation.length===1,'ONE_ORIGINAL_NODE_CREATION_REQUIRED');
   const original=settled.get(creation[0].input.operation_id);
   need(original?.node?.node_id===node.ref.node_id&&original.cleanup_complete===true&&['SUCCEEDED','FAILED'].includes(original.status),'ORIGINAL_NODE_OWNERSHIP_OR_CLEANUP_UNCONFIRMED');
  }
  need(graph.links.length===1&&graph.links[0].source===source.ref.node_id&&graph.links[0].target===target.ref.node_id&&graph.links[0].input===0&&graph.links[0].output===0,'PERSISTED_LINK_DIFFERS');
  const channel=createNodeProcedure({operation:{id:'txt-cold-settings',action:{action_key:'acceptance.txt_settings',revision:'1'},deadline:Date.now()+540000},execute,record,targetOrigin:origin,targetBuild:'7.4.2',maxSteps:4096,preparedNodeContext:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:source.ref},wrapMutation:(code,r)=>withBrowserReceipt(`(${code})(page)`,{receipt_namespace:session,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
  let s=await channel.observe({condition:'saved source selection',ready:s=>s.prepared_node_context?.surface==='graph'});
  await selectPreparedGraphNode(channel,s,'select saved TXT source',{refreshReplacedBody:true});await openPreparedWizard(channel);
  let settings,format,fields;
  try{
  s=await channel.observe({condition:'saved TXT source fields',ready:isTextImportSourceReady});
  settings=Object.fromEntries(Object.entries(s.wizard.import_source.fields).map(([k,f])=>[k,f.value]));
  need(settings.source_path===transfer.destination&&settings.source_path.startsWith('/'+account+'/')&&settings.connection==='Локальное'&&/^UTF-8/.test(settings.encoding)&&Number(settings.rows_to_skip)===0&&settings.first_line_as_title===true,'PERSISTED_SOURCE_DIFFERS');
  await channel.perform({condition:'read saved format',initialObservation:s,ready:isTextImportSourceReady,identity:()=>source.ref,resolve:s=>{const controls=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(controls.length===1,'FORMAT_NEXT_AMBIGUOUS');return {verb:'wizard_step',ref:controls[0].ref,expected_stage:'text_import_format'};}});
  s=await channel.observe({condition:'saved format complete',ready:s=>s.wizard?.stage==='text_import_format'&&['delimiter','decimal_separator','null_marker','text_qualifier'].every(k=>s.wizard.settings?.fields[k]?.status==='observed'&&!s.wizard.settings.fields[k].truncated)});
  format=Object.fromEntries(['delimiter','decimal_separator','null_marker','text_qualifier'].map(k=>[k,s.wizard.settings.fields[k].value]));
  need([',','Запятая'].includes(format.delimiter)&&['.','Точка (.)'].includes(format.decimal_separator)&&format.null_marker==='?'&&['"','Двойная кавычка (")'].includes(format.text_qualifier),'PERSISTED_FORMAT_DIFFERS');
  const definition=await readImportDefinitionPages(channel,{expectedCount:7});
  fields=definition.fields.map(f=>Object.fromEntries(['name','label','type','data_kind'].map(k=>[k,f[k]])));
  need(JSON.stringify(fields)===JSON.stringify(expected.columns)&&definition.fields.every(f=>f.used===true),'PERSISTED_NATIVE_SCHEMA_DIFFERS');
  need((await closePreparedWizard(channel)).settings_applied===false,'SETTINGS_CANCEL_UNCONFIRMED');
  await channel.openOutputPort(0);const mapping=await readOutputDefinitionPages(channel,{expectedCount:7});
  need(JSON.stringify(mapping.fields.map(f=>Object.fromEntries(['name','label','type','data_kind'].map(k=>[k,f[k]]))))===JSON.stringify(expected.columns),'OUTPUT_SCHEMA_DIFFERS');
  need((await closePreparedWizard(channel)).settings_applied===false,'MAPPING_CANCEL_UNCONFIRMED');
  }catch(error){
   const owned=await channel.observe({condition:'TXT refusal owned wizard cleanup',ready:()=>true});
   if(owned.wizard?.status==='observed'&&owned.prepared_node_context?.surface==='wizard')need((await closePreparedWizard(channel)).settings_applied===false,'REFUSAL_DRAFT_CANCEL_UNCONFIRMED');
   throw error;
  }
  const catalog=JSON.parse(await readFile(join(root,'runtime/executor/catalog/actions.json'),'utf8')),selectors=JSON.parse(await readFile(join(root,'runtime/executor/catalog/selectors.json'),'utf8'));
  const store=await createArtifactStore({directory:join(output,'artifacts'),sessionId:session,storageDirectories});
  const runtime=createActionRuntime({pinned:{actions:new Map(catalog.actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,targetOrigin:origin,targetBuild:'7.4.2',allowCandidate:true,artifactStore:store,...createCandidateNodeSupport({targetOrigin:origin,targetBuild:'7.4.2',storageDirectories})});
  const sources={imports:[{node_id:source.ref.node_id,configuration:{source:settings,format,output_mapping:{fields}}}]};
  const proofs=await verifyStaticSourceBytes({load,runtime,execute,sources,allowed:[{...expected.source,columns:expected.columns.map(({data_kind,...f})=>f)}],account,origin,output});
  const returned=await adapter.activateWorkflow({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},{deadline:Date.now()+30000,receipt_id:'txt-cold-return'});
  need(returned.status==='SUCCEEDED'&&returned.verified&&returned.cleanup_complete,'SOURCE_READ_RETURN_UNCONFIRMED');
  const importDriver=createNodeExecutionProcedure(channel,source.ref);
  await importDriver.prepare();await importDriver.launchGraph();await importDriver.identify();
  const importExecution=await importDriver.waitCompleted({});
  need(importExecution.status==='completed'&&importExecution.verified&&importExecution.owner_verified,'FRESH_COLD_IMPORT_UNCONFIRMED');
  const exportChannel=createNodeProcedure({operation:{id:'txt-cold-export-settings',action:{action_key:'acceptance.txt_export_settings',revision:'1'},deadline:Date.now()+540000},execute,record,targetOrigin:origin,targetBuild:'7.4.2',maxSteps:4096,preparedNodeContext:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:target.ref},wrapMutation:(code,r)=>withBrowserReceipt(`(${code})(page)`,{receipt_namespace:session,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
  const selected=await exportChannel.observe({condition:'saved export selection',ready:s=>s.prepared_node_context?.surface==='graph'});
  await selectPreparedGraphNode(exportChannel,selected,'select saved TXT export',{refreshReplacedBody:true});await openPreparedWizard(exportChannel);
  await exportChannel.observe({condition:'saved export params',ready:s=>s.wizard?.stage==='text_export_params'});
  const exportBefore=await execute(makeTextExportContextCode({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:target.ref}));
  need(exportBefore.verified&&exportBefore.stage==='text_export_params'&&exportBefore.values.destination.value===saved.path.replace(/\.lgp$/,'-output.csv'),'SAVED_EXPORT_DESTINATION_DIFFERS');
  need((await closePreparedWizard(exportChannel)).settings_applied===false,'EXPORT_SETTINGS_CANCEL_UNCONFIRMED');
  // Reuse all persisted import/export settings. Only execution and file reading
  // are requested. Explicit replace authorizes this known output file only;
  // its destination is taken from the independent native saved-settings read.
  const request={operation_id:'txt-cold-export',contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,target:{kind:'existing',type:'exports.text',ref:target.ref},inputs:[],mode:'delimited',parameters:{destination:exportBefore.values.destination.value,overwrite:'replace'},mappings:[],finish:'execute',read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:600000,execute_ms:600000,total_ms:1200000}};
  const outcome=await runtime.runNodeApply(request);
  need(outcome.status==='SUCCEEDED'&&outcome.cleanup_complete===true&&outcome.output?.output?.file_artifacts?.length===1&&exportExecution?.verified===true&&exportExecution.owner_verified===true&&exportExecution.execution_id===outcome.output.execution?.execution_id,'FRESH_NATIVE_EXPORT_UNCONFIRMED');
  const file=outcome.output.output.file_artifacts[0],resolved=await store.resolveOutput(file.artifact_id);
  need(resolved.descriptor.sha256===file.sha256&&resolved.descriptor.bytes===file.bytes&&resolved.descriptor.execution_id===exportExecution.execution_id,'FRESH_EXPORT_BYTES_UNBOUND');
  await writeFile(join(output,'cold-output.csv'),resolved.buffer,{mode:0o600});
  report={status:'CHECK_VALUES',admitted_source:admitted[0],cli_delivery:transfer,package_path:saved.path,source:proofs.get(settings.source_path),native_schema:fields,settings,format,graph_verified:true,fresh_import_execution:importExecution,fresh_execution:exportExecution,output:file};
  await writeFile(join(output,'readback.json'),JSON.stringify(report,null,2));
 });
}catch(error){report={...report,status:'FAIL',error:String(error.message).slice(0,1000)};}
const cleanup=JSON.parse(await readFile(join(output,'cleanup.json'),'utf8'));
report.cleanup={package_closed:cleanup.confirmed&&cleanup.receipt?.package_closed===true,logged_out:cleanup.confirmed&&cleanup.receipt?.logged_out===true};
await writeFile(join(output,'result.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,cleanup:report.cleanup,error:report.error}));
if(report.status!=='CHECK_VALUES'||!cleanup.confirmed)process.exitCode=1;
