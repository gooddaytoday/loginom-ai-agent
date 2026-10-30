import {verifyUploadLineage,verifiedLocalDelivery} from './upload-lineage.mjs';
import {validateImportSource} from './storage-policy.mjs';
import {configureOutputFields,configureOutputAutosync,reorderOutputFields,resolveConfiguredOutputMapping} from './port-mapping-procedure.mjs';
import {resolveTextImportEncoding} from './text-import-encoding.mjs';
import {createNodeProcedure,NodeReadinessTimeout,NodeProcedureStepError} from './node-procedure.mjs';
import {configureTextImportFields,configureTextImportPatch,validateTextImportFieldsRequest,validateTextImportPatch,isTextImportSourceReady,ImportColumnBindingError,ImportInitialSettingsError} from './text-import-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {readOutputDefinitionPages,readImportDefinitionPages} from './import-definition-pages.mjs';
import {makeRetainedImportSourceCode,makeRetainedImportFormatCode,verifyConfiguredImportContinuation,verifyMappedImportContinuation,finishedImportSurface,verifyFinishedImportContinuation,verifyWaitingExecutionContinuation} from './node-import-continuation.mjs';
import {alignReadSchema} from './node-read-contract.mjs';
import {createNodeExecutionProcedure} from './node-execution-procedure.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {selectPreparedGraphNode} from './node-graph-selection.mjs';
import {textImportConfigurationReadback} from './text-import-readback.mjs';
import {textImportStepBudget} from './text-import-limits.mjs';
import {textImportParametersSchema} from './node-api.mjs';
import {releasePendingNode,NODE_RELEASE_BUDGET_MS} from './node-pending-release.mjs';
import {isUnchangedTextImportExecution} from './node-read-contract.mjs';

const requireValue=(v,m)=>{if(!v)throw new Error(m);};
const one=(xs,m)=>{requireValue(xs.length===1,m);return xs[0];};
const verified=(details={})=>({verified:true,cleanup_complete:true,effect_possible:false,...details});

export function serverPreviewProfile({source,format,columns,preview}) {
  const values=group=>Object.fromEntries(Object.entries(group.fields).filter(([,f])=>f.status==='observed'&&!f.truncated)
    .map(([name,f])=>[name,f.value]));
  const settings=values(source),dialect=values(format);
  const profile={format:'csv',coverage:'preview',status:'partial',encoding:{name:settings.encoding,basis:'wizard_display'},
    dialect,columns:columns.slice(0,8).map(c=>({index:c.index,name:c.name,label:c.label,type:c.type,data_kind:c.data_kind,used:c.used})),
    column_count:columns.length,columns_omitted:Math.max(0,columns.length-8),
    preview:{...preview,rows:preview.rows.slice(0,25).map(row=>row.slice(0,8))},
    limitations:['wizard_preview_only','rendered_display_values','no_full_count','no_sha256','rare_types_not_validated']};
  // Leave room for the compact control receipt and both MCP JSON copies.
  while(Buffer.byteLength(JSON.stringify(profile),'utf8')>2200){
    if(profile.preview.rows.length){profile.preview.rows.pop();continue;}
    if(profile.columns.length){profile.columns.pop();profile.columns_omitted++;continue;}
    throw Error('Server preview metadata exceeds the profile budget');
  }
  profile.preview.observed_records=profile.preview.rows.length;
  profile.preview.complete=false;
  return profile;
}

export function validateTextImportNodeParameters(p,mode,request) {
  if(p?.preview_only===true){
    requireValue(mode==='delimited'&&p.source?.kind==='storage'&&request.finish==='close'
      &&request.inputs?.length===0&&request.mappings?.length===0&&request.read?.ports?.length===0
      &&Object.keys(p).sort().join(',')==='preview_only,settings,source'
      &&Object.keys(p.settings??{}).join(',')==='source'&&Object.hasOwn(p.settings.source??{},'source_path')
      &&Object.keys(p.settings.source).every(k=>['source_path','encoding'].includes(k)),
      'Server preview requires storage source, source_path only and Close without execution or mappings');
    validateImportSource(p.source);validateTextImportPatch(p.settings);
    if(p.settings.source.encoding!==undefined)resolveTextImportEncoding(p.settings.source.encoding);return;
  }
  if(isUnchangedTextImportExecution({...request,parameters:p,mode}))return;
  requireValue(p && Object.keys(p).filter(k=>k!=='source_switch').sort().join(',')==='settings,source','Exact import source and settings required');
  const existing=request.target?.kind==='existing';
  if(!existing)requireValue(Array.isArray(p.settings?.columns)&&p.settings.columns.length>0,
    'Invalid parameters.parameters.settings.columns: new imports require a nonempty list of source columns with their selected names and types');
  (existing?validateTextImportPatch:validateTextImportFieldsRequest)(p.settings);
  if(!existing)resolveTextImportEncoding(p.settings.source.encoding);
  validateImportSource(p.source);
  if(Object.hasOwn(p,'source_switch'))requireValue(p.source_switch&&existing&&(request.finish==='done'&&request.read.ports.length===0
    ||request.finish==='execute'&&request.read.ports.length===1&&request.read.ports[0]===0)
    &&request.mappings.length===0&&Object.keys(p.settings).join(',')==='source'
    &&Object.keys(p.settings.source??{}).join(',')==='source_path'
    &&Object.keys(p.source_switch).sort().join(',')==='profile_id,save_operation_id'
    &&['profile_id','save_operation_id'].every(k=>typeof p.source_switch[k]==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(p.source_switch[k])),
    'Full source switch requires existing import, source_path only, profile_id, saved package receipt and Done without a port read (or Execute with output 0); no column or mapping edits');
  // Explicit admission boundary for the private Done increment. Both definition
  // readers require complete native schemas, including every offscreen field.
  requireValue(mode==='delimited' && ['done','execute','close'].includes(request.finish) && (request.read.ports.length===0||request.finish==='execute'&&request.read.ports.length===1&&request.read.ports[0]===0)
    && request.mappings.length<=1 && request.mappings.every(m=>m.direction==='output'&&m.port===0
      &&((m.fields??m.changes)===undefined||m.fields===undefined&&m.changes?.length===0||(m.fields??m.changes).length>0&&(m.fields??m.changes).every(f=>f.source?.kind==='configured_field'&&f.excluded!==true))) && request.inputs.length===0
    && (existing||p.settings.columns.some(c=>c.used===true)),
  'Private import node currently supports Done/Execute/Close with optional executed output 0 and configured output fields with at least one used field; input mappings and output exclusion are not installed');
}

export function verifyTextImportSource(parameters,uploads,uploadHistory,storageProof) {
  try {
  const s=parameters.source;
  validateImportSource(s);
  if(s.kind==='storage') {
    requireValue(storageProof?.verified===true&&storageProof.kind==='storage'&&storageProof.server_source_ref===s.server_source_ref,
      'Verified storage source reference is missing');
    requireValue(parameters.settings.source?.source_path===storageProof.destination,'Storage source exact destination differs');
    validateTextImportPatch({source:{source_path:storageProof.destination}});
    return verified({source:structuredClone(storageProof)});
  }
  const u=one(uploads.filter(u=>u.operation_id===s.upload_operation_id),'Verified upload operation is missing or ambiguous');
  const proof=verifiedLocalDelivery(u.artifact,u.outcome);
  requireValue(u.outcome.operation_id===s.upload_operation_id&&u.artifact.artifact_id===s.artifact_id
    &&proof.destination===(parameters.settings.source?.source_path??proof.destination)
    &&(s.bytes===undefined||s.bytes===proof.bytes)&&(s.sha256===undefined||s.sha256===proof.sha256),
    'Upload bytes, digest, artifact or exact destination do not match the source');
  validateTextImportPatch({source:{source_path:proof.destination}});
  const source={...s,...proof};
  if(uploadHistory)source.lineage=verifyUploadLineage(source,uploadHistory);
  return verified({source});
  } catch(error) {
    // This preflight reads only the host's completed upload receipts. No browser
    // call or source upload can have occurred, even when the supplied ID is wrong.
    error.nodePhaseRefusal={phase:'source',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};
    throw error;
  }
}

export function verifyImportRowCount(expected,output,execution) {
  requireValue(Number.isSafeInteger(expected)&&expected>=0&&execution?.verified===true&&execution.owner_verified===true
    &&execution.status==='completed'&&output?.port===0&&output.fresh===true
    &&output.execution_id===execution.execution_id&&output.freshness_basis==='completed_execution_port_source'
    &&Number.isSafeInteger(output.row_count)&&output.row_count>=0,
    'LOGINOM_ROW_COUNT_UNAVAILABLE: completed import output port metadata is required; grid/buffer/group counts cannot establish full N');
  requireValue(output.row_count===expected,'LOGINOM_ROW_COUNT_MISMATCH: expected '+expected+', actual '+output.row_count);
  return {expected_records:expected,actual_records:output.row_count,execution_id:execution.execution_id,
    count_source:'completed_execution_port_source'};
}

export function verifyFullImportCount(profileId,receipt,source,output,execution) {
  const reason=fullImportSourceReason(profileId,receipt,source);
  if(reason)return {status:'not_verified',message:'N не сверено',reason,profile_id:profileId,actual_records:output.row_count};
  return {status:'verified',...verifyImportRowCount(receipt.records,output,execution),profile_id:profileId,
    profile_identity_basis:'backend_exact_scan_sha256',source_identity:receipt.identity};
}

function fullImportSourceReason(profileId,receipt,source) {
  return !receipt ? 'Trusted exact scan receipt is absent'
    : receipt.basis!=='backend_exact_scan'||receipt.profile_id!==profileId ? 'Exact scan profile identity does not match'
    : source.kind==='storage'&&(!source.cache_binding||source.cache_binding.server_source_ref!==source.server_source_ref
      ||source.cache_binding.native_size!==source.bytes||source.cache_binding.copy_bytes!==receipt.bytes
      ||source.cache_binding.native_mtime!==source.mtime
      ||JSON.stringify(source.cache_binding.identity)!==JSON.stringify(receipt.identity))
      ? 'Storage preview has no trusted digest binding to the local exact scan'
    : !/^[a-f0-9]{64}$/.test(receipt.sha256??'')||source.sha256!==receipt.sha256||source.bytes!==receipt.bytes
      ? 'Exact scan source digest or byte identity does not match verified delivery'
    : !receipt.identity?.canonical_path||receipt.identity.size!==receipt.bytes||!receipt.identity.file_id
      ||!Number.isSafeInteger(receipt.records)||receipt.records<0 ? 'Exact scan receipt is incomplete' : null;
}

// Reuse the source/scan witnesses retained by the normal operation journal.
// A configured Done is not authority to consume yesterday's source or output.
export async function verifyDeferredTextImportSources(request,history,resolveStorageSource) {
  if(request.finish!=='execute')return [];
  const latest=new Map();
  for(const entry of history??[])if(entry.request?.target?.type==='imports.text'
    &&entry.request.document_id===request.document_id&&entry.request.workflow_ref?.workflow_id===request.workflow_ref?.workflow_id
    &&entry.outcome?.status==='SUCCEEDED'&&entry.cleanup_confirmed===true&&entry.outcome.output?.node?.node_id
    &&entry.source)latest.set(entry.outcome.output.node.node_id,entry);
  const checked=[];
  for(const entry of latest.values()){
    if(entry.request.finish!=='done'||!entry.request.parameters?.source_switch)continue;
    try{
      const before=entry.source,native=before.native_source??before;
      requireValue(typeof resolveStorageSource==='function'&&native.server_source_ref,'LOGINOM_FILE_CHANGED: native source witness is missing');
      const current=await resolveStorageSource(native.server_source_ref,entry.scan_receipt);
      requireValue(['destination','bytes','mtime','server_source_ref'].every(k=>current[k]===native[k])
        &&(before.kind!=='storage'||current.sha256===before.sha256)
        &&!fullImportSourceReason(entry.request.parameters.source_switch.profile_id,entry.scan_receipt,before.kind==='storage'?current:before),
        'LOGINOM_FILE_CHANGED: switched source identity, size or exact-scan digest changed; chain execution refused');
      checked.push({node:entry.outcome.output.node,source:current,profile_id:entry.request.parameters.source_switch.profile_id});
    }catch(error){
      error.nodePhaseRefusal={phase:'source',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;
    }
  }
  return checked;
}

export function importSchemaSnapshot({source,format,columns,mapping}) {
  const values=(group,skip=[])=>Object.fromEntries(Object.entries(group?.fields??{}).filter(([k])=>!skip.includes(k)).map(([k,v])=>{
    requireValue(v.status==='observed'&&v.truncated!==true,'LOGINOM_IMPORT_SCHEMA_CHANGED: incomplete parsing settings');return [k,v.value];
  }));
  requireValue(Array.isArray(columns)&&columns.length>0&&mapping?.verified===true&&mapping.inventory_complete===true
    &&mapping.source_identity_verified===true&&typeof mapping.autosync==='boolean'
    &&Array.isArray(mapping.source_fields)&&Array.isArray(mapping.target_fields),
    'LOGINOM_IMPORT_SCHEMA_CHANGED: complete definitions and output mapping are required');
  const field=f=>Object.fromEntries(['index','name','label','type','data_kind','used','excluded','inherited'].filter(k=>Object.hasOwn(f,k)).map(k=>[k,f[k]]));
  return {source:values(source,['source_path']),format:values(format),columns:columns.map(field),
    mapping:{autosync:mapping.autosync,source_fields:mapping.source_fields.map(field),
      target_fields:mapping.target_fields.map(f=>({...field(f),source:field(f.source??{})}))}};
}

export function verifyImportSchema(before,after) {
  requireValue(JSON.stringify(before)===JSON.stringify(after),
    'LOGINOM_IMPORT_SCHEMA_CHANGED: source switch changed definitions, parsing settings or output mapping; execution refused');
  return true;
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
  const nodeApplyDriverFactory=({operation,execute,onRecord,now,receiptOptions,readReceipt,verifiedUploads,uploadHistory,resolveStorageSource,resolveDeliveredSource,verifySourceSwitchSave,scanReceipt})=>{
    let channel,configured,outputColumns,owner,executionDriver,executionReceipt,sourceReceipt,activeSignal,schemaBefore,schemaAfter,saveReceipt;
    const sourceSwitch=(operation.nodeApply?.request??operation.parameters)?.parameters?.source_switch;
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
    const captureSwitchSchema=async()=>{
      const source=(await read('text_import_file','full source switch readback',isTextImportSourceReady)).wizard.import_source;
      const format=(await next('text_import_file','text_import_format')).wizard.settings;
      const columns=await readImportDefinitionPages(channel);
      await next('text_import_format','output_mapping');
      const mapping=(await channel.observe({condition:'source switch complete output mapping',readMappings:true,
        ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true})).node_mapping;
      return {source_path:source.fields.source_path.value,schema:importSchemaSnapshot({source,format,columns:columns.fields,mapping})};
    };
    const refuseSwitchSchema=async(error,phase)=>{
      if(sourceSwitch&&String(error.message).startsWith('LOGINOM_IMPORT_SCHEMA_CHANGED:')&&!operation.transportUncertain){
        const closed=await closePreparedWizard(channel);
        error.nodePhaseRefusal={phase,status:'FAILED',effect_possible:true,cleanup_complete:true,
          verification:'text_import_source_switch_schema_refused',execution_started:false,
          settings_unchanged:phase!=='finish',proof:{closed}};
      }
      throw error;
    };
    return {
      verifySource:async p=>{
        try{
        sourceReceipt=verifyTextImportSource(p,p.source.kind==='storage'?[]:verifiedUploads(),p.source.kind==='storage'?undefined:uploadHistory?.(),
          p.source.kind==='storage'?await resolveStorageSource?.(p.source.server_source_ref):undefined);
        if(sourceSwitch){
          if(p.source.kind==='storage'){
            requireValue(scanReceipt?.basis==='backend_exact_scan'&&scanReceipt.profile_id===sourceSwitch.profile_id,
              'LOGINOM_EXACT_SCAN_REQUIRED: full server source switch requires the downloaded copy exact scan; execution refused');
            const source=sourceReceipt.source,binding=source.cache_binding;
            requireValue(binding&&binding.server_source_ref===source.server_source_ref&&binding.native_size===source.bytes
              &&binding.native_mtime===source.mtime&&binding.copy_bytes===scanReceipt.bytes
              &&source.bytes===scanReceipt.bytes&&source.sha256===scanReceipt.sha256
              &&JSON.stringify(binding.identity)===JSON.stringify(scanReceipt.identity),
              'LOGINOM_FILE_CHANGED: server source no longer matches the unchanged downloaded cache (native size/mtime, copy size and exact scan); execution refused before source switch');
          }
          requireValue(typeof verifySourceSwitchSave==='function','Full source switch requires a verified package save');
          saveReceipt=verifySourceSwitchSave(sourceSwitch.save_operation_id);
          if((operation.nodeApply?.request??operation.parameters).finish==='done'){
            if(p.source.kind!=='storage'){
              requireValue(typeof resolveDeliveredSource==='function','LOGINOM_FILE_CHANGED: native delivery witness is missing');
              sourceReceipt.source.native_source=await resolveDeliveredSource(sourceReceipt.source.destination);
            }
            requireValue(!fullImportSourceReason(sourceSwitch.profile_id,scanReceipt,sourceReceipt.source),
              'LOGINOM_FILE_CHANGED: deferred source switch requires the exact scan bound to source bytes and SHA');
          }
        }
        return sourceReceipt;
        }catch(error){error.nodePhaseRefusal={phase:'source',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
      },
      async openWizard(ctx) {
        enter(ctx);
        if(operation.nodeApply.request.finish==='execute') {
          executionDriver=createNodeExecutionProcedure(channel,{document_id:ctx.document_id,workflow_id:ctx.workflow_ref.workflow_id,node_id:ctx.node.node_id});
          await executionDriver.prepare();
        }
        let s=await channel.observe({condition:'prepared import graph ready',ready:s=>s.prepared_node_context?.surface==='graph' && s.wizard?.status==='absent'});
        await selectPreparedGraphNode(channel,s,'bound import graph selection available',{settleGraph:true});
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
        if(sourceSwitch){
          schemaBefore=(await captureSwitchSchema()).schema;
          await closePreparedWizard(channel);
          await openPreparedWizard(channel);
          await read('text_import_file','saved sample import reopened',isTextImportSourceReady);
        }
        return verified({effect_possible:true,node_context:s.prepared_node_context});
      },
      async configureTextImport(ctx,p) {
        enter(ctx);requireValue(owner,'Import was not opened by this operation');
        try {
          if(p.preview_only){
            const source=await read('text_import_file','server preview source ready',isTextImportSourceReady);
            const field=source.wizard.import_source.fields.source_path;
            if(field.value!==sourceReceipt.source.destination){
              await channel.act({verb:'fill',ref:field.input_ref,text:sourceReceipt.source.destination});
              const fresh=await read('text_import_file','server preview source path entered');
              await channel.act({verb:'press',ref:fresh.wizard.import_source.fields.source_path.input_ref,key:'Tab'});
            }
            if(p.settings.source.encoding!==undefined){
              const encoding=resolveTextImportEncoding(p.settings.source.encoding),s=await read('text_import_file','server preview code page ready',isTextImportSourceReady);
              if(s.wizard.import_source.fields.encoding.value!==encoding.label){
                const owns=e=>e.wizard_combo?.field?.scope==='import_source'&&e.wizard_combo.field.name==='encoding'
                  &&e.wizard_combo.field.root_ref===s.wizard.root_ref
                  &&e.wizard_combo.field.owner_ref===s.wizard.import_source.fields.encoding.owner_ref;
                await channel.perform({condition:'server preview code page picker',initialObservation:s,refreshWizardBusy:true,
                  ready:s=>s.wizard?.stage==='text_import_file',identity:s=>s.wizard.owner_context,
                  resolve:s=>({verb:'click',ref:one(s.ui.elements.filter(e=>owns(e)&&e.wizard_combo.kind==='picker'),'Preview code page picker required').ref})});
                const options=await read('text_import_file','server preview code page option',s=>s.ui.elements.some(e=>owns(e)&&e.wizard_combo.kind==='option'&&e.wizard_combo.label===encoding.label));
                await channel.perform({condition:'server preview exact code page',initialObservation:options,
                  ready:s=>s.wizard?.stage==='text_import_file',identity:s=>s.wizard.owner_context,
                  resolve:s=>({verb:'select_wizard_option',ref:one(s.ui.elements.filter(e=>owns(e)&&e.wizard_combo.kind==='option'&&e.wizard_combo.label===encoding.label),'Preview code page option required').ref})});
                await read('text_import_file','server preview code page readback',s=>s.wizard.import_source.fields.encoding.value===encoding.label);
              }
            }
            const observedSource=(await read('text_import_file','server preview exact source selected',s=>
              isTextImportSourceReady(s)&&s.wizard.import_source.fields.source_path.value===sourceReceipt.source.destination)).wizard.import_source;
            await next('text_import_file','text_import_format');
            const definitions=await readImportDefinitionPages(channel);
            const format=(await read('text_import_format','server preview format readback')).wizard.settings;
            const preview=await execute(`async page=>page.evaluate(({rootTid})=>{
              const roots=[...document.querySelectorAll('[data-tid='+JSON.stringify(rootTid)+']')];
              if(roots.length!==1||!roots[0].isConnected)throw Error('Server preview wizard changed');
              const base=rootTid+';ImportTextFileParamsWizard;ColumnDefsTuning;';
              const grids=[...roots[0].querySelectorAll('[data-tid='+JSON.stringify(base+'grdData;grd-1;tbl')+']')];
              const limits=[...roots[0].querySelectorAll('[data-tid='+JSON.stringify(base+'seReadRowCount')+'] input')];
              const rows=grids.length===1?[...grids[0].querySelectorAll('table.x-grid-item')].slice(0,25).map(row=>
                [...row.querySelectorAll('td.x-grid-cell .x-grid-cell-inner')].map(cell=>String(cell.textContent??'').slice(0,256))):[];
              return {rows,requested_records:25,configured_limit:limits.length===1?String(limits[0].value):null,rendered_only:true};
            },${JSON.stringify({rootTid:source.wizard.root_tid})})`);
            await read('text_import_format','server preview owner remains bound');
            configured={verified:true,cleanup_complete:true,effect_possible:true,source:observedSource,format,columns:definitions.fields,
              server_profile:serverPreviewProfile({source:observedSource,format,columns:definitions.fields,preview})};
            return configured;
          }
          configured=operation.nodeApply.request.target.kind==='existing'
            ?await configureTextImportPatch(channel,p.settings,owner,sourceReceipt.source.destination,{preserveSchema:!!sourceSwitch})
            :await configureTextImportFields(channel,p.settings,owner);
          requireValue(configured.columns.some(c=>c.used),'Import output requires at least one used field');
          return configured;
        } catch(error) {
          if(sourceSwitch&&String(error.message).startsWith('LOGINOM_IMPORT_SCHEMA_CHANGED:'))return refuseSwitchSchema(error,'configure');
          // Binding rejects after completed observations, before editing any
          // column. Close only this operation's draft; never hide transport loss.
          // Таймаут готовности — чтение без мутаций после подтверждённых жестов;
          // закрытие черновика не сохраняет его частичную настройку.
          const readiness=error instanceof NodeReadinessTimeout;
          const initialSettings=error instanceof ImportInitialSettingsError;
          // A gesture refused before its preconditions (for example after the
          // bounded UI_EPOCH_CHANGED refreshes) applied nothing; the draft is
          // discarded like a readiness timeout, never retried in place.
          const r=error instanceof NodeProcedureStepError?error.receipt:null;
          const refused=r?.status==='NOT_APPLIED'&&r.effect_possible===false&&r.cleanup_complete===true&&Array.isArray(r.trace)
            &&!r.trace.some(e=>['ui_preconditions_verified','ui_gesture_applied'].includes(e.event));
          if(!(error instanceof ImportColumnBindingError||readiness||initialSettings||refused)||operation.transportUncertain)throw error;
          const closed=await closePreparedWizard(channel);
          error.nodePhaseRefusal={phase:'configure',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,
            verification:initialSettings?'text_import_initial_settings_draft_discarded':readiness?'text_import_readiness_draft_discarded':refused?'text_import_refresh_draft_discarded':'text_import_binding_draft_discarded',proof:{closed}};
          throw error;
        }
      },
      async mapPorts(mappings,ctx) {
        if(ctx.receipt_id===operation.id+':input_mapping'){requireValue(mappings.length===0,'Import input mappings are not installed');return verified({mappings:[],not_applicable:true});}
        enter(ctx);requireValue(configured,'Configured import schema unavailable');
        if(configured.server_profile)return verified({preview_only:true});
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
        if(sourceSwitch)try{verifyImportSchema(schemaBefore,importSchemaSnapshot({...configured,mapping:native}));}
          catch(error){return refuseSwitchSchema(error,'output_mapping');}
        // Existing output aliases/order remain valid when no mapping is asked.
        // The source association is proved by native records, never label alone.
        outputColumns=bindConfiguredOutputColumns(configured.columns,actual,native);
        const done=await next('output_mapping','done');
        return verified({effect_possible:true,mapping:actual,native_mapping:native,completion:done.wizard.completion,changes,source_identity_verified:true});
      },
      async finish(mode,ctx) {
        requireValue(['done','execute','close'].includes(mode),'Unsupported finish mode');enter(ctx);
        if(mode==='close')return {...await closePreparedWizard(channel),...(configured?.server_profile?{server_profile:configured.server_profile}:{})};
        const executeRequested=mode==='execute'&&!sourceSwitch,verb=executeRequested?'execute_wizard':'finish_wizard',button=executeRequested?'btnExecute':'btnDone';
        requireValue(mode!=='execute'||executionDriver,'Execution baseline was not prepared');
        const s=await read('done',mode+' available for the prepared node',s=>s.ui.elements.some(e=>e.tid===s.wizard.root_tid+';'+button && e.allowed_actions.includes(verb)));
        await channel.perform({condition:'bound import '+mode+' available',initialObservation:s,
          ready:s=>s.wizard?.stage==='done' && s.ui.elements.some(e=>e.tid===s.wizard.root_tid+';'+button && e.allowed_actions.includes(verb)),
          resolve:s=>({verb,ref:one(s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';'+button),'Unique wizard completion control required').ref}),
          identity:s=>s.prepared_node_context});
        const graph=await channel.observe({condition:'same configured node returned to graph',ready:s=>s.wizard?.status==='absent' && s.prepared_node_context?.surface==='graph'});
        const label=one(graph.ui.elements.filter(e=>e.tid===graph.prepared_node_context.tid+';Label;Label'
          &&e.graph_node?.part==='label'),'Configured Import caption is unavailable').graph_node.label_text;
        requireValue(typeof label==='string'&&label.length>0,'Configured Import caption is empty');
        if(sourceSwitch){
          await openPreparedWizard(channel);
          const reopened=await captureSwitchSchema();schemaAfter=reopened.schema;
          requireValue(reopened.source_path===sourceReceipt.source.destination,'LOGINOM_FILE_CHANGED: committed full source path differs');
          try{verifyImportSchema(schemaBefore,schemaAfter);}catch(error){return refuseSwitchSchema(error,'finish');}
          await closePreparedWizard(channel);
          if(mode==='done')return verified({effect_possible:true,mode,execution_started:false,execution_id:null,settings_applied:true,
            node_context:graph.prepared_node_context,node_label:label,package_saved:false,reopen_performed:true,
            schema_before:schemaBefore,schema_after:schemaAfter});
          // Done and independent reopen precede the only launch. A timeout is
          // retained by the existing execution journal/inspect path, never retried.
          await executionDriver.launchGraph();
          const execution=await executionDriver.identify();
          const continuationSurface=finishedImportSurface(await channel.observe({condition:'full import execution continuity',readProcesses:true,readOutputs:true,
            ready:s=>s.prepared_node_context?.surface==='graph'&&s.node_processes?.verified===true&&s.node_outputs?.verified===true}));
          return verified({effect_possible:true,mode,execution_started:true,settings_applied:true,execution_id:execution.execution_id,
            execution_group:execution,continuation_surface:continuationSurface,node_context:graph.prepared_node_context,node_label:label,
            package_saved:false,reopen_performed:true,schema_before:schemaBefore,schema_after:schemaAfter});
        }
        const execution=executeRequested?await executionDriver.identify():null;
        const continuationSurface=executeRequested?finishedImportSurface(await channel.observe({
          condition:'identified execution and graph continuity checkpoint',readProcesses:true,readOutputs:true,
          ready:s=>s.prepared_node_context?.surface==='graph'&&s.node_processes?.verified===true&&s.node_outputs?.verified===true})):null;
        return verified({effect_possible:true,mode,execution_started:executeRequested,settings_applied:true,
          ...(execution?{execution_id:execution.execution_id,execution_group:execution,continuation_surface:continuationSurface}:{}),
          node_context:graph.prepared_node_context,node_label:label,package_saved:false,reopen_performed:false});
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
        const {output}=await channel.readOutputPort({port:0,execution:executionReceipt,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
        requireValue(output.schema.every((field,index)=>field.name===outputColumns[index]?.name),'Import output field order differs from the configured output');
        const aligned=alignReadSchema(output.schema,outputColumns);
        output.schema=output.schema.map((field,index)=>({...field,data_kind:aligned[index].data_kind}));
        if(sourceSwitch){
          try{output.full_import_verification={...verifyFullImportCount(sourceSwitch.profile_id,scanReceipt,sourceReceipt.source,output,executionReceipt),
            source:sourceReceipt.source,
            saved_before_switch:saveReceipt,schema_before:schemaBefore,schema_after:schemaAfter};}
          catch(error){error.nodePhaseRefusal={phase:'read',status:'FAILED',effect_possible:true,cleanup_complete:true,
            verification:'text_import_full_count_refused',execution_id:executionReceipt.execution_id,
            expected_records:scanReceipt?.records,actual_records:output.row_count,port:output.port,
            freshness_basis:output.freshness_basis};throw error;}
        }
        return verified({effect_possible:true,status:output.sample_complete?'complete':'partial',execution_id:executionReceipt.execution_id,evidence_ref:ctx.receipt_id,ports:[output]});
      },
      async releasePending(state,{signal}={}) {
        const deadline=now()+NODE_RELEASE_BUDGET_MS;
        enter({signal,deadline,document_id:state.request.document_id,workflow_ref:state.request.workflow_ref,node:state.node});
        signal?.throwIfAborted();
        return releasePendingNode({operation,channel,deadline,now,readReceipt});
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
