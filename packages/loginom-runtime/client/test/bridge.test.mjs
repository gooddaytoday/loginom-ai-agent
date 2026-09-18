import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRedactor } from '../lib/redact.mjs';
import { actionReply, browserProcessEnvironment } from '../lib/bridge.mjs';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const desktopEnvironment = { DISPLAY: ':98', XAUTHORITY: '/unit/Xauthority',
  XDG_RUNTIME_DIR: '/unit/runtime', WAYLAND_DISPLAY: 'wayland-test',
  XDG_SESSION_TYPE: 'wayland', XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' };

test('Linux browser receives only desktop settings in addition to the SDK environment', () => {
  const environment = { ...desktopEnvironment, DOCK_TEST_SECRET: 'private',
    NODE_OPTIONS: '--require=/untrusted.js', LD_PRELOAD: '/untrusted.so',
    PLAYWRIGHT_BROWSERS_PATH: '/untrusted/browser' };
  assert.deepEqual(browserProcessEnvironment('/pinned/browser', { platform: 'linux', environment }),
    { ...getDefaultEnvironment(), ...desktopEnvironment, PLAYWRIGHT_BROWSERS_PATH: '/pinned/browser' });
  assert.equal(environment.PLAYWRIGHT_BROWSERS_PATH, '/untrusted/browser');
});

test('SDK subprocess retains native Wayland selection without DISPLAY and omits unrelated environment', async () => {
  const environment = { ...desktopEnvironment, DOCK_TEST_SECRET: 'private' };
  delete environment.DISPLAY;
  const keys = [...Object.keys(desktopEnvironment), 'PLAYWRIGHT_BROWSERS_PATH', 'DOCK_TEST_SECRET'];
  const code = `process.stdout.write(JSON.stringify({jsonrpc:'2.0',method:'environment',params:
    Object.fromEntries(${JSON.stringify(keys)}.map(key=>[key,process.env[key]??null]))})+'\\n')`;
  const transport = new StdioClientTransport({ command: process.execPath, args: ['-e', code],
    env: browserProcessEnvironment('/pinned/browser', { platform: 'linux', environment }), stderr: 'pipe' });
  let timer;
  try {
    const received = new Promise((resolve, reject) => {
      transport.onmessage = resolve; transport.onerror = reject;
      timer = setTimeout(() => reject(Error('Environment probe timed out')), 5000);
    });
    await transport.start();
    const message = await received;
    assert.equal(message.method, 'environment');
    assert.deepEqual(message.params, { ...desktopEnvironment, DISPLAY: null,
      PLAYWRIGHT_BROWSERS_PATH: '/pinned/browser', DOCK_TEST_SECRET: null });
  } finally { clearTimeout(timer); await transport.close(); }
});

for (const platform of ['darwin', 'win32']) {
  test(`${platform} browser environment is identical to the pre-fix environment`, () => {
    // Any accidental read of Linux settings on another platform fails the test.
    const environment = new Proxy(desktopEnvironment, { get() { throw Error('Unexpected desktop environment access'); } });
    assert.deepEqual(browserProcessEnvironment('/pinned/browser', { platform, environment }),
      { ...getDefaultEnvironment(), PLAYWRIGHT_BROWSERS_PATH: '/pinned/browser' });
  });
}

for (const [name, environment] of [
  ['absent settings', {}],
  ['empty settings', Object.fromEntries(Object.keys(desktopEnvironment).map(key => [key, '']))],
  ['shell functions', Object.fromEntries(Object.keys(desktopEnvironment).map(key => [key, '() { echo unsafe; }']))],
  ['non-string settings', { DISPLAY: undefined, XAUTHORITY: null, XDG_RUNTIME_DIR: 123, WAYLAND_DISPLAY: false,
    XDG_SESSION_TYPE: false, XDG_CURRENT_DESKTOP: 123 }],
]) {
  test(`Linux browser omits ${name}`, () => {
    assert.deepEqual(browserProcessEnvironment('/pinned/browser', { platform: 'linux', environment }),
      { ...getDefaultEnvironment(), PLAYWRIGHT_BROWSERS_PATH: '/pinned/browser' });
  });
}

test('user action rejected during a known node job waits instead of suggesting inspection',()=>{
 const receipt={status:'AMBIGUOUS',request_rejected:true,operation_id:'active',effect_possible:true,
  error:{code:'REQUEST_REJECTED',message:'A background node operation is running'},
  output:{active_node_job:{operation_id:'active',state:'running'},operation:{private_details:'retained locally'}}};
 const original=structuredClone(receipt),reply=actionReply(receipt,{userProfile:true,observe:true});
 assert.equal(reply.content.length,1);assert.equal(reply.structuredContent.state,'running');
 assert.equal(reply.structuredContent.status,undefined);
 assert.equal(reply.structuredContent.next_step.tool,'dock_node_wait');
 assert.deepEqual(reply.structuredContent.next_step.arguments,{operation_id:'active',timeout_ms:10000});
 assert.equal(reply.structuredContent.effect_possible,true);
 assert.ok(!reply.content[0].text.includes('private_details'));assert.deepEqual(receipt,original);
 assert.deepEqual(JSON.parse(actionReply(receipt).content[0].text),receipt);
 for(const mutate of [r=>delete r.request_rejected,r=>delete r.output.active_node_job,
  r=>{r.output.active_node_job.state='settled'},r=>{r.output.active_node_job.operation_id=''}]){
  const unknown=structuredClone(receipt);mutate(unknown);
  assert.deepEqual(JSON.parse(actionReply(unknown,{userProfile:true}).content[0].text),unknown);
 }
});

test('observation usage is a separate bounded hint and never changes the authoritative receipt', () => {
  const receipt = { status: 'SUCCEEDED', action_key: 'workspace.observe', operation_id: 'receipt-only',
    output: { observation_id: 'issued-observation', observation_kind: 'roots',
      wizard: { root_ref: 'ui-metadata' }, page: { next_cursor: 'next-page' },
      operation: { operation_id: 'pending-operation', state: 'pending' },
      recovery: { operation_id: 'recovery-operation' },
      ui: { elements: Array.from({ length: 5 }, (_, i) => ({ ref: `ui-root-${i}`, kind: 'region', allowed_actions: [] })) } } };
  const original = JSON.stringify(receipt);
  const reply = actionReply(receipt, { observe: true });
  assert.equal(reply.content[0].text, original);
  assert.equal(JSON.stringify(receipt), original);
  // The exporter selects this first unchanged status/action_key/operation_id object.
  assert.deepEqual(JSON.parse(reply.content[0].text), receipt);
  const usage = JSON.parse(reply.content[1].text);
  assert.equal(usage.kind, 'dock_observation_usage');
  assert.equal(usage.observation_id, 'issued-observation');
  assert.deepEqual(usage.next_page_arguments, { cursor: 'next-page' });
  assert.deepEqual(usage.root_read_arguments, [0, 1, 2].map(i => ({ root_ref: `ui-root-${i}`, observation_id: 'issued-observation' })));
  assert.equal(JSON.stringify(usage).includes('ui-metadata'), false);
  assert.equal(JSON.stringify(usage).includes('pending-operation'), false);
  assert.match(usage.reference_usage, /Metadata refs alone are not issued/);
  assert.match(usage.reference_usage, /allowed_actions/);
  assert.match(usage.receipt_id_usage, /never an observation_id alias/);
  for (const modify of [r => delete r.output.ui, r => delete r.output.observation_id,
    r => { r.output.observation_id = ''; }, r => { r.status = 'NOT_APPLIED'; }]) {
    const candidate = structuredClone(receipt); modify(candidate);
    const result = actionReply(candidate, { observe: true });
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].text, JSON.stringify(candidate));
  }
  assert.equal(actionReply(receipt).content.length, 1);
  const noCursor = structuredClone(receipt); delete noCursor.output.page.next_cursor;
  assert.equal(Object.hasOwn(JSON.parse(actionReply(noCursor, { observe: true }).content[1].text), 'next_page_arguments'), false);
  const ambiguous = structuredClone(receipt);
  ambiguous.output.ui.elements = [
    { ref: 'ui-duplicate', kind: 'region', allowed_actions: [] },
    { ref: 'ui-duplicate', kind: 'region', allowed_actions: [] },
    { ref: 'ui-button', kind: 'button', allowed_actions: ['click'] },
    { ref: 'ui-unsafe-region', kind: 'region', allowed_actions: ['click'] },
  ];
  assert.deepEqual(JSON.parse(actionReply(ambiguous, { observe: true }).content[1].text).root_read_arguments, []);
});

// Module mocks are isolated to this child process, so actual SDK and bridge
// imports used by the other suites retain their original implementations.
test('bridge keeps application feedback recoverable over the MCP protocol', async () => {
  const environment = { ...process.env, ...desktopEnvironment, DOCK_TEST_SECRET: 'must-not-reach-browser' };
  delete environment.NODE_TEST_CONTEXT;
  let result;
  try {
    result = await promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', '--test',
      fileURLToPath(new URL('./support/bridge-contract.mjs', import.meta.url))], { timeout: 30000, env: environment });
  } catch (error) {
    const redactor = createRedactor();
    const diagnostic = redactor.text(`stdout:\n${String(error.stdout ?? '')}\nstderr:\n${String(error.stderr ?? '')}`).slice(0, 16000);
    assert.fail(`Bridge protocol test subprocess failed (${error.code ?? error.signal ?? 'unknown'}).\n${diagnostic}`);
  }
  assert.match(result.stdout, /pass 1/);
  assert.match(result.stdout, /fail 0/);
});
