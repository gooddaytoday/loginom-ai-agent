import assert from 'node:assert/strict';
import test from 'node:test';
import {createStepRetry} from '../lib/step-retry.mjs';

const apply='dock_node_apply';
const save='dock_action_run';
const signal=new AbortController().signal;
function fixture() {
  const graph={document_id:'page',workflow_ref:{workflow_id:'workflow'},complete:true,interaction_ready:true,
    nodes:[{locked:false,label:'Импорт'}],links:[],foreign_links:[]};
  const window={status:'READY',document_id:'page',workflow_ref:graph.workflow_ref,graph,
    package_ref:{path:'/scenario.lgp'},modified:true};
  const receipts=new Map(),saves=new Map();
  let canProveNoWrite=false;
  const retry=createStepRetry({
    workspace:()=>({document_id:window.document_id,workflow_ref:window.workflow_ref}),observe:async()=>structuredClone(window),receipt:id=>receipts.get(id),
    unsettled:()=>[...receipts.values()].some(item=>item.status==='AMBIGUOUS'),
    busy:()=>false,confirmedSave:id=>saves.get(id),label:(_name,args)=>args.operation_id,
    settleUnapplied:async id=>{
      if(!canProveNoWrite)return false;
      receipts.set(id,{status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});
      return true;
    },
  });
  const finish=async(name,id,value)=>{
    const args={operation_id:id,...(name===save?{action_key:'package.save_checkpoint'}:{})};
    const admission=retry.admit(name,args);
    assert.ok(admission.step);
    receipts.set(id,value);
    const reply=await retry.finish(name,args,{content:[],structuredContent:{operation_id:id,...value}},admission.step,signal);
    return reply._meta.loginomStep.step;
  };
  return {retry,window,receipts,saves,finish,noWrite:()=>{canProveNoWrite=true;}};
}

test('lost write requires a read-only check and positive evidence before a fresh operation is admitted',async()=>{
  const f=fixture();
  const blocked=await f.finish(apply,'write',{status:'AMBIGUOUS',effect_possible:true,cleanup_complete:false});
  assert.equal(blocked.outcome,'check_required');
  assert.equal(blocked.retryAvailable,false);
  assert.equal(f.retry.admit(apply,{operation_id:'duplicate'}).blocked.operationId,'write');

  // The graph looks identical, but the original write is still unconfirmed.
  assert.equal((await f.retry.check('write',signal)).retryAvailable,false);
  f.noWrite();
  const checked=await f.retry.check('write',signal);
  assert.equal(checked.state,'observed');
  assert.equal(checked.step.outcome,'not_applied');
  assert.equal(checked.retryAvailable,true);
  assert.ok(f.retry.admit(apply,{operation_id:'replacement'}).step);
  assert.equal(f.retry.admit(apply,{operation_id:'write'}),undefined);
});

test('a manual edit is retained and distinguishes a known pre-write conflict from an unknown write',async()=>{
  const f=fixture();
  await f.finish(apply,'import',{status:'SUCCEEDED',effect_possible:true,cleanup_complete:true});
  f.window.graph.nodes[0].label='Переименован вручную';
  const meta=await f.finish(apply,'conflict',{status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true,
    error:{code:'NODE_GRAPH_CONFLICT'}});
  assert.equal(meta.reason,'graph_conflict');
  assert.equal(meta.retryAvailable,false);
  const checked=await f.retry.check('conflict',signal);
  assert.deepEqual(checked.lastConfirmedStep,{operationId:'import',label:'import'});
  assert.equal(checked.graphSinceLastConfirmedStep,'changed');
  assert.equal(checked.retryAvailable,true);
  assert.equal(f.window.graph.nodes[0].label,'Переименован вручную');
});

test('a clean refusal can be retried straight away and carries the last confirmed Save cutoff',async()=>{
  const f=fixture();
  const done=await f.finish(apply,'import',{status:'SUCCEEDED',effect_possible:true,cleanup_complete:true});
  assert.equal(done.persistence,'step_unsaved');
  assert.equal(done.save,null);
  f.window.modified=false;
  f.saves.set('save',{path:'/scenario.lgp'});
  await f.finish(save,'save',{status:'SUCCEEDED',effect_possible:true,cleanup_complete:true});
  const refused=await f.finish(apply,'refused',{status:'FAILED',effect_possible:false,cleanup_complete:true});
  assert.equal(refused.outcome,'not_applied');
  assert.equal(refused.retryAvailable,true);
  assert.equal(refused.persistence,'step_unsaved');
  assert.deepEqual(refused.save,{operationId:'save',path:'/scenario.lgp',throughStep:{operationId:'import',label:'import'}});
  f.window.workflow_ref={workflow_id:'another'};
  assert.deepEqual(await f.retry.check('refused',signal),{state:'unavailable',retryAvailable:false});
});

test('a lost reply later confirmed successful cannot be replayed',async()=>{
  const f=fixture();
  await f.finish(apply,'write',{status:'AMBIGUOUS',effect_possible:true,cleanup_complete:false});
  f.receipts.set('write',{status:'SUCCEEDED',effect_possible:true,cleanup_complete:true});
  f.window.graph.nodes.push({locked:false,label:'Добавленный узел'});
  const checked=await f.retry.check('write',signal);
  assert.equal(checked.step.outcome,'completed');
  assert.equal(checked.window.nodeCount,2);
  assert.equal(checked.retryAvailable,false);
  assert.equal(f.retry.admit(apply,{operation_id:'write'}),undefined);
  const replay=await f.retry.finish(apply,{operation_id:'write'},{content:[]},undefined,signal);
  assert.equal(replay._meta.loginomStep.step.outcome,'completed');
  assert.ok(f.retry.admit(apply,{operation_id:'next'}).step);
});

test('a mismatched Save receipt is not proof that nothing was written',async()=>{
  const f=fixture();
  const meta=await f.finish(save,'save',{status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true,
    error:{code:'SAVE_RESULT_MISMATCH'}});
  assert.equal(meta.outcome,'check_required');
  assert.equal(meta.reason,'partial_effect');
  const checked=await f.retry.check('save',signal);
  assert.equal(checked.step.outcome,'check_required');
  assert.equal(checked.retryAvailable,false);
});
