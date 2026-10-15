import {assertCaptureOwner,captureData,assertCapturePublication} from '../retained-capture.mjs';

// Private continuation of the original completed opening. It grants one read
// only; the opening remains an effect and the runtime mutation gate stays held.
export function createImportOriginalPreconfigAdapter(context,validate) {
 const {retained,node,identity,publication,runtime,browser,record,signal}=context;
 const binding=retained?.binding,session=retained?.session,preparation=session?.metadata?.workspacePreparation;
 const opening=node?.opening,state=node?.state,request=node?.request,browserCall=browser?.callTool;
 const preparationBytes=JSON.stringify(preparation),phases=JSON.stringify(state?.phases),identityBytes=JSON.stringify(identity);
 const deadline=Math.min(binding?.expires,node?.deadline);
 const need=(v,m)=>{if(!v)throw Error('LOGINOM_IMPORT_PRECONFIG_'+m);};
 const current=()=>{
  signal?.throwIfAborted();assertCaptureOwner(retained);node.assertCurrent();
  need(node.preconfig===true&&node.owner===retained&&node.identity===identity&&signal===node.signal
   &&signal===retained.state.controller?.signal&&node.opening===opening&&node.state===state&&node.request===request
   &&retained.binding===binding&&retained.session===session&&binding.harness==='import-before-configure-v1'
   &&retained.resource.path==='runtime/src/acceptance/import-preconfig-adapter-v1.mjs','ORIGINAL_OPENING');
  need(Object.isFrozen(publication)&&typeof record==='function'&&typeof browserCall==='function'
   &&browser.callTool===browserCall&&runtime.assertImportPreconfigIdle(node)===true,'PRIVATE_SEAMS');
  need(state.pending===null&&state.cleanup_complete===true&&opening.status==='verified'
   &&opening.effect_possible===true&&opening.value.native_opening.status==='completed'
   &&opening.value.native_opening.account===binding.account&&request.target.kind==='existing'
   &&request.target.type==='imports.text'&&request.inputs.length===0&&request.mappings.length===0
   &&state.phases.every(p=>['source','workflow','target','open'].includes(p.phase)&&p.status==='verified')
   &&JSON.stringify(state.phases)===phases&&JSON.stringify(identity)===identityBytes
   &&session.metadata.workspacePreparation===preparation&&JSON.stringify(preparation)===preparationBytes
   &&Number.isSafeInteger(deadline)&&Date.now()<deadline,'CURRENT_BINDING');
  need(publication.opening_operation_id===opening.receipt_id&&publication.operation_id===request.operation_id
   &&publication.node_id===state.node.node_id&&publication.workflow_id===state.node.workflow_id
   &&publication.document_id===identity.document_id&&publication.account===binding.account
   &&publication.session_id===binding.session,'PUBLICATION');
  assertCaptureOwner(retained);node.assertCurrent();
 };
 current();
 const guard=async()=>{current();await node.assertOpeningCurrent();current();};
 let read;
 return Object.freeze({
  async readPreconfigSample() {
   current();
   if(!read)read=(async()=>{
    await guard();
    const observation=await node.readOriginalImport();
    await guard();captureData(observation);
    need(observation?.harness==='import-before-configure-v1'&&observation.revision===1
     &&['PARTIAL','REFUSED'].includes(observation.status)&&observation.complete===false
     &&observation.settings_applied===false&&observation.effect_possible===false&&observation.close_authority===false
     &&observation.document_id===identity.document_id&&observation.session_id===binding.session
     &&observation.account===binding.account&&observation.node?.node_id===state.node.node_id
     &&observation.node.workflow_id===state.node.workflow_id,'READBACK');
    await record({event:'fixed_import_preconfigure_observation',binding_admission:binding.admission,result:observation,
     opening_receipt_id:opening.receipt_id,opening_effect:true});
    await guard();
    const receipt={status:observation.status==='REFUSED'?'NOT_APPLIED':'DIAGNOSTIC_READ',settings_applied:false,
     effect_possible:false,admission_confirmed:false,publication:{...publication},
     root:Object.fromEntries(['session_id','document_id','workflow_id','node_id','account','package_path'].map(k=>[k,publication[k]])),
     observation,preconfig_complete:false,configure_authority:false,close_authority:false,native_proof:false,
     opening_effect:true,opening_receipt_id:opening.receipt_id,
     missing:['canonical_native_schema','current_native_activity_freshness','same_bridge_opaque_clean','guarded_readonly_close']};
    assertCapturePublication(receipt,publication);need(validate(receipt,{retained,node,publication})===true,'VALIDATOR');
    return receipt;
   })();
   const receipt=await read;current();assertCapturePublication(receipt,publication);return receipt;
  },
  requestReadonlyClose(){current();throw Error('CONFIRMED_SAVE_REQUIRED');}
 });
}
