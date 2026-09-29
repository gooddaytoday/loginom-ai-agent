import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {createJavascriptManagedSourceAdapter} from './javascript-managed-source-adapter.mjs';
import {createJavascriptSourceAdmission,javascriptSourceSettingsDigest} from './javascript-source-admission.mjs';
import {javascriptSourceIdentity} from './javascript-source-read.mjs';
import {createJavascriptTrialAdmission} from './javascript-trial-admission.mjs';
import {javascriptParametersSchema} from './node-api.mjs';

const need=(ok,message)=>{if(!ok)throw Error(message);};
const verified=(details={})=>({verified:true,cleanup_complete:true,effect_possible:false,...details});

// Isolated acceptance support for the pinned B fixture. The product candidate
// catalog must not register this partial handler. Browser access is supplied
// only by the owned acceptance runtime that injects this support.
export function createJavascriptTrialNodeSupport({page,targetOrigin,targetBuild,redactor,pinned}) {
  need(page && targetBuild==='7.4.2' && typeof targetOrigin==='string'
    && typeof redactor?.text==='function' && typeof redactor?.redact==='function',
  'JavaScript trial runtime dependencies unavailable');
  const validate=createJavascriptTrialAdmission(pinned);
  const nodeApplyHandlers=new Map([['programming.javascript',{
    revision:'javascript-existing-code-trial-v1',modes:['script'],parameter_schema:javascriptParametersSchema,
    validate,configure:(ctx,parameters,drivers)=>drivers.configureJavascript(ctx,parameters),
    configurationReadback:({node,phases})=>{
      const finish=phases.find(phase=>phase.phase==='finish')?.value;
      need(finish?.wizard_commit_verified===true && finish.source_readback_verified===true
        && finish.settings_preserved===true && finish.execution_started===null,
      'JavaScript trial finish readback unavailable');
      return {kind:'javascript',scope:'observed_after_verified_finish',node,
        receipt_ids:phases.map(phase=>phase.receipt_id),values_are:'independent_owned_source_readback',
        schema_mode:'code',source:{sha256:finish.source_sha256,utf8_bytes:finish.source_utf8_bytes,
          lf_lines:finish.source_lf_lines},settings_preserved:true,wizard_commit_verified:true,
        execution_effects:{explicit_execute_requested:false,internal_execution_started:null},
        package_persistence_verified:false};
    }}]]);
  const nodeApplyDriverFactory=({operation,execute,onRecord,now,receiptOptions})=>{
    const request=operation.parameters,node=request.target.ref;
    const prepared={document_id:request.document_id,workflow_ref:request.workflow_ref,node};
    const owner={...node,operation_id:operation.id,ui_epoch:Date.now()};
    let sourceBaseline,adapter,handle,channel;
    const makeChannel=deadline=>{
      operation.deadline=deadline;
      channel??=createNodeProcedure({operation,execute,record:onRecord,now,
        targetOrigin,targetBuild,preparedNodeContext:prepared,
        wrapMutation:(code,receipt)=>withBrowserReceipt('('+code+')(page)',{
          ...receiptOptions(receipt.id,receipt.action_key,receipt.signature),operation_id:receipt.id})});
      return channel;
    };
    const sourceAdapter=deadline=>createJavascriptManagedSourceAdapter({page,prepared,node,
      uiEpoch:owner.ui_epoch,deadline,targetOrigin,execute,record:onRecord,receiptOptions,
      channel:makeChannel,openingBudgetMs:180000});
    const readSource=async({deadline,parameters})=>{
      const admission=createJavascriptSourceAdmission({kind:'existing',owner,deadline,
        sourceAdapter:async()=>sourceAdapter(deadline),redactor,record:onRecord});
      return admission.admit(parameters);
    };
    return {
      verifySource:async parameters=>{
        validate(parameters,request.mode,request);
        return verified({source_sha256:javascriptSourceIdentity(parameters.source_text).source_sha256});
      },
      async beforeTarget(ctx) {
        const receipt=await readSource({deadline:ctx.deadline,parameters:request.parameters});
        need(receipt.intent==='replace' && receipt.previous_source?.source_sha256===pinned.expected_source_sha256
          && receipt.effective_source?.source_sha256===javascriptSourceIdentity(pinned.source_text).source_sha256
          && typeof receipt.settings_sha256==='string',
        'JavaScript trial effective source admission differs');
        sourceBaseline=receipt;
        return verified({effect_possible:true,settings_changed:false,source_sha256:receipt.previous_source.source_sha256});
      },
      async mapPorts(mappings) {
        need(mappings.length===0,'JavaScript trial does not change port mappings');
        return verified({mapping_changes:0});
      },
      async openWizard(ctx) {
        need(sourceBaseline && ctx.node?.node_id===node.node_id,'JavaScript trial source/target unavailable');
        adapter=sourceAdapter(ctx.deadline);
        handle=await adapter.open({owner,deadline:ctx.deadline});
        if(handle.settings?.generation!==true
          || javascriptSourceSettingsDigest(handle.settings)!==sourceBaseline.settings_sha256){
          await adapter.discard(handle,{owner,deadline:ctx.deadline});
          throw Error('JavaScript trial requires unchanged observed Code settings');
        }
        return verified({effect_possible:true,schema_mode:'code',settings_observed:true});
      },
      async configureJavascript(ctx,parameters) {
        need(adapter && handle && ctx.node?.node_id===node.node_id,'JavaScript trial owned editor unavailable');
        const before=await adapter.read(handle,{owner,deadline:ctx.deadline});
        need(javascriptSourceIdentity(before.source).source_sha256===parameters.expected_source_sha256
          && before.settings.generation===true,'JavaScript trial source or Code mode changed');
        const written=await adapter.replace(handle,{owner,deadline:ctx.deadline,
          expected_source_sha256:parameters.expected_source_sha256,source_text:parameters.source_text});
        need(written.draft_exact===true
          && written.source_sha256===javascriptSourceIdentity(parameters.source_text).source_sha256,
        'JavaScript trial draft readback differs');
        return verified({effect_possible:true,draft_source_sha256:written.source_sha256,
          wizard_commit_verified:false});
      },
      async finish(mode,ctx) {
        need(mode==='done' && adapter && handle,'JavaScript trial requires owned Done');
        const committed=await adapter.commit(handle,{owner,deadline:ctx.deadline});
        const after=await readSource({deadline:ctx.deadline,parameters:{}});
        const expected=javascriptSourceIdentity(request.parameters.source_text);
        need(after.intent==='preserve' && after.previous_source?.source_sha256===expected.source_sha256
          && after.previous_source.source_utf8_bytes===expected.source_utf8_bytes
          && after.previous_source.source_lf_lines===expected.source_lf_lines
          && after.settings_sha256===sourceBaseline.settings_sha256,
        'JavaScript trial independent source/settings readback differs');
        return verified({effect_possible:true,mode:'done',settings_applied:true,
          wizard_commit_verified:true,graph_owner_verified:committed.graph_owner_verified,
          owned_done_settled:committed.owned_done_settled,source_readback_verified:true,
          settings_preserved:true,source_sha256:expected.source_sha256,
          source_utf8_bytes:expected.source_utf8_bytes,source_lf_lines:expected.source_lf_lines,
          execution_started:null,execution_id:null,explicit_execute_requested:false});
      },
      waitExecution:async()=>{throw Error('JavaScript trial Execute is not admitted');},
      readOutput:async()=>{throw Error('JavaScript trial output read is not admitted');},
      verifyContinuation:async()=>false,
    };
  };
  return {nodeApplyHandlers,nodeApplyDriverFactory};
}
