import {verifyJavascriptMappingGraph} from './javascript-graph-preservation.mjs';
import {retainedJavascriptWizardRefusal} from './javascript-wizard-recovery.mjs';
export {verifyJavascriptMappingGraph} from './javascript-graph-preservation.mjs';
import {createJavascriptManagedSourceAdapter} from './javascript-managed-source-adapter.mjs';
import {createJavascriptSourceAdmission,javascriptSourceSettingsDigest} from './javascript-source-admission.mjs';
import {javascriptSourceIdentity} from './javascript-source-read.mjs';
import {validateJavascriptParameters} from './javascript-parameters.mjs';
import {javascriptParametersSchema} from './node-api.mjs';
import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
import {closeJavascriptPortMapping} from './javascript-port-mapping-close.mjs';
import {openManagedJavascriptOutputViews} from './javascript-managed-views.mjs';
import {openNewOutputTable,configureTablePrecision,restoreTablePrecision,prepareTableRead,returnFromOutputTable} from './node-output-procedure.mjs';
import {readTableOutputPages} from './table-output-pages.mjs';
import {decodeTableOutput} from './table-output-values.mjs';
import {validateJavascriptDeclaredPrimitiveColumns} from './javascript-managed-declared.mjs';
import {javascriptExistingLifecycleBaseline} from './javascript-existing-lifecycle.mjs';
import {admitJavascriptExistingSchema} from './javascript-existing-schema-refusal.mjs';
import {javascriptExecutionWaitContext} from './javascript-execution-continuation.mjs';
import {NODE_READ_MODE} from './node-read-contract.mjs';
import {createNodeReadDrivers} from './node-read-driver.mjs';
import {withJavascriptSourcePolicyBoundary} from './javascript-source-policy-refusal.mjs';

const need=(condition,message)=>{if(!condition)throw Error(message);};
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
const verified=(value={})=>({verified:true,cleanup_complete:true,effect_possible:false,...value});

// C/D lifecycle support, injected by acceptance until edit/reread and
// candidate delivery are complete. No operator fixture or expected data enters it.
export function validateJavascriptCodeRequest(parameters,mode,request) {
  validateJavascriptParameters(parameters,mode,request);
  need(request.finish==='execute'
    &&request.mappings.length===0,'JavaScript lifecycle requires preserved port mappings and explicit Execute');
  if(request.target.kind==='new'){
    need(['code','declared'].includes(parameters.schema_mode),'JavaScript new schema mode unavailable');
    if(parameters.schema_mode==='declared')validateJavascriptDeclaredPrimitiveColumns(parameters.columns);
    return parameters;
  }
  need(request.inputs.length===0&&parameters.columns===undefined,
    'JavaScript existing lifecycle preserves inputs and declared columns');
  return parameters;
}

export function javascriptCodeReadback({node,phases}) {
  const configured=phases.find(phase=>phase.phase==='node_finish')?.value;
  const mapping=phases.find(phase=>phase.phase==='output_mapping')?.value?.native_mapping;
  const input=phases.find(phase=>phase.phase==='input_mapping')?.value?.native_mapping;
  const first=phases.find(phase=>phase.phase==='materialization_execute')?.value;
  const final=phases.find(phase=>phase.phase==='execute')?.value;
  need(configured?.source_readback_verified===true&&configured.wizard_commit_verified===true
    &&(configured.schema_mode!=='declared'||Array.isArray(configured.declared_columns)&&configured.declared_columns.length>0)
    &&input?.verified===true&&input.source_identity_verified===true
    &&mapping?.verified===true&&mapping.source_identity_verified===true
    &&first?.owner_verified===true&&first.status==='completed'&&final?.owner_verified===true
    &&final.status==='completed'&&first.execution_id!==final.execution_id,'JavaScript Code lifecycle readback incomplete');
  return {kind:'javascript',scope:'observed_after_verified_finish',node,
    receipt_ids:phases.map(phase=>phase.receipt_id),values_are:'independent_owned_source_readback',schema_mode:configured.schema_mode??'code',
    ...(configured.schema_mode==='declared'?{columns:configured.declared_columns}:{}),
    source:{sha256:configured.source_sha256,utf8_bytes:configured.source_utf8_bytes,lf_lines:configured.source_lf_lines},
    settings_preserved:true,wizard_commit_verified:true,
    execution_effects:{explicit_execute_requested:true,internal_execution_started:null},
    input_mapping:javascriptReadbackMapping(input,'input'),output_mapping:javascriptReadbackMapping(mapping,'output'),
    package_persistence_verified:false};
}

export function createJavascriptCodeNodeSupport({targetOrigin,targetBuild,redactor,requireWizardErrorDetails=false}) {
  need(targetBuild==='7.4.2'&&typeof targetOrigin==='string'&&typeof redactor?.text==='function'
    &&typeof redactor?.redact==='function'&&typeof requireWizardErrorDetails==='boolean','JavaScript Code runtime dependencies unavailable');
  const nodeApplyHandlers=new Map([['programming.javascript',{revision:'javascript-script-lifecycle-v4',modes:['script'],
    parameter_schema:javascriptParametersSchema,output_wizard:'separate',materialize_output:true,fullUiOutput:true,
    validate:validateJavascriptCodeRequest,configure:(ctx,parameters,drivers)=>drivers.configureJavascript(ctx,parameters),
    configurationReadback:javascriptCodeReadback}]]);
  const nodeApplyDriverFactory=({operation,execute,onRecord,now,receiptOptions})=>{
    if(operation.parameters.mode===NODE_READ_MODE)return createNodeReadDrivers({operation,execute,onRecord,now,receiptOptions},
      {targetOrigin,targetBuild,redactor});
    const request=operation.parameters;
    const initialOwner={document_id:request.document_id,workflow_id:request.workflow_ref.workflow_id,
      node_id:request.target.kind==='existing'?request.target.ref.node_id:null,operation_id:operation.id,ui_epoch:Date.now()};
    let expected=request.parameters.source_text===undefined?null:javascriptSourceIdentity(request.parameters.source_text);
    let owner,channel,signal,adapter,handle,admission,admitted,configured,committed,
      executionDriver,executionReceipt,inputMapping,outputMapping,sourceSnapshot,existingBaseline,existingGraphBaseline;
    const enter=ctx=>{
      signal=ctx.signal;signal?.throwIfAborted();operation.deadline=ctx.deadline;
      if(ctx.node){
        if(owner)need(['document_id','workflow_id','node_id'].every(key=>owner[key]===ctx.node[key]),
          'JavaScript Code node owner changed');
        owner??={...initialOwner,node_id:ctx.node.node_id};
        channel??=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:4096,targetOrigin,targetBuild,
          signal:{throwIfAborted:()=>signal?.throwIfAborted(),get aborted(){return signal?.aborted;},get reason(){return signal?.reason;}},
          preparedNodeContext:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node},
          wrapMutation:(code,reference)=>withBrowserReceipt('('+code+')(page)',{
            ...receiptOptions(reference.id,reference.action_key,reference.signature),operation_id:reference.id})});
      }
      return channel;
    };
    const sourceAdapter=(boundOwner,deadline)=>{
      need(owner&&same(boundOwner,owner),'JavaScript source admission owner changed');
      const selected=createJavascriptManagedSourceAdapter({page:{},
        prepared:{document_id:owner.document_id,workflow_ref:request.workflow_ref,node:nodeRef(owner)},node:nodeRef(owner),
        uiEpoch:owner.ui_epoch,deadline,targetOrigin,execute,record:onRecord,receiptOptions,redactor,
        channel:remaining=>{operation.deadline=remaining;return channel;},openingBudgetMs:180000,requireErrorDetails:requireWizardErrorDetails});
      const open=selected.open.bind(selected);
      selected.open=async input=>{
        const opened=await open(input);
        sourceSnapshot={owner:{...input.owner},settings:structuredClone(opened.settings),
          schema:structuredClone(opened.schema)};
        return opened;
      };
      return selected;
    };
    const policyAdmission=(kind,boundOwner,deadline,expectedSource,expectedSettings)=>createJavascriptSourceAdmission({kind,owner:boundOwner,
      deadline,sourceAdapter:current=>sourceAdapter(current,deadline),redactor,record:onRecord,expectedSource,expectedSettings});
    const graph=async ctx=>{
      need(typeof operation.nodeTargetAdapter?.observe==='function','JavaScript complete graph observer unavailable');
      const value=await operation.nodeTargetAdapter.observe({document_id:request.document_id,
        workflow_ref:request.workflow_ref,target:request.target,inputs:request.inputs},ctx.deadline,ctx.signal);
      need(value?.complete===true&&value.document_id===ctx.document_id&&same(value.workflow_ref,ctx.workflow_ref)
        &&Array.isArray(value.nodes)&&Array.isArray(value.links)&&Array.isArray(value.foreign_links),
      'JavaScript complete graph owner changed');
      return value;
    };
    const readMapping=async(direction,ctx)=>{
      enter(ctx);const before=await graph(ctx);
      await channel.openPort(direction,0);
      const state=await channel.observe({condition:'complete owned JavaScript '+direction+' mapping',readMappings:true,
        ready:s=>s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true
          &&s.node_mapping.source_identity_verified===true&&s.prepared_node_context?.verified===true});
      const mapping=state.node_mapping;
      need(mapping.state_source==='cached_mapping_stores'&&mapping.settings_applied===false&&mapping.package_saved===false
        &&typeof mapping.autosync==='boolean'&&mapping.node_context?.surface==='wizard'
        &&['document_id','workflow_id','node_id'].every(key=>mapping.node_context[key]===owner[key])
        &&mapping.node_context[direction+'_port']?.direction===direction
        &&mapping.node_context[direction+'_port'].port===0&&mapping.source_fields.length>0
        &&mapping.target_fields.length>0,'JavaScript materialized mapping unavailable');
      await closeJavascriptPortMapping({reader:channel,direction,reference:nodeRef(owner),record:onRecord,
        deadline:ctx.deadline,allowOwnedUnlock:true,verifyGraph:async()=>{
          const after=await graph(ctx);
          verifyJavascriptMappingGraph(before,after,nodeRef(owner));
          await onRecord({phase:'javascript_mapping_graph_verified',direction,node:nodeRef(owner),before,after});
        }});
      return mapping;
    };
    const launch=async ctx=>{
      enter(ctx);need(committed?.owned_done_settled===true
        &&(configured?.phase==='configured'||configured?.phase==='admitted'
          &&configured.kind==='existing'&&configured.intent==='preserve'),
        'JavaScript source commit must precede execution');
      executionDriver=createNodeExecutionProcedure(channel,ctx.node,{allowDeactivate:true,verifyFailedChild:true,retainReadWait:true});
      // Retain the owned console before execution begins. Opening it during
      // a long JavaScript execution can lose the native Stop target to redraws.
      try{await executionDriver.prepare({keepConsoleOpen:true});}
      catch(error){
        // Source admission retires a failed host callback as "boundary".
        // Keep the actual preparation refusal in private redacted evidence;
        // this read-only diagnostic never authorizes a launch or replay.
        await onRecord({phase:'javascript_execution_prepare_refused',operation_id:operation.id,
          node:ctx.node,deadline:ctx.deadline,
          reason:redactor.text(String(error?.message??'Execution preparation failed')).slice(0,1024)});
        throw error;
      }
      const result=await finishConfiguredGraph(channel,executionDriver,'execute',ctx.node);
      return {...result,source_sha256:expected.source_sha256,explicit_execute_requested:true};
    };
    return {
      verifySource:async parameters=>{
        validateJavascriptCodeRequest(parameters,request.mode,request);
        return verified(parameters.source_text===undefined?{}:
          {source_sha256:javascriptSourceIdentity(parameters.source_text).source_sha256});
      },
      async beforeTarget(ctx){
        enter(request.target.kind==='existing'?{...ctx,node:request.target.ref}:ctx);
        admission=policyAdmission(request.target.kind,initialOwner,ctx.deadline);
        admitted=await withJavascriptSourcePolicyBoundary({phase:'target',owner:initialOwner,deadline:ctx.deadline,record:onRecord},
          ()=>admission.admit(request.parameters.source_text===undefined?{}:
          {source_text:request.parameters.source_text,
            ...(request.target.kind==='existing'?{expected_source_sha256:request.parameters.expected_source_sha256}:{})}));
        if(request.target.kind==='existing'){
          existingBaseline=await admitJavascriptExistingSchema({receipt:admitted,snapshot:sourceSnapshot,
            parameters:request.parameters,owner,record:onRecord,deadline:ctx.deadline});
          // Preserve binds the reader's exact identity; effective_source also
          // contains module-policy/parser metadata and is not a source binding.
          expected??=admitted.previous_source;
          need(admitted.effective_source.source_sha256===expected.source_sha256,
            'JavaScript existing effective source admission differs');
          existingGraphBaseline=await graph({...ctx,node:request.target.ref});
          return verified({effect_possible:true,source_sha256:expected.source_sha256,settings_changed:false});
        }
        need(admitted.intent==='create'&&admitted.effective_source.source_sha256===expected.source_sha256,
          'JavaScript new source admission differs');
        return verified({source_sha256:expected.source_sha256,settings_changed:false});
      },
      async mapPorts(mappings,ctx){
        need(mappings.length===0,'JavaScript Code lifecycle currently preserves default mappings');
        const direction=ctx.receipt_id===operation.id+':input_mapping'?'input'
          :ctx.receipt_id===operation.id+':output_mapping'?'output':null;
        need(direction,'JavaScript mapping phase unavailable');
        if(direction==='output')need(executionReceipt?.status==='completed'&&executionReceipt.owner_verified===true,
          'Owned materialization execution required before output mapping');
        const mapping=await readMapping(direction,ctx);
        if(direction==='input')inputMapping=mapping;
        if(direction==='output')outputMapping=mapping;
        return verified({effect_possible:true,native_mapping:mapping,mapping_changes:0});
      },
      async openWizard(ctx){
        enter(ctx);need(admitted&&inputMapping,'JavaScript source/input admission unavailable');
        adapter=sourceAdapter(owner,ctx.deadline);handle=await adapter.open({owner,deadline:ctx.deadline,
          schemaMode:existingBaseline?'preserve':request.parameters.schema_mode,
          ...(!existingBaseline&&request.parameters.schema_mode==='declared'?{columns:request.parameters.columns}:{})});
        const schema_mode=existingBaseline?.schema_mode??request.parameters.schema_mode;
        need(handle.settings.generation===(schema_mode==='code'),'JavaScript schema mode unconfirmed');
        if(existingBaseline){
          need(javascriptSourceSettingsDigest(handle.settings)===existingBaseline.settings_sha256,
            'JavaScript existing settings changed before source mutation');
          if(existingBaseline.columns)handle.declaredColumns=structuredClone(existingBaseline.columns);
        }
        return verified({effect_possible:true,schema_mode,settings_observed:true});
      },
      async configureJavascript(ctx,parameters){
        enter(ctx);need(handle&&adapter,'JavaScript owned Code editor unavailable');
        const baseline=await adapter.read(handle,{owner,deadline:ctx.deadline});
        if(existingBaseline)need(javascriptSourceIdentity(baseline.source).source_sha256===admitted.previous_source.source_sha256,
          'JavaScript existing source changed before mutation');
        const written=await adapter.replace(handle,{owner,deadline:ctx.deadline,
          expected_source_sha256:javascriptSourceIdentity(baseline.source).source_sha256,
          source_text:parameters.source_text??baseline.source});
        need(written.draft_exact===true&&written.source_sha256===expected.source_sha256,'JavaScript draft digest differs');
        return verified({effect_possible:true,draft_source_sha256:written.source_sha256,wizard_commit_verified:false});
      },
      async finish(mode,ctx){
        enter(ctx);need(mode==='done'&&handle&&adapter&&admission&&admitted,'JavaScript owned Done unavailable');
        const settings=javascriptSourceSettingsDigest(handle.settings);
        const declaredColumns=handle.declaredColumns;
        if(existingBaseline){
          // Existing admission reopens the committed graph before mutation.
          // Here the owned writer already holds the changed draft. As in B,
          // commit that one-shot writer, then independently admit the actual
          // committed source/settings before allowing an execution effect.
          try { committed=await adapter.commit(handle,{owner,deadline:ctx.deadline}); }
          catch(error) {
            if(!error.javascriptWizardRefusal)throw error;
            need(adapter.uncertain===false&&adapter.active===false,'JavaScript rejected draft remains unresolved');
            const recovery=policyAdmission('existing',owner,ctx.deadline);
            const afterReceipt=await recovery.admit({});
            const afterBaseline=javascriptExistingLifecycleBaseline({receipt:afterReceipt,snapshot:sourceSnapshot,
              parameters:{schema_mode:existingBaseline.schema_mode},owner});
            const afterGraph=await graph(ctx);
            await retainedJavascriptWizardRefusal({refusal:error.javascriptWizardRefusal,owner,admitted,afterReceipt,
              baseline:existingBaseline,afterBaseline,beforeGraph:existingGraphBaseline,afterGraph,record:onRecord,deadline:ctx.deadline});
          }
          admission=policyAdmission('existing',owner,ctx.deadline);
          configured=await admission.admit({});
          const after=javascriptExistingLifecycleBaseline({receipt:configured,snapshot:sourceSnapshot,
            parameters:{schema_mode:existingBaseline.schema_mode},owner});
          need(after.settings_sha256===existingBaseline.settings_sha256,
            'JavaScript existing settings changed across Done');
        }
        if(!existingBaseline)configured=await admission.withMutation({receipt:admitted,owner:initialOwner},async()=>{
          committed=await adapter.commit(handle,{owner,deadline:ctx.deadline});
          return {owner};
        });
        need(configured.effective_source.source_sha256===expected.source_sha256&&configured.settings_sha256===settings,
          'JavaScript committed source/settings readback differs');
        if(existingBaseline){
          const observation={phase:'javascript_existing_source_commit_verified',operation_id:operation.id,
            node:nodeRef(owner),previous_source_sha256:admitted.previous_source.source_sha256,
            effective_source_sha256:configured.effective_source.source_sha256,
            settings_sha256:configured.settings_sha256,committed_graph_owner_verified:true};
          const saved=await onRecord(structuredClone(observation));
          need(same(Object.fromEntries(Object.keys(observation).map(key=>[key,saved?.[key]])),observation),
            'JavaScript existing commit journal ACK differs');
        }
        handle=null;
        return verified({effect_possible:true,mode,settings_applied:true,execution_id:null,execution_started:null,
          schema_mode:existingBaseline?.schema_mode??request.parameters.schema_mode,
          ...(declaredColumns?{declared_columns:declaredColumns}:{}),
          explicit_execute_requested:false,wizard_commit_verified:true,graph_owner_verified:committed.graph_owner_verified,
          owned_done_settled:committed.owned_done_settled,source_readback_verified:true,settings_preserved:true,
          source_sha256:expected.source_sha256,source_utf8_bytes:expected.source_utf8_bytes,source_lf_lines:expected.source_lf_lines});
      },
      async materializeOutput(ctx){
        enter(ctx);return withJavascriptSourcePolicyBoundary({phase:'materialization_start',owner,deadline:ctx.deadline,record:onRecord},
          ()=>admission.withEffect({receipt:configured,owner},()=>launch(ctx)));
      },
      async finishGraph(mode,ctx){
        enter(ctx);need(mode==='execute'&&outputMapping&&executionReceipt?.status==='completed',
          'JavaScript final Execute requires completed materialization and full output mapping');
        return withJavascriptSourcePolicyBoundary({phase:'finish',owner,deadline:ctx.deadline,record:onRecord},async()=>{
          const fresh=policyAdmission('existing',owner,ctx.deadline,expected,configured.settings_sha256),receipt=await fresh.admit({});
          return fresh.withEffect({receipt,owner},()=>launch(ctx));
        });
      },
      async waitExecution(ctx){
        enter(ctx);need(executionDriver,'JavaScript owned execution driver unavailable');
        try{executionReceipt=await executionDriver.waitCompleted({signal:ctx.signal,stopSignal:ctx.stopSignal});}
        catch(error){
          if(!ctx.stopSignal?.aborted||error!==ctx.stopSignal.reason||operation.transportUncertain)throw error;
          const saved=await onRecord({phase:'node_server_stop_requested',operation_id:operation.id,
            execution:structuredClone(ctx.execution),node:structuredClone(ctx.node)});
          need(saved?.phase==='node_server_stop_requested'&&saved.operation_id===operation.id
            &&saved.execution.execution_id===ctx.execution.execution_id,'JavaScript stop request ACK differs');
          executionReceipt=await executionDriver.stop();
        }
        return executionReceipt;
      },
      async readOutput(read,ctx){
        enter(ctx);need(executionReceipt?.verified===true&&executionReceipt.owner_verified===true
          &&executionReceipt.execution_id===ctx.execution.execution_id&&outputMapping,
        'JavaScript final owned execution and output mapping required');
        if(!read.ports.length)return verified({status:'complete',ports:[],execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id});
        const table=await openNewOutputTable(channel,0,{openViews:({output})=>openManagedJavascriptOutputViews({
          prepared:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref},node:ctx.node,output,
          deadline:ctx.deadline,targetOrigin,execute,record:onRecord,receiptOptions,
          wrapMutation:(code,reference)=>withBrowserReceipt('('+code+')(page)',{
            ...receiptOptions(reference.id,reference.action_key,reference.signature),operation_id:reference.id})})});
        need(table.port_guid===outputMapping.node_context.output_port.port_guid,'JavaScript physical output port changed');
        const format=read.require_exact_numbers?await configureTablePrecision(channel,table.table):null;
        let data,restoration;
        try{
          const settings=await prepareTableRead(channel,table.table);
          const raw=await readTableOutputPages(channel,table.table,{sampleRows:read.sample_rows});
          data=decodeTableOutput(raw,{formatProof:format,readSettings:settings,
            expectedColumns:outputMapping.target_fields.filter(field=>!field.excluded),requireExactNumbers:read.require_exact_numbers});
        }finally{if(format)restoration=await restoreTablePrecision(channel,format);}
        const returned=await returnFromOutputTable(channel,table.table);
        if(read.coverage==='full')need(data.sample_complete===true&&data.sample_rows===data.row_count&&!data.limitations?.length,
          'Full JavaScript UI output exceeds bounded read coverage');
        return verified({effect_possible:true,status:data.sample_complete?'complete':'partial',execution_id:ctx.execution.execution_id,
          evidence_ref:ctx.receipt_id,ports:[{port:0,port_guid:table.port_guid,fresh:true,execution_id:ctx.execution.execution_id,...data}],
          table_creation:table,format_restoration:restoration,workflow_return:returned});
      },
      async verifyContinuation(state,{signal:nextSignal}) {
        const ctx=javascriptExecutionWaitContext(state,{operation,owner,expected,configured,committed,inputMapping,outputMapping,now:now()});
        if(!ctx||!executionDriver)return false;
        enter({...ctx,signal:nextSignal});
        const native_execution=await executionDriver.verifyReadWaitContinuation(state.execution_wait);
        const proof={phase:'javascript_execution_wait_continuation_verified',operation_id:operation.id,
          node:ctx.node,execution_id:ctx.execution.execution_id,deadline:ctx.deadline,
          source_sha256:expected.source_sha256,settings_sha256:configured.settings_sha256,native_execution};
        const ack=await onRecord(structuredClone(proof));
        need(Object.keys(proof).every(key=>same(ack?.[key],proof[key])),'JavaScript execution continuation ACK differs');
        return true;
      },
    };
  };
  return {nodeApplyHandlers,nodeApplyDriverFactory};
}

function nodeRef(owner){return {document_id:owner.document_id,workflow_id:owner.workflow_id,node_id:owner.node_id};}


function javascriptReadbackMapping(mapping,direction){
  return {port:0,autosync:mapping.autosync,fields:mapping.target_fields.map(field=>({index:field.index,
    name:field.name,label:field.label,type:field.type,data_kind:field.data_kind,source_name:field.source.name,
    ...(direction==='output'?{excluded:field.excluded}:{})}))};
}
