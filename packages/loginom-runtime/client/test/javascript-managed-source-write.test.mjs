import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {javascriptSourceIdentity} from '../lib/javascript-source-read.mjs';
import {makeJavascriptManagedSourceReplaceCode, replaceManagedJavascriptSource,
  runManagedJavascriptSourceReplace} from '../lib/javascript-managed-source-write.mjs';

const old = 'const value=0;';
const source = 'const label="Привет 😀";\nconst value=1;';
const task = {operation_id: 'managed-write',
  owner: {document_id: 'doc', workflow_id: 'flow', node_id: 'node'},
  workflow_ref: {tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', prefix: 'MF;TF-1'},
  targetOrigin: 'http://logi-test-plan.bg.local', targetBuild: '7.4.2', deadline: Date.now() + 60000,
  prepared: {document_id: 'doc',
    workflow_ref: {workflow_id: 'flow', tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
      prefix: 'MF;TF-1', navigation_path: [{tid: 'nav', label: 'Scenario'}]},
    node: {document_id: 'doc', workflow_id: 'flow', node_id: 'node'}},
  allowDeactivation: true};
const owner = {...task.owner, operation_id: task.operation_id, ui_epoch: 3};

function fixture() {
  let text = old, focused = false, selected = false;
  const calls = [], events = [];
  const lease = {identity: JSON.stringify([task.owner, task.workflow_ref, task.targetOrigin,
    task.targetBuild, task.deadline]), settingAttempted: true, sourceEditorCaptured: {},
    sourceBaseline: old, handle: {}};
  const page = {
    [Symbol.for('loginom-dock.javascript-owned-selection-v1')]: new Map([[task.operation_id, lease]]),
    evaluate: async (_inspect, args) => {
      if (args.requireInputFocus && !focused) throw Error('focus changed');
      const result = {source: text, source_utf8_bytes: Buffer.byteLength(text),
        source_lf_lines: text.split('\n').length};
      if (args.locate) return {...result, point: {x: 30, y: 40}};
      if (args.selectionCheck) return {...result, selection_full: selected};
      return result;
    },
    mouse: {click: async () => {calls.push('click'); focused = true;}},
    keyboard: {press: async key => {
      calls.push(key);
      if (key === 'Control+A') selected = true;
      if (key === 'Backspace') text = '';
    }, insertText: async value => {calls.push('insertText'); text = value; selected = false;}}
  };
  const handle = {task, owner};
  const read = async () => {lease.sourceBaseline = text; return {owner, source: text, settings: {generation: true}};};
  const execute = async code => Function('return (' + code + ')')()(page);
  const record = async value => {events.push(structuredClone(value)); return value;};
  const replace = args => replaceManagedJavascriptSource({task, handle, owner, deadline: task.deadline,
    expected_source_sha256: javascriptSourceIdentity(old).source_sha256,
    source_text: source, read, execute, record,
    receiptOptions: (id, key, signature) => ({receipt_namespace: 'managed-write-test',
      receipt_id: id, receipt_signature: signature}),
    markUncertain: value => {state.uncertain = value;}, ...args});
  const state = {uncertain: false};
  return {page, lease, calls, events, handle, read, execute, replace, state,
    getSource: () => text};
}

test('one owned browser action replaces exact Unicode text and journals only digests', async () => {
  const f = fixture();
  const result = await f.replace();
  assert.equal(f.getSource(), source);
  assert.equal(result.source_sha256, javascriptSourceIdentity(source).source_sha256);
  assert.equal(result.draft_exact, true);
  assert.equal(result.wizard_commit_verified, false);
  assert.equal(f.state.uncertain, false);
  assert.deepEqual(f.calls, ['click', 'Control+A', 'Backspace', 'insertText']);
  assert.deepEqual(f.events.map(event => event.phase), ['javascript_source_write_prepared',
    'javascript_source_write_mutation_dispatch', 'javascript_source_write_draft_verified']);
  assert.ok(f.events.every(event => !JSON.stringify(event).includes('Привет')
    && !JSON.stringify(event).includes('source_text')));
  assert.equal(f.lease.sourceWriteAttempted, true);
});

test('wrong existing digest refuses before any editor action', async () => {
  const f = fixture();
  await assert.rejects(f.replace({expected_source_sha256: '0'.repeat(64)}), /baseline changed/);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.events, []);
  assert.equal(f.state.uncertain, false);
});

test('lost insertText reply leaves the original action uncertain and refuses browser replay', async () => {
  const f = fixture();
  const insert = f.page.keyboard.insertText;
  f.page.keyboard.insertText = async text => {await insert(text); throw Error('lost insert reply');};
  await assert.rejects(f.replace(), /lost insert reply/);
  assert.equal(f.getSource(), source);
  assert.equal(f.state.uncertain, true);
  assert.equal(f.calls.filter(call => call === 'insertText').length, 1);
  const gesture = {...task, gesture_id: task.operation_id + ':source-replace',
    previous_source_sha256: javascriptSourceIdentity(old).source_sha256,
    previous_source_utf8_bytes: Buffer.byteLength(old), previous_source_lf_lines: 1};
  const again = await runManagedJavascriptSourceReplace(f.page, gesture, {source_text: source,
    ...javascriptSourceIdentity(source)}, () => {});
  assert.equal(again.status, 'NOT_APPLIED');
  assert.equal(f.calls.filter(call => call === 'insertText').length, 1);
});

test('builder accepts only a validated fixed target and produces a serializable action', () => {
  const gesture = {...task, gesture_id: task.operation_id + ':source-replace',
    previous_source_sha256: javascriptSourceIdentity(old).source_sha256,
    previous_source_utf8_bytes: Buffer.byteLength(old), previous_source_lf_lines: 1};
  const code = makeJavascriptManagedSourceReplaceCode(gesture, {source_text: source,
    ...javascriptSourceIdentity(source)});
  assert.equal(typeof vm.runInNewContext('(' + code + ')'), 'function');
  assert.throws(() => makeJavascriptManagedSourceReplaceCode(gesture, {source_text: 'require("fs")',
    ...javascriptSourceIdentity('require("fs")')}), /target/);
  assert.throws(() => makeJavascriptManagedSourceReplaceCode({...gesture, gesture_id: 'other'},
    {source_text: source, ...javascriptSourceIdentity(source)}), /task/);
});
