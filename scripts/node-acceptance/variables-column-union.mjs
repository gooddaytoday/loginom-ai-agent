import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {parseExpectedVariableInventory,matchVariableInventoryOutput} from './expected-outputs.mjs';
export function auditVariablesColumnUnionHistory(events,initial,final){
 const need=(v,m)=>{if(!v)throw Error('VARIABLES_COLUMN_UNION_'+m);};
 const before=parseExpectedVariableInventory(initial).outputs[0],after=parseExpectedVariableInventory(final).outputs[0];
 const checkpoints=events.filter(e=>e.phase==='node_checkpoint'&&e.result?.status==='SUCCEEDED'&&e.result.cleanup_complete===true&&e.result.execution?.status==='completed').map(e=>e.result);
 const matches=(r,w)=>{try{return r.output?.variable_ports?.some(o=>o.execution_id===r.execution.execution_id&&matchVariableInventoryOutput(o,w))===true;}catch{return false;}};
 const a=checkpoints.find(r=>matches(r,before)),b=checkpoints.find((r,i)=>i>checkpoints.indexOf(a)&&matches(r,after));
 need(a&&b,'INITIAL_UPDATED_READS');need(isDeepStrictEqual(a.node,b.node)&&a.execution.execution_id!==b.execution.execution_id,'SAME_NODE_FRESH_EXECUTION');
 const ca=a.configuration?.readback,cb=b.configuration?.readback;
 need(ca?.kind==='variables_column_union'&&cb?.kind===ca.kind&&ca.mapping==='automatic'&&cb.mapping==='automatic','AUTOMATIC_MAPPING');
 need(ca.input_count===2&&isDeepStrictEqual(ca.inputs,cb.inputs)&&isDeepStrictEqual(ca.mapping_fields,cb.mapping_fields),'RETAINED_LINKS_MAPPING');
 const av=a.output.variable_ports[0].variables,bv=b.output.variable_ports[0].variables;
 need(av.every((v,i)=>isDeepStrictEqual(v.id,bv[i].id)&&v.name===bv[i].name&&v.type===bv[i].type),'RETAINED_NATIVE_IDENTITIES');
 const patch=checkpoints.find(r=>r.node.node_id===ca.inputs[1].source.node_id&&r.configuration?.readback?.kind==='variables_calculator'
  &&r.configuration.readback.expressions.find(e=>e.name==='a0')?.formula==='41');
 need(patch,'RIGHT_SOURCE_PATCH');
 return {status:'PASS',node:a.node,initial_execution:a.execution.execution_id,updated_execution:b.execution.execution_id,inputs:cb.inputs};
}

// This scenario's source fixture uses the existing private package delivery,
// native upload completion and guarded cleanup. No model receives the oracle.
export async function prepareVariablesColumnUnionSource(root,configPath,fixture,output){
 process.umask(0o077);await mkdir(output,{recursive:true,mode:0o700});
 const config=JSON.parse(await readFile(configPath,'utf8')),load=name=>import(pathToFileURL(root+'/runtime/'+name).href);
 const {verifyResources}=await load('src/resources.mjs'),resources=await verifyResources(root);
 const {loginBrowser}=await load('src/connection-check.mjs');
 const {makeWorkspacePrepareCode}=await load('client/lib/workspace.mjs');
 const {makePackageCleanupCode}=await load('client/lib/package-cleanup.mjs');
 const {createActionRuntime}=await load('client/lib/executor.mjs');
 const {createArtifactStore}=await load('client/lib/artifacts.mjs');
 const {createExecutionJournal}=await load('client/lib/execution-journal.mjs');
 const {createStorageBinding}=await load('client/lib/storage-policy.mjs');
 const {context}=await loginBrowser({browserPath:resources.browserPath,profile:output+'/browser',candidate:config.login,keepOpen:true,headless:true});
 const page=context.pages()[0],sessionId=randomUUID(),record=createExecutionJournal({directory:output,metadata:{sessionId},knownSecrets:[config.login.password]});
 const execute=code=>new Function('page',`return (${code})(page)`)(page);
 const compatibility={loginom_build:'7.4.2',platform:'linux',browser:'chromium'};
 try{
  const identity=await execute(makeWorkspacePrepareCode({loginomUrl:config.login.url,compatibility,sessionId,operationId:'source-identity',identityOnly:true}));
  if(identity.status!=='BOUND')throw Error('VARIABLES_SOURCE_IDENTITY');
  const directory=config.package.substring(0,config.package.lastIndexOf('/'));
  const binding=createStorageBinding({sessionId,origin:new URL(config.login.url).origin,build:'7.4.2',documentId:identity.document_id,account:identity.loginom_account,directories:{inputs:directory,packages:directory,exports:directory}});
  const actions=JSON.parse(await readFile(root+'/runtime/executor/catalog/actions.json','utf8')).actions;
  const selectors=JSON.parse(await readFile(root+'/runtime/executor/catalog/selectors.json','utf8')).selectors;
  const artifactStore=await createArtifactStore({directory:output+'/artifacts',sessionId});
  const runtime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},
   execute,onRecord:record,artifactStore,allowCandidate:true,targetOrigin:new URL(config.login.url).origin,targetBuild:'7.4.2',getStorageBinding:()=>binding});
  const bytes=await readFile(fixture),artifact=await artifactStore.admit({sourcePath:fixture,name:config.package.split('/').at(-1),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),upload:{directory,overwrite:'reject'}});
  const delivered=await runtime.deliverPackageArtifact({operation_id:'source-delivery',artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:120000});
  if(delivered.outcome?.status!=='SUCCEEDED')throw Error('VARIABLES_SOURCE_UPLOAD:'+JSON.stringify(delivered));
  const prepared=await execute(makeWorkspacePrepareCode({loginomUrl:config.login.url,compatibility,sessionId,operationId:'source-open',intent:'open_package',packagePath:config.package}));
  if(prepared.status!=='READY')throw Error('VARIABLES_SOURCE_OPEN');
  const cleanup=await execute(makePackageCleanupCode({sessionId,documentId:prepared.document_id,account:config.login.username,packagePath:config.package,loginomUrl:config.login.url,loginomBuild:'7.4.2',tabTid:prepared.workflow_ref.tab_tid}));
  await writeFile(output+'/result.json',JSON.stringify({delivered:delivered.outcome,cleanup}));
  if(cleanup.package_closed!==true||cleanup.logged_out!==true)throw Error('VARIABLES_SOURCE_CLEANUP');
 }finally{await context.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [mode,...args]=process.argv.slice(2);
 if(mode==='prepare')await prepareVariablesColumnUnionSource(...args);
 else if(mode==='variables-column-union')console.log(JSON.stringify(auditVariablesColumnUnionHistory(JSON.parse(await readFile(args[2],'utf8')),JSON.parse(await readFile(args[0],'utf8')),JSON.parse(await readFile(args[1],'utf8')))));
}
