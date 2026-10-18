import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {releaseRefusedExportRead,readNativeExportFile} from '../lib/text-export-output.mjs';
import {storageTidSuffix} from '../lib/storage-policy.mjs';
import {verifiedExportReadRefusal} from '../lib/native-read-refusal.mjs';
import {nodeJobResultSchema} from '../lib/node-result-schema.mjs';
import {Page,runtime} from './support/executor-fixture.mjs';

const node={document_id:'doc',workflow_id:'wf',node_id:'export'};
const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const binding={...node,session_id:'session',destination:'/user/result.csv',execution_id:'exec'};
const download=()=>({operation_id:'export-op:export-download',action_key:'artifact.download',phase:'requesting',
 status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true,error:{code:'DOWNLOAD_GESTURE_NOT_CONFIRMED'},
 trace:[{event:'download_gesture_result',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true,error_code:'UI_EPOCH_CHANGED'}]});
const restored=()=>({verified:true,cleanup_complete:true,quiet:true,node_context:{...node,verified:true,surface:'graph',locked:false}});
async function refusal({returnProof=restored(),release=async()=>{},record=async()=>{}}={}){
 return releaseRefusedExportRead({operationId:'export-op',binding:structuredClone(binding),navigationOnly:true,restore:async()=>returnProof,release,record});
}

test('read-only export refusal restores its graph and releases only the temporary lease',async()=>{
 const calls=[];
 const value=await releaseRefusedExportRead({operationId:'export-op',binding,navigationOnly:true,
  restore:async()=>{calls.push('restore');return restored();},release:async()=>{calls.push('release');},
  record:async(phase,data)=>{calls.push(phase);assert.equal(data.proof.lease_released,true);}});
 assert.deepEqual(calls,['restore','release','export_file_read_refused_restored']);
 assert.equal(verifiedExportReadRefusal(value,node,{status:'completed',execution_id:'exec'},'export-op'),true);
 assert.equal(value.status,'FAILED');assert.equal(value.effect_possible,true);
 assert.equal(value.proof.navigation_only,true);assert.equal(value.proof.download,undefined);
});
for(const navigationOnly of [false,undefined,'unknown'])test('unknown or mutating read does not release: '+navigationOnly,async()=>{
 const value=await releaseRefusedExportRead({operationId:'export-op',binding,navigationOnly,
  restore:async()=>assert.fail('retain pending read'),release:async()=>assert.fail('retain lease'),record:async()=>assert.fail('no proof')});
 assert.equal(value,null);
});

for(const [name,change] of [
 ['foreign graph',r=>{r.node_context.node_id='other';}],['locked node',r=>{r.node_context.locked=true;}],
 ['non-graph surface',r=>{r.node_context.surface='files';}],['unsettled UI',r=>{r.quiet=false;}],
])test('export refusal retains its lease without '+name+' proof',async()=>{
 const r=restored();change(r);
 await assert.rejects(refusal({returnProof:r,release:async()=>assert.fail('no release')}),/quiet owned graph/);
});
for(const failure of ['release','record'])test('export refusal cannot settle after failed '+failure,async()=>{
 await assert.rejects(refusal({[failure]:async()=>{throw Error(failure+' failed');}}),new RegExp(failure+' failed'));
});

async function stoppedExport(proof,options={}){
 const page=new Page();page.addNode('Export',104,104,[]);
 let operation;
 const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref:node,type:'exports.text',label:'Export',position:{x:104,y:104},inputs:[],outputs:[]}],links:[],foreign_links:[]};
 const ok=async()=>({verified:true,cleanup_complete:true,effect_possible:false});
 const f=runtime(page,{onRecord:async e=>e,nodeTargetAdapterFactory:()=>({observe:async()=>structuredClone(graph),preflight:ok,positionMatches:()=>true}),
  nodeApplyHandlers:new Map([['exports.text',{revision:'1',modes:['delimited'],fileOutput:true,validate:()=>{},configure:ok}]]),
  nodeApplyDriverFactory:({operation:op})=>{operation=op;return {verifyContinuation:async()=>true,verifySource:ok,mapPorts:ok,openWizard:ok,
   finish:async mode=>({verified:true,cleanup_complete:true,mode,execution_id:'exec',execution_started:true}),
   waitExecution:async()=>({verified:true,cleanup_complete:true,status:'completed',execution_id:'exec'}),
   readOutput:async()=>{op.cleanupConfirmed=options.cleanup!==false;op.transportUncertain=options.uncertain===true;
    throw Object.assign(Error('Native export download unconfirmed'),{nodePhaseRefusal:proof});}};}});
 f.startNodeApply({operation_id:'export-op',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
  target:{kind:'existing',type:'exports.text',ref:node},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'execute',
  read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
 const job=await f.waitNodeApply('export-op',{timeoutMs:1000});
 assert.ok(job.outcome,JSON.stringify(job));
 const validation=new AjvJsonSchemaValidator().getValidator(nodeJobResultSchema)(job);
 assert.equal(validation.valid,true,validation.errorMessage);
 return {f,page,operation,job};
}

test('settled export download refusal admits a real save without retrying download or export',async()=>{
 const {f,page,operation,job}=await stoppedExport(await refusal());
 assert.equal(job.outcome.status,'FAILED',JSON.stringify(job));
 assert.equal(job.outcome.output.pending_phase,null);assert.equal(job.outcome.cleanup_complete,true);
 assert.equal(job.outcome.output.next_step.tool,'dock_action_run');
 assert.match(job.outcome.output.next_step.instruction,/package.save_checkpoint[\s\S]*NEW operation_id/);
 assert.match(job.outcome.output.next_step.instruction,/download as unconfirmed/);
 assert.deepEqual(job.outcome.output.output,{status:'not_refreshed',evidence_ref:null,ports:[]});
 assert.equal(operation.nodeApply.pending,null);assert.equal(f.hasUnsettledWork(),false);
 const saved=await f.run('package.save_checkpoint',{path:'/user/data/packages/saved-export.lgp',conflict_policy:'fail'},{operationId:'save-after-refusal'});
 assert.equal(saved.status,'SUCCEEDED',JSON.stringify(saved));assert.equal(saved.output.save_completed,true);
 assert.equal(page.packagePath,'/user/data/packages/saved-export.lgp');assert.equal(page.storage.has('/user/data/packages/saved-export.lgp'),true);
});

for(const fault of ['binding','execution','lease','restore','cleanup','transport','mutation','operation'])test('a forged or uncertain export refusal still blocks saving: '+fault,async()=>{
 const p=await refusal();
 if(fault==='binding')p.proof.binding.node_id='foreign';
 if(fault==='execution')p.proof.binding.execution_id='old';
 if(fault==='lease')p.proof.lease_released=false;
 if(fault==='mutation')p.proof.navigation_only=false;
 if(fault==='operation')p.proof.operation_id='other';
 if(fault==='restore')p.proof.restored.node_context.workflow_id='other';
 const {f,job,page}=await stoppedExport(p,{cleanup:fault!=='cleanup',uncertain:fault==='transport'});
 assert.equal(job.outcome.status,'AMBIGUOUS');assert.equal(job.outcome.output.pending_phase,'read');
 const saved=await f.run('package.save_checkpoint',{path:'/user/unsafe.lgp',conflict_policy:'fail'},{operationId:'unsafe-save'});
 assert.equal(saved.operation_id,'export-op');assert.equal(saved.status,'AMBIGUOUS');assert.equal(page.storage.size,0);
});

for(const kind of ['success','download_refusal','ambiguous_download','download_transport','open_files','root_stale',
 'return_tab_observation','download_select','directory_navigation','storage_scroll','unknown_scroll','unclean_scroll','changed_scroll','scroll_unobserved','foreign_storage',
 'mutating','unknown_gesture','foreign_graph','locked_graph','graph_dialog','changed_workflow','journal_failure','lease_failure'])test('native export read and real save: '+kind,async()=>{
 const success=kind==='success',storage=kind.includes('scroll')||kind==='foreign_storage';
 const blocked=['mutating','unknown_gesture','foreign_graph','locked_graph','graph_dialog','changed_workflow','journal_failure','lease_failure'].includes(kind);
 let files=false,downloads=0,releases=0,retained=0,failed=false;const gestures=[],records=[];
 let scrollTop=0,observationFailed=false,directory=kind==='directory_navigation'?'/':'/user';
 const filesWorkflow={workflow_id:'files',prefix:'MF;TF-2',tab_tid:'files-tab'},targetOrigin='https://loginom.invalid';
 const element=(tid,ref=tid,extra={})=>({tid,ref:'ui-'+ref.replace(/[^a-zA-Z0-9-]/g,'-'),allowed_actions:['click'],...extra});
 const snapshot=()=>({authenticated:true,origin:targetOrigin,loginom_build:'7.4',dom_epoch:{document:'browser',revision:1},
  workflow_ref:files?{...filesWorkflow,...(failed&&kind==='foreign_storage'?{prefix:'foreign'}:{})}:
   {...workflow,...(failed&&kind==='changed_workflow'?{workflow_id:'other'}:{})},wizard:{status:'absent'},
  ui:{dialogs:!files&&failed&&kind==='graph_dialog'?[{kind:'unknown'}]:[],masks:[],elements:[
   element('MF;cntMain;tlbMainToolbar'),element('MF;cntMain;tlbMainToolbar;btnFilestorage'),
   element('MF;cntMain;cntWorkspace;Workspace;t.br'),element(workflow.tab_tid),element('files-tab'),
   element('MF;TF-2;NavigationBar;NavigationPanel'),element('MF;TF-2;FileStorageForm;btnRefresh'),
   element('MF;TF-2;FileStorageForm;pnlFileStorage;tbl','file-table'),
   ...(kind==='directory_navigation'?[element('MF;TF-2;FileStorageForm;colName_'+storageTidSuffix('user'),'folder',{label:'user',storage_entry:{kind:'folder'},allowed_actions:['double_click']})]:[]),
   ...(storage?[element('MF;TF-2;FileStorageForm;colName_other','other',{label:'other',interaction:{state:'point_observed'},
    scroll:{ref:'ui-scroll-owner',top:kind==='changed_scroll'?999:scrollTop,max_top:3000},allowed_actions:['scroll']})]
    :[element('MF;TF-2;FileStorageForm;colName_'+storageTidSuffix('result.csv'),'csv',{label:'result.csv',storage_entry:{bytes:57},allowed_actions:['click','double_click']})])]},
  file_storage:files?{status:'observed',directory}:undefined});
 const options={operation:{id:'export-op'},targetOrigin,targetBuild:'7.4',storageDirectories:{packages:'/user',inputs:'/user',exports:'/user'},
  onRecord:async e=>{records.push(e);if(kind==='journal_failure'&&e.phase==='export_file_read_refused_restored')throw Error('journal unavailable');return e;},receiptOptions:()=>({}),
  artifactStore:{outputSessionId:'session',stageOutput:async b=>{assert.deepEqual(b,binding);return {artifact_id:'artifact',path:'/private/download.csv',
   release:async()=>{if(kind==='lease_failure')throw Error('lease unavailable');releases++;},retain:async()=>{assert.ok(success);retained++;},
   verify:async()=>{assert.ok(success);return {artifact_id:'artifact',bytes:57,sha256:'abc'};}};}},
  execute:async code=>{
   if(code.includes('async function browserArtifactDownload')){
    downloads++;if(kind==='download_transport'){failed=true;throw Error('download call unconfirmed');}
    if(success)return {operation_id:'export-op:export-download',action_key:'artifact.download',status:'SUCCEEDED',cleanup_complete:true,
     output:{destination:binding.destination,artifact_id:'artifact',download_completed:true,output_binding:binding,suggested_name:'result.csv'}};
    failed=true;const d=download();if(['ambiguous_download','download_select'].includes(kind)){d.status='AMBIGUOUS';d.effect_possible=true;d.cleanup_complete=false;}
    if(kind==='download_select'){d.phase='selecting';d.error.code='UI_SCAN_LIMIT';}
    return d;
   }
   if(code.startsWith('async page=>('))return files?{verified:false,reason:'tab'}:
    {...node,...(failed&&kind==='foreign_graph'?{node_id:'other'}:{}),verified:true,surface:'graph',locked:failed&&kind==='locked_graph'};
   const match=code.match(/\)\(page, (\{"mode":[\s\S]*?\}), (?:async )?function readPreparedNodeContext/);
   assert.ok(match,'known native observation or gesture');const task=JSON.parse(match[1]);
   if(task.mode==='act'){
    const tid=task.snapshot.ui.elements.find(e=>e.ref===task.action.ref).tid;gestures.push(tid);
    if(tid.endsWith('btnFilestorage')){
     files=true;
     if(['open_files','mutating','unknown_gesture'].includes(kind)){
      failed=true;return {status:'AMBIGUOUS',action_key:kind==='mutating'?'file.delete':kind==='unknown_gesture'?'unknown':'ui.act',
       phase:'observing',effect_possible:true,cleanup_complete:false,error:{code:'UI_SCAN_LIMIT'}};
     }
    }
    if(task.action.verb==='double_click'&&kind==='directory_navigation'){directory='/user';failed=true;return {status:'AMBIGUOUS',action_key:'ui.act',cleanup_complete:false,error:{code:'UI_SCAN_LIMIT'}};}
    if(task.action.verb==='scroll'){
     assert.equal(failed,false,'never repeat failed navigation');failed=true;scrollTop=1000;
     if(kind==='scroll_unobserved')return {status:'SUCCEEDED',cleanup_complete:true};
     return {status:'AMBIGUOUS',action_key:'ui.act',phase:'observing',effect_possible:true,cleanup_complete:kind!=='unclean_scroll',
      error:{code:'UI_SCAN_LIMIT'},trace:kind==='unknown_scroll'?[]:[{event:'ui_scroll_applied',from:0,to:1000,owner_ref:'ui-scroll-owner'}]};
    }
    if(tid===workflow.tab_tid){files=false;if(kind==='return_tab_observation')return {status:'AMBIGUOUS',action_key:'ui.act',cleanup_complete:false,error:{code:'UI_SCAN_LIMIT'}};}
    return {status:'SUCCEEDED',effect_possible:true,cleanup_complete:true};
   }
   if(files&&!failed&&kind==='root_stale'){failed=true;return {status:'FAILED',error:{code:'UI_ROOT_STALE'}};}
   if(files&&failed&&kind==='scroll_unobserved'&&!observationFailed){observationFailed=true;throw Error('Export scroll outcome is not freshly observed');}
   return {status:'SUCCEEDED',output:snapshot()};
  }};
 const ctx={...node,node,workflow_ref:workflow,execution:{status:'completed',execution_id:'exec'},deadline:Date.now()+10000};
 const result=await readNativeExportFile(options,ctx,{destination:'/user/result.csv',configured:{destination_check:{verified:true,destination:'/user/result.csv',existed:false}}},
  {verified:true,owner_verified:true,status:'completed',execution_id:'exec'}).catch(e=>e);
 if(success){assert.equal(result.artifact_id,'artifact',String(result.stack));assert.equal(retained,1);assert.equal(releases,0);}
 else if(blocked){assert.ok(result instanceof Error);assert.equal(result.nodePhaseRefusal,undefined);assert.equal(retained,0);
  if(['mutating','unknown_gesture'].includes(kind)){assert.equal(releases,0);assert.equal(gestures.includes(workflow.tab_tid),false);}
  const stopped=await stoppedExport(result.nodePhaseRefusal);assert.equal(stopped.job.outcome.status,'AMBIGUOUS');assert.equal(stopped.job.outcome.output.pending_phase,'read');
  const saved=await stopped.f.run('package.save_checkpoint',{path:'/user/unsafe.lgp',conflict_policy:'fail'},{operationId:'unsafe-save'});
  assert.equal(saved.status,'AMBIGUOUS');assert.equal(stopped.page.storage.size,0);}
 else{
  assert.ok(result.nodePhaseRefusal,String(result.stack));assert.equal(verifiedExportReadRefusal(result.nodePhaseRefusal,node,ctx.execution,'export-op'),true);
  assert.equal(files,false);assert.equal(releases,1);assert.equal(retained,0);
  const {f,job,page}=await stoppedExport(result.nodePhaseRefusal);
  assert.equal(job.outcome.status,'FAILED');assert.equal(job.outcome.output.pending_phase,null);assert.equal(f.hasUnsettledWork(),false);
  assert.match(job.outcome.output.next_step.instruction,/package.save_checkpoint[\s\S]*download as unconfirmed/);
  const saved=await f.run('package.save_checkpoint',{path:'/user/data/packages/read-refusal.lgp',conflict_policy:'fail'},{operationId:'save-read-refusal'});
  assert.equal(saved.status,'SUCCEEDED',JSON.stringify(saved));assert.equal(page.packagePath,'/user/data/packages/read-refusal.lgp');
 }
 assert.equal(records.some(r=>r.phase==='export_file_read_refused_restored'),!success&&!['mutating','unknown_gesture','foreign_graph','locked_graph','graph_dialog','changed_workflow','lease_failure'].includes(kind));
 assert.equal(records.some(r=>r.phase==='export_file_bytes_verified'),success);
 assert.equal(records.some(r=>r.phase==='export_file_read_completed'),success);
});
