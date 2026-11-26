// Cold rerun through the installed browser procedures; no settings or Save.
// Input contains connection, saved package and resources; no oracle or D prompt.
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
process.umask(0o077);
const input=JSON.parse(await readFile(process.argv[2],'utf8'));
if (!input.connection?.username || !input.packagePath?.startsWith('/'+input.connection.username+'/') || !input.packagePath.endsWith('.lgp') || input.packagePath.split('/').length!==3 || input.packagePath.includes('..')) throw Error('COLD_PACKAGE_OWNER');
for (const key of ['resources','output','attemptDir','caseDir','skillEnv']) if (typeof input[key]!=='string' || !input[key].startsWith('/')) throw Error('COLD_PATH_REQUIRED');
const scripts=fileURLToPath(new URL('../skills/loginom-eval-case/scripts/',import.meta.url));
const env={...process.env,LOGINOM_EVAL_CASE_ENV:input.skillEnv};
const python=(name,args)=>execFileSync('python3',['-B',join(scripts,name),...args],{env,stdio:['ignore','pipe','pipe']});
const settings=Object.fromEntries((await readFile(input.skillEnv,'utf8')).split('\n').filter(l=>l.includes('=')&&!l.trimStart().startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const storage=JSON.parse(await readFile(join(input.attemptDir,'storage.json'),'utf8'));
if (settings.LOGINOM_USERNAME!==input.connection.username || settings.LOGINOM_URL!==input.connection.url || storage.package!==input.packagePath) throw Error('COLD_ATTEMPT_IDENTITY');
// Units may use the host Node; browser resources require their pinned executable.
const resourceRoot=await realpath(input.resources);
const runtimeManifest=JSON.parse(await readFile(join(resourceRoot,'resource-manifest.json'),'utf8'));
if (typeof runtimeManifest.node!=='string' || isAbsolute(runtimeManifest.node) || runtimeManifest.node.split(/[\\/]/).some(x=>x==='..'||x==='.')) throw Error('COLD_NODE_RUNTIME_INVALID');
const nodePath=await realpath(join(resourceRoot,runtimeManifest.node));
if (!nodePath.startsWith(resourceRoot+sep) || !/^[a-f0-9]{64}$/.test(runtimeManifest.nodeSha256) ||
    !Array.isArray(runtimeManifest.files) || !runtimeManifest.files.some(file=>file.path===runtimeManifest.node&&file.sha256===runtimeManifest.nodeSha256) ||
    createHash('sha256').update(await readFile(nodePath)).digest('hex')!==runtimeManifest.nodeSha256) throw Error('COLD_NODE_RUNTIME_INVALID');
if (await realpath(process.execPath)!==nodePath) {
 const child=spawnSync(nodePath,[fileURLToPath(import.meta.url),...process.argv.slice(2)],{stdio:'inherit'});
 if(child.error)throw child.error;
 process.exit(child.status??1);
}
const load=p=>import(pathToFileURL(join(resourceRoot,'runtime',p)).href);
const {verifyResources}=await load('src/resources.mjs');
const resources=await verifyResources(resourceRoot);
const serverPath=join(settings.LOGINOM_STORAGE,input.packagePath.split('/').at(-1));
const serverHash=()=>createHash('sha256').update(execFileSync('docker',['exec',settings.LOGINOM_CONTAINER,'cat',serverPath],{maxBuffer:64*1024*1024})).digest('hex');
const before=serverHash();
if(before!==createHash('sha256').update(await readFile(join(input.attemptDir,'package.lgp'))).digest('hex')) throw Error('COLD_PACKAGE_CHANGED');
await mkdir(input.output,{recursive:false,mode:0o700});
python('collect_artifacts.py',[input.attemptDir,'--park']);
const {loginBrowser}=await load('src/connection-check.mjs');
const {makeWorkspacePrepareCode}=await load('client/lib/workspace.mjs');
const {createNodeTargetBrowserAdapter}=await load('client/lib/node-target-browser.mjs');
const {createNodeProcedure}=await load('client/lib/node-procedure.mjs');
const {createNodeExecutionProcedure}=await load('client/lib/node-execution-procedure.mjs');
const {withBrowserReceipt}=await load('client/lib/executor.mjs');
const {createExecutionJournal}=await load('client/lib/execution-journal.mjs');
const {makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
if(!input.packagePath.startsWith('/'+input.connection.username+'/')||!input.packagePath.endsWith('.lgp'))throw Error('COLD_PACKAGE_OWNER');

const sessionId=randomUUID();
const record=createExecutionJournal({directory:input.output,metadata:{sessionId,clientRevision:resources.manifestHash},knownSecrets:[input.connection.password]});
const evidence={status:'FAIL',packagePath:input.packagePath,settingsApplied:false,saveRequested:false,executions:[]};
let context,prepared,execute;
try{
 const opened=await loginBrowser({browserPath:resources.browserPath,profile:join(input.output,'browser'),candidate:input.connection,headless:true,keepOpen:true,onContextCreated:c=>{context=c}});
 context=opened.context;
 const page=context.pages()[0];
 await page.setViewportSize({width:3840,height:2160});
 execute=code=>new Function('page',`return (${code})(page)`)(page);
 prepared=await execute(makeWorkspacePrepareCode({loginomUrl:page.url(),compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId,operationId:'analytics-cold-open',intent:'open_package',packagePath:input.packagePath}));
 await writeFile(join(input.output,'prepared.json'),JSON.stringify(prepared,null,2));
 if(prepared.status!=='READY'||prepared.package_ref?.path!==input.packagePath||prepared.workflow_ref.navigation_path.some(x=>x.label.endsWith('(только чтение)')))throw Error('COLD_COLD_OPEN_NOT_WRITABLE');
 const origin=new URL(input.connection.url).origin;
 const adapter=createNodeTargetBrowserAdapter({execute,origin,build:'7.4.2'});
 const graph=await adapter.observe({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},Date.now()+30000);
 await writeFile(join(input.output,'graph-before.json'),JSON.stringify(graph,null,2));
 const executable=graph.nodes.filter(n=>n.type!=='bg-vendor-icon-modelvariables');
 const remaining=[...executable],done=new Set();
 if(remaining.length<1)throw Error('COLD_COLD_GRAPH_BOUND');
 while(remaining.length){
  const index=remaining.findIndex(n=>graph.links.filter(l=>l.target===n.ref.node_id).every(l=>done.has(l.source)));
  if(index<0)throw Error('COLD_COLD_GRAPH_NOT_ACYCLIC');
  const target=remaining.splice(index,1)[0],node=target.ref;
  const operation={id:'analytics-cold-'+node.node_id,action:{action_key:'acceptance.cold_read',revision:'1'},deadline:Date.now()+240000};
  const channel=createNodeProcedure({operation,execute,record,targetOrigin:origin,targetBuild:'7.4.2',maxSteps:4096,preparedNodeContext:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node},wrapMutation:(code,r)=>withBrowserReceipt(`(${code})(page)`,{receipt_namespace:sessionId,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
  const driver=createNodeExecutionProcedure(channel,node,{allowDeactivate:true});
  await driver.prepare();
  await driver.launchGraph();
  await driver.identify();
  const execution=await driver.waitCompleted({});
  if(execution.status!=='completed'||!execution.verified||!execution.owner_verified)throw Error('COLD_COLD_EXECUTION_UNCONFIRMED');
  done.add(node.node_id);
  evidence.executions.push({node_id:node.node_id,label:target.label,type:target.type,execution});
  await writeFile(join(input.output,'executions.json'),JSON.stringify(evidence.executions,null,2));
  console.log(JSON.stringify({node:target.label,type:target.type,status:'completed'}));
 }
 evidence.nodeCount=executable.length;
 evidence.allNodesExecuted=done.size===executable.length;
 await page.screenshot({path:join(input.output,'graph-after.png'),fullPage:true});
 evidence.status='UI_ALL_NODES_EXECUTED';
}catch(error){
 evidence.error=String(error.message).split(input.connection.password).join('[REDACTED]');
 process.exitCode=1;
}finally{
 try{
  if(prepared?.status==='READY'){
   const cleanup=await execute(makePackageCleanupCode({sessionId,documentId:prepared.document_id,account:input.connection.username,packagePath:input.packagePath,loginomUrl:input.connection.url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid,diagnosticDiscard:true,diagnosticWaitForIdle:true}));
   await writeFile(join(input.output,'cleanup.json'),JSON.stringify(cleanup,null,2));
   evidence.cleanup={status:cleanup.status,package_closed:cleanup.package_closed,logged_out:cleanup.logged_out};
   if(cleanup.status!=='SUCCEEDED'||!cleanup.package_closed||!cleanup.logged_out){evidence.status='FAIL';process.exitCode=1;}
  }
 }finally{
  await context?.close();
  evidence.serverLgpUnchanged=serverHash()===before;
  evidence.serverLgpSha256=before;
  if(!evidence.serverLgpUnchanged){evidence.status='FAIL';process.exitCode=1;}
  await writeFile(join(input.output,'result.json'),JSON.stringify(evidence,null,2));
 }
}

if (!process.exitCode && evidence.status==='UI_ALL_NODES_EXECUTED') {
 python('collect_artifacts.py',[input.attemptDir,'--rerun']);
 python('check_reference.py',[input.caseDir,input.attemptDir,'--rerun']);
}
