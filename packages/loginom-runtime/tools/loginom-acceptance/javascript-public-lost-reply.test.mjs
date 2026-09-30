import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createNodeOperationRunner} from '../../client/lib/node-operation-runner.mjs';
import {nodeApiTools} from '../../client/lib/node-api.mjs';
import {runJavascriptPublicLostApplyReply} from './javascript-public-lost-reply.mjs';
const node={document_id:'doc',workflow_id:'workflow',node_id:'node'};
const request={operation_id:'lost',contract_revision:'1.0.0',document_id:'doc',
 workflow_ref:{workflow_id:'workflow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'navigation',label:'Workflow'}]},
 target:{kind:'existing',type:'programming.javascript',ref:node},inputs:[],mode:'script',parameters:{schema_mode:'code'},mappings:[],finish:'execute',
 read:{ports:[0],sample_rows:100,require_exact_numbers:true,coverage:'full'},budgets:{configure_ms:600000,execute_ms:60000,total_ms:660000}};
function fixture(fault) {
 const counts={apply:0,launch:0,stop:0,inspect:0},events=[],calls=[];
 const runner=createNodeOperationRunner({validate:()=> 'test',progress:()=>({node:fault==='owner'?{...node,node_id:'foreign'}:node,
  pending_phase:'materialization_execute',execution:{status:'pending',execution_id:'doc:root:1'}}),run:async(req,{stopSignal})=>{
  counts.launch++;if(!stopSignal.aborted)await new Promise(resolve=>stopSignal.addEventListener('abort',resolve,{once:true}));
  return {status:'FAILED',cleanup_complete:true,effect_possible:true,output:{status:'FAILED',cleanup_complete:true,node,configuration:{status:'applied'},
   execution:{status:'cancelled',execution_id:'doc:root:1',stop_verified:true},output:{status:'not_refreshed',ports:[]},checkpoint_kind:'local_node_stopped',
   error:{code:'NODE_EXECUTION_CANCELLED'},phases:[{phase:'materialization_execute',status:'verified'}]}};
 }});
 const runtime={tools:nodeApiTools,startNodeApply:req=>{counts.apply++;return runner.start(req);},nodeApplyStatus:id=>{
   calls.push('status');const job=runner.status(id);return fault==='status'?{...job,attempt:2}:job;},
  waitNodeApply:(id,{timeoutMs})=>runner.wait(id,{timeoutMs}),stopNodeApply:id=>{counts.stop++;return runner.stop(id);},
  inspect:async({operationId})=>{calls.push('inspect');if(runner.busy)throw Error('A background node operation is running');
   counts.inspect++;return {status:'SUCCEEDED',action_key:'operation.inspect',operation_id:operationId,
    output:{operation_id:fault==='inspect'?'foreign':operationId,cleanup_confirmed:fault!=='cleanup',
     outcome:fault==='outcome'?{status:'SUCCEEDED'}:runner.status(operationId).outcome}};}};
 const record=async event=>{events.push(event);return fault==='prepare_ack'&&event.phase==='javascript_public_reply_loss_prepared'
  ||fault==='drop_ack'&&event.phase==='javascript_public_apply_reply_dropped'
  ||fault==='status_ack'&&event.phase==='javascript_public_lost_reply_status_recovered'
  ||fault==='inspect_ack'&&event.phase==='javascript_public_lost_reply_inspected'?{}:event;};
 return {runtime,runner,record,counts,events,calls};
}
test('actual public runner loses caller apply reply, uses status, settles Stop, then inspects the same worker without replay',async()=>{
 const f=fixture(),result=await runJavascriptPublicLostApplyReply({runtime:f.runtime,request,node,record:f.record,onProgress:async()=>{},deadline:Date.now()+10000});
 assert.deepEqual(f.counts,{apply:1,launch:1,stop:1,inspect:1});assert.equal(result.job.attempt,1);
 assert.equal(result.execution_id,result.job.outcome.output.execution.execution_id);assert.equal(result.browser_receipt_dropped,false);
 assert.deepEqual(f.calls,['status','inspect']);assert.equal(f.runner.busy,false);
 assert.deepEqual(f.events.map(e=>e.phase),['javascript_public_reply_loss_prepared','javascript_public_apply_reply_dropped',
  'javascript_public_lost_reply_status_recovered','javascript_public_stop_prepared','javascript_public_stop_requested',
  'javascript_public_lost_reply_inspected']);
 assert.deepEqual(f.events.at(-1).terminal_job,result.job);
});
test('fixture enforces the observed runtime inspect busy guard before worker settlement',async()=>{
 const f=fixture();f.runtime.startNodeApply(request);assert.equal(f.runner.busy,true);
 await assert.rejects(f.runtime.inspect({operationId:request.operation_id}),/background node operation/);
 assert.equal(f.counts.inspect,0);f.runner.stop(request.operation_id);await f.runner.wait(request.operation_id,{timeoutMs:1000});
 assert.equal(f.runner.busy,false);await f.runtime.inspect({operationId:request.operation_id});assert.equal(f.counts.inspect,1);
});
for(const fault of ['prepare_ack','drop_ack','owner','status','status_ack','inspect','cleanup','outcome','inspect_ack'])test('controlled reply loss refuses '+fault+' without another apply/Execute/Stop',async()=>{
 const f=fixture(fault);await assert.rejects(runJavascriptPublicLostApplyReply({runtime:f.runtime,request,node,record:f.record,onProgress:async()=>{},deadline:Date.now()+10000}),/ACK differs|owner differs|another operation|status changed|settled original worker/);
 assert.equal(f.counts.apply,fault==='prepare_ack'?0:1);assert.equal(f.counts.launch,fault==='prepare_ack'?0:1);
 assert.equal(f.counts.stop,['inspect','cleanup','outcome','inspect_ack'].includes(fault)?1:0);
 if(f.runner.has('lost'))f.runner.stop('lost');
});
test('expired loss case never submits apply',async()=>{
 const f=fixture();await assert.rejects(runJavascriptPublicLostApplyReply({runtime:f.runtime,request,node,record:f.record,deadline:1}),/expired/);assert.equal(f.counts.apply,0);
});
const entry=fileURLToPath(new URL('./javascript-public-lost-reply-live.mjs',import.meta.url));
for(const args of [[],['--case','other'],['--case','lost-apply-execute-code','--source','foreign'],
 ['--case','lost-apply-execute-code','--headless','true'],['--case','lost-apply-execute-code','--x11-no-focus','true']])
test('public lost reply entrypoint refuses unassigned controls '+JSON.stringify(args),()=>{
 const result=spawnSync(process.execPath,[entry,...args],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/Fixed public lost reply|Only assigned public lost reply/);
});
