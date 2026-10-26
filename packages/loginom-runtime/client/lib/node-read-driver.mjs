import {resolveCrossTableSchema} from './crosstable-schema.mjs';
import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
import {alignReadSchema,isUnchangedTextImportExecution,isUnchangedTransformExecution} from './node-read-contract.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {joinReady} from './join-procedure.mjs';
import {selectPreparedGraphNode} from './node-graph-selection.mjs';
import {createJavascriptSourceAdmission} from './javascript-source-admission.mjs';
import {createJavascriptManagedSourceAdapter} from './javascript-managed-source-adapter.mjs';
import {withJavascriptSourcePolicyBoundary} from './javascript-source-policy-refusal.mjs';
import {releasePendingNode,NODE_RELEASE_BUDGET_MS} from './node-pending-release.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const verified=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});

export function createNodeReadDrivers(options,{targetOrigin,targetBuild,redactor}){
 const {operation,execute,onRecord,now,receiptOptions}=options;
 const request=operation.parameters,javascript=request.target.type==='programming.javascript';
 const unchangedImport=isUnchangedTextImportExecution(request),unchangedTransform=isUnchangedTransformExecution(request);
 const unchanged=unchangedImport||unchangedTransform;
 const owner=javascript?{document_id:request.document_id,workflow_id:request.workflow_ref.workflow_id,
  node_id:request.target.ref.node_id,operation_id:operation.id,ui_epoch:Date.now()}:null;
 let channel,signal,driver,execution,sourceReceipt;
 const enter=ctx=>{
  signal=ctx.signal;signal?.throwIfAborted();operation.deadline=ctx.deadline;
  if(javascript)need(['document_id','workflow_id','node_id'].every(key=>ctx.node?.[key]===owner[key]),
   'JavaScript output reread owner changed');
  channel??=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:4096,targetOrigin,targetBuild,
   signal:{throwIfAborted:()=>signal?.throwIfAborted(),get aborted(){return signal?.aborted;},get reason(){return signal?.reason;}},
   preparedNodeContext:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node},
   wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
 };
 const sourceAdmission=ctx=>createJavascriptSourceAdmission({kind:'existing',owner,deadline:ctx.deadline,
  expectedSource:request.parameters.javascript_source,expectedSettings:sourceReceipt?.settings_sha256,redactor,record:onRecord,
  sourceAdapter:()=>createJavascriptManagedSourceAdapter({page:{},prepared:{document_id:request.document_id,
   workflow_ref:request.workflow_ref,node:request.target.ref},node:request.target.ref,uiEpoch:owner.ui_epoch,
   deadline:ctx.deadline,targetOrigin,execute,record:onRecord,receiptOptions,redactor,
   channel:remaining=>{operation.deadline=remaining;return channel;},openingBudgetMs:180000})});
 const forbidden=()=>{throw Error('A read operation cannot open or configure node/port wizards');};
 return {
  verifySource:async()=>verified(unchanged
   ?{source_kind:unchangedImport?'unchanged_existing_text_import':'unchanged_existing_transform',node:structuredClone(request.target.ref),settings_changed:false}
   :{source_kind:'completed_local_node',source_operation_id:request.parameters.source_operation_id}),
  ...(javascript?{async beforeTarget(ctx){
   enter({...ctx,node:request.target.ref});
   sourceReceipt=await withJavascriptSourcePolicyBoundary({phase:'target',owner,deadline:ctx.deadline,record:onRecord},
    ()=>sourceAdmission(ctx).admit({}));
   return verified({effect_possible:true,settings_changed:false,
    source_sha256:sourceReceipt.effective_source.source_sha256,
    settings_sha256:sourceReceipt.settings_sha256,source_bound_reread:true});
  }}:{}),
  mapPorts:forbidden,openWizard:forbidden,finish:forbidden,
  async finishGraph(mode,ctx){
   need(mode==='execute','Existing output read requires a fresh execution');enter(ctx);
   const launch=async()=>{
   if(unchangedTransform&&request.target.type==='transform.join_data'){
    // Read the native saved mode before the only Execute. Close discards the
    // untouched draft; no input/output mapping is opened or committed.
    const graph=await channel.observe({condition:'saved Join graph before mode read',ready:s=>s.prepared_node_context?.surface==='graph'});
    await selectPreparedGraphNode(channel,graph,'select saved Join before mode read',{refreshReplacedBody:true});
    await openPreparedWizard(channel);
    const owned=s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='wizard'
     &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===ctx.node[k]);
    let state=await channel.observe({condition:'saved Join initial page before mode read',readJoin:true,
     ready:s=>owned(s)&&['input_mapping','join'].includes(s.wizard?.stage)});
    if(state.wizard.stage==='input_mapping'){
     const root=state.wizard.root_tid;
     await channel.perform({condition:'advance saved Join input page to its mode settings',initialObservation:state,
      preserveJoinMapping:true,
      ready:s=>owned(s)&&s.wizard?.stage==='input_mapping'&&s.wizard.root_tid===root,
      identity:()=>({node:ctx.node,wizard_root:root}),resolve:s=>{
       const next=s.ui.elements.filter(e=>e.tid===root+';btnNext'&&e.allowed_actions.includes('wizard_step'));
       need(next.length===1,'Saved Join Next unavailable');
       return {verb:'wizard_step',ref:next[0].ref,expected_stage:'join'};
      }});
    }
    state=await channel.observe({condition:'saved Join mode before execution',readJoin:true,ready:s=>owned(s)&&joinReady(s)});
    const native=state.node_join;
    need(native.node_context?.verified===true&&['document_id','workflow_id','node_id'].every(k=>native.node_context[k]===ctx.node[k]),
     'Saved Join mode owner differs');
    await closePreparedWizard(channel);
    need(native.mode===request.mode,'Preserved join mode differs from requested mode');
   }
   driver=createNodeExecutionProcedure(channel,ctx.node,{allowDeactivate:true});await driver.prepare();
   const result=await finishConfiguredGraph(channel,driver,mode,ctx.node);
   // finishConfiguredGraph normally follows a committed wizard; here only
   // execution occurred. Do not claim a configuration readback or commit.
   return {...result,settings_applied:false};
   };
   if(!javascript)return launch();
   need(sourceReceipt?.intent==='preserve','JavaScript reread source admission missing');
   return withJavascriptSourcePolicyBoundary({phase:'finish',owner,deadline:ctx.deadline,record:onRecord},async()=>{
    const fresh=sourceAdmission(ctx),receipt=await fresh.admit({});
    return fresh.withEffect({receipt,owner},launch);
   });
  },
  async waitExecution(ctx){
   enter(ctx);need(driver,'Read execution driver missing');
   try{execution=await driver.waitCompleted({signal:ctx.signal,stopSignal:ctx.stopSignal});}
   catch(error){
    if(!ctx.stopSignal?.aborted||error!==ctx.stopSignal.reason||operation.transportUncertain)throw error;
    execution=await driver.stop();
   }
   return execution;
  },
  async readOutput(read,ctx){
   enter(ctx);need(execution?.verified===true&&execution.owner_verified===true&&execution.execution_id===ctx.execution.execution_id,
    'Fresh owned execution required for reread');
   const ports=[];
   for(const port of read.ports){
    const schema=unchanged?null:request.parameters.schemas.find(s=>s.port===port)?.schema;
    need(schema||schema===null&&(unchanged||request.parameters.observed_schema===true),'Retained output schema missing');
    const result=await channel.readOutputPort({port,execution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
    const output=result.output;
    const policy=operation.parameters.parameters.cross_table_policy;
    let materialized;
    if(policy){
     need(operation.parameters.target.type==='transform.cross_table'&&policy.kind==='crosstable_sliding'
      &&policy.configuration.category_mode==='sliding'&&port===0&&output.port_guid===policy.port_guid
      &&ctx.execution.execution_id!==policy.source_execution_id
      &&['document_id','workflow_id','node_id'].every(k=>policy.node[k]===ctx.node[k]),'CrossTable reread owner/port differs');
     materialized=resolveCrossTableSchema(output.schema,policy.configuration);
    }
    ports.push({...output,schema:materialized?.columns??alignReadSchema(output.schema,schema),
     ...(materialized?{category_fields:materialized.category_fields}:{})});
   }
   return verified({effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',
    execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports,
    ...(javascript?{javascript_source:{...request.parameters.javascript_source,
     source_operation_id:request.parameters.source_operation_id,settings_sha256:sourceReceipt.settings_sha256,
     policy:sourceReceipt.effective_source.policy}}:{})});
  },
  // Same-ID delivery retries return the original worker. Unknown browser effects
  // stay blocked; this route never restarts an uncertain execution automatically.
  verifyContinuation:async()=>false,
  ...(!javascript?{
   releasePendingPhases:['finish','read'],
   async releasePending(state,{signal}={}){
    need(['finish','read'].includes(state.pending?.phase),'Only a stopped output-read finish or read can be released here');
    const deadline=now()+NODE_RELEASE_BUDGET_MS;
    enter({signal,deadline,document_id:state.request.document_id,
     workflow_ref:state.request.workflow_ref,node:state.node});
    return releasePendingNode({operation,channel,deadline,now,readReceipt:options.readReceipt});
   },
   // Browser recovery runs the same proof for any stopped phase: the model, not
   // this driver, restored the page, and the proof rechecks the quiet graph.
   async recoveryReleasePending(state,{signal}={}){
    const deadline=now()+NODE_RELEASE_BUDGET_MS;
    enter({signal,deadline,document_id:state.request.document_id,
     workflow_ref:state.request.workflow_ref,node:state.node});
    return releasePendingNode({operation,channel,deadline,now,readReceipt:options.readReceipt});
   },
  }:{}),
 };
}
