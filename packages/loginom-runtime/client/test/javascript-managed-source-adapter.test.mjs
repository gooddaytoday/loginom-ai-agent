import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createJavascriptManagedSourceAdapter, javascriptManagedSourceSettings} from '../lib/javascript-managed-source-adapter.mjs';
import {createJavascriptSourceAdmission, javascriptSourceSettingsDigest} from '../lib/javascript-source-admission.mjs';
import {waitManagedJavascriptCodeSettlement} from '../lib/javascript-managed-code-settlement.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {openManagedJavascriptExistingWizard} from '../lib/javascript-managed-existing.mjs';
import {makeJavascriptManagedSelectionReadCode} from '../lib/javascript-managed-selection.mjs';

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

function openingFixture({visible=false, fault}={}) {
  const calls=[];
  let navigated=false;
  const tid='MF;TF-1;Graph;Собрать_Compact';
  const graph=()=>({prepared_node_context:{...node,verified:true,surface:'graph',tid,locked:false},
    wizard:{status:'absent'},ui:{elements:[{tid,graph_node:{part:'body'},
      interaction:{state:visible||navigated?'point_observed':'outside_viewport',point:visible||navigated?{x:500,y:250}:null}}]}});
  const channel={
    observe:async({ready})=>{
      calls.push('observe');const state=graph();
      if(navigated){
        if(['document_id','workflow_id','node_id'].includes(fault))state.prepared_node_context[fault]='foreign';
        if(fault==='tid')state.prepared_node_context.tid='MF;TF-1;Graph;Other';
        if(fault==='locked')state.prepared_node_context.locked=true;
        if(fault==='wizard')state.wizard.status='present';
        if(fault==='outside')state.ui.elements[0].interaction.state='outside_viewport';
        if(fault==='covered')state.ui.elements[0].interaction.state='covered';
        if(fault==='duplicate')state.ui.elements.push(structuredClone(state.ui.elements[0]));
        if(fault==='missing')state.ui.elements=[];
      }
      if(!ready(state))throw Error('revealed graph not ready');
      return state;
    },
    revealGraphNode:async()=>{
      calls.push('reveal');
      if(fault==='lost')throw Error('lost navigation reply');
      navigated=true;
    }
  };
  const args={prepared,node,deadline:Date.now()+60000,targetOrigin:'http://logi-test-plan.bg.local',channel,
    record:async e=>e,receiptOptions:()=>({}),execute:async code=>{
      calls.push('capture');assert.ok(code.includes('"mode":"capture"'));
      if(visible||navigated)throw Error('capture reached after fresh graph');
      return {ready:false,body_point:null};
    }};
  return {calls,args,channel};
}

test('managed existing source/context opening reveals an offscreen node before capturing its selection',async()=>{
  const f=openingFixture();
  await assert.rejects(openManagedJavascriptExistingWizard(f.args),/capture reached after fresh graph/);
  assert.deepEqual(f.calls,['observe','reveal','observe','capture']);
});

test('managed existing opening captures a visible node without viewport navigation',async()=>{
  const f=openingFixture({visible:true});
  await assert.rejects(openManagedJavascriptExistingWizard(f.args),/capture reached after fresh graph/);
  assert.deepEqual(f.calls,['observe','capture']);
});

for(const fault of ['document_id','workflow_id','node_id','tid','locked','wizard','outside','covered','duplicate','missing','lost'])
test('managed existing opening refuses before capture after viewport '+fault,async()=>{
  const f=openingFixture({fault});
  await assert.rejects(openManagedJavascriptExistingWizard(f.args),/graph owner unavailable|graph not ready|node not revealed|lost navigation reply/);
  assert.equal(f.calls.includes('capture'),false);
  assert.equal(f.calls.filter(c=>c==='reveal').length,1);
});

test('managed existing viewport navigation cannot renew the original opening deadline',async()=>{
  const f=openingFixture();f.args.deadline=Date.now()+30;
  f.channel.revealGraphNode=async()=>{
    f.calls.push('reveal');
    await new Promise(resolve=>setTimeout(resolve,Math.max(1,f.args.deadline-Date.now()+5)));
  };
  await assert.rejects(openManagedJavascriptExistingWizard(f.args),/deadline|node not revealed|graph not ready/);
  assert.equal(f.calls.includes('capture'),false);
});

test('reopening an unconfigured JavaScript node refuses settings drift before a schema gesture',async()=>{
  const page_tid='MF;TF-1;WizrdMCF;JavaScriptColumnsWizard';
  const schema={verified:true,inventory_complete:true,form:'JavaScriptColumnsWizard',page_tid,
    node_context:{...node,verified:true,surface:'wizard'},generation:{checked:false},
    grids:[{tid:page_tid+';grdTargetColumns;tbl',count:0,total:0,fields:[]}]};
  const expectedSettings=javascriptSourceSettingsDigest(javascriptManagedSourceSettings(schema));
  for(const changed of [{...schema,generation:{checked:true}},{...schema,inventory_complete:false},
    {...schema,grids:[...schema.grids,{tid:page_tid+';grdSourceColumns;tbl',count:0,total:0,fields:[]}]}]){
    const f=fixture({schemaOverride:changed});
    const adapter=await f.sourceAdapter(owner);
    await assert.rejects(()=>adapter.open({owner,deadline,schemaMode:'code',expectedSettings}),/unconfigured settings changed/);
    assert.deepEqual(f.calls,['type','open','page','schema','close','dispose']);
    assert.equal(adapter.uncertain,false);
  }
});

for(const [fault,field] of [['generation','settings.generation_checked'],['grids','mappings.grids'],
  ['grid_tid','mappings.grid_tid'],['grid_fields','mappings.grid_fields'],
  ['field_type','mappings.DataType_supported'],['reciprocity','mappings.reciprocity_verified'],['store','mappings.store_available']])
test('source boundary journals only the failed predicate: '+fault,async()=>{
  const schema={verified:true,node_context:{...node,verified:true,surface:'wizard'},generation:{checked:true},
    grids:[{tid:'PRIVATE_COLUMN;grdTargetColumns;tbl',fields:[]}]};
  if(fault==='generation')schema.generation=null;
  if(fault==='grids')schema.grids='PRIVATE_VALUE';
  if(fault==='grid_tid')schema.grids[0].tid={secret:'PRIVATE_VALUE'};
  if(fault==='grid_fields')schema.grids[0].fields='PRIVATE_VALUE';
  if(fault==='field_type'){
    schema.verified=false;schema.reason='native_field_contract_unconfirmed';
    schema.grids[0].fields=[{Name:'PRIVATE_COLUMN',DataType:999,Index:0,Required:true,Broken:false}];
  }
  if(fault==='reciprocity'){schema.verified=false;schema.reason='mapping_reciprocity_unconfirmed';}
  if(fault==='store'){schema.verified=false;schema.reason='JavaScript schema store is unavailable';}
  const f=fixture({schemaOverride:schema});
  const admission=createJavascriptSourceAdmission({kind:'existing',owner,deadline,sourceAdapter:f.sourceAdapter,
    record:f.record,redactor:createRedactor()});
  let refused;
  await assert.rejects(admission.admit({}),error=>{
    refused=error;return error.code==='boundary'&&error.message==='JavaScript source admission refused: boundary';
  });
  const detail=f.events.find(e=>e.phase==='javascript_source_boundary_refused')?.diagnostic;
  assert.ok(detail?.checks.some(c=>c.field===field&&c.expected!==c.observed));
  assert.equal(JSON.stringify(detail).includes('PRIVATE'),false);
  assert.equal(JSON.stringify(refused).includes('diagnostic'),false);
  assert.equal(refused.javascriptSourceBoundary,undefined);
  assert.deepEqual(f.calls,['type','open','page','schema','close','dispose'],
    'a known settings refusal discards only the owned opening without Next');
  assert.ok(f.events.some(event=>event.phase==='javascript_managed_admission_discarded'));
  assert.equal(admission.state,'retired');
});

function fixture({closeFails = false, pageTransientOnce = false, wrongType = false,
  schemaOverride,openingFault,fivePage=false,inputTransitionOnce=false,inputFields=[],schemaLost=false,
  settingsAckChanged = false,
  nativeRefusal=false,doneRefusal=false,captureFails=false,recoveryAckChanged=false,closeRefusalFails=false,
  generationFalse = false, generationFails = false, declaredFails = false, doneFails = false,
  graphTransientOnce = false, graphTransientDetail = false, graphEffectPossible = false, graphOwnerChanged = false} = {}) {
  const calls = [], events = [];
  let pageReads = 0, graphReads = 0, codeNextSent = false,doneSent=false,handleDraft,inputNextSent=false,columnsNextSent=false,inputTransitionRead=false;
  const driver = {
    openManagedJavascriptExistingWizard: async args => {calls.push('open'); assert.equal(args.node, node);
      if(openingFault){const error=Error('opening failed');if(openingFault==='capture')error.nodePhaseRefusal={phase:'open',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
      return {task:structuredClone(task)};},
    dispatchManagedJavascriptGeneration: async () => {calls.push('generation');
      if (generationFails) throw Error('lost generation reply');
      return {status: 'SUCCEEDED', output: {generation_readback_verified: true, schema: {verified: true,
        generation: {checked: true}, grids: [{tid: 'grid', fields: [{record_id: 'volatile', Name: 'Value'}]}]}}};},
    dispatchManagedJavascriptDeclared: async ({columns}) => {
      calls.push('declared');if(declaredFails)throw Error('lost declared Apply reply');
      return {verified:true,generation:false,columns:structuredClone(columns),schema:{verified:true,
        generation:{checked:false},grids:[{tid:'grid',fields:[{record_id:'volatile',Name:columns[0].name}]}]}};
    },
    dispatchManagedJavascriptNext: async ({input=false}) => {calls.push(input?'input-next':'next');
      if(input)inputNextSent=true;else columnsNextSent=true;
      return {status: 'SUCCEEDED', output: {next_gesture_returned: true}};},
    dispatchManagedJavascriptCodeNext: async () => {calls.push('code-next');codeNextSent = true;
      return {status: 'SUCCEEDED', output: {next_gesture_returned: true, transition_verified: false}};},
    dispatchManagedJavascriptDone: async () => {calls.push('done');doneSent=true;if(doneFails)throw Error('lost Done reply');
      return {status: 'SUCCEEDED', output: {done_gesture_returned: true,wizard_commit_verified: false,execution_started: null}};},
    closeManagedJavascriptWizard: async ({task}) => {calls.push('close'); if (closeFails||closeRefusalFails) throw Error('lost Close reply');
      if(task.error_stage==='admission')assert.ok(task.admission_page.tid.endsWith(';JavaScriptColumnsWizard')
        ||task.admission_page.tid.endsWith(';TuneDataSourceInputPortWizard'));
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
    makeJavascriptManagedSelectionReadCode: task => {
      if(fivePage)makeJavascriptManagedSelectionReadCode(task);
      return 'dispose';},
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
    if(code==='schema'&&schemaLost)throw Error('lost schema reply');
    if(code==='schema'&&fivePage&&!inputNextSent)return {verified:true,node_context:{...node,verified:true,surface:'wizard'},
      generation:null,grids:['grdSourceColumns','grdTargetColumns'].map(grid=>({
        tid:'MF;TF-1;WizrdMCF;TuneDataSourceInputPortWizard;'+grid+';tbl',fields:inputFields}))};
    if (code === 'schema') return schemaOverride??{verified: true, node_context: {...node, verified: true, surface: 'wizard'},
      generation: {checked: !generationFalse}, grids: [{tid: 'grid', fields: [{record_id: 'volatile', Name: 'Value'}]}]};
    if(code==='stage'||code.includes('runManagedJavascriptStageRead'))return {owner:node,native_owner_verified:true,owner_verified:true,wizard_visible:true,
      pending:false,preview_visible:false,boundary_refusal:null,dialog_diagnostic:{visible_count:0,foreign_count:0,roots:[]},mask_diagnostic:{foreign_count:0},
      wizard_error:{visible:codeNextSent&&nativeRefusal||doneSent&&doneRefusal,exact_count:1,tooltip:'SyntaxError: Syntax error at code (:4:33)',
        tid:'MF;TF-1;WizrdMCF;btnError',tooltip_truncated:false},page_tid:codeNextSent&&!nativeRefusal?'MF;TF-1;WizrdMCF;DoneWizard':'MF;TF-1;WizrdMCF;JavaScriptCodeWizard'};
    if(code==='page'&&fivePage&&inputTransitionOnce&&inputNextSent&&!columnsNextSent&&!inputTransitionRead){
      inputTransitionRead=true;throw Error('Managed JavaScript page not ready');}
    if(code==='page'&&fivePage)return {ready:true,node_guid:'node',page:{
      tid:'MF;TF-1;WizrdMCF;'+(!inputNextSent?'TuneDataSourceInputPortWizard':!columnsNextSent?'JavaScriptColumnsWizard':codeNextSent?'DoneWizard':'JavaScriptCodeWizard'),
      index:!inputNextSent?0:!columnsNextSent?1:codeNextSent?4:2,indicator_count:5,
      visible_editors:columnsNextSent&&!codeNextSent?1:0}};
    if(code==='page'&&!columnsNextSent)return {ready:true,node_guid:'node',
      page:{tid:'MF;TF-1;WizrdMCF;JavaScriptColumnsWizard',index:0,indicator_count:4,visible_editors:0}};
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

test('unconnected input admission refuses nonempty input settings after owned discard',async()=>{
  const f=fixture({fivePage:true,inputFields:[{Name:'Retained'}]});
  const adapter=await f.sourceAdapter();
  await assert.rejects(adapter.open({owner,deadline}),/input settings are not complete and empty/);
  assert.deepEqual(f.calls,['type','open','page','schema','close','dispose']);
  assert.equal(adapter.uncertain,false);
  assert.equal(adapter.active,false);
});

for(const fault of ['schemaLost','closeRefusalFails'])
test('admission retains uncertainty after '+fault,async()=>{
  const f=fixture({[fault]:true,schemaOverride:{verified:false,node_context:{...node,verified:true,surface:'wizard'}}});
  const adapter=await f.sourceAdapter();
  await assert.rejects(adapter.open({owner,deadline}));
  assert.equal(adapter.uncertain,true);
  assert.equal(f.calls.includes('dispose'),false);
  assert.equal(f.calls.filter(call=>call==='close').length,fault==='schemaLost'?0:1);
});

test('admission never closes a foreign schema owner',async()=>{
  const f=fixture({schemaOverride:{verified:false,node_context:{...node,node_id:'foreign',verified:true,surface:'wizard'}}});
  const adapter=await f.sourceAdapter();
  await assert.rejects(adapter.open({owner,deadline}),/schema owner changed/);
  assert.equal(adapter.uncertain,true);
  assert.equal(f.calls.includes('close'),false);
});

test('managed source adapter admits full source after owned open/schema/Next/three reads/Close', async () => {
  const f = fixture();
  const admission = createJavascriptSourceAdmission({kind: 'existing', owner, deadline,
    sourceAdapter: f.sourceAdapter, redactor: createRedactor(), record: f.record});
  const receipt = await admission.admit({});
  assert.equal(receipt.intent, 'preserve');
  assert.equal(receipt.previous_source.source_utf8_bytes, Buffer.byteLength(source, 'utf8'));
  assert.ok(!JSON.stringify(receipt).includes(source));
  assert.deepEqual(f.calls, ['type', 'open', 'page', 'schema', 'next', 'page', 'source', 'source', 'source', 'close', 'dispose']);
  assert.equal(f.events.filter(event => event.phase === 'source_delivery_verified').length, 1);
  assert.equal(f.events.filter(event => event.phase === 'source_discard_settled').length, 1);
});

test('five-page source read discards its owned draft and disposes the original selection lease',async()=>{
 const f=fixture({fivePage:true,inputTransitionOnce:true});
 const admission=createJavascriptSourceAdmission({kind:'existing',owner,deadline,
  sourceAdapter:f.sourceAdapter,redactor:createRedactor(),record:f.record});
 const receipt=await admission.admit({});
 assert.equal(receipt.intent,'preserve');
 assert.equal(f.calls.filter(c=>c==='input-next').length,1);
 assert.equal(f.calls.filter(c=>c==='next').length,1);
 assert.equal(f.calls.filter(c=>c==='dispose').length,1);
 assert.equal(f.calls.includes('code-next'),false);
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
  assert.equal(f.calls.filter(call => call === 'page').length, 3);
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

for(const openingFault of ['capture','unknown'])test('D17 source adapter preserves opening certainty: '+openingFault,async()=>{
 const f=fixture({openingFault}),adapter=await f.sourceAdapter();
 await assert.rejects(adapter.open({owner,deadline}));
 assert.equal(adapter.active,false);assert.equal(adapter.uncertain,openingFault==='unknown');
 assert.deepEqual(f.calls,['type','open']);
});

test('D17 only the read-only selection capture can report an opening with no effect',async()=>{
 const {openManagedJavascriptExistingWizard}=await import('../lib/javascript-managed-existing.mjs');
 for(const failCapture of [true,false]){
  let reads=0;const events=[];
  await assert.rejects(openManagedJavascriptExistingWizard({prepared,node,deadline,targetOrigin:'http://test',
   channel:{observe:async()=>({prepared_node_context:{...node,verified:true,surface:'graph',tid:'MF;TF-1;Graph;JS'},wizard:{status:'absent'}})},
   execute:async()=>{if(++reads===1&&!failCapture)return {ready:true,node_tid:'MF;TF-1;Graph;JS',dom_replacements:0,setting_point:{x:10,y:20}};throw Error('lost reply');},
   record:async e=>{events.push(e);return e;},receiptOptions:()=>({})}),error=>{
    assert.equal(error.nodePhaseRefusal?.cleanup_complete,failCapture?true:undefined);
    assert.equal(error.nodePhaseRefusal?.effect_possible,failCapture?false:undefined);return true;
   });
  assert.equal(events.length,failCapture?0:1);assert.equal(reads,failCapture?1:2);
 }
});

// bh-v11: after a failed JS execution the captured selection can be blocked.
// The body gesture is refused before its journal or click; only the read-only
// lease is held, so a disposed lease reports an opening with no effect.
for(const disposeFails of [false,true])test('unusable selection snapshot releases its lease before any body gesture'+(disposeFails?' unless dispose fails':''),async()=>{
 const modes=[],events=[];
 await assert.rejects(openManagedJavascriptExistingWizard({prepared,node,deadline,targetOrigin:'http://test',
  channel:{observe:async()=>({prepared_node_context:{...node,verified:true,surface:'graph',tid:'MF;TF-1;Graph;JS'},wizard:{status:'absent'}})},
  execute:async code=>{const mode=code.match(/"mode":"(\w+)"/)?.[1];modes.push(mode);
   if(mode==='capture')return {ready:false,blocked:true,node_tid:'MF;TF-1;Graph;JS',dom_replacements:0};
   if(mode==='dispose'){if(disposeFails)throw Error('lost reply');return {disposed:true};}
   throw Error('unexpected browser call '+mode);},
  record:async e=>{events.push(e);return e;},receiptOptions:()=>({})}),error=>{
   if(disposeFails){assert.equal(error.message,'lost reply');assert.equal(error.nodePhaseRefusal,undefined);return true;}
   assert.match(error.message,/body gesture/);
   assert.deepEqual(error.nodePhaseRefusal,{phase:'open',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});return true;
  });
 assert.deepEqual(modes,['capture','dispose']);assert.equal(events.length,0);
});

test('bh-v11 source read refused before the body gesture leaves the read registry settled',async()=>{
 const {createJavascriptSourceReadRegistry}=await import('../lib/javascript-source-read-registry.mjs');
 const {createJavascriptSourceReadSession}=await import('../lib/javascript-source-read-session.mjs');
 const request={kind:'source',operation_id:'read-source',document_id:'document',
  workflow_ref:prepared.workflow_ref,node};
 const modes=[];
 const execute=async code=>{const mode=code.match(/"mode":"(\w+)"/)?.[1];modes.push(mode??'type');
  if(mode==='capture')return {ready:false,blocked:true,node_tid:'MF;TF-1;Graph;JS',dom_replacements:0};
  if(mode==='dispose')return {disposed:true};
  if(!mode)return {verified:true,node_id:'node',icon_class:'bg-vendor-icon-javascript'};
  throw Error('unexpected browser call '+mode);};
 const registry=createJavascriptSourceReadRegistry({openSession:async req=>{
  const sessionDeadline=Date.now()+300000;
  const adapter=createJavascriptManagedSourceAdapter({page:{},prepared,node,uiEpoch:9,deadline:sessionDeadline,
   targetOrigin:'http://test',execute,record:async e=>e,receiptOptions:()=>({}),
   channel:()=>({observe:async()=>({prepared_node_context:{...node,verified:true,surface:'graph',tid:'MF;TF-1;Graph;JS'},wizard:{status:'absent'}})})});
  return createJavascriptSourceReadSession({request:req,uiEpoch:9,deadline:sessionDeadline,adapter,
   redactor:createRedactor(),record:async e=>e});
 }});
 await assert.rejects(registry.read(request),/body gesture/);
 assert.equal(registry.busy,false);assert.equal(registry.unsettled,false);
 assert.deepEqual(modes,['type','capture','dispose']);
});

// LAB-1998 A1: a blocker appears between capture and the body pre-click check.
// The settled body receipt reports NOT_APPLIED without a click, so the read-only
// lease is disposed and the opening has no effect. A lost dispose reply or a
// returned click keeps the opening closed.
const graphState={prepared_node_context:{...node,verified:true,surface:'graph',tid:'MF;TF-1;Graph;JS'},wizard:{status:'absent'}};
function bodyRefusalExecute({modes,bodyStatus='NOT_APPLIED',bodyCode='SELECTION_SNAPSHOT_CHANGED',disposeFails=false}){
 return async code=>{
  if(code.includes('runManagedJavascriptSelectionBody')){
   modes.push('body');const gesture_id=code.match(/"gesture_id":"([^"]+)"/)[1];
   return bodyStatus==='NOT_APPLIED'
    ?{status:'NOT_APPLIED',phase:'preflight',effect_possible:false,cleanup_complete:true,action_key:'javascript.selection.body',
     action_revision:'1',operation_id:gesture_id,output:{},error:{code:bodyCode,message:'Selection refused'},trace:[]}
    :{status:'SUCCEEDED',phase:'gesture_returned',effect_possible:true,cleanup_complete:true,action_key:'javascript.selection.body',
     action_revision:'1',operation_id:gesture_id,output:{body_gesture_returned:true},error:null,trace:[]};
  }
  const mode=code.match(/"mode":"(\w+)"/)?.[1];modes.push(mode??'type');
  if(!mode)return {verified:true,node_id:'node',icon_class:'bg-vendor-icon-javascript'};
  if(mode==='capture')return {ready:false,node_selected:false,body_point:{x:10,y:20},node_tid:'MF;TF-1;Graph;JS',dom_replacements:0};
  if(mode==='inspect')return {ready:false,blocked:true,node_tid:'MF;TF-1;Graph;JS',dom_replacements:0};
  if(mode==='dispose'){if(disposeFails)throw Error('lost reply');return {disposed:true};}
  throw Error('unexpected browser call '+mode);
 };
}
for(const [name,variant] of Object.entries({refused:{},disposeFails:{disposeFails:true},clicked:{bodyStatus:'SUCCEEDED'},
 leaseRefused:{bodyCode:'SELECTION_LEASE_UNAVAILABLE'}}))
test('A1 body gesture refused before its click releases the lease: '+name,async()=>{
 const modes=[],events=[];
 await assert.rejects(openManagedJavascriptExistingWizard({prepared,node,deadline,targetOrigin:'http://test',
  channel:{observe:async()=>graphState},execute:bodyRefusalExecute({modes,...variant}),
  record:async e=>{events.push(e.phase);return e;},receiptOptions:()=>({})}),error=>{
   if(name==='refused'){assert.match(error.message,/body gesture refused before its click: SELECTION_SNAPSHOT_CHANGED/);
    assert.deepEqual(error.nodePhaseRefusal,{phase:'open',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});}
   else assert.equal(error.nodePhaseRefusal,undefined);
   if(name==='disposeFails')assert.equal(error.message,'lost reply');
   if(name==='clicked')assert.match(error.message,/blocked after gesture/);
   if(name==='leaseRefused')assert.match(error.message,/selection unconfirmed/);
   return true;
  });
 assert.deepEqual(modes,name==='clicked'?['capture','body','inspect']:name==='leaseRefused'?['capture','body']:['capture','body','dispose']);
 assert.deepEqual(events,['javascript_managed_body_prepared','javascript_managed_body_returned']);
});

const sourceRegistry=async(execute,observe)=>{
 const {createJavascriptSourceReadRegistry}=await import('../lib/javascript-source-read-registry.mjs');
 const {createJavascriptSourceReadSession}=await import('../lib/javascript-source-read-session.mjs');
 return createJavascriptSourceReadRegistry({openSession:async req=>{
  const sessionDeadline=Date.now()+300000;
  const adapter=createJavascriptManagedSourceAdapter({page:{},prepared,node,uiEpoch:9,deadline:sessionDeadline,
   targetOrigin:'http://test',execute,record:async e=>e,receiptOptions:()=>({}),channel:()=>({observe})});
  return createJavascriptSourceReadSession({request:req,uiEpoch:9,deadline:sessionDeadline,adapter,
   redactor:createRedactor(),record:async e=>e});
 }});
};
const readRequest={kind:'source',operation_id:'read-source',document_id:'document',workflow_ref:prepared.workflow_ref,node};

for(const name of ['refused','disposeFails'])test('A1 source read with a body refused before its click settles the read registry: '+name,async()=>{
 const modes=[],registry=await sourceRegistry(bodyRefusalExecute({modes,disposeFails:name==='disposeFails'}),async()=>graphState);
 await assert.rejects(registry.read(readRequest),name==='refused'?/refused before its click/:/lost reply/);
 assert.equal(registry.busy,false);assert.equal(registry.unsettled,name==='disposeFails');
 assert.deepEqual(modes,['type','capture','body','dispose']);
});

// LAB-1998 A2: observing or verifying the owner before capture only reads;
// no lease, journal or gesture exists yet. Viewport navigation is a gesture
// and is not covered.
for(const fault of ['observe','owner','tid','wizard'])test('A2 owner check before capture is an opening with no effect: '+fault,async()=>{
 const modes=[];
 const observe=async()=>{
  if(fault==='observe')throw Error('observe transport lost');
  const state=structuredClone(graphState);
  if(fault==='owner')state.prepared_node_context.node_id='foreign';
  if(fault==='tid')state.prepared_node_context.tid='MF;TF-2;Graph;JS';
  if(fault==='wizard')state.wizard.status='present';
  return state;
 };
 await assert.rejects(openManagedJavascriptExistingWizard({prepared,node,deadline,targetOrigin:'http://test',channel:{observe},
  execute:async()=>assert.fail('no browser call'),record:async()=>assert.fail('no journal'),receiptOptions:()=>({})}),error=>{
   assert.deepEqual(error.nodePhaseRefusal,{phase:'open',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});return true;});
 const registry=await sourceRegistry(bodyRefusalExecute({modes}),observe);
 await assert.rejects(registry.read(readRequest),/observe transport lost|graph owner unavailable/);
 assert.equal(registry.busy,false);assert.equal(registry.unsettled,false);assert.deepEqual(modes,['type']);
});

for(const fault of ['lost','node_id','covered'])test('A2 a failure after viewport navigation keeps the opening uncertain: '+fault,async()=>{
 const f=openingFixture({fault});
 await assert.rejects(openManagedJavascriptExistingWizard(f.args),error=>{assert.equal(error.nodePhaseRefusal,undefined);return true;});
 assert.ok(f.calls.includes('reveal'));
});

// Review of #1318: viewport navigation is a gesture. After a successful reveal,
// a later capture, body-code or pre-click body refusal never reports an
// opening with no effect; the same refusals of a visible node still do.
for(const offscreen of [true,false])for(const fault of ['capture','bodyCode','bodyRefused'])
test('reveal before a '+fault+' refusal '+(offscreen?'keeps the opening uncertain':'of a visible node has no effect'),async()=>{
 const calls=[],tid='MF;TF-1;Graph;JS';let navigated=!offscreen;
 const channel={
  observe:async({ready})=>{calls.push('observe');
   const state={prepared_node_context:{...node,verified:true,surface:'graph',tid,locked:false},wizard:{status:'absent'},
    ui:{elements:[{tid,graph_node:{part:'body'},interaction:navigated?{state:'point_observed',point:{x:500,y:250}}:{state:'outside_viewport',point:null}}]}};
   assert.ok(ready(state));return state;},
  revealGraphNode:async()=>{calls.push('reveal');navigated=true;}};
 const modes=[],refused=bodyRefusalExecute({modes});
 const execute=async code=>{
  const mode=code.match(/"mode":"(\w+)"/)?.[1];
  if(mode==='capture'&&fault==='capture'){modes.push('capture');throw Error('lost capture reply');}
  if(mode==='capture'&&fault==='bodyCode'){modes.push('capture');return {ready:false,blocked:true,node_tid:tid,dom_replacements:0};}
  return refused(code);
 };
 await assert.rejects(openManagedJavascriptExistingWizard({prepared,node,deadline,targetOrigin:'http://test',channel,execute,
  record:async e=>e,receiptOptions:()=>({})}),error=>{
   if(offscreen)assert.equal(error.nodePhaseRefusal,undefined);
   else assert.deepEqual(error.nodePhaseRefusal,{phase:'open',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});
   return true;});
 assert.deepEqual(calls,offscreen?['observe','reveal','observe']:['observe']);
 assert.deepEqual(modes,{capture:['capture'],bodyCode:['capture','dispose'],bodyRefused:['capture','body','dispose']}[fault]);
});
