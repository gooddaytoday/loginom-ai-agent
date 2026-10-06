// LAB-15 addressed small TXT independent cold reader.
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
const terminal=transcript.filter(e=>e.type==='tool_use'&&['completed','error'].includes(e.part?.state?.status)).map(e=>{try{return {tool:e.part.tool,input:e.part.state.input,result:JSON.parse((e.part.state.output??e.part.state.error).split('\n\n')[0])};}catch{return e.part.tool==='loginom_dock_node_apply'&&e.part.state.status==='error'?{tool:e.part.tool,input:e.part.state.input,result:{tool_error:e.part.state.error}}:null;}}).filter(Boolean);
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
const {createExecutionJournal}=await load('client/lib/execution-journal.mjs');
const {createActionRuntime}=await load('client/lib/executor.mjs');
const {createCandidateNodeSupport}=await load('client/lib/node-support.mjs');
const {createArtifactStore}=await load('client/lib/artifacts.mjs');
const {makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
const session=randomUUID(),origin=new URL(config.loginom_url).origin,account=config.workflow_profile.loginom_user;
const storageDirectories=preparedReply.storage_directories;
need(['inputs','exports','packages'].every(k=>storageDirectories?.[k]==='/'+account),'ASSIGNED_STORAGE_DIFFERS');
const journal=createExecutionJournal({directory:output,metadata:{sessionId:session,clientRevision:resources.manifestHash,actionManifestDigest:resources.manifest.actionManifestSha256},knownSecrets:[config.api_key,config.workflow_profile.password].filter(Boolean)});

const record=async event=>{const saved=await journal(event);

 return saved;
};
const {context}=await loginBrowser({browserPath:resources.browserPath,profile:join(output,'browser'),candidate:{url:config.loginom_url,username:account,password:config.workflow_profile.password},headless:false,keepOpen:true});
const page=context.pages()[0],execute=code=>new Function('page',`return (${code})(page)`)(page);
const identity={sessionId:session,account,packagePath:saved.path,loginomUrl:config.loginom_url,loginomBuild:'7.4.2'};
let report={status:'FAIL',all_values_compared:false};
try{
 await withDiagnosticSession({context,execute,directory:output,identity,makeCleanupCode:options=>makePackageCleanupCode({...options,diagnosticDiscard:true})},async({bindPrepared})=>{
  const prepared=await bindPrepared(await execute(makeWorkspacePrepareCode({loginomUrl:page.url(),compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId:session,operationId:'txt-cold-open',intent:'open_package',packagePath:saved.path})));
  need(!prepared.workflow_ref.navigation_path.some(x=>x.label.endsWith('(только чтение)')),'SAVED_PACKAGE_READONLY');
  const adapter=createNodeTargetBrowserAdapter({execute,origin,build:'7.4.2'});
  const graph=await adapter.observe({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},Date.now()+30000);
  await writeFile(join(output,'graph.json'),JSON.stringify(graph,null,2));
  need(graph.links.length===0&&graph.nodes.every(n=>n.type==='bg-vendor-icon-modelvariables'),'PREFLIGHT_MUST_LEAVE_NO_IMPORT_NODE');
  const creations=terminal.filter(e=>e.tool==='loginom_dock_node_apply');
  need(creations.length===1&&creations[0].input.parameters.settings.columns.every(c=>c.source_name==='Name'),'REPEATED_SOURCE_REFERENCE_REQUIRED');
  need(creations[0].result?.tool_error?.trim()==='Error: Duplicate source column names'||creations[0].result?.tool_error?.trim()==='Duplicate source column names','EXACT_PREFLIGHT_REFUSAL_REQUIRED');
  const catalog=JSON.parse(await readFile(join(root,'runtime/executor/catalog/actions.json'),'utf8')),selectors=JSON.parse(await readFile(join(root,'runtime/executor/catalog/selectors.json'),'utf8'));
  const store=await createArtifactStore({directory:join(output,'artifacts'),sessionId:session,storageDirectories});
  const runtime=createActionRuntime({pinned:{actions:new Map(catalog.actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,targetOrigin:origin,targetBuild:'7.4.2',allowCandidate:true,artifactStore:store,...createCandidateNodeSupport({targetOrigin:origin,targetBuild:'7.4.2',storageDirectories})});
  // There is deliberately no import node. The admitted upload still has an
  // exact account-bound native storage destination; download its original bytes.
  const columns=expected.columns.map(({name,label,type})=>({name,label,type}));
  const sources={imports:[{configuration:{source:{source_path:transfer.destination},output_mapping:{fields:columns}}}]};
  const proofs=await verifyStaticSourceBytes({load,runtime,execute,sources,allowed:[{...expected.source,columns}],account,origin,output});
  report={status:'OBSERVED_NEGATIVE',case_id:expected.case_id,cli_delivery:transfer,package_path:saved.path,source:proofs.get(transfer.destination),graph_verified:true,import_nodes:0,graph_links:0,cold_execute_requested:false,execute_started:false};
  await writeFile(join(output,'readback.json'),JSON.stringify(report,null,2));
 });
}catch(error){report={...report,status:'FAIL',error:String(error.message).slice(0,1000)};}
const cleanup=JSON.parse(await readFile(join(output,'cleanup.json'),'utf8'));
report.cleanup={package_closed:cleanup.confirmed&&cleanup.receipt?.package_closed===true,logged_out:cleanup.confirmed&&cleanup.receipt?.logged_out===true};
await writeFile(join(output,'result.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,cleanup:report.cleanup,error:report.error}));
if(report.status!=='OBSERVED_NEGATIVE'||!cleanup.confirmed)process.exitCode=1;
