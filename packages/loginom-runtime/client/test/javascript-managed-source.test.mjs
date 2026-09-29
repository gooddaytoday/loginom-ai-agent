import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {inspectManagedJavascriptSourceEditor, makeJavascriptManagedSourceCode, readManagedJavascriptSource} from '../lib/javascript-managed-source.mjs';
import {runManagedJavascriptSelectionRead} from '../lib/javascript-managed-selection.mjs';
import {sourceFixture} from './support/javascript-source-fixture.mjs';

const task = {
  operation_id: 'managed-js-test',
  owner: {document_id: 'doc', workflow_id: 'flow', node_id: 'node'},
  workflow_ref: {tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', prefix: 'MF;TF-1'},
  targetOrigin: 'http://logi-test-plan.bg.local', targetBuild: '7.4.2', deadline: Date.now() + 10000,
  prepared: {document_id: 'doc',
    workflow_ref: {workflow_id: 'flow', tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', prefix: 'MF;TF-1',
      navigation_path: [{tid: 'MF;TF-1;cnrNaviMode;b.s_Scenario', label: 'Scenario'}]},
    node: {document_id: 'doc', workflow_id: 'flow', node_id: 'node'}},
  allowDeactivation: true,
};

function fixture() {
  const lease = {identity: JSON.stringify([task.owner, task.workflow_ref, task.targetOrigin, task.targetBuild, task.deadline]),
    settingAttempted: true, handle: {}};
  const editor = {source: '// ё 😀', source_utf8_bytes: Buffer.byteLength('// ё 😀'), source_lf_lines: 1};
  const inspect = () => structuredClone(editor);
  const page = {evaluate: async fn => fn === inspect ? inspect() : ({account: 'jsteach'}),
    evaluateHandle: async fn => {assert.equal(fn, inspect); return {retained: true};},
    [Symbol.for('loginom-dock.javascript-owned-selection-v1')]: new Map([[task.operation_id, lease]])};
  const source = async (_page, prepared, account) => {
    assert.deepEqual(prepared, task.prepared); assert.equal(account, 'jsteach');
    return {verified: true, ...inspect(), node_context: {...task.owner, verified: true, surface: 'wizard'}};
  };
  return {page, lease, source, inspect, editor};
}

test('managed source read requires the held Setting lease and exact wizard owner', async () => {
  const f = fixture();
  assert.equal((await readManagedJavascriptSource(f.page, task, f.source, f.inspect)).source, '// ё 😀');
  f.lease.settingAttempted = false;
  await assert.rejects(readManagedJavascriptSource(f.page, task, f.source, f.inspect), /lease unavailable/);
  f.lease.settingAttempted = true;
  f.lease.identity = 'foreign';
  await assert.rejects(readManagedJavascriptSource(f.page, task, f.source, f.inspect), /lease unavailable/);
  f.lease.identity = fixture().lease.identity;
  await assert.rejects(readManagedJavascriptSource(f.page, task, async () =>
    ({verified: true, source: 'x', node_context: {verified: true, surface: 'wizard', ...task.owner, node_id: 'other'}}), f.inspect),
  /owner changed/);
});

test('managed source builder accepts only exact prepared wizard task', () => {
  const code = makeJavascriptManagedSourceCode(task);
  assert.equal(typeof vm.runInNewContext('(' + code + ')'), 'function');
  assert.ok(code.includes('readJavascriptSourceContext'));
  assert.ok(code.includes('inspectManagedJavascriptSourceEditor'));
  assert.throws(() => makeJavascriptManagedSourceCode({...task, prepared: {...task.prepared, node: {...task.owner, node_id: 'foreign'}}}));
});

test('managed source refuses a detached preparation receipt before reading code', async () => {
  const f = fixture();
  const document = {}, workflow = {}, receipt = {phase: 'verified', workflowId: 'flow', nodeTargetWorkflowNode: workflow};
  const preparation = {document, id: 'doc', receipts: new Map([['owner', receipt]])};
  f.lease.handle = {preparation, receipt, binding: {workflow}, account: 'jsteach'};
  const context = {document, __loginomDockPreparationV1: preparation,
    bg: {app: {Application: {FInstance: {FMainForm: {FMapTree: {FServerConnection: {UserName: 'jsteach'}}}}}}}};
  f.page.evaluate = async (fn, args) => fn === f.inspect ? f.inspect()
    : vm.runInNewContext('(' + fn.toString() + ')(args)', {...context, args});
  assert.equal((await readManagedJavascriptSource(f.page, task, f.source, f.inspect)).verified, true);
  preparation.receipts.delete('owner');
  await assert.rejects(readManagedJavascriptSource(f.page, task, async () => assert.fail('source read after detached receipt'), f.inspect),
    /preparation changed/);
});

test('managed source retains one editor handle and refuses text drift during a read', async () => {
  const f = fixture();
  let captures = 0;
  f.page.evaluateHandle = async () => {captures++; return {retained: true};};
  await readManagedJavascriptSource(f.page, task, f.source, f.inspect);
  await readManagedJavascriptSource(f.page, task, f.source, f.inspect);
  assert.equal(captures, 1);
  const changed = async () => {f.editor.source = 'foreign'; return {verified: true, source: '// ё 😀',
    source_utf8_bytes: Buffer.byteLength('// ё 😀'), source_lf_lines: 1,
    node_context: {...task.owner, verified: true, surface: 'wizard'}};};
  await assert.rejects(readManagedJavascriptSource(f.page, task, changed, f.inspect), /editor changed during read/);
  assert.equal(captures, 1);
});

test('serialized editor inspector retains native CodeMirror and focus identity', () => {
  const f = sourceFixture('const label = "Привет 😀";\n');
  f.context.native.ParentNode = {FGuid: 'node'};
  f.environment.location = {origin: task.targetOrigin};
  const receipt = [...f.environment.__loginomDockPreparationV1.receipts.values()][0];
  const held = {preparation: f.environment.__loginomDockPreparationV1, receipt, account: 'owner',
    binding: f.binding, wizard: f.context.native, wizardRoot: f.context.root};
  const request = {owner: {document_id: 'document', workflow_id: 'workflow', node_id: 'node'},
    workflow_ref: {prefix: 'workflow'}, targetOrigin: task.targetOrigin, targetBuild: '7.4.2'};
  const inspect = args => vm.runInNewContext('(' + inspectManagedJavascriptSourceEditor.toString() + ')(args)',
    {...f.environment, args});
  const editor = inspect({held, editor: null, task: request, capture: true});
  assert.deepEqual(JSON.parse(JSON.stringify(inspect({held, editor, task: request}))),
    {source: f.getSource(), source_utf8_bytes: Buffer.byteLength(f.getSource()), source_lf_lines: 2});
  assert.deepEqual(JSON.parse(JSON.stringify(inspect({held, editor, task: request, locate: true}).point)),
    {x: 45, y: 25});
  f.document.activeElement = f.input;
  assert.throws(() => inspect({held, editor, task: request}), /identity changed/);
  f.setSelection(f.getSource());
  assert.equal(inspect({held, editor, task: request, requireInputFocus: true, selectionCheck: true}).selection_full, true);
  f.document.activeElement = editor.focus;
  f.wrapper.CodeMirror = {...f.cm, getWrapperElement: () => f.wrapper};
  assert.throws(() => inspect({held, editor, task: request}), /identity changed/);
  f.wrapper.CodeMirror = f.cm;
  receipt.phase = 'retired';
  assert.throws(() => inspect({held, editor, task: request}), /owner changed/);
});

test('owned selection disposal releases the retained editor before wizard and graph handles', async () => {
  const disposed = [];
  const lease = {identity: JSON.stringify([task.owner, task.workflow_ref, task.targetOrigin, task.targetBuild, task.deadline]),
    sourceEditorCaptured: {dispose: async () => disposed.push('editor')},
    wizardCaptured: {dispose: async () => disposed.push('wizard')},
    handle: {dispose: async () => disposed.push('graph')}};
  const leases = new Map([[task.operation_id, lease]]);
  const page = {[Symbol.for('loginom-dock.javascript-owned-selection-v1')]: leases};
  assert.deepEqual(await runManagedJavascriptSelectionRead(page, {...task, mode: 'dispose'}), {disposed: true});
  assert.deepEqual(disposed, ['editor', 'wizard', 'graph']);
  assert.equal(leases.size, 0);
});
