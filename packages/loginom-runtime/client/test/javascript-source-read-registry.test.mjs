import test from 'node:test';
import assert from 'node:assert/strict';
import {createJavascriptSourceReadRegistry} from '../lib/javascript-source-read-registry.mjs';
import {createJavascriptSourceReadSession} from '../lib/javascript-source-read-session.mjs';
import {createRedactor} from '../lib/redact.mjs';

const node = {document_id: 'document', workflow_id: 'workflow', node_id: 'node'};
const initial = {kind: 'source', operation_id: 'js-read', document_id: 'document',
  workflow_ref: {workflow_id: 'workflow', tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
    prefix: 'MF;TF-1', navigation_path: [{tid: 'MF;TF-1;path', label: 'Scenario'}]},
  node, budget_ms: 60000};

function fixture({closeFails = false} = {}) {
  const calls = [];
  const registry = createJavascriptSourceReadRegistry({openSession: async request => {
    calls.push('session');
    const deadline = Date.now() + 55000;
    return createJavascriptSourceReadSession({request, uiEpoch: 1, deadline, chunkBytes: 8,
      redactor: createRedactor(), record: async event => event,
      adapter: {
        open: async () => {calls.push('open'); return {};},
        read: async (handle, {owner}) => {calls.push('read'); return {owner,
          source: 'const value = "Сумма 😀";', settings: {generation: true}};},
        discard: async (handle, {owner}) => {calls.push('close');
          if (closeFails) throw Error('lost Close reply');
          return {closed: true, owner};}
      }});
  }});
  return {registry, calls};
}

test('exact initial and continuation retries reuse delivered chunks without reopening', async () => {
  const f = fixture();
  const first = await f.registry.read(initial);
  assert.equal((await f.registry.read(structuredClone(initial))).source_text, first.source_text);
  assert.equal(f.calls.filter(call => call === 'open').length, 1);
  const next = {kind: 'source', operation_id: initial.operation_id,
    cursor: first.cursor, expected_source_sha256: first.source_sha256};
  const second = await f.registry.read(next);
  assert.equal((await f.registry.read({...next})).source_text, second.source_text);
  assert.equal(f.calls.filter(call => call === 'open').length, 2);
  await assert.rejects(() => f.registry.read({...initial, budget_ms: 59999}), /ID reused/);
});

test('one in-flight initial request is joined, conflicting request is refused', async () => {
  let release, entered;
  const started = new Promise(resolve => {entered = resolve;});
  let opens = 0;
  const registry = createJavascriptSourceReadRegistry({openSession: async request => {
    opens++; entered(); await new Promise(resolve => {release = resolve;});
    return {owner: {operation_id: request.operation_id}, uncertain: false,
      read: async () => ({kind: 'source', source_text: 'one'})};
  }});
  const one = registry.read(initial);
  await started;
  const two = registry.read(structuredClone(initial));
  await assert.rejects(() => registry.read({...initial, budget_ms: 59000}), /ID reused/);
  await assert.rejects(() => registry.read({...initial, operation_id: 'other'}), /Another JavaScript source operation/);
  release();
  assert.deepEqual(await one, await two);
  assert.equal(opens, 1);
});

test('lost Close reply retires the operation and cannot reopen on retry', async () => {
  const f = fixture({closeFails: true});
  await assert.rejects(() => f.registry.read(initial), /lost Close reply/);
  await assert.rejects(() => f.registry.read(initial), /uncertain; no replay/);
  assert.equal(f.calls.filter(call => call === 'open').length, 1);
  assert.equal(f.calls.filter(call => call === 'close').length, 1);
});

test('a cursor without a known initial operation cannot open a browser', async () => {
  const f = fixture();
  await assert.rejects(() => f.registry.read({kind: 'source', operation_id: initial.operation_id,
    cursor: '00000000-0000-4000-8000-000000000000', expected_source_sha256: 'a'.repeat(64)}),
  /Unknown JavaScript source operation/);
  assert.deepEqual(f.calls, []);
});
