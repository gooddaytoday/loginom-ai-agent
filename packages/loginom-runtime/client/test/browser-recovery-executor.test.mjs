import test from 'node:test';
import assert from 'node:assert/strict';
import {NodeReleaseBlocked} from '../lib/node-pending-release.mjs';
import {fixture,request,stop} from './support/stopped-node-fixture.mjs';
import {proved} from './support/stopped-node-fixture.mjs';
import {browserRecoveryStepKey} from '../lib/browser-recovery-basis.mjs';
import {actions,Page,runtime} from './support/executor-fixture.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';

const full={remaining:()=>({calls_remaining:30,ms_remaining:600000})};
const refuse=()=>{throw new NodeReleaseBlocked('A Loginom wizard of another node is open','Ask the user to close it with Cancel.');};
const saveWithReceipt=({receipt,now=Date.now,deadlineAt,onRecord}={})=>{
  const key='package.save_checkpoint',revision=actions.get(key).revision;
  const outcome={status:'AMBIGUOUS',action_key:key,action_revision:revision,operation_id:'save',
    phase:'applied',effect_possible:true,cleanup_complete:true,error:null,trace:[],output:{}};
  const engine=runtime(new Page(),{now,onRecord,browserRecovery:full,getStorageBinding:()=>({document_id:'doc'}),execute:async code=>{
    if(code.includes('"receipt_read":true'))return {status:'SUCCEEDED',action_key:'operation.inspect',
      action_revision:'1',operation_id:'save',phase:'observed',effect_possible:false,error:null,trace:[],
      output:typeof receipt==='function'?receipt(outcome):receipt};
    if(code.includes('"receipt_namespace":'))return outcome;
    return {...outcome,status:'NOT_APPLIED',phase:'prepared',effect_possible:false,
      checkpoint:{document_id:'doc',workflow_ref:{workflow_id:'wf'}}};
  }});
  return engine.run(key,{path:'/user/a.lgp',conflict_policy:'replace'},
    {operationId:'save',...(deadlineAt===undefined?{}:{deadlineAt})}).then(()=>engine);
};

test('handoff waits for a running browser call without aborting it',async()=>{
  const key='package.save_checkpoint',revision=actions.get(key).revision;
  let release,entered;
  const controller=new AbortController();
  const dispatched=new Promise(resolve=>{entered=resolve;});
  const completed={status:'AMBIGUOUS',action_key:key,action_revision:revision,operation_id:'save',
    phase:'applied',effect_possible:true,cleanup_complete:true,error:null,trace:[],output:{}};
  const engine=runtime(new Page(),{now:Date.now,getStorageBinding:()=>({document_id:'doc'}),
    execute:async code=>{
      if(code.includes('"receipt_read":true'))return {status:'SUCCEEDED',action_key:'operation.inspect',
        action_revision:'1',operation_id:'save',phase:'observed',effect_possible:false,error:null,trace:[],
        output:{state:'completed',receipt:completed}};
      if(code.includes('"receipt_namespace":')){entered();await new Promise(resolve=>{release=resolve;});return completed;}
      return {...completed,status:'NOT_APPLIED',phase:'prepared',effect_possible:false,
        checkpoint:{document_id:'doc',workflow_ref:{workflow_id:'wf'}}};
    }});
  const running=engine.run(key,{path:'/user/a.lgp',conflict_policy:'replace'},
    {operationId:'save',signal:controller.signal});
  await dispatched;
  const handoff=engine.browserRecoveryHandoff('save',{pollMs:10});
  assert.equal(await Promise.race([handoff.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),30))]),false);
  release();await running;
  const proof=await handoff;
  assert.equal(proof.verified,true);
  assert.equal(controller.signal.aborted,false);
});

test('handoff waits for a running receipt to confirm browser cleanup',async()=>{
  let reads=0;
  const engine=await saveWithReceipt({receipt:outcome=>++reads===1?{state:'running'}:
    {state:'completed',receipt:outcome},deadlineAt:Date.now()+100});
  const proof=await engine.browserRecoveryHandoff('save',{pollMs:10});
  assert.equal(proof.verified,true);
  assert.equal(reads,2);
});

test('handoff rejects a browser receipt with a different identity',async()=>{
  const engine=await saveWithReceipt({receipt:{state:'identity_mismatch'}});
  assert.deepEqual(await engine.browserRecoveryHandoff('save',{pollMs:10}),
    {verified:false,reason:'RECEIPT_IDENTITY_MISMATCH'});
});

test('handoff of a released node does not cross a newer pending node',async()=>{
  const f=fixture({release:proved(),browserRecovery:full});
  await stop(f,'finish');
  await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  await stop(f,'finish',{operationId:'again',target:{kind:'existing',type:'imports.text',
    ref:{document_id:'doc',workflow_id:'wf',node_id:'new'}}});
  const before=f.runtime.nodeApplyStatus('again');
  assert.deepEqual(await f.runtime.browserRecoveryHandoff('apply',{pollMs:10}),
    {verified:false,reason:'UNRELATED_UNSETTLED_WORK'});
  assert.deepEqual(f.runtime.nodeApplyStatus('again'),before);
  assert.equal(f.runtime.hasUnsettledWork(),true);
});

test('handoff records its verified result',async()=>{
  const events=[];
  const engine=await saveWithReceipt({receipt:outcome=>({state:'completed',receipt:outcome}),
    onRecord:async event=>events.push(event)});
  const proof=await engine.browserRecoveryHandoff('save');
  assert.equal(proof.verified,true);
  assert.deepEqual(events.find(event=>event.phase==='browser_recovery_handoff')?.result,proof);
});

test('handoff bounds receipt polling by the original deadline and one minute',async()=>{
  let clock=0,reads=0;
  const engine=await saveWithReceipt({now:()=>clock,deadlineAt:600000,receipt:()=>{
    reads++;clock+=20000;return {state:'running'};
  }});
  assert.deepEqual(await engine.browserRecoveryHandoff('save',{pollMs:1}),
    {verified:false,reason:'RECEIPT_UNSETTLED'});
  assert.equal(reads,3);
  assert.equal(clock,60000);
});

test('handoff refuses a missing receipt or incomplete browser cleanup',async()=>{
  const f=fixture({browserRecovery:full});await stop(f,'finish');
  assert.deepEqual(await f.runtime.browserRecoveryHandoff('apply'),
    {verified:false,reason:'RECEIPT_MISSING'});
  const engine=await saveWithReceipt({receipt:outcome=>({state:'completed',receipt:{...outcome,cleanup_complete:false}})});
  assert.deepEqual(await engine.browserRecoveryHandoff('save'),
    {verified:false,reason:'RECEIPT_UNSETTLED'});
});

test('handoff waits for a running node even when it has no browser receipt yet',async()=>{
  const f=fixture({browserRecovery:full});
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;});
  f.drivers.finish=async()=>{entered();await new Promise(resolve=>{release=resolve;});
    return {verified:true,cleanup_complete:true,effect_possible:true,execution_id:'exec',execution_started:true};};
  f.runtime.startNodeApply(request());await started;
  const handoff=f.runtime.browserRecoveryHandoff('apply',{pollMs:10});
  assert.equal(await Promise.race([handoff.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),30))]),false);
  release();await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
  assert.deepEqual(await handoff,{verified:false,reason:'RECEIPT_MISSING'});
});

test('cancelling the handoff wait does not cancel the browser operation',async()=>{
  const controller=new AbortController();
  const engine=await saveWithReceipt({deadlineAt:Date.now()+100,receipt:()=>{
    setTimeout(()=>controller.abort(Error('Handoff cancelled')),5);
    return {state:'running'};
  }});
  await assert.rejects(engine.browserRecoveryHandoff('save',{signal:controller.signal,pollMs:10}),
    /Handoff cancelled/);
  assert.equal(engine.hasUnsettledWork(),true);
});

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

test('a pending second node removes historical recovery offers from every reply',async()=>{
  const f=fixture({release:proved(),browserRecovery:full});
  await stop(f,'finish');
  await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  await stop(f,'finish',{operationId:'again',target:{kind:'existing',type:'imports.text',
    ref:{document_id:'doc',workflow_id:'wf',node_id:'new'}}});
  assert.equal(f.runtime.browserRecoveryBasis('apply'),null);
  const status=f.runtime.nodeApplyStatus('apply');
  const waited=await f.runtime.waitNodeApply('apply',{timeoutMs:0});
  const inspected=(await f.runtime.inspect({operationId:'apply'})).output;
  assert.equal(status.outcome.output.browser_recovery,undefined);
  assert.equal(waited.outcome.output.browser_recovery,undefined);
  assert.equal(inspected.outcome.output.browser_recovery,undefined);
  assert.notEqual(compactNodeResult(status).next_step?.tool,'dock_browser_recovery');
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

test('Save loses its basis during a second reconcile and regains it after completion',async()=>{
  const key='package.save_checkpoint',revision=actions.get(key).revision;
  let calls=0,entered,finish;
  const browserEntered=new Promise(resolve=>{entered=resolve;});
  const engine=runtime(new Page(),{browserRecovery:full,getStorageBinding:()=>({document_id:'doc'}),
    execute:async()=>{
      const call=++calls;
      if(call===4){entered();await new Promise(resolve=>{finish=resolve;});}
      return {status:call===1?'NOT_APPLIED':'AMBIGUOUS',action_key:key,action_revision:revision,
        operation_id:'save',phase:call===1?'prepared':'reconciled',effect_possible:call!==1,
        cleanup_complete:true,error:null,trace:[],output:{},
        ...(call===1?{checkpoint:{document_id:'doc',workflow_ref:{workflow_id:'wf'}}}:{})};
    }});
  await engine.run(key,{path:'/user/a.lgp',conflict_policy:'replace'},{operationId:'save'});
  await engine.inspect({operationId:'save'});
  assert.equal(engine.browserRecoveryBasis('save').trigger,'T4');
  const inspecting=engine.inspect({operationId:'save'});
  await browserEntered;
  const during=engine.browserRecoveryBasis('save');
  finish();
  const after=await inspecting;
  assert.equal(during,null);
  assert.equal(after.output.browser_recovery.next_step.effect,'save');
  assert.equal(engine.browserRecoveryBasis('save').trigger,'T4');
  assert.equal(calls,4);
});
