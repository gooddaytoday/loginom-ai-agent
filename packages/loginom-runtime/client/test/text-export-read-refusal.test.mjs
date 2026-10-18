import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {releaseRefusedExportDownload,readNativeExportFile} from '../lib/text-export-output.mjs';
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
async function refusal({downloaded=download(),returnProof=restored(),release=async()=>{},record=async()=>{}}={}){
 return releaseRefusedExportDownload({downloaded,id:'export-op:export-download',binding:structuredClone(binding),restore:async()=>returnProof,release,record});
}

test('the observed pre-gesture export refusal restores the graph and releases only its temporary lease',async()=>{
 const calls=[];
 const value=await releaseRefusedExportDownload({downloaded:download(),id:'export-op:export-download',binding,
  restore:async()=>{calls.push('restore');return restored();},release:async()=>{calls.push('release');},
  record:async(phase,data)=>{calls.push(phase);assert.equal(data.proof.lease_released,true);}});
 assert.deepEqual(calls,['restore','release','export_file_download_refused_restored']);
 assert.equal(verifiedExportReadRefusal(value,node,{status:'completed',execution_id:'exec'},'export-op'),true);
 assert.equal(value.status,'FAILED');assert.equal(value.effect_possible,true);
 assert.equal(value.proof.download.effect_possible,false);assert.equal(value.proof.download.status,'NOT_APPLIED');
 assert.equal(value.proof.download.download_completed,undefined);
});

for(const [name,change] of [
 ['possible gesture',d=>{d.effect_possible=true;}],['unsettled cleanup',d=>{d.cleanup_complete=false;}],
 ['unknown gesture',d=>{d.trace[0].status='AMBIGUOUS';}],['foreign operation',d=>{d.operation_id='other';}],
 ['other refusal',d=>{d.error.code='DOWNLOAD_EVENT_UNCONFIRMED';}],['no gesture receipt',d=>{d.trace=[];}],
])test('export refusal does not navigate or release after '+name,async()=>{
 const d=download();change(d);
 const value=await releaseRefusedExportDownload({downloaded:d,id:'export-op:export-download',binding,
  restore:async()=>assert.fail('must retain pending read'),release:async()=>assert.fail('must retain output lease'),record:async()=>assert.fail('no settled proof')});
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

for(const fault of ['binding','execution','lease','restore','cleanup','transport'])test('a forged or uncertain export refusal still blocks saving: '+fault,async()=>{
 const p=await refusal();
 if(fault==='binding')p.proof.binding.node_id='foreign';
 if(fault==='execution')p.proof.binding.execution_id='old';
 if(fault==='lease')p.proof.lease_released=false;
 if(fault==='restore')p.proof.restored.node_context.workflow_id='other';
 const {f,job,page}=await stoppedExport(p,{cleanup:fault!=='cleanup',uncertain:fault==='transport'});
 assert.equal(job.outcome.status,'AMBIGUOUS');assert.equal(job.outcome.output.pending_phase,'read');
 const saved=await f.run('package.save_checkpoint',{path:'/user/unsafe.lgp',conflict_policy:'fail'},{operationId:'unsafe-save'});
 assert.equal(saved.operation_id,'export-op');assert.equal(saved.status,'AMBIGUOUS');assert.equal(page.storage.size,0);
});

for(const success of [false,true])test('native export read returns from Files after '+(success?'confirmed download':'the observed refusal without claiming bytes'),async()=>{
 let files=false,downloads=0,releases=0,retained=0;const gestures=[],records=[];
 const filesWorkflow={workflow_id:'files',prefix:'MF;TF-2',tab_tid:'files-tab'},targetOrigin='https://loginom.invalid';
 const element=(tid,ref=tid,extra={})=>({tid,ref:'ui-'+ref.replace(/[^a-zA-Z0-9-]/g,'-'),allowed_actions:['click'],...extra});
 const snapshot=()=>({authenticated:true,origin:targetOrigin,loginom_build:'7.4',dom_epoch:{document:'browser',revision:1},
  workflow_ref:files?filesWorkflow:workflow,ui:{dialogs:[],masks:[],elements:[
   element('MF;cntMain;tlbMainToolbar'),element('MF;cntMain;tlbMainToolbar;btnFilestorage'),
   element('MF;cntMain;cntWorkspace;Workspace;t.br'),element(workflow.tab_tid),element('files-tab'),
   element('MF;TF-2;NavigationBar;NavigationPanel'),element('MF;TF-2;FileStorageForm;btnRefresh'),
   element('MF;TF-2;FileStorageForm;colName_'+storageTidSuffix('result.csv'),'csv',{label:'result.csv',storage_entry:{bytes:57},allowed_actions:['click','double_click']})]},
  file_storage:files?{status:'observed',directory:'/user'}:undefined});
 const options={operation:{id:'export-op'},targetOrigin,targetBuild:'7.4',storageDirectories:{packages:'/user',inputs:'/user',exports:'/user'},
  onRecord:async e=>{records.push(e);return e;},receiptOptions:()=>({}),
  artifactStore:{outputSessionId:'session',stageOutput:async b=>{assert.deepEqual(b,binding);return {artifact_id:'artifact',path:'/private/download.csv',
   release:async()=>{releases++;},retain:async()=>{assert.ok(success);retained++;},verify:async()=>{assert.ok(success);return {artifact_id:'artifact',bytes:57,sha256:'abc'};}};}},
  execute:async code=>{
   if(code.includes('async function browserArtifactDownload')){downloads++;return success?{status:'SUCCEEDED',cleanup_complete:true,
    output:{destination:binding.destination,artifact_id:'artifact',download_completed:true,output_binding:binding,suggested_name:'result.csv'}}:download();}
   if(code.startsWith('async page=>('))return {...node,verified:true,surface:'graph',locked:false};
   const match=code.match(/\)\(page, (\{"mode":[\s\S]*?\}), (?:async )?function readPreparedNodeContext/);
   assert.ok(match,'known native observation or gesture');const task=JSON.parse(match[1]);
   if(task.mode==='act'){
    const tid=task.snapshot.ui.elements.find(e=>e.ref===task.action.ref).tid;gestures.push(tid);
    if(tid.endsWith('btnFilestorage'))files=true;
    if(tid===workflow.tab_tid)files=false;
    return {status:'SUCCEEDED',effect_possible:true,cleanup_complete:true};
   }
   return {status:'SUCCEEDED',output:snapshot()};
  }};
 const ctx={...node,node,workflow_ref:workflow,execution:{status:'completed',execution_id:'exec'},deadline:Date.now()+10000};
 const result=await readNativeExportFile(options,ctx,{destination:'/user/result.csv',configured:{destination_check:{verified:true,destination:'/user/result.csv',existed:false}}},
  {verified:true,owner_verified:true,status:'completed',execution_id:'exec'}).catch(e=>e);
 if(success){assert.equal(result.artifact_id,'artifact',String(result.stack));assert.equal(retained,1);}
 else{assert.ok(result.nodePhaseRefusal,String(result.stack));assert.equal(verifiedExportReadRefusal(result.nodePhaseRefusal,node,ctx.execution,'export-op'),true);}
 assert.equal(downloads,1);assert.equal(releases,success?0:1);assert.equal(files,false);
 assert.deepEqual(gestures,['MF;cntMain;tlbMainToolbar;btnFilestorage','MF;TF-2;FileStorageForm;btnRefresh',workflow.tab_tid]);
 assert.equal(records.some(r=>r.phase==='export_file_download_refused_restored'),!success);
 assert.equal(records.some(r=>r.phase==='export_file_bytes_verified'),success);
 assert.equal(records.some(r=>r.phase==='export_file_read_completed'),success);
});
