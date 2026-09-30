import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {inspectManagedJavascriptGeneration, runManagedJavascriptGeneration,
  makeJavascriptManagedGenerationCode} from '../lib/javascript-managed-generation.mjs';
import {dispatchManagedJavascriptGeneration} from '../lib/javascript-managed-next.mjs';

const task = {operation_id: 'owned-js', owner: {document_id: 'doc', workflow_id: 'flow', node_id: 'node'},
  workflow_ref: {tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', prefix: 'MF;TF-1'},
  targetOrigin: 'http://logi-test-plan.bg.local', targetBuild: '7.4.2', deadline: Date.now() + 60000,
  prepared: {document_id: 'doc', node: {document_id: 'doc', workflow_id: 'flow', node_id: 'node'},
    workflow_ref: {workflow_id: 'flow', tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', prefix: 'MF;TF-1',
      navigation_path: [{tid: 'nav', label: ''}]}}, allowDeactivation: true};
const tid = task.workflow_ref.prefix + ';WizrdMCF;JavaScriptColumnsWizard';
const schema = {verified: true, inventory_complete: true, form: 'JavaScriptColumnsWizard', page_tid: tid,
  generation: {checked: false, disabled: false, tid: tid + ';BooleanPropEdit;ValueControl;DisplayEl'}, grids: []};
const expected = {schema, point: {x: 30, y: 40, tid: schema.generation.tid}};
const gesture = {...task, gesture_id: task.operation_id + ':generation-code', expected};

function fixture({lostClick = false, drift = false} = {}) {
  const lease = {identity: JSON.stringify([task.owner, task.workflow_ref, task.targetOrigin, task.targetBuild, task.deadline]),
    settingAttempted: true, wizardCaptured: {}, handle: {}};
  let clicks = 0;
  const page = {[Symbol.for('loginom-dock.javascript-owned-selection-v1')]: new Map([[task.operation_id, lease]]),
    evaluate: async () => ({schema: clicks ? {...schema, generation: {...schema.generation, checked: true},
      ...(drift ? {grids: [{foreign: true}]} : {})} : schema, point: expected.point}),
    mouse: {click: async () => {clicks++; if (lostClick) throw Error('lost click reply');}}};
  return {page, lease, get clicks() { return clicks; }};
}

test('generation browser inspector binds native wizard, page, schema and uncovered checkbox', () => {
  const display = {isConnected: true, getBoundingClientRect: () => ({x: 10, y: 20, width: 40, height: 40}),
    closest: () => null, contains: () => false};
  const root = {isConnected: true, querySelectorAll: () => [display]};
  const wizard = {}, tab = {Controller: {Node: {data: {node: wizard}}, FController: {FView: {el: {dom: root}}}}};
  const args = {held: {wizard, wizardRoot: root, binding: {tab}, wizardBinding: {}}, task, expected: schema};
  const context = {args, readPage: () => ({ready: true, node_guid: 'node',
    page: {tid, index: 0, indicator_count: 4}}), readSchema: () => schema,
    bg: {app: {Application: {FInstance: {FMainForm: {Items: {Workspace: {getActiveTab: () => tab}}}}}}},
    document: {elementFromPoint: () => display}, innerWidth: 100, innerHeight: 100,
    getComputedStyle: () => ({visibility: 'visible'})};
  const inspect = () => vm.runInNewContext('(' + inspectManagedJavascriptGeneration.toString() +
    ')(args,readPage,readSchema)', context);
  assert.deepEqual(JSON.parse(JSON.stringify(inspect())), expected);
  context.document.elementFromPoint = () => null;
  assert.throws(inspect, /covered/);
  context.document.elementFromPoint = () => display;
  context.readSchema = () => ({...schema, generation: {...schema.generation, disabled: true}});
  assert.throws(inspect, /schema changed/);
  context.readSchema = () => schema;
  tab.Controller.Node.data.node = {};
  assert.throws(inspect, /wizard changed/);
});

test('generation transition performs one click, verifies native schema and refuses replay', async () => {
  const f = fixture();
  const result = await runManagedJavascriptGeneration(f.page, gesture, () => {});
  assert.equal(result.output.generation_readback_verified, true);
  assert.equal(result.output.wizard_commit_verified, false);
  assert.equal(f.clicks, 1);
  assert.equal((await runManagedJavascriptGeneration(f.page, gesture, () => {})).status, 'NOT_APPLIED');
  assert.equal(f.clicks, 1);
  assert.equal(typeof vm.runInNewContext('(' + makeJavascriptManagedGenerationCode({...task, gesture_id: gesture.gesture_id}, expected) + ')'), 'function');
  assert.equal(typeof vm.runInNewContext('(' + makeJavascriptManagedGenerationCode(task) + ')'), 'function');
});

for (const option of ['lostClick', 'drift']) test(option + ' retains the one-shot attempt', async () => {
  const f = fixture({[option]: true});
  await assert.rejects(() => runManagedJavascriptGeneration(f.page, gesture, () => {}),
    option === 'lostClick' ? /lost click reply/ : /readback differs/);
  assert.equal(f.lease.generationAttempted, true);
  assert.equal((await runManagedJavascriptGeneration(f.page, gesture, () => {})).status, 'NOT_APPLIED');
  assert.equal(f.clicks, 1);
});

for (const change of ['owner', 'next', 'deadline', 'schema']) test(change + ' refuses before generation click', async () => {
  const f = fixture();
  const changed = {...gesture};
  if (change === 'owner') changed.owner = {...task.owner, node_id: 'foreign'};
  if (change === 'next') f.lease.nextAttempted = true;
  if (change === 'deadline') changed.deadline = Date.now() - 1;
  if (change === 'schema') changed.expected = {...expected, schema: {...schema, grids: [{changed: true}]}};
  assert.equal((await runManagedJavascriptGeneration(f.page, changed, () => {})).status, 'NOT_APPLIED');
  assert.equal(f.clicks, 0);
});

test('generation journal ACK precedes dispatch; an already enabled mode performs no action', async () => {
  let calls = 0;
  const execute = async () => {calls++; return calls === 1 ? {} : calls === 2 ? expected
    : {status: 'SUCCEEDED', action_key: 'javascript.schema.generation', operation_id: gesture.gesture_id};};
  const receiptOptions = (id, key, signature) => ({receipt_namespace: 'test', receipt_id: id, receipt_signature: signature});
  await assert.rejects(() => dispatchManagedJavascriptGeneration({task, execute, receiptOptions,
    record: async event => ({...event, generation: false})}), /journal ACK differs/);
  assert.equal(calls, 2);
  calls = 0;
  assert.equal((await dispatchManagedJavascriptGeneration({task, execute, receiptOptions,
    record: async event => event})).status, 'SUCCEEDED');
  assert.equal(calls, 3);
  const enabled = await dispatchManagedJavascriptGeneration({task,
    execute: async () => ({schema: {...schema, generation: {...schema.generation, checked: true}}}),
    record: async () => {throw Error('unexpected journal');}, receiptOptions});
  assert.equal(enabled.effect_possible, false);
});

test('generation code rejects arbitrary gesture or an already enabled baseline', () => {
  assert.throws(() => makeJavascriptManagedGenerationCode({...task, gesture_id: 'other'}, expected), /baseline/);
  assert.throws(() => makeJavascriptManagedGenerationCode({...task, gesture_id: gesture.gesture_id}, {...expected,
    schema: {...schema, generation: {...schema.generation, checked: true}}}), /baseline/);
});
