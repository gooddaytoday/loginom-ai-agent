import {selectPreparedGraphNode} from './node-graph-selection.mjs';
import {inputMappingOrigin,inputMappingState,inputMappingGraph,verifyInputMappingFinish,inputRecoveryBoundary,sameInputRecovery} from './node-input-mapping-recovery.mjs';
import {verifyCalculatorInlineSync} from './calculator-inline-mapping.mjs';
import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {validateCalculatorParameters} from './calculator-parameters.mjs';
import {configureCalculator} from './calculator-procedure.mjs';
import {calculatorConfigurationReadback} from './calculator-readback.mjs';
import {calculatorParametersSchema} from './node-api.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
import {configureOutputFields,configureOutputAutosync,reorderOutputFields,resolveConfiguredOutputMapping} from './port-mapping-procedure.mjs';
import {readOutputDefinitionPages} from './import-definition-pages.mjs';
import {openNewOutputTable,configureTablePrecision,restoreTablePrecision,prepareTableRead,returnFromOutputTable} from './node-output-procedure.mjs';
import {readTableOutputPages} from './table-output-pages.mjs';
import {decodeTableOutput} from './table-output-values.mjs';
import {readCollapseNativeOutput} from './collapse-native-output.mjs';
import {finishedImportSurface,verifyFinishedImportContinuation,verifyWaitingExecutionContinuation} from './node-import-continuation.mjs';

const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
const verified=v=>({verified:true,cleanup_complete:true,effect_possible:false,...v});
const control=(s,key,verb)=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';'+key&&e.allowed_actions.includes(verb));requireValue(es.length===1,'Unique wizard control required: '+key);return es[0];};
export function calculatorOutputSources(configuration) {
 const replaced=new Set(configuration.expressions.filter(e=>e.replace).map(e=>e.name.toLowerCase()));
 return [...configuration.expressions.filter(e=>!e.intermediate),...configuration.input_fields.filter(f=>!replaced.has(f.name.toLowerCase()))]
  .map(f=>({name:f.name,label:f.label,type:f.type,used:true}));
}

export function createCalculatorNodeSupport(config) {return createTabularTransformNodeSupport(config);}

// Shared lifecycle for a tabular transformation with a separate output
// wizard. Type-specific code supplies configuration and derived-output hooks;
// graph ownership, execution, continuation and data reading remain shared.
export function createTabularTransformNodeSupport({targetOrigin,targetBuild},implementation=null) {
 const nodeApplyHandlers=new Map([['transform.calculator',{revision:'calculator-v3-internal-2',modes:['expression'],output_wizard:'separate',
  configurationReadback:calculatorConfigurationReadback,parameter_schema:calculatorParametersSchema,
  validate:(p,m,r)=>{validateCalculatorParameters(p,m,r);
   requireValue(r.mappings.every(x=>(x.fields??[]).every(f=>f.source?.kind==='configured_field'&&(x.direction==='output'||f.excluded!==true))),
    'Calculator mappings require configured field names; input exclusions are unsupported');},
  configure:(ctx,p,drivers)=>drivers.configureCalculator(ctx,p)}]]);
 if(implementation){nodeApplyHandlers.clear();nodeApplyHandlers.set(implementation.type,{
  revision:implementation.revision,modes:implementation.modes??[implementation.mode],output_wizard:'separate',
  configurationReadback:implementation.readback,parameter_schema:implementation.parameterSchema,
  validate:implementation.validate,configure:(ctx,p,drivers)=>drivers.configureCalculator(ctx,p)});}
 const nodeApplyDriverFactory=options=>{
  const {operation,execute,onRecord,now,receiptOptions}=options;
  let channel,activeSignal,configured,mapping,columns,executionDriver,executionReceipt,multipleOutputs,preconfiguration,inputCheckpoint;
  const configureProgress={};
  const graphForInput=async()=>inputMappingGraph(await operation.nodeTargetAdapter.observe({document_id:operation.nodeApply.request.document_id,
   workflow_ref:operation.nodeApply.request.workflow_ref},operation.deadline),operation.nodeApply.node);
  const recordInput=async(phase,details)=>{
   const e={operation_id:operation.id,action_key:'node.apply',action_revision:operation.nodeApply.request.contract_revision,phase,...details};
   const ack=await onRecord(e);requireValue(ack&&sameInputRecovery(e,Object.fromEntries(Object.keys(e).map(k=>[k,ack[k]]))),'Input recovery journal acknowledgement differs');
  };
  const enter=ctx=>{activeSignal=ctx.signal;operation.deadline=ctx.deadline;
   channel??=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:4096,targetOrigin,targetBuild,
    signal:{throwIfAborted:()=>activeSignal?.throwIfAborted(),get aborted(){return activeSignal?.aborted;},get reason(){return activeSignal?.reason;}},preparedNodeContext:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node},
    wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});return channel;};
  const finishWizard=async (mode,port=false,definition,recovery)=>{
   const verb=mode==='execute'?'execute_wizard':'finish_wizard',key=mode==='execute'?'btnExecute':'btnDone';
   // Complete definition paging leaves the grid on its last addressed page.
   const offset=definition?Math.floor((definition.total_columns-1)/8)*8:0;
   const s=await channel.observe({condition:'calculator '+mode+' available',...(port?{outputColumnPage:{offset,limit:8}}:{}),ready:s=>s.wizard?.status==='observed'&&s.ui.elements.some(e=>e.tid===s.wizard.root_tid+';'+key&&e.allowed_actions.includes(verb))});
   if(recovery){
    requireValue(s.wizard.stage==='input_mapping'&&sameInputRecovery(s.prepared_node_context,recovery.value.native_mapping.node_context),'Input mapping owner changed before Done');
    recovery.wizard_root_ref=s.wizard.root_ref;await recordInput('node_input_mapping_commit_prepared',{checkpoint:recovery});
   }
   try{await channel.perform({condition:'calculator '+mode,initialObservation:s,ready:s=>s.wizard?.status==='observed',identity:s=>s.prepared_node_context,
    resolve:s=>({verb,ref:control(s,key,verb).ref})});}
   catch(error){if(recovery){recovery.finish_reference=structuredClone(operation.lastReceipt);await recordInput('node_input_mapping_finish_unresolved',{reference:recovery.finish_reference});}throw error;}
   const graph=await channel.observe({condition:'calculator returned to graph',ready:s=>s.wizard?.status==='absent'&&s.prepared_node_context?.surface==='graph'});
   return verified({effect_possible:true,mode,settings_applied:true,execution_started:false,node_context:graph.prepared_node_context});
  };
  return {
   ...(implementation?.inspectConfigure?{
    async inspectConfigure(state,{signal}={}){
     activeSignal=signal;operation.deadline=Math.min(state.deadline,state.configure_deadline,state.pending?.deadline??0);
     requireValue(channel&&typeof options.readReceipt==='function','Original configure channel/receipt reader missing');
     return implementation.inspectConfigure({channel,operation,progress:configureProgress,readReceipt:options.readReceipt,record:onRecord,now});
    },
    async verifyPendingConfigure(state,ctx){
     const proof=await this.inspectConfigure(state,ctx);
     requireValue(proof.verified===true,'Date/time configure continuation not verified');
     configureProgress.expected=structuredClone(proof.expected);
     delete configureProgress.pending;delete configureProgress.step;delete configureProgress.reference;
     operation.transportUncertain=false;
     return true;
    },
   }:{}),
   ...(implementation?.preflight?{beforeTarget:ctx=>implementation.preflight(options,ctx,{targetOrigin,targetBuild})}:{}),
   verifySource:async()=>verified({not_applicable:true,source_kind:'upstream_table'}),
   async openWizard(ctx) {
    enter(ctx);executionDriver=createNodeExecutionProcedure(channel,ctx.node);await executionDriver.prepare();
    if(implementation?.beforeOpen)preconfiguration=await implementation.beforeOpen(channel,operation.nodeApply.request);
    const s=await channel.observe({condition:'calculator graph before opening',ready:s=>s.prepared_node_context?.surface==='graph'});
    await selectPreparedGraphNode(channel,s,'select calculator graph node');
    await openPreparedWizard(channel);
    const opened=await channel.observe(implementation?.configurationObservation??{condition:'calculator expression page',readCalculator:true,ready:s=>s.wizard?.stage==='calculator'&&s.node_calculator?.verified===true});
    return verified({effect_possible:true,node_context:opened.prepared_node_context,...(preconfiguration?{preconfiguration}: {})});
   },
   async configureCalculator(ctx,p) {
    enter(ctx);
    if(implementation){
     if(implementation.inspectConfigure){configureProgress.signature??=operation.nodeApply.signature;configureProgress.node??=structuredClone(operation.nodeApply.node);}
     try{
      const changed=await implementation.configure(channel,p,{request:operation.nodeApply.request,inputMapping:operation.nodeApply.phases.find(p=>p.phase==='input_mapping')?.value?.native_mapping,preconfiguration,
       ...(implementation.inspectConfigure?{progress:configureProgress}:{})});configured=changed.configuration;return changed;
     }catch(error){
      if(implementation.inspectConfigure&&configureProgress.pending){
       configureProgress.step=channel.lastPreparedStep;configureProgress.reference=structuredClone(operation.lastReceipt);
      }
      throw error;
     }
    }
    const changed=await configureCalculator(channel,p,{newNode:operation.nodeApply.request.target.kind==='new'});configured=changed.configuration;
    // Close discards this editor draft directly. Next can validate a formula or
    // synchronize a derived port, neither of which is needed for cancellation.
    if(operation.nodeApply.request.finish==='close')return verified({...changed});
    const s=await channel.observe({condition:'calculator syntax validation available',readCalculator:true,ready:s=>s.wizard?.stage==='calculator'&&s.node_calculator?.verified===true});
    await channel.perform({condition:'validate calculator expressions and advance',initialObservation:s,ready:s=>s.wizard?.stage==='calculator',identity:()=>ctx.node,
     resolve:s=>({verb:'wizard_step',ref:control(s,'btnNext','wizard_step').ref,expected_stage:['output_mapping','done']})});
    let inlineMapping;
    const destination=await channel.observe({condition:'calculator validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
    if(destination.wizard.stage==='output_mapping'){
     const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true
      &&s.node_mapping.mapping_wizard==='DerivedDataSourceMappingEngineOutputPortWizard';
     const before=await channel.observe({condition:'calculator conditional output mapping',readMappings:true,ready});
     const native=before.node_mapping;resolveConfiguredOutputMapping({direction:'output',port:0},calculatorOutputSources(configured),native);
     const linked=native.target_fields.map(f=>(f.source??f.exclusion_source)?.record_id);
     requireValue(linked.every(Boolean),'Conditional calculator output has an unbound field');
     const missing=native.source_fields.filter(f=>!linked.includes(f.record_id));
     requireValue(missing.every(f=>f.required===true&&p.expressions.some(e=>e.target.kind==='new'&&e.name===f.name)),
      'Only newly requested expressions may need conditional output synchronization');
     let after=before;
     if(missing.length){
      await channel.perform({condition:'include requested calculator fields in retained output',initialObservation:before,ready,identity:()=>ctx.node,
       resolve:s=>({verb:'click',ref:control(s,'DerivedDataSourceMappingEngineOutputPortWizard;btnSyncThroughColumns','click').ref})});
      after=await channel.observe({condition:'calculator conditional output synchronized',readMappings:true,ready});
      verifyCalculatorInlineSync(native,after.node_mapping,missing);
     }
     inlineMapping={before:native,after:after.node_mapping,added_sources:missing.map(f=>f.name)};
     await channel.perform({condition:'complete calculator conditional mapping',initialObservation:after,ready,identity:()=>ctx.node,
      resolve:s=>({verb:'wizard_step',ref:control(s,'btnNext','wizard_step').ref,expected_stage:'done'})});
    }
    const done=await channel.observe({condition:'calculator syntax accepted on completion page',ready:s=>s.wizard?.stage==='done'});
    return verified({...changed,effect_possible:true,syntax_validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context},configuration:configured,...(inlineMapping?{inline_mapping:inlineMapping}:{})});
   },
   async mapPorts(mappings,ctx) {
    if(ctx.receipt_id===operation.id+':input_mapping'){
     // Even an unchanged input wizard's Done may synchronize/reorder fields.
     // Cancellation must never open and commit that separate settings form.
     if(operation.nodeApply.request.finish==='close'){
      requireValue(mappings.length===0,'Close cannot commit input mappings');
      return verified({not_applicable:true,mappings:[]});
     }
     enter(ctx);
     if(implementation?.beforeInput)await implementation.beforeInput(options,ctx,{targetOrigin,targetBuild});
     if(implementation?.configureInputs)return implementation.configureInputs(channel,mappings,ctx,operation.nodeApply.request,finishWizard);
     const recoveryGraph=implementation?.inputMappingRecovery?await graphForInput():null;
     await channel.openInputPort(0);
     const ready=s=>s.wizard?.stage==='input_mapping'&&s.node_mapping?.verified===true;
     let s=await channel.observe({condition:'calculator incoming port schema',readMappings:true,ready});
     const requested=mappings[0]??{direction:'input',port:0},sources=s.node_mapping.source_fields.map(f=>({...f,used:true}));
     const resolved=resolveConfiguredOutputMapping(requested,sources,s.node_mapping),changes=[];
     await implementation?.validateInput?.(operation.nodeApply.request.parameters,resolved,s.node_mapping,
       {channel,record:onRecord,operationId:operation.id});
     if(requested.fields)changes.push(await configureOutputFields(channel,requested,sources));
     if(resolved.fields)changes.push(await reorderOutputFields(channel,resolved.fields.map(f=>f.current.record_id)));
     if(requested.autosync!==undefined)changes.push(await configureOutputAutosync(channel,requested.autosync));
     s=await channel.observe({condition:'configured incoming port readback',readMappings:true,ready});
     const native_mapping=s.node_mapping,definition=await readOutputDefinitionPages(channel,{expectedCount:native_mapping.target_fields.length});
     requireValue(definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===native_mapping.target_fields[i][k])),'Incoming port definition differs');
     if(recoveryGraph)inputCheckpoint={node:structuredClone(ctx.node),origin:inputMappingOrigin(targetOrigin),build:targetBuild,graph:recoveryGraph,
      mapping:inputMappingState(native_mapping,ctx.node),value:structuredClone({native_mapping,definition,changes,source_identity_verified:true}),attempts:0};
     const finish=await finishWizard('done',true,definition,inputCheckpoint);
     return verified({effect_possible:true,native_mapping,definition,changes,finish,source_identity_verified:true});
    }
    enter(ctx);requireValue(configured,'Configured calculator missing');
    if(implementation?.configureAllOutputs){multipleOutputs=await implementation.configureAllOutputs(channel,configured,operation.nodeApply.request.parameters,mappings,finishWizard);return multipleOutputs;}
    await channel.openOutputPort(0);
    const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true;
    if(implementation){
     const result=await implementation.configureOutput(channel,configured,operation.nodeApply.request.parameters,mappings[0]??{});
     mapping=result.native_mapping;columns=mapping.target_fields.filter(f=>!f.excluded);
     const definition=await readOutputDefinitionPages(channel,{expectedCount:mapping.target_fields.length});
     requireValue(definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===mapping.target_fields[i][k])),'Derived output definition differs');
     const finish=await finishWizard('done',true,definition);return verified({...result,effect_possible:true,definition,finish,source_identity_verified:true});
    }
    const sources=calculatorOutputSources(configured);
    let s=await channel.observe({condition:'calculator native output mapping',readMappings:true,ready});
    resolveConfiguredOutputMapping({direction:'output',port:0},sources,s.node_mapping);
    const changes=[];
    if(mappings.length) {
     const requested=mappings[0],resolved=resolveConfiguredOutputMapping(requested,sources,s.node_mapping);
     if(requested.fields)changes.push(await configureOutputFields(channel,requested,sources));
     if(resolved.fields){
      const current=await channel.observe({condition:'output identities after field edits',readMappings:true,ready});
      const updated=resolveConfiguredOutputMapping(requested,sources,current.node_mapping);
      changes.push(await reorderOutputFields(channel,updated.fields.map(f=>f.current.record_id)));
     }
     if(requested.autosync!==undefined)changes.push(await configureOutputAutosync(channel,requested.autosync));
    }
    s=await channel.observe({condition:'configured calculator output mapping readback',readMappings:true,ready});mapping=s.node_mapping;
    const active=mapping.target_fields.filter(f=>!f.excluded),definition=await readOutputDefinitionPages(channel,{expectedCount:mapping.target_fields.length});
    requireValue(definition.fields.length===mapping.target_fields.length&&definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===mapping.target_fields[i][k])),
     'Rendered calculator output mapping differs from native fields');columns=active;
    const finish=await finishWizard('done',true,definition);
    return verified({effect_possible:true,native_mapping:mapping,definition,changes,finish,source_identity_verified:true});
   },
   async finish(mode,ctx){enter(ctx);if(mode==='close')return closePreparedWizard(channel);requireValue(mode==='done','Separate calculator port requires intermediate Done');return finishWizard(mode);},
   async finishGraph(mode,ctx){
    enter(ctx);
    const graph=await channel.observe({condition:'calculator graph ready after port commit',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
    // Loginom can leave a visible port without an SVG shape after port Done.
    // The normal node selection redraws it before the next graph checkpoint.
    await selectPreparedGraphNode(channel,graph,'select configured calculator after port commit',{
     refreshReplacedBody:implementation?.refreshGraphBodyAfterPortCommit===true});
    const finish=await finishConfiguredGraph(channel,executionDriver,mode,ctx.node);
    if(mode==='execute')finish.continuation_surface=finishedImportSurface(await channel.observe({
     condition:'calculator graph execution continuity checkpoint',readProcesses:true,readOutputs:true,
     ready:s=>s.prepared_node_context?.surface==='graph'&&s.node_processes?.verified===true&&s.node_outputs?.verified===true}));
    return finish;
   },
   async waitExecution(ctx){
    enter(ctx);requireValue(executionDriver,'Calculator execution driver is missing');
    try{executionReceipt=await executionDriver.waitCompleted({signal:ctx.signal,stopSignal:ctx.stopSignal});}
    catch(error){
     if(!ctx.stopSignal?.aborted||error!==ctx.stopSignal.reason||operation.transportUncertain)throw error;
     const saved=await onRecord({phase:'node_server_stop_requested',operation_id:operation.id,
      execution:structuredClone(ctx.execution),node:structuredClone(ctx.node)});
     requireValue(saved?.phase==='node_server_stop_requested'&&saved.operation_id===operation.id
      &&saved.execution?.execution_id===ctx.execution.execution_id,'Calculator stop request was not durably acknowledged');
     return executionDriver.stop();
    }
    return executionReceipt;
   },
   async readOutput(read,ctx) {
    enter(ctx);requireValue(executionReceipt?.verified&&executionReceipt.owner_verified&&executionReceipt.execution_id===ctx.execution.execution_id,'Calculator execution proof missing');
    if(!read.ports.length)return verified({status:'complete',ports:[],execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id});
    if(read.coverage==='full'){
     requireValue(implementation?.nativeFullOutput===true,'Full native output is unavailable for this handler');
     return readCollapseNativeOutput(channel,read,ctx,options,{targetOrigin,targetBuild});
    }
    if(implementation?.readOutputs){requireValue(multipleOutputs?.verified,'Verified output schemas missing');return implementation.readOutputs(channel,read,ctx,multipleOutputs);}
    const table=await openNewOutputTable(channel,0),formatProof=read.require_exact_numbers?await configureTablePrecision(channel,table.table):null;
    let readSettings,data,formatRestoration;
    try {
      readSettings=await prepareTableRead(channel,table.table);
      const raw=await readTableOutputPages(channel,table.table,{sampleRows:read.sample_rows});
      data=decodeTableOutput(raw,{formatProof,readSettings,expectedColumns:columns,requireExactNumbers:read.require_exact_numbers});
    } finally { if(formatProof)formatRestoration=await restoreTablePrecision(channel,formatProof); }
    const returned=await returnFromOutputTable(channel,table.table);
    return verified({effect_possible:true,status:data.sample_complete?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,
     ports:[{port:0,port_guid:table.port_guid,fresh:true,execution_id:ctx.execution.execution_id,...data}],table_creation:table,format_proof:formatProof,format_restoration:formatRestoration,read_settings:readSettings,workflow_return:returned});
   },
   ...(implementation?.inputMappingRecovery?{
    async inspectInputMapping({readReceipt,signal}){
     const state=inputRecoveryBoundary(operation,now);requireValue(inputCheckpoint?.finish_reference?.action_key==='ui.act','Original input Done reference unavailable');
     activeSignal=signal;signal?.throwIfAborted();operation.deadline=Math.min(state.deadline,state.configure_deadline,state.pending.deadline,now()+45000);
     requireValue(!inputCheckpoint.probe_pending,'Mapping inspection gesture remains unresolved; inspect the owned UI before further action');
     verifyInputMappingFinish(inputCheckpoint,await readReceipt(inputCheckpoint.finish_reference));
     requireValue(sameInputRecovery(await graphForInput(),inputCheckpoint.graph),'Input source or target changed after Done; restore the original graph before resume');
     return {available:true,phase:'input_mapping',receipt_id:inputCheckpoint.finish_reference.id,
      verification:'completed_input_done_requires_mapping_probe',execution_started:false};
    },
    async recoverInputMapping({readReceipt,signal}){
     await this.inspectInputMapping({readReceipt,signal});
     requireValue(inputCheckpoint.attempts<2,'Input mapping probe budget exhausted');
     inputCheckpoint.attempts++;inputCheckpoint.probe_pending=true;
     let opened=false,observed,cancelled;
     try{
      await channel.openInputPort(0);opened=true;
      const s=await channel.observe({condition:'recovery reads committed input mapping without edits',readMappings:true,
       ready:s=>s.wizard?.stage==='input_mapping'&&s.node_mapping?.verified===true});observed=s.node_mapping;
     }finally{
      if(opened){cancelled=await closePreparedWizard(channel);inputCheckpoint.probe_pending=false;}
     }
     await recordInput('node_input_mapping_recovery_checked',{observed,cancelled,expected:inputCheckpoint.mapping});
     requireValue(sameInputRecovery(inputMappingState(observed,inputCheckpoint.node),inputCheckpoint.mapping),'Committed mapping differs; restore the declared mapping before retrying the same operation');
     requireValue(sameInputRecovery(await graphForInput(),inputCheckpoint.graph),'Input graph changed during verification');
     inputCheckpoint.probe_verified=true;
     return verified({...structuredClone(inputCheckpoint.value),effect_possible:true,
      finish:verified({effect_possible:true,mode:'done',settings_applied:true,execution_started:false,node_context:cancelled.node_context}),
      recovery:{verified:true,finish_receipt_id:inputCheckpoint.finish_reference.id,observed_mapping:observed,probe_cancel:cancelled}});
    },
   }:{}),
   async verifyContinuation(state,{signal}={}){
    if(state.input_mapping_recovered&&state.phases.at(-1)?.phase==='input_mapping'){
     if(!channel||state.pending||state.cleanup_complete!==true||!inputCheckpoint?.probe_verified||now()>=Math.min(state.deadline,state.configure_deadline))return false;
     activeSignal=signal;signal?.throwIfAborted();operation.deadline=Math.min(state.deadline,state.configure_deadline,now()+15000);
     return sameInputRecovery(await graphForInput(),inputCheckpoint.graph);
    }
    // Only a durably accepted graph launch can be resumed. A partially edited
    // expression or port needs reconciliation; never replay its mutations.
    if(!channel||!configured||state.pending||state.cleanup_complete!==true
     ||state.phases.at(-1)?.phase!=='finish'||now()>=Math.min(state.deadline,state.execution_wait?.deadline??Infinity))return false;
    activeSignal=signal;signal?.throwIfAborted();operation.deadline=Math.min(state.deadline,now()+15000);
    const surface=await channel.observe({condition:'calculator retains accepted execution checkpoint',readProcesses:true,readOutputs:true,
     ready:s=>s.prepared_node_context?.surface==='graph'&&s.node_processes?.verified===true&&s.node_outputs?.verified===true});
    const confirmed=(state.execution_wait?verifyWaitingExecutionContinuation:verifyFinishedImportContinuation)({node:state.node,finish:state.phases.at(-1).value,surface,checkpoint:state.execution_wait});
    await onRecord({operation_id:operation.id,action_key:'node.apply',action_revision:state.request.contract_revision,
     phase:'node_continuation_checked',boundary:state.execution_wait?'execute_wait':'finish',verified:confirmed,surface:finishedImportSurface(surface)});
    return confirmed;
   },
  };
 };
 return {nodeApplyHandlers,nodeApplyDriverFactory};
}
