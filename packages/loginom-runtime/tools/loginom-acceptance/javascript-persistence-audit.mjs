import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {javascriptPersistenceCase} from './javascript-persistence-cases.mjs';
import {verifyJavascriptPersistenceOutput} from './javascript-persistence-oracle.mjs';
import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';
import {inspectJavascriptModulePolicy} from '../../client/lib/javascript-module-policy.mjs';
import {javascriptSourceMappings} from './javascript-source-cycle.mjs';
import {requireJavascriptTopology} from './javascript-link-topology.mjs';
import {requireJavascriptSavedPackagePath} from './javascript-package-binding.mjs';
import {verifyJavascriptSavedDirtyState} from './javascript-persistence-dirty-state.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const need=(condition,message)=>{if(!condition)throw Error('Persistence audit: '+message);};
const same=(actual,expected,message)=>need(isDeepStrictEqual(actual,expected),message);
const sourcePins={
  code:['d2af9d87e75042c5debf58475d92060b359d888fcfce51082c1e3e13e01efcb2','82b59a9d136dd1de484fe005db3b50c7ed8b314c1a2e3f2a832ce90903f94cdf'],
  declared:['816b086fe447eb42afbf87ac46b18b01153f731f3baf0de2bcd280da1104957f','ceae03ba038a6fb0f9889a3c98cbc6a93efea8c1448cd2e4693ee34a01d51c1a'],
};

// Host-only, after both processes terminated. Expectations never enter the cold
// driver. Reports alone cannot prove process termination or source-file pins;
// ROOT must also verify the original process handles and frozen source manifest.
export function auditJavascriptPersistence({writer,cold,writerEvents,coldEvents}) {
  need(writer?.persistence?.status==='WRITER_OBSERVED'&&cold?.cold?.status==='COLD_OBSERVED','both observations required');
  const mode=writer.persistence.schema_mode,caseId=writer.persistence.case_id??'persistence-'+mode;
  need(['persistence-code','persistence-declared','persistence-usage'].includes(caseId),'fixed persistence case');
  const expected=javascriptPersistenceCase(caseId.slice('persistence-'.length));
  need(expected.schema_mode===mode&&(writer.persistence.case_id===undefined||writer.persistence.case_id===expected.id),
    'persistence case/schema identity');
  const first=writer.persistence.initial,last=writer.persistence.final,read=cold.cold,saves=writer.persistence.saves;
  reportComplete(writer,expected.writer_budget_ms);reportComplete(cold,expected.reader_budget_ms);
  need(writer.host_process.profile!==cold.host_process.profile&&writer.host_process.pid!==cold.host_process.pid,'separate processes/profiles');
  need(Date.parse(cold.host_process.started_at)>Date.parse(writer.finished_at),'cold process must start after writer cleanup');
  need(writer.explicit_execution_limit===2&&cold.explicit_execution_limit===1,'execution limits');
  need(Array.isArray(writerEvents)&&Array.isArray(coldEvents),'event journals required');
  need(saves?.length===2&&saves[0].revision===1&&saves[1].revision===2,'two ordered saves');
  const path=requireJavascriptSavedPackagePath(saves[0].path),saved=saves[1].prepared;
  need(saves[1].path===path&&read.path===path&&saved?.status==='READY'&&read.prepared?.status==='READY','same saved package');
  for(const prepared of [saved,read.prepared])need(prepared.package_ref?.path===path&&prepared.package_ref.persisted===true,'persisted preparation');
  need(saved.document_id!==read.prepared.document_id&&saved.workflow_ref.workflow_id!==read.prepared.workflow_ref.workflow_id,'new cold document/workflow');
  const node=read.node,writerNode=last.execution?.fresh_baseline?.node;
  same(node,{document_id:read.prepared.document_id,workflow_id:read.prepared.workflow_ref.workflow_id,node_id:writerNode?.node_id},'cold node identity');
  same(writerNode,{document_id:saved.document_id,workflow_id:saved.workflow_ref.workflow_id,node_id:writerNode?.node_id},'writer node identity');
  for(const [index,observation] of [first,last].entries()){
    same(observation.source,expected.revisions[index],'fixed source revision');
    need(sha(observation.source.source)===sourcePins[mode][index],'independent frozen source hash');
    executionProof(observation.execution,writerNode,sourcePins[mode][index]);
    verifyJavascriptPersistenceOutput(observation.output,index+1);
  }
  need(first.execution.execution_id!==last.execution.execution_id,'new final writer execution');
  need(read.source?.source_text===last.source.source,'full cold source differs from final saved source');
  same(javascriptSourceIdentity(read.source.source_text),javascriptSourceIdentity(last.source.source),'cold source metadata');
  for(const [key,value] of Object.entries(javascriptSourceIdentity(read.source.source_text)))need(read.source[key]===value,'cold observed '+key);
  need(read.source.admission?.intent==='preserve'&&read.source.admission.kind==='existing'&&read.source.admission.phase==='admitted'
    &&read.source.admission.planned_settings_sha256===null&&typeof read.source.admission.admission_id==='string'
    &&read.source.admission.admission_id.length>0,'read without replacement');
  need(read.source.admission.settings_sha256===sha(JSON.stringify(canonicalSettings(read.source.settings))),'cold observed settings digest');
  same(read.source.admission.effective_source,inspectJavascriptModulePolicy(read.source.source_text),'cold module policy');
  same(read.source.admission.previous_source,javascriptSourceIdentity(read.source.source_text),'cold preserved source');
  for(const owner of [read.source.owner,read.source.admission.owner])
    same({document_id:owner?.document_id,workflow_id:owner?.workflow_id,node_id:owner?.node_id},node,'source owner');
  need(read.source.admission.deadline===cold.original_deadline,'source original deadline');
  executionProof(read.execution,node,sourcePins[mode][1]);verifyJavascriptPersistenceOutput(read.output,2);
  need(read.execution.execution_id!==last.execution.execution_id,'new cold execution');
  const cycles=[first.source_cycle,last.before_execute,last.source_cycle];
  for(const [index,cycle] of cycles.entries())sourceCycle(cycle,index===0?first.source:last.source,writerNode);
  const settings=settingsMeaning(first.source_cycle.rounds[0].settings,saved.workflow_ref.prefix);
  need(settings.generation===(mode==='code'),'schema mode');
  if(caseId==='persistence-usage'){
    const fields=settings.grids.find(grid=>grid.tid==='grdTargetColumns;tbl')?.fields;
    need(fields?.length===2&&fields[0].Name==='ObservedID'&&fields[0].DataType===4
      &&fields[0].DefaultUsageType===4,
      'output usage must be the saved first declared column');
    const applied=writer.execution_schema?.grids?.find(grid=>grid.tid===writer.execution_schema.page_tid+';grdTargetColumns;tbl')?.fields;
    need(applied?.length===2&&applied[0].DefaultUsageType===4,'output usage Apply readback');
  }
  for(const cycle of cycles)for(const round of cycle.rounds)same(settingsMeaning(round.settings,saved.workflow_ref.prefix),settings,'writer settings preserved');
  same(settingsMeaning(read.source.settings,read.prepared.workflow_ref.prefix),settings,'cold settings preserved');
  const mappings=first.source_cycle.mappings.after;
  for(const [index,cycle] of cycles.entries())for(const side of ['before','after']){
    const actual=cycle.mapping_evidence?.[side];
    auditMappings(actual,mappings,writerNode,index===1);
    same(javascriptSourceMappings(actual),cycle.mappings[side],'raw cycle mapping evidence');
  }
  auditMappings(last.mappings_after_execute,mappings,writerNode,false);
  auditMappings(read.mappings_before,mappings,node,true,mode==='code');
  auditMappings(read.mappings_after,mappings,node,false);
  for(const save of saves){
    need(save.graph?.document_id===saved.document_id&&save.prepared?.document_id===saved.document_id
      &&save.prepared.package_ref?.persisted===true&&save.prepared.package_ref.path===path,'saved graph/preparation owner');
    same(save.workflow_ref,save.graph.workflow_ref,'saved graph workflow');same(save.workflow_ref,save.prepared.workflow_ref,'saved prepared workflow');
  }
  const graph=graphMeaning(saves[1].graph);
  same(graphMeaning(saves[0].graph),graph,'writer saved graph');
  for(const actual of [read.graph_before,read.graph_after]){
    need(actual.document_id===node.document_id&&actual.workflow_ref.workflow_id===node.workflow_id,'cold graph owner');
    same(graphMeaning(actual),graph,'cold graph/node/port identities');
  }
  const saveEvents=writerEvents.filter(event=>event.phase==='persistence_save_confirmed');
  const reservations=writerEvents.filter(event=>event.phase==='persistence_save_reserved');
  need(saveEvents.length===2&&reservations.length===2,'save journal count');
  need(saves[0].receipt?.operation_id!==saves[1].receipt?.operation_id,'distinct save operations');
  for(const [index,save] of saves.entries()){
    const receipt=save.receipt,output=receipt?.output;
    need(save.document_id===saved.document_id&&save.workflow_ref.workflow_id===saved.workflow_ref.workflow_id
      &&receipt?.status==='SUCCEEDED'&&receipt.phase==='verified'&&receipt.action_key==='package.save_checkpoint'&&receipt.error==null
      &&output?.save_completed===true&&output.reopened===false&&output.workflow_preserved===true
      &&output.package_ref?.path===path&&output.package_ref.active_identity===path,'save receipt');
    const reservation=reservations[index];
    need(reservation.document_id===saved.document_id&&reservation.workflow_ref?.workflow_id===saved.workflow_ref.workflow_id,'save reservation workflow');
    if(index===1)same(reservation.workflow_ref,saves[0].workflow_ref,'second save follows first continuation');
    const continuations=output.workflow_continuations?.filter(item=>item.document_id===saved.document_id
      &&isDeepStrictEqual(item.previous_workflow_ref,reservation.workflow_ref));
    need(continuations?.length===1,'exact save workflow continuation');same(continuations[0].workflow_ref,save.workflow_ref,'saved continuation');
    same(reservations[index].parameters,{path,conflict_policy:index===0?'fail':'replace'},'save conflict policy');
    need(reservations[index].operation_id===receipt.operation_id&&reservations[index].revision===index+1
      &&reservations[index].deadline===writer.original_deadline,'save reservation identity/deadline');
    need(writerEvents.indexOf(reservations[index])<writerEvents.indexOf(saveEvents[index])
      &&(index===0||writerEvents.indexOf(saveEvents[0])<writerEvents.indexOf(reservations[index])),'ordered save effects');
    same(saveEvents[index].receipt,receipt,'save journal receipt');
    need(saveEvents[index].revision===index+1&&saveEvents[index].path===path,'save journal identity');
  }
  const dirtyEvents=writerEvents.filter(event=>event.phase==='persistence_dirty_state_observed');
  const dirtyObserved=dirtyEvents.length>0||saves.some(save=>save.dirty_state!==undefined);
  if(dirtyObserved){
    need(dirtyEvents.length===2&&saves.every(save=>save.dirty_state),'two saved-package dirty-state observations');
    for(const [index,save] of saves.entries()){
      const state=verifyJavascriptSavedDirtyState(save.dirty_state,{prepared:save.prepared,path});
      const event=dirtyEvents[index];
      need(event.revision===index+1&&event.path===path&&event.save_operation_id===save.receipt.operation_id,
        'dirty-state save identity');
      same(event.dirty_state,state,'dirty-state journal receipt');
      need(writerEvents.indexOf(saveEvents[index])<writerEvents.indexOf(event)
        &&(index===1||writerEvents.indexOf(event)<writerEvents.indexOf(reservations[1])),
        'dirty-state observation order');
    }
  }
  const mappingEvents=writerEvents.filter(event=>event.phase==='persistence_post_execution_mappings_verified');
  need(mappingEvents.length===1,'one post-execution mapping proof');
  same(mappingEvents[0].mappings,last.mappings_after_execute,'post-execution mapping journal');
  const finalTerminal=writerEvents.find(event=>event.phase==='execution_terminal'&&event.terminal?.execution_id===last.execution.execution_id);
  need(finalTerminal&&writerEvents.indexOf(finalTerminal)<writerEvents.indexOf(mappingEvents[0])
    &&writerEvents.indexOf(mappingEvents[0])<writerEvents.indexOf(reservations[1]),'full mapping proof before second save');
  const terminals=events=>events.filter(event=>event.phase==='execution_terminal'&&event.terminal?.trial?.node_id===node.node_id);
  same(terminals(writerEvents).map(event=>event.terminal),[first.execution,last.execution],'writer execution journal');
  same(terminals(coldEvents).map(event=>event.terminal),[read.execution],'cold execution journal');
  for(const [events,executions,phases] of [[writerEvents,[first.execution,last.execution],['initial','persistence-final']],[coldEvents,[read.execution],['initial']]]){
    const launches=events.filter(event=>event.phase==='execution_launched'&&event.node?.node_id===node.node_id);
    need(launches.length===executions.length,'explicit execution launch count');
    for(const [index,event] of launches.entries()){
      const terminal=executions[index];same(event.identity,terminal.trial,'execution launch source/phase');
      need(terminal.trial.phase===phases[index]&&event.execution_dispatched===true
        &&events.indexOf(event)<events.findIndex(row=>row.phase==='execution_terminal'&&row.terminal?.execution_id===terminal.execution_id),'execution launch order');
    }
  }
  const cycleEvents=writerEvents.filter(event=>event.phase==='source_cycle_verified');
  same(cycleEvents.map(event=>event.result),cycles,'complete writer source cycles');
  const ordered=[terminals(writerEvents)[0],cycleEvents[0],reservations[0],saveEvents[0],
    ...(dirtyObserved?[dirtyEvents[0]]:[]),cycleEvents[1],
    writerEvents.find(event=>event.phase==='execution_launched'&&event.identity?.phase==='persistence-final'),
    terminals(writerEvents)[1],reservations[1],saveEvents[1],
    ...(dirtyObserved?[dirtyEvents[1]]:[]),cycleEvents[2]].map(event=>writerEvents.indexOf(event));
  need(ordered.every((index,position)=>index>=0&&(position===0||index>ordered[position-1])),'writer cycle/save/execute ordering');
  const admissionEvents=['javascript_source_admitted','javascript_source_effect_dispatch','javascript_source_effect_returned'].map(phase=>{
    const matches=coldEvents.filter(event=>event.phase===phase);need(matches.length===1,'cold '+phase+' count');
    same(matches[0].receipt,read.source.admission,'cold admission journal');return coldEvents.indexOf(matches[0]);
  });
  const terminalIndex=coldEvents.indexOf(terminals(coldEvents)[0]);
  need(admissionEvents[0]<admissionEvents[1]&&admissionEvents[1]<terminalIndex&&terminalIndex<admissionEvents[2],'cold admission/execute ordering');
  const readPhases=['source_open_dispatch','source_open_settled','source_discard_dispatch','source_discard_settled','source_delivery_verified'];
  need(coldEvents.filter(event=>readPhases.includes(event.phase)).length===15,'three complete fixed-source reads');
  let previousDelivery=-1;
  for(const readId of [1,2,3]){
    let previousIndex=previousDelivery;
    for(const phase of readPhases){
      const events=coldEvents.filter(event=>event.phase===phase&&event.read_id===readId);
      need(events.length===1,'cold source lifecycle '+phase);const event=events[0],index=coldEvents.indexOf(event);
      need(index>previousIndex&&event.admission_id===read.source.admission.admission_id
        &&event.deadline===cold.original_deadline&&event.step===1,'cold source lifecycle owner/order/deadline');
      same(event.owner,read.source.admission.owner,'cold source lifecycle owner');previousIndex=index;
      if(phase==='source_delivery_verified')same(event.receipt,{...javascriptSourceIdentity(read.source.source_text),
        offset_utf8_bytes:0,chunk_utf8_bytes:read.source.source_utf8_bytes,chunk_sha256:read.source.source_sha256,cursor_sha256:null},'cold complete source delivery');
    }
    need(readId===1?previousIndex<admissionEvents[0]:readId===2?previousDelivery<admissionEvents[0]&&previousIndex<admissionEvents[1]
      :previousDelivery<admissionEvents[1]&&previousIndex<terminalIndex,'cold fresh read boundaries');
    if(readId>1)need(coldEvents.findIndex(event=>event.phase==='source_open_dispatch'&&event.read_id===readId)>admissionEvents[readId-2],'fresh read after admission/dispatch');
    if(readId===3)need(coldEvents.findIndex(event=>event.phase==='source_open_dispatch'&&event.read_id===3)>admissionEvents[1]
      &&previousIndex<coldEvents.findIndex(event=>event.phase==='execution_launched'&&event.node?.node_id===node.node_id),'final read after dispatch ACK before Execute');
    previousDelivery=previousIndex;
  }
  need(!coldEvents.some(event=>event.phase==='persistence_save_reserved'||event.phase==='persistence_save_confirmed'
    ||event.phase?.startsWith('javascript_source_mutation')),'cold mutation journal');
  return {version:1,status:'VERIFIED',case_id:caseId,schema_mode:mode,path,source_sha256:sourcePins[mode][1],
    source_utf8_bytes:read.source.source_utf8_bytes,source_lf_lines:read.source.source_lf_lines,
    output:{rows:6,columns:2,numeric_tolerance:0},writer_document_id:saved.document_id,cold_document_id:node.document_id,
    execution_ids:[first.execution.execution_id,last.execution.execution_id,read.execution.execution_id],
    full_source_verified:true,settings_verified:true,mappings_verified:true,graph_verified:true,cold_execution_verified:true,
    package_bytes_verified:false,dirty_state_verified:dirtyObserved&&saves.every(save=>save.dirty_state.modified===false),public_handler_verified:false,
    scope:'Report/journal persistence evidence; requires ROOT source freeze and original process termination checks'};
}

function reportComplete(report,budget){
  need(report.status==='OBSERVED'&&report.headless===false&&report.node==='24.19.0','completed headed pinned-node report');
  need(['package_closed','logged_out','browser_closed'].every(key=>report.cleanup?.[key]===true)&&!report.cleanup.failure&&!report.failure,'confirmed cleanup');
  const start=Date.parse(report.host_process?.started_at),work=Date.parse(report.work_finished_at),end=Date.parse(report.finished_at);
  need(Number.isSafeInteger(report.host_process?.pid)&&report.host_process.pid>0&&isAbsolute(report.host_process.profile),'host process identity');
  need(Number.isFinite(start)&&Number.isFinite(work)&&Number.isFinite(end)&&work>=start&&work<=report.original_deadline
    &&end>=work&&end<=work+180000&&report.original_deadline===start+budget,'original work/cleanup budget');
}
function executionProof(execution,node,sourceSha){
  need(execution?.verified===true&&execution.owner_verified===true&&execution.cleanup_complete===true&&execution.status==='completed'
    &&execution.trial?.node_id===node.node_id&&execution.trial.source_sha256===sourceSha,'owned completed execution');
  const baseline=execution.fresh_baseline,launch=execution.launch_identity;
  same(baseline?.node,node,'execution baseline owner');same(launch?.node,node,'execution launch owner');
  need(typeof baseline.root_id==='string'&&baseline.root_id&&Array.isArray(baseline.roots)
    &&typeof execution.group_id==='string'&&execution.group_id&&launch.root_id===baseline.root_id&&launch.group_id===execution.group_id
    &&launch.execution_id===execution.execution_id&&execution.execution_id===node.document_id+':'+baseline.root_id+':'+execution.group_id
    &&!baseline.roots.some(row=>row.process_id===execution.group_id),'fresh process group');
}
// Independent audit of observed proofs; do not call the runtime admission helper.
function auditMappings(actual,expected,node,pendingAllowed,emptyGeneratedAllowed=false){
  need(actual&&expected,'mapping evidence required');
  const kinds={};
  for(const direction of ['input','output']){
    const m=actual[direction],c=m?.node_context;
    need(m?.inventory_complete===true&&m.state_source==='cached_mapping_stores'
      &&typeof m.autosync==='boolean'&&m.settings_applied===false&&m.package_saved===false
      &&c?.verified===true&&c.surface==='wizard'&&Array.isArray(m.source_fields)&&m.source_fields.length<=1000
      &&Array.isArray(m.target_fields)&&m.target_fields.length<=1000,'native mapping evidence');
    same({document_id:c.document_id,workflow_id:c.workflow_id,node_id:c.node_id},node,'mapping owner');
    const complete=m.verified===true&&m.source_identity_verified===true&&m.configured_inventory_verified!==true
      &&m.source_pending===undefined&&(m.source_fields.length>0||m.target_fields.length===0);
    kinds[direction]=complete;
    if(complete)continue;
    need(pendingAllowed&&direction==='output'&&m.verified===false&&m.source_identity_verified===false
      &&m.configured_inventory_verified===true&&m.reason==='mapping_source_pending'
      &&m.mapping_wizard==='DataSetOutputSocketWizard','configured-only phase');
    const p=m.source_pending;
    need(typeof c.tid==='string'&&c.tid.endsWith(';WizrdMCF')&&c.output_port?.direction==='output'
      &&c.output_port.port===0&&typeof c.output_port.port_guid==='string'&&c.output_port.port_guid.length>0,'configured output owner');
    same(p,{kind:'hidden_source_column',header_tid:c.tid+';DataSetOutputSocketWizard;grdTargetColumns;headercontainer',
      column_tid:c.tid+';DataSetOutputSocketWizard;colSourceDisplayName',data_index:'SourceDisplayName',item_id:'colSourceDisplayName',
      hidden:true,visible:false,source_count:0,target_count:m.target_fields.length,native_header_verified:true},'configured hidden column proof');
    need(m.source_fields.length===0&&m.target_fields.length>0&&m.target_fields.length<=200
      &&m.target_fields.every(t=>t.source===null&&t.exclusion_source===null&&t.excluded===false),'configured target state');
    same(m.rendered_indices,m.target_fields.map((_,i)=>i),'configured rendered inventory');
  }
  const observed=javascriptSourceMappings(actual);
  same(observed.input,expected.input,'input mapping preserved');
  if(kinds.output){
    if(emptyGeneratedAllowed&&actual.output.source_fields.length===0&&actual.output.target_fields.length===0
      &&expected.output.target_fields.length>0){
      // Code-generated output has no cached columns in a newly opened package
      // until its first execution. The full mapping and output are audited after it.
      need(actual.output.mapping_wizard==='DataSetOutputSocketWizard'
        &&actual.output.node_context.output_port?.direction==='output'
        &&actual.output.node_context.output_port.port===0
        &&Array.isArray(actual.output.rendered_indices)&&actual.output.rendered_indices.length===0
        &&actual.output.reason===undefined,'cold generated output inventory');
      same(observed.output.autosync,expected.output.autosync,'cold generated output autosync');
      return;
    }
    same(observed.output,expected.output,'complete output mapping preserved');return;
  }
  same(observed.output.autosync,expected.output.autosync,'configured autosync');
  const properties=fields=>fields.map(field=>Object.fromEntries(Object.entries(field).filter(([key])=>key!=='source')));
  same(properties(observed.output.target_fields),properties(expected.output.target_fields),'configured target properties');
}
function sourceCycle(cycle,source,node){
  need(cycle?.source_unchanged===true&&cycle.settings_unchanged===true&&cycle.mappings_unchanged===true
    &&cycle.no_execute_or_done_dispatched_in_cycle===true&&cycle.process?.unchanged===true&&cycle.rounds?.length===2,'source read/Close cycle');
  need(new Set(cycle.rounds.map(round=>round.receipts?.[0]?.owner?.operation_id)).size===2,'two independent source read owners');
  for(const [index,round] of cycle.rounds.entries()){
    need(round.round===index,'source round order');
    for(const [key,value] of Object.entries(javascriptSourceIdentity(source.source)))need(round[key]===value,'writer read source '+key);
    need(round.settings_sha256===sha(JSON.stringify(round.settings))&&round.chunks===round.receipts?.length&&round.chunks>0,'source read receipts');
    let offset=0;
    for(const receipt of round.receipts){
      same({document_id:receipt.owner?.document_id,workflow_id:receipt.owner?.workflow_id,node_id:receipt.owner?.node_id},node,'source chunk owner');
      need(receipt.source_sha256===source.source_sha256&&receipt.offset_utf8_bytes===offset&&Number.isSafeInteger(receipt.chunk_utf8_bytes)
        &&receipt.chunk_utf8_bytes>0,'source chunk extent');
      const chunk=Buffer.from(source.source).subarray(offset,offset+receipt.chunk_utf8_bytes);
      need(chunk.length===receipt.chunk_utf8_bytes&&sha(chunk)===receipt.chunk_sha256,'source chunk bytes');offset+=chunk.length;
    }
    need(offset===source.source_utf8_bytes&&round.receipts.at(-1).cursor_sha256===null,'complete source chunks');
  }
}
function canonicalSettings(value){
  if(Array.isArray(value))return value.map(canonicalSettings);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalSettings(value[key])]));
  return value;
}
function settingsMeaning(settings,prefix){
  need(typeof settings?.generation==='boolean'&&Array.isArray(settings.grids)&&settings.grids.length===2,'settings inventory');
  return {generation:settings.generation,grids:settings.grids.map(grid=>{
    const root=prefix+';WizrdMCF;JavaScriptColumnsWizard;';
    need(typeof grid.tid==='string'&&grid.tid.startsWith(root)&&Array.isArray(grid.fields),'settings page identity');
    return {...grid,tid:grid.tid.slice(root.length)};
  })};
}
function graphMeaning(graph){
  requireJavascriptTopology(graph);need(graph.foreign_links.length===0,'foreign graph links');
  return {nodes:graph.nodes.map(({dom_epoch,ref,...node})=>({...node,node_id:ref.node_id})).sort((a,b)=>a.node_id.localeCompare(b.node_id)),
    links:[...graph.links].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  process.umask(0o077);
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){need(['--writer','--cold','--output'].includes(args[i])&&!Object.hasOwn(options,args[i])&&isAbsolute(args[i+1]??''),'absolute unique auditor arguments');options[args[i]]=args[i+1];}
  need(Object.keys(options).length===3,'writer/cold/output paths required');
  const files=[options['--writer']+'/report.json',options['--cold']+'/report.json',options['--writer']+'/execution-events.jsonl',options['--cold']+'/execution-events.jsonl'];
  const bytes=await Promise.all(files.map(file=>readFile(file)));
  const journal=buffer=>buffer.toString('utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const result=auditJavascriptPersistence({writer:JSON.parse(bytes[0]),cold:JSON.parse(bytes[1]),writerEvents:journal(bytes[2]),coldEvents:journal(bytes[3])});
  await writeFile(options['--output'],JSON.stringify({...result,files:files.map((path,index)=>({path,sha256:sha(bytes[index])}))},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:result.status,schema_mode:result.schema_mode,output:options['--output']}));
}
