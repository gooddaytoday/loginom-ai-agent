#!/usr/bin/env node
// Independent corpus reader. An operator-reviewed plan supplies saved graph IDs and
// complete schemas; this reader never reapplies analytical configuration.
import fs from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {StreamableHTTPClientTransport} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import {createSession} from '../../client/lib/session.mjs';
import {pinActionCatalog} from '../../client/lib/action-catalog.mjs';
import {makeWorkspacePrepareCode} from '../../client/lib/workspace.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
import {createNodeTargetBrowserAdapter} from '../../client/lib/node-target-browser.mjs';
import {createNodeProcedure} from '../../client/lib/node-procedure.mjs';
import {withBrowserReceipt} from '../../client/lib/executor.mjs';
import {createNodeExecutionProcedure} from '../../client/lib/node-execution-procedure.mjs';
import {selectPreparedGraphNode} from '../../client/lib/node-graph-selection.mjs';
import {openPreparedWizard} from '../../client/lib/node-wizard-open.mjs';
import {closePreparedWizard} from '../../client/lib/node-wizard-close.mjs';
import {readImportDefinitionPages} from '../../client/lib/import-definition-pages.mjs';
import {readOutputDefinitionPages} from '../../client/lib/import-definition-pages.mjs';
import {makeTextExportContextCode} from '../../client/lib/text-export-context.mjs';
import {makeExportNextCode} from '../../client/lib/text-export-procedure.mjs';
import {collectVisibleFullTable} from './collect_missing_values_table.mjs';
import {makeReadOnlyWarningAcknowledgement} from './scenario-readonly-warning.mjs';
import {makeAuditNodeRevealCode} from './audit-node-reveal.mjs';
import {validateAuditReadScope} from './scenario-audit-scope.mjs';
import {makePackageCleanupCode,parsePackageCleanupResult} from '../../client/lib/package-cleanup.mjs';

process.umask(0o077);
const need=(value,message)=>{if(!value)throw Error(message);};
const arg=key=>{const i=process.argv.indexOf(key);need(i>=0&&process.argv[i+1],'Required '+key);return process.argv[i+1];};
const plan=JSON.parse(await fs.readFile(arg('--plan'),'utf8'));
need(plan.operator_reviewed===true&&plan.package_path?.startsWith('/mimo/MiMo-')&&plan.package_path.endsWith('.lgp')&&Array.isArray(plan.outputs)&&plan.outputs.length>0&&plan.expected_graph,'Reviewed saved-package audit plan required');
validateAuditReadScope(plan);
const readOnlyDiagnostic=process.argv.includes('--read-only-diagnostic');
need(!readOnlyDiagnostic||plan.acceptance_eligible===false,'Read-only exploration cannot be acceptance evidence');
const dir=resolve(arg('--out')),config=JSON.parse(await fs.readFile(arg('--config'),'utf8'));
await fs.mkdir(dir,{recursive:false});await fs.mkdir(join(dir,'runtime'));
await fs.symlink(join(homedir(),'.loginom-dock/runtime/browsers'),join(dir,'runtime/browsers'));
const redactor=createRedactor([config.api_key]);
const save=(name,value)=>fs.writeFile(join(dir,name),JSON.stringify(redactor.redact(value),null,2)+'\n',{mode:0o600,flag:'wx'});
const topology=g=>({nodes:g.nodes.map(n=>({id:n.ref.node_id,label:n.label,type:n.type})).sort((a,b)=>a.id.localeCompare(b.id)),links:g.links.map(e=>({source:e.source,output:e.output,target:e.target,input:e.input})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))});
const remote=new Client({name:'scenario-independent-catalog',version:'1'}),browser=new Client({name:'scenario-independent-browser',version:'1'});
let session, prepared, execute, index, sequence=0;
try {
 await remote.connect(new StreamableHTTPClientTransport(new URL(config.endpoint),{requestInit:{headers:{Authorization:'Bearer '+config.api_key}}}));
 const pinned=await pinActionCatalog(remote,{manifestUri:plan.manifest_uri,manifestSha256:plan.manifest_sha256,allowCandidate:true});
 const origin='http://10.200.11.224',build='7.4.2';
 need(config.loginom_url===origin+'/app/?testable=true'&&pinned.compatibility.loginom_build===build,'RC target differs');
 session=await createSession({stateDir:dir,agent:'codex',adapterRevision:'scenario-independent-reopen-v2',mode:'executor-replay'});
 Object.assign(session.metadata,pinned.pins,{targetIdentity:{origin,loginom_build:build}});
 need(session.metadata.clientRevision===plan.runtime_revision,'Source pin differs');await save('session.json',session.metadata);
 const transport=new StdioClientTransport({command:process.execPath,args:[session.browserCli,'--config',session.browserConfig],env:{...getDefaultEnvironment(),PLAYWRIGHT_BROWSERS_PATH:session.browserRoot},stderr:'pipe'});
 transport.stderr?.on('data',()=>{});await browser.connect(transport);
 execute=async code=>{
  const response=await browser.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:180000});
  await save('browser-'+(++sequence)+'.json',response);
  if(response.isError){
   const message=response.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')??'';
   // Preserve only these fixed readiness classifications for the source
   // adapter's read-only retry; never expose arbitrary upstream text.
   for(const known of ['Graph is blocked','Visible port identity is not rendered'])if(message.includes(known))throw Error(known);
   throw Error('Independent browser call failed');
  }
  for(const b of response.content??[])if(b.type==='text'){
   try{return JSON.parse(b.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1]??b.text);}catch{}
  }
  throw Error('Independent browser response unavailable');
 };
 prepared=await execute(makeWorkspacePrepareCode({loginomUrl:origin+'/app/?testable=true',compatibility:pinned.compatibility,sessionId:session.metadata.sessionId,operationId:'scenario-independent-open',intent:'open_package',packagePath:plan.package_path,allowTestLogin:true,testLoginUser:'mimo'}));
 await save('prepare.json',prepared);
 need(prepared.status==='READY'&&prepared.document_id!==plan.old_document_id&&prepared.package_ref.path===plan.package_path,'Fresh saved package not opened');
 need(readOnlyDiagnostic||!prepared.workflow_ref.navigation_path.some(c=>c.label.endsWith('(только чтение)')),'Original package remains locked; owner-session cleanup required');
 if(readOnlyDiagnostic&&prepared.workflow_ref.navigation_path.some(c=>c.label.endsWith('(только чтение)'))){
  const notice=await execute(makeReadOnlyWarningAcknowledgement({sessionId:session.metadata.sessionId,documentId:prepared.document_id,packagePath:plan.package_path}));
  await save('read-only-warning.json',notice);
  need(['ACKNOWLEDGED','ABSENT'].includes(notice.status),'Read-only warning is not the exact expected notice');
 }
 const geometry=await execute('async page=>({viewport:page.viewportSize(),window:await page.evaluate(()=>({width:innerWidth,height:innerHeight,outerWidth,outerHeight,availableWidth:screen.availWidth,availableHeight:screen.availHeight}))})');
 await save('geometry.json',geometry);need(geometry.viewport===null&&geometry.window.width>=geometry.window.availableWidth*.9,'Native window not expanded');
 const record=createExecutionJournal({directory:dir,metadata:session.metadata,knownSecrets:[config.api_key]});
 const adapter=createNodeTargetBrowserAdapter({execute,origin,build,pinned});
 const graph=()=>adapter.observe({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},Date.now()+30000);
 const before=await graph();await save('graph-before.json',before);
 index={scope:readOnlyDiagnostic?'diagnostic-read-only-saved-graph':'scenario-independent-saved-graph',read_only_diagnostic:readOnlyDiagnostic,model_started:false,settings_reapplied:false,package_saved:false,task:plan.task,run_id:plan.run_id,session:session.metadata,prepare:prepared,geometry,graph_before:before,results:{},numerical_audit:'PENDING',configuration_audit:'PENDING'};
 need(before.complete===true&&JSON.stringify(topology(before))===JSON.stringify(plan.expected_graph),'Saved graph differs from reviewed topology');
 for(const [number,output] of plan.outputs.entries()){
  const label=output.name,nodeMatch=before.nodes.filter(n=>n.ref.node_id===output.node_id&&n.type===output.type);
  const configurationOnly=output.configuration_only===true;
  need(nodeMatch.length===1&&(output.type==='exports.text'?configurationOnly&&output.port===null&&output.schema.length===0:Number.isInteger(output.port)&&output.schema.length>0&&output.schema.length<=1000),'Exact supported audit output required');
  const node=nodeMatch[0].ref,id='scenario-reopen-'+number;
  const operation={id,action:{action_key:'diagnostic.scenario_reopen',revision:'1'},deadline:Date.now()+600000};
  await save(id+'-viewport.json',await execute(makeAuditNodeRevealCode({prepared,node,origin,build,deadline:Date.now()+30000})));
  const channel=createNodeProcedure({operation,execute,record,targetOrigin:origin,targetBuild:build,maxSteps:4096,preparedNodeContext:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node},
   wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:session.metadata.sessionId,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
  let savedConfiguration;const savedMappings=[];
  let baseline,launch,identified,execution={status:'not_requested'},table=null;
  if(output.type!=='exports.text'){
  const driver=createNodeExecutionProcedure(channel,node);baseline=await driver.prepare();launch=await driver.launchGraph();identified=await driver.identify();execution=await driver.waitCompleted({});
  need(execution.status==='completed'&&execution.verified&&execution.owner_verified,'Saved output execution failed: '+label);
  if(!configurationOnly){
  table=await collectVisibleFullTable({outcome:{output:{operation_id:id,status:'SUCCEEDED',node,execution,output:{ports:[{port:output.port,schema:output.schema}]}}},
   prepared,execute,record,receiptNamespace:session.metadata.sessionId,evidenceDir:dir,targetOrigin:origin,targetBuild:build,columnCount:output.schema.length,port:output.port,allowFieldReordering:output.allow_field_reordering===true});
  need(table.complete===true,'Complete saved output required');
  }
  }
  if(plan.inspect_configuration===true){
   const readers={'transform.collapse_columns':['readCollapse','node_collapse'],'transform.calculator':['readCalculator','node_calculator'],'transform.group_data':['readGrouping','node_grouping'],'transform.sorting':['readSorting','node_sorting'],'transform.filter_data':['readFilter','node_filter']};
   need(['imports.text','exports.text'].includes(output.type)||readers[output.type],'Configuration auditor for this type is not implemented');
   const graphState=await channel.observe({condition:'saved node before settings audit',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
   await selectPreparedGraphNode(channel,graphState,'select saved node for independent inspection');
   await openPreparedWizard(channel);
   try{
    if(output.type==='exports.text'){
     const binding={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node};
     const initial=await channel.observe({condition:'saved export wizard',ready:s=>['input_mapping','text_export_params'].includes(s.wizard?.stage)});
     if(initial.wizard.stage==='input_mapping')await channel.perform({condition:'inspect saved export parameters',initialObservation:initial,ready:s=>s.wizard?.stage==='input_mapping',identity:()=>node,
      resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(es.length===1,'Exact export Next required');return {verb:'wizard_step',ref:es[0].ref,expected_stage:'text_export_params'};}});
     const source=await execute(makeTextExportContextCode(binding));
     need(source.verified===true&&source.stage==='text_export_params'&&source.values.destination.value===output.expected_destination&&output.expected_destination.startsWith(plan.package_path.slice(0,plan.package_path.lastIndexOf('/')+1)),'Saved export destination differs');
     // This is wizard navigation only. No Done/Execute is called; the complete
     // draft is cancelled below. The exact existing-file question may appear.
     const next=await execute(makeExportNextCode({binding,before:source,origin,operation_id:id+'-inspect-next',destination:output.expected_destination,overwrite:'replace',deadline:Date.now()+30000}));
     need(next.status==='SUCCEEDED'&&next.cleanup_complete===true&&next.output.format_page?.verified===true,'Saved export format inspection failed');
     savedConfiguration={source,format:next.output.format_page,inspection_only:true,executed:false};
    }else if(output.type==='imports.text'){
     const source=await channel.observe({condition:'saved import source',ready:s=>s.wizard?.stage==='text_import_file'&&s.wizard.import_source?.status==='draft_ui_values'});
     await channel.perform({condition:'inspect saved import format',initialObservation:source,ready:s=>s.wizard?.stage==='text_import_file',identity:()=>node,
      resolve:s=>{const controls=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(controls.length===1,'Exact import Next required');return {verb:'wizard_step',ref:controls[0].ref,expected_stage:'text_import_format'};}});
     const format=await channel.observe({condition:'saved import format ready',ready:s=>s.wizard?.stage==='text_import_format'&&s.wizard.settings?.status==='draft_ui_values'});
     const columns=await readImportDefinitionPages(channel);
     savedConfiguration={source:source.wizard.import_source,format:format.wizard.settings,columns};
    }else{
     const [flag,key]=readers[output.type];
     const state=await channel.observe({condition:'saved analytical settings', [flag]:true,ready:s=>s[key]?.verified===true&&s[key]?.inventory_complete===true});
     savedConfiguration=state[key];
    }
    await save(id+'-saved-settings.json',savedConfiguration);
   }finally{await closePreparedWizard(channel);}
  }
  const declared=plan.model_operations_for_review.filter(o=>o.node_id===output.node_id);
  need(declared.length===1,'Unique reviewed operation required for saved mappings');
  for(const mapping of declared[0].mappings??[]){
   need(mapping.direction==='output'&&mapping.port===0&&Object.keys(mapping).every(k=>['direction','port','autosync'].includes(k)), 'Explicit field mappings require a dedicated independent audit');
   await channel.openOutputPort(mapping.port);
   try{
    const observed=await channel.observe({condition:'saved output mapping settings',readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true&&s.node_mapping?.inventory_complete===true});
    const definition=await readOutputDefinitionPages(channel,{expectedCount:observed.node_mapping.target_fields.length});
    savedMappings.push({direction:mapping.direction,port:mapping.port,mapping:observed.node_mapping,definition});
   }finally{await closePreparedWizard(channel);}
  }
  index.results[label]={node,execution,baseline,launch,identified,table,savedConfiguration,
   ...(configurationOnly&&output.type!=='exports.text'?{read_scope:'intermediate_settings_only',read_omission_reason:output.read_omission_reason,covered_by:output.covered_by}:{}),
   ...(savedMappings.length?{savedMappings}:{})};
  await save(id+'.json',index.results[label]);console.log(JSON.stringify({label,rows:table?.row_count??null,complete:true,configuration_only:configurationOnly,settings_reapplied:false}));
 }
 index.graph_after=await graph();await save('graph-after.json',index.graph_after);
 need(JSON.stringify(topology(index.graph_after))===JSON.stringify(topology(before)),'Audit changed graph topology');
 console.log(JSON.stringify({scope:index.scope,results:Object.keys(index.results).length,output:dir,independent_audit_pending:true}));
} finally {
 let mayCloseBrowser=true;
 if(session&&execute&&prepared?.status==='READY'){
  mayCloseBrowser=false;
  const cleanupOptions={sessionId:session.metadata.sessionId,documentId:prepared.document_id,account:'mimo',packagePath:plan.package_path,
   loginomUrl:config.loginom_url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid,diagnosticDiscard:true,
   diagnosticReadOnly:prepared.workflow_ref.navigation_path.some(c=>c.label.endsWith('(только чтение)'))};
  const cleanup=await execute(makePackageCleanupCode(cleanupOptions));await save('package-cleanup.json',cleanup);
  parsePackageCleanupResult({content:[{type:'text',text:JSON.stringify(cleanup)}]},cleanupOptions);
  mayCloseBrowser=cleanup.status==='SUCCEEDED';
  if(cleanup.status!=='SUCCEEDED')process.exitCode=1;
  if(index){
   index.cleanup_response_sequence=sequence;index.package_cleanup=cleanup;
   if(index.graph_after)await save('index.json',index);
   else await save('index.partial.json',{...index,audit_complete:false,limitation:'Final graph verification was not completed; retained tables do not establish whole-scenario acceptance.'});
  }
 }
 if(mayCloseBrowser){
  await browser.callTool({name:'browser_close',arguments:{}}).catch(()=>{});
  await browser.close().catch(()=>{});
 }else console.error('Package cleanup blocked; owned browser retained for diagnosis.');
 await remote.close().catch(()=>{});
}
