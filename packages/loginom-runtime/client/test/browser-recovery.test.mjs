import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {ToolSchema} from '@modelcontextprotocol/sdk/types.js';
import {createConnection} from '@playwright/mcp';
import {createBrowserRecovery, RECOVERY_BROWSER_TOOLS, browserRecoveryTool, recoveryBrowserCatalog, admitRecoveryBrowserCall, parseRecoveryPageProbe} from '../lib/browser-recovery.mjs';

async function pinnedBrowserTools() {
  const server = await createConnection({capabilities: ['core', 'vision'], snapshot: {mode: 'none'}}, async () => {
    throw Error('no browser');
  });
  const client = new Client({name: 'recovery-catalog-test', version: '1'});
  const [agentTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(agentTransport);
    return (await client.listTools()).tools;
  } finally {
    await client.close();
    await server.close();
  }
}

test('publishes exactly the 16 recovery tools from pinned MCP without filename', async () => {
  const browserTools = await pinnedBrowserTools();
  const published = recoveryBrowserCatalog(browserTools);
  assert.deepEqual(RECOVERY_BROWSER_TOOLS, [
    'browser_snapshot', 'browser_find', 'browser_take_screenshot', 'browser_click',
    'browser_hover', 'browser_type', 'browser_press_key', 'browser_fill_form',
    'browser_select_option', 'browser_drag', 'browser_mouse_click_xy',
    'browser_mouse_move_xy', 'browser_mouse_drag_xy', 'browser_mouse_wheel',
    'browser_handle_dialog', 'browser_wait_for',
  ]);
  assert.equal(Object.isFrozen(RECOVERY_BROWSER_TOOLS), true);
  assert.deepEqual(published.map(tool => tool.name).sort(), [...RECOVERY_BROWSER_TOOLS].sort());
  for (const tool of published) {
    assert.deepEqual(Object.keys(tool.inputSchema.properties).filter(key => key !== 'filename').sort(),
      Object.keys(browserTools.find(original => original.name === tool.name).inputSchema.properties).filter(key => key !== 'filename').sort());
    assert.equal('filename' in tool.inputSchema.properties, false);
  }
  assert.deepEqual(Object.keys(published.find(tool => tool.name === 'browser_snapshot').inputSchema.properties).sort(), ['boxes', 'depth', 'target']);
  assert.equal('filename' in browserTools.find(tool => tool.name === 'browser_snapshot').inputSchema.properties, true);
  assert.deepEqual(published.find(tool => tool.name === 'browser_take_screenshot').inputSchema.required, ['scale']);
  assert.deepEqual(Object.keys(published.find(tool => tool.name === 'browser_find').inputSchema.properties).sort(), ['regex', 'text']);
  assert.equal(browserRecoveryTool.name, 'dock_browser_recovery');
  assert.doesNotThrow(() => ToolSchema.parse(browserRecoveryTool));
  assert.equal(browserRecoveryTool.inputSchema.oneOf.length, 3);
  for (const branch of browserRecoveryTool.inputSchema.oneOf) assert.equal(branch.additionalProperties, false);
  assert.deepEqual(browserRecoveryTool.inputSchema.oneOf.map(branch => branch.properties.action.const), ['start', 'finish', 'stop']);
  assert.deepEqual(browserRecoveryTool.inputSchema.oneOf.map(branch => branch.required),
    [['action', 'operation_id'], ['action', 'report'], ['action', 'reason']]);
  assert.equal(browserRecoveryTool.inputSchema.oneOf[2].properties.reason.maxLength, 1000);
  assert.deepEqual(browserRecoveryTool.inputSchema.oneOf.find(branch => branch.properties.action.const === 'finish').properties.report,
    {type: 'object', additionalProperties: false, required: ['actions', 'result', 'settings'], properties: {
      actions: {type: 'array', maxItems: 30, items: {type: 'string', maxLength: 500}},
      result: {type: 'string', maxLength: 2000},
      settings: {type: 'array', maxItems: 50, items: {type: 'string', maxLength: 500}},
    }});
});

test('refuses a pinned catalog missing any recovery tool', async () => {
  const browserTools = await pinnedBrowserTools();
  for (const name of RECOVERY_BROWSER_TOOLS) {
    assert.throws(() => recoveryBrowserCatalog(browserTools.filter(tool => tool.name !== name)),
      error => error.message.includes(name));
  }
});

test('refuses forbidden tool names and unpublished arguments before a browser call', async () => {
  const browserTools = await pinnedBrowserTools();
  const published = recoveryBrowserCatalog(browserTools);
  for (const tool of browserTools.filter(tool => !RECOVERY_BROWSER_TOOLS.includes(tool.name))) {
    assert.throws(() => admitRecoveryBrowserCall(tool.name, {}, published), /BROWSER_RECOVERY_TOOL_FORBIDDEN/);
  }
  for (const name of ['browser_press_sequentially', 'browser_check', 'browser_uncheck', 'browser_webmcp_anything']) {
    assert.throws(() => admitRecoveryBrowserCall(name, {}, published), /BROWSER_RECOVERY_TOOL_FORBIDDEN/);
  }
  assert.throws(() => admitRecoveryBrowserCall('browser_find', {text: 'Node'},
    published.filter(tool => tool.name !== 'browser_find')), /BROWSER_RECOVERY_TOOL_FORBIDDEN/);
  for (const tool of published) {
    assert.throws(() => admitRecoveryBrowserCall(tool.name, {unpublished: true}, published), /BROWSER_RECOVERY_ARGUMENT_FORBIDDEN/);
  }
  assert.throws(() => admitRecoveryBrowserCall('browser_snapshot', {filename: 'page.yml'}, published), /BROWSER_RECOVERY_ARGUMENT_FORBIDDEN/);
  assert.throws(() => admitRecoveryBrowserCall('browser_take_screenshot', {filename: 'page.png', scale: 'css'}, published), /BROWSER_RECOVERY_ARGUMENT_FORBIDDEN/);
  assert.throws(() => admitRecoveryBrowserCall('browser_take_screenshot', {}, published), /BROWSER_RECOVERY_ARGUMENT_FORBIDDEN/);
  assert.throws(() => admitRecoveryBrowserCall('browser_take_screenshot', {scale: 'large'}, published), /BROWSER_RECOVERY_ARGUMENT_FORBIDDEN/);
  assert.throws(() => admitRecoveryBrowserCall('browser_snapshot', null, published), /BROWSER_RECOVERY_ARGUMENT_FORBIDDEN/);
  assert.deepEqual(admitRecoveryBrowserCall('browser_snapshot', {target: 'e12', depth: 3}, published), {target: 'e12', depth: 3});
  assert.deepEqual(admitRecoveryBrowserCall('browser_find', {text: 'Node'}, published), {text: 'Node'});
  assert.deepEqual(admitRecoveryBrowserCall('browser_find', {regex: '/node/i'}, published), {regex: '/node/i'});
  assert.deepEqual(admitRecoveryBrowserCall('browser_take_screenshot', {scale: 'css'}, published), {scale: 'css'});
});


function runtime(options = {}) {
  return {
    stopped: [], settled: [], verifications: [],
    async verifyBrowserRecovery(id, options) {
      this.verifications.push({id, ...options});
      return {facts: {workspace: {verified: true}}, decision: {result: 'continuable', verified: {workspace: {verified: true}}}};
    },
    async settleBrowserRecovery(id, options) {
      this.settled.push({id, ...options});
      return {result: 'continuable', receipt_id: `${options.attemptId}:receipt`, next_step: {tool: 'dock_node_apply'}};
    },
    markBrowserRecoveryStopped(id) { this.stopped.push(id); this.browserRecoveryBasis = () => null; },
    browserRecoverySafeCompletion() { return {instruction: 'Report factual state.'}; },
    browserRecoveryBasis(id) {
      return {operation_id: id, step: {kind: 'node', document_id: 'doc', workflow_id: 'wf', node_id: 'n1', phase: 'configure'},
        input: {original_operation_id: id, phase: 'configure'}};
    },
    async browserRecoveryHandoff() { return {verified: true}; },
    ...options,
  };
}

const base = ['find', 'dock_diagnostics', 'dock_node_apply', 'dock_operation_recover'].map(name => ({name}));
function recovery(options = {}) {
  const events = [], browserCalls = [];
  return Object.assign(createBrowserRecovery({runtime: runtime(), definitions: [{name: 'browser_click',
    inputSchema: {type: 'object', additionalProperties: false, required: ['target'], properties: {target: {type: 'string'}}}}],
    callBrowser: async (...args) => { browserCalls.push(args); return {content: []}; },
    probePage: async () => ({origin_ok: true, page_count: 1, document_present: true}),
    now: () => 0, record: async event => { events.push(event); }, ...options}), {events, browserCalls});
}
const start = (r, id = 'apply', options = {}) => r.call('dock_browser_recovery', {action: 'start', operation_id: id}, options);
const meta = reply => reply._meta['loginom/browser_recovery'];
const allowed = (r, name, args) => r.dockAllowed(name, args, r.captureDockAdmission());
const noted = (r, name, args, outcome) => r.noteDockCall(name, args, outcome, r.captureDockAdmission());
const click = (r, signal) => r.call('browser_click', {target: 'e1'}, {signal});

test('a journal failure preserves a confirmed browser result and exposes the diagnostic', async () => {
  const native = {content: [{type: 'text', text: 'Confirmed click'}]};
  const r = recovery({callBrowser: async () => native, record: async () => { throw Error('journal unavailable'); }});
  await start(r);
  const reply = await click(r);
  assert.deepEqual(reply.content, native.content);
  assert.equal(meta(reply).state, 'browser');
  assert.match(meta(reply).journal_error, /journal unavailable/);
});

test('release at the final journal await boundary preserves a confirmed native browser result', async () => {
  for (let boundary = 0; boundary < 8; boundary++) {
    const journal = deferred(), entered = deferred(), native = {content: [{type: 'text', text: 'Confirmed click'}]};
    const r = recovery({callBrowser: async () => native, record: async event => {
      if (event.phase === 'browser_recovery_call') { entered.resolve(); await journal.promise; }
    }});
    await start(r);
    const clicked = click(r);
    await entered.promise;
    journal.resolve();
    for (let i = 0; i < boundary; i++) await Promise.resolve();
    const released = r.release('run_released');
    const reply = await clicked;
    await released;
    assert.ok(reply.content.some(block => block.text === 'Confirmed click'), `boundary ${boundary}`);
    assert.equal(r.active(), false);
    assert.equal(r.hasUnsettledWork(), true);
  }
});

test('the call journal counts UTF8 bytes, elapsed browser time and image digests without image data', async () => {
  let clock = 0;
  const data = 'iVBORw0KGgo=', text = 'Привет 👋';
  const native = {content: [{type: 'text', text}, {type: 'image', mimeType: 'image/png', data}]};
  const r = recovery({definitions: recoveryBrowserCatalog(await pinnedBrowserTools()), now: () => clock,
    callBrowser: async () => { clock += 100; return native; },
    probePage: async () => { clock += 50; return {origin_ok: true, page_count: 1, document_present: true}; }});
  await start(r);
  clock = 1000;
  const reply = await r.call('browser_take_screenshot', {scale: 'css'});
  assert.deepEqual(reply.content, native.content);
  assert.deepEqual(r.events.find(event => event.phase === 'browser_recovery_call'), {
    phase: 'browser_recovery_call', attempt_id: 'br-1', tool: 'browser_take_screenshot', arguments: {scale: 'css'},
    duration_ms: 150, is_error: false, text_bytes: Buffer.byteLength(text, 'utf8'),
    images: [{mime: 'image/png', bytes: 8, sha256: createHash('sha256').update(Buffer.from(data, 'base64')).digest('hex')}],
    page: {origin_ok: true, page_count: 1, document_present: true}, calls_remaining: 29, ms_remaining: 598850,
  });
  assert.equal(JSON.stringify(r.events).includes(data), false);
  assert.equal(meta(reply).ms_remaining, 598850);
});

test('a failed or timed out call or probe remains unconfirmed with no retry or safe UI cleanup', async () => {
  for (const failed of ['call', 'probe', 'protocol']) {
    let calls = 0, probes = 0;
    const native = {content: [{type: 'text', text: 'Native detail after possible effect'}], isError: failed === 'protocol'};
    const r = recovery({runtime: runtime({browserRecoverySafeCompletion: () => safeStep}),
      callBrowser: async () => { calls++; if (failed === 'call') throw Error('MCP request timed out'); return native; },
      probePage: async () => { probes++; if (failed === 'probe') throw Error('probe disconnected');
        return {origin_ok: true, page_count: 1, document_present: true}; },
    });
    await start(r);
    const reply = await click(r);
    assert.equal(reply.structuredContent.error.code, 'BROWSER_CALL_UNCONFIRMED');
    assert.equal(reply.structuredContent.stop_reason, 'browser_call_unconfirmed');
    if (failed !== 'call') assert.ok(reply.content.some(block => block.text === native.content[0].text));
    assert.equal(calls, 1);
    assert.equal(probes, failed === 'call' ? 0 : 1);
    assert.equal(r.active(), false);
    assert.equal(r.hasUnsettledWork(), true);
    assert.equal(allowed(r, 'dock_operation_recover', safeArgs), false);
    assert.equal(reply.structuredContent.next_step.tool, undefined);
    assert.equal((await click(r)).structuredContent.error.code, 'BROWSER_RECOVERY_INACTIVE');
    assert.equal((await start(r, 'new')).structuredContent.error.code, 'BROWSER_RECOVERY_ACTIVE');
    assert.equal(r.events.filter(event => event.phase === 'browser_recovery_call').length, 1);
  }
});

test('stop during an unconfirmed browser call never permits safe release after a successful page probe', async () => {
  for (const fail of ['timeout', 'protocol']) {
    const pending = deferred(), entered = deferred();
    const r = recovery({runtime: runtime({browserRecoverySafeCompletion: () => safeStep}), callBrowser: async () => {
      entered.resolve(); await pending.promise;
      if (fail === 'timeout') throw Error('timed out');
      return {content: [{type: 'text', text: 'Error after gesture'}], isError: true};
    }});
    await start(r);
    const clicked = click(r);
    await entered.promise;
    const stopped = r.release('run_released');
    pending.resolve();
    const reply = await clicked;
    await stopped;
    assert.equal(reply.structuredContent.error.code, 'BROWSER_CALL_UNCONFIRMED');
    assert.equal(reply.structuredContent.stop_reason, 'run_released');
    assert.equal(reply.structuredContent.next_step.tool, undefined);
    assert.equal(allowed(r, 'dock_operation_recover', safeArgs), false);
    assert.equal(r.hasUnsettledWork(), true);
  }
});

test('calls from an old catalog cannot dispatch after stop', async () => {
  const r = recovery();
  await start(r);
  assert.ok(r.tools(base).some(tool => tool.name === 'browser_click'));
  await r.call('dock_browser_recovery', {action: 'stop', reason: 'done'});
  assert.equal((await click(r)).structuredContent.error.code, 'BROWSER_RECOVERY_INACTIVE');
  assert.equal(r.browserCalls.length, 0);
});

test('pre-aborted or exhausted calls never dispatch, and rejected arguments never spend the budget', async () => {
  const definitions = recoveryBrowserCatalog(await pinnedBrowserTools());
  for (const expired of ['cancelled', 'time', 'calls']) {
    let clock = 0;
    const r = recovery({definitions, now: () => clock});
    await start(r);
    for (const [name, args] of [['browser_run_code_unsafe', {}], ['browser_click', {target: 'e1', unknown: true}],
      ['browser_snapshot', {filename: 'leak.txt'}], ['browser_take_screenshot', {scale: 'css', filename: 'leak.png'}]]) {
      const reply = await r.call(name, args);
      assert.match(reply.structuredContent.error.code, /^BROWSER_RECOVERY_(TOOL|ARGUMENT)_FORBIDDEN$/);
      assert.equal(meta(reply).calls_remaining, 30);
      assert.equal(r.browserCalls.length, 0);
    }
    const controller = new AbortController();
    if (expired === 'cancelled') controller.abort();
    if (expired === 'time') clock = 600000;
    if (expired === 'calls') for (let i = 0; i < 30; i++) await click(r);
    const count = r.browserCalls.length;
    const reply = await click(r, controller.signal);
    assert.equal(reply.structuredContent.stop_reason, expired === 'cancelled' ? 'cancelled' : 'budget_exhausted');
    if (expired !== 'cancelled') assert.equal(reply.structuredContent.error.code, 'BROWSER_RECOVERY_BUDGET_EXHAUSTED');
    assert.equal(r.browserCalls.length, count);
    assert.equal(meta(reply).calls_remaining, expired === 'calls' ? 0 : 30);
  }
});

test('cancel, stop and release drain accepted browser calls and probes without losing their native result', async () => {
  for (const phase of ['call', 'probe']) for (const reason of ['cancelled', 'model_stop', 'run_released']) {
    const pending = deferred(), entered = deferred(), controller = new AbortController();
    const calls = [], native = {content: [{type: 'text', text: 'Confirmed native result'}], structuredContent: {receipt: 'native'}};
    const r = recovery({callBrowser: async (...args) => {
      calls.push(args);
      if (phase === 'call') { entered.resolve(); await pending.promise; }
      return native;
    }, probePage: async (...args) => {
      assert.deepEqual(args, []);
      if (phase === 'probe') { entered.resolve(); await pending.promise; }
      return {origin_ok: true, page_count: 1, document_present: true};
    }});
    await start(r);
    const called = click(r, controller.signal);
    await entered.promise;
    const stopping = reason === 'cancelled' ? controller.abort() : reason === 'model_stop'
      ? r.call('dock_browser_recovery', {action: 'stop', reason: 'done'}) : r.release(reason);
    assert.equal(r.hasUnsettledWork(), true);
    pending.resolve();
    const reply = await called;
    await stopping;
    assert.notEqual(reply.isError, true);
    assert.equal(meta(reply).state, 'stopped');
    assert.equal(reply.structuredContent.stop_reason, reason);
    assert.ok(reply.content.some(block => block.text === native.content[0].text));
    assert.deepEqual(reply.structuredContent.browser_result, native.structuredContent);
    assert.deepEqual(calls, [['browser_click', {target: 'e1'}]]);
    assert.equal((await click(r)).structuredContent.error.code, 'BROWSER_RECOVERY_INACTIVE');
  }
});

test('a navigation, a second page or a missing prepared document stops the attempt', async () => {
  for (const page of [{origin_ok: false, page_count: 1, document_present: true},
    {origin_ok: true, page_count: 2, document_present: true}, {origin_ok: true, page_count: 1, document_present: false}]) {
    const r = recovery({probePage: async () => page,
      runtime: runtime({browserRecoverySafeCompletion: () => safeStep})});
    await start(r);
    const reply = await click(r);
    assert.equal(reply.structuredContent.error.code, 'BROWSER_RECOVERY_PAGE_CHANGED');
    assert.equal(reply.structuredContent.stop_reason, 'page_changed');
    assert.equal(reply.structuredContent.next_step.tool, undefined);
    assert.equal(reply.structuredContent.summary.tools.length, 1);
    assert.equal((await click(r)).structuredContent.error.code, 'BROWSER_RECOVERY_INACTIVE');
    assert.equal(r.browserCalls.length, 1);
    assert.equal(r.hasUnsettledWork(), true);
    assert.equal(allowed(r, 'dock_operation_recover', safeArgs), false);
    assert.equal((await start(r, 'new')).structuredContent.error.code, 'BROWSER_RECOVERY_ACTIVE');
  }
});

test('accepted browser calls use published arguments, probe after the call and preserve the native result', async () => {
  const order = [], native = {content: [{type: 'text', text: 'Clicked'}], structuredContent: {native: true}};
  const r = recovery({
    callBrowser: async (...args) => { order.push(['call', ...args]); return native; },
    probePage: async (...args) => { order.push(['probe', ...args]); return {origin_ok: true, page_count: 1, document_present: true}; },
    record: async event => { order.push(['journal', event.phase]); },
  });
  await start(r);
  const reply = await click(r);
  assert.deepEqual(reply.content, native.content);
  assert.deepEqual(reply.structuredContent, native.structuredContent);
  assert.deepEqual(order, [['call', 'browser_click', {target: 'e1'}], ['probe'], ['journal', 'browser_recovery_call']]);
  assert.equal(meta(reply).state, 'browser');
  assert.equal(meta(reply).calls_remaining, 29);
});

test('page probe parsing accepts complete MCP results and fails closed on incomplete or error replies', () => {
  const good = {origin_ok: true, page_count: 1, document_present: true};
  const text = value => ({content: [{type: 'text', text: JSON.stringify(value)}]});
  assert.deepEqual(parseRecoveryPageProbe(text(good)), good);
  assert.deepEqual(parseRecoveryPageProbe(text({...good, unrelated: 'omit from journal'})), good);
  assert.deepEqual(parseRecoveryPageProbe({content: [{type: 'text', text: `### Result\n${JSON.stringify(good)}\n### Ran code\n...`}]}), good);
  for (const response of [undefined, {}, {content: {}}, text({origin_ok: true}), text({...good, page_count: '1'}),
    text({...good, document_present: 1}), text({...good, page_count: -1}), {...text(good), isError: true},
    {content: [{type: 'text', text: 'not JSON'}]}]) {
    assert.deepEqual(parseRecoveryPageProbe(response), {origin_ok: false, page_count: 0, document_present: false});
  }
});

test('start enters browser only after a verified handoff', async () => {
  const r = recovery();
  const started = await start(r);
  assert.deepEqual(meta(started), {attempt_id: 'br-1', state: 'browser', calls_remaining: 30, ms_remaining: 600000});
  assert.ok(r.tools(base).some(tool => tool.name === 'browser_click'));
  assert.equal(r.active(), true);
});

test('recovery remains published without a basis and start is refused without taking ownership', async () => {
  const r = recovery({runtime: runtime({browserRecoveryBasis: () => null})});
  assert.deepEqual(r.tools(base), [...base, browserRecoveryTool]);
  const reply = await start(r);
  assert.equal(reply.structuredContent.error.code, 'BROWSER_RECOVERY_NOT_OFFERED');
  assert.equal(reply.structuredContent.result_version, 'user-v1');
  assert.equal(reply.structuredContent.kind, 'dock_browser_recovery');
  assert.equal(meta(reply).state, 'dock');
  assert.equal(r.active(), false);
  assert.equal(r.hasUnsettledWork(), false);
  assert.equal(r.owns('dock_browser_recovery'), true);
  assert.equal(r.owns('browser_click'), true);
  assert.equal(r.owns('dock_node_apply'), false);
});


test('unverified handoff stops, retains ownership and reports facts without browser gestures', async () => {
  const rt = runtime({browserRecoveryHandoff: async () => ({verified: false, reason: 'RECEIPT_UNSETTLED'})});
  const r = recovery({runtime: rt});
  const result = (await start(r)).structuredContent;
  assert.equal(result.state, 'stopped');
  assert.equal(result.stop_reason, 'handoff_unverified');
  assert.deepEqual(result.summary.tools, []);
  assert.equal(result.summary.handoff.reason, 'RECEIPT_UNSETTLED');
  assert.equal(result.next_step.instruction, 'Report factual state.');
  assert.deepEqual(rt.stopped, ['apply']);
  assert.equal(r.active(), false);
  assert.equal(r.hasUnsettledWork(), true);
  assert.equal(r.browserCalls.length, 0);
  assert.ok(r.events.some(event => event.phase === 'browser_recovery_state' && event.state === 'stopped'));
});

test('stop and release retain Dock exclusion and never restart a stopped attempt', async () => {
  const rt = runtime();
  const r = recovery({runtime: rt});
  await start(r);
  assert.equal(allowed(r, 'dock_node_apply', {}), false);
  assert.equal(allowed(r, 'find', {}), true);
  assert.equal(allowed(r, 'dock_diagnostics', {}), true);
  assert.equal((await start(r, 'other')).structuredContent.error.code, 'BROWSER_RECOVERY_ACTIVE');
  const reply = await r.call('dock_browser_recovery', {action: 'stop', reason: 'No justified action'}, {});
  assert.equal(reply.structuredContent.stop_reason, 'model_stop');
  assert.equal((await start(r, 'other')).structuredContent.error.code, 'BROWSER_RECOVERY_ACTIVE');
  assert.deepEqual(r.tools(base).map(tool => tool.name), ['find', 'dock_diagnostics', 'dock_browser_recovery']);
  await r.release('run_released');
  assert.deepEqual(rt.stopped, ['apply']);
  assert.equal(r.browserCalls.length, 0);
  assert.equal(allowed(r, 'dock_node_apply', {}), false);
  const other = recovery();
  await start(other);
  const released = await other.release('runtime_closed');
  assert.equal(released.structuredContent.stop_reason, 'runtime_closed');
  assert.equal(other.active(), false);
});


const report = {actions: ['Closed own wizard'], result: 'Graph is quiet', settings: ['Model report only']};
const finish = (r, options = {}) => r.call('dock_browser_recovery', {action: 'finish', report}, options);

test('finish verifies, settles and returns Dock with runtime facts separate from model claims', async () => {
  const rt = runtime(), r = recovery({runtime: rt});
  assert.equal((await finish(r)).structuredContent.error.code, 'BROWSER_RECOVERY_INACTIVE');
  await start(r);
  const reply = await finish(r);
  assert.equal(reply.structuredContent.state, 'dock');
  assert.equal(reply.structuredContent.result, 'continuable');
  assert.equal(reply.structuredContent.receipt_id, 'br-1:receipt');
  assert.deepEqual(reply.structuredContent.verified, {workspace: {verified: true}});
  assert.deepEqual(reply.structuredContent.attested_by_model, report);
  assert.deepEqual(rt.verifications, [{id: 'apply', attemptId: 'br-1', sequence: 1}]);
  assert.deepEqual(rt.settled, [{id: 'apply', attemptId: 'br-1', facts: {workspace: {verified: true}}, attested: report}]);
  assert.equal(allowed(r, 'dock_node_apply', {}), true);
  assert.equal(r.hasUnsettledWork(), false);
  assert.equal(meta(reply).calls_remaining, 29);
});

test('unresolved finishes reuse one step budget across operation ids; completed renews it', async () => {
  const rt = runtime(), r = recovery({runtime: rt});
  rt.settleBrowserRecovery = async () => ({result: 'unresolved'});
  await start(r);
  assert.equal(meta(await finish(r)).state, 'browser');
  rt.settleBrowserRecovery = async () => ({result: 'continuable', receipt_id: 'br-1:receipt'});
  assert.equal(meta(await finish(r)).calls_remaining, 28);
  assert.equal(meta(await start(r, 'again')).calls_remaining, 28);
  rt.settleBrowserRecovery = async () => ({result: 'completed', receipt_id: 'br-2:receipt'});
  assert.equal((await finish(r)).structuredContent.result, 'completed');
  assert.equal(meta(await start(r, 'third')).calls_remaining, 30);
  assert.deepEqual(rt.verifications.map(value => [value.attemptId, value.sequence]), [['br-1', 1], ['br-1', 2], ['br-2', 1]]);
});

test('only browser time counts, including elapsed idle time before finish', async () => {
  let clock = 0;
  const rt = runtime({browserRecoveryHandoff: async () => { clock += 300000; return {verified: true}; }});
  rt.verifyBrowserRecovery = async () => { clock += 300000; return {facts: {}, decision: {verified: {}}}; };
  rt.settleBrowserRecovery = async () => ({result: 'unresolved'});
  const r = recovery({runtime: rt, now: () => clock});
  await start(r);
  clock += 60000;
  assert.equal(meta(await finish(r)).ms_remaining, 540000);
  clock += 540000;
  const reply = await finish(r);
  assert.equal(reply.structuredContent.stop_reason, 'budget_exhausted');
  assert.equal(meta(reply).calls_remaining, 29);
  assert.equal(meta(reply).ms_remaining, 0);
  assert.equal(clock, 1200000);
});

test('the last finish stops unresolved and no exhausted step starts a new handoff', async () => {
  const rt = runtime(), r = recovery({runtime: rt, now: () => 0});
  rt.settleBrowserRecovery = async () => ({result: 'unresolved'});
  await start(r);
  for (let i = 1; i < 30; i++) assert.equal(meta(await finish(r)).state, 'browser');
  const reply = await finish(r);
  assert.equal(reply.structuredContent.stop_reason, 'budget_exhausted');
  assert.equal(meta(reply).calls_remaining, 0);
  assert.equal(rt.verifications.length, 30);
  assert.equal((await finish(r)).structuredContent.error.code, 'BROWSER_RECOVERY_INACTIVE');
});

test('an exhausted step cannot re-enter after continuable while another step retains its budget', async () => {
  const rt = runtime(), r = recovery({runtime: rt, now: () => 0});
  const basis = rt.browserRecoveryBasis;
  rt.browserRecoveryBasis = id => {
    const result = basis(id);
    if (id === 'different') result.step.node_id = 'n2';
    return result;
  };
  for (let i = 0; i < 30; i++) { await start(r, `op-${i}`); await finish(r); }
  await start(r, 'different');
  assert.equal(meta(await finish(r)).calls_remaining, 29);
  let handoffs = 0;
  rt.browserRecoveryHandoff = async () => { handoffs++; return {verified: true}; };
  const reply = await start(r, 'again');
  assert.equal(reply.structuredContent.stop_reason, 'budget_exhausted');
  assert.equal(handoffs, 0);
});

test('unconfirmed verification blocks settlement, safe completion and fresh starts', async () => {
  const rt = runtime({verifyBrowserRecovery: async () => ({unconfirmed: true, facts: {workspace: {verified: false}}}),
    browserRecoverySafeCompletion: () => ({tool: 'dock_operation_recover', arguments: {operation_id: 'apply', strategy: 'abandon_operation'}})});
  const r = recovery({runtime: rt});
  await start(r);
  const reply = await finish(r);
  assert.equal(reply.structuredContent.stop_reason, 'verification_unconfirmed');
  assert.equal(reply.structuredContent.summary.verification.unconfirmed, true);
  assert.equal(reply.structuredContent.next_step.tool, undefined);
  assert.equal(allowed(r, 'dock_operation_recover', {operation_id: 'apply', strategy: 'abandon_operation'}), false);
  assert.deepEqual(rt.settled, []);
  assert.equal(r.hasUnsettledWork(), true);
  assert.equal((await start(r, 'new')).structuredContent.error.code, 'BROWSER_RECOVERY_ACTIVE');
});

test('a receipt refusal stops without returning Dock and preserves the verification and model report', async () => {
  const rt = runtime({settleBrowserRecovery: async () => ({result: 'unresolved', error: {code: 'RECOVERY_RECEIPT_UNCONFIRMED'}})});
  const r = recovery({runtime: rt});
  await start(r);
  const reply = await finish(r);
  assert.equal(reply.structuredContent.stop_reason, 'receipt_unconfirmed');
  assert.equal(reply.structuredContent.error.code, 'RECOVERY_RECEIPT_UNCONFIRMED');
  assert.deepEqual(reply.structuredContent.summary.attested_by_model, report);
  assert.equal(reply.structuredContent.summary.verification.facts.workspace.verified, true);
  assert.equal(allowed(r, 'dock_node_apply', {}), false);
  assert.equal(r.active(), false);
});

function deferred() { return Promise.withResolvers(); }

test('release during handoff waits for its fact and a late answer cannot revive browser', async () => {
  const handoff = deferred();
  const rt = runtime({browserRecoveryHandoff: () => handoff.promise});
  const r = recovery({runtime: rt});
  const started = start(r);
  assert.equal(r.hasUnsettledWork(), true);
  assert.equal(allowed(r, 'dock_node_apply', {}), false);
  const released = r.release('run_released');
  assert.deepEqual(rt.stopped, []);
  handoff.resolve({verified: true, receipt_id: 'original:receipt'});
  const reply = await started;
  await released;
  assert.equal(reply.structuredContent.stop_reason, 'run_released');
  assert.equal(reply.structuredContent.summary.handoff.receipt_id, 'original:receipt');
  assert.equal(r.active(), false);
  assert.equal(r.hasUnsettledWork(), true);
  assert.equal(r.browserCalls.length, 0);
  assert.deepEqual(rt.stopped, ['apply']);
});

test('release during confirmed or unknown verification preserves facts and never begins settlement', async () => {
  for (const unconfirmed of [false, true]) {
    const verification = deferred();
    const rt = runtime({verifyBrowserRecovery: () => verification.promise});
    const r = recovery({runtime: rt});
    await start(r);
    const finishing = finish(r);
    const released = r.release('run_released');
    assert.deepEqual(rt.stopped, []);
    verification.resolve({unconfirmed, facts: {workspace: {verified: !unconfirmed}}, decision: {verified: {}}});
    const reply = await finishing;
    await released;
    assert.equal(reply.structuredContent.stop_reason, 'run_released');
    assert.equal(reply.structuredContent.summary.verification.unconfirmed, unconfirmed);
    assert.equal(r.active(), false);
    assert.equal(r.hasUnsettledWork(), true);
    assert.deepEqual(rt.settled, []);
  }
});

test('stop during an already started durable settlement preserves its confirmed receipt but not active ownership', async () => {
  const ack = deferred(), entered = deferred();
  const rt = runtime({settleBrowserRecovery: async () => { entered.resolve(); return ack.promise; }});
  const r = recovery({runtime: rt});
  await start(r);
  const finishing = finish(r);
  await entered.promise;
  const released = r.release('runtime_closed');
  ack.resolve({result: 'completed', receipt_id: 'br-1:receipt', next_step: {tool: 'dock_node_read'}});
  const reply = await finishing;
  await released;
  assert.equal(reply.structuredContent.state, 'stopped');
  assert.equal(reply.structuredContent.stop_reason, 'runtime_closed');
  assert.equal(reply.structuredContent.receipt_id, 'br-1:receipt');
  assert.equal(reply.structuredContent.result, 'completed');
  assert.equal(r.active(), false);
  assert.equal(allowed(r, 'dock_node_apply', {}), false);
  assert.equal(r.hasUnsettledWork(), true);
  assert.deepEqual(rt.stopped, ['apply']);
});


test('abort during handoff or verification records one stop intent and preserves the accepted result', async () => {
  for (const phase of ['handoff', 'verify']) {
    for (const unconfirmed of [false, true]) {
      const pending = deferred(), controller = new AbortController();
      const rt = runtime(phase === 'handoff' ? {browserRecoveryHandoff: () => pending.promise}
        : {verifyBrowserRecovery: () => pending.promise});
      const r = recovery({runtime: rt});
      if (phase === 'verify') await start(r);
      const running = phase === 'handoff' ? start(r, 'apply', {signal: controller.signal}) : finish(r, {signal: controller.signal});
      controller.abort();
      const released = r.release('run_released');
      pending.resolve(phase === 'handoff' ? {verified: !unconfirmed, reason: unconfirmed ? 'RECEIPT_UNSETTLED' : null}
        : {unconfirmed, facts: {workspace: {verified: !unconfirmed}}, decision: {verified: {}}});
      const reply = await running;
      await released;
      assert.equal(reply.structuredContent.stop_reason, 'cancelled');
      assert.equal(r.active(), false);
      assert.deepEqual(rt.settled, []);
      assert.deepEqual(rt.stopped, ['apply']);
      assert.equal(r.browserCalls.length, 0);
    }
  }
});

test('a signal cancelled before dispatch never starts handoff or verification', async () => {
  const controller = new AbortController();
  controller.abort();
  let handoffs = 0;
  const rt = runtime({browserRecoveryHandoff: async () => { handoffs++; return {verified: true}; }});
  const r = recovery({runtime: rt});
  assert.equal((await start(r, 'apply', {signal: controller.signal})).structuredContent.stop_reason, 'cancelled');
  assert.equal(handoffs, 0);
  const other = recovery({runtime: runtime()});
  await start(other);
  assert.equal((await finish(other, {signal: controller.signal})).structuredContent.stop_reason, 'cancelled');
  assert.equal(meta(await other.release('run_released')).calls_remaining, 30);
});

const safeStep = {tool: 'dock_operation_recover', arguments: {operation_id: 'apply', strategy: 'abandon_operation'}};
const safeArgs = {...safeStep.arguments, recovery_operation_id: 'release-1'};
const releasedOutcome = {status: 'SUCCEEDED', operation_id: 'apply', recovery_operation_id: 'release-1',
  output: {resolution: 'released_after_proof', original_outcome: {operation_id: 'apply', status: 'FAILED'}}};

test('stopped admits only its concrete safe release and ordinary Dock returns only after its confirmed outcome', async () => {
  const rt = runtime({browserRecoverySafeCompletion: () => safeStep});
  const r = recovery({runtime: rt});
  await start(r);
  await r.call('dock_browser_recovery', {action: 'stop', reason: 'No further UI action'});
  assert.deepEqual(r.tools(base).map(tool => tool.name), ['find', 'dock_diagnostics', 'dock_operation_recover', 'dock_browser_recovery']);
  assert.equal(allowed(r, 'dock_operation_recover', {...safeArgs, operation_id: 'other'}), false);
  assert.equal(allowed(r, 'dock_operation_recover', {...safeArgs, strategy: 'retry'}), false);
  assert.equal(allowed(r, 'dock_node_apply', safeArgs), false);
  assert.equal(allowed(r, 'dock_operation_recover', safeArgs), true);
  assert.equal(allowed(r, 'dock_node_apply', {}), false);
  for (const outcome of [{...releasedOutcome, status: 'AMBIGUOUS'}, {...releasedOutcome, operation_id: 'other'},
    {...releasedOutcome, output: {resolution: 'released_after_proof', original_outcome: {operation_id: 'other'}}},
    {...releasedOutcome, output: {resolution: 'retried'}}]) {
    await noted(r, 'dock_operation_recover', safeArgs, outcome);
    assert.equal(r.hasUnsettledWork(), true);
  }
  // Runtime no longer offers the action after its native proof and durable ACK.
  rt.browserRecoverySafeCompletion = () => ({instruction: 'Released'});
  await noted(r, 'dock_operation_recover', safeArgs, releasedOutcome);
  assert.equal(r.hasUnsettledWork(), false);
  assert.equal(allowed(r, 'dock_node_apply', {}), true);
  assert.deepEqual(r.tools(base), [...base, browserRecoveryTool]);
  assert.equal(r.events.some(event => event.phase === 'browser_recovery_dock_resumed'), false);
});

test('release during a stopped safe-completion call denies its late confirmed outcome', async () => {
  for (const reason of ['run_released', 'runtime_closed']) {
    const result = deferred();
    const r = recovery({runtime: runtime({browserRecoverySafeCompletion: () => safeStep})});
    await start(r);
    await r.call('dock_browser_recovery', {action: 'stop', reason: 'Stop'});
    assert.equal(allowed(r, 'dock_operation_recover', safeArgs), true);
    const admission = r.captureDockAdmission();
    const dispatch = result.promise.then(outcome => r.noteDockCall('dock_operation_recover', safeArgs, outcome, admission));
    const stopped = await r.release(reason);
    result.resolve(releasedOutcome);
    await dispatch;
    assert.equal(stopped.structuredContent.stop_reason, 'model_stop');
    assert.equal(allowed(r, 'dock_node_apply', {}), false);
    assert.equal(r.hasUnsettledWork(), true);
    assert.equal((await start(r, 'new')).structuredContent.error.code, 'BROWSER_RECOVERY_ACTIVE');
  }
});

test('only the first accepted Dock action after a successful settlement is recorded as resumed', async () => {
  const r = recovery();
  await start(r);
  await finish(r);
  await noted(r, 'find', {}, {status: 'SUCCEEDED'});
  await noted(r, 'dock_diagnostics', {}, {status: 'SUCCEEDED'});
  await noted(r, 'dock_node_apply', {}, {status: 'NOT_APPLIED'});
  assert.equal(r.events.filter(event => event.phase === 'browser_recovery_dock_resumed').length, 0);
  await noted(r, 'dock_node_apply', {operation_id: 'next'}, {status: 'SUCCEEDED', operation_id: 'next'});
  await noted(r, 'dock_node_read', {operation_id: 'read'}, {status: 'SUCCEEDED', operation_id: 'read'});
  const events = r.events.filter(event => event.phase === 'browser_recovery_dock_resumed');
  assert.equal(events.length, 1);
  assert.equal(events[0].attempt_id, 'br-1');
  assert.equal(events[0].tool, 'dock_node_apply');
});

test('runtime failures stop with preserved uncertainty rather than losing the attempt', async () => {
  for (const phase of ['handoff', 'verify', 'settle']) {
    const rt = runtime();
    rt[{handoff: 'browserRecoveryHandoff', verify: 'verifyBrowserRecovery', settle: 'settleBrowserRecovery'}[phase]] = async () => { throw Error('lost runtime reply'); };
    const r = recovery({runtime: rt});
    if (phase !== 'handoff') await start(r);
    const reply = phase === 'handoff' ? await start(r) : await finish(r);
    assert.equal(reply.structuredContent.stop_reason, {handoff: 'handoff_unverified', verify: 'verification_unconfirmed', settle: 'receipt_unconfirmed'}[phase]);
    assert.equal(r.hasUnsettledWork(), true);
    assert.equal(allowed(r, 'dock_node_apply', {}), false);
    assert.equal(r.active(), false);
    assert.deepEqual(rt.stopped, ['apply']);
  }
});

test('auxiliary journal failure preserves stop, confirmed settlement and accepted Dock outcomes', async () => {
  const r = recovery({record: async () => { throw Error('journal unavailable'); }});
  await start(r);
  const stopped = await r.call('dock_browser_recovery', {action: 'stop', reason: 'Stop'});
  assert.equal(stopped.structuredContent.state, 'stopped');
  assert.match(stopped.structuredContent.journal_error, /journal unavailable/);
  const other = recovery({record: async () => { throw Error('journal unavailable'); }});
  await start(other);
  const finished = await finish(other);
  assert.equal(finished.structuredContent.receipt_id, 'br-1:receipt');
  await noted(other, 'dock_node_apply', {operation_id: 'next'}, {status: 'SUCCEEDED'});
  assert.equal(allowed(other, 'dock_node_apply', {}), true);
  assert.equal(other.hasUnsettledWork(), false);
});

test('invalid recovery arguments and browser calls do not accidentally start or finish an attempt', async () => {
  const r = recovery();
  assert.equal((await r.call('dock_browser_recovery', {action: 'invalid'})).structuredContent.error.code, 'BROWSER_RECOVERY_ARGUMENT_FORBIDDEN');
  assert.equal((await r.call('browser_click', {action: 'start', operation_id: 'apply'})).structuredContent.error.code, 'BROWSER_RECOVERY_INACTIVE');
  assert.equal(r.hasUnsettledWork(), false);
  await start(r);
  assert.equal((await r.call('dock_browser_recovery', {action: 'finish', report: {result: 'claim'}})).structuredContent.error.code, 'BROWSER_RECOVERY_ARGUMENT_FORBIDDEN');
  assert.equal(r.active(), true);
  assert.equal(meta(await finish(r)).calls_remaining, 29);
});

test('confirmed late receipt remains in subsequent stopped replies and preserves unknown verification details', async () => {
  const ack = deferred(), entered = deferred();
  const r = recovery({runtime: runtime({settleBrowserRecovery: async () => { entered.resolve(); return ack.promise; }})});
  await start(r);
  const finishing = finish(r);
  await entered.promise;
  const released = r.release('run_released');
  ack.resolve({result: 'completed', receipt_id: 'br-1:receipt'});
  await finishing;
  const reply = await released;
  assert.equal(reply.structuredContent.summary.settlement.receipt_id, 'br-1:receipt');
  const later = await start(r, 'later');
  assert.equal(later.structuredContent.summary.settlement.result, 'completed');
  assert.equal(later.structuredContent.stop_reason, 'run_released');
});

test('finish at the browser deadline does not spend a call or invoke verification', async () => {
  let clock = 0;
  const rt = runtime(), r = recovery({runtime: rt, now: () => clock});
  await start(r);
  clock = 600000;
  const reply = await finish(r);
  assert.equal(reply.structuredContent.stop_reason, 'budget_exhausted');
  assert.deepEqual(rt.verifications, []);
  assert.deepEqual(rt.settled, []);
  assert.equal(meta(reply).calls_remaining, 30);
});

test('release at the final handoff await boundary still stops the completed promise continuation', async () => {
  for (let boundary = 0; boundary < 6; boundary++) {
    const handoff = deferred();
    const r = recovery({runtime: runtime({browserRecoveryHandoff: () => handoff.promise})});
    const starting = start(r);
    handoff.resolve({verified: true});
    for (let i = 0; i < boundary; i++) await Promise.resolve();
    const released = await r.release('run_released');
    await starting;
    assert.equal(released.structuredContent.state, 'stopped', `boundary ${boundary}`);
    assert.equal(r.active(), false);
    assert.equal(allowed(r, 'dock_node_apply', {}), false);
  }
});


test('a run release with no dispatched recover preserves a new invocation safe-completion path', async () => {
  const r = recovery({runtime: runtime({browserRecoverySafeCompletion: () => safeStep})});
  await start(r);
  await r.call('dock_browser_recovery', {action: 'stop', reason: 'Stop'});
  const before = r.captureDockAdmission();
  await r.release('run_released');
  const admission = r.captureDockAdmission();
  assert.equal(admission.attempt_id, before.attempt_id);
  assert.equal(admission.release_generation, before.release_generation + 1);
  assert.equal(r.dockAllowed('dock_operation_recover', safeArgs, admission), true);
  await r.noteDockCall('dock_operation_recover', safeArgs, releasedOutcome, admission);
  assert.equal(r.hasUnsettledWork(), false);
  assert.equal(allowed(r, 'dock_node_apply', {}), true);
});

test('a fresh capture cannot revive an older queued invocation after release', async () => {
  const r = recovery({runtime: runtime({browserRecoverySafeCompletion: () => safeStep})});
  await start(r);
  await r.call('dock_browser_recovery', {action: 'stop', reason: 'Stop'});
  const a = r.captureDockAdmission();
  assert.equal(r.dockAllowed('dock_operation_recover', safeArgs, a), true);
  await r.release('run_released');
  const b = r.captureDockAdmission(), argsB = {...safeArgs, recovery_operation_id: 'release-2'};
  assert.equal(r.dockAllowed('dock_operation_recover', argsB, b), true);
  assert.equal(r.dockAllowed('dock_operation_recover', safeArgs, a), false);
  await r.noteDockCall('dock_operation_recover', safeArgs, releasedOutcome, a);
  assert.equal(r.hasUnsettledWork(), true);
  assert.equal(r.dockAllowed('dock_operation_recover', argsB, b), true);
  assert.equal(r.dockAllowed('dock_operation_recover', argsB, b), true);
  assert.deepEqual(r.captureDockAdmission(), b);
  await r.noteDockCall('dock_operation_recover', argsB, {...releasedOutcome, recovery_operation_id: 'release-2'}, b);
  assert.equal(r.hasUnsettledWork(), false);
});

test('a late successful safe release preserves its proof and an instruction-only runtime stays terminal stopped', async () => {
  const rt = runtime({browserRecoverySafeCompletion: () => safeStep}), r = recovery({runtime: rt});
  await start(r);
  await r.call('dock_browser_recovery', {action: 'stop', reason: 'Stop'});
  const admission = r.captureDockAdmission();
  assert.equal(r.dockAllowed('dock_operation_recover', safeArgs, admission), true);
  await r.release('run_released');
  rt.browserRecoverySafeCompletion = () => ({instruction: 'Operation already released. Report facts.'});
  await r.noteDockCall('dock_operation_recover', safeArgs, releasedOutcome, admission);
  assert.equal(r.hasUnsettledWork(), true);
  const reply = await start(r, 'new');
  assert.deepEqual(reply.structuredContent.summary.safe_release, releasedOutcome);
  assert.equal(reply.structuredContent.next_step.tool, undefined);
  assert.equal(allowed(r, 'dock_operation_recover', {...safeArgs, recovery_operation_id: 'fresh'}), false);
  assert.equal(r.tools(base).some(tool => tool.name === 'dock_operation_recover'), false);
  assert.equal(allowed(r, 'dock_node_apply', {}), false);
});

test('safe completion requires the matching recovery request identity in the actual outcome', async () => {
  const r = recovery({runtime: runtime({browserRecoverySafeCompletion: () => safeStep})});
  await start(r);
  await r.call('dock_browser_recovery', {action: 'stop', reason: 'Stop'});
  const admission = r.captureDockAdmission();
  await r.noteDockCall('dock_operation_recover', safeArgs, {...releasedOutcome, recovery_operation_id: 'another-release'}, admission);
  assert.equal(r.hasUnsettledWork(), true);
  await r.noteDockCall('dock_operation_recover', safeArgs, releasedOutcome, admission);
  assert.equal(r.hasUnsettledWork(), false);
});

test('another attempt invalidates an old capture even at the same release generation', async () => {
  const r = recovery();
  const empty = r.captureDockAdmission();
  assert.equal(r.dockAllowed('dock_node_apply', {}, empty), true);
  await start(r);
  const first = r.captureDockAdmission();
  await finish(r);
  await start(r, 'again');
  const second = r.captureDockAdmission();
  assert.equal(first.release_generation, second.release_generation);
  assert.notEqual(first.attempt_id, second.attempt_id);
  await finish(r);
  assert.equal(r.dockAllowed('dock_node_apply', {}, first), false);
  assert.equal(r.dockAllowed('dock_node_apply', {}, empty), false);
  assert.equal(r.dockAllowed('dock_node_apply', {}, second), true);
  assert.equal(r.dockAllowed('find', {}, first), true);
  assert.equal(r.dockAllowed('dock_diagnostics', {}, first), true);
  await r.noteDockCall('dock_node_apply', {}, {status: 'SUCCEEDED'}, first);
  assert.equal(r.events.some(event => event.phase === 'browser_recovery_dock_resumed'), false);
});
