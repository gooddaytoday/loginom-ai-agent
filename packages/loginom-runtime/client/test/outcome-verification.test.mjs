import test from 'node:test';
import assert from 'node:assert/strict';
import { outcomeVerification, assertOutcomeVerification } from '../lib/outcome-verification.mjs';
import { actions, Page, nodeParameters, run } from './support/executor-fixture.mjs';

test('real serialized node handler proves only its domain effect, not settings, data or goal', async () => {
  const receipt = await run(new Page(), 'node.add', nodeParameters);
  const before = structuredClone(receipt);
  const proof = outcomeVerification(receipt, actions.get('node.add'));
  assert.deepEqual(receipt, before);
  assert.equal(proof.domain_effect.state, 'verified');
  assert.equal(proof.settings.state, 'not_checked');
  assert.equal(proof.data.state, 'not_checked');
  assert.equal(proof.goal.state, 'not_verified');
  assertOutcomeVerification(proof, receipt, actions.get('node.add'));
  for (const mutate of [p => { p.goal.state = 'verified'; }, p => { p.data.state = 'verified'; },
    p => { p.receipt_sha256 = 'a'.repeat(64); }, p => { p.operation_id = 'other'; }]) {
    const changed = structuredClone(proof); mutate(changed);
    assert.throws(() => assertOutcomeVerification(changed, receipt, actions.get('node.add')), /bound receipt/);
  }
  assert.equal(outcomeVerification({ ...receipt, trace: [] }, actions.get('node.add')).domain_effect.state, 'unverified');
  assert.equal(outcomeVerification({ ...receipt, cleanup_complete: false }, actions.get('node.add')).domain_effect.state, 'unverified');
});

test('successful UI gesture and bounded snapshot never become domain or complete dataset proof', () => {
  const receipt = { status: 'SUCCEEDED', action_key: 'ui.act', action_revision: '1', operation_id: 'click-1',
    phase: 'completed', effect_possible: true, error: null, cleanup_complete: true,
    trace: [{ event: 'ui_gesture_applied', verb: 'click' }], output: { ui: { truncated: { nodes: false } } } };
  const proof = outcomeVerification(receipt);
  assert.equal(proof.gesture.state, 'performed');
  assert.equal(proof.domain_effect.state, 'unverified');
  assert.equal(proof.observation.completeness, 'not_proven');
  assert.equal(proof.goal.state, 'not_verified');
  receipt.output.ui.truncated.nodes = true;
  assert.equal(outcomeVerification(receipt).observation.completeness, 'truncated');
});

test('failed or abandoned operation retains unverified domain state', async () => {
  const page = new Page(); page.failDrag = true;
  const receipt = await run(page, 'node.add', nodeParameters);
  const proof = outcomeVerification({ ...receipt, resolution: 'abandoned_after_observation' }, actions.get('node.add'));
  assert.equal(proof.domain_effect.state, 'unverified');
  assert.equal(proof.goal.state, 'not_verified');
});

test('intermediate save proof requires its own awaited receipt and does not claim persisted contents',async()=>{
  const action=actions.get('package.save_checkpoint');
  const receipt=await run(new Page(),'package.save_checkpoint',{path:'/user/data/packages/checkpoint.lgp',conflict_policy:'fail'});
  const proof=outcomeVerification(receipt,action);
  assert.equal(proof.domain_effect.state,'verified');assert.equal(proof.data.state,'not_checked');
  for(const event of ['save_flow_completed','open_saved_package_observed']){
    const changed=structuredClone(receipt);changed.trace=changed.trace.filter(t=>t.event!==event);
    assert.equal(outcomeVerification(changed,action).domain_effect.state,'unverified');
  }
  const permissive=structuredClone(action);
  for(const property of Object.values(permissive.output_schema.properties))delete property.enum;
  for(const override of [{reopened:true},{save_completed:false},{workflow_preserved:false},{persisted_content_verified:true}]){
    const changed=structuredClone(receipt);Object.assign(changed.output,override);
    assert.equal(outcomeVerification(changed,permissive).domain_effect.state,'unverified');
  }
});
