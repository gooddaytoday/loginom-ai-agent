import test from 'node:test';
import assert from 'node:assert/strict';
import {compactNodeResult} from '../lib/user-results.mjs';

const failure=()=>({operation_id:'rank-debts',state:'settled',outcome:{status:'NOT_APPLIED',action_key:'node.apply',
 effect_possible:false,cleanup_complete:true,error:{code:'NODE_APPLY_STOPPED',message:'sorting preflight requires an active source output'},
 output:{node:null,execution:{status:'not_requested',execution_id:null},output:{status:'not_refreshed',ports:[]},package_saved:false}}});

test('settled inactive-source sorting refusal explains activation before a new sorting attempt',()=>{
 const raw=failure(),before=structuredClone(raw),reply=compactNodeResult(raw);
 assert.equal(reply.status,'NOT_APPLIED');assert.equal(reply.node,null);assert.equal(reply.effect_possible,false);
 assert.equal(reply.cleanup_complete,true);assert.equal(reply.next_step.tool,'dock_node_apply');
 assert.equal(reply.next_step.original_operation_id,'rank-debts');
 for(const text of ['No sorting node was created','inputs[].source','dock_node_read','source_operation_id','existing ref','parameter_schema','finish:"execute"','NEW operation_id','outside the user request'])
  assert.ok(reply.next_step.instruction.includes(text),text);
 assert.equal(reply.next_step.arguments,undefined);assert.deepEqual(raw,before);
});

test('source activation advice never overrides uncertainty, incomplete cleanup or an explicit next step',()=>{
 for(const patch of [{status:'AMBIGUOUS',effect_possible:true},{status:'FAILED',effect_possible:true},{cleanup_complete:false}]){
  const raw=failure();Object.assign(raw.outcome,patch);
  const reply=compactNodeResult(raw);
  assert.equal(reply.next_step.tool,'dock_operation_inspect');
  assert.doesNotMatch(reply.next_step.instruction,/First execute/);
 }
 const raw=failure(),next={tool:'dock_operation_inspect',arguments:{operation_id:'original'},instruction:'Keep the original effect.'};
 raw.outcome.next_step=next;assert.deepEqual(compactNodeResult(raw).next_step,next);
 delete raw.outcome.next_step;raw.outcome.status='SUCCEEDED';raw.outcome.error=null;
 assert.equal(compactNodeResult(raw).next_step,undefined);
});
