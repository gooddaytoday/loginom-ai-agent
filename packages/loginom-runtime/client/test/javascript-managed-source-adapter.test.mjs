import test from 'node:test';
import assert from 'node:assert/strict';
import {createJavascriptManagedSourceAdapter, javascriptManagedSourceSettings} from '../lib/javascript-managed-source-adapter.mjs';
import {createJavascriptSourceAdmission} from '../lib/javascript-source-admission.mjs';
import {createRedactor} from '../lib/redact.mjs';

const deadline = Date.now() + 60000;
const prepared = {document_id: 'document', workflow_ref: {workflow_id: 'workflow', prefix: 'MF;TF-1', tab_tid: 'tab'}};
const node = {document_id: 'document', workflow_id: 'workflow', node_id: 'node'};
const owner = {...node, operation_id: 'read-source', ui_epoch: 9};
const source = 'import {InputTable} from "builtIn/Data";\nconst label = "Сумма 😀";';
const task = {operation_id: 'managed-js-1', owner: node, workflow_ref: prepared.workflow_ref,
  targetOrigin: 'http://logi-test-plan.bg.local', targetBuild: '7.4.2', deadline,
  prepared: {...prepared, node}, allowDeactivation: true};

function fixture({closeFails = false, pageTransientOnce = false} = {}) {
  const calls = [], events = [];
  let pageReads = 0;
  const driver = {
    openManagedJavascriptExistingWizard: async args => {calls.push('open'); assert.equal(args.node, node); return {task};},
    dispatchManagedJavascriptNext: async () => {calls.push('next'); return {status: 'SUCCEEDED', output: {next_gesture_returned: true}};},
    closeManagedJavascriptWizard: async () => {calls.push('close'); if (closeFails) throw Error('lost Close reply');
      return {verified: true, closed: true, node_id: 'node'};},
    makeJavascriptSchemaContextCode: () => 'schema',
    makeJavascriptManagedPageCode: () => 'page',
    makeJavascriptManagedSourceCode: () => 'source',
    makeJavascriptManagedSelectionReadCode: () => 'dispose',
  };
  const execute = async code => {
    calls.push(code);
    if (code === 'schema') return {verified: true, node_context: {...node, verified: true, surface: 'wizard'},
      generation: {checked: true}, grids: [{tid: 'grid', fields: [{record_id: 'volatile', Name: 'Value'}]}]};
    if (code === 'page') return {ready: true, node_guid: 'node',
      page: pageTransientOnce && pageReads++ === 0
        ? {tid: 'MF;TF-1;WizrdMCF;JavaScriptColumnsWizard', index: 0, visible_editors: 0}
        : {tid: 'MF;TF-1;WizrdMCF;JavaScriptCodeWizard', visible_editors: 1}};
    if (code === 'source') return {verified: true, source, node_context: {...node, verified: true, surface: 'wizard'}};
    if (code === 'dispose') return {disposed: true};
    throw Error('Unexpected browser code');
  };
  const record = async event => {events.push(structuredClone(event)); return event;};
  const sourceAdapter = async () => createJavascriptManagedSourceAdapter({page: {}, prepared, node, uiEpoch: 9,
    deadline, targetOrigin: 'http://logi-test-plan.bg.local', execute, record,
    receiptOptions: () => ({}), channel: () => ({}), driver});
  return {calls, events, sourceAdapter, record};
}

test('managed source adapter admits full source after owned open/schema/Next/three reads/Close', async () => {
  const f = fixture();
  const admission = createJavascriptSourceAdmission({kind: 'existing', owner, deadline,
    sourceAdapter: f.sourceAdapter, redactor: createRedactor(), record: f.record});
  const receipt = await admission.admit({});
  assert.equal(receipt.intent, 'preserve');
  assert.equal(receipt.previous_source.source_utf8_bytes, Buffer.byteLength(source, 'utf8'));
  assert.ok(!JSON.stringify(receipt).includes(source));
  assert.deepEqual(f.calls, ['open', 'schema', 'next', 'page', 'source', 'source', 'source', 'close', 'dispose']);
  assert.equal(f.events.filter(event => event.phase === 'source_delivery_verified').length, 1);
  assert.equal(f.events.filter(event => event.phase === 'source_discard_settled').length, 1);
});

test('managed source adapter refuses owner drift before any UI action', async () => {
  const f = fixture();
  const adapter = await f.sourceAdapter();
  await assert.rejects(() => adapter.open({owner: {...owner, ui_epoch: 10}, deadline}), /owner changed/);
  assert.deepEqual(f.calls, []);
});

test('managed Next waits for the owned Code page without repeating Next', async () => {
  const f = fixture({pageTransientOnce: true});
  const adapter = await f.sourceAdapter();
  const handle = await adapter.open({owner, deadline});
  await adapter.discard(handle, {owner, deadline});
  assert.equal(f.calls.filter(call => call === 'next').length, 1);
  assert.equal(f.calls.filter(call => call === 'page').length, 2);
});

test('lost managed Close reply is terminal and never dispatches a second Close', async () => {
  const f = fixture({closeFails: true});
  const adapter = await f.sourceAdapter();
  const handle = await adapter.open({owner, deadline});
  await assert.rejects(() => adapter.discard(handle, {owner, deadline}), /lost Close reply/);
  await assert.rejects(() => adapter.discard(handle, {owner, deadline}), /owner changed/);
  assert.equal(f.calls.filter(call => call === 'close').length, 1);
  assert.equal(adapter.uncertain, true);
});

test('semantic settings drop volatile records but retain field order', () => {
  assert.deepEqual(javascriptManagedSourceSettings({verified: true, generation: {checked: false},
    grids: [{tid: 'grid', fields: [{record_id: 'one', connected_record_id: 'two', connected_back_id: null,
      Name: 'First'}, {record_id: 'two', Name: 'Second'}]}]}),
  {generation: false, grids: [{tid: 'grid', fields: [{Name: 'First'}, {Name: 'Second'}]}]});
});
