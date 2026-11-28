import assert from 'node:assert/strict';
import test from 'node:test';
import { writeReplyVerdict } from '../lib/write-outcome.mjs';

test('non-step write replies distinguish no effect from committed and uncertain effects', () => {
  const reply = (status, effect_possible, cleanup_complete) => ({
    structuredContent: { outcome: { status, effect_possible, cleanup_complete } },
    isError: status !== 'SUCCEEDED',
  });
  const verdict = result => writeReplyVerdict(result, 'dock_action_run', { action_key: 'fixture.mutate' });
  assert.equal(verdict(reply('SUCCEEDED', true, true)), 'applied');
  assert.equal(verdict(reply('FAILED', false, true)), 'not_applied');
  assert.equal(verdict(reply('FAILED', true, true)), undefined);
  assert.equal(verdict(reply('FAILED', false, false)), undefined);
  assert.equal(verdict(reply('AMBIGUOUS', true, false)), undefined);
  assert.equal(writeReplyVerdict(reply('SUCCEEDED', true, true), 'dock_action_run',
    { action_key: 'package.save_checkpoint' }), undefined);
});
