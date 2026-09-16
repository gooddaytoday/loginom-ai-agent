import {verifyUploadLineage} from './upload-lineage.mjs';
import {configureOutputFields,configureOutputAutosync,reorderOutputFields,resolveConfiguredOutputMapping} from './port-mapping-procedure.mjs';
import {resolveTextImportEncoding} from './text-import-encoding.mjs';
import {createNodeProcedure} from './node-procedure.mjs';
import {configureTextImportFields,configureTextImportPatch,validateTextImportFieldsRequest,validateTextImportPatch,isTextImportSourceReady} from './text-import-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {readOutputDefinitionPages,readImportDefinitionPages} from './import-definition-pages.mjs';
import {makeRetainedImportSourceCode,makeRetainedImportFormatCode,verifyConfiguredImportContinuation,verifyMappedImportContinuation,finishedImportSurface,verifyFinishedImportContinuation,verifyWaitingExecutionContinuation} from './node-import-continuation.mjs';
import {openNewOutputTable,configureTablePrecision,restoreTablePrecision,prepareTableRead,returnFromOutputTable} from './node-output-procedure.mjs';
import {readTableOutputPages} from './table-output-pages.mjs';
import {decodeTableOutput} from './table-output-values.mjs';
import {createNodeExecutionProcedure} from './node-execution-procedure.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {textImportConfigurationReadback} from './text-import-readback.mjs';
import {textImportStepBudget} from './text-import-limits.mjs';
import {textImportParametersSchema} from './node-api.mjs';

const requireValue=(v,m)=>{if(!v)throw new Error(m);};
const one=(xs,m)=>{requireValue(xs.length===1,m);return xs[0];};
const verified=(details={})=>({verified:true,cleanup_complete:true,effect_possible:false,...details});

export function validateTextImportNodeParameters(p,mode,request) {
  requireValue(p && Object.keys(p).sort().join(',')==='settings,source','Exact import source and settings required');
  const existing=request.target?.kind==='existing';
  (existing?validateTextImportPatch:validateTextImportFieldsRequest)(p.settings);
  if(!existing)resolveTextImportEncoding(p.settings.source.encoding);
  const s=p.source;
  requireValue(s && Object.keys(s).every(k=>['artifact_id','upload_operation_id','bytes','sha256'].includes(k))
    && ['artifact_id','upload_operation_id'].every(k=>typeof s[k]==='string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(s[k]))
    && (s.bytes===undefined || Number.isSafeInteger(s.bytes) && s.bytes>=0 && s.bytes<=16*1024*1024)
    && (s.sha256===undefined || typeof s.sha256==='string' && /^[a-f0-9]{64}$/.test(s.sha256)),'Verified source identity required');
  // Explicit admission boundary for the private Done increment. Both definition
  // readers require complete native schemas, including every offscreen field.
  requireValue(mode==='delimited' && ['done','execute','close'].includes(request.finish) && (request.read.ports.length===0||request.finish==='execute'&&request.read.ports.length===1&&request.read.ports[0]===0)
    && request.mappings.length<=1 && request.mappings.every(m=>m.direction==='output'&&m.port===0
      &&(m.fields===undefined||m.fields.length>0&&m.fields.every(f=>f.source?.kind==='configured_field'&&f.excluded!==true))) && request.inputs.length===0
    && (existing||p.settings.columns.some(c=>c.used===true)),
  'Private import node currently supports Done/Execute/Close with optional executed output 0 and configured output fields with at least one used field; input mappings and output exclusion are not installed');
}

export function verifyTextImportSource(parameters,uploads,uploadHistory) {
  try {
  const s=parameters.source;
  const u=one(uploads.filter(u=>u.operation_id===s.upload_operation_id),'Verified upload operation is missing or ambiguous');
  const o=u.outcome,proof=o?.output?.server_copy_verification;
  // Resolve integrity metadata from admitted local state, never from model text.
  const bytes=u.artifact?.bytes,sha256=u.artifact?.sha256;
  requireValue(Number.isSafeInteger(bytes) && bytes>=0 && bytes<=16*1024*1024
    && typeof sha256==='string' && /^[a-f0-9]{64}$/.test(sha256), 'Verified artifact metadata is invalid');
  requireValue(o?.status==='SUCCEEDED' && o.cleanup_complete===true && o.operation_id===s.upload_operation_id
    && o.action_key==='artifact.upload' && o.output?.artifact_id===s.artifact_id
    && u.artifact?.artifact_id===s.artifact_id && proof?.status==='SUCCEEDED'
    && proof.bytes_verified===true && proof.upload_completion_verified===true
    && typeof proof.verification_id==='string' && proof.verification_id.length>0
    && proof.destination===(parameters.settings.source?.source_path??proof.destination)
    && o.output.destination===proof.destination
    && [o.output,proof].every(a=>a.bytes===bytes && a.sha256===sha256)
    && (s.bytes===undefined || s.bytes===bytes) && (s.sha256===undefined || s.sha256===sha256),
  'Upload bytes, digest, artifact or exact destination do not match the source');
  validateTextImportPatch({source:{source_path:proof.destination}});
  const source={...s,bytes,sha256,destination:proof.destination,verification_id:proof.verification_id};
  if(uploadHistory)source.lineage=verifyUploadLineage(source,uploadHistory);
  return verified({source});
  } catch(error) {
    // This preflight reads only the host's completed upload receipts. No browser
    // call or source upload can have occurred, even when the supplied ID is wrong.
    error.nodePhaseRefusal={phase:'source',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};
    throw error;
  }
}

export function bindIdentityOutputColumns(configured,actual) {
  const expected=configured.filter(c=>c.used);
  requireValue(actual.fields.length===expected.length&&actual.total_columns===expected.length
    &&new Set(actual.fields.map(c=>c.name)).size===expected.length
    &&actual.fields.every((c,i)=>{const source=expected.find(f=>f.name===c.name);return source&&c.status==='observed'&&c.index===i
      &&['name','label','type','data_kind'].every(k=>c[k]===source[k])
      &&c.source?.status==='rendered_source'&&c.source.label===source.label&&c.source.type===source.type;}),
    'Output identity mapping differs from configured fields');
  return actual.fields.map(c=>expected.find(f=>f.name===c.name));
}

export function bindConfiguredOutputColumns(configured,actual,native) {
  resolveConfiguredOutputMapping({direction:'output',port:0},configured,native);
  const expected=native.target_fields,sources=native.source_fields;
  requireValue(expected.length===sources.length&&new Set(expected.map(f=>f.source?.record_id)).size===sources.length
    &&expected.every(f=>sources.some(s=>JSON.stringify(s)===JSON.stringify(f.source)))
    &&actual.total_columns===expected.length&&actual.fields.length===expected.length
    &&actual.fields.every((f,i)=>f.status==='observed'&&f.index===i&&expected[i].index===i
      &&['name','label','type','data_kind'].every(k=>f[k]===expected[i][k])
      &&f.source?.status==='rendered_source'&&f.source.label===expected[i].source.label&&f.source.type===expected[i].source.type),
    'Rendered output differs from the native configured mapping');
  return expected.map(f=>({name:f.name,label:f.label,type:f.type,data_kind:f.data_kind,used:true}));
}

// Host-owned support object. It is deliberately not registered in the public
// catalog until execution, wide mapping and independent acceptance are complete.
export function createTextImportNodeSupport({targetOrigin,targetBuild}) {
  const nodeApplyHandlers=new Map([['imports.text',{revision:'text-import-output-v2',modes:['delimited'],
    parameter_schema:textImportParametersSchema,
    configurationReadback:textImportConfigurationReadback,
    validate:validateTextImportNodeParameters,
    configure:(ctx,p,drivers)=>drivers.configureTextImport(ctx,p)}]]);
  const nodeApplyDriverFactory=({operation,execute,onRecord,now,receiptOptions,verifiedUploads,uploadHistory})=>{
    let channel,configured,outputColumns,owner,executionDriver,executionReceipt,sourceReceipt,activeSignal;
    const continuationSignal={throwIfAborted:()=>activeSignal?.throwIfAborted(),get aborted(){return activeSignal?.aborted;},get reason(){return activeSignal?.reason;}};
    const enter=ctx=>{
      activeSignal=ctx.signal;
      operation.deadline=ctx.deadline;
      channel??=createNodeProcedure({operation,execute,record:onRecord,now,signal:continuationSignal,maxSteps:textImportStepBudget(operation.nodeApply.request),targetOrigin,targetBuild,
        preparedNodeContext:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node},
        wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{
          ...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
      return channel;
    };
    const read=(stage,condition,ready=()=>true)=>channel.observe({condition,ready:s=>s.wizard?.status==='observed'
      && s.wizard.stage===stage && s.prepared_node_context?.surface==='wizard' && ready(s)});
    const next=async(from,to)=>{
      const s=await read(from,'import '+from+' Next available',s=>s.ui.elements.some(e=>
        e.tid===s.wizard.root_tid+';btnNext' && e.allowed_actions.includes('wizard_step')));
      await channel.perform({condition:'bound import '+from+' to '+to,initialObservation:s,
        ready:s=>s.wizard?.stage===from && s.ui.elements.some(e=>e.tid===s.wizard.root_tid+';btnNext' && e.allowed_actions.includes('wizard_step')),
        resolve:s=>({verb:'wizard_step',ref:one(s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'),'Unique Next required').ref,expected_stage:to}),
        identity:s=>({node:s.prepared_node_context,from,to})});
      return read(to,'import '+to+' ready');
    };
    return {
      verifySource:async p=>(sourceReceipt=verifyTextImportSource(p,verifiedUploads(),uploadHistory?.())),
      async openWizard(ctx) {
        enter(ctx);
        if(operation.nodeApply.request.finish==='execute') {
          executionDriver=createNodeExecutionProcedure(channel,{document_id:ctx.document_id,workflow_id:ctx.workflow_ref.workflow_id,node_id:ctx.node.node_id});
          await executionDriver.prepare();
        }
        let s=await channel.observe({condition:'prepared import graph ready',ready:s=>s.prepared_node_context?.surface==='graph' && s.wizard?.status==='absent'});
        await channel.perform({condition:'bound import graph body available',initialObservation:s,
          ready:s=>s.prepared_node_context?.surface==='graph' && s.ui.elements.some(e=>e.tid===s.prepared_node_context.tid && e.graph_node?.part==='body' && e.allowed_actions.includes('click')),
          resolve:s=>({verb:'click',ref:one(s.ui.elements.filter(e=>e.tid===s.prepared_node_context.tid && e.graph_node?.part==='body'),'Prepared graph body unavailable').ref}),
          identity:s=>s.prepared_node_context});
        if(operation.nodeApply.request.target.kind==='existing')await openPreparedWizard(channel);
        else {
          s=await channel.observe({condition:'prepared import settings available',ready:s=>s.prepared_node_context?.surface==='graph'
            &&s.ui.elements.some(e=>e.tid===s.prepared_node_context.tid+';Setting'&&e.allowed_actions.includes('open_wizard'))});
          await channel.perform({condition:'bound import settings available',initialObservation:s,
            ready:s=>s.prepared_node_context?.surface==='graph'&&s.ui.elements.some(e=>e.tid===s.prepared_node_context.tid+';Setting'&&e.allowed_actions.includes('open_wizard')),
            resolve:s=>({verb:'open_wizard',ref:one(s.ui.elements.filter(e=>e.tid===s.prepared_node_context.tid+';Setting'),'Prepared settings control unavailable').ref}),
            identity:s=>s.prepared_node_context});
        }
        s=await read('text_import_file','prepared import source wizard initialized',isTextImportSourceReady);owner=s.wizard.owner_context;
        requireValue(owner?.status==='observed','Import owner unavailable');
        return verified({effect_possible:true,node_context:s.prepared_node_context});
      },
      async configureTextImport(ctx,p) {
        enter(ctx);requireValue(owner,'Import was not opened by this operation');
        configured=operation.nodeApply.request.target.kind==='existing'
          ?await configureTextImportPatch(channel,p.settings,owner,sourceReceipt.source.destination)
          :await configureTextImportFields(channel,p.settings,owner);
        requireValue(configured.columns.some(c=>c.used),'Import output requires at least one used field');
        return configured;
      },
      async mapPorts(mappings,ctx) {
        if(ctx.receipt_id===operation.id+':input_mapping'){requireValue(mappings.length===0,'Import input mappings are not installed');return verified({mappings:[],not_applicable:true});}
        enter(ctx);requireValue(configured,'Configured import schema unavailable');
        await next('text_import_format','output_mapping');
        const outputFields=configured.columns.filter(c=>c.used);
        const nativeReady=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true;
        let native=(await channel.observe({condition:'configured import native output mapping',readMappings:true,ready:nativeReady})).node_mapping;
        const changes=[];
        if(mappings.length) {
          const mapping=one(mappings,'One import output mapping required');
          const resolved=resolveConfiguredOutputMapping(mapping,configured.columns,native);
          changes.push(await configureOutputFields(channel,mapping,configured.columns));
          if(resolved.fields)changes.push(await reorderOutputFields(channel,resolved.fields.map(f=>f.current.record_id)));
          if(mapping.autosync!==undefined)changes.push(await configureOutputAutosync(channel,mapping.autosync));
          native=(await channel.observe({condition:'requested import native output mapping',readMappings:true,ready:nativeReady})).node_mapping;
          requireValue(native.autosync===resolved.autosync,'Requested output autosync not preserved');
          if(resolved.fields)requireValue(native.target_fields.length===resolved.fields.length&&native.target_fields.every((f,i)=>
            f.record_id===resolved.fields[i].current.record_id&&f.name===resolved.fields[i].name&&f.label===resolved.fields[i].label),
            'Requested output layout not preserved');
        }
        const actual=await readOutputDefinitionPages(channel,{expectedCount:outputFields.length});
        const finalNative=(await channel.observe({condition:'native mapping preserved after paged output inspection',readMappings:true,ready:nativeReady})).node_mapping;
        const semantic=m=>Object.fromEntries(Object.entries(m).filter(([key])=>key!=='rendered_indices'));
        requireValue(JSON.stringify(semantic(finalNative))===JSON.stringify(semantic(native)),
          'Native output mapping changed during paged inspection');
        native=finalNative;
        // Existing output aliases/order remain valid when no mapping is asked.
        // The source association is proved by native records, never label alone.
        outputColumns=bindConfiguredOutputColumns(configured.columns,actual,native);
        const done=await next('output_mapping','done');
        return verified({effect_possible:true,mapping:actual,native_mapping:native,completion:done.wizard.completion,changes,source_identity_verified:true});
      },
      async finish(mode,ctx) {
        requireValue(['done','execute','close'].includes(mode),'Unsupported finish mode');enter(ctx);
        if(mode==='close')return closePreparedWizard(channel);
        const executeRequested=mode==='execute',verb=executeRequested?'execute_wizard':'finish_wizard',button=executeRequested?'btnExecute':'btnDone';
        requireValue(!executeRequested||executionDriver,'Execution baseline was not prepared');
        const s=await read('done',mode+' available for the prepared node',s=>s.ui.elements.some(e=>e.tid===s.wizard.root_tid+';'+button && e.allowed_actions.includes(verb)));
        await channel.perform({condition:'bound import '+mode+' available',initialObservation:s,
          ready:s=>s.wizard?.stage==='done' && s.ui.elements.some(e=>e.tid===s.wizard.root_tid+';'+button && e.allowed_actions.includes(verb)),
          resolve:s=>({verb,ref:one(s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';'+button),'Unique wizard completion control required').ref}),
          identity:s=>s.prepared_node_context});
        const graph=await channel.observe({condition:'same configured node returned to graph',ready:s=>s.wizard?.status==='absent' && s.prepared_node_context?.surface==='graph'});
        const execution=executeRequested?await executionDriver.identify():null;
        const continuationSurface=executeRequested?finishedImportSurface(await channel.observe({
          condition:'identified execution and graph continuity checkpoint',readProcesses:true,readOutputs:true,
          ready:s=>s.prepared_node_context?.surface==='graph'&&s.node_processes?.verified===true&&s.node_outputs?.verified===true})):null;
        return verified({effect_possible:true,mode,execution_started:executeRequested,settings_applied:true,
          ...(execution?{execution_id:execution.execution_id,execution_group:execution,continuation_surface:continuationSurface}:{}),
          node_context:graph.prepared_node_context,package_saved:false,reopen_performed:false});
      },
      async waitExecution(ctx) {
        enter(ctx);requireValue(executionDriver,'Execution driver is unavailable');
        try { executionReceipt=await executionDriver.waitCompleted({signal:ctx.signal,stopSignal:ctx.stopSignal}); }
        catch(error) {
          // The readiness callback interrupts only after its browser read has
          // completed. The normal signal and operation gate remain in force.
          if(!ctx.stopSignal?.aborted||error!==ctx.stopSignal.reason||operation.transportUncertain)throw error;
          const requested=await onRecord({phase:'node_server_stop_requested',operation_id:operation.id,
            execution:structuredClone(ctx.execution),node:structuredClone(ctx.node)});
          requireValue(requested?.phase==='node_server_stop_requested'&&requested.operation_id===operation.id
            &&requested.execution?.execution_id===ctx.execution.execution_id,'Server stop request was not durably acknowledged');
          return executionDriver.stop();
        }
        return executionReceipt;
      },
      async readOutput(read,ctx) {
        enter(ctx);requireValue(executionReceipt?.verified===true&&executionReceipt.owner_verified===true,'Completed execution proof is missing');
        requireValue(executionReceipt.execution_id===ctx.execution.execution_id,'Execution identity changed');
        if(read.ports.length===0)return verified({status:'complete',ports:[],no_output_requested:true,execution_id:executionReceipt.execution_id,evidence_ref:ctx.receipt_id});
        requireValue(read.ports.length===1&&read.ports[0]===0,'Text import has one data output');
        requireValue(Array.isArray(outputColumns)&&outputColumns.length>0,'Verified output mapping is unavailable');
        const opened=await openNewOutputTable(channel,0);
        const formatProof=read.require_exact_numbers?await configureTablePrecision(channel,opened.table):null;
        let readSettings,data,formatRestoration;
        try {
          readSettings=await prepareTableRead(channel,opened.table);
          const raw=await readTableOutputPages(channel,opened.table,{sampleRows:read.sample_rows});
          data=decodeTableOutput(raw,{formatProof,readSettings,expectedColumns:outputColumns,requireExactNumbers:read.require_exact_numbers});
        } finally { if(formatProof)formatRestoration=await restoreTablePrecision(channel,formatProof); }
        const workflowReturn=await returnFromOutputTable(channel,opened.table);
        return verified({effect_possible:true,status:data.sample_complete?'complete':'partial',execution_id:executionReceipt.execution_id,evidence_ref:ctx.receipt_id,
          ports:[{port:0,port_guid:opened.port_guid,fresh:true,freshness_basis:'new_bound_table_after_verified_node_execution',execution_id:executionReceipt.execution_id,...data}],
          table_creation:opened,format_proof:formatProof,format_restoration:formatRestoration,read_settings:readSettings,workflow_return:workflowReturn});
      },
      async verifyContinuation(state,{signal}={}) {
        if(!channel||!configured||state.pending||state.cleanup_complete!==true
          ||!['configure','output_mapping','finish'].includes(state.phases.at(-1)?.phase)||now()>=Math.min(state.deadline,state.execution_wait?.deadline??Infinity))return false;
        activeSignal=signal;signal?.throwIfAborted();
        operation.deadline=Math.min(state.deadline,now()+15000);
        if(state.phases.at(-1).phase==='finish') {
          const surface=await channel.observe({condition:'finished import retains its original execution checkpoint',readProcesses:true,readOutputs:true,
            ready:s=>s.prepared_node_context?.surface==='graph'&&s.node_processes?.verified===true&&s.node_outputs?.verified===true});
          const confirmed=(state.execution_wait?verifyWaitingExecutionContinuation:verifyFinishedImportContinuation)({node:state.node,finish:state.phases.at(-1).value,surface,checkpoint:state.execution_wait});
          await onRecord({operation_id:operation.id,action_key:'node.apply',action_revision:state.request.contract_revision,
            phase:'node_continuation_checked',boundary:state.execution_wait?'execute_wait':'finish',verified:confirmed,surface:finishedImportSurface(surface)});
          return confirmed;
        }
        const binding={document_id:state.request.document_id,workflow_ref:state.request.workflow_ref,node:state.node};
        const source=await execute(makeRetainedImportSourceCode(binding));
        if(state.phases.at(-1).phase==='output_mapping') {
          const retained=await execute(makeRetainedImportFormatCode(binding));
          const surface=await channel.observe({condition:'paused mapped import remains on Done',readMappings:true,
            ready:s=>s.wizard?.stage==='done'&&s.prepared_node_context?.surface==='wizard'&&s.node_mapping?.verified===true});
          const mapped=state.phases.at(-1).value;
          const confirmed=verifyMappedImportContinuation({node:state.node,configured,source,retained,surface,mapped});
          await onRecord({operation_id:operation.id,action_key:'node.apply',action_revision:state.request.contract_revision,
            phase:'node_continuation_checked',boundary:'output_mapping',verified:confirmed,source,retained,surface});
          return confirmed;
        }
        const format=await channel.observe({condition:'paused import format still belongs to the accepted node',
          ready:s=>s.wizard?.stage==='text_import_format'&&!s.wizard.column_parameters&&s.prepared_node_context?.surface==='wizard'});
        const schema=await readImportDefinitionPages(channel,{expectedCount:configured.columns.length});
        const confirmed=verifyConfiguredImportContinuation({node:state.node,configured,source,format,schema});
        await onRecord({operation_id:operation.id,action_key:'node.apply',action_revision:state.request.contract_revision,
          phase:'node_continuation_checked',boundary:'configure',verified:confirmed,source,format,schema});
        return confirmed;
      },
    };
  };
  return {nodeApplyHandlers,nodeApplyDriverFactory};
}
