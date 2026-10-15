import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createJavascriptManagedSourceAdapter, javascriptManagedSourceSettings} from '../lib/javascript-managed-source-adapter.mjs';
import {createJavascriptSourceAdmission, javascriptSourceSettingsDigest} from '../lib/javascript-source-admission.mjs';
import {waitManagedJavascriptCodeSettlement} from '../lib/javascript-managed-code-settlement.mjs';
import {createRedactor} from '../lib/redact.mjs';

const deadline = Date.now() + 60000;
const prepared = {document_id: 'document', workflow_ref: {workflow_id: 'workflow', prefix: 'MF;TF-1',
  tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'nav',label:'Scenario'}]}};
const node = {document_id: 'document', workflow_id: 'workflow', node_id: 'node'};
const owner = {...node, operation_id: 'read-source', ui_epoch: 9};
const source = 'import {InputTable} from "builtIn/Data";\nconst label = "Сумма 😀";';
const task = {operation_id: 'managed-js-1', owner: node,
  workflow_ref:{prefix:prepared.workflow_ref.prefix,tab_tid:prepared.workflow_ref.tab_tid},
  targetOrigin: 'http://logi-test-plan.bg.local', targetBuild: '7.4.2', deadline,
  prepared: {...prepared, node}, allowDeactivation: true};

function fixture({closeFails = false, pageTransientOnce = false, wrongType = false,
  settingsAckChanged = false,
  nativeRefusal=false,doneRefusal=false,captureFails=false,recoveryAckChanged=false,closeRefusalFails=false,
  generationFalse = false, generationFails = false, declaredFails = false, doneFails = false,
  graphTransientOnce = false, graphTransientDetail = false, graphEffectPossible = false, graphOwnerChanged = false} = {}) {
  const calls = [], events = [];
  let pageReads = 0, graphReads = 0, codeNextSent = false,doneSent=false,handleDraft;
  const driver = {
    openManagedJavascriptExistingWizard: async args => {calls.push('open'); assert.equal(args.node, node); return {task};},
    dispatchManagedJavascriptGeneration: async () => {calls.push('generation');
      if (generationFails) throw Error('lost generation reply');
      return {status: 'SUCCEEDED', output: {generation_readback_verified: true, schema: {verified: true,
        generation: {checked: true}, grids: [{tid: 'grid', fields: [{record_id: 'volatile', Name: 'Value'}]}]}}};},
    dispatchManagedJavascriptDeclared: async ({columns}) => {
      calls.push('declared');if(declaredFails)throw Error('lost declared Apply reply');
      return {verified:true,generation:false,columns:structuredClone(columns),schema:{verified:true,
        generation:{checked:false},grids:[{tid:'grid',fields:[{record_id:'volatile',Name:columns[0].name}]}]}};
    },
    dispatchManagedJavascriptNext: async () => {calls.push('next'); return {status: 'SUCCEEDED', output: {next_gesture_returned: true}};},
    dispatchManagedJavascriptCodeNext: async () => {calls.push('code-next');codeNextSent = true;
      return {status: 'SUCCEEDED', output: {next_gesture_returned: true, transition_verified: false}};},
    dispatchManagedJavascriptDone: async () => {calls.push('done');doneSent=true;if(doneFails)throw Error('lost Done reply');
      return {status: 'SUCCEEDED', output: {done_gesture_returned: true,wizard_commit_verified: false,execution_started: null}};},
    closeManagedJavascriptWizard: async ({task}) => {calls.push('close'); if (closeFails||closeRefusalFails) throw Error('lost Close reply');
      return {verified: true, closed: true, node_id: 'node',draft_discarded:task.error_stage==='done'?null:true,settings_applied:task.error_stage==='done'?null:false,execution_started:task.error_stage==='done'?null:false};},
    makeJavascriptSchemaContextCode: () => 'schema',
    makeJavascriptManagedPageCode: () => 'page',
    makeJavascriptManagedStageCode: () => 'stage',
    waitManagedJavascriptCodeSettlement,
    waitManagedJavascriptDoneSettlement:async()=>{calls.push('done-settlement');return doneRefusal
      ?{...await execute('stage'),wizard_error_refusal:true}: {owned_done_settled:true,graph_owner_verified:true};},
    captureManagedJavascriptWizardError:async({error_stage})=>{calls.push('capture-error');if(captureFails)throw Error('lost error dialog reply');
      return {error_stage,owner:node,source_sha256:handleDraft,dialog_closed:true,native_owner_verified:true};},
    makeJavascriptManagedSourceCode: () => 'source',
    makeJavascriptManagedSelectionReadCode: () => 'dispose',
    makeJavascriptExistingGraphTypeCode: () => 'type',
    replaceManagedJavascriptSource: async ({markUncertain,source_text}) => {calls.push('replace');
      if (closeFails) {markUncertain(true); throw Error('lost source write reply');}
      handleDraft=createHash('sha256').update(source_text).digest('hex');
      return {draft_exact: true, wizard_commit_verified: false,source_sha256:handleDraft};},
  };
  const execute = async code => {
    calls.push(code);
    if (code === 'type') return {verified: true, node_id: 'node',
      icon_class: wrongType ? 'bg-vendor-icon-calculator' : 'bg-vendor-icon-javascript'};
    if (code === 'schema') return {verified: true, node_context: {...node, verified: true, surface: 'wizard'},
      generation: {checked: !generationFalse}, grids: [{tid: 'grid', fields: [{record_id: 'volatile', Name: 'Value'}]}]};
    if(code==='stage'||code.includes('runManagedJavascriptStageRead'))return {owner:node,native_owner_verified:true,owner_verified:true,wizard_visible:true,
      pending:false,preview_visible:false,boundary_refusal:null,dialog_diagnostic:{visible_count:0,foreign_count:0,roots:[]},mask_diagnostic:{foreign_count:0},
      wizard_error:{visible:codeNextSent&&nativeRefusal||doneSent&&doneRefusal,exact_count:1,tooltip:'SyntaxError: Syntax error at code (:4:33)',
        tid:'MF;TF-1;WizrdMCF;btnError',tooltip_truncated:false},page_tid:codeNextSent&&!nativeRefusal?'MF;TF-1;WizrdMCF;DoneWizard':'MF;TF-1;WizrdMCF;JavaScriptCodeWizard'};
    if (code === 'page') return {ready: true, node_guid: 'node',
      page:codeNextSent?{tid:'MF;TF-1;WizrdMCF;DoneWizard',index:3,indicator_count:4,visible_editors:0}
        : pageTransientOnce && pageReads++ === 0
          ? {tid: 'MF;TF-1;WizrdMCF;JavaScriptColumnsWizard', index: 0, visible_editors: 0}
          : {tid: 'MF;TF-1;WizrdMCF;JavaScriptCodeWizard', visible_editors: 1}};
    if (code === 'source') return {verified: true, source, node_context: {...node, verified: true, surface: 'wizard'}};
    if (code === 'dispose') return {disposed: true};
    throw Error('Unexpected browser code');
  };
  const record = async event => {
    events.push(structuredClone(event));
    if(recoveryAckChanged&&['javascript_managed_rejected_draft_discarded','javascript_managed_rejected_done_closed'].includes(event.phase))return {...event,source_sha256:'foreign'};
    return settingsAckChanged && event.phase === 'javascript_managed_source_settings_observed'
      ? {...event, settings_sha256: '0'.repeat(64)} : event;
  };
  const sourceAdapter = async () => createJavascriptManagedSourceAdapter({page: {}, prepared, node, uiEpoch: 9,
    deadline, targetOrigin: 'http://logi-test-plan.bg.local', execute, record,
    receiptOptions: () => ({}), wait: async () => {}, channel: () => ({observe:async()=>{
      calls.push('graph');graphReads++;
      if(graphOwnerChanged || graphTransientOnce && graphReads === 1){
        const error=Error('Node procedure roots could not be observed: PREPARED_NODE_CONTEXT_CHANGED');
        error.nodeObservationRefusal={status:'NOT_APPLIED',action_key:'workspace.observe',phase:'observing',
          effect_possible:graphEffectPossible,cleanup_complete:true,error:{code:'PREPARED_NODE_CONTEXT_CHANGED',
            ...(graphTransientDetail?{message:'The prepared package, workflow or node changed: '+(graphOwnerChanged?'node_guid':'surface_unavailable')}:{})},
          ...(graphTransientDetail?{}:{binding_reason:graphOwnerChanged?'node_guid':'surface_unavailable'})};
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

test('private settings observation records owned bounded semantics without source', async () => {
  const f = fixture(), adapter = await f.sourceAdapter();
  const handle = await adapter.open({owner, deadline});
  const events = f.events.filter(event => event.phase === 'javascript_managed_source_settings_observed');
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].owner, owner);
  assert.deepEqual(events[0].settings, handle.settings);
  assert.equal(events[0].schema_mode, 'preserve');
  assert.equal(events[0].effect_possible, false);
  assert.match(events[0].settings_sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(events[0]).includes(source), false);
  assert.equal(JSON.stringify(events[0]).includes('volatile'), false);
  await adapter.discard(handle, {owner, deadline});
});

test('changed settings ACK stops before Next and forbids reopening unknown wizard', async () => {
  const f = fixture({settingsAckChanged: true}), adapter = await f.sourceAdapter();
  await assert.rejects(() => adapter.open({owner, deadline}), /settings journal ACK differs/);
  assert.equal(f.calls.includes('next'), false);
  assert.equal(adapter.uncertain, true);
  await assert.rejects(() => adapter.open({owner, deadline}), /owner changed/);
  assert.equal(f.calls.filter(call => call === 'open').length, 1);
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

test('a lost observation after native Done settlement remains uncertain',async()=>{
  const f=fixture({graphTransientOnce:true}),adapter=await f.sourceAdapter();
  const handle=await adapter.open({owner,deadline});
  await adapter.replace(handle,{owner,deadline,expected_source_sha256:'0'.repeat(64),source_text:'// changed\n'});
  await assert.rejects(()=>adapter.commit(handle,{owner,deadline}),/PREPARED_NODE_CONTEXT_CHANGED/);
  assert.equal(adapter.uncertain,true);
  assert.equal(f.calls.filter(call=>call==='graph').length,1);
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

test('a changed detail-read surface after native settlement keeps Done one-shot and uncertain',async()=>{
  const f=fixture({graphTransientOnce:true,graphTransientDetail:true}),adapter=await f.sourceAdapter();
  const handle=await adapter.open({owner,deadline});
  await adapter.replace(handle,{owner,deadline,expected_source_sha256:'0'.repeat(64),source_text:'// changed\n'});
  await assert.rejects(()=>adapter.commit(handle,{owner,deadline}),/PREPARED_NODE_CONTEXT_CHANGED/);
  assert.equal(adapter.uncertain,true);
  assert.equal(f.calls.filter(call=>call==='graph').length,1);
  assert.equal(f.calls.filter(call=>call==='done').length,1);
});

test('Done surface refusal with possible effect cannot authorize another observation',async()=>{
  const f=fixture({graphTransientOnce:true,graphTransientDetail:true,graphEffectPossible:true}),adapter=await f.sourceAdapter();
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

test('declared Done empty ConnectedRecord reference is canonical but semantic drift remains detectable', () => {
  const before = {verified:true,generation:{checked:false},grids:[{tid:'target',fields:[
    {record_id:'draft',Index:0,ID:0,Name:'RowID',DisplayName:'RowID',DataType:4,DataKind:1,
      DefaultUsageType:4,UsageType:0,Required:false,Broken:false},
    {record_id:'draft2',Index:1,ID:1,Name:'Status',DisplayName:'Status',DataType:5,DataKind:2,
      DefaultUsageType:0,UsageType:0,Required:false,Broken:false}]}]};
  const after = structuredClone(before);
  after.grids[0].fields.forEach((field,index)=>{field.record_id='committed'+index;field.ConnectedRecord=null;});
  const digest = schema=>javascriptSourceSettingsDigest(javascriptManagedSourceSettings(schema));
  assert.equal(digest(before),digest(after));
  assert.equal(Object.hasOwn(after.grids[0].fields[0],'ConnectedRecord'),true);
  for (const change of [s=>s.generation.checked=true,s=>s.grids[0].fields.reverse(),
    s=>s.grids[0].fields[0].Name='Different',s=>s.grids[0].fields[0].DisplayName='Changed label',
    s=>s.grids[0].fields[0].DataType=5,s=>s.grids[0].fields[0].DataKind=2,
    s=>s.grids[0].fields[0].DefaultUsageType=0,s=>s.grids[0].fields[0].UsageType=4,
    s=>s.grids[0].fields[0].Required=true,s=>s.grids[0].fields[0].ConnectedRecord='unexpected',
    s=>s.grids[0].fields[0].unknown_option=true]) {
    const changed=structuredClone(after);change(changed);
    assert.notEqual(digest(before),digest(changed));
  }
});

test('code open enables generation before Next; ordinary read preserves false mode', async () => {
  for (const schemaMode of ['preserve', 'code']) {
    const f = fixture({generationFalse: true}), adapter = await f.sourceAdapter();
    const handle = await adapter.open({owner, deadline, schemaMode});
    assert.equal(handle.settings.generation, schemaMode === 'code');
    assert.equal(f.calls.filter(call => call === 'generation').length, schemaMode === 'code' ? 1 : 0);
    if (schemaMode === 'code') assert.ok(f.calls.indexOf('generation') < f.calls.indexOf('next'));
    await adapter.discard(handle, {owner, deadline});
  }
});

test('lost generation reply blocks Next and a second opening', async () => {
  const f = fixture({generationFalse: true, generationFails: true}), adapter = await f.sourceAdapter();
  await assert.rejects(() => adapter.open({owner, deadline, schemaMode: 'code'}), /lost generation reply/);
  assert.equal(adapter.uncertain, true);
  assert.equal(f.calls.includes('next'), false);
  await assert.rejects(() => adapter.open({owner, deadline, schemaMode: 'code'}), /owner changed/);
  assert.equal(f.calls.filter(call => call === 'generation').length, 1);
});

test('owned declared columns precede Next and become preserved source settings',async()=>{
  const f=fixture({generationFalse:true}),adapter=await f.sourceAdapter();
  const columns=[{name:'Value',label:'Value',type:'integer',data_kind:'Непрерывный',usage:'Выходное'}];
  const handle=await adapter.open({owner,deadline,schemaMode:'declared',columns});
  assert.equal(handle.settings.generation,false);
  assert.deepEqual(handle.declaredColumns,columns);
  assert.ok(f.calls.indexOf('declared')<f.calls.indexOf('next'));
  assert.equal(f.calls.includes('generation'),false);
  await adapter.discard(handle,{owner,deadline});
});

test('unsupported declared columns fail before Setting; uncertain Apply cannot reopen',async()=>{
  const bad=fixture({generationFalse:true}),refused=await bad.sourceAdapter();
  await assert.rejects(refused.open({owner,deadline,schemaMode:'declared',columns:[
    {name:'Value',label:'Value',type:'variant',data_kind:'Непрерывный',usage:'Не задано'}]}),/unsupported/);
  assert.deepEqual(bad.calls,[]);
  const f=fixture({generationFalse:true,declaredFails:true}),adapter=await f.sourceAdapter();
  const columns=[{name:'Value',label:'Value',type:'integer',data_kind:'Непрерывный',usage:'Выходное'}];
  await assert.rejects(adapter.open({owner,deadline,schemaMode:'declared',columns}),/lost declared Apply reply/);
  assert.equal(f.calls.includes('next'),false);
  await assert.rejects(adapter.open({owner,deadline,schemaMode:'declared',columns}),/owner changed/);
  assert.equal(f.calls.filter(call=>call==='declared').length,1);
});

test('known native refusal closes only its changed draft once and exposes private recovery evidence',async()=>{
 const f=fixture({nativeRefusal:true}),adapter=await f.sourceAdapter(),handle=await adapter.open({owner,deadline});
 await adapter.replace(handle,{owner,deadline,expected_source_sha256:'0'.repeat(64),source_text:'const value=object?.field;'});
 await assert.rejects(adapter.commit(handle,{owner,deadline}),error=>{
  assert.equal(error.javascriptWizardRefusal.diagnostic.dialog_closed,true);
  assert.equal(error.javascriptWizardRefusal.closed.draft_discarded,true);return true;
 });
 assert.equal(adapter.active,false);assert.equal(adapter.uncertain,false);
 assert.deepEqual(f.calls.filter(call=>['code-next','capture-error','close','done','dispose'].includes(call)),['code-next','capture-error','close','dispose']);
 await assert.rejects(adapter.commit(handle,{owner,deadline}),/handle unavailable/);
 assert.equal(f.calls.filter(call=>call==='code-next').length,1);
});
for(const failure of ['captureFails','closeRefusalFails','recoveryAckChanged'])test('uncertain native refusal never releases its gate '+failure,async()=>{
 const f=fixture({nativeRefusal:true,[failure]:true}),adapter=await f.sourceAdapter(),handle=await adapter.open({owner,deadline});
 await adapter.replace(handle,{owner,deadline,expected_source_sha256:'0'.repeat(64),source_text:'const value=object?.field;'});
 await assert.rejects(adapter.commit(handle,{owner,deadline}),error=>{assert.equal(error.javascriptWizardRefusal,undefined);return true;});
 assert.equal(adapter.uncertain,true);assert.equal(adapter.active,true);
 await assert.rejects(adapter.discard(handle,{owner,deadline}),/owner changed/);
 assert.equal(f.calls.filter(call=>call==='code-next').length,1);assert.ok(!f.calls.includes('done'));
 if(failure==='captureFails')assert.ok(!f.calls.includes('close'));
 if(failure==='closeRefusalFails')assert.ok(!f.calls.includes('dispose'));
});

for(const failure of [null,'capture','close','ACK'])test('known Done refusal closes once without declaring rollback before fresh baseline proof '+failure,async()=>{
 const f=fixture({doneRefusal:true,captureFails:failure==='capture',closeRefusalFails:failure==='close',recoveryAckChanged:failure==='ACK'});
 const adapter=await f.sourceAdapter(),handle=await adapter.open({owner,deadline});
 await adapter.replace(handle,{owner,deadline,expected_source_sha256:'0'.repeat(64),source_text:'// Done refusal\n'});
 let error;try{await adapter.commit(handle,{owner,deadline});}catch(value){error=value;}
 assert.equal(f.calls.filter(x=>x==='done').length,1);assert.equal(f.calls.filter(x=>x==='capture-error').length,1);
 if(failure){assert.equal(adapter.uncertain,true);assert.equal(error.javascriptWizardRefusal,undefined);return;}
 assert.equal(adapter.uncertain,false);assert.equal(adapter.active,false);
 assert.equal(error.javascriptWizardRefusal.diagnostic.error_stage,'done');
 assert.equal(error.javascriptWizardRefusal.closed.draft_discarded,null);
 assert.equal(error.javascriptWizardRefusal.closed.settings_applied,null);
 assert.equal(error.javascriptWizardRefusal.closed.execution_started,null);
 assert.equal(f.calls.filter(x=>x==='close').length,1);assert.equal(f.calls.includes('graph'),false);
});
