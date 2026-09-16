#!/usr/bin/env node
// Independent reader v2: accepted node12 field permutation; cleanup also on failure.
// V1 is retained byte-for-byte because prior model runs pinned that operator file.
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
import {openNewOutputTable,configureTablePrecision,prepareTableRead,restoreTablePrecision,returnFromOutputTable} from '../../client/lib/node-output-procedure.mjs';
import {readTableOutputPages} from '../../client/lib/table-output-pages.mjs';
import {decodeTableOutput} from '../../client/lib/table-output-values.mjs';
import {makePackageCleanupCode,parsePackageCleanupResult} from '../../client/lib/package-cleanup.mjs';

process.umask(0o077);
const need=(value,message)=>{if(!value)throw Error(message);};
const arg=key=>{const i=process.argv.indexOf(key);need(i>=0&&process.argv[i+1],'Required '+key);return process.argv[i+1];};
const report=JSON.parse(await fs.readFile(arg('--pre-audit'),'utf8')),plan=report.reopen_plan;
need(report.ready_for_reopen===true&&Object.values(report.checks).every(x=>x.passed===true)&&plan?.package_path.startsWith('/test-2/packages/'),'Completed model audit required');
const dir=resolve(arg('--out')),config=JSON.parse(await fs.readFile(arg('--config'),'utf8'));
await fs.mkdir(dir,{recursive:false});await fs.mkdir(join(dir,'runtime'));
await fs.symlink(join(homedir(),'.loginom-dock/runtime/browsers'),join(dir,'runtime/browsers'));
const redactor=createRedactor([config.api_key]);
const save=(name,value)=>fs.writeFile(join(dir,name),JSON.stringify(redactor.redact(value),null,2)+'\n',{mode:0o600,flag:'wx'});
const expected=JSON.parse(await fs.readFile(new URL('./fixtures/rc-combined/expected.json',import.meta.url),'utf8'))[plan.case];
const remote=new Client({name:'rc-independent-catalog',version:'1'}),browser=new Client({name:'rc-independent-browser',version:'1'});
let session, prepared, execute, index, sequence=0;
try {
 await remote.connect(new StreamableHTTPClientTransport(new URL(config.endpoint),{requestInit:{headers:{Authorization:'Bearer '+config.api_key}}}));
 const pinned=await pinActionCatalog(remote,{manifestUri:plan.manifest_uri,manifestSha256:plan.manifest_sha256,allowCandidate:true});
 const origin='http://logi-test-plan.bg.local',build='7.4.2';
 need(config.loginom_url===origin+'/app/?testable=true'&&pinned.compatibility.loginom_build===build,'RC target differs');
 session=await createSession({stateDir:dir,agent:'codex',adapterRevision:'rc-independent-reopen-v2',mode:'executor-replay'});
 Object.assign(session.metadata,pinned.pins,{targetIdentity:{origin,loginom_build:build}});
 need(session.metadata.clientRevision===plan.runtime_revision,'Source pin differs');await save('session.json',session.metadata);
 const transport=new StdioClientTransport({command:process.execPath,args:[session.browserCli,'--config',session.browserConfig],env:{...getDefaultEnvironment(),PLAYWRIGHT_BROWSERS_PATH:session.browserRoot},stderr:'pipe'});
 transport.stderr?.on('data',()=>{});await browser.connect(transport);
 execute=async code=>{
  const response=await browser.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:180000});
  await save('browser-'+(++sequence)+'.json',response);
  need(!response.isError,'Independent browser call failed');
  for(const b of response.content??[])if(b.type==='text'){
   try{return JSON.parse(b.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1]??b.text);}catch{}
  }
  throw Error('Independent browser response unavailable');
 };
 prepared=await execute(makeWorkspacePrepareCode({loginomUrl:origin+'/app/?testable=true',compatibility:pinned.compatibility,sessionId:session.metadata.sessionId,operationId:'rc-independent-open',intent:'open_package',packagePath:plan.package_path,allowTestLogin:true,testLoginUser:'test-2'}));
 need(prepared.status==='READY'&&prepared.document_id!==plan.old_document_id&&prepared.package_ref.path===plan.package_path,'Fresh saved package not opened');
 await save('prepare.json',prepared);
 need(!prepared.workflow_ref.navigation_path.some(c=>c.label.endsWith('(только чтение)')),'Original package remains locked; owner-session cleanup required');
 const geometry=await execute('async page=>({viewport:page.viewportSize(),window:await page.evaluate(()=>({width:innerWidth,height:innerHeight,outerWidth,outerHeight,availableWidth:screen.availWidth,availableHeight:screen.availHeight}))})');
 await save('geometry.json',geometry);need(geometry.viewport===null&&geometry.window.width>=geometry.window.availableWidth*.9,'Native window not expanded');
 const record=createExecutionJournal({directory:dir,metadata:session.metadata,knownSecrets:[config.api_key]});
 const adapter=createNodeTargetBrowserAdapter({execute,origin,build,pinned});
 const graph=()=>adapter.observe({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},Date.now()+30000);
 const before=await graph();await save('graph-before.json',before);
 index={scope:'rc-independent-saved-graph',model_started:false,settings_reapplied:false,package_saved:false,case:plan.case,run_id:plan.run_id,session:session.metadata,prepare:prepared,geometry,graph_before:before,results:{}};
 for(const label of plan.leaves){
  const matches=before.nodes.filter(n=>n.ref.node_id===plan.nodes[label].node.node_id&&n.label===label&&n.type===plan.nodes[label].type);
  need(matches.length===1,'Saved leaf identity differs: '+label);const node=matches[0].ref,id='rc-reopen-'+label;
  const operation={id,action:{action_key:'diagnostic.rc_reopen',revision:'1'},deadline:Date.now()+600000};
  const channel=createNodeProcedure({operation,execute,record,targetOrigin:origin,targetBuild:build,maxSteps:4096,preparedNodeContext:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node},
   wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:session.metadata.sessionId,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
  const driver=createNodeExecutionProcedure(channel,node),baseline=await driver.prepare(),launch=await driver.launchGraph(),identified=await driver.identify(),execution=await driver.waitCompleted({});
  need(execution.status==='completed'&&execution.verified&&execution.owner_verified,'Saved leaf execution failed: '+label);
  const opened=await openNewOutputTable(channel,0),formatProof=await configureTablePrecision(channel,opened.table);
  let raw,data,readSettings,formatRestoration;
  try {
   readSettings=await prepareTableRead(channel,opened.table);raw=await readTableOutputPages(channel,opened.table,{sampleRows:10});
   const oracleColumns=expected[label].columns;
   let expectedColumns=oracleColumns;
   if(label==='Duplicates'){
    // Node12 acceptance already permits a saved permutation. Only column
    // positions come from Loginom; names, labels and types stay independent.
    const byName=new Map(oracleColumns.map(c=>[c.name,c]));
    need(raw.columns.length===oracleColumns.length&&new Set(raw.columns.map(c=>c.name)).size===oracleColumns.length
      &&raw.columns.every(c=>byName.has(c.name)&&['name','label','type'].every(k=>c[k]===byName.get(c.name)[k])),'Duplicates saved field definitions differ');
    expectedColumns=raw.columns.map(c=>byName.get(c.name));
   }
   data=decodeTableOutput(raw,{formatProof,readSettings,expectedColumns,requireExactNumbers:true});
   need(data.sample_complete===true,'Saved table incomplete');
  } finally {formatRestoration=await restoreTablePrecision(channel,formatProof);}
  const workflowReturn=await returnFromOutputTable(channel,opened.table);
  const result={operation_id:id,node,execution,output:{ports:[{...data,port:0,port_guid:opened.port_guid,execution_id:execution.execution_id}],format_restoration:formatRestoration,workflow_return:workflowReturn}};
  index.results[label]={result,baseline,launch,identified,opened,raw,formatProof,readSettings};
  await save(id+'.json',index.results[label]);console.log(JSON.stringify({label,rows:data.row_count,complete:true,settings_reapplied:false}));
 }
 index.graph_after=await graph();await save('graph-after.json',index.graph_after);
 console.log(JSON.stringify({scope:index.scope,results:Object.keys(index.results).length,output:dir,independent_audit_pending:true}));
} finally {
 let mayCloseBrowser=true;
 if(session&&execute&&prepared?.status==='READY'){
  mayCloseBrowser=false;
  const cleanupOptions={sessionId:session.metadata.sessionId,documentId:prepared.document_id,account:'test-2',packagePath:plan.package_path,
   loginomUrl:config.loginom_url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid,diagnosticDiscard:true};
  const cleanup=await execute(makePackageCleanupCode(cleanupOptions));await save('package-cleanup.json',cleanup);
  parsePackageCleanupResult({content:[{type:'text',text:JSON.stringify(cleanup)}]},cleanupOptions);
  mayCloseBrowser=cleanup.status==='SUCCEEDED';
  if(cleanup.status!=='SUCCEEDED')process.exitCode=1;
  if(index?.graph_after){index.cleanup_response_sequence=sequence;index.package_cleanup=cleanup;await save('index.json',index);}
 }
 if(mayCloseBrowser){
  await browser.callTool({name:'browser_close',arguments:{}}).catch(()=>{});
  await browser.close().catch(()=>{});
 }else console.error('Package cleanup blocked; owned browser retained for diagnosis.');
 await remote.close().catch(()=>{});
}
