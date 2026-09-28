import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {auditJavascriptPersistence} from './javascript-persistence-audit.mjs';
import {javascriptPersistenceCase} from './javascript-persistence-cases.mjs';
import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';
import {inspectJavascriptModulePolicy} from '../../client/lib/javascript-module-policy.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const path='/jsteach/js-g2-9150c962-ad60-4cd4-a13e-bcba89b982d8/JavaScript-9150c962-ad60-4cd4-a13e-bcba89b982d8.lgp';
const finalMarker='JS_G7_FINAL_V2 — Сумма & <tag> "quotes" \'single\' \\ backslash 😀';
function fixture(mode='code'){
  const sources=javascriptPersistenceCase(mode).revisions;
  const prepared=(document_id,prefix)=>({status:'READY',target_verified:true,document_id,workflow_ref:{workflow_id:document_id+'-workflow',prefix,tab_tid:prefix+'-tab'},package_ref:{name:'saved',persisted:true,path}});
  const wp=prepared('writer','MF;TF-1'),cp=prepared('cold','MF;TF-7');
  const node=p=>({document_id:p.document_id,workflow_id:p.workflow_ref.workflow_id,node_id:'js'}),wn=node(wp),cn=node(cp);
  const graph=p=>({complete:true,interaction_ready:true,document_id:p.document_id,workflow_ref:p.workflow_ref,dom_epoch:p===wp?1:10,
    nodes:[{ref:node(p),type:'bg-vendor-icon-javascript',label:'JS',position:{x:200,y:80},inputs:[0],outputs:[0],other_ports:['Input_Add','Input_Var-1','Output_Add'],locked:false,dom_epoch:p===wp?1:90},
      {ref:{...node(p),node_id:'import'},type:'imports.text',label:'Input',position:{x:80,y:80},inputs:[],outputs:[0],other_ports:['Input_Connection-0','Input_Var-1'],locked:false,dom_epoch:2}],
    links:[{source:'import',target:'js',input:0,output:0}],foreign_links:[]});
  const settings=prefix=>({generation:mode==='code',grids:['grdSourceColumns','grdTargetColumns'].map(name=>({tid:prefix+';WizrdMCF;JavaScriptColumnsWizard;'+name+';tbl',fields:mode==='code'?[]:[{Name:'ObservedID',DataType:4},{Name:'PhaseMarker',DataType:1}]}))});
  const mapping={autosync:true,source_fields:[{index:0,name:'RowID',type:'integer'}],target_fields:[{index:0,name:'RowID',type:'integer',excluded:false,source:{index:0,name:'RowID',type:'integer'},exclusion_source:null}]};
  const mappings={input:mapping,output:mapping};
  const rawMappings=n=>Object.fromEntries(['input','output'].map(direction=>[direction,{...structuredClone(mapping),verified:true,inventory_complete:true,source_identity_verified:true,
    state_source:'cached_mapping_stores',settings_applied:false,package_saved:false,mapping_wizard:direction==='output'?'DataSetOutputSocketWizard':'TuneDataSourceMappingWizard',
    rendered_indices:[0],node_context:{...n,verified:true,surface:'wizard',tid:(n.document_id==='writer'?'MF;TF-1':'MF;TF-7')+';WizrdMCF',
      ...(direction==='output'?{output_port:{direction:'output',port:0,port_guid:'port'}}:{})}}]));
  const output=revision=>({row_count:6,sample_rows:6,sample_complete:true,schema:[{name:'ObservedID',label:'ObservedID',type:'integer'},{name:'PhaseMarker',label:'PhaseMarker',type:'string'}],
    sample:['1','2','3','4','5','6'].map(value=>[{type:'integer',is_null:false,precision:'exact_integer',value},{type:'string',is_null:false,value:revision===1?'JS_G2_TABLE_V1':finalMarker}])});
  const execution=(n,revision,group,phase)=>({verified:true,owner_verified:true,cleanup_complete:true,status:'completed',group_id:group,
    execution_id:n.document_id+':root:'+group,trial:{node_id:'js',phase,source_sha256:sources[revision-1].source_sha256},
    fresh_baseline:{node:n,root_id:'root',roots:[{process_id:'old'}]},launch_identity:{node:n,root_id:'root',group_id:group,execution_id:n.document_id+':root:'+group}});
  const cycle=revision=>({source_unchanged:true,settings_unchanged:true,mappings_unchanged:true,no_execute_or_done_dispatched_in_cycle:true,process:{unchanged:true},mapping_evidence:{before:rawMappings(wn),after:rawMappings(wn)},mappings:{before:mappings,after:mappings},
    rounds:[0,1].map(round=>({round,...javascriptSourceIdentity(sources[revision-1].source),chunks:1,settings:settings(wp.workflow_ref.prefix),settings_sha256:sha(JSON.stringify(settings(wp.workflow_ref.prefix))),
      receipts:[{owner:{...wn,operation_id:'read-'+round,ui_epoch:0},source_sha256:sources[revision-1].source_sha256,offset_utf8_bytes:0,chunk_utf8_bytes:Buffer.byteLength(sources[revision-1].source),chunk_sha256:sha(sources[revision-1].source),cursor_sha256:null}]}))});
  const start=Date.parse('2026-09-28T10:00:00Z'),coldStart=start+180000;
  const report=(pid,time,budget)=>({status:'OBSERVED',headless:false,node:'24.19.0',host_process:{pid,profile:'/profile-'+pid,started_at:new Date(time).toISOString()},
    original_deadline:time+budget,work_finished_at:new Date(time+60000).toISOString(),finished_at:new Date(time+120000).toISOString(),cleanup:{package_closed:true,logged_out:true,browser_closed:true}});
  const saves=[1,2].map(revision=>({revision,path,document_id:wp.document_id,workflow_ref:wp.workflow_ref,prepared:wp,graph:graph(wp),
    receipt:{operation_id:'save-'+revision,action_key:'package.save_checkpoint',status:'SUCCEEDED',phase:'verified',error:null,
      output:{save_completed:true,reopened:false,workflow_preserved:true,package_ref:{path,active_identity:path},
        workflow_continuations:[{document_id:wp.document_id,previous_workflow_ref:wp.workflow_ref,workflow_ref:wp.workflow_ref}]}}}));
  const writer={...report(111,start,1800000),explicit_execution_limit:2,persistence:{status:'WRITER_OBSERVED',schema_mode:mode,saves,
    initial:{source:sources[0],execution:execution(wn,1,'1','initial'),output:output(1),source_cycle:cycle(1)},
    final:{source:sources[1],execution:execution(wn,2,'2','persistence-final'),output:output(2),before_execute:cycle(2),source_cycle:cycle(2),mappings_after_execute:rawMappings(wn)}}};
  const coldMappings=rawMappings(cn);
  const owner={...cn,operation_id:'cold-source',ui_epoch:0};
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const admission={admission_id:'admission-1',phase:'admitted',intent:'preserve',kind:'existing',planned_settings_sha256:null,
    settings_sha256:sha(JSON.stringify(canonical(settings(cp.workflow_ref.prefix)))),owner,deadline:coldStart+600000,effective_source:inspectJavascriptModulePolicy(sources[1].source),previous_source:javascriptSourceIdentity(sources[1].source)};
  const cold={...report(222,coldStart,600000),explicit_execution_limit:1,cold:{status:'COLD_OBSERVED',path,prepared:cp,node:cn,
    source:{source_text:sources[1].source,...javascriptSourceIdentity(sources[1].source),settings:settings(cp.workflow_ref.prefix),owner,admission},
    execution:execution(cn,2,'1','initial'),output:output(2),mappings_before:coldMappings,mappings_after:coldMappings,graph_before:graph(cp),graph_after:graph(cp)}};
  const executionEvents=e=>[{phase:'execution_launched',node:e.fresh_baseline.node,identity:e.trial,execution_dispatched:true},{phase:'execution_terminal',terminal:e}];
  const saveEvents=s=>[{phase:'persistence_save_reserved',revision:s.revision,document_id:wp.document_id,workflow_ref:wp.workflow_ref,operation_id:s.receipt.operation_id,deadline:writer.original_deadline,
    parameters:{path,conflict_policy:s.revision===1?'fail':'replace'}},{phase:'persistence_save_confirmed',revision:s.revision,path,receipt:s.receipt}];
  const writerEvents=[...executionEvents(writer.persistence.initial.execution),{phase:'source_cycle_verified',result:writer.persistence.initial.source_cycle},...saveEvents(saves[0]),
    {phase:'source_cycle_verified',result:writer.persistence.final.before_execute},...executionEvents(writer.persistence.final.execution),{phase:'persistence_post_execution_mappings_verified',mappings:writer.persistence.final.mappings_after_execute},...saveEvents(saves[1]),{phase:'source_cycle_verified',result:writer.persistence.final.source_cycle}];
  const readEvents=read_id=>['source_open_dispatch','source_open_settled','source_discard_dispatch','source_discard_settled','source_delivery_verified'].map(phase=>({phase,read_id,owner,step:1,deadline:cold.original_deadline,admission_id:'admission-1',
    ...(phase==='source_delivery_verified'?{receipt:{...javascriptSourceIdentity(sources[1].source),offset_utf8_bytes:0,chunk_utf8_bytes:sources[1].source_utf8_bytes,chunk_sha256:sources[1].source_sha256,cursor_sha256:null}}:{})}));
  const coldEvents=[...readEvents(1),{phase:'javascript_source_admitted',receipt:admission},...readEvents(2),{phase:'javascript_source_effect_dispatch',receipt:admission},
    ...readEvents(3),...executionEvents(cold.cold.execution),{phase:'javascript_source_effect_returned',receipt:admission}];
  // Independent JSON files do not share object identities across observations.
  return JSON.parse(JSON.stringify({writer,cold,writerEvents,coldEvents}));
}
for(const mode of ['code','declared'])test('independent full persistence audit: '+mode,()=>{
  const result=auditJavascriptPersistence(fixture(mode));assert.equal(result.status,'VERIFIED');assert.equal(result.schema_mode,mode);
  assert.equal(result.cold_execution_verified,true);assert.equal(result.package_bytes_verified,false);assert.equal(result.public_handler_verified,false);
});
const faults={
  source:f=>{f.cold.cold.source.source_text+=' ';},staleSource:f=>{f.cold.cold.source.source_text=f.writer.persistence.initial.source.source;},
  sourceDigest:f=>{f.cold.cold.source.source_sha256='0'.repeat(64);},sourceBytes:f=>{f.cold.cold.source.source_utf8_bytes++;},
  chunk:f=>{f.writer.persistence.final.source_cycle.rounds[0].receipts[0].chunk_sha256='0'.repeat(64);},
  missingChunk:f=>{f.writer.persistence.final.source_cycle.rounds[0].receipts=[];},
  mode:f=>{f.cold.cold.source.settings.generation=false;},settings:f=>{f.cold.cold.source.settings.grids[0].fields.push({Name:'Other'});},
  settingsPage:f=>{f.cold.cold.source.settings.grids[0].tid='foreign';},
  mapping:f=>{f.cold.cold.mappings_after.input.autosync=false;},mappingType:f=>{f.cold.cold.mappings_after.input.target_fields[0].type='real';},
  mappingOwner:f=>{f.cold.cold.mappings_before.output.node_context.node_id='other';},mappingPartial:f=>{f.cold.cold.mappings_before.input.inventory_complete=false;},
  graph:f=>{f.cold.cold.graph_after.nodes[0].label='Other';},link:f=>{f.cold.cold.graph_before.links=[];},port:f=>{f.cold.cold.graph_after.nodes[0].outputs=[1];},
  missingNode:f=>{f.cold.cold.graph_after.nodes.pop();},foreignLink:f=>{f.cold.cold.graph_before.foreign_links.push({source:'other'});},
  outputValue:f=>{f.cold.cold.output.sample[0][0].value='7';},outputType:f=>{f.cold.cold.output.schema[0].type='real';},
  outputOrder:f=>{f.cold.cold.output.sample.reverse();},outputCount:f=>{f.cold.cold.output.row_count=7;},
  outputTruncated:f=>{f.cold.cold.output.truncated=true;},staleOutput:f=>{f.cold.cold.output.sample[0][1].value='JS_G2_TABLE_V1';},
  staleExecution:f=>{f.cold.cold.execution.fresh_baseline.roots.push({process_id:'1'});},executionOwner:f=>{f.cold.cold.execution.fresh_baseline.node.node_id='other';},
  executionGroup:f=>{f.cold.cold.execution.launch_identity.group_id='old';},executionUnconfirmed:f=>{f.cold.cold.execution.owner_verified=false;},
  sameProcess:f=>{f.cold.host_process.pid=f.writer.host_process.pid;},sameProfile:f=>{f.cold.host_process.profile=f.writer.host_process.profile;},
  overlap:f=>{f.cold.host_process.started_at=f.writer.host_process.started_at;},late:f=>{f.cold.work_finished_at=new Date(f.cold.original_deadline+1).toISOString();},
  deadline:f=>{f.cold.original_deadline++;},headless:f=>{f.cold.headless=true;},cleanup:f=>{f.writer.cleanup.logged_out=false;},
  path:f=>{f.cold.cold.path=path.replace('JavaScript-','Other-');},save:f=>{f.writer.persistence.saves[1].receipt.status='AMBIGUOUS';},
  savePolicy:f=>{f.writerEvents.find(e=>e.phase==='persistence_save_reserved').parameters.conflict_policy='replace';},
  continuation:f=>{f.writer.persistence.saves[1].receipt.output.workflow_continuations[0].previous_workflow_ref.workflow_id='other';},
  effectOrder:f=>{const at=f.writerEvents.findIndex(e=>e.phase==='source_cycle_verified');f.writerEvents.push(f.writerEvents.splice(at,1)[0]);},
  saveEvent:f=>{f.writerEvents=f.writerEvents.filter(e=>e.phase!=='persistence_save_confirmed');},
  missingTerminal:f=>{f.coldEvents=f.coldEvents.filter(e=>e.phase!=='execution_terminal');},
  extraLaunch:f=>{f.coldEvents.push(f.coldEvents.find(e=>e.phase==='execution_launched'));},
  mutatedCold:f=>{f.coldEvents.push({phase:'persistence_save_reserved'});},
  admission:f=>{f.cold.cold.source.admission.intent='replace';},policy:f=>{f.cold.cold.source.admission.effective_source.status='DENIED';},
  plannedSettings:f=>{f.cold.cold.source.admission.planned_settings_sha256='expected';},
  settingsDigest:f=>{f.cold.cold.source.admission.settings_sha256='0'.repeat(64);},
  missingClose:f=>{f.coldEvents=f.coldEvents.filter(e=>e.phase!=='source_discard_settled');},
  lastReadStale:f=>{f.coldEvents.find(e=>e.phase==='source_delivery_verified'&&e.read_id===3).receipt.chunk_sha256='0'.repeat(64);},
  lastReadOwner:f=>{f.coldEvents.find(e=>e.phase==='source_delivery_verified'&&e.read_id===3).owner.node_id='other';},
  lastReadOrder:f=>{const at=f.coldEvents.findIndex(e=>e.phase==='source_delivery_verified'&&e.read_id===3);f.coldEvents.push(f.coldEvents.splice(at,1)[0]);},
  duplicateRounds:f=>{f.writer.persistence.final.source_cycle.rounds[1]=f.writer.persistence.final.source_cycle.rounds[0];},
  sourceOwner:f=>{f.cold.cold.source.owner.document_id='other';},
};
for(const [name,change] of Object.entries(faults))test('independent audit refuses '+name,()=>{
  const f=fixture();change(f);assert.throws(()=>auditJavascriptPersistence(f));
});

test('actual auditor CLI writes hashed evidence once and refuses overwrite',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'javascript-audit-'));
  try{
    const f=fixture(),writer=join(directory,'writer'),cold=join(directory,'cold');
    const {mkdir}=await import('node:fs/promises');await mkdir(writer);await mkdir(cold);
    for(const [name,value] of [[writer+'/report.json',f.writer],[cold+'/report.json',f.cold]])await writeFile(name,JSON.stringify(value));
    await writeFile(writer+'/execution-events.jsonl',f.writerEvents.map(e=>JSON.stringify(e)).join('\n'));
    await writeFile(cold+'/execution-events.jsonl',f.coldEvents.map(e=>JSON.stringify(e)).join('\n'));
    const index=process.execArgv.indexOf('--import'),preload=index<0?[]:process.execArgv.slice(index,index+2),output=join(directory,'audit.json');
    const args=[...preload,new URL('./javascript-persistence-audit.mjs',import.meta.url).pathname,'--writer',writer,'--cold',cold,'--output',output];
    const first=spawnSync(process.execPath,args,{encoding:'utf8',timeout:15000});assert.equal(first.status,0,first.stderr);
    const bytes=await readFile(output),audit=JSON.parse(bytes);assert.equal(audit.status,'VERIFIED');assert.equal(audit.files.length,4);
    for(const entry of audit.files)assert.equal(entry.sha256,sha(await readFile(entry.path)));
    const retry=spawnSync(process.execPath,args,{encoding:'utf8',timeout:15000});assert.notEqual(retry.status,0);assert.deepEqual(await readFile(output),bytes);
  }finally{await rm(directory,{recursive:true,force:true});}
});

function configuredProof(mapping){
 const result=structuredClone(mapping),prefix=result.node_context.tid+';DataSetOutputSocketWizard;';
 result.verified=false;result.source_identity_verified=false;result.configured_inventory_verified=true;result.reason='mapping_source_pending';
 result.source_fields=[];for(const field of result.target_fields)field.source=null;
 result.source_pending={kind:'hidden_source_column',header_tid:prefix+'grdTargetColumns;headercontainer',column_tid:prefix+'colSourceDisplayName',
  data_index:'SourceDisplayName',item_id:'colSourceDisplayName',hidden:true,visible:false,source_count:0,target_count:result.target_fields.length,native_header_verified:true};
 return result;
}
function configuredFixture(){
 const f=fixture(),cycle=f.writer.persistence.final.before_execute;
 for(const side of ['before','after']){
  cycle.mapping_evidence[side].output=configuredProof(cycle.mapping_evidence[side].output);
  cycle.mappings[side].output.source_fields=[];for(const t of cycle.mappings[side].output.target_fields)t.source=null;
 }
 f.writerEvents.filter(e=>e.phase==='source_cycle_verified')[1].result=structuredClone(cycle);
 f.cold.cold.mappings_before.output=configuredProof(f.cold.cold.mappings_before.output);
 return f;
}
test('independent audit accepts native configured-only before execution and complete proofs after it',()=>{
 assert.equal(auditJavascriptPersistence(configuredFixture()).status,'VERIFIED');
});
function coldGeneratedEmptyFixture(mode='code'){
 const f=fixture(mode),output=f.cold.cold.mappings_before.output;
 output.source_fields=[];output.target_fields=[];output.rendered_indices=[];
 return f;
}
test('code mode accepts observed empty cold output cache only before a verified fresh execution',()=>{
 assert.equal(auditJavascriptPersistence(coldGeneratedEmptyFixture()).status,'VERIFIED');
});
test('declared mode refuses an empty cold output cache',()=>{
 assert.throws(()=>auditJavascriptPersistence(coldGeneratedEmptyFixture('declared')));
});
for(const [name,change] of Object.entries({
 nonempty_rendered:f=>{f.cold.cold.mappings_before.output.rendered_indices=[0];},
 wrong_wizard:f=>{f.cold.cold.mappings_before.output.mapping_wizard='OtherWizard';},
 wrong_port:f=>{f.cold.cold.mappings_before.output.node_context.output_port.port=1;},
 autosync:f=>{f.cold.cold.mappings_before.output.autosync=false;},
 partial_source:f=>{f.cold.cold.mappings_before.output.source_fields=[{index:0,name:'ObservedID',type:'integer'}];},
 empty_after_execute:f=>{f.cold.cold.mappings_after.output.source_fields=[];f.cold.cold.mappings_after.output.target_fields=[];},
 missing_output:f=>{f.cold.cold.output.sample=[];},
 }))test('cold generated cache allowance refuses '+name,()=>{
 const f=coldGeneratedEmptyFixture();change(f);assert.throws(()=>auditJavascriptPersistence(f));
 });
for(const [name,change] of Object.entries({
 configured_label:f=>{f.writer.persistence.final.before_execute.mapping_evidence.before.output.target_fields[0].label='Changed';},
 configured_header:f=>{f.cold.cold.mappings_before.output.source_pending.hidden=false;},
 configured_owner:f=>{f.cold.cold.mappings_before.output.node_context.node_id='other';},
 configured_missing_cell_proof:f=>{delete f.cold.cold.mappings_before.output.source_pending;},
 configured_source:f=>{f.cold.cold.mappings_before.output.source_fields.push({});},
 configured_rendered:f=>{f.cold.cold.mappings_before.output.rendered_indices=[];},
 pending_after_cold:f=>{f.cold.cold.mappings_after.output=configuredProof(f.cold.cold.mappings_after.output);},
 pending_after_writer:f=>{f.writer.persistence.final.mappings_after_execute.output=configuredProof(f.writer.persistence.final.mappings_after_execute.output);},
 missing_raw:f=>{delete f.writer.persistence.final.before_execute.mapping_evidence;},
 missing_post_mapping:f=>{delete f.writer.persistence.final.mappings_after_execute;},
 no_journal_proof:f=>{f.writerEvents=f.writerEvents.filter(e=>e.phase!=='persistence_post_execution_mappings_verified');},
 save_before_proof:f=>{const i=f.writerEvents.findIndex(e=>e.phase==='persistence_post_execution_mappings_verified');f.writerEvents.push(...f.writerEvents.splice(i,1));},
 proof_before_execution:f=>{const i=f.writerEvents.findIndex(e=>e.phase==='persistence_post_execution_mappings_verified');f.writerEvents.unshift(...f.writerEvents.splice(i,1));}
}))test('independent mapping stage audit refuses '+name,()=>{
 const f=configuredFixture();change(f);assert.throws(()=>auditJavascriptPersistence(f));
});
