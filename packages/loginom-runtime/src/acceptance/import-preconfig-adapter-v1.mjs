// Import-owned fixed resource; the shared grant/loader/Close registration is NOT
// installed by this module. No user path, settings setter or dispatch factory.
import {captureImport} from './import-before-configure-v1.mjs';
import {createImportCleanModel,readImportCleanFacts} from './import-clean-model-v1.mjs';
import {assertCaptureOwner,assertCapturePublication,captureData} from '../retained-capture.mjs';
import {validatePreparedNodeContext} from '../../client/lib/node-context.mjs';
export const captureMode='readonly';
export const IMPORT_ADAPTER_PATH='runtime/src/acceptance/import-preconfig-adapter-v1.mjs';
const harness='import-before-configure-v1';
const forbidden=new Set(['apply','create','configure','input_mapping','output_mapping','mapping','finish','node_finish','execute','activate','save']);
const allowed=new Set(['workflow','node','source','open']);
const need=(value,reason)=>{if(!value)throw Error('LOGINOM_IMPORT_PRECONFIG_'+reason);};
const rootKeys=['session_id','document_id','workflow_id','node_id','account','package_path'];

export function validateCaptureResult(receipt,{retained,node,publication}) {
 assertCaptureOwner(retained);node.assertCurrent();assertCapturePublication(receipt,publication);
 const o=receipt.observation;captureData(o);
 need(o?.harness===harness&&o.revision===1&&['PARTIAL','REFUSED'].includes(o.status)&&o.complete===false
  &&o.settings_applied===false&&o.effect_possible===false&&o.close_authority===false,'OBSERVATION_BOUNDARY');
 need(o.document_id===publication.document_id&&o.session_id===publication.session_id&&o.account===publication.account,'OBSERVATION_OWNER');
 if(o.node){need(o.node.node_id===publication.node_id&&o.node.workflow_id===publication.workflow_id&&o.node.component==='imports.text','OBSERVATION_NODE');}
 if(o.imports){need(Array.isArray(o.imports)&&o.imports.length===2&&new Set(o.imports.map(i=>i.node_id)).size===2,'IMPORT_INVENTORY');
  need(o.imports.every(i=>i.workflow_id===publication.workflow_id&&i.component==='imports.text'&&typeof i.node_id==='string'&&i.node_id),'IMPORT_OWNER');}
 need(receipt.preconfig_complete===false&&receipt.configure_authority===false&&receipt.close_authority===false
  &&receipt.native_proof===false,'NO_AUTHORITY');
 return true;
}

export function createImportPreconfigAdapter({retained,node,publication,identity,browser,record,runtime,signal}) {
 const binding=retained?.binding,session=retained?.session;
 need(binding?.harness===harness&&retained.resource.path===IMPORT_ADAPTER_PATH,'FIXED_RESOURCE');
 need(typeof browser?.callTool==='function'&&typeof record==='function'&&Object.isFrozen(publication),'PRIVATE_SEAMS');
 const original={binding,node,session,metadata:session.metadata,directory:session.directory,
  request:node.request,state:node.state,opening:node.opening,browserCall:browser.callTool};
 const identityBytes=JSON.stringify(identity),publicationBytes=JSON.stringify(publication),phaseBytes=JSON.stringify(node.state.phases);
 const preparation=session.metadata.workspacePreparation,preparationBytes=JSON.stringify(preparation);
 const deadline=Math.min(binding.expires,node.deadline),assertCurrent=()=>{
  signal?.throwIfAborted();assertCaptureOwner(retained);node.assertCurrent();
  // Provider reads precede final original-binding checks; unknown work refuses.
  need(typeof runtime?.hasActiveWork==='function'&&typeof runtime?.hasUnsettledWork==='function','RUNTIME_WORK_SEAMS');
  const active=runtime.hasActiveWork(),unsettled=runtime.hasUnsettledWork();
  need(active===false&&unsettled===false&&node.state.pending===null&&node.state.effect_possible===false,'UNSETTLED_OR_EFFECT');
  need(Array.isArray(node.state.phases)&&node.state.phases.every(p=>allowed.has(p.phase)&&!forbidden.has(p.phase)
   &&p.status==='verified'&&p.effect_possible===false),'PHASE_EFFECTS');
  need(node.request.target?.kind==='existing'&&node.request.target.type==='imports.text','EXISTING_IMPORT');
  validatePreparedNodeContext({document_id:identity.document_id,workflow_ref:node.request.workflow_ref,node:node.request.target.ref});
  need(node.request.target.ref.node_id===publication.node_id&&rootKeys.every(k=>k==='node_id'||k==='workflow_id'||identity[k]===publication[k]),'ROOT');
  need(identity.tab_tid===node.request.workflow_ref.tab_tid&&identity.loginom_build==='7.4.2','WORKFLOW');
  need(retained.binding===original.binding&&retained.session===original.session&&session.metadata===original.metadata
   &&session.directory===original.directory&&node.request===original.request&&node.state===original.state&&node.opening===original.opening
   &&JSON.stringify(identity)===identityBytes&&JSON.stringify(publication)===publicationBytes
   &&JSON.stringify(node.state.phases)===phaseBytes&&browser.callTool===original.browserCall
   &&session.metadata.workspacePreparation===preparation&&JSON.stringify(preparation)===preparationBytes
   &&signal===node.signal&&retained.state.controller?.signal===signal&&Date.now()<deadline,'CURRENT_BINDING');
  assertCaptureOwner(retained);node.assertCurrent();
 };
 assertCurrent();
 let read,cleanRead,receipt;
 const model=createImportCleanModel({assertCurrent,deadline});
 const readPreconfigSample=async()=>{
  assertCurrent();
  if(!read)read=(async()=>{
   const observation=await captureImport({binding,identity,browser,record:async event=>{assertCurrent();await record(event);assertCurrent();}});
   assertCurrent();
   const result={status:observation.status==='REFUSED'?'NOT_APPLIED':'DIAGNOSTIC_READ',settings_applied:false,effect_possible:false,
    admission_confirmed:false,publication:{...publication},root:Object.fromEntries(rootKeys.map(k=>[k,publication[k]])),
    observation,preconfig_complete:false,configure_authority:false,close_authority:false,native_proof:false,
    missing:['closed_existing_import_opening','current_input_output_refs','ordered_upload_lineage','canonical_native_enum_binding','same_node_activity','execution_freshness','shared_import_registration','opaque_clean_consumer']};
   validateCaptureResult(result,{retained,node,publication});receipt=result;return result;
  })();
  const result=await read;assertCurrent();validateCaptureResult(result,{retained,node,publication});return result;
 };
 const cleanIdentity=Object.freeze({...identity,workflow_id:publication.workflow_id,node_id:publication.node_id,read_started_at:Date.now()});
 return Object.freeze({readPreconfigSample,
  async observeCleanModel(){
   assertCurrent();need(receipt,'PRECONFIG_READ_REQUIRED');
   if(!cleanRead)cleanRead=(async()=>{
    const response=await browser.callTool({name:'browser_run_code_unsafe',arguments:{code:`async page=>page.evaluate(${readImportCleanFacts.toString()},${JSON.stringify(cleanIdentity)})`}},undefined,{timeout:Math.max(1,deadline-Date.now())});
    assertCurrent();need(response?.isError!==true,'CLEAN_READ_FAILED');
    const blocks=(response?.content??[]).filter(b=>b.type==='text');need(blocks.length===1,'CLEAN_REPLY');
    const facts=JSON.parse(blocks[0].text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1]??blocks[0].text);captureData(facts);
    const proof=model.observe(facts,cleanIdentity);assertCurrent();return proof;
   })();
   const value=await cleanRead;assertCurrent();return value;
  },
  inspectReadonlyClose(proof){return model.inspect(proof,cleanIdentity);},
  requestReadonlyClose(proof){return model.requestReadonlyClose(proof,cleanIdentity);}
 });
}

// Future fixed shared registration entry. A PARTIAL read is a diagnostic result,
// never a ready configuration sample or Close grant.
export async function captureImportPreconfig(context) {
 return createImportPreconfigAdapter(context).readPreconfigSample();
}
