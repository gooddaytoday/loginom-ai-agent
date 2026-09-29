import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {makeJavascriptManagedSourceCode, readManagedJavascriptSource} from '../lib/javascript-managed-source.mjs';

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
  const page = {evaluate: async () => ({account: 'jsteach'}),
    [Symbol.for('loginom-dock.javascript-owned-selection-v1')]: new Map([[task.operation_id, lease]])};
  const source = async (_page, prepared, account) => {
    assert.deepEqual(prepared, task.prepared); assert.equal(account, 'jsteach');
    return {verified: true, source: '// ё 😀', node_context: {...task.owner, verified: true, surface: 'wizard'}};
  };
  return {page, lease, source};
}

test('managed source read requires the held Setting lease and exact wizard owner', async () => {
  const f = fixture();
  assert.equal((await readManagedJavascriptSource(f.page, task, f.source)).source, '// ё 😀');
  f.lease.settingAttempted = false;
  await assert.rejects(readManagedJavascriptSource(f.page, task, f.source), /lease unavailable/);
  f.lease.settingAttempted = true;
  f.lease.identity = 'foreign';
  await assert.rejects(readManagedJavascriptSource(f.page, task, f.source), /lease unavailable/);
  f.lease.identity = fixture().lease.identity;
  await assert.rejects(readManagedJavascriptSource(f.page, task, async () =>
    ({verified: true, source: 'x', node_context: {verified: true, surface: 'wizard', ...task.owner, node_id: 'other'}})),
  /owner changed/);
});

test('managed source builder accepts only exact prepared wizard task', () => {
  const code = makeJavascriptManagedSourceCode(task);
  assert.equal(typeof vm.runInNewContext('(' + code + ')'), 'function');
  assert.ok(code.includes('readJavascriptSourceContext'));
  assert.throws(() => makeJavascriptManagedSourceCode({...task, prepared: {...task.prepared, node: {...task.owner, node_id: 'foreign'}}}));
});

test('managed source refuses a detached preparation receipt before reading code', async () => {
  const f = fixture();
  const document = {}, workflow = {}, receipt = {phase: 'verified', workflowId: 'flow', nodeTargetWorkflowNode: workflow};
  const preparation = {document, id: 'doc', receipts: new Map([['owner', receipt]])};
  f.lease.handle = {preparation, receipt, binding: {workflow}, account: 'jsteach'};
  const context = {document, __loginomDockPreparationV1: preparation,
    bg: {app: {Application: {FInstance: {FMainForm: {FMapTree: {FServerConnection: {UserName: 'jsteach'}}}}}}}};
  f.page.evaluate = async (fn, args) => vm.runInNewContext('(' + fn.toString() + ')(args)', {...context, args});
  assert.equal((await readManagedJavascriptSource(f.page, task, f.source)).verified, true);
  preparation.receipts.delete('owner');
  await assert.rejects(readManagedJavascriptSource(f.page, task, async () => assert.fail('source read after detached receipt')),
    /preparation changed/);
});
