import assert from 'node:assert/strict';
import test from 'node:test';
import { BROWSER_RECOVERY_BUDGET, BROWSER_RECOVERY_VERIFY_MS, BROWSER_RECOVERY_HANDOFF_MS,
  browserRecoveryStepKey, browserRecoveryNextStep, classifyBrowserRecovery, decideBrowserRecovery } from '../lib/browser-recovery-basis.mjs';

const view = (patch = {}) => ({
  operation_id: 'apply', capability: 'node.apply', state: 'pending', status: 'AMBIGUOUS',
  effect_possible: true, error_code: 'NODE_APPLY_STOPPED', cause_code: 'UI_SCAN_LIMIT', pending_phase: 'configure',
  node: { document_id: 'doc', workflow_id: 'wf', node_id: 'n1' },
  target: { kind: 'new', type: 'transform.calculator' }, request_finish: 'execute', read_ports: [],
  transport_uncertain: false, recovery_options: [], next_tools: [], ...patch,
});

test('T1 offers browser recovery for a refused release with a user action', () => {
  const basis = classifyBrowserRecovery(view({
    recovery_options: ['abandon_operation'], next_tools: ['dock_operation_recover'],
    release_refused: { user_action: 'Ask the user', phase: 'configure' },
  }));
  assert.equal(basis.trigger, 'T1');
  assert.equal(basis.reason_code, 'NODE_RELEASE_REFUSED');
  assert.deepEqual(basis.step, { kind: 'node', document_id: 'doc', workflow_id: 'wf', node_id: 'n1', phase: 'configure' });
  assert.deepEqual(basis.goal, { execution: true, output_schema: true, ports: [0], file: false, saved_package: false });
  assert.equal(classifyBrowserRecovery(view({ state: 'settled', release_refused: {
    user_action: 'Ask the user', phase: 'configure' }, recovery_options: ['abandon_operation'] })), null);
});

test('T2 requires a pending node without a standard continuation', () => {
  assert.equal(classifyBrowserRecovery(view()).reason_code, 'NO_RECOVERY_OPTIONS');
  for (const patch of [
    { recovery_options: ['abandon_operation'] }, { user_action: 'Ask the user' },
    { next_tools: ['dock_node_resume'] }, { next_tools: ['dock_operation_recover'] },
    { next_tools: ['dock_artifact_verify'] }, { next_tools: ['dock_artifact_delivery_resume'] },
    { node: null }, { pending_phase: null }, { internal_resume_available: true },
  ]) assert.equal(classifyBrowserRecovery(view(patch)), null, JSON.stringify(patch));
});

test('T3 matches a released operation only for the same node, phase and stop code', () => {
  const released = view({ operation_id: 'first', state: 'settled', status: 'FAILED',
    checkpoint_kind: 'local_node_released', released_phase: 'configure', pending_phase: null,
    stopped_error: { code: 'NODE_APPLY_STOPPED', cause_code: 'UI_SCAN_LIMIT' } });
  const again = view({ operation_id: 'second', target: { kind: 'existing', type: 'transform.calculator' },
    recovery_options: ['abandon_operation'], next_tools: ['dock_operation_recover'] });
  assert.equal(classifyBrowserRecovery(again, [released]).reason_code, 'REPEATED_PHASE_FAILURE');
  for (const patch of [
    { cause_code: 'WIZARD_OPEN_NOT_CONFIRMED' }, { pending_phase: 'execute' },
    { node: { ...again.node, node_id: 'other' } }, { target: { ...again.target, kind: 'new' } },
  ]) assert.equal(classifyBrowserRecovery({ ...again, ...patch }, [released]), null, JSON.stringify(patch));
});

test('T4 covers unknown execution, unconfirmed export and reconciled ambiguous save', () => {
  const settled = { state: 'settled', status: 'FAILED', pending_phase: null };
  const execution = classifyBrowserRecovery(view({ ...settled, checkpoint_kind: 'local_node_released',
    released_phase: 'execute', execution_status: 'unknown' }));
  assert.deepEqual([execution.effect, execution.step.phase, execution.idempotent_retry], ['execution', 'execute', true]);
  const exported = classifyBrowserRecovery(view({ ...settled, export_download_unconfirmed: true,
    target: { kind: 'existing', type: 'exports.text' }, export_overwrite: 'replace' }));
  assert.deepEqual([exported.effect, exported.step.phase, exported.idempotent_retry, exported.goal.file],
    ['export', 'read', true, true]);
  const save = view({ capability: null, action_key: 'package.save_checkpoint', node: null,
    document_id: 'doc', package_path: '/user/a.lgp' });
  assert.equal(classifyBrowserRecovery(save), null);
  const reconciled = classifyBrowserRecovery({ ...save, reconciled: true });
  assert.deepEqual([reconciled.effect, reconciled.step, reconciled.goal.saved_package],
    ['save', { kind: 'save', document_id: 'doc', package_path: '/user/a.lgp', phase: 'save' }, true]);
});

test('excluded calls, uploads and closed attempts never produce a basis', () => {
  for (const patch of [
    { state: 'settled', status: 'NOT_APPLIED', effect_possible: false }, { state: 'running' },
    { execution_status: 'cancelled' }, { error_code: 'LOGIN_REQUIRED' }, { transport_uncertain: true },
    { capability: 'artifact.upload' }, { browser_recovery_stopped: 'br-1' },
    { recovery_receipt_id: 'br-1:receipt' },
  ]) assert.equal(classifyBrowserRecovery(view(patch)), null, JSON.stringify(patch));
});

test('step identity and budget are stable across operation ids', () => {
  const basis = classifyBrowserRecovery(view({ operation_id: 'other' }));
  assert.equal(browserRecoveryStepKey(basis.step), 'node:doc:wf:n1:configure');
  assert.equal(browserRecoveryStepKey({ kind: 'save', document_id: 'doc', package_path: '/user/a.lgp' }),
    'save:doc:/user/a.lgp');
  assert.deepEqual(BROWSER_RECOVERY_BUDGET, { calls: 30, ms: 600000 });
  assert.equal(Object.isFrozen(BROWSER_RECOVERY_BUDGET), true);
  assert.deepEqual([BROWSER_RECOVERY_VERIFY_MS, BROWSER_RECOVERY_HANDOFF_MS], [240000, 60000]);
  const offered = browserRecoveryNextStep(basis, { calls_remaining: 4, ms_remaining: 9000 });
  assert.deepEqual({ ...offered, instruction: Boolean(offered.instruction) }, {
    tool: 'dock_browser_recovery', arguments: { action: 'start', operation_id: 'other' },
    trigger: 'T2', reason_code: 'NO_RECOVERY_OPTIONS', effect: null, step: basis.step,
    budget: { calls_remaining: 4, ms_remaining: 9000 }, instruction: true,
  });
  const exhausted = browserRecoveryNextStep(basis, { calls_remaining: 0, ms_remaining: 9000 });
  assert.deepEqual(Object.keys(exhausted), ['instruction']);
  assert.match(exhausted.instruction, /фактическое состояние/);
});

test('decision requires the goal facts and reports verified and missing facts', () => {
  const yes = { verified: true }, no = { verified: false, reason: 'not seen' };
  const node = { step: { kind: 'node' }, goal: { execution: true, output_schema: true, ports: [0] } };
  assert.deepEqual(decideBrowserRecovery(node, { workspace: yes, execution: yes, output_schema: yes }),
    { result: 'completed', verified: { workspace: yes, execution: yes, output_schema: yes }, missing: [] });
  assert.deepEqual(decideBrowserRecovery(node, { workspace: yes, execution: yes, output_schema: no }),
    { result: 'unresolved', verified: { workspace: yes, execution: yes }, missing: ['output_schema'] });
  assert.equal(decideBrowserRecovery(node, { workspace: yes, execution: no }).result, 'continuable');
  assert.deepEqual(decideBrowserRecovery(node, { workspace: no }),
    { result: 'unresolved', verified: {}, missing: ['workspace', 'execution', 'output_schema'] });
  assert.equal(decideBrowserRecovery({ step: { kind: 'node' }, goal: { execution: false } },
    { workspace: yes }).result, 'continuable');
  const exported = { step: { kind: 'node' }, goal: { execution: true, file: true }, idempotent_retry: false };
  assert.equal(decideBrowserRecovery(exported, { workspace: yes, execution: yes, export_file: no }).result, 'unresolved');
  assert.equal(decideBrowserRecovery({ ...exported, idempotent_retry: true },
    { workspace: yes, execution: yes, export_file: no }).result, 'continuable');
  assert.equal(decideBrowserRecovery({ step: { kind: 'save' }, goal: { saved_package: true } },
    { saved_package: { verified: true, modified: false } }).result, 'completed');
});
