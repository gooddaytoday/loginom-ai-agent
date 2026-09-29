import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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

function fixture({closeFails = false, pageTransientOnce = false, wrongType = false,
  doneFails = false, graphTransientOnce = false, graphOwnerChanged = false} = {}) {
  const calls = [], events = [];
  let pageReads = 0, graphReads = 0, codeNextSent = false;
  const driver = {
    openManagedJavascriptExistingWizard: async args => {calls.push('open'); assert.equal(args.node, node); return {task};},
    dispatchManagedJavascriptNext: async () => {calls.push('next'); return {status: 'SUCCEEDED', output: {next_gesture_returned: true}};},
    dispatchManagedJavascriptCodeNext: async () => {calls.push('code-next');codeNextSent = true;
      return {status: 'SUCCEEDED', output: {next_gesture_returned: true, transition_verified: false}};},
    dispatchManagedJavascriptDone: async () => {calls.push('done');if(doneFails)throw Error('lost Done reply');
      return {status: 'SUCCEEDED', output: {done_gesture_returned: true,wizard_commit_verified: false,execution_started: null}};},
    closeManagedJavascriptWizard: async () => {calls.push('close'); if (closeFails) throw Error('lost Close reply');
      return {verified: true, closed: true, node_id: 'node'};},
    makeJavascriptSchemaContextCode: () => 'schema',
    makeJavascriptManagedPageCode: () => 'page',
    makeJavascriptManagedSourceCode: () => 'source',
    makeJavascriptManagedSelectionReadCode: () => 'dispose',
    makeJavascriptExistingGraphTypeCode: () => 'type',
    replaceManagedJavascriptSource: async ({markUncertain,source_text}) => {calls.push('replace');
      if (closeFails) {markUncertain(true); throw Error('lost source write reply');}
      return {draft_exact: true, wizard_commit_verified: false,
        source_sha256:createHash('sha256').update(source_text).digest('hex')};},
  };
  const execute = async code => {
    calls.push(code);
    if (code === 'type') return {verified: true, node_id: 'node',
      icon_class: wrongType ? 'bg-vendor-icon-calculator' : 'bg-vendor-icon-javascript'};
    if (code === 'schema') return {verified: true, node_context: {...node, verified: true, surface: 'wizard'},
      generation: {checked: true}, grids: [{tid: 'grid', fields: [{record_id: 'volatile', Name: 'Value'}]}]};
    if (code === 'page') return {ready: true, node_guid: 'node',
      page:codeNextSent?{tid:'MF;TF-1;WizrdMCF;DoneWizard',index:3,indicator_count:4,visible_editors:0}
        : pageTransientOnce && pageReads++ === 0
          ? {tid: 'MF;TF-1;WizrdMCF;JavaScriptColumnsWizard', index: 0, visible_editors: 0}
          : {tid: 'MF;TF-1;WizrdMCF;JavaScriptCodeWizard', visible_editors: 1}};
    if (code === 'source') return {verified: true, source, node_context: {...node, verified: true, surface: 'wizard'}};
    if (code === 'dispose') return {disposed: true};
    throw Error('Unexpected browser code');
  };
  const record = async event => {events.push(structuredClone(event)); return event;};
  const sourceAdapter = async () => createJavascriptManagedSourceAdapter({page: {}, prepared, node, uiEpoch: 9,
    deadline, targetOrigin: 'http://logi-test-plan.bg.local', execute, record,
    receiptOptions: () => ({}), wait: async () => {}, channel: () => ({observe:async()=>{
      calls.push('graph');graphReads++;
      if(graphOwnerChanged || graphTransientOnce && graphReads === 1){
        const error=Error('Node procedure roots could not be observed: PREPARED_NODE_CONTEXT_CHANGED');
        error.nodeObservationRefusal={error:{code:'PREPARED_NODE_CONTEXT_CHANGED'},
          binding_reason:graphOwnerChanged?'node_guid':'surface_unavailable'};
        throw error;
      }
      return {prepared_node_context:{...node,verified:true,surface:'graph'},wizard:{status:'absent'}};
    }}), driver});
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
  assert.deepEqual(f.calls, ['type', 'open', 'schema', 'next', 'page', 'source', 'source', 'source', 'close', 'dispose']);
  assert.equal(f.events.filter(event => event.phase === 'source_delivery_verified').length, 1);
  assert.equal(f.events.filter(event => event.phase === 'source_discard_settled').length, 1);
});

test('managed source adapter refuses owner drift before any UI action', async () => {
  const f = fixture();
  const adapter = await f.sourceAdapter();
  await assert.rejects(() => adapter.open({owner: {...owner, ui_epoch: 10}, deadline}), /owner changed/);
  assert.deepEqual(f.calls, []);
});

test('existing non-JavaScript graph type refuses before Setting', async () => {
  const f = fixture({wrongType: true});
  const adapter = await f.sourceAdapter();
  await assert.rejects(() => adapter.open({owner, deadline}), /type unconfirmed/);
  assert.deepEqual(f.calls, ['type']);
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

test('managed source adapter admits only one owned replacement attempt', async () => {
  const f = fixture();
  const adapter = await f.sourceAdapter();
  const handle = await adapter.open({owner, deadline});
  assert.equal((await adapter.replace(handle, {owner, deadline,
    expected_source_sha256: '0'.repeat(64), source_text: 'const next=1;'})).draft_exact, true);
  await assert.rejects(() => adapter.replace(handle, {owner, deadline,
    expected_source_sha256: '0'.repeat(64), source_text: 'const next=2;'}), /already used/);
  assert.equal(f.calls.filter(call => call === 'replace').length, 1);
  await adapter.discard(handle, {owner, deadline});
});

test('managed source commit uses one Code Next and Done and settles the same graph',async()=>{
  const f=fixture(),adapter=await f.sourceAdapter(),handle=await adapter.open({owner,deadline});
  await adapter.replace(handle,{owner,deadline,expected_source_sha256:'0'.repeat(64),source_text:'// changed\n'});
  const result=await adapter.commit(handle,{owner,deadline});
  assert.equal(result.owned_done_settled,true);assert.equal(result.execution_started,null);
  assert.equal(adapter.uncertain,false);assert.equal(adapter.active,false);
  assert.deepEqual(f.calls.filter(call=>['code-next','done','graph','dispose'].includes(call)),
    ['code-next','done','graph','dispose']);
  await assert.rejects(()=>adapter.commit(handle,{owner,deadline}),/handle unavailable/);
});

test('Done graph observation retries only a transient unmounted surface',async()=>{
  const f=fixture({graphTransientOnce:true}),adapter=await f.sourceAdapter();
  const handle=await adapter.open({owner,deadline});
  await adapter.replace(handle,{owner,deadline,expected_source_sha256:'0'.repeat(64),source_text:'// changed\n'});
  assert.equal((await adapter.commit(handle,{owner,deadline})).graph_owner_verified,true);
  assert.equal(f.calls.filter(call=>call==='graph').length,2);
  assert.equal(f.calls.filter(call=>call==='done').length,1);
});

test('Done graph observation never retries a changed node owner',async()=>{
  const f=fixture({graphOwnerChanged:true}),adapter=await f.sourceAdapter();
  const handle=await adapter.open({owner,deadline});
  await adapter.replace(handle,{owner,deadline,expected_source_sha256:'0'.repeat(64),source_text:'// changed\n'});
  await assert.rejects(()=>adapter.commit(handle,{owner,deadline}),/PREPARED_NODE_CONTEXT_CHANGED/);
  assert.equal(f.calls.filter(call=>call==='graph').length,1);
  assert.equal(f.calls.filter(call=>call==='done').length,1);
  assert.equal(adapter.uncertain,true);
});

test('lost managed Done reply retains uncertainty and never retries the gesture',async()=>{
  const f=fixture({doneFails:true}),adapter=await f.sourceAdapter(),handle=await adapter.open({owner,deadline});
  await adapter.replace(handle,{owner,deadline,expected_source_sha256:'0'.repeat(64),source_text:'// changed\n'});
  await assert.rejects(()=>adapter.commit(handle,{owner,deadline}),/lost Done reply/);
  assert.equal(adapter.uncertain,true);assert.equal(adapter.active,true);
  await assert.rejects(()=>adapter.commit(handle,{owner,deadline}),/owner changed/);
  assert.equal(f.calls.filter(call=>call==='code-next').length,1);
  assert.equal(f.calls.filter(call=>call==='done').length,1);
});

test('lost managed source replacement retains the wizard lease', async () => {
  const f = fixture({closeFails: true});
  const adapter = await f.sourceAdapter();
  const handle = await adapter.open({owner, deadline});
  await assert.rejects(() => adapter.replace(handle, {owner, deadline,
    expected_source_sha256: '0'.repeat(64), source_text: 'const next=1;'}), /lost source write reply/);
  assert.equal(adapter.uncertain, true);
  await assert.rejects(() => adapter.discard(handle, {owner, deadline}), /owner changed/);
  assert.equal(f.calls.filter(call => call === 'replace').length, 1);
  assert.equal(f.calls.filter(call => call === 'close').length, 0);
});

test('semantic settings drop volatile records but retain field order', () => {
  assert.deepEqual(javascriptManagedSourceSettings({verified: true, generation: {checked: false},
    grids: [{tid: 'grid', fields: [{record_id: 'one', connected_record_id: 'two', connected_back_id: null,
      Name: 'First'}, {record_id: 'two', Name: 'Second'}]}]}),
  {generation: false, grids: [{tid: 'grid', fields: [{Name: 'First'}, {Name: 'Second'}]}]});
});
