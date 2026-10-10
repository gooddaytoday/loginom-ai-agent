import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {withDiagnosticSession} from '../../../../../scripts/node-acceptance/diagnostic-session.mjs';
import {makeColdSourceRevealCode} from '../../../../../scripts/node-acceptance/cold-source-viewport.mjs';
process.umask(0o077);
const [resourcesPath,configPath,packagePath,outputPath]=process.argv.slice(2);
const root=resolve(resourcesPath),directory=resolve(outputPath);
const load=p=>import(pathToFileURL(join(root,'runtime',p)).href);
const config=JSON.parse(await readFile(configPath,'utf8')).loginom;
const {verifyResources}=await load('src/resources.mjs');
const resources=await verifyResources(root);
const {loginBrowser}=await load('src/connection-check.mjs');
const {makeWorkspacePrepareCode}=await load('client/lib/workspace.mjs');
const {makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
const {createNodeTargetBrowserAdapter,readGraph}=await load('client/lib/node-target-browser.mjs');
const {createNodeProcedure}=await load('client/lib/node-procedure.mjs');
const {createExecutionJournal}=await load('client/lib/execution-journal.mjs');
const {withBrowserReceipt}=await load('client/lib/executor.mjs');
const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
const placement=await load('client/lib/node-placement.mjs');
const {NODE_TYPES}=await load('client/lib/node-contracts.mjs');
const sessionId=randomUUID(),origin=new URL(config.url).origin;
await mkdir(directory,{recursive:true,mode:0o700});
const record=createExecutionJournal({directory,metadata:{sessionId,clientRevision:resources.manifestHash,actionManifestDigest:resources.manifest.actionManifestSha256},knownSecrets:[config.api_key,config.password]});
export const {context}=await loginBrowser({browserPath:resources.browserPath,profile:join(directory,'browser'),candidate:{url:config.url,username:config.username,password:config.password},headless:true,keepOpen:true});
export const execute=code=>new Function('page',`return (${code})(page)`)(context.pages()[0]);
const need=(v,m)=>{if(!v)throw Error(m)};
export let diagnosticFailure;
await withDiagnosticSession({context,execute,directory,identity:{sessionId,account:config.username,packagePath,loginomUrl:config.url,loginomBuild:'7.4.2',diagnosticDiscard:true},makeCleanupCode:makePackageCleanupCode},async({bindPrepared})=>{
 const prepared=await bindPrepared(await execute(makeWorkspacePrepareCode({loginomUrl:config.url,compatibility:{loginom_build:'7.4.2',platform:'linux',browser:'chromium'},sessionId,operationId:'settings-open',intent:'open_package',packagePath})));
 const adapter=createNodeTargetBrowserAdapter({execute,origin,build:'7.4.2'});
 const graph=await adapter.observe({document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},Date.now()+30000);
 await writeFile(join(directory,'graph.json'),JSON.stringify(graph,null,2)+'\n');
 need(graph.nodes.filter(n=>n.type!=='exports.text').length===10&&graph.nodes.filter(n=>n.type==='exports.text').length===5&&graph.links.length===13,'GRAPH_COUNT');
 const wanted={
 'Рейтинг товаров':[{name:'Total',direction:'DESC'},{name:'Product',direction:'ASC',case_sensitive:true}],
 'Рейтинг регионов':[{name:'Total',direction:'DESC'},{name:'Region',direction:'ASC',case_sensitive:true}],
 'Ключ вверх':[{name:'Key',direction:'ASC'},{name:'Id',direction:'DESC'}],
 'Ключ вниз':[{name:'Key',direction:'DESC'},{name:'Id',direction:'ASC'}],
 'Текст':[{name:'Text',direction:'ASC',case_sensitive:false},{name:'Id',direction:'ASC'}]
 };
 const sorts=graph.nodes.filter(n=>n.type==='transform.sorting');need(sorts.length===5,'SORT_COUNT');
 const configurations=[];
 for(const [index,target] of sorts.entries()){
  need(wanted[target.label],'SORT_LABEL');
  const operation={id:'settings-'+index,action:{action_key:'acceptance.sorting_settings',revision:'1'},deadline:Date.now()+540000};
  const wrapMutation=(code,r)=>withBrowserReceipt(`(${code})(page)`,{receipt_namespace:sessionId,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id});
  const channel=createNodeProcedure({operation,execute,record,targetOrigin:origin,targetBuild:'7.4.2',maxSteps:4096,preparedNodeContext:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:target.ref},wrapMutation});
  const reveal=makeColdSourceRevealCode({node:target.ref,type:target.type,request:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},types:NODE_TYPES,origin,build:'7.4.2',deadline:Date.now()+30000},{readGraph,...placement});
  const revealed=await execute(wrapMutation(reveal,{id:'reveal-'+index,signature:'reveal-'+index}));need(revealed.status==='SUCCEEDED'&&revealed.graph_unchanged,'REVEAL');
  const state=await channel.observe({condition:'cold select sorting',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
  await selectPreparedGraphNode(channel,state,'cold select sorting',{refreshReplacedBody:true});
  await openPreparedWizard(channel);
  try{
   const state=await channel.observe({condition:'cold sorting configuration',readSorting:true,ready:s=>s.node_sorting?.verified&&s.node_sorting.inventory_complete});
   const c=state.node_sorting;
   need(['document_id','workflow_id','node_id'].every(k=>c.node_context[k]===target.ref[k]),'SETTINGS_OWNER');
   need(c.keys.length===wanted[target.label].length&&wanted[target.label].every((w,i)=>Object.entries(w).every(([k,v])=>c.keys[i][k]===v)),'KEYS');
   need(c.options.chkLocaleAware.value===false&&c.options.chkLocaleAware.switch_pressed===false,'LOCALE');
   configurations.push({label:target.label,node:target.ref,configuration:c});
  }finally{const closed=await closePreparedWizard(channel);need(closed.verified&&closed.settings_applied===false,'WIZARD_CANCEL');}
 }
 await writeFile(join(directory,'result.json'),JSON.stringify({status:'PASS',path:packagePath,settings_reapplied:false,configurations},null,2)+'\n');
 }).catch(async error=>{
 diagnosticFailure=error;
 process.exitCode=1;
 // The existing interactive owner can still use the exported original context.
 // Do not turn a retained-context refusal into an uncaught process exit.
 await writeFile(join(directory,'recovery-required.json'),JSON.stringify({context_retained:true,sessionId,packagePath,process_exit_safe:false})+'\n').catch(()=>undefined);
});
