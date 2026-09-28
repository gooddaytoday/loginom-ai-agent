import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createJavascriptPersistenceSaver, javascriptPersistenceSaveAction} from './javascript-persistence-save.mjs';

const storage = '/jsteach/js-g2-9150c962-ad60-4cd4-a13e-bcba89b982d8';
const workflow = {workflow_id: 'workflow', prefix: 'MF;TF-1', tab_tid: 'tab', navigation_path: [{tid: 'draft', label: 'Draft'}]};
function fixture({alter, record = async () => {}, run} = {}) {
  const prepared = {status: 'READY', document_id: 'doc', package_ref: {persisted: false}, workflow_ref: structuredClone(workflow)};
  const calls = [];
  let previous = structuredClone(workflow);
  const runtime = {async run(action, parameters, options) {
    calls.push({action, parameters: structuredClone(parameters), options});
    if (run) return run();
    const continued = {...previous, navigation_path: [{tid: 'saved', label: 'Saved'}]};
    const receipt = {status: 'SUCCEEDED', action_key: 'package.save_checkpoint', phase: 'verified', operation_id: options.operationId, output: {
      save_completed: true, reopened: false, workflow_preserved: true,
      package_ref: {path: parameters.path, active_identity: parameters.path},
      workflow_continuations: [{document_id: 'doc', previous_workflow_ref: previous, workflow_ref: continued}],
    }};
    previous = structuredClone(continued);
    alter?.(receipt);
    return receipt;
  }};
  return {prepared, calls, saver: createJavascriptPersistenceSaver({runtime, storage, prepared, deadline: Date.now() + 60000, record})};
}

test('private action scopes a copy of the actual shipped save action', async () => {
  const catalog = JSON.parse(await readFile(new URL('../../executor/catalog/actions.json', import.meta.url)));
  const action = catalog.actions.find(item => item.action_key === 'package.save_checkpoint');
  const original = structuredClone(action);
  const scoped = javascriptPersistenceSaveAction(action, storage);
  assert.deepEqual(scoped.effect.allowed_roots, [storage]);
  assert.deepEqual(action, original);
  for (const path of ['/jsteach', storage + '/..', '/other/js-g2-9150c962-ad60-4cd4-a13e-bcba89b982d8'])
    assert.throws(() => javascriptPersistenceSaveAction(action, path));
});

test('two ordered writes bind one destination and consume verified continuation', async () => {
  const {saver, calls, prepared} = fixture();
  prepared.workflow_ref.prefix = 'caller-mutated';
  await assert.rejects(saver.save(2));
  const first = await saver.save(1);
  first.workflow_ref.prefix = 'returned-mutated';
  const second = await saver.save(2);
  assert.equal(second.workflow_ref.prefix, workflow.prefix);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].parameters.path, calls[1].parameters.path);
  assert.deepEqual(calls.map(call => call.parameters.conflict_policy), ['fail', 'replace']);
  assert.notEqual(calls[0].options.operationId, calls[1].options.operationId);
  assert.ok(calls[0].options.signal instanceof AbortSignal);
  await assert.rejects(saver.save(2));
  await assert.rejects(saver.save(3));
  assert.equal(calls.length, 2);
});

const faults = {
  action: receipt => { receipt.action_key = 'package.save_as'; },
  phase: receipt => { receipt.phase = 'apply'; },
  error: receipt => { receipt.error = {message: 'unconfirmed'}; },
  status: receipt => { receipt.status = 'AMBIGUOUS'; },
  operation: receipt => { receipt.operation_id = 'foreign'; },
  path: receipt => { receipt.output.package_ref.path = '/foreign.lgp'; },
  identity: receipt => { receipt.output.package_ref.active_identity = '/foreign.lgp'; },
  incomplete: receipt => { receipt.output.save_completed = false; },
  reopened: receipt => { receipt.output.reopened = true; },
  workflow: receipt => { receipt.output.workflow_preserved = false; },
  missing: receipt => { receipt.output.workflow_continuations = []; },
  duplicate: receipt => { receipt.output.workflow_continuations.push(receipt.output.workflow_continuations[0]); },
  document: receipt => { receipt.output.workflow_continuations[0].document_id = 'foreign'; },
  previous: receipt => { receipt.output.workflow_continuations[0].previous_workflow_ref.prefix = 'foreign'; },
  changed: receipt => { receipt.output.workflow_continuations[0].workflow_ref.workflow_id = 'foreign'; },
  malformed: receipt => { receipt.output.workflow_continuations[0].workflow_ref.navigation_path = ['guessed']; },
};
for (const [name, alter] of Object.entries(faults)) test('unconfirmed save retires writer: ' + name, async () => {
  const {saver, calls} = fixture({alter});
  await assert.rejects(saver.save(1));
  await assert.rejects(saver.save(1));
  await assert.rejects(saver.save(2));
  assert.equal(calls.length, 1);
});

test('lost response cannot be retried or authorize replacement', async () => {
  const {saver, calls} = fixture({run: async () => { throw Error('lost response'); }});
  await assert.rejects(saver.save(1), /lost response/);
  await assert.rejects(saver.save(2));
  assert.equal(calls.length, 1);
});

test('reservation prevents concurrent writes before evidence acknowledgement', async () => {
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const {saver, calls} = fixture({record: async row => { if (row.phase === 'persistence_save_reserved') await barrier; }});
  const pending = saver.save(1);
  await assert.rejects(saver.save(1));
  await assert.rejects(saver.save(2));
  assert.equal(calls.length, 0);
  release(); await pending;
  assert.equal(calls.length, 1);
});

test('evidence failure after successful save cannot authorize another write', async () => {
  const {saver, calls} = fixture({record: async row => { if (row.phase === 'persistence_save_confirmed') throw Error('disk full'); }});
  await assert.rejects(saver.save(1), /disk full/);
  await assert.rejects(saver.save(2));
  assert.equal(calls.length, 1);
});

test('expired or saved package is not a new writer', () => {
  const base = {runtime: {}, storage, prepared: {status: 'READY', document_id: 'doc', workflow_ref: workflow, package_ref: {persisted: false}}, deadline: Date.now() - 1};
  assert.throws(() => createJavascriptPersistenceSaver(base));
  assert.throws(() => createJavascriptPersistenceSaver({...base, deadline: Infinity}));
  assert.throws(() => createJavascriptPersistenceSaver({...base, deadline: Date.now() + 60000,
    prepared: {...base.prepared, package_ref: {persisted: true}}}));
});
