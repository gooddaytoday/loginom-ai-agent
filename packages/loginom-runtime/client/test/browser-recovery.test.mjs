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
  probe = () => ({ ok: true }), callTool, now } = {}) {
  const events = [], calls = [], stops = [];
  const clock = { value: 1_000 };
  const recovery = createBrowserRecovery({
    enabled: true, gate: createSerialGate(), now: now ?? (() => clock.value),
    record: async event => { events.push(event); return event; },
    probe: async () => probe(),
    browser: { callTool: callTool ?? (async request => { calls.push(request);
      return { content: [{ type: 'text', text: 'ok ' + request.name }] }; }) },
    executor: {
      browserRecoveryBasis: operationId => basis(operationId),
      browserRecoveryHandoff: async () => handoff(),
      verifyBrowserRecovery: async input => verify(input),
      stopBrowserRecovery: async input => { stops.push(input); return { state: 'retained', reason: 'pending kept' }; },
    },
  });
  return { recovery, events, calls, stops, clock };
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
  const h = harness({ probe: () => ({ ok: false, reason: 'origin changed' }) });
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
  const stopped = body(await h.recovery.call('dock_browser_recovery', { action: 'stop', operation_id: 'op-1', reason: 'cancelled' }));
  assert.equal(stopped.phase, 'stopped');
  release();
  const late = await action;
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
