import test from 'node:test';
import assert from 'node:assert/strict';
import { createSerialGate } from '../lib/clipboard.mjs';
import { createBrowserRecovery, parseRecoveryPageProbe, recoveryBrowserTools } from '../lib/browser-recovery.mjs';

const step = { key: 'doc|wf|node-1|mapping', document_id: 'doc', workflow_id: 'wf', node_id: 'node-1', phase: 'mapping' };
const catalog = [...recoveryBrowserTools, 'browser_navigate', 'browser_run_code_unsafe', 'browser_evaluate', 'browser_tabs']
  .map(name => ({ name, inputSchema: { type: 'object', properties: { target: { type: 'string' },
    ...(['browser_snapshot', 'browser_take_screenshot'].includes(name) ? { filename: { type: 'string' } } : {}) } } }));

function harness({ basis = () => ({ step, reason: 'NODE_RELEASE_REFUSED', goal: 'Close the wizard' }),
  handoff = () => ({ stopped: true, proof: { receipt: 'completed' } }), verify = () => ({ status: 'completed', facts: ['released'] }),
  probe = () => ({ ok: true }), callTool, now, record } = {}) {
  const events = [], calls = [], stops = [], verifies = [];
  const clock = { value: 1_000 };
  const recovery = createBrowserRecovery({
    enabled: true, gate: createSerialGate(), now: now ?? (() => clock.value),
    record: record ?? (async event => { events.push(event); return event; }),
    probe: async () => probe(),
    browser: { callTool: callTool ?? (async request => { calls.push(request);
      return { content: [{ type: 'text', text: 'ok ' + request.name }] }; }) },
    executor: {
      browserRecoveryBasis: operationId => basis(operationId),
      browserRecoveryHandoff: async () => handoff(),
      verifyBrowserRecovery: async input => { verifies.push(input); return verify(input); },
      stopBrowserRecovery: async input => { stops.push(input); return { state: 'retained', reason: 'pending kept' }; },
    },
  });
  return { recovery, events, calls, stops, verifies, clock };
}

const body = reply => JSON.parse(reply.content[0].text);
const names = tools => tools.map(tool => tool.name);

test('a disabled lease publishes and owns nothing', () => {
  const recovery = createBrowserRecovery({ enabled: false });
  assert.deepEqual(recovery.listTools(catalog), []);
  assert.equal(recovery.owns('dock_browser_recovery'), false);
  assert.equal(recovery.owns('browser_click'), false);
});

test('browser tools appear only in the browser phase and only from the allowlist', async () => {
  const h = harness();
  assert.deepEqual(names(h.recovery.listTools(catalog)), ['dock_browser_recovery']);
  const started = body(await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' }));
  assert.equal(started.phase, 'browser');
  assert.deepEqual(started.budget, { calls_left: 30, ms_left: 600_000 });
  const tools = h.recovery.listTools(catalog);
  assert.deepEqual(names(tools), ['dock_browser_recovery', ...recoveryBrowserTools]);
  for (const forbidden of ['browser_navigate', 'browser_run_code_unsafe', 'browser_evaluate', 'browser_tabs']) {
    assert.equal(h.recovery.owns(forbidden), false);
    assert.equal((await h.recovery.call(forbidden, {})).isError, true);
  }
  assert.equal(tools.find(tool => tool.name === 'browser_snapshot').inputSchema.properties.filename, undefined);
  assert.equal(catalog.find(tool => tool.name === 'browser_snapshot').inputSchema.properties.filename.type, 'string');
  assert.equal((await h.recovery.call('browser_snapshot', { filename: 'page.md' })).isError, true);
  assert.deepEqual(h.calls, []);
});

test('Dock control is refused while the lease is held; read-only calls stay available', async () => {
  const h = harness();
  assert.equal(h.recovery.refusesDock('dock_node_apply'), false);
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  for (const name of ['dock_node_apply', 'dock_node_read', 'dock_action_run', 'dock_prepare', 'dock_node_cancel'])
    assert.equal(h.recovery.refusesDock(name), true, name);
  for (const name of ['dock_node_status', 'dock_node_wait', 'dock_diagnostics', 'dock_action_describe', 'search'])
    assert.equal(h.recovery.refusesDock(name), false, name);
});

test('browser calls outside the browser phase are refused even when the name is known', async () => {
  const h = harness();
  assert.equal((await h.recovery.call('browser_click', { target: 'e1' })).isError, true);
  assert.deepEqual(h.calls, []);
});

test('an ineligible basis or unconfirmed executor stop never hands over the page', async () => {
  const refused = harness({ basis: () => { throw Error('No browser recovery trigger for op-1'); } });
  const reply = await refused.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  assert.equal(reply.isError, true);
  assert.match(reply.content[0].text, /No browser recovery trigger/);
  const live = harness({ handoff: () => ({ stopped: false, reason: 'receipt still running' }) });
  const stopped = body(await live.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' }));
  assert.equal(stopped.phase, 'stopped');
  assert.equal(stopped.stopped.code, 'executor_not_stopped');
  assert.deepEqual(names(live.recovery.listTools(catalog)), ['dock_browser_recovery']);
  assert.equal((await live.recovery.call('browser_click', { target: 'e1' })).isError, true);
  assert.deepEqual(live.calls, []);
});

test('each action runs under the lease, is journaled by hash and reports the remaining budget', async () => {
  const h = harness({ callTool: async request => ({ content: [{ type: 'text', text: 'clicked' },
    { type: 'image', mimeType: 'image/png', data: Buffer.from('png-bytes').toString('base64') }] }) });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const reply = await h.recovery.call('browser_click', { target: 'e1', element: 'Отмена' });
  assert.equal(reply.isError, undefined);
  assert.equal(reply.content[0].text, 'clicked');
  assert.equal(reply.content[1].type, 'image');
  assert.deepEqual(JSON.parse(reply.content[2].text), { browser_recovery: { calls_left: 29, ms_left: 600_000 } });
  const action = h.events.find(event => event.phase === 'browser_recovery_action');
  assert.equal(action.tool, 'browser_click');
  assert.match(action.arguments_sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(action).includes('Отмена'), false);
  assert.deepEqual(action.content[1], { type: 'image', mime_type: 'image/png', bytes: 9,
    sha256: action.content[1].sha256 });
  assert.equal(JSON.stringify(h.events).includes(Buffer.from('png-bytes').toString('base64')), false);
});

test('text output is bounded while images are not counted against the text budget', async () => {
  const large = 'x'.repeat(50_000);
  const h = harness({ callTool: async () => ({ content: [{ type: 'text', text: large },
    { type: 'image', mimeType: 'image/png', data: 'A'.repeat(80_000) }] }) });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const reply = await h.recovery.call('browser_snapshot', {});
  assert.equal(Buffer.byteLength(reply.content[0].text), 46_000);
  assert.equal(reply.content[1].data.length, 80_000);
  assert.match(reply.content[2].text, /Output truncated/);
});

test('a changed page, origin or document stops the attempt and closes the step', async () => {
  let probes = 0;
  const h = harness({ probe: () => (++probes > 1 ? { ok: false, reason: 'origin changed' } : { ok: true }) });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const stopped = body(await h.recovery.call('browser_click', { target: 'e1' }));
  assert.equal(stopped.phase, 'stopped');
  assert.equal(stopped.stopped.code, 'page_changed');
  assert.equal(h.stops.length, 1);
  assert.equal(h.recovery.refusesDock('dock_node_apply'), false);
  const again = await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-2' });
  assert.equal(again.isError, true);
});

test('the call and time budget is shared by the step across operation IDs and re-entries', async () => {
  const h = harness({ verify: () => ({ status: 'continuable', facts: ['released'] }) });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  for (let i = 0; i < 20; i++) await h.recovery.call('browser_hover', { target: 'e1' });
  const verified = body(await h.recovery.call('dock_browser_recovery',
    { action: 'finish', operation_id: 'op-1', actions_performed: ['Closed the wizard'] }));
  assert.equal(verified.phase, 'dock');
  assert.equal(verified.verification.status, 'continuable');
  assert.deepEqual(verified.verification.attested_by_model.actions_performed, ['Closed the wizard']);
  // T3: the same phase failed again under a new operation ID; the budget continues.
  const resumed = body(await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-2' }));
  assert.equal(resumed.budget.calls_left, 10);
  for (let i = 0; i < 10; i++) assert.equal((await h.recovery.call('browser_hover', { target: 'e1' })).isError, undefined);
  const exhausted = body(await h.recovery.call('browser_hover', { target: 'e1' }));
  assert.equal(exhausted.stopped.code, 'budget_exhausted');
  assert.equal(h.calls.length, 30);
  const refused = await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-3' });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /exhausted/);

  const timed = harness();
  await timed.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  timed.clock.value += 600_000;
  assert.equal(body(await timed.recovery.call('browser_click', { target: 'e1' })).stopped.code, 'budget_exhausted');
  assert.deepEqual(timed.calls, []);
});

test('a late action reply after stop is not evidence and does not regain the page', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness({ callTool: async () => { await pending; return { content: [{ type: 'text', text: 'late' }] }; } });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const action = h.recovery.call('browser_click', { target: 'e1' });
  await new Promise(resolve => setImmediate(resolve));
  // The stop waits for the dispatched action before it releases the page.
  const stopping = h.recovery.call('dock_browser_recovery', { action: 'stop', operation_id: 'op-1', reason: 'cancelled' });
  release();
  const [late, stopped] = await Promise.all([action, stopping.then(body)]);
  assert.equal(stopped.phase, 'stopped');
  assert.equal(late.isError, true);
  assert.match(late.content[0].text, /not evidence/);
  assert.deepEqual(names(h.recovery.listTools(catalog)), ['dock_browser_recovery']);
});

test('finish verification decides between Dock, more browser work and stop', async () => {
  const completed = harness();
  await completed.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const done = body(await completed.recovery.call('dock_browser_recovery', { action: 'finish', operation_id: 'op-1',
    actions_performed: ['Mapped fields'], browser_settings: ['Field A -> B'] }));
  assert.equal(done.phase, 'dock');
  assert.equal(done.verification.status, 'completed');
  assert.deepEqual(done.verification.attested_by_model.browser_settings, ['Field A -> B']);
  assert.equal((await completed.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-2' })).isError, true);

  const unresolved = harness({ verify: () => ({ status: 'unresolved', facts: [], reason: 'wizard still open' }) });
  await unresolved.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const more = body(await unresolved.recovery.call('dock_browser_recovery', { action: 'finish', operation_id: 'op-1',
    actions_performed: ['Clicked Cancel'] }));
  assert.equal(more.phase, 'browser');
  assert.equal(more.verification.status, 'unresolved');

  const finishRequiresActions = await unresolved.recovery.call('dock_browser_recovery', { action: 'finish', operation_id: 'op-1' });
  assert.equal(finishRequiresActions.isError, true);
});

test('the page probe accepts only one page on the prepared origin and document', () => {
  const binding = { origin: 'https://app.loginom.ai', documentId: 'doc' };
  const reply = value => ({ content: [{ type: 'text', text: '### Result\n' + JSON.stringify(JSON.stringify(value)) + '\n### Ran Playwright code' }] });
  assert.deepEqual(parseRecoveryPageProbe(reply({ kind: 'browser_recovery_page', pages: 1, origin: 'https://app.loginom.ai', document_id: 'doc' }), binding), { ok: true });
  assert.equal(parseRecoveryPageProbe(reply({ kind: 'browser_recovery_page', pages: 2, origin: 'https://app.loginom.ai', document_id: 'doc' }), binding).ok, false);
  assert.equal(parseRecoveryPageProbe(reply({ kind: 'browser_recovery_page', pages: 1, origin: 'https://evil.test', document_id: 'doc' }), binding).ok, false);
  assert.equal(parseRecoveryPageProbe(reply({ kind: 'browser_recovery_page', pages: 1, origin: 'https://app.loginom.ai', document_id: null }), binding).ok, false);
  assert.equal(parseRecoveryPageProbe({ isError: true, content: [] }, binding).ok, false);
});

test('an action whose outcome is unknown keeps Dock blocked after the attempt stops', async () => {
  const h = harness({ callTool: async () => { throw Error('MCP request timed out'); } });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const stopped = body(await h.recovery.call('browser_click', { target: 'e1' }));
  assert.equal(stopped.phase, 'stopped');
  assert.equal(stopped.stopped.code, 'browser_unavailable');
  assert.equal(h.stops.at(-1).uncertain, true);
  assert.equal(h.recovery.unsettled(), true);
  assert.equal(h.recovery.refusesDock('dock_node_apply'), true);
  assert.equal(h.recovery.refusesDock('dock_node_status'), false);
  const again = await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  assert.equal(again.isError, true);
  assert.match(again.content[0].text, /unknown outcome/);
});

test('a tool-level browser error keeps the lease and the browser phase', async () => {
  const h = harness({ callTool: async () => ({ isError: true, content: [{ type: 'text', text: 'Element not found' }] }) });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const failed = await h.recovery.call('browser_click', { target: 'missing' });
  assert.equal(failed.isError, true);
  assert.equal(h.recovery.active(), true);
  assert.equal(h.recovery.refusesDock('dock_node_apply'), true);
  assert.deepEqual(h.stops, []);
});

test('an unknown outcome is latched before a failed page check can release the page', async () => {
  let probes = 0;
  const h = harness({ callTool: async () => { throw Error('transport closed'); },
    probe: () => { if (++probes > 1) throw Error('page gone'); return { ok: true }; } });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const stopped = body(await h.recovery.call('browser_click', { target: 'e1' }));
  assert.equal(stopped.stopped.code, 'browser_unavailable');
  assert.equal(h.stops.at(-1).uncertain, true);
  assert.equal(h.recovery.refusesDock('dock_action_run'), true);
});

test('a journal failure after an unknown outcome still keeps Dock blocked', async () => {
  const h = harness({ callTool: async () => { throw Error('transport closed'); },
    record: async event => { if (event.phase === 'browser_recovery_action') throw Error('disk full'); return event; } });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  await assert.rejects(h.recovery.call('browser_click', { target: 'e1' }), /disk full/);
  assert.equal(h.recovery.unsettled(), true);
  assert.equal(h.recovery.refusesDock('dock_node_apply'), true);
});

for (const late of ['error', 'success'])
  test('stop during a dispatched action waits for it; a late ' + late + ' decides the lease', async () => {
    let settle;
    const pending = new Promise((resolve, reject) => { settle = late === 'error' ? () => reject(Error('timed out')) : () => resolve({ content: [{ type: 'text', text: 'done' }] }); });
    const h = harness({ callTool: () => pending });
    await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
    const action = h.recovery.call('browser_click', { target: 'e1' });
    await new Promise(resolve => setImmediate(resolve));
    const stopping = h.recovery.call('dock_browser_recovery', { action: 'stop', operation_id: 'op-1', reason: 'cancelled' });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(h.stops, [], 'the executor lease stays while the action is in flight');
    settle();
    const [late_reply, stopped] = await Promise.all([action, stopping]);
    assert.equal(late_reply.isError, true);
    assert.equal(body(stopped).phase, 'stopped');
    assert.equal(h.stops.at(-1).uncertain, late === 'error');
    assert.equal(h.recovery.refusesDock('dock_node_apply'), late === 'error');
  });

test('a failed gesture requires an observation before the next gesture', async () => {
  let calls = 0;
  const h = harness({ callTool: async request => { calls++;
    return request.name === 'browser_click' && calls === 1 ? { isError: true, content: [{ type: 'text', text: 'Timeout after click' }] }
      : { content: [{ type: 'text', text: 'ok' }] }; } });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  assert.equal((await h.recovery.call('browser_click', { target: 'e1' })).isError, true);
  const refused = await h.recovery.call('browser_click', { target: 'e1' });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /Observe the page/);
  assert.equal(calls, 1);
  assert.equal((await h.recovery.call('browser_snapshot', { depth: 2 })).isError, undefined);
  assert.equal((await h.recovery.call('browser_click', { target: 'e1' })).isError, undefined);
  assert.equal(calls, 3);
});

test('after an unknown outcome and a failed journal no further gesture reaches the browser', async () => {
  let calls = 0;
  const h = harness({ callTool: async () => { calls++; throw Error('transport closed'); },
    record: async event => { if (event.phase === 'browser_recovery_action') throw Error('disk full'); return event; } });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  await assert.rejects(h.recovery.call('browser_click', { target: 'e1' }), /disk full/);
  const next = await h.recovery.call('browser_click', { target: 'e2' });
  assert.equal(next.isError, true);
  assert.match(next.content[0].text, /unknown outcome/);
  assert.equal(calls, 1);
});

for (const first of ['isError', 'transport'])
  test('a gesture queued behind a failed one (' + first + ') is rechecked inside the gate', async () => {
    let release, calls = 0;
    const blocked = new Promise(resolve => { release = resolve; });
    const h = harness({ callTool: async () => {
      calls++;
      if (calls > 1) return { content: [{ type: 'text', text: 'second gesture ran' }] };
      await blocked;
      if (first === 'transport') throw Error('transport closed');
      return { isError: true, content: [{ type: 'text', text: 'Timeout after click' }] };
    } });
    await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
    const a = h.recovery.call('browser_click', { target: 'e1' });
    const b = h.recovery.call('browser_click', { target: 'e2' });
    await new Promise(resolve => setImmediate(resolve));
    release();
    await a;
    const queued = await b;
    assert.equal(queued.isError, true, JSON.stringify(queued));
    assert.equal(calls, 1);
  });

test('stopping keeps Dock blocked until the dispatched action settles', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness({ callTool: () => pending.then(() => ({ content: [{ type: 'text', text: 'done' }] })) });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const action = h.recovery.call('browser_click', { target: 'e1' });
  await new Promise(resolve => setImmediate(resolve));
  const stopping = h.recovery.call('dock_browser_recovery', { action: 'stop', operation_id: 'op-1', reason: 'cancelled' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.recovery.refusesDock('dock_action_run'), true);
  assert.equal(h.recovery.unsettled(), true);
  assert.equal((await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-2' })).isError, true);
  release();
  await Promise.all([action, stopping]);
  assert.equal(h.recovery.refusesDock('dock_action_run'), false);
});

const failingJournal = async event => { if (event.phase === 'browser_recovery_action') throw Error('disk full'); return event; };

for (const failure of ['transport', 'page'])
  test('after a ' + failure + ' failure and a failed journal neither a gesture nor finish runs', async () => {
    let calls = 0;
    const h = harness({ record: failingJournal,
      callTool: async () => { calls++; if (failure === 'transport') throw Error('transport closed'); return { content: [{ type: 'text', text: 'ok' }] }; },
      probe: () => (failure === 'page' && calls > 0 ? { ok: false, reason: 'second page opened' } : { ok: true }) });
    await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
    await assert.rejects(h.recovery.call('browser_click', { target: 'e1' }), /disk full/);
    assert.equal((await h.recovery.call('browser_click', { target: 'e2' })).isError, true);
    assert.equal((await h.recovery.call('dock_browser_recovery', { action: 'finish', operation_id: 'op-1',
      actions_performed: ['Clicked'] })).isError, true);
    assert.equal(calls, 1);
    assert.deepEqual(h.verifies, []);
    assert.equal(h.recovery.refusesDock('dock_node_apply'), true);
  });

for (const failure of ['transport', 'page'])
  test('a gesture and a finish queued behind a ' + failure + ' failure are refused inside the gate', async () => {
    let release, calls = 0;
    const blockedCall = new Promise(resolve => { release = resolve; });
    const h = harness({
      callTool: async () => { calls++; if (calls > 1) return { content: [{ type: 'text', text: 'ran' }] };
        await blockedCall; if (failure === 'transport') throw Error('transport closed'); return { content: [{ type: 'text', text: 'ok' }] }; },
      probe: () => (failure === 'page' && calls === 1 ? { ok: false, reason: 'origin changed' } : { ok: true }) });
    await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
    const a = h.recovery.call('browser_click', { target: 'e1' });
    const b = h.recovery.call('browser_click', { target: 'e2' });
    await new Promise(resolve => setImmediate(resolve));
    release();
    const [, queued] = await Promise.all([a, b]);
    assert.equal(queued.isError, true);
    assert.equal(calls, 1);
    assert.deepEqual(h.verifies, []);
  });

test('a finish queued behind an unknown outcome stops without running the verifier', async () => {
  let release;
  const pending = new Promise((_, reject) => { release = () => reject(Error('transport closed')); });
  const h = harness({ callTool: () => pending });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const action = h.recovery.call('browser_click', { target: 'e1' });
  await new Promise(resolve => setImmediate(resolve));
  const finishing = h.recovery.call('dock_browser_recovery', { action: 'finish', operation_id: 'op-1', actions_performed: ['Clicked'] });
  await new Promise(resolve => setImmediate(resolve));
  release();
  const [, finished] = await Promise.all([action, finishing]);
  assert.deepEqual(h.verifies, []);
  assert.equal(body(finished).stopped.code, 'browser_unavailable');
  assert.equal(h.stops.at(-1).uncertain, true);
});

test('finish stays available after a failed gesture; the verifier reads the facts', async () => {
  const h = harness({ callTool: async () => ({ isError: true, content: [{ type: 'text', text: 'Timeout after click' }] }) });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  await h.recovery.call('browser_click', { target: 'e1' });
  const finished = body(await h.recovery.call('dock_browser_recovery', { action: 'finish', operation_id: 'op-1', actions_performed: ['Clicked'] }));
  assert.equal(finished.phase, 'dock');
  assert.equal(h.verifies.length, 1);
});

test('a lost page survives stop: the step stays closed and a new hand-over checks the page first', async () => {
  let release, pageOk = true;
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness({ callTool: () => pending.then(() => ({ content: [{ type: 'text', text: 'done' }] })),
    probe: () => (pageOk ? { ok: true } : { ok: false, reason: 'second page opened' }) });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const action = h.recovery.call('browser_click', { target: 'e1' });
  await new Promise(resolve => setImmediate(resolve));
  const stopping = h.recovery.call('dock_browser_recovery', { action: 'stop', operation_id: 'op-1', reason: 'cancelled' });
  pageOk = false;
  release();
  await Promise.all([action, stopping]);
  const again = await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-2' });
  assert.equal(again.isError, true);
  assert.match(again.content[0].text, /already completed or stopped|outside recovery bounds/);
});

test('a new hand-over is refused while the page is outside recovery bounds', async () => {
  const h = harness({ probe: () => ({ ok: false, reason: 'origin changed' }) });
  const refused = await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /outside recovery bounds/);
  assert.equal(h.recovery.active(), false);
});

test('concurrent starts admit one attempt; the second is refused while the first holds the page', async () => {
  let release;
  const handoff = new Promise(resolve => { release = resolve; });
  const h = harness({ handoff: () => handoff.then(() => ({ stopped: true, proof: {} })) });
  const first = h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const second = await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-2' });
  assert.equal(second.isError, true);
  release();
  assert.equal(body(await first).operation_id, 'op-1');
});

test('closing the prepared scenario tab is a lost page boundary', () => {
  const binding = { origin: 'https://app.loginom.ai', documentId: 'doc', tabTid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1' };
  const reply = value => ({ content: [{ type: 'text', text: '### Result\n' + JSON.stringify(JSON.stringify(value)) }] });
  const base = { kind: 'browser_recovery_page', pages: 1, origin: 'https://app.loginom.ai', document_id: 'doc' };
  assert.deepEqual(parseRecoveryPageProbe(reply({ ...base, tab_present: true }), binding), { ok: true });
  assert.deepEqual(parseRecoveryPageProbe(reply({ ...base, tab_present: false }), binding), { ok: false, reason: 'prepared scenario tab closed' });
});

test('a stop during handoff wins: the late handoff never activates the attempt', async () => {
  let release;
  const handoff = new Promise(resolve => { release = resolve; });
  const h = harness({ handoff: () => handoff.then(() => ({ stopped: true, proof: {} })) });
  const starting = h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  await new Promise(resolve => setImmediate(resolve));
  const stopping = h.recovery.call('dock_browser_recovery', { action: 'stop', operation_id: 'op-1', reason: 'cancelled' });
  release();
  const [, stopped] = await Promise.all([starting, stopping]);
  assert.equal(body(stopped).phase, 'stopped');
  assert.equal(h.recovery.active(), false);
  assert.deepEqual(h.recovery.listTools([{ name: 'browser_click', inputSchema: { type: 'object' } }]).map(t => t.name), ['dock_browser_recovery']);
});

test('a stop during the final finish journal is not undone by the verification', async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const h = harness({ record: async event => { if (event.phase === 'browser_recovery_verified') await delayed; return event; } });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const finishing = h.recovery.call('dock_browser_recovery', { action: 'finish', operation_id: 'op-1', actions_performed: ['Clicked'] });
  await new Promise(resolve => setImmediate(resolve));
  const stopping = h.recovery.call('dock_browser_recovery', { action: 'stop', operation_id: 'op-1', reason: 'cancelled' });
  release();
  await Promise.all([finishing, stopping]);
  assert.equal(h.recovery.active(), false);
  assert.equal(JSON.parse((await h.recovery.call('browser_click', { target: 'e1' })).content[0].text).refused !== undefined, true);
});

test('an unknown outcome inside verification blocks like an unknown browser action', async () => {
  let calls = 0;
  const h = harness({ verify: () => ({ status: 'unresolved', facts: [], reason: 'Cancel call timed out', uncertain: true }),
    callTool: async () => { calls++; return { content: [{ type: 'text', text: 'ok' }] }; } });
  await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' });
  const finished = body(await h.recovery.call('dock_browser_recovery', { action: 'finish', operation_id: 'op-1', actions_performed: ['Clicked'] }));
  assert.equal(finished.stopped.code, 'browser_unavailable');
  assert.equal(h.stops.at(-1).uncertain, true);
  assert.equal(h.recovery.refusesDock('dock_node_apply'), true);
  assert.equal((await h.recovery.call('dock_browser_recovery', { action: 'start', operation_id: 'op-1' })).isError, true);
  assert.equal(calls, 0);
});
