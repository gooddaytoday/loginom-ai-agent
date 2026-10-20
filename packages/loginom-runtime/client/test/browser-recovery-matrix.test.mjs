import test from 'node:test';
import assert from 'node:assert/strict';
import { createSerialGate } from '../lib/clipboard.mjs';
import { createBrowserRecovery } from '../lib/browser-recovery.mjs';

// Every entry against every failure point: after a blocking event no browser call or
// verifier runs, Dock stays refused for mutations, and the attempt still reaches stopped.
const step = { key: 'doc|wf|node|read', kind: 'node', phase: 'read' };
const failures = {
  transport: { blocking: true, unknown: true, call: async () => { throw Error('transport closed'); } },
  isError: { blocking: false, call: async () => ({ isError: true, content: [{ type: 'text', text: 'Timeout after click' }] }) },
  probeThrows: { blocking: true, unknown: true, probe: () => { throw Error('page gone'); } },
  // A proven boundary change stops the attempt and hands the page back to Dock, which rechecks its own document.
  probeFails: { blocking: true, probe: () => ({ ok: false, reason: 'second page opened' }) },
  journal: { blocking: true, unknown: true, journal: true },
};

function harness(failure, { hold = false } = {}) {
  const counts = { calls: 0, verifies: 0 }, stops = [];
  let release;
  const held = hold ? new Promise(resolve => { release = resolve; }) : null;
  const recovery = createBrowserRecovery({
    enabled: true, gate: createSerialGate(), now: () => 1_000,
    record: async event => {
      if (failure.journal && event.phase === 'browser_recovery_action' && counts.calls === 1) throw Error('disk full');
      return event;
    },
    probe: async () => (counts.calls === 1 && failure.probe ? failure.probe() : { ok: true }),
    browser: { callTool: async () => {
      counts.calls++;
      if (counts.calls === 1) { if (held) await held; if (failure.call) return failure.call(); }
      return { content: [{ type: 'text', text: 'ok' }] };
    } },
    executor: {
      browserRecoveryBasis: () => ({ step, reason: 'NO_RECOVERY_OPTION' }),
      browserRecoveryHandoff: async () => ({ stopped: true, proof: {} }),
      verifyBrowserRecovery: async () => { counts.verifies++; return { status: 'continuable', facts: ['released'] }; },
      stopBrowserRecovery: async input => { stops.push(input); return { state: input.uncertain ? 'retained_uncertain' : 'released' }; },
    },
  });
  return { recovery, counts, stops, release: () => release?.() };
}

const start = h => h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
const finish = h => h.recovery.call('dock_browser_recovery', { action: 'finish', operation_id: 'op-1', actions_performed: ['Clicked'] });
const phase = reply => JSON.parse(reply.content[0].text).phase;
const entries = {
  readOnly: h => h.recovery.call('browser_snapshot', { depth: 2 }),
  gesture: h => h.recovery.call('browser_click', { target: 'e2' }),
  finish,
};

for (const [name, failure] of Object.entries(failures)) {
  test('sequential entries after ' + name, async () => {
    for (const [entry, run] of Object.entries(entries)) {
      const h = harness(failure);
      await start(h);
      await h.recovery.call('browser_click', { target: 'e1' }).catch(error => assert.match(error.message, /disk full/));
      const reply = await run(h);
      const ran = { calls: h.counts.calls, verifies: h.counts.verifies };
      if (failure.blocking) {
        assert.equal(reply.isError === true || phase(reply) === 'stopped', true, entry + ': ' + JSON.stringify(reply));
        assert.deepEqual(ran, { calls: 1, verifies: 0 }, entry);
        assert.equal(h.recovery.refusesDock('dock_node_apply'), h.recovery.active() || !!failure.unknown, entry);
        if (failure.unknown) assert.equal((await start(h)).isError, true, entry + ' start');
      } else {
        // A refused tool call keeps the lease; only a further mutating gesture waits for an observation.
        assert.equal(reply.isError === true, entry === 'gesture', entry);
        assert.equal(ran.verifies, entry === 'finish' ? 1 : 0, entry);
      }
      // The attempt can always be brought to stopped.
      if (h.recovery.active()) {
        const stopped = await h.recovery.call('dock_browser_recovery', { action: 'stop', operation_id: 'op-1', reason: 'done' });
        assert.equal(phase(stopped), 'stopped', entry + ' stop: ' + JSON.stringify(stopped));
      }
      assert.equal(h.recovery.active(), false, entry);
      // Only an unknown action or journal outcome keeps the executor lease; a lost page releases it.
      if (failure.blocking) assert.equal(h.stops.at(-1).uncertain, !!failure.unknown, entry);
      assert.equal(h.recovery.refusesDock('dock_node_apply'), !!failure.unknown, entry + ' after stop');
    }
  });

  if (!failure.journal) test('queued entries behind ' + name, async () => {
    for (const [entry, run] of Object.entries(entries)) {
      const h = harness(failure, { hold: true });
      await start(h);
      const first = h.recovery.call('browser_click', { target: 'e1' });
      const queued = run(h);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(h.recovery.refusesDock('dock_node_apply'), true, entry + ' while in flight');
      h.release();
      const [, reply] = await Promise.all([first, queued]);
      if (failure.blocking) {
        assert.equal(reply.isError === true || phase(reply) === 'stopped', true, entry + ': ' + JSON.stringify(reply));
        assert.deepEqual({ calls: h.counts.calls, verifies: h.counts.verifies }, { calls: 1, verifies: 0 }, entry);
        assert.equal(h.recovery.refusesDock('dock_node_apply'), h.recovery.active() || !!failure.unknown, entry);
      }
      if (h.recovery.active())
        assert.equal(phase(await h.recovery.call('dock_browser_recovery', { action: 'stop', operation_id: 'op-1', reason: 'done' })), 'stopped');
      assert.equal(h.recovery.active(), false, entry);
    }
  });
}

test('a failed verifier keeps the browser phase; a failed executor stop still reaches stopped', async () => {
  const h = harness({});
  h.recovery = createBrowserRecovery({ enabled: true, gate: createSerialGate(), now: () => 1_000, record: async e => e, probe: async () => ({ ok: true }),
    browser: { callTool: async () => ({ content: [{ type: 'text', text: 'ok' }] }) },
    executor: { browserRecoveryBasis: () => ({ step, reason: 'NO_RECOVERY_OPTION' }), browserRecoveryHandoff: async () => ({ stopped: true }),
      verifyBrowserRecovery: async () => { throw Error('release proof failed'); },
      stopBrowserRecovery: async () => { throw Error('cleanup failed'); } } });
  await start(h);
  const verified = JSON.parse((await finish(h)).content[0].text);
  assert.equal(verified.phase, 'browser');
  assert.equal(verified.verification.status, 'unresolved');
  const stopped = JSON.parse((await h.recovery.call('dock_browser_recovery', { action: 'stop', operation_id: 'op-1' })).content[0].text);
  assert.equal(stopped.phase, 'stopped');
  assert.equal(stopped.stopped.cleanup.state, 'retained');
});

test('a journal failure during start or finish still lets the attempt reach stopped with Dock blocked', async () => {
  for (const failing of ['browser_recovery_handoff', 'browser_recovery_attested', 'browser_recovery_verified']) {
    const counts = { verifies: 0 };
    const recovery = createBrowserRecovery({ enabled: true, gate: createSerialGate(), now: () => 1_000,
      record: async event => { if (event.phase === failing) throw Error('disk full'); return event; }, probe: async () => ({ ok: true }),
      browser: { callTool: async () => ({ content: [{ type: 'text', text: 'ok' }] }) },
      executor: { browserRecoveryBasis: () => ({ step, reason: 'NO_RECOVERY_OPTION' }), browserRecoveryHandoff: async () => ({ stopped: true }),
        verifyBrowserRecovery: async () => { counts.verifies++; return { status: 'continuable', facts: [] }; },
        stopBrowserRecovery: async input => ({ state: input.uncertain ? 'retained_uncertain' : 'released' }) } });
    const h = { recovery };
    await start(h).catch(error => assert.match(error.message, /disk full/));
    if (failing !== 'browser_recovery_handoff') await finish(h).catch(error => assert.match(error.message, /disk full/));
    assert.equal(recovery.refusesDock('dock_node_apply'), true, failing);
    const stopped = JSON.parse((await recovery.call('dock_browser_recovery', { action: 'stop', operation_id: 'op-1' })).content[0].text);
    assert.equal(stopped.phase, 'stopped', failing);
    assert.equal(stopped.stopped.cleanup.state, 'retained_uncertain', failing);
    assert.equal(recovery.refusesDock('dock_node_apply'), true, failing);
  }
});
