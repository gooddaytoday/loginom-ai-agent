import test from 'node:test';
import assert from 'node:assert/strict';
import {javascriptExecutionWaitContext} from '../lib/javascript-execution-continuation.mjs';
import {verifyExecutionReadWait} from '../lib/node-execution-evidence.mjs';
const node={document_id:'doc',workflow_id:'flow',node_id:'node'};
function fixture(phase='materialization_execute') {
 const execution={...node,node,execution_id:'doc:root:1',root_id:'root',group_id:'1',group_record_id:'group'};
 const progress_state={verified:true,source:'native_progress_record',state:'running',terminal:false,can_cancel:true};
 const native={verified:true,inventory_complete:true,show_completed:true,root_id:'root',node_context:{...node,verified:true,surface:'graph'},
  processes:[{process_id:'1',parent_id:null,record_id:'group',children_loaded:true,progress_state},
   {process_id:'1.1',parent_id:'1',record_id:'child',owner:{verified:true,node_id:'node',source:'native_process_model_identity'},progress_state}]};
 const expected={source_sha256:'a'.repeat(64),source_utf8_bytes:80,source_lf_lines:3},inputMapping={verified:true,fields:['input']},outputMapping={verified:true,fields:['output']};
 const request={operation_id:'op',document_id:'doc',workflow_ref:{workflow_id:'flow'}};
 const phases=['source','workflow','target','input_mapping','open','configure','node_finish','materialization_start',
  ...(phase==='execute'?['materialization_execute','output_mapping','finish']:[])].map(p=>({phase:p,receipt_id:'op:'+p,status:'verified',
   value:{verified:true,cleanup_complete:true,...(p==='input_mapping'?{native_mapping:inputMapping}:p==='output_mapping'?{native_mapping:outputMapping}:{}),
    ...(p==='node_finish'?{...expected,source_sha256:expected.source_sha256,source_readback_verified:true,wizard_commit_verified:true,owned_done_settled:true,settings_preserved:true}:{}),
    ...(p==='materialization_start'||p==='finish'?{execution_id:'doc:root:1'}:{})}}));
 const state={request,node,phases,cleanup_complete:true,deadline:1000,execution:{status:'pending',execution_id:'doc:root:1'},
  execution_wait:{phase,receipt_id:'op:'+phase,deadline:900,effect_possible:false,before_node:node,execution_id:'doc:root:1',read_only:true,cleanup_complete:true,
   native_execution:verifyExecutionReadWait(execution,native)}};
 const retained={operation:{id:'op',parameters:request,nodeApply:state,cleanupConfirmed:true},owner:{...node,operation_id:'op'},expected,
  configured:{effective_source:expected,settings_sha256:'b'.repeat(64)},committed:{owned_done_settled:true,graph_owner_verified:true},inputMapping,outputMapping,now:100};
 return {state,retained,execution,native};
}
for(const phase of ['materialization_execute','execute'])test('JS continuation admits only retained '+phase+' under its original deadline',()=>{
 const f=fixture(phase),ctx=javascriptExecutionWaitContext(f.state,f.retained);
 assert.equal(ctx.deadline,900);assert.deepEqual(ctx.node,node);assert.equal(ctx.execution.execution_id,'doc:root:1');
 for(const mutate of [s=>s.pending={phase},s=>s.result={},s=>s.cleanup_complete=false,s=>s.execution.status='cancelled',
  s=>s.execution_wait.phase='configure',s=>s.execution_wait.read_only=false,s=>s.execution_wait.effect_possible=true,
  s=>s.execution_wait.execution_id='foreign',s=>s.execution_wait.before_node={...node,node_id:'foreign'},
  s=>s.execution_wait.deadline=1001,s=>s.execution_wait.deadline=100,s=>s.execution_wait.native_execution=null,
  s=>s.phases.pop(),s=>s.phases[0].status='pending',s=>s.phases[0].receipt_id='foreign',
  s=>s.phases.find(p=>p.phase==='node_finish').value.source_sha256='foreign',
  s=>s.phases.find(p=>p.phase==='input_mapping').value.native_mapping={verified:true,fields:['foreign']}]){
  const bad=fixture(phase);mutate(bad.state);assert.equal(javascriptExecutionWaitContext(bad.state,bad.retained),null);
 }
 for(const mutate of [r=>r.operation.nodeApply=structuredClone(r.operation.nodeApply),r=>r.operation.transportUncertain=true,
  r=>r.operation.cleanupConfirmed=false,r=>r.owner.operation_id='foreign',r=>r.committed.owned_done_settled=false,
  r=>r.expected.source_sha256='foreign',r=>r.configured.settings_sha256=null,r=>r.inputMapping=null,
  ...(phase==='execute'?[r=>r.outputMapping=null]:[])]){
  const bad=fixture(phase);mutate(bad.retained);assert.equal(javascriptExecutionWaitContext(bad.state,bad.retained),null);
 }
});
test('native read wait accepts later completion but rejects foreign, replaced, cancelled or caption-only children',()=>{
 const f=fixture(),binding=verifyExecutionReadWait(f.execution,f.native);
 const completed=structuredClone(f.native);completed.processes.forEach(p=>p.progress_state={...p.progress_state,state:'completed',terminal:true,can_cancel:false});
 assert.deepEqual(verifyExecutionReadWait(f.execution,completed,binding),binding);
 for(const mutate of [s=>s.root_id='foreign',s=>s.inventory_complete=false,s=>s.node_context.surface='wizard',
  s=>s.processes[0].record_id='replaced',s=>s.processes[0].children_loaded=false,s=>s.processes[1].record_id='replaced',
  s=>s.processes[1].owner.node_id='foreign',s=>s.processes[1].owner.source='caption',
  s=>s.processes[1].progress_state.source='caption',s=>s.processes[1].progress_state.state='cancelled']){
  const bad=structuredClone(f.native);mutate(bad);assert.throws(()=>verifyExecutionReadWait(f.execution,bad,binding));
 }
});
