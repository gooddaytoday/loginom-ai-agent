import test from 'node:test';
import assert from 'node:assert/strict';
import {waitManagedJavascriptCodeSettlement} from '../lib/javascript-managed-code-settlement.mjs';
import {managedJavascriptStageFixture} from './support/javascript-managed-stage-fixture.mjs';
function fixture() {
  const f=managedJavascriptStageFixture();f.previews.length=0;
  const before={...f.read(),owner:f.task.owner},events=[];
  const options={task:f.task,before,execute:code=>Function('return ('+code+')')()(f.page),
    record:async event=>{events.push(event);return event;},wait:async()=>{}};
  return {...f,before,events,options};
}
for(const mask of [false,true])test('actual serialized observation ends at fresh quiet native refusal '+mask,async()=>{
  const f=fixture();let polls=0;
  const after=await waitManagedJavascriptCodeSettlement({...f.options,execute:async code=>{
    if(++polls===1&&mask)f.masks.push(f.element('mask',''));
    else{f.masks.length=0;f.error.rect.width=100;}
    return f.options.execute(code);
  }});
  assert.equal(after.wizard_error_refusal,true);assert.equal(after.pending_seen,mask);assert.equal(polls,mask?3:2);
  assert.equal(f.events[0].phase,'javascript_managed_code_next_refused');
  assert.ok(!JSON.stringify(f.events).includes('SyntaxError'));
});
test('stale button does not classify refusal before a verified native page transition',async()=>{
  const f=fixture();f.error.rect.width=100;f.options.before={...f.read(),owner:f.task.owner};let polls=0;
  const after=await waitManagedJavascriptCodeSettlement({...f.options,execute:async code=>{
    if(++polls===2)f.code.tid='MF;TF-1;WizrdMCF;DoneWizard';return f.options.execute(code);
  }});
  assert.equal(after.page_tid,'MF;TF-1;WizrdMCF;DoneWizard');assert.equal(after.wizard_error_refusal,undefined);
  assert.equal(polls,2);assert.deepEqual(f.events,[]);
});
test('same stale button becomes attributable only after the observed pending interval',async()=>{
  const f=fixture();f.error.rect.width=100;f.options.before={...f.read(),owner:f.task.owner};let polls=0;
  const after=await waitManagedJavascriptCodeSettlement({...f.options,execute:async code=>{
    if(++polls===1)f.masks.push(f.element('mask',''));else f.masks.length=0;return f.options.execute(code);
  }});
  assert.equal(after.wizard_error_refusal,true);assert.equal(after.pending_seen,true);assert.equal(polls,3);
});
test('foreign dialog without a fresh own error refuses settlement',async()=>{
  const f=fixture();f.dialogs.push(f.element('foreign','msgbox-1'));
  await assert.rejects(waitManagedJavascriptCodeSettlement(f.options),/boundary refused/);assert.deepEqual(f.events,[]);
});
test('silent unchanged Code page reaches the original deadline without a refusal proof',async()=>{
  const f=fixture();f.task.deadline=Date.now()+25;
  f.lease.identity=JSON.stringify([f.task.owner,f.task.workflow_ref,f.task.targetOrigin,f.task.targetBuild,f.task.deadline]);
  await assert.rejects(waitManagedJavascriptCodeSettlement({...f.options,wait:async()=>new Promise(resolve=>setTimeout(resolve,5))}),/original deadline expired|lease unavailable/);
  assert.deepEqual(f.events,[]);
});
test('refusal journal ACK mutation cannot yield a recoverable stage',async()=>{
  const f=fixture();f.error.rect.width=100;
  await assert.rejects(waitManagedJavascriptCodeSettlement({...f.options,record:async event=>{event.owner.node_id='foreign';return event;}}),/ACK differs/);
});
