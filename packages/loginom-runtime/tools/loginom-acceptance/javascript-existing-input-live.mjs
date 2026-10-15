// Operator-only upload and import update for an existing JS freshness trial.
// The cold reader remains read-only; this capability is admitted separately.
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createArtifactStore} from '../../client/lib/artifacts.mjs';
import {createActionRuntime} from '../../client/lib/executor.mjs';
import {createCandidateNodeSupport} from '../../client/lib/node-support.mjs';
import {activatePreparedWorkflow} from '../../client/lib/node-workflow-activation.mjs';
import {javascriptPublicCodePins} from './javascript-public-code-live.mjs';
import {javascriptInputRequest} from './javascript-execution-runtime.mjs';
import {javascriptBusinessInputVariant,verifyJavascriptFixture,verifyJavascriptTable,createJavascriptEffectJournal} from './javascript-execution-evidence.mjs';

const need=(condition,message)=>{if(!condition)throw Error(message);};

export function javascriptExistingInputRequest({prepared,node,storage,artifact,uploadOperationId,totalMs,inputVariant}) {
  need(['changed','reordered'].includes(inputVariant)&&node?.document_id===prepared.document_id
    &&node.workflow_id===prepared.workflow_ref.workflow_id&&typeof node.node_id==='string'&&node.node_id.length>0,
  'Existing input variant/owner unavailable');
  const request=javascriptInputRequest({prepared,storage,artifact,uploadOperationId,totalMs,inputVariant});
  request.operation_id='js-existing-input-'+randomUUID();
  request.target={kind:'existing',type:'imports.text',ref:node};
  // Explicitly establish the reordered physical output consumed by JS. Merely
  // changing CSV headers could leave the saved import output order unchanged.
  if(inputVariant==='reordered')request.mappings=[{direction:'output',port:0,autosync:false,
    fields:javascriptBusinessInputVariant(inputVariant).columns.map(column=>({
      source:{kind:'configured_field',name:column.name},name:column.name,label:column.label}))}];
  // Import uses its installed sample reader. The operator separately requires
  // sample_complete and verifies every cell of this six-row input.
  request.read.coverage='sample';request.read.sample_rows=100;
  return request;
}

export async function runJavascriptExistingInputLive({page,prepared,graph,inputVariant,directory,
  redactor,record,report,save,deadline,onPending}) {
  need(['changed','reordered'].includes(inputVariant)&&graph?.complete===true
    &&graph.document_id===prepared.document_id&&deadline-Date.now()>900000,
  'Existing input freshness requires complete graph and original budget');
  const inputs=graph.nodes.filter(n=>n.type==='imports.text'),nodes=graph.nodes.filter(n=>n.type==='programming.javascript');
  need(inputs.length===1&&nodes.length===1&&graph.links.length===1&&graph.foreign_links.length===0
    &&graph.links[0].source===inputs[0].ref.node_id&&graph.links[0].target===nodes[0].ref.node_id
    &&graph.links[0].input===0&&graph.links[0].output===0,'Existing input/JS lineage unavailable');
  const variant=javascriptBusinessInputVariant(inputVariant);
  const fixture=new URL('../../../../docs/node-development/nodes/programming-javascript/fixtures/'+variant.path,import.meta.url);
  const pin=verifyJavascriptFixture(await readFile(fixture),JSON.parse(await readFile(new URL('../manifest.json',fixture),'utf8')),inputVariant);
  const artifactStore=await createArtifactStore({directory:directory+'/input-artifacts',sessionId:'js-existing-input-'+randomUUID()});
  const support=createCandidateNodeSupport({targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2'});
  const runtime=createActionRuntime({pinned:await javascriptPublicCodePins(),allowCandidate:true,artifactStore,
    targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',redactor,onRecord:record,...support,
    execute:source=>Function('return ('+source+')')()(page)});
  const once=createJavascriptEffectJournal({record,deadline});
  const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']').filter({visible:true});
  const accountGuard=async()=>need(await page.evaluate(documentId=>{
    const m=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.FMapTree;
    return location.origin==='http://logi-test-plan.bg.local'&&globalThis.bg.app.Version==='7.4.2'
      &&globalThis.__loginomDockPreparationV1?.id===documentId&&m?.FServerConnection?.UserName==='jsteach'
      &&m.FServerConnection.Connected===true&&m.PackageNodes.Count===1;
  },prepared.document_id),'Existing input account/document changed');
  const folder='js-g2-'+randomUUID(),storage='/jsteach/'+folder;
  report.stage='existing-input-delivery';report.existing_input={status:'RUNNING',input_variant:inputVariant,pin,storage,
    node:inputs[0].ref,js_node:nodes[0].ref,original_deadline:deadline};onPending(true);await save();
  await accountGuard();
  await once('storage-open',{storage},()=>at('MF;cntMain;tlbMainToolbar;btnFilestorage').click());
  const table=page.locator('[data-tid$=";FileStorageForm;pnlFileStorage;tbl"]').filter({visible:true});
  await table.waitFor({timeout:Math.max(1,Math.min(30000,deadline-Date.now()))});
  need(await table.count()===1,'Unique file storage required');
  const prefix=(await table.getAttribute('data-tid')).split(';FileStorageForm;')[0];
  const nav=prefix+';cnrNaviMode;b.s_Сервер>Файлы>jsteach';
  if(await at(nav).count()===0)await once('storage-user-folder',{storage,prefix},()=>at(prefix+';FileStorageForm;colName_jsteach').dblclick());
  await at(nav).waitFor({timeout:Math.max(1,Math.min(90000,deadline-Date.now()))});await accountGuard();
  const observedDirectory=async()=>{
    const roots=await runtime.observe({scope:'roots'});
    const navigation=roots.output.ui.elements.filter(e=>e.tid===prefix+';NavigationBar;NavigationPanel');
    need(navigation.length===1,'Exact storage navigation unavailable');
    const observed=await runtime.observe({rootRef:navigation[0].ref,observationId:roots.output.observation_id});
    await record({phase:'existing_input_storage_observed',file_storage:observed.output.file_storage});
    need(observed.output.file_storage?.status==='observed','Storage directory unconfirmed');
    return observed.output.file_storage.directory;
  };
  if(await observedDirectory()!=='/jsteach')await once('storage-user-breadcrumb',{storage,prefix},()=>at(nav).click());
  need(await observedDirectory()==='/jsteach'&&await at(prefix+';FileStorageForm;colName_'+folder).count()===0,
    'Existing input storage parent or new folder differs');
  await once('storage-create-prompt',{storage},()=>at(prefix+';FileStorageForm;btnCreateDirectory').click());
  const prompt=page.locator('[data-tid^="msgbox"][data-tid$="cnt;cnt;txt"] input').filter({visible:true});
  await prompt.waitFor({timeout:Math.max(1,Math.min(30000,deadline-Date.now()))});
  need(await prompt.count()===1,'Storage prompt ambiguous');
  await once('storage-name',{storage},()=>prompt.fill(folder));await accountGuard();
  await once('storage-create',{storage},()=>page.locator('[data-tid^="msgbox"][data-tid$="tlb;ok"]').filter({visible:true}).click());
  await at(prefix+';FileStorageForm;colName_'+folder).waitFor({timeout:Math.max(1,Math.min(90000,deadline-Date.now()))});
  await once('storage-enter',{storage},()=>at(prefix+';FileStorageForm;colName_'+folder).dblclick());
  await at(nav+'>'+folder).waitFor({timeout:Math.max(1,Math.min(90000,deadline-Date.now()))});
  need(await observedDirectory()===storage,'Existing input own directory did not open');
  const artifact=await artifactStore.admit({sourcePath:fileURLToPath(fixture),name:variant.name,
    bytes:pin.bytes,sha256:pin.sha256,upload:{directory:storage,overwrite:'reject'}});
  const delivered=await once('input-delivery',{storage,artifact_id:artifact.artifact_id,sha256:pin.sha256},()=>runtime.deliverArtifact({
    operation_id:'js-existing-input-delivery-'+randomUUID(),artifact_id:artifact.artifact_id,
    upload_grant_id:artifact.upload.grant_id,budget_ms:Math.max(1,Math.min(120000,deadline-Date.now()))}));
  need(delivered.outcome?.status==='SUCCEEDED'&&delivered.upload_operation_id&&!runtime.hasUnsettledWork(),
    'Existing input delivery unconfirmed');
  await once('input-return-workflow',{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},async()=>{
    const active=await activatePreparedWorkflow(page,{request:{document_id:prepared.document_id,workflow_ref:prepared.workflow_ref},
      origin:'http://logi-test-plan.bg.local',build:'7.4.2',deadline});
    await record({phase:'existing_input_workflow_returned',receipt:active});
    need(active.status==='SUCCEEDED'&&active.verified===true,'Existing input workflow return unconfirmed');
    return active;
  });
  const request=javascriptExistingInputRequest({prepared,node:inputs[0].ref,storage,artifact,
    uploadOperationId:delivered.upload_operation_id,totalMs:deadline-Date.now()-60000,inputVariant});
  report.stage='existing-input-apply';await save();
  const imported=await once('input-import',{artifact_id:artifact.artifact_id,node:request.target.ref,
    source_path:request.parameters.settings.source.source_path},()=>runtime.runNodeApply(request));
  report.existing_input.result=imported;await save();
  if(imported.status==='NOT_APPLIED'&&imported.effect_possible===false
    &&imported.cleanup_complete===true&&!runtime.hasUnsettledWork())onPending(false);
  need(imported.status==='SUCCEEDED'&&imported.cleanup_complete===true&&!runtime.hasUnsettledWork(),
    'Existing input import unconfirmed');
  onPending(false);await save();
  const result=imported.output,output=result?.output?.ports?.find(p=>p.port===0);
  need(JSON.stringify(result.node)===JSON.stringify(inputs[0].ref)&&result.execution.status==='completed'
    &&output?.fresh===true&&output.execution_id===result.execution.execution_id,'Existing input same-node freshness unconfirmed');
  const proof=verifyJavascriptTable(output,'input',inputVariant);
  Object.assign(report.existing_input,{status:'OBSERVED',table:output,proof,upload_operation_id:delivered.upload_operation_id,
    artifact:{artifact_id:artifact.artifact_id,bytes:artifact.bytes,sha256:artifact.sha256}});
  await record({phase:'existing_input_verified',...report.existing_input});await save();
}
