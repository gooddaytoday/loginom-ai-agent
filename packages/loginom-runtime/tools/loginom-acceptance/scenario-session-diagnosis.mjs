#!/usr/bin/env node
// Independent corpus reader. An operator-reviewed plan supplies saved graph IDs and
// complete schemas; this reader never reapplies analytical configuration.
import fs from 'node:fs/promises';
import readline from 'node:readline';
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
import {makeAuditNodeRevealCode} from './audit-node-reveal.mjs';
import {validateAuditReadScope} from './scenario-audit-scope.mjs';
import {makePackageCleanupCode,parsePackageCleanupResult} from '../../client/lib/package-cleanup.mjs';

process.umask(0o077);
const need=(value,message)=>{if(!value)throw Error(message);};
const arg=key=>{const i=process.argv.indexOf(key);need(i>=0&&process.argv[i+1],'Required '+key);return process.argv[i+1];};
const plan=JSON.parse(await fs.readFile(arg('--plan'),'utf8'));
need(plan.operator_reviewed===true&&plan.package_path?.startsWith('/mimo/MiMo-')&&plan.package_path.endsWith('.lgp')&&Array.isArray(plan.outputs)&&plan.outputs.length>0&&plan.expected_graph,'Reviewed saved-package audit plan required');
validateAuditReadScope(plan);
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
 console.log(JSON.stringify({status:'diagnostic_ready',out:dir,document_id:prepared.document_id,read_only:prepared.workflow_ref.navigation_path.some(c=>c.label.endsWith('(только чтение)'))}));
 for await(const line of readline.createInterface({input:process.stdin})){
  if(line==='exit')break;
  try { const code=await fs.readFile(resolve(line),'utf8');const r=await execute(code);await save('operator-'+sequence+'.json',r);console.log(JSON.stringify(r)); }
  catch {console.log(JSON.stringify({status:'operator_step_failed'}));}
 }
} finally {
 if(session&&execute&&prepared?.status==='READY'){
  const opts={sessionId:session.metadata.sessionId,documentId:prepared.document_id,account:'mimo',packagePath:plan.package_path,loginomUrl:config.loginom_url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid,diagnosticReadOnly:prepared.workflow_ref.navigation_path.some(c=>c.label.endsWith('(только чтение)'))};
  const cleanup=await execute(makePackageCleanupCode(opts));await save('diagnostic-cleanup.json',cleanup);
  console.log(JSON.stringify({cleanup:cleanup.status,reason:cleanup.reason}));
 }
 await browser.close().catch(()=>{});await remote.close().catch(()=>{});
}
