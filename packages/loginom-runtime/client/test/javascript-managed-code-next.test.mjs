import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {javascriptSourceIdentity} from '../lib/javascript-source-read.mjs';
import {dispatchManagedJavascriptCodeNext, inspectManagedJavascriptCodeNextPoint,
  makeJavascriptManagedCodeNextGestureCode, makeJavascriptManagedCodeNextPointCode,
  runManagedJavascriptCodeNextGesture} from '../lib/javascript-managed-code-next.mjs';

const task = {operation_id: 'owned-js', owner: {document_id: 'doc', workflow_id: 'flow', node_id: 'node'},
  workflow_ref: {tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', prefix: 'MF;TF-1'},
  targetOrigin: 'http://logi-test-plan.bg.local', targetBuild: '7.4.2', deadline: Date.now() + 60000,
  prepared: {document_id: 'doc', node: {document_id: 'doc', workflow_id: 'flow', node_id: 'node'},
    workflow_ref: {workflow_id: 'flow', tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
      prefix: 'MF;TF-1', navigation_path: [{tid: 'nav', label: ''}]}}, allowDeactivation: true};
const source = 'const value=1;';
const sha = javascriptSourceIdentity(source).source_sha256;
const pageState = {ready: true, node_guid: 'node', page: {
  tid: 'MF;TF-1;WizrdMCF;JavaScriptCodeWizard', index: 1, indicator_count: 4, visible_editors: 1}};
const point = {x: 30, y: 40, tid: 'MF;TF-1;WizrdMCF;btnNext',
  page_tid: pageState.page.tid, page_index: 1, node_id: 'node'};

test('managed Code Next point requires the retained wizard and uncovered native control', () => {
  const button = {id: 'button', isConnected: true, getBoundingClientRect: () => ({x: 10, y: 20, width: 40, height: 40}),
    closest: () => null, getAttribute: () => null, contains: () => false};
  const root = {isConnected: true, getAttribute: () => 'MF;TF-1;WizrdMCF', querySelectorAll: () => [button]};
  const wizard = {}, tab = {Controller: {Node: {data: {node: wizard}}, FController: {FView: {el: {dom: root}}}}};
  const context = {args: {held: {binding: {tab}, wizard, wizardRoot: root}, task}, read: () => pageState,
    bg: {app: {Application: {FInstance: {FMainForm: {Items: {Workspace: {getActiveTab: () => tab}}}}}}},
    Ext: {getCmp: () => ({el: {dom: button}, disabled: false})},
    document: {elementFromPoint: () => button}, innerWidth: 100, innerHeight: 100,
    getComputedStyle: () => ({visibility: 'visible'})};
  const inspect = () => vm.runInNewContext('(' + inspectManagedJavascriptCodeNextPoint.toString() + ')(args,read)', context);
  assert.deepEqual({...inspect()}, point);
  context.document.elementFromPoint = () => null;
  assert.throws(inspect, /covered/);
  context.document.elementFromPoint = () => button;
  context.read = () => ({...pageState, page: {...pageState.page, visible_editors: 0}});
  assert.throws(inspect, /page changed/);
});

test('managed Code Next checks exact draft before one click and refuses replay', async () => {
  const lease = {identity: JSON.stringify([task.owner, task.workflow_ref, task.targetOrigin, task.targetBuild, task.deadline]),
    settingAttempted: true, wizardCaptured: {}, sourceEditorCaptured: {},
    sourceDraftSha256: sha, sourceDraftText: source, handle: {}};
  let clicks = 0, currentSource = source, currentPoint = point;
  const page = {[Symbol.for('loginom-dock.javascript-owned-selection-v1')]: new Map([[task.operation_id, lease]]),
    evaluate: async (_inspect, args) => args.editor ? {source: currentSource} : currentPoint,
    mouse: {click: async (x, y) => {assert.equal(x, point.x); assert.equal(y, point.y); clicks++;}}};
  const gesture = {...task, expected_source_sha256: sha, gesture_id: task.operation_id + ':next-code-done', point};
  assert.equal(typeof vm.runInNewContext('(' + makeJavascriptManagedCodeNextPointCode(gesture) + ')'), 'function');
  assert.equal(typeof vm.runInNewContext('(' + makeJavascriptManagedCodeNextGestureCode(gesture) + ')'), 'function');
  const result = await runManagedJavascriptCodeNextGesture(page, gesture, () => {}, () => {});
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.output.transition_verified, false);
  assert.equal(clicks, 1);
  assert.equal((await runManagedJavascriptCodeNextGesture(page, gesture, () => {}, () => {})).status, 'NOT_APPLIED');
  lease.codeNextAttempted = false;
  currentSource = 'changed';
  assert.equal((await runManagedJavascriptCodeNextGesture(page, gesture, () => {}, () => {})).status, 'NOT_APPLIED');
  currentSource = source;
  currentPoint = {...point, x: 31};
  assert.equal((await runManagedJavascriptCodeNextGesture(page, gesture, () => {}, () => {})).status, 'NOT_APPLIED');
  assert.equal(clicks, 1);
});

test('managed Code Next requires source digest and journal ACK before dispatch', async () => {
  let calls = 0;
  const execute = async () => {calls++; return calls === 1 ? {verified: true, source}
    : calls === 2 ? point : {status: 'SUCCEEDED', action_key: 'javascript.wizard.code.next',
      operation_id: task.operation_id + ':next-code-done', output: {next_gesture_returned: true}};};
  const receiptOptions = (id, key, signature) => ({receipt_namespace: 'private-test',
    receipt_id: id, receipt_signature: signature});
  await assert.rejects(dispatchManagedJavascriptCodeNext({task, expected_source_sha256: 'b'.repeat(64),
    execute, record: async event => event, receiptOptions}), /source baseline changed/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(dispatchManagedJavascriptCodeNext({task, expected_source_sha256: sha,
    execute, record: async event => ({...event, phase: 'wrong'}), receiptOptions}), /journal ACK differs/);
  assert.equal(calls, 2);
  calls = 0;
  const result = await dispatchManagedJavascriptCodeNext({task, expected_source_sha256: sha,
    execute, record: async event => event, receiptOptions});
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(calls, 3);
});
