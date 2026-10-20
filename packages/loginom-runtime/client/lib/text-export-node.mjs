import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {selectPreparedGraphNode} from './node-graph-selection.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {createNodeExecutionProcedure} from './node-execution-procedure.mjs';
import {readOutputDefinitionPages} from './import-definition-pages.mjs';
import {validateTextExportParameters} from './text-export-parameters.mjs';
import {configureTextExport} from './text-export-procedure.mjs';
import {textExportParametersSchema} from './node-api.mjs';
import {readNativeExportFile} from './text-export-output.mjs';
import {exportContinuationSurface,verifyExportContinuation} from './text-export-continuation.mjs';
import {releasePendingNode,NODE_RELEASE_BUDGET_MS} from './node-pending-release.mjs';
const need=(v,m)=>{if(!v)throw Error(m);},one=xs=>{need(xs.length===1,'Unique export control required');return xs[0];};
const verified=v=>({verified:true,cleanup_complete:true,effect_possible:false,...v});
export function textExportReadback({node,phases}){
 const configured=phases.find(p=>p.phase==='configure'),input=phases.find(p=>p.phase==='input_mapping'),finish=phases.find(p=>p.phase==='finish');
 need(configured?.value?.configuration&&input?.value?.source_identity_verified&&finish?.status==='verified','Export readback chain incomplete');
 const c=configured.value.configuration;
 return {kind:'text_export',scope:'observed_before_verified_finish',node,receipt_ids:[input.receipt_id,configured.receipt_id,finish.receipt_id],values_are:'observed_ui_values',
  destination:c.destination,settings:Object.fromEntries(Object.values(c.configured).filter(x=>x?.values).flatMap(x=>Object.entries(x.values).map(([k,v])=>[k,v.value]))),
  input_mapping:{port:0,autosync:input.value.native_mapping.autosync,fields:input.value.native_mapping.target_fields.map(f=>({index:f.index,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind,source_name:f.source.name}))},package_persistence_verified:false};
}
export function createTextExportNodeSupport({targetOrigin,targetBuild,storageDirectories=null}){
 let storageContinuation=null;
 const nodeApplyHandlers=new Map([['exports.text',{revision:'text-export-v1-candidate',fileOutput:true,modes:['delimited'],parameter_schema:textExportParametersSchema,
  validate:(p,m,r)=>validateTextExportParameters(p,m,r,storageDirectories),configurationReadback:textExportReadback,configure:(ctx,p,drivers)=>drivers.configureExport(ctx,p)}]]);
 return {nodeApplyHandlers,nodeApplyDriverFactory:options=>{
  const {operation,execute,onRecord,now,receiptOptions,artifactStore}=options;
  let channel,signal,driver,execution,configuration,inputMapping,recoveryReads=0;
  const enter=ctx=>{signal=ctx.signal;operation.deadline=ctx.deadline;return channel??=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:4096,targetOrigin,targetBuild,
   signal:{throwIfAborted:()=>signal?.throwIfAborted(),get aborted(){return signal?.aborted;},get reason(){return signal?.reason;}},
   preparedNodeContext:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node},
   wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});};
  const finish=async(mode,ctx,port=false,definition)=>{
   enter(ctx);if(mode==='close')return closePreparedWizard(channel);
   const verb=mode==='execute'?'execute_wizard':'finish_wizard',key=mode==='execute'?'btnExecute':'btnDone';
   const initial=port?await channel.observe({condition:'export input Done at complete definition page',outputColumnPage:{offset:Math.floor((definition.total_columns-1)/8)*8,limit:8},ready:s=>s.wizard?.stage==='input_mapping'&&s.wizard.output_columns?.page?.status==='complete_definition_page'}):undefined;
   await channel.perform({condition:'export '+mode,...(initial?{initialObservation:initial}:{}),ready:s=>s.wizard?.status==='observed'&&s.ui.elements.some(e=>e.tid===s.wizard.root_tid+';'+key&&e.allowed_actions.includes(verb)),identity:()=>ctx.node,
    resolve:s=>({verb,ref:one(s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';'+key&&e.allowed_actions.includes(verb))).ref})});
   const graph=await channel.observe({condition:'export returns to owned graph',ready:s=>s.wizard?.status==='absent'&&s.prepared_node_context?.surface==='graph'});
   const e=mode==='execute'?await driver.identify():null;
   const continuation=e?exportContinuationSurface(await channel.observe({condition:'export execution continuity checkpoint',readProcesses:true,ready:s=>s.prepared_node_context?.surface==='graph'&&s.node_processes?.verified===true})):null;
   return verified({effect_possible:true,mode,settings_applied:true,execution_started:mode==='execute',node_context:graph.prepared_node_context,...(e?{execution_id:e.execution_id,execution_group:e,continuation_surface:continuation}:{}),port});
  };
  return {
   verifySource:async()=>verified({source_kind:'upstream_table',not_applicable:true}),
   async mapPorts(mappings,ctx){
    need(mappings.length===0,'Requested export mappings unsupported');
    if(ctx.receipt_id===operation.id+':output_mapping')return verified({not_applicable:true,tabular_outputs:0});
    enter(ctx);if(operation.nodeApply.request.finish==='close')return verified({not_applicable:true,source_identity_verified:false});
    // Link can restore the canvas offset after node placement. Reveal only observed lower-viewport clipping.
    const graph=await channel.observe({condition:'export input viewport',ready:s=>s.prepared_node_context?.surface==='graph'&&s.prepared_node_context.locked===false&&s.wizard?.status==='absent'});
    const ports=graph.ui.elements.filter(e=>e.kind==='port'&&e.tid?.startsWith(graph.prepared_node_context.tid+';Input_Data-'));
    const port=ports.length===1?ports[0]:null,viewport=graph.geometry?.viewport;
    if(port?.interaction?.state==='point_not_observed'&&Number.isFinite(viewport?.height)
      &&Number.isFinite(port.bounding_box?.y)&&Number.isFinite(port.bounding_box?.height)
      &&port.bounding_box.y+port.bounding_box.height>viewport.height) {
     const owner=graph.graph_identity;
     need(owner?.status==='observed'&&port.scroll?.ref===owner.container_ref,'Export input scroll owner is unverified');
     need(Number.isInteger(port.scroll.top)&&Number.isInteger(port.scroll.max_top)&&port.scroll.top>=0&&port.scroll.max_top>port.scroll.top,'Export input has no remaining scroll range');
     const anchor=graph.ui.elements.find(e=>e.scope==='graph'&&e.tid?.startsWith(owner.native_prefix)
      &&e.signature?.native_graph?.status==='non_script'&&e.scroll?.ref===owner.container_ref
      &&e.scroll.top===port.scroll.top&&e.scroll.max_top===port.scroll.max_top
      &&e.interaction?.state==='point_observed'&&e.allowed_actions.includes('scroll'));
     need(anchor,'Export input has no observed canvas scroll anchor');
     await channel.perform({condition:'reveal clipped export input',initialObservation:graph,
      ready:s=>s.prepared_node_context?.surface==='graph'&&s.prepared_node_context.locked===false&&s.wizard?.status==='absent',
      identity:s=>({node:s.prepared_node_context,owner:s.graph_identity,viewport:s.geometry?.viewport,
       port:s.ui.elements.filter(e=>e.ref===port.ref),anchor:s.ui.elements.filter(e=>e.ref===anchor.ref)}),
      resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:Math.min(1000,port.scroll.max_top-port.scroll.top)})});
     const fresh=await channel.observe({condition:'export input after canvas scroll',ready:s=>s.prepared_node_context?.surface==='graph'&&s.prepared_node_context.locked===false&&s.wizard?.status==='absent'});
     need(['document_id','workflow_id','node_id','tid'].every(k=>fresh.prepared_node_context[k]===graph.prepared_node_context[k])
      &&['container_ref','container_tid','native_prefix'].every(k=>fresh.graph_identity?.[k]===owner[k]),'Export input graph changed during scroll');
     const revealed=one(fresh.ui.elements.filter(e=>e.kind==='port'&&e.tid?.startsWith(fresh.prepared_node_context.tid+';Input_Data-')));
     if(revealed.interaction?.state==='point_not_observed') {
      // Select the owned label through ordinary UI guards; never dismiss or ignore a covering element.
      const label=one(fresh.ui.elements.filter(e=>e.tid===fresh.prepared_node_context.tid+';Label;Label'));
      need(label.scope==='graph'&&label.graph_node?.part==='label'&&label.signature?.native_graph?.status==='non_script'
       &&label.scroll?.ref===owner.container_ref&&label.visible===true&&label.enabled===true
       &&label.interaction?.state==='point_observed'&&label.allowed_actions.includes('click'),'Export input has no observed own label');
      await channel.perform({condition:'select own export label after reveal',initialObservation:fresh,
       ready:s=>s.prepared_node_context?.surface==='graph'&&s.prepared_node_context.locked===false&&s.wizard?.status==='absent',
       identity:s=>({node:s.prepared_node_context,owner:s.graph_identity,
        port:s.ui.elements.filter(e=>e.ref===revealed.ref),label:s.ui.elements.filter(e=>e.ref===label.ref)}),
       resolve:()=>({verb:'click',ref:label.ref})});
      const selected=await channel.observe({condition:'export input after own label selection',ready:s=>s.prepared_node_context?.surface==='graph'&&s.prepared_node_context.locked===false&&s.wizard?.status==='absent'});
      need(['document_id','workflow_id','node_id','tid'].every(k=>selected.prepared_node_context[k]===fresh.prepared_node_context[k])
       &&['container_ref','container_tid','native_prefix'].every(k=>selected.graph_identity?.[k]===owner[k]),'Export input graph changed during label selection');
     }
    }
    await channel.openInputPort(0);
    const s=await channel.observe({condition:'complete native export input mapping',readMappings:true,ready:s=>s.wizard?.stage==='input_mapping'&&s.node_mapping?.verified===true});
    inputMapping=s.node_mapping;
    need(inputMapping.target_fields.length>0&&inputMapping.target_fields.length<=1000&&inputMapping.target_fields.every(f=>f.source&&!f.excluded),'Export input has missing fields');
    const definition=await readOutputDefinitionPages(channel,{expectedCount:inputMapping.target_fields.length});
    need(definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===inputMapping.target_fields[i][k])),'Export input definition differs');
    const completed=await finish('done',ctx,true,definition);
    return verified({effect_possible:true,source_identity_verified:true,native_mapping:inputMapping,definition,finish:completed});
   },
   async openWizard(ctx){enter(ctx);if(operation.nodeApply.request.finish==='execute'){driver=createNodeExecutionProcedure(channel,ctx.node);await driver.prepare();}
    const s=await channel.observe({condition:'export graph ready',ready:s=>s.prepared_node_context?.surface==='graph'});await selectPreparedGraphNode(channel,s,'select export node');await openPreparedWizard(channel);
    const opened=await channel.observe({condition:'export configuration opened',ready:s=>s.wizard?.stage==='text_export_params'||s.wizard?.stage==='input_mapping'});
    if(opened.wizard.stage==='input_mapping')await channel.perform({condition:'export inline input complete',initialObservation:opened,ready:s=>s.wizard?.stage==='input_mapping',identity:()=>ctx.node,
     resolve:s=>({verb:'wizard_step',ref:one(s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'))).ref,expected_stage:'text_export_params'})});
    return verified({effect_possible:true});
   },
   async configureExport(ctx,p){enter(ctx);const r=await configureTextExport(channel,p,{...ctx,finish:operation.nodeApply.request.finish},{...options,targetOrigin,storageDirectories,close:closePreparedWizard});configuration=r.configuration;return r;},
   finish,
   async waitExecution(ctx){enter(ctx);need(driver,'Export execution baseline missing');
    try{execution=await driver.waitCompleted({signal:ctx.signal,stopSignal:ctx.stopSignal});}
    catch(error){
     if(!ctx.stopSignal?.aborted||error!==ctx.stopSignal.reason||operation.transportUncertain)throw error;
     const saved=await onRecord({phase:'node_server_stop_requested',operation_id:operation.id,execution:structuredClone(ctx.execution),node:structuredClone(ctx.node)});
     need(saved?.phase==='node_server_stop_requested'&&saved.operation_id===operation.id&&saved.execution?.execution_id===ctx.execution.execution_id,'Export stop request not acknowledged');
     return driver.stop();
    }
    return execution;
   },
   async readOutput(read,ctx){enter(ctx);need(!read.ports.length&&execution?.verified&&execution.owner_verified&&execution.execution_id===ctx.execution.execution_id,'Export execution ownership missing');
    const output=await readNativeExportFile({...options,artifactStore,targetOrigin,targetBuild,storageDirectories,storageContinuation,
     rememberStorageContinuation:value=>{storageContinuation=structuredClone(value);}},ctx,configuration,execution);
    return verified({effect_possible:true,status:'complete',ports:[],execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,file_artifacts:[output]});},
   releasePendingPhases:['input_mapping','open','configure','output_mapping','finish','execute'],
   async releasePending(state,{signal:releaseSignal}={}){
    need(['input_mapping','open','configure','output_mapping','finish','execute'].includes(state.pending?.phase),
     'Only a stopped text export phase before file reading can be released here');
    releaseSignal?.throwIfAborted();
    enter({signal:releaseSignal,deadline:now()+NODE_RELEASE_BUDGET_MS,document_id:state.request.document_id,
     workflow_ref:state.request.workflow_ref,node:state.node});
    return releasePendingNode({operation,channel,readReceipt:options.readReceipt});
   },
   // Browser recovery T4: after the model cleared what blocked the download, the
   // runtime repeats only the idempotent file read of the same completed export.
   async recoveryReadExport(state,{signal:recoverySignal}={}){
    need(state.export_download_refusal===true&&state.node&&configuration&&execution?.verified&&execution.owner_verified
     &&state.execution?.execution_id===execution.execution_id,'Export recovery requires the original configured and executed export');
    const ctx={signal:recoverySignal,deadline:now()+120000,document_id:state.request.document_id,workflow_ref:state.request.workflow_ref,
     node:state.node,execution:{execution_id:execution.execution_id}};
    enter(ctx);
    // Fresh child receipt IDs: the refused read's ledger entries are never reused.
    return readNativeExportFile({...options,operation:{id:operation.id+':br-read-'+(++recoveryReads)},artifactStore,targetOrigin,
     targetBuild,storageDirectories,storageContinuation,rememberStorageContinuation:value=>{storageContinuation=structuredClone(value);}},
     ctx,configuration,execution);
   },
   async verifyContinuation(state,{signal:resumeSignal}={}){
    if(!channel||!configuration||state.pending||state.cleanup_complete!==true||state.phases.at(-1)?.phase!=='finish'||now()>=Math.min(state.deadline,state.execution_wait?.deadline??Infinity))return false;
    signal=resumeSignal;signal?.throwIfAborted();operation.deadline=Math.min(state.deadline,now()+15000);
    const surface=await channel.observe({condition:'export execution checkpoint retained',readProcesses:true,ready:s=>s.prepared_node_context?.surface==='graph'&&s.node_processes?.verified===true});
    const confirmed=verifyExportContinuation({node:state.node,finish:state.phases.at(-1).value,surface,checkpoint:state.execution_wait});
    const saved=await onRecord({operation_id:operation.id,phase:'node_continuation_checked',boundary:'export_execute_wait',verified:confirmed,surface:exportContinuationSurface(surface)});
    return saved?.phase==='node_continuation_checked'&&saved.operation_id===operation.id&&saved.verified===confirmed&&confirmed;
   },
  };
 }};
}
