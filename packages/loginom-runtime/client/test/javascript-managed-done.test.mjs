import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {dispatchManagedJavascriptDone, inspectManagedJavascriptDonePoint,
  makeJavascriptManagedDoneGestureCode, makeJavascriptManagedDonePointCode,
  runManagedJavascriptDoneGesture} from '../lib/javascript-managed-done.mjs';

const task = {operation_id: 'owned-js', owner: {document_id: 'doc', workflow_id: 'flow', node_id: 'node'},
  workflow_ref: {tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', prefix: 'MF;TF-1'},
  targetOrigin: 'http://logi-test-plan.bg.local', targetBuild: '7.4.2', deadline: Date.now() + 60000,
  prepared: {document_id: 'doc', node: {document_id: 'doc', workflow_id: 'flow', node_id: 'node'},
    workflow_ref: {workflow_id: 'flow', tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
      prefix: 'MF;TF-1', navigation_path: [{tid: 'nav', label: ''}]}}, allowDeactivation: true};
const sha = 'a'.repeat(64);
const pageState = {ready: true, node_guid: 'node', page: {
  tid: 'MF;TF-1;WizrdMCF;DoneWizard', index: 3, indicator_count: 4, visible_editors: 0}};
const point = {x: 30, y: 40, tid: 'MF;TF-1;WizrdMCF;btnDone',
  page_tid: pageState.page.tid, page_index: 3, node_id: 'node'};

test('managed Done point requires the retained wizard and uncovered native control', () => {
  const button = {id: 'button', isConnected: true, getBoundingClientRect: () => ({x: 10, y: 20, width: 40, height: 40}),
    closest: () => null, getAttribute: () => null, contains: () => false};
  const root = {isConnected: true, getAttribute: () => 'MF;TF-1;WizrdMCF', querySelectorAll: () => [button]};
  const wizard = {}, tab = {Controller: {Node: {data: {node: wizard}}, FController: {FView: {el: {dom: root}}}}};
  const context = {args: {held: {binding: {tab}, wizard, wizardRoot: root}, task}, read: () => pageState,
    bg: {app: {Application: {FInstance: {FMainForm: {Items: {Workspace: {getActiveTab: () => tab}}}}}}},
    Ext: {getCmp: () => ({el: {dom: button}, disabled: false})},
    document: {elementFromPoint: () => button}, innerWidth: 100, innerHeight: 100,
    getComputedStyle: () => ({visibility: 'visible'})};
  const inspect = () => vm.runInNewContext('(' + inspectManagedJavascriptDonePoint.toString() + ')(args,read)', context);
  assert.deepEqual({...inspect()}, point);
  context.document.elementFromPoint = () => null;
  assert.throws(inspect, /covered/);
  context.document.elementFromPoint = () => button;
  context.read = () => ({...pageState, page: {...pageState.page, index: 2}});
  assert.throws(inspect, /page changed/);
});

test('managed Done uses one browser click and refuses replay or changed draft', async () => {
  const lease = {identity: JSON.stringify([task.owner, task.workflow_ref, task.targetOrigin, task.targetBuild, task.deadline]),
    settingAttempted: true, wizardCaptured: {}, sourceDraftSha256: sha, handle: {}};
  let clicks = 0, current = point;
  const page = {[Symbol.for('loginom-dock.javascript-owned-selection-v1')]: new Map([[task.operation_id, lease]]),
    evaluate: async () => current,
    mouse: {click: async (x, y) => {assert.equal(x, point.x); assert.equal(y, point.y); clicks++;}}};
  const gesture = {...task, expected_source_sha256: sha, gesture_id: task.operation_id + ':done', point};
  assert.equal(typeof vm.runInNewContext('(' + makeJavascriptManagedDonePointCode(gesture) + ')'), 'function');
  assert.equal(typeof vm.runInNewContext('(' + makeJavascriptManagedDoneGestureCode(gesture) + ')'), 'function');
  const result = await runManagedJavascriptDoneGesture(page, gesture, () => {});
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.output.wizard_commit_verified, false);
  assert.equal(clicks, 1);
  assert.equal((await runManagedJavascriptDoneGesture(page, gesture, () => {})).status, 'NOT_APPLIED');
  lease.doneAttempted = false;
  current = {...point, x: 31};
  assert.equal((await runManagedJavascriptDoneGesture(page, gesture, () => {})).status, 'NOT_APPLIED');
  lease.sourceDraftSha256 = 'b'.repeat(64);
  assert.equal((await runManagedJavascriptDoneGesture(page, gesture, () => {})).status, 'NOT_APPLIED');
  assert.equal(clicks, 1);
});

test('managed Done requires exact journal ACK before dispatch', async () => {
  let calls = 0;
  const execute = async () => {calls++; return calls === 1 ? point : {status: 'SUCCEEDED',
    phase:'gesture_returned',effect_possible:true,cleanup_complete:true,error:null,action_revision:'1',
    action_key: 'javascript.wizard.done', operation_id: task.operation_id + ':done',
    output: {done_gesture_returned: true, wizard_commit_verified: false,execution_started:null}};};
  const receiptOptions = (id, key, signature) => ({receipt_namespace: 'private-test',
    receipt_id: id, receipt_signature: signature});
  await assert.rejects(dispatchManagedJavascriptDone({task, expected_source_sha256: sha, execute,
    record: async event => ({...event, phase: 'wrong'}), receiptOptions}), /journal ACK differs/);
  assert.equal(calls, 1);
  calls = 0;
  const result = await dispatchManagedJavascriptDone({task, expected_source_sha256: sha, execute,
    record: async event => event, receiptOptions});
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(calls, 2);
  assert.throws(() => makeJavascriptManagedDonePointCode({...task, expected_source_sha256: 'invalid'}), /draft digest/);
});

function dispatchFixture(deadline=task.deadline) {
  const calls=[],events=[],request={...task,deadline};
  const receipt={status:'SUCCEEDED',phase:'gesture_returned',effect_possible:true,cleanup_complete:true,
    error:null,action_key:'javascript.wizard.done',action_revision:'1',operation_id:task.operation_id+':done',
    output:{done_gesture_returned:true,wizard_commit_verified:false,execution_started:null}};
  const options={task:request,expected_source_sha256:sha,
    execute:async()=>{calls.push(calls.length?'gesture':'point');return calls.length===1?point:receipt;},
    record:async event=>{events.push(structuredClone(event));return{...event,recorded_at:new Date().toISOString()};},
    receiptOptions:(id,key,signature)=>({receipt_namespace:'done-test',receipt_id:id,receipt_signature:signature})};
  return {calls,events,receipt,options};
}

test('Done durably records immutable prepared and returned receipts under one original deadline',async()=>{
  const f=dispatchFixture();assert.equal(await dispatchManagedJavascriptDone(f.options),f.receipt);
  assert.deepEqual(f.calls,['point','gesture']);
  assert.deepEqual(f.events.map(x=>x.phase),['javascript_managed_done_prepared','javascript_managed_done_returned']);
  assert.ok(f.events.every(x=>x.deadline===task.deadline&&x.source_sha256===sha));
  assert.deepEqual(f.events[1].receipt,f.receipt);
});

test('Done in-place intent ACK mutation cannot alter the expected event or dispatch a gesture',async()=>{
  const f=dispatchFixture();
  await assert.rejects(dispatchManagedJavascriptDone({...f.options,record:async event=>{event.owner.node_id='foreign';return event;}}),/ACK differs/);
  assert.deepEqual(f.calls,['point']);assert.equal(task.owner.node_id,'node');
});

test('Done changed returned ACK retains a single possible gesture without accepting settlement',async()=>{
  const f=dispatchFixture();
  await assert.rejects(dispatchManagedJavascriptDone({...f.options,record:async event=>{
    if(event.phase==='javascript_managed_done_returned')event.receipt.output.done_gesture_returned=false;
    return event;
  }}),/ACK differs/);
  assert.deepEqual(f.calls,['point','gesture']);assert.equal(f.receipt.output.done_gesture_returned,true);
});

for(const change of [r=>r.status='AMBIGUOUS',r=>r.phase='observing',r=>r.effect_possible=false,
  r=>r.cleanup_complete=false,r=>r.error={},r=>r.action_revision='2',r=>r.output.wizard_commit_verified=true,
  r=>r.output.execution_started=false])test('Done refuses an incomplete returned receipt '+change.toString(),async()=>{
  const f=dispatchFixture();change(f.receipt);
  await assert.rejects(dispatchManagedJavascriptDone(f.options),/gesture unconfirmed/);
  assert.deepEqual(f.calls,['point','gesture']);assert.equal(f.events.length,1);
});

test('hung Done prepared ACK expires under the original deadline before any gesture',async()=>{
  const f=dispatchFixture(Date.now()+40);
  await assert.rejects(dispatchManagedJavascriptDone({...f.options,record:()=>new Promise(()=>{})}),/journal deadline/);
  assert.deepEqual(f.calls,['point']);
});
