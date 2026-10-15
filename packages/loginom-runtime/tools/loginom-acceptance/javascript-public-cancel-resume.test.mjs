import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createNodeOperationRunner} from '../../client/lib/node-operation-runner.mjs';
import {nodeApiTools} from '../../client/lib/node-api.mjs';
import {verifyExecutionReadWait} from '../../client/lib/node-execution-evidence.mjs';
import {createJavascriptPublicCancelResume} from './javascript-public-cancel-resume.mjs';
const node={document_id:'doc',workflow_id:'workflow',node_id:'node'};
const request={operation_id:'cancel',contract_revision:'1.0.0',document_id:'doc',
 workflow_ref:{workflow_id:'workflow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'navigation',label:'Workflow'}]},
 target:{kind:'existing',type:'programming.javascript',ref:node},inputs:[],mode:'script',parameters:{schema_mode:'code'},mappings:[],finish:'execute',
 read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},budgets:{configure_ms:600000,execute_ms:60000,total_ms:660000}};
async function fixture(fault) {
 const deadline=Date.now()+10000,events=[],counts={launch:0,read_resume:0,cancel:0,stop:0,resume:0};
 let probe,pending_phase='materialization_execute';
 const progress=()=>({node,pending_phase,execution:{status:'pending',execution_id:'doc:root:1'}});
 const progress_state={verified:true,source:'native_progress_record',state:'running'};
 const inventory={verified:true,inventory_complete:true,show_completed:true,root_id:'root',node_context:{...node,verified:true,surface:'graph'},
  processes:[{process_id:'1',parent_id:null,record_id:'group',children_loaded:true,progress_state},
   {process_id:'1.1',parent_id:'1',record_id:'child',owner:{verified:true,node_id:'node',source:'native_process_model_identity'},progress_state}]};
 const native=verifyExecutionReadWait({node,execution_id:'doc:root:1',root_id:'root',group_id:'1',group_record_id:'group'},inventory);
 const emit=async event=>{events.push(structuredClone(event));await probe.observe(event);return event;};
 const runner=createNodeOperationRunner({validate:()=> 'test',progress,admitResume:()=>{},run:async(req,{signal,stopSignal,resume})=>{
  await Promise.resolve();
  if(!resume){
   counts.launch++;
   await emit({phase:'node_phase_prepared',operation_id:req.operation_id,receipt:{phase:'materialization_execute',deadline}});
   await emit({phase:'node_observation_sample',operation_id:req.operation_id,internal_operation_id:'cancel:n10',step:10,
    readiness:{condition:'new node execution completed',satisfied:false},outcome:{output:{node_processes:inventory}}});
   assert.equal(signal.aborted,true);assert.equal(stopSignal.aborted,false);pending_phase=null;
   await emit({phase:'node_phase_paused',operation_id:req.operation_id,receipt:{phase:'materialization_execute',deadline,read_only:true,cleanup_complete:true,
    effect_possible:false,execution_id:'doc:root:1',native_execution:fault==='foreign_pause'?{...native,process_record_id:'foreign'}:native}});
   return {status:'AMBIGUOUS',cleanup_complete:true,effect_possible:true,output:{execution:progress().execution}};
  }
  counts.read_resume++;pending_phase='materialization_execute';
  await emit({phase:'node_phase_prepared',operation_id:req.operation_id,receipt:{phase:'materialization_execute',deadline:deadline+(fault==='deadline'?1:0)}});
  if(!stopSignal.aborted)await new Promise(resolve=>stopSignal.addEventListener('abort',resolve,{once:true}));
  return {status:'FAILED',cleanup_complete:true,effect_possible:true,output:{status:'FAILED',cleanup_complete:true,node,configuration:{status:'applied'},
   execution:{status:'cancelled',execution_id:'doc:root:1',stop_verified:true},output:{status:'not_refreshed',ports:[]},checkpoint_kind:'local_node_stopped',
   error:{code:'NODE_EXECUTION_CANCELLED'},phases:[{phase:'materialization_execute',status:'verified'}]}};
 }});
 const runtime={tools:nodeApiTools,startNodeApply:(req,options)=>{
   if(options?.resume)counts.resume++;
   const result=runner.start(req,options);
   if(options?.resume&&fault==='resume_reply')throw Error('lost resume reply');return result;
  },nodeApplyStatus:id=>runner.status(id),
  waitNodeApply:(id,{timeoutMs})=>runner.wait(id,{timeoutMs}),cancelNodeApply:id=>{counts.cancel++;return runner.cancel(id);},
  inspect:async()=>({output:{cleanup_confirmed:true,internal_resume_available:fault!=='inspect'}}),
  stopNodeApply:id=>{counts.stop++;return runner.stop(id);}};
 probe=createJavascriptPublicCancelResume({runtime,node,record:async event=>{events.push(event);return fault==='prepared_ack'&&event.phase==='javascript_public_local_cancel_prepared'?{}:event;}});
 return {probe,runner,counts,events,deadline};
}
test('actual public operation runner cancels its read, joins same-ID retry and resumes without a new launch before Stop',async()=>{
 const f=await fixture(),result=await f.probe.run({request,onProgress:async()=>{},deadline:f.deadline});
 assert.deepEqual(f.counts,{launch:1,read_resume:1,cancel:1,stop:1,resume:1});
 assert.equal(result.paused_job.cancel_requested,true);assert.equal(result.paused_job.server_stop_requested,false);
 assert.deepEqual(result.retry_job,result.paused_job);assert.equal(result.job.attempt,2);
 assert.equal(result.job.outcome.output.execution.execution_id,result.native_execution.execution_id);
 assert.equal(result.original_wait_deadline,f.deadline);
 assert.equal(f.events.filter(e=>e.phase==='javascript_public_local_cancel_prepared').length,1);
 assert.equal(f.events.filter(e=>e.phase==='javascript_public_same_id_resume_prepared').length,1);
});
for(const fault of ['prepared_ack','foreign_pause','inspect','deadline','resume_reply'])test('public cancel/resume refuses '+fault+' without another cancellation, resume or Stop',async()=>{
 const f=await fixture(fault);
 await assert.rejects(f.probe.run({request,onProgress:async()=>{},deadline:f.deadline}),/ACK differs|checkpoint|inspection|Stop terminal|lost resume reply/);
 assert.ok(f.counts.launch<=1);assert.ok(f.counts.cancel<=1);assert.ok(f.counts.resume<=1);assert.equal(f.counts.stop,0);
 if(f.runner.status('cancel').state==='running')f.runner.stop('cancel');
});
const entry=fileURLToPath(new URL('./javascript-public-cancel-resume-live.mjs',import.meta.url));
for(const args of [[],['--case','other'],['--case','cancel-resume-code','--source','foreign'],
 ['--case','cancel-resume-code','--headless','true'],['--case','cancel-resume-code','--x11-no-focus','true']])
test('public cancel/resume entrypoint refuses unassigned controls '+JSON.stringify(args),()=>{
 const result=spawnSync(process.execPath,[entry,...args],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/Fixed public cancel\/resume|Only assigned public cancel\/resume/);
});
