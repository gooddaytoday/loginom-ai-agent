import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionRuntime } from '../lib/executor.mjs';
import { NodeReleaseBlocked } from '../lib/node-pending-release.mjs';
import { buildNodeReadRequest, nodeReadHandler, alignReadSchema } from '../lib/node-read-contract.mjs';
import { actions } from './support/executor-fixture.mjs';
import { compactNodeResult } from '../lib/user-results.mjs';

const node = { document_id: 'doc', workflow_id: 'wf', node_id: 'new' };
const workflow = { workflow_id: 'wf', tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', prefix: 'MF;TF-1', navigation_path: [{ tid: 'path', label: 'Scenario' }] };
const graphOf = () => ({ complete: true, document_id: 'doc', workflow_ref: workflow,
  nodes: [{ ref: node, type: 'imports.text', label: 'Source', position: { x: 320, y: 280 }, inputs: [], outputs: [0] }], links: [], foreign_links: [] });
const request = (id = 'apply', target = { kind: 'new', type: 'imports.text', label: 'Source', position: { x: 320, y: 280 } }) => ({
  operation_id: id, contract_revision: '1.0.0', document_id: 'doc', workflow_ref: workflow, target, inputs: [], mode: 'delimited',
  parameters: {}, mappings: [], finish: 'execute', read: { ports: [], sample_rows: 0, require_exact_numbers: false },
  budgets: { configure_ms: 10000, execute_ms: 10000, total_ms: 30000 } });
const proved = () => ({ verified: true, cleanup_complete: true, effect_possible: true,
  node_context: { ...node, verified: true, surface: 'graph', locked: false }, graph: graphOf(),
  cleanup: { wizard_closed: false, read_view_restored: false, views_returned: false } });
const blocked = () => { throw new NodeReleaseBlocked('A Loginom wizard of this node is open', 'Ask the user to close it with Cancel.'); };

function fixture({ browserRecovery = true, release = blocked, releasePendingPhases } = {}) {
  const calls = [], events = [];
  const graph = { complete: true, document_id: 'doc', workflow_ref: workflow, nodes: [], links: [], foreign_links: [] };
  const adapter = { observe: async () => structuredClone(graph), preflight: async () => {},
    positionMatches: (n, p) => JSON.stringify(n.position) === JSON.stringify(p),
    reconcile: async () => ({ verified: true, cleanup_complete: true }),
    mutate: async e => { calls.push(e.kind); if (e.kind === 'create') graph.nodes.push({ ref: node, type: e.parameters.type, label: 'Source',
      position: e.parameters.position, inputs: [], outputs: [0] }); return { status: 'SUCCEEDED', cleanup_complete: true }; } };
  const ok = name => async () => { calls.push(name); return { verified: true, cleanup_complete: true, effect_possible: false }; };
  const state = { release, failFinish: true };
  const drivers = { verifySource: ok('source'), mapPorts: ok('mapping'), openWizard: ok('open'),
    finish: async mode => {
      calls.push('finish');
      if (state.receipt) state.receiptOptions('apply:finish', 'node.finish', 'signature');
      if (state.failFinish) throw Error('Wizard Done was not confirmed');
      return { verified: true, cleanup_complete: true, mode, effect_possible: true, execution_id: 'exec', execution_started: true };
    },
    waitExecution: async () => ({ verified: true, cleanup_complete: true, status: 'completed', execution_id: 'exec' }),
    readOutput: async () => ({ verified: true, cleanup_complete: true, effect_possible: false, status: 'complete', execution_id: 'exec', evidence_ref: 'e', ports: [] }),
    verifyContinuation: async () => true,
    releasePending: async s => { calls.push('release:' + s.pending.phase); return state.release(s); },
    ...(releasePendingPhases ? { releasePendingPhases } : {}) };
  const handler = { revision: '1', modes: ['delimited'], validate: () => {}, configure: ok('configure') };
  const runtime = createActionRuntime({ pinned: { actions, selectors: new Map(), pins: {} }, allowCandidate: true, browserRecovery,
    // Only the page receipt ledger is read through this transport.
    execute: async code => {
      if (!state.receipt || !code.includes('receipt_read')) throw Error('Unexpected public transport');
      const receipt = { status: 'SUCCEEDED', action_key: 'node.finish', action_revision: '1', operation_id: 'apply:finish', phase: 'verified',
        effect_possible: true, output: {}, error: null, trace: [], cleanup_complete: state.receipt.cleanup };
      return { status: 'SUCCEEDED', action_key: 'operation.receipt', action_revision: '1', operation_id: 'apply', phase: 'observed',
        effect_possible: false, error: null, trace: [], output: { state: 'completed', receipt } };
    },
    nodeTargetAdapterFactory: () => adapter, nodeApplyHandlers: new Map([['imports.text', handler]]),
    nodeApplyDriverFactory: ({ receiptOptions }) => { state.receiptOptions = receiptOptions; return drivers; },
    onRecord: async e => { events.push(e); return e; } });
  return { runtime, calls, events, state };
}

async function stopAtFinish(f, id = 'apply', target) {
  f.runtime.startNodeApply(request(id, target));
  const job = await f.runtime.waitNodeApply(id, { timeoutMs: 1000 });
  assert.equal(job.outcome.status, 'AMBIGUOUS');
  assert.equal(job.outcome.output.pending_phase, 'finish');
  return job;
}

test('T1: a refused release points to browser recovery instead of asking the user', async () => {
  const f = fixture();
  await stopAtFinish(f);
  const refused = await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  assert.equal(refused.error.code, 'NODE_RELEASE_REFUSED');
  assert.equal(refused.output.user_action, undefined);
  assert.equal(refused.output.ui_blocker, 'Ask the user to close it with Cancel.');
  assert.deepEqual(refused.output.next_step.arguments, { action: 'start', operation_id: 'apply' });
  assert.equal(refused.output.next_step.reason, 'NODE_RELEASE_REFUSED');
  const advice = (await f.runtime.inspect({ operationId: 'apply' })).output;
  assert.equal(advice.next_steps[0].tool, 'dock_browser_recovery');
  const basis = f.runtime.browserRecoveryBasis('apply');
  assert.equal(basis.reason, 'NODE_RELEASE_REFUSED');
  assert.equal(basis.step.key, 'node|doc|wf|new|finish');
  assert.equal(basis.goal.ui_blocker, 'Ask the user to close it with Cancel.');
});

test('without the capability the existing user_action contract is unchanged', async () => {
  const f = fixture({ browserRecovery: false });
  await stopAtFinish(f);
  const refused = await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  assert.equal(refused.output.user_action, 'Ask the user to close it with Cancel.');
  assert.equal(refused.output.next_step, undefined);
  assert.throws(() => f.runtime.browserRecoveryBasis('apply'), /unavailable/);
  assert.equal((await f.runtime.inspect({ operationId: 'apply' })).output.next_steps.some(s => s.tool === 'dock_browser_recovery'), false);
});

test('Dock recovery comes first: an available release is not a trigger', async () => {
  const f = fixture({ release: proved });
  await stopAtFinish(f);
  const advice = (await f.runtime.inspect({ operationId: 'apply' })).output;
  assert.deepEqual(advice.recovery_options, ['abandon_operation']);
  assert.equal(advice.next_steps.some(s => s.tool === 'dock_browser_recovery'), false);
  assert.throws(() => f.runtime.browserRecoveryBasis('apply'), /No browser recovery trigger/);
});

test('T2: no remaining Dock option makes browser recovery the next step', async () => {
  const f = fixture({ release: proved, releasePendingPhases: ['read'] });
  await stopAtFinish(f);
  const advice = (await f.runtime.inspect({ operationId: 'apply' })).output;
  assert.deepEqual(advice.recovery_options, []);
  assert.equal(advice.browser_recovery, 'NO_RECOVERY_OPTION');
  assert.equal(advice.next_steps[0].tool, 'dock_browser_recovery');
  assert.equal(f.runtime.browserRecoveryBasis('apply').reason, 'NO_RECOVERY_OPTION');
});

test('the lease blocks Dock mutations; verification releases on proof and writes a receipt first', async () => {
  const f = fixture();
  await stopAtFinish(f);
  await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  const basis = f.runtime.browserRecoveryBasis('apply');
  const handoff = await f.runtime.browserRecoveryHandoff('apply');
  assert.equal(handoff.stopped, true);
  assert.throws(() => f.runtime.startNodeApply(request('other')), /Browser recovery holds the page/);
  await assert.rejects(f.runtime.run('package.save_checkpoint', { path: '/user/a.lgp', conflict_policy: 'replace' }, { operationId: 's' }),
    /Browser recovery holds the page/);
  assert.equal(f.runtime.nodeApplyStatus('apply').outcome.status, 'AMBIGUOUS');
  assert.equal(f.runtime.hasUnsettledWork(), true);

  // The wizard is still open: verification refuses and the lease stays with the browser phase.
  const unresolved = await f.runtime.verifyBrowserRecovery({ operationId: 'apply', step: basis.step, attested: { actions_performed: ['none'] } });
  assert.equal(unresolved.status, 'unresolved');
  assert.match(unresolved.reason, /wizard/);
  assert.throws(() => f.runtime.startNodeApply(request('other')), /Browser recovery holds the page/);

  f.state.release = proved;
  const verified = await f.runtime.verifyBrowserRecovery({ operationId: 'apply', step: basis.step,
    attested: { actions_performed: ['Clicked Cancel in the wizard'] } });
  assert.equal(verified.status, 'continuable');
  assert.equal(verified.receipt_id, 'apply:br1');
  assert.equal(verified.next_step.tool, 'dock_node_apply');
  assert.match(verified.next_step.instruction, /"kind":"existing"/);
  assert.equal(verified.original_operation.status, 'FAILED');
  const phases = f.events.map(e => e.phase);
  assert.ok(phases.indexOf('browser_recovery_receipt') < phases.lastIndexOf('operation_abandoned'));
  const receipt = f.events.find(e => e.phase === 'browser_recovery_receipt').receipt;
  assert.deepEqual(receipt.attested_by_model, { actions_performed: ['Clicked Cancel in the wizard'] });
  assert.equal(f.runtime.hasUnsettledWork(), false);
  f.runtime.assertPreparationAllowed();
  // Exact redelivery of the original request reports its failure and the linked recovery.
  const redelivered = f.runtime.nodeApplyStatus('apply').outcome.output;
  assert.deepEqual(redelivered.browser_recovery, { receipt_id: 'apply:br1', status: 'continuable',
    facts: ['node_released_on_quiet_graph', 'no_wizard_dialog_or_mask'] });
  assert.equal(compactNodeResult(f.runtime.nodeApplyStatus('apply')).browser_recovery.receipt_id, 'apply:br1');
});

test('T3: the same phase failing again after a recovery is continued through a fresh read of the receipt', async () => {
  const f = fixture();
  await stopAtFinish(f);
  await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  const first = f.runtime.browserRecoveryBasis('apply');
  await f.runtime.browserRecoveryHandoff('apply');
  f.state.release = proved;
  await f.runtime.verifyBrowserRecovery({ operationId: 'apply', step: first.step, attested: { actions_performed: ['Closed wizard'] } });

  // Dock continues over the existing node; the broken finish predicate fails again.
  f.state.release = () => { throw Error('Release verifier unavailable for this surface'); };
  await stopAtFinish(f, 'apply-2', { kind: 'existing', type: 'imports.text', ref: node });
  const advice = (await f.runtime.inspect({ operationId: 'apply-2' })).output;
  assert.equal(advice.browser_recovery, 'REPEATED_PHASE_FAILURE');
  const basis = f.runtime.browserRecoveryBasis('apply-2');
  assert.equal(basis.step.key, first.step.key);
  await f.runtime.browserRecoveryHandoff('apply-2');
  f.state.release = proved;
  const verified = await f.runtime.verifyBrowserRecovery({ operationId: 'apply-2', step: basis.step,
    attested: { actions_performed: ['Completed the wizard and pressed Done'] } });
  assert.equal(verified.next_step.tool, 'dock_node_read');
  assert.match(verified.next_step.instruction, /source_operation_id:"apply-2:br2"/);

  const read = buildNodeReadRequest({ operation_id: 'reread', source_operation_id: 'apply-2:br2' },
    f.events.find(e => e.phase === 'browser_recovery_receipt' && e.receipt.id === 'apply-2:br2').receipt);
  assert.deepEqual(read.parameters, { source_operation_id: 'apply-2:br2', observed_schema: true, schemas: [{ port: 0, schema: null }] });
  assert.deepEqual(read.target, { kind: 'existing', type: 'imports.text', label: undefined, ref: node });
  const reader = nodeReadHandler({ revision: '1', modes: ['delimited'] });
  reader.validate(read.parameters, 'read_existing_output', read);
  assert.throws(() => reader.validate({ ...read.parameters, observed_schema: false }, 'read_existing_output', read), /schema/);
});

test('an observed-schema read accepts the fresh schema and still refuses ambiguity', () => {
  const columns = [{ index: 0, name: 'Id', label: 'Id', type: 'integer' }, { index: 1, name: 'Sum', label: 'Sum', type: 'real' }];
  assert.deepEqual(alignReadSchema(columns, null), columns);
  assert.throws(() => alignReadSchema([...columns, { index: 2, name: 'Id', label: 'Id2', type: 'integer' }], null), /ambiguous/);
  assert.throws(() => alignReadSchema([], null), /empty/);
});

test('unconfirmed calls are never a trigger and stop keeps the original gate', async () => {
  const f = fixture();
  await stopAtFinish(f);
  await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  await f.runtime.browserRecoveryHandoff('apply');
  const stopped = await f.runtime.stopBrowserRecovery({ operationId: 'apply' });
  assert.equal(stopped.state, 'retained');
  assert.equal((await f.runtime.inspect({ operationId: 'apply' })).output.state, 'pending');
  assert.throws(() => f.runtime.assertPreparationAllowed(), /uncertain/);
  assert.equal(f.runtime.hasUnsettledWork(), true);
});

function exportFixture() {
  const events = [], reads = [];
  const graph = { complete: true, document_id: 'doc', workflow_ref: workflow, nodes: [], links: [], foreign_links: [] };
  const adapter = { observe: async () => structuredClone(graph), preflight: async () => {},
    positionMatches: (n, p) => JSON.stringify(n.position) === JSON.stringify(p),
    reconcile: async () => ({ verified: true, cleanup_complete: true }),
    mutate: async e => { if (e.kind === 'create') graph.nodes.push({ ref: node, type: e.parameters.type, label: 'Export',
      position: e.parameters.position, inputs: [], outputs: [] }); return { status: 'SUCCEEDED', cleanup_complete: true }; } };
  const ok = async () => ({ verified: true, cleanup_complete: true, effect_possible: false });
  let operationRef;
  const refusal = operationId => Object.assign(Error('Download was not confirmed'), { nodePhaseRefusal: { phase: 'read', status: 'FAILED',
    effect_possible: true, cleanup_complete: true, settings_unchanged: true, verification: 'text_export_read_refused_restored',
    proof: { navigation_only: true, operation_id: operationId, lease_released: true,
      binding: { ...node, execution_id: 'exec', destination: '/user/out.csv', session_id: 'out' },
      restored: { verified: true, cleanup_complete: true, quiet: true, node_context: { ...node, verified: true, surface: 'graph', locked: false } } } } });
  const drivers = { verifySource: ok, mapPorts: ok, openWizard: ok,
    finish: async mode => ({ verified: true, cleanup_complete: true, mode, effect_possible: true, execution_id: 'exec', execution_started: true }),
    waitExecution: async () => ({ verified: true, cleanup_complete: true, status: 'completed', execution_id: 'exec' }),
    readOutput: async () => { operationRef.cleanupConfirmed = true; throw refusal(operationRef.id); },
    verifyContinuation: async () => true,
    releasePending: async () => { throw Error('not used'); },
    recoveryReadExport: async state => { reads.push(state.node.node_id);
      return { artifact_id: 'file-1', destination: '/user/out.csv', bytes: 42, sha256: 'a'.repeat(64), execution_id: 'exec' }; } };
  const handler = { revision: '1', fileOutput: true, modes: ['delimited'], validate: () => {}, configure: ok };
  const runtime = createActionRuntime({ pinned: { actions, selectors: new Map(), pins: {} }, allowCandidate: true, browserRecovery: true,
    execute: async () => { throw Error('Unexpected public transport'); },
    nodeTargetAdapterFactory: () => adapter, nodeApplyHandlers: new Map([['exports.text', handler]]),
    nodeApplyDriverFactory: ({ operation }) => { operationRef = operation; return drivers; },
    onRecord: async e => { events.push(e); return e; } });
  return { runtime, events, reads };
}

test('T4: an unconfirmed export download is recovered by a verified re-read without a new export', async () => {
  const { runtime, reads } = exportFixture();
  runtime.startNodeApply({ ...request('export'), target: { kind: 'new', type: 'exports.text', label: 'Export', position: { x: 320, y: 280 } } });
  const job = await runtime.waitNodeApply('export', { timeoutMs: 1000 });
  assert.equal(job.outcome.status, 'FAILED', JSON.stringify(job.outcome.error));
  assert.equal(job.outcome.output.next_step.tool, 'dock_browser_recovery');
  assert.equal(job.outcome.output.next_step.alternative_next_step.tool, 'dock_action_run');
  const basis = runtime.browserRecoveryBasis('export');
  assert.equal(basis.reason, 'EXPORT_DOWNLOAD_UNCONFIRMED');
  assert.equal((await runtime.browserRecoveryHandoff('export')).stopped, true);
  const verified = await runtime.verifyBrowserRecovery({ operationId: 'export', step: basis.step, attested: { actions_performed: ['Closed a dialog'] } });
  assert.equal(verified.status, 'completed');
  assert.deepEqual(verified.facts, ['export_file_storage_row_observed', 'export_file_bytes_verified']);
  assert.equal(verified.file_artifacts[0].sha256, 'a'.repeat(64));
  assert.deepEqual(reads, ['new']);
  assert.throws(() => runtime.browserRecoveryBasis('export'), /No browser recovery trigger/);
  const settled = runtime.nodeApplyStatus('export').outcome;
  assert.equal(settled.status, 'FAILED');
  assert.equal(settled.output.browser_recovery.file_artifacts[0].sha256, 'a'.repeat(64));
  assert.equal(settled.output.next_step.tool, 'dock_action_run');
});

test('handoff requires the same completed and cleaned-up last receipt as the node release', async () => {
  for (const cleanup of [false, true]) {
    const f = fixture();
    f.state.receipt = { cleanup };
    await stopAtFinish(f);
    await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
    const handoff = await f.runtime.browserRecoveryHandoff('apply');
    assert.equal(handoff.stopped, cleanup, JSON.stringify(handoff));
    if (!cleanup) assert.match(handoff.reason, /without confirmed cleanup/);
    if (cleanup) assert.equal(handoff.proof.cleanup_complete, true);
  }
});

test('an unknown recovery action outcome keeps Dock mutations blocked after stop', async () => {
  const f = fixture();
  await stopAtFinish(f);
  await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  await f.runtime.browserRecoveryHandoff('apply');
  const stopped = await f.runtime.stopBrowserRecovery({ operationId: 'apply', uncertain: true });
  assert.equal(stopped.state, 'retained_uncertain');
  assert.throws(() => f.runtime.startNodeApply(request('other')), /Browser recovery holds the page/);
  assert.equal(f.runtime.hasUnsettledWork(), true);
});

test('T4: a later export to the same file leaves the earlier download unconfirmed', async () => {
  const first = exportFixture();
  const target = { kind: 'new', type: 'exports.text', label: 'Export', position: { x: 320, y: 280 } };
  first.runtime.startNodeApply({ ...request('export'), target });
  assert.equal((await first.runtime.waitNodeApply('export', { timeoutMs: 1000 })).outcome.output.next_step.tool, 'dock_browser_recovery');
  // Another export to the same destination follows (its read is refused too, but it ran).
  first.runtime.startNodeApply({ ...request('export-2'), target: { kind: 'existing', type: 'exports.text', label: 'Export', ref: node } });
  const second = await first.runtime.waitNodeApply('export-2', { timeoutMs: 1000 });
  // The later export settled on its own; only the destination overlap ends eligibility.
  assert.equal(second.outcome.status, 'FAILED');
  assert.throws(() => first.runtime.browserRecoveryBasis('export'), /No browser recovery trigger/);
  assert.deepEqual(first.reads, []);
});
