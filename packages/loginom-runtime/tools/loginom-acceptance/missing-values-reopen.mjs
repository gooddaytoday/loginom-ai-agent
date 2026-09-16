#!/usr/bin/env node
// Separate operator browser after Hermes' final checkpoint. Never configures
// source or node settings from the goal; preserves each saved existing node.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';import {join,resolve} from 'node:path';import {homedir} from 'node:os';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {StreamableHTTPClientTransport} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import {createSession} from '../../client/lib/session.mjs';import {createActionRuntime} from '../../client/lib/executor.mjs';
import {createCandidateNodeSupport} from '../../client/lib/node-support.mjs';import {pinActionCatalog} from '../../client/lib/action-catalog.mjs';
import {makeWorkspacePrepareCode} from '../../client/lib/workspace.mjs';import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';import {createRedactor} from '../../client/lib/redact.mjs';
import {collectMissingValuesTable} from './collect_missing_values_table.mjs';import {inspectSavedMissingValuesSource,observeMissingValuesSourceOutput} from './inspect_missing_values_source.mjs';import {missingValuesGraphCode} from './collect_missing_values_graph.mjs';
process.umask(0o077);const arg=k=>{const i=process.argv.indexOf(k);if(i<0||!process.argv[i+1])throw Error('Required '+k);return process.argv[i+1];};
const diagnostic=process.argv.includes('--component-run');
if(diagnostic&&process.argv.includes('--pre-audit'))throw Error('Choose component diagnostics or autonomous evidence, not both');
// The component entry computes its gate from actual source journals and native
// save receipts. It does not consume a synthetic Hermes/pre-audit success flag.
const report=diagnostic?JSON.parse(execFileSync('python3',[new URL('./missing_values_component.py',import.meta.url).pathname,'--run',arg('--component-run')],{encoding:'utf8',maxBuffer:16*1024*1024})):JSON.parse(await fs.readFile(arg('--pre-audit'),'utf8'));
const plan=report.reopen_plan;
if(!plan||(!diagnostic&&Object.entries(report.checks).some(([k,v])=>k!=='independent_reopen_present'&&!v.passed))||!plan.package_path.startsWith('/test-4/packages/')||plan.runtime_revision!=='e909a974f924fe2be856eb9508cd85c42ac18245ea16df01c6bb75d8b4e874fc')throw Error('Verified working phase required before independent reopen');
const dir=resolve(arg('--out')),config=JSON.parse(await fs.readFile(arg('--config'),'utf8'));await fs.mkdir(dir,{recursive:false});await fs.mkdir(join(dir,'runtime'));await fs.symlink(join(homedir(),'.loginom-dock/runtime/browsers'),join(dir,'runtime/browsers'));
const redactor=createRedactor([config.api_key]);const save=async(name,value)=>fs.writeFile(join(dir,name),JSON.stringify(redactor.redact(value),null,2)+'\n',{mode:0o600,flag:'wx'});
const remote=new Client({name:'node14-independent-reopen',version:'1'}),browser=new Client({name:'node14-independent-browser',version:'1'});let session;
try{
 await remote.connect(new StreamableHTTPClientTransport(new URL(config.endpoint),{requestInit:{headers:{Authorization:'Bearer '+config.api_key}}}));
 const pinned=await pinActionCatalog(remote,{manifestUri:plan.manifest_uri,manifestSha256:plan.manifest_sha256,allowCandidate:true});
 session=await createSession({stateDir:dir,agent:'codex',adapterRevision:'node14-independent-reopen-v1',mode:'executor-replay'});Object.assign(session.metadata,pinned.pins,{targetIdentity:{origin:'http://logi-test-plan.bg.local',loginom_build:'7.4.2'}});if(session.metadata.clientRevision!==plan.runtime_revision)throw Error('Source pin differs');await save('session.json',session.metadata);
 const transport=new StdioClientTransport({command:process.execPath,args:[session.browserCli,'--config',session.browserConfig],env:{...getDefaultEnvironment(),PLAYWRIGHT_BROWSERS_PATH:session.browserRoot},stderr:'pipe'});transport.stderr?.on('data',()=>{});await browser.connect(transport);
 let seq=0;const execute=async code=>{const response=await browser.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:180000});await save('browser-'+(++seq)+'.json',response);for(const b of response.content??[]){if(b.type==='text'){try{return JSON.parse(b.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1]??b.text);}catch{}}}throw Error('Browser response unavailable');};
 const prepared=await execute(makeWorkspacePrepareCode({loginomUrl:'http://logi-test-plan.bg.local/app/?testable=true',compatibility:pinned.compatibility,sessionId:session.metadata.sessionId,operationId:'node14-independent-open',intent:'open_package',packagePath:plan.package_path,allowTestLogin:true,testLoginUser:'test-4'}));
 if(prepared.status!=='READY'||prepared.document_id===plan.old_document_id||prepared.package_ref.path!==plan.package_path)throw Error('Fresh saved package not opened');await save('prepare.json',prepared);
 const geometry=await execute('async page=>({viewport:page.viewportSize(),window:await page.evaluate(()=>({width:innerWidth,height:innerHeight,outerWidth,outerHeight,availableWidth:screen.availWidth,availableHeight:screen.availHeight}))})');await save('geometry.json',geometry);if(geometry.viewport!==null||geometry.window.width!==geometry.window.outerWidth||geometry.window.width<geometry.window.availableWidth*.9)throw Error('Independent native window not expanded');
 const record=createExecutionJournal({directory:dir,metadata:session.metadata});const runtime=createActionRuntime({pinned,execute,artifactStore:session.artifactStore,allowCandidate:true,onRecord:record,targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',...createCandidateNodeSupport({targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2'})});
 const index={scope:diagnostic?'native_component_diagnostic':'independent_full_reopen',model_started:false,prepare:prepared,geometry,runtime_revision:session.metadata.clientRevision,manifest_sha256:plan.manifest_sha256,results:{}};let i=0;
 for(const [label,before] of Object.entries(plan.final)){
  const node={document_id:prepared.document_id,workflow_id:prepared.workflow_ref.workflow_id,node_id:before.result.node.node_id},source={...node,node_id:before.source_result.node.node_id},id='node14-independent-'+(++i);
  const args={prepared,node:source,execute,record,receiptNamespace:session.metadata.sessionId,operationId:id+'-source-before'};
  const inspection=await inspectSavedMissingValuesSource(args);await save(id+'-inspection.json',inspection);
  const request={...before.request,operation_id:id,document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,target:{kind:'existing',type:'preprocessing.data_recovery',ref:node},parameters:{},inputs:[],mappings:[],finish:'execute',read:{ports:[0],sample_rows:10,require_exact_numbers:true},budgets:{configure_ms:180000,execute_ms:120000,total_ms:360000}};
  const outcome=await runtime.runNodeApply(request);await save(id+'-outcome.json',{request,outcome});if(outcome.status!=='SUCCEEDED')throw Error('Saved node failed '+label);
  const after=await observeMissingValuesSourceOutput({...args,operationId:id+'-source-after'});const graph=await execute(missingValuesGraphCode({prepared,sourceNodeId:source.node_id,targetNodeId:node.node_id}));
  const table=await collectMissingValuesTable({outcome,prepared,execute,record,receiptNamespace:session.metadata.sessionId,evidenceDir:dir,targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2'});
  const raw=JSON.parse(await fs.readFile(join(dir,id+'-independent-full-raw.json'),'utf8'));
  index.results[label]={request,result:outcome.output,source_inspection:inspection,source_after:after,graph,table,raw_table:raw};await save(id+'-complete.json',index.results[label]);console.log(JSON.stringify({label,rows:table.row_count,complete:true}));
 }
 await save('index.json',index);console.log(JSON.stringify({scope:diagnostic?'native_component_diagnostic':'independent_full_reopen',full_goal_accepted:false,results:Object.keys(index.results).length,output:dir,settings_reapplied:false,package_saved:false}));
}finally{await browser.callTool({name:'browser_close',arguments:{}}).catch(()=>{});await browser.close().catch(()=>{});await remote.close().catch(()=>{});}
