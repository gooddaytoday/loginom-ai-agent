import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRedactor} from '../lib/redact.mjs';
import {createJavascriptSourceReadSession, validateJavascriptSourceReadRequest} from '../lib/javascript-source-read-session.mjs';

const node = {document_id: 'document', workflow_id: 'workflow', node_id: 'node'};
const initial = {kind: 'source', operation_id: 'js-source-read', document_id: 'document',
  workflow_ref: {workflow_id: 'workflow', tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
    prefix: 'MF;TF-1', navigation_path: [{tid: 'MF;TF-1;path', label: 'Scenario'}]},
  node, budget_ms: 60000};
const hash = value => createHash('sha256').update(value).digest('hex');

function fixture({source = 'const name = "Сумма 😀";', secret, chunkBytes = 8} = {}) {
  const events = [], calls = [];
  const state = {source};
  const deadline = Date.now() + 55000;
  const adapter = {
    async open({owner}) {calls.push('open'); return {owner};},
    async read(handle, {owner}) {calls.push('read'); assert.deepEqual(owner, handle.owner);
      return {owner, source: state.source, settings: {generation: true}};},
    async discard(handle, {owner}) {calls.push('close'); assert.deepEqual(owner, handle.owner);
      return {closed: true, owner};},
  };
  const session = createJavascriptSourceReadSession({request: initial, uiEpoch: 5, deadline,
    adapter, redactor: createRedactor(secret ? [secret] : []), chunkBytes,
    record: async event => {events.push(structuredClone(event)); return event;}});
  return {session, calls, events, state};
}

test('source request admits only an owned existing JS node or a bounded cursor continuation', () => {
  assert.equal(validateJavascriptSourceReadRequest(initial), 'initial');
  const {budget_ms: omittedBudget, ...withoutBudget} = initial;
  assert.equal(validateJavascriptSourceReadRequest(withoutBudget), 'initial');
  for (const extra of [{source_text: ''}, {settings: {}}, {source_operation_id: 'other'},
    {read: {ports: [0]}}, {finish: 'execute'}, {execute: true}, {target: node}])
    assert.throws(() => validateJavascriptSourceReadRequest({...initial, ...extra}));
  for (const patch of [{node: {...node, node_id: 'wrong', workflow_id: 'other'}},
    {document_id: 'foreign'}, {budget_ms: 0}, {budget_ms: 1800001}])
    assert.throws(() => validateJavascriptSourceReadRequest({...initial, ...patch}));
  assert.throws(() => validateJavascriptSourceReadRequest({kind: 'source', operation_id: 'js-source-read',
    cursor: 'not-a-cursor', expected_source_sha256: hash('')}));
});

test('full Unicode source returns exact bounded chunks with one open/read/discard per chunk', async () => {
  const f = fixture();
  let request = initial, delivered = '', count = 0;
  do {
    const receipt = await f.session.read(request);
    assert.equal(receipt.kind, 'source');
    assert.equal(receipt.offset_utf8_bytes, Buffer.byteLength(delivered, 'utf8'));
    delivered += receipt.source_text; count++;
    request = receipt.cursor ? {kind: 'source', operation_id: initial.operation_id,
      cursor: receipt.cursor, expected_source_sha256: receipt.source_sha256} : null;
  } while (request);
  assert.equal(delivered, f.state.source);
  assert.ok(count > 1);
  assert.equal(f.calls.filter(call => call === 'open').length, count);
  assert.equal(f.calls.filter(call => call === 'read').length, count * 3);
  assert.equal(f.calls.filter(call => call === 'close').length, count);
  assert.equal(f.events.filter(event => event.phase === 'source_delivery_verified').length, count);
  assert.ok(!JSON.stringify(f.events).includes('Сумма'));
  await assert.rejects(() => f.session.read(initial), /initial request changed/);
});

test('continuation binds the original operation and refuses a changed source digest', async () => {
  const f = fixture();
  const first = await f.session.read(initial);
  const next = {kind: 'source', operation_id: initial.operation_id,
    cursor: first.cursor, expected_source_sha256: first.source_sha256};
  assert.ok(first.cursor);
  await assert.rejects(() => f.session.read({...next, operation_id: 'other'}), /operation changed/);
  await assert.rejects(() => f.session.read({...next, expected_source_sha256: hash('other')}), /cursor\/digest refused/);
  f.state.source += 'changed';
  await assert.rejects(() => f.session.read(next), /continuation digest changed/);
  assert.equal(f.session.uncertain, true);
  assert.equal(f.calls.filter(call => call === 'close').length, 2);
});

test('full-source secret across chunk boundary refuses before first delivery and closes the wizard', async () => {
  const f = fixture({source: 'const key = "TOPSECRET";', secret: 'TOPSECRET', chunkBytes: 4});
  await assert.rejects(() => f.session.read(initial), /redaction refused/);
  assert.equal(f.calls.filter(call => call === 'close').length, 1);
  assert.equal(f.events.filter(event => event.phase === 'source_delivery_verified').length, 0);
  assert.ok(!JSON.stringify(f.events).includes('TOPSECRET'));
});

test('structured redaction that rewrites JSON-like source refuses exact delivery', async () => {
  const f = fixture({source: '[ 1, 2 ]'});
  await assert.rejects(() => f.session.read(initial), /structured redaction refused/);
  assert.equal(f.calls.filter(call => call === 'close').length, 1);
  assert.equal(f.events.filter(event => event.phase === 'source_delivery_verified').length, 0);
});
