import test from 'node:test';
import assert from 'node:assert/strict';
import {NodeReleaseBlocked} from '../lib/node-pending-release.mjs';
import {fixture,request,stop} from './support/stopped-node-fixture.mjs';
import {proved} from './support/stopped-node-fixture.mjs';
import {browserRecoveryStepKey} from '../lib/browser-recovery-basis.mjs';
import {actions,Page,runtime} from './support/executor-fixture.mjs';

const full={remaining:()=>({calls_remaining:30,ms_remaining:600000})};
const refuse=()=>{throw new NodeReleaseBlocked('A Loginom wizard of another node is open','Ask the user to close it with Cancel.');};

test('refused release offers browser recovery instead of a user action when enabled',async()=>{
  const f=fixture({release:refuse,browserRecovery:full});await stop(f,'finish');
  const refused=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  assert.equal(refused.error.code,'NODE_RELEASE_REFUSED');
  assert.equal(refused.output.user_action,undefined);
  assert.deepEqual(refused.output.browser_recovery.next_step.arguments,{action:'start',operation_id:'apply'});
  assert.equal(refused.output.browser_recovery.next_step.trigger,'T1');
  assert.deepEqual(refused.output.browser_recovery.basis.input.used_recovery,['abandon_operation']);
  assert.equal(f.events.filter(e=>e.phase==='browser_recovery_basis').length,1);
});

test('without the option the refusal still names the user action',async()=>{
  const f=fixture({release:refuse});await stop(f,'finish');
  const refused=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  assert.equal(refused.output.user_action,'Ask the user to close it with Cancel.');
  assert.equal(refused.output.browser_recovery,undefined);
  assert.equal(f.events.some(e=>e.phase==='browser_recovery_basis'),false);
});

test('inspect of a stopped phase without a release driver offers T2',async()=>{
  const f=fixture({browserRecovery:full});await stop(f,'finish');
  const view=(await f.runtime.inspect({operationId:'apply'})).output;
  assert.deepEqual(view.recovery_options,[]);
  assert.equal(view.browser_recovery.next_step.trigger,'T2');
  assert.deepEqual(f.runtime.browserRecoveryBasis('apply').step,view.browser_recovery.basis.step);
});

test('direct node apply outcome carries its recovery step',async()=>{
  const f=fixture({browserRecovery:full});
  f.drivers.finish=async()=>{throw Error('Local node cancellation requested');};
  const outcome=await f.runtime.runNodeApply(request());
  assert.equal(outcome.output.browser_recovery.next_step.trigger,'T2');
});

test('basis journal failure preserves the stopped node outcome',async()=>{
  const f=fixture({browserRecovery:full,basisRecordError:Error('Basis journal unavailable')});
  f.drivers.finish=async()=>{throw Error('Local node cancellation requested');};
  const outcome=await f.runtime.runNodeApply(request());
  assert.equal(outcome.status,'AMBIGUOUS');
  assert.equal(outcome.output.browser_recovery.next_step.trigger,'T2');
  assert.match(outcome.output.browser_recovery.journal_error,/Basis journal unavailable/);
});

test('recovery input omits a request above the byte limit',async()=>{
  const f=fixture({browserRecovery:full});
  f.drivers.finish=async()=>{throw Error('Local node cancellation requested');};
  const outcome=await f.runtime.runNodeApply({...request(),parameters:{payload:'x'.repeat(17000)}});
  const input=outcome.output.browser_recovery.basis.input;
  assert.equal(input.request,undefined);
  assert.equal(input.request_omitted,true);
});

test('basis is unavailable while a retry of the release is executing',async()=>{
  let release=refuse;
  const f=fixture({browserRecovery:full,release:state=>release(state)});
  await stop(f,'finish');
  await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  let enter,finish;
  const entered=new Promise(resolve=>{enter=resolve;});
  release=async state=>{enter();await new Promise(resolve=>{finish=resolve;});return proved()(state);};
  const running=f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-2'});
  await entered;
  const activeBasis=f.runtime.browserRecoveryBasis('apply');
  finish();
  const outcome=await running;
  assert.equal(activeBasis,null);
  assert.equal(outcome.output.original_outcome.output.browser_recovery.next_step.trigger,'T4');
});

test('the same phase failing with the same cause on the existing node offers T3',async()=>{
  const f=fixture({release:proved(),browserRecovery:full});
  await stop(f,'finish',{cause:'UI_SCAN_LIMIT'});
  await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  const again=await stop(f,'finish',{cause:'UI_SCAN_LIMIT',operationId:'again',
    target:{kind:'existing',type:'imports.text',ref:{document_id:'doc',workflow_id:'wf',node_id:'new'}}});
  const offer=again.outcome.output.browser_recovery;
  assert.equal(offer.next_step.trigger,'T3');
  assert.equal(browserRecoveryStepKey(offer.basis.step),
    browserRecoveryStepKey({kind:'node',document_id:'doc',workflow_id:'wf',node_id:'new',phase:'finish'}));
});

test('a release from a launch phase offers T4 for the unknown execution',async()=>{
  const f=fixture({release:proved(),browserRecovery:full});await stop(f,'finish');
  const released=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  assert.equal(released.output.original_outcome.output.execution.status,'unknown');
  assert.equal(released.output.original_outcome.output.browser_recovery.next_step.effect,'execution');
});

test('a successful release supersedes an earlier refusal on the same phase',async()=>{
  let release=refuse;
  const f=fixture({release:state=>release(state),browserRecovery:full});await stop(f,'finish');
  const refused=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  const refusedKey=browserRecoveryStepKey(refused.output.browser_recovery.basis.step);
  release=proved();
  const released=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-2'});
  const offer=released.output.original_outcome.output.browser_recovery;
  assert.equal(offer.next_step.trigger,'T4');
  assert.equal(offer.basis.step.phase,'finish');
  assert.equal(browserRecoveryStepKey(offer.basis.step),refusedKey);
  assert.equal(f.runtime.browserRecoveryBasis('apply').trigger,'T4');
});

test('an exhausted step budget leaves an instruction without a tool',async()=>{
  const f=fixture({browserRecovery:{remaining:()=>({calls_remaining:0,ms_remaining:120000})}});
  await stop(f,'finish');
  const next=(await f.runtime.inspect({operationId:'apply'})).output.browser_recovery.next_step;
  assert.equal(next.tool,undefined);
  assert.match(next.instruction,/Бюджет/);
});

test('an ambiguous Save gains T4 only after inspect and keeps it for start',async()=>{
  const key='package.save_checkpoint',revision=actions.get(key).revision;
  let calls=0;
  const engine=runtime(new Page(),{browserRecovery:full,getStorageBinding:()=>({document_id:'doc'}),
    execute:async()=>{
      const phase=++calls===1?'prepared':calls===2?'applied':'reconciled';
      return {status:phase==='prepared'?'NOT_APPLIED':'AMBIGUOUS',action_key:key,action_revision:revision,
        operation_id:'save',phase,effect_possible:phase!=='prepared',cleanup_complete:true,error:null,trace:[],
        output:{},...(phase==='prepared'?{checkpoint:{document_id:'doc',workflow_ref:{workflow_id:'wf'}}}:{})};
    }});
  await engine.run(key,{path:'/user/a.lgp',conflict_policy:'replace'},{operationId:'save'});
  assert.equal(engine.browserRecoveryBasis('save'),null);
  const inspected=(await engine.inspect({operationId:'save'})).output.browser_recovery;
  assert.equal(inspected.next_step.effect,'save');
  assert.deepEqual(engine.browserRecoveryBasis('save').step,inspected.basis.step);
  assert.equal(calls,3);
});
