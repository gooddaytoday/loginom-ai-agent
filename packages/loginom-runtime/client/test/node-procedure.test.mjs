import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeProcedure } from '../lib/node-procedure.mjs';
import { validateTextImportRequest } from '../lib/text-import-procedure.mjs';

function fixture({ recordFailure, executeFailure, changedDocument, foreignReceipt, movingEpoch, dialogsAtRead, staleReads = 0, staleEffect = false, loadingSamples = 0, maxSteps = 8, signal, sharedOperation, now = () => 1, monotonicNow } = {}) {
  const events = [], records = []; let reads = 0;
  const operation = sharedOperation ?? { id: 'parent', action: { action_key: 'node.import.configure', revision: '1' },
    deadline: 10000, checkpoint: { workflow_ref: { prefix: 'MF;TF-1', tab_tid: 'tab' }, document_id: 'doc' } };
  const state = { origin: 'http://example.test', loginom_build: '7.4.2', workflow_ref: operation.checkpoint.workflow_ref,
    dom_epoch: { document: changedDocument ? 'foreign' : 'doc', revision: 1 }, scan: { complete: true }, wizard: staleReads ? {status:'observed',root_ref:'ui-root',root_tid:'Wizard'} : { status: 'absent' },
    ui: { masks: [], dialogs: [], truncated: { elements: false, masks: false, dialogs: false },
      elements: [{ ref: 'ui-button', allowed_actions: ['click'] }] } };
  const channel = createNodeProcedure({ operation, maxSteps, signal, now, monotonicNow, wait: async () => {},
    targetOrigin: 'http://example.test', targetBuild: '7.4.2',
    record: async entry => { events.push(entry.phase); if (recordFailure && entry.phase === recordFailure) throw new Error('disk failure'); records.push(entry); return structuredClone(entry); },
    wrapMutation: (code, options) => { events.push('wrapped'); return { code, options }; },
    execute: async code => {
      if (typeof code === 'string') { reads++;
        if(reads%2===0 && reads<=staleReads*2)return {status:'NOT_APPLIED',action_key:'workspace.observe',phase:'observing',effect_possible:staleEffect,cleanup_complete:true,error:{code:'UI_ROOT_STALE'}};
        const output = structuredClone(state);
        if(staleReads && reads%2===1){output.observation_kind='roots';output.ui.truncated.dialogs=true;output.ui.truncated.masks=true;}
        if (movingEpoch) output.dom_epoch.revision = reads; if (dialogsAtRead) output.ui.dialogs = dialogsAtRead(reads); if (reads <= loadingSamples) output.ui.masks = [{ kind: 'busy' }]; return { status: 'SUCCEEDED', output }; }
      events.push('mutated'); if (executeFailure) throw new Error('transport');
      return { status: 'SUCCEEDED', operation_id: foreignReceipt ? 'foreign' : code.options.id, action_key: 'ui.act', cleanup_complete: true, effect_possible: true, output: state };
    } });
  return { channel, operation, events, records, state };
}
test('a disappearing read root permits at most two rediscoveries without gestures',async()=>{
  for(const staleReads of [1,2,3]) {
    const f=fixture({staleReads});
    const read=()=>f.channel.observe({condition:'dialog closed',ready:()=>true});
    if(staleReads<3)await read();else await assert.rejects(read(),/observation is incomplete/);
    assert.equal(f.records.filter(r=>r.phase==='node_observation_root_refreshed').length,Math.min(2,staleReads));
    assert.ok(!f.events.includes('mutated'));
  }
  for(const config of [{staleReads:1,staleEffect:true},{staleReads:1,changedDocument:true}]) {
    const f=fixture(config);await assert.rejects(f.channel.observe({condition:'dialog closed',ready:()=>true}));
    assert.ok(!f.events.includes('node_observation_root_refreshed'));
  }
});
test('durable internal preparation precedes mutation; next action requires fresh observation', async () => {
  const f = fixture(); await f.channel.observe({ condition: 'button usable', ready: s => s.ui.elements.some(e => e.ref === 'ui-button') }); await f.channel.act({ verb: 'click', ref: 'ui-button' });
  assert.deepEqual(f.events.filter(x => x !== 'node_observation_sample'), ['node_observation_completed', 'node_step_prepared', 'wrapped', 'mutated', 'node_step_completed']);
  assert.equal(f.records.find(r => r.phase === 'node_step_prepared').internal_operation_id, 'parent:n2');
  assert.match(f.records.find(r => r.phase === 'node_step_prepared').observation_sha256, /^[a-f0-9]{64}$/);
  await assert.rejects(f.channel.act({ verb: 'click', ref: 'ui-button' }), /fresh internal observation/);
});
test('journal failure prevents mutation', async () => {
  const f = fixture({ recordFailure: 'node_step_prepared' }); await f.channel.observe({ condition: 'button usable', ready: s => s.ui.elements.some(e => e.ref === 'ui-button') });
  await assert.rejects(f.channel.act({ verb: 'click', ref: 'ui-button' }), /disk failure/);
  assert.ok(!f.events.includes('mutated'));
});
test('transport uncertainty retains unresolved cleanup', async () => {
  const f = fixture({ executeFailure: true }); await f.channel.observe({ condition: 'button usable', ready: s => s.ui.elements.some(e => e.ref === 'ui-button') });
  await assert.rejects(f.channel.act({ verb: 'click', ref: 'ui-button' }), /transport/);
  assert.equal(f.operation.transportUncertain, true); assert.equal(f.operation.cleanupConfirmed, false);
});
test('document replacement rejects identical-looking refs', async () => {
  const f = fixture({ changedDocument: true }); await assert.rejects(f.channel.observe({ condition: 'button usable', ready: s => s.ui.elements.some(e => e.ref === 'ui-button') }), /document or workflow changed/);
  assert.ok(!f.events.includes('mutated'));
});
test('step budget cannot be bypassed with additional observations', async () => {
  const f = fixture({ maxSteps: 1 }); await f.channel.observe({ condition: 'button usable', ready: s => s.ui.elements.some(e => e.ref === 'ui-button') });
  await assert.rejects(f.channel.observe({ condition: 'button usable', ready: s => s.ui.elements.some(e => e.ref === 'ui-button') }), /budget exhausted/);
  await assert.rejects(f.channel.act({ verb: 'click', ref: 'ui-button' }), /budget exhausted/);
});
const request = () => ({ source: { source_path: '/user/input.csv', encoding: 'UTF-8 (65001)', rows_to_skip: 0, first_line_as_title: true },
  format: { delimiter: ';', decimal_separator: '.', null_marker: '?', text_qualifier: '"' },
  columns: [{ name: 'Count', label: 'Count', type: 'integer', data_kind: 'Непрерывный', used: true }] });
test('typed request admits different values without a scenario recipe', () => { validateTextImportRequest(request()); });
for (const path of ['/user/*.csv', '/user/a.csv|/user/b.csv', '/user/../input.csv', 'https://host/a', '/user/a%2fb']) {
  test('rejects nonliteral source ' + path, () => { const p = request(); p.source.source_path = path; assert.throws(() => validateTextImportRequest(p), /storage path/); });
}
test('rejects unknown steps, duplicate schema and unsupported column count', () => {
  const p = request(); p.steps = []; assert.throws(() => validateTextImportRequest(p), /Unexpected/); delete p.steps;
  p.columns.push({ ...p.columns[0] }); assert.throws(() => validateTextImportRequest(p), /Duplicate/);
  p.columns = Array.from({ length: 9 }, (_, i) => ({ ...p.columns[0], name: 'C' + i })); assert.throws(() => validateTextImportRequest(p), /1–8/);
});

test('bounded observation waits for loading without permitting a masked mutation', async () => {
  const f = fixture({ loadingSamples: 6 }); await f.channel.observe({ condition: 'button usable', ready: s => s.ui.elements.some(e => e.ref === 'ui-button') });
  assert.ok(f.records.filter(r => r.phase === 'node_observation_sample').length >= 4);
  await f.channel.act({ verb: 'click', ref: 'ui-button' });
});
test('ready condition completes without redundant identical snapshots', async () => {
  const f = fixture(); await f.channel.observe({ condition: 'button usable', ready: () => true });
  assert.equal(f.records.filter(r => r.phase === 'node_observation_sample').length, 1);
});
test('foreign receipt cannot confirm original cleanup', async () => {
  const f = fixture({ foreignReceipt: true }); await f.channel.observe({ condition: 'button usable', ready: s => s.ui.elements.some(e => e.ref === 'ui-button') });
  await assert.rejects(f.channel.act({ verb: 'click', ref: 'ui-button' }), /receipt identity differs/);
  assert.equal(f.operation.transportUncertain, true); assert.equal(f.operation.cleanupConfirmed, false);
});

test('completion journal failure preserves the already performed effect', async () => {
  const f = fixture({ recordFailure: 'node_step_completed' }); await f.channel.observe({ condition: 'button usable', ready: s => s.ui.elements.some(e => e.ref === 'ui-button') });
  await assert.rejects(f.channel.act({ verb: 'click', ref: 'ui-button' }), /disk failure/);
  assert.equal(f.operation.nodeEffectPossible, true);
  assert.equal(f.operation.cleanupConfirmed, true);
});

test('public import action rejects a fabricated upload identifier before browser access', async () => {
  const { runtime, Page } = await import('./support/executor-fixture.mjs');
  const page = new Page(); let called = 0;
  const engine = runtime(page, { execute: async () => { called++; throw new Error('Unexpected browser call'); } });
  const result = await engine.run('node.configure_text_import', {
    node_ref: { kind: 'node', node_label: 'Import', workflow_ref: { prefix: 'MF;TF-1', tab_tid: 'tab' } },
    source_transfer_operation_id: 'invented', settings: request(),
  }, { operationId: 'configure-test' });
  assert.equal(result.status, 'FAILED'); assert.equal(result.effect_possible, false); assert.equal(called, 0);
  assert.match(result.error.message, /completed verified upload/);
});


test('stable DOM cannot satisfy a pending semantic condition', async () => {
  const f = fixture(); let checks = 0;
  await f.channel.observe({ condition: 'requested value read back', ready: () => ++checks >= 6 });
  const samples = f.records.filter(r => r.phase === 'node_observation_sample');
  assert.equal(samples.length, 6);
  assert.ok(samples.slice(0, 5).every(r => r.readiness.satisfied === false));
  assert.ok(samples.slice(-1).every(r => r.readiness.satisfied === true));
});
test('readiness timeout names the missing result and invalidates old refs', async () => {
  const f = fixture(); await f.channel.observe({ condition: 'button usable', ready: s => s.ui.elements.some(e => e.ref === 'ui-button') });
  await assert.rejects(f.channel.observe({ condition: 'column editor bound', ready: () => false }), /readiness timeout: column editor bound/);
  await assert.rejects(f.channel.act({ verb: 'click', ref: 'ui-button' }), /fresh internal observation/);
  assert.ok(!f.events.includes('mutated'));
});

test('a visible toast blocks readiness until it disappears', async () => {
  const f = fixture({ dialogsAtRead: n => n <= 10 ? [{ identity: { anchor_tid: 'toast' } }] : [] });
  await f.channel.observe({ condition: 'wizard usable', ready: () => true });
  const samples = f.records.filter(r => r.phase === 'node_observation_sample');
  assert.ok(samples.some(r => r.outcome.output.ui.dialogs.length && !r.readiness.satisfied));
  assert.ok(samples.slice(-1).every(r => r.outcome.output.ui.dialogs.length === 0));
  await f.channel.act({ verb: 'click', ref: 'ui-button' });
});
test('an unexpected dialog fails immediately without a mutation', async () => {
  const f = fixture({ dialogsAtRead: () => [{ identity: { anchor_tid: 'MessageBox' } }] });
  await assert.rejects(f.channel.observe({ condition: 'wizard usable', ready: () => true }), /blocked/);
  assert.ok(!f.events.includes('mutated'));
});

test('target incarnation confirmation waits for the same identity twice', async () => {
  const f = fixture(); let reads = 0;
  await f.channel.observe({ condition: 'saved node incarnation', ready: () => true,
    confirmIdentity: () => ++reads < 3 ? 'old-' + reads : 'new-node' });
  assert.equal(f.records.filter(r => r.phase === 'node_observation_sample').length, 4);
  assert.equal(f.records.at(-1).readiness.required_samples, 2);
});

function recoveryFixture({ initialSequence = 0, refusals = 1, receipt = {}, changedIdentity = false, changedIntent = false, recordFailure = false, confirmIdentity, refreshReplacedBody, onRefresh, now=()=>1, signal } = {}) {
  let reads = 0, mutations = 0; const records = [];
  const operation = {nodeStepSequence:initialSequence,id:'recovery',action:{action_key:'node.apply',revision:'1'},deadline:10000,
    checkpoint:{document_id:'doc',workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'}}};
  const channel = createNodeProcedure({operation,now,signal,wait:async()=>{},maxSteps:20,targetOrigin:'http://example.test',targetBuild:'7.4.2',
    record:async e=>{records.push(e);if(e.phase==='node_step_refresh_authorized'){if(recordFailure)throw Error('disk failure');onRefresh?.();}return structuredClone(e)},
    wrapMutation:(code,reference)=>({reference}),execute:async code=>{
      if(typeof code==='string') {reads++;return {status:'SUCCEEDED',output:{origin:'http://example.test',loginom_build:'7.4.2',
        workflow_ref:{tab_tid:'tab',prefix:'MF;TF-1'},dom_epoch:{document:'doc',revision:reads},scan:{complete:true},wizard:{status:'absent'},
        binding:{node:'node-guid',field:changedIdentity&&mutations?'other':'UnitPrice'},desired:changedIntent&&mutations?'2':'1',
        ui:{masks:[],dialogs:[],truncated:{masks:false,dialogs:false},elements:[{ref:'ui-'+reads,allowed_actions:['click','fill'],kind:'input',editable:true}]}}};}
      mutations++;
      return {operation_id:code.reference.id,action_key:'ui.act',cleanup_complete:true,effect_possible:mutations>refusals,
        status:mutations>refusals?'SUCCEEDED':'NOT_APPLIED',phase:mutations>refusals?'completed':'preconditions',
        error:{code:'UI_EPOCH_CHANGED'},trace:[],...receipt};
    }});
  const perform=()=>channel.perform({condition:'same field editor',ready:()=>true,identity:s=>s.binding,confirmIdentity,refreshReplacedBody,
    resolve:s=>({verb:'fill',ref:s.ui.elements[0].ref,text:s.desired})});
  return {perform,records,get mutations(){return mutations}};
}
test('strict pre-gesture epoch refusal refreshes and rebinds one unchanged field',async()=>{
  const f=recoveryFixture();await f.perform();assert.equal(f.mutations,2);
  const auth=f.records.find(e=>e.phase==='node_step_refresh_authorized');assert.equal(auth.effect_possible,false);
  assert.equal(f.records.filter(e=>e.phase==='node_step_prepared').length,2);
  assert.equal(new Set(f.records.filter(e=>e.phase==='node_step_prepared').map(e=>e.internal_operation_id)).size,2);
});
test('local epoch recovery stops after two refreshes',async()=>{
  const f=recoveryFixture({refusals:10});await assert.rejects(f.perform(),/did not confirm/);assert.equal(f.mutations,3);
});
for(const [name,receipt] of Object.entries({effect:{effect_possible:true},unknown:{status:'AMBIGUOUS'},cleanup:{cleanup_complete:false},phase:{phase:'applying'},trace:{trace:[{event:'ui_preconditions_verified'}]},missingTrace:{trace:undefined},foreignCode:{error:{code:'UI_CONTEXT_CHANGED'}}})){
  test('epoch recovery refuses '+name,async()=>{const f=recoveryFixture({receipt});await assert.rejects(f.perform());assert.equal(f.mutations,1)});
}
for(const changed of ['changedIdentity','changedIntent'])test('refresh refuses '+changed,async()=>{
  const f=recoveryFixture({[changed]:true});await assert.rejects(f.perform(),/target or intent changed/);assert.equal(f.mutations,1);
});
test('recovery journal failure prevents a second gesture',async()=>{
  const f=recoveryFixture({recordFailure:true});await assert.rejects(f.perform(),/disk failure/);assert.equal(f.mutations,1);
});

test('bound action consumes an already journalled observation without another read',async()=>{
 const f=fixture();const observed=await f.channel.observe({condition:'button ready',ready:()=>true});
 await f.channel.perform({condition:'same button ready',ready:()=>true,initialObservation:observed,
   identity:()=>({node:'node1',control:'button'}),resolve:s=>({verb:'click',ref:s.ui.elements[0].ref})});
 assert.equal(f.records.filter(e=>e.phase==='node_observation_completed').length,1);
});
test('bound action rejects a stale initial observation before any gesture',async()=>{
 const f=fixture();const observed=await f.channel.observe({condition:'button ready',ready:()=>true});observed.dom_epoch.revision++;
 await assert.rejects(f.channel.perform({condition:'same button',ready:()=>true,initialObservation:observed,
   identity:()=>({node:'node1'}),resolve:s=>({verb:'click',ref:s.ui.elements[0].ref})}),/no longer current/);
 assert.ok(!f.events.includes('mutated'));
});

test('native process, port and mapping reads share the prepared node and durable observation',async()=>{
 const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]},node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
 const node={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node',surface:'graph',tid:'MF;TF-1;Graph;Import'};
 const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:binding.workflow_ref,dom_epoch:{document:'dom',revision:1},
   prepared_node_context:node,scan:{complete:true},wizard:{status:'absent'},ui:{elements:[{tid:'ConsoleForm',ref:'ui-console'}],masks:[],dialogs:[],truncated:{dialogs:false,masks:false}}};
 const calls=[],records=[];
 const make=(changed=false)=>createNodeProcedure({operation:{id:'native',deadline:10000,action:{action_key:'node.apply',revision:'1'}},
   preparedNodeContext:binding,targetOrigin:state.origin,targetBuild:state.loginom_build,now:()=>1,
   record:async r=>{records.push(r);return structuredClone(r)},wrapMutation:()=>{throw Error('unexpected mutation')},
   execute:async code=>{
     calls.push(code);
     if(code.includes('function workspaceUiCapability'))return {status:'SUCCEEDED',output:structuredClone(state)};
     return {verified:true,node_context:{...node,node_id:changed?'foreign':'node'},processes:[],ports:[]};
   }});
 const s=await make().observe({condition:'native state',readProcesses:true,readOutputs:true,readMappings:true,ready:s=>s.node_processes?.verified&&s.node_outputs?.verified&&s.node_mapping?.verified});
 assert.equal(s.node_processes.verified,true);assert.equal(calls.length,5);
 assert.ok(calls[1].includes('"root_ref":"ui-console"'));
 assert.equal(records.at(-1).outcome.output.node_outputs.node_context.node_id,'node');
 assert.equal(records.at(-1).outcome.output.node_mapping.node_context.node_id,'node');
 await assert.rejects(make(true).observe({condition:'native mapping',readMappings:true,ready:()=>true}),/context changed/);
 await assert.rejects(make(true).observe({condition:'native state',readProcesses:true,ready:()=>true}),/context changed/);
 calls.length=0;
 state.ui.elements=[{tid:'MF;cntMain;tlbMainToolbar',ref:'ui-toolbar'}];
 await make().observe({condition:'closed console is opened from its toolbar',readProcesses:true,ready:()=>true});
 assert.ok(calls[1].includes('"root_ref":"ui-toolbar"'));
});

test('Table dialogs require an explicit active port binding and never waive unrelated dialogs',async()=>{
 const table={view_guid:'11111111-1111-1111-1111-111111111111',port_guid:'22222222-2222-2222-2222-222222222222',table_tid:'MF;TF-1;ViewsForm;BrowseView'};
 for(const mode of ['valid','closing','undeclared','foreign_dialog','foreign_port']) {
  const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]},node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
  const node={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node',surface:'views',tid:'MF;TF-1;ViewsForm'};
  const modal=table.table_tid+';ModalWindow_BrowseFormat';
  const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:binding.workflow_ref,dom_epoch:{document:'dom',revision:1},prepared_node_context:node,
   scan:{complete:true},wizard:{status:'absent'},ui:{elements:[{tid:modal,ref:'ui-modal'},{ref:'ui-input',allowed_actions:['press']}],masks:[],dialogs:[{identity:{anchor_tid:mode==='foreign_dialog'?'msgbox':modal}}],truncated:{dialogs:false,masks:false}}};
  let mutations=0,reads=0;
  const channel=createNodeProcedure({operation:{id:'table',deadline:10000,action:{action_key:'node.apply',revision:'1'}},preparedNodeContext:binding,
   targetOrigin:state.origin,targetBuild:state.loginom_build,now:()=>1,wait:async()=>{},record:async r=>structuredClone(r),
   wrapMutation:(code,r)=>({code,r}),execute:async code=>{
    if(typeof code!=='string'){mutations++;return {operation_id:code.r.id,action_key:'ui.act',status:'SUCCEEDED',cleanup_complete:true,effect_possible:true};}
    if(code.includes('function workspaceUiCapability')){
     const output=structuredClone(state);
     if(mode==='closing'){reads++;if(reads<=2)output.ui.masks=[{kind:'busy'}];else output.ui.dialogs=[];}
     return {status:'SUCCEEDED',output};
    }
    return {verified:true,node_context:node,tables:[{...table,port_guid:mode==='foreign_port'?'foreign':table.port_guid,active:true}]};
   }});
  const observe=()=>channel.observe({condition:'bound Table format',tableDialog:mode==='undeclared'?undefined:{table,kind:'format'},ready:s=>mode==='closing'?s.ui.dialogs.length===0:true});
  if(mode==='closing'){const s=await observe();assert.equal(s.ui.dialogs.length,0);assert.equal(reads,4);assert.equal(mutations,0);}
  else if(mode!=='valid') {await assert.rejects(observe);assert.equal(mutations,0);}
  else {await observe();await channel.act({verb:'press',ref:'ui-input',key:'Tab'});assert.equal(mutations,1);}
 }
});

test('strict pre-gesture refresh preserves the requested Table page even for an offscreen result',async()=>{
 const table={view_guid:'11111111-1111-1111-1111-111111111111',port_guid:'22222222-2222-2222-2222-222222222222',table_tid:'MF;TF-1;ViewsForm;BrowseView'};
 const binding={document_id:'doc',workflow_ref:{workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]},node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
 const node={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node',surface:'views'};
 const request={table,page:{row_offset:0,row_limit:10,column_offset:64,column_limit:2}};
 const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:binding.workflow_ref,dom_epoch:{document:'dom',revision:1},prepared_node_context:node,
  scan:{complete:true},wizard:{status:'absent'},ui:{elements:[{ref:'ui-scroll',allowed_actions:['scroll_horizontal']}],masks:[],dialogs:[],truncated:{dialogs:false,masks:false}}};
 let attempts=0,tableReads=0;
 const channel=createNodeProcedure({operation:{id:'table-page-refresh',deadline:10000,action:{action_key:'node.apply',revision:'1'}},preparedNodeContext:binding,
  targetOrigin:state.origin,targetBuild:state.loginom_build,now:()=>1,record:async r=>structuredClone(r),wrapMutation:(code,r)=>({r}),
  execute:async code=>{
   if(typeof code!=='string')return {operation_id:code.r.id,action_key:'ui.act',status:++attempts===1?'NOT_APPLIED':'SUCCEEDED',
    phase:attempts===1?'preconditions':'completed',cleanup_complete:true,effect_possible:attempts>1,error:{code:'UI_EPOCH_CHANGED'},trace:[]};
   if(code.includes('function workspaceUiCapability'))return {status:'SUCCEEDED',output:structuredClone(state)};
   if(code.includes('function readNodeTable')){tableReads++;assert.ok(code.includes('"column_offset":64'));return {verified:false,reason:'cell_not_visible',horizontal_window:{left:0}};}
   return {verified:true,node_context:node,tables:[{...table,active:true}]};
  }});
 const ready=s=>s.node_table?.reason==='cell_not_visible';
 const observed=await channel.observe({condition:'offscreen Table page',tablePage:request,ready});
 assert.deepEqual(observed.node_table_request,request);
 await channel.perform({condition:'reveal same Table page',initialObservation:observed,ready,
  resolve:()=>({verb:'scroll_horizontal',ref:'ui-scroll',delta_x:1000}),identity:()=>({table,page:request.page})});
 assert.equal(attempts,2);assert.equal(tableReads,2);
});

test('prepared graph and navigation observations select separate bounded roots',async()=>{
 const workflow_ref={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
 const binding={document_id:'doc',workflow_ref,node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
 const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,dom_epoch:{document:'dom',revision:1},
  prepared_node_context:{...binding.node,verified:true,surface:'graph',tid:'MF;TF-1;Graph;Import'},scan:{complete:true},wizard:{status:'absent'},
  ui:{elements:[{tid:'MF;TF-1;ModelForm;cmpDiagram',ref:'ui-graph'},{tid:'MF;TF-1;NavigationBar;NavigationPanel',ref:'ui-navigation'}],
   masks:[],dialogs:[],truncated:{dialogs:false,masks:false}}};
 const roots=[];
 const channel=createNodeProcedure({operation:{id:'roots',deadline:10000,action:{action_key:'node.apply',revision:'1'}},preparedNodeContext:binding,
  targetOrigin:state.origin,targetBuild:state.loginom_build,now:()=>1,wait:async()=>{},record:async e=>structuredClone(e),wrapMutation:()=>{throw Error('Unexpected mutation');},
  execute:async code=>{if(!code.includes('"discover_roots":true'))roots.push(/"root_ref":"([^"]+)"/.exec(code)?.[1]);return {status:'SUCCEEDED',output:structuredClone(state)};}});
 await channel.observe({condition:'graph',ready:()=>true});
 const navigation=await channel.observe({condition:'navigation',readNavigation:true,ready:()=>true});
 assert.deepEqual(roots,['ui-graph','ui-navigation']);assert.equal(navigation.node_navigation_read,true);
 state.ui.elements.pop();await assert.rejects(channel.observe({condition:'missing navigation',readNavigation:true,ready:()=>true}),/navigation region unavailable/);
});

test('only the bound native output editor can pass the node procedure dialog guard',async()=>{
 for(const mode of ['bound','unbound','foreign','extra']) {
  const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'},dom_epoch:{document:'doc'},scan:{complete:true},
   wizard:{status:'observed',stage:'output_mapping',column_parameters:{status:'observed',portal_bound:mode!=='unbound',root_tid:'EditColumnDefForm',root_ref:'editor',selected_column:{status:'observed'}}},
   ui:{elements:[],masks:[],dialogs:[{ref:mode==='foreign'?'other':'editor',identity:{anchor_tid:'EditColumnDefForm'}}],truncated:{dialogs:false,masks:false}}};
  if(mode==='extra')state.ui.dialogs.push({ref:'question',identity:{anchor_tid:'msgbox'}});
  const channel=createNodeProcedure({operation:{id:'editor',action:{action_key:'node.apply',revision:'1'},deadline:10000,checkpoint:{document_id:'doc',workflow_ref:state.workflow_ref}},
   targetOrigin:state.origin,targetBuild:state.loginom_build,now:()=>1,wait:async()=>{},record:async e=>structuredClone(e),execute:async()=>({status:'SUCCEEDED',output:structuredClone(state)})});
  const read=()=>channel.observe({condition:'bound column editor',ready:()=>true});
  if(mode==='bound')assert.equal((await read()).wizard.column_parameters.root_ref,'editor');else await assert.rejects(read(),/mask or dialog/);
 }
});

test('output port opening uses the parent journal and receipt wrapper before any effect',async()=>{
 for(const mode of ['success','journal','transport','foreign','owner','completion','budget']) {
  const workflow_ref={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
  const binding={document_id:'doc',workflow_ref,node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
  const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,dom_epoch:{document:'dom',revision:1},
   prepared_node_context:{...binding.node,verified:true,surface:'graph',locked:false,tid:'MF;TF-1;Graph;Import'},scan:{complete:true},wizard:{status:'absent'},
   ui:{elements:[{tid:'MF;TF-1;ModelForm;cmpDiagram',ref:'graph'}],masks:[],dialogs:[],truncated:{dialogs:false,masks:false}}};
  const entries=[],order=[],op={id:'parent',deadline:10000,action:{action_key:'node.apply',revision:'1'}};
  const channel=createNodeProcedure({operation:op,preparedNodeContext:binding,targetOrigin:state.origin,targetBuild:state.loginom_build,
   now:()=>1,wait:async()=>{},maxSteps:mode==='budget'?1:5,
   record:async e=>{order.push(e.phase);entries.push(e);if(mode==='journal'&&e.phase==='node_step_prepared')throw Error('disk');if(mode==='completion'&&e.phase==='node_step_completed')return {};return structuredClone(e);},
   wrapMutation:(code,r)=>{order.push('wrapped');return {code,r};},execute:async code=>{
    if(typeof code==='string')return {status:'SUCCEEDED',output:structuredClone(state)};
    order.push('effect');if(mode==='transport')throw Error('transport');
    return {status:'SUCCEEDED',operation_id:mode==='foreign'?'other':code.r.id,action_key:code.r.action_key,effect_possible:true,cleanup_complete:true,
     output:{verified:true,direction:'output',port:0,opening_operation_id:code.r.id,...binding.node,node_id:mode==='owner'?'other':'node'}};
   }});
  if(mode==='success'){
   assert.equal((await channel.openOutputPort(0)).status,'SUCCEEDED');
   assert.ok(order.indexOf('node_step_prepared')<order.indexOf('wrapped'));assert.ok(order.indexOf('wrapped')<order.indexOf('effect'));
   assert.equal(entries.find(e=>e.phase==='node_step_prepared').action.verb,'open_output_port');assert.equal(op.nodeEffectPossible,true);
   await assert.rejects(channel.act({verb:'click',ref:'graph'}),/fresh internal observation/);
  }else {await assert.rejects(channel.openOutputPort(0));
   if(['journal','budget'].includes(mode))assert.ok(!order.includes('effect'));
   if(['foreign','transport'].includes(mode)){assert.equal(op.transportUncertain,true);assert.equal(op.cleanupConfirmed,false);}
  }
 }
});

test('calculator parameter portal admits only its bound modal background',async()=>{
 for(const mode of ['bound','foreign_dialog','foreign_selection','foreign_mask','busy','extra_dialog']) {
  const base='MF;TF-1;WizrdMCF';
  const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'},dom_epoch:{document:'doc'},scan:{complete:true},
   wizard:{status:'observed',stage:'calculator',root_tid:base,root_ref:'wizard',expression_selection:{status:'observed',name:'Expr1'},
    expression_parameters:{status:'observed',root_ref:'editor',selected_expression:{tid:base+';CalcDataWizard;colExpressionName_Expr1'}}},
   ui:{elements:[{tid:base+';ExprDataEditForm',ref:'editor'}],masks:[{kind:'modal_background',target_tid:base,ref:'wizard'}],
    dialogs:[{ref:'editor',identity:{anchor_tid:base+';ExprDataEditForm'}}],truncated:{dialogs:false,masks:false}}};
  if(mode==='foreign_dialog')state.ui.dialogs[0].ref='other';
  if(mode==='foreign_selection')state.wizard.expression_parameters.selected_expression.tid+='Other';
  if(mode==='foreign_mask')state.ui.masks[0].target_tid='Other';
  if(mode==='busy')state.ui.masks[0].kind='loading';
  if(mode==='extra_dialog')state.ui.dialogs.push({ref:'other',identity:{anchor_tid:'msgbox'}});
  let clock=1;const roots=[];
  const channel=createNodeProcedure({operation:{id:'calc',action:{action_key:'node.apply',revision:'1'},deadline:10000,checkpoint:{document_id:'doc',workflow_ref:state.workflow_ref}},
   targetOrigin:state.origin,targetBuild:state.loginom_build,now:()=>clock++,wait:async()=>{clock+=1000},record:async e=>structuredClone(e),
   execute:async code=>{if(!code.includes('"discover_roots":true'))roots.push(code.includes('"root_ref":"editor"'));return {status:'SUCCEEDED',output:structuredClone(state)};}});
  const read=()=>channel.observe({condition:'calculator editor',ready:()=>true,timeoutMs:2000});
  if(mode==='bound'){assert.equal((await read()).wizard.expression_parameters.root_ref,'editor');assert.ok(roots.every(Boolean));}
  else await assert.rejects(read());
 }
});


test('cancelled observation is journaled as read-only and cannot authorize a gesture',async()=>{
 let controller=new AbortController();
 const signal={throwIfAborted:()=>controller.signal.throwIfAborted(),get aborted(){return controller.signal.aborted;},get reason(){return controller.signal.reason;}};
 const f=fixture({signal});
 await assert.rejects(f.channel.observe({condition:'identified execution wait',ready:()=>{controller.abort(Error('local cancel'));return false;}}),/local cancel/);
 const interrupted=f.records.at(-1);assert.equal(interrupted.phase,'node_observation_interrupted');assert.equal(interrupted.step,1);
 assert.equal(interrupted.effect_possible,false);assert.equal(interrupted.cleanup_complete,true);assert.ok(!f.events.includes('mutated'));
 controller=new AbortController();
 await assert.rejects(f.channel.act({verb:'click',ref:'ui-button'}),/fresh internal observation/);
 await f.channel.observe({condition:'fresh resumed read',ready:()=>true});assert.equal(f.channel.steps,2);
});
test('failed interruption journal cannot supply a safe continuation proof',async()=>{
 const controller=new AbortController(),f=fixture({signal:controller.signal,recordFailure:'node_observation_interrupted'});
 await assert.rejects(f.channel.observe({condition:'wait',ready:()=>{controller.abort(Error('local cancel'));return false;}}),/disk failure/);
 assert.ok(!f.records.some(e=>e.phase==='node_observation_interrupted'));assert.ok(!f.events.includes('mutated'));
});


test('preflight and configuration channels share collision-free internal receipts', async () => {
  const preflight = fixture();
  const configure = fixture({sharedOperation: preflight.operation});
  for (const f of [preflight, configure, preflight]) {
    await f.channel.observe({condition: 'owned field', ready: () => true});
    await f.channel.act({verb: 'click', ref: 'ui-button'});
  }
  const ids = [...preflight.records, ...configure.records]
    .filter(r => r.phase === 'node_step_prepared').map(r => r.internal_operation_id);
  assert.deepEqual(ids.sort(), ['parent:n2', 'parent:n4', 'parent:n6']);
  assert.equal(new Set(ids).size, 3);
});

test('refresh authorization keeps the shared operation sequence after preflight',async()=>{
 const f=recoveryFixture({initialSequence:7});await f.perform();
 for(const e of f.records)assert.equal(e.internal_operation_id,'recovery:n'+e.step);
 const auth=f.records.find(e=>e.phase==='node_step_refresh_authorized');assert.ok(auth.step>7);
});

test('reform global editor and its dropdown use bounded roots with strict owner guards',async()=>{
 for(const mode of ['bound','dropdown','unbound','foreign','busy','duplicate']){
  const base='MF;TF-1;WizrdMCF',editor='EditReformColumnDefForm';
  const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'},dom_epoch:{document:'doc'},scan:{complete:true},
   wizard:{status:'observed',stage:'field_parameters',root_tid:base,root_ref:'wizard',reform_parameters:{status:'observed',portal_bound:mode!=='unbound',root_tid:editor,root_ref:'editor',selected_column:{status:'observed',name:'Amount'}}},
   ui:{elements:[{tid:editor,ref:'editor'}],masks:[{kind:mode==='busy'?'loading':'modal_background',target_tid:base,ref:'wizard'}],
    dialogs:[{ref:mode==='foreign'?'other':'editor',identity:{anchor_tid:editor}}],truncated:{dialogs:false,masks:false}}};
  if(mode==='dropdown')state.ui.elements.push({tid:editor+';cbxDataType;boundlist',ref:'choices'});
  if(mode==='duplicate')state.ui.elements.push({tid:base+';EditReformColumnDefForm',ref:'duplicate'});
  let clock=1;const roots=[];
  const channel=createNodeProcedure({operation:{id:'reform',action:{action_key:'node.apply',revision:'1'},deadline:10000,checkpoint:{document_id:'doc',workflow_ref:state.workflow_ref}},targetOrigin:state.origin,targetBuild:state.loginom_build,
   now:()=>clock++,wait:async()=>{clock+=1000},record:async e=>structuredClone(e),execute:async code=>{if(!code.includes('"discover_roots":true'))roots.push(/"root_ref":"([^"]+)"/.exec(code)?.[1]);return {status:'SUCCEEDED',output:structuredClone(state)};}});
  const read=()=>channel.observe({condition:'bound reform editor',ready:()=>true,timeoutMs:2000});
  if(['bound','dropdown'].includes(mode)){await read();assert.deepEqual(roots,[mode==='dropdown'?'choices':'editor']);}else await assert.rejects(read());
 }
});

test('detached root before a gesture refreshes only the unchanged bound action',async()=>{
 const receipt={phase:'observing',error:{code:'UI_ROOT_STALE'}};
 const good=recoveryFixture({receipt});await good.perform();assert.equal(good.mutations,2);
 for(const patch of [{effect_possible:true},{cleanup_complete:false},{phase:'applying'},{trace:[{event:'ui_gesture_applied'}]}]){
  const bad=recoveryFixture({receipt:{...receipt,...patch}});await assert.rejects(bad.perform());assert.equal(bad.mutations,1);
 }
 for(const changed of ['changedIdentity','changedIntent']){
  const bad=recoveryFixture({receipt,[changed]:true});await assert.rejects(bad.perform(),/target or intent changed/);assert.equal(bad.mutations,1);
 }
 const limit=recoveryFixture({receipt,refusals:10});await assert.rejects(limit.perform());assert.equal(limit.mutations,3);
});

test('readiness elapsed time and timeout survive a backward wall-clock correction', async () => {
  let wall = 1000, monotonic = 0;
  const f = fixture({ now: () => (wall -= 100), monotonicNow: () => (monotonic += 5) });
  await f.channel.observe({ condition: 'button usable', ready: () => true });
  const completed = f.records.find(r => r.phase === 'node_observation_completed');
  assert.ok(completed.readiness.elapsed_ms > 0);
  await assert.rejects(f.channel.observe({ condition: 'missing editor', ready: () => false, timeoutMs: 30 }), /readiness timeout/);
  assert.ok(f.records.find(r => r.phase === 'node_observation_timeout').elapsed_ms >= 30);
  assert.ok(!f.events.includes('mutated'));
});

for(const mode of ['ready_after_load','still_loading','foreign_dialog','wrong_operator'])
 test('filter modal loading is wait-only: '+mode,async()=>{
  let clock=0;
  const f=fixture({now:()=>++clock});
  const root='MF;TF-1;WizrdMCF',tid=root+';ModalWindow_BetweenValuesEditor';
  f.state.wizard={status:'observed',stage:'row_filter',root_tid:root,root_ref:'wizard'};
  f.state.node_filter={verified:true,rows:[{record_id:'row',operator_code:mode==='wrong_operator'?4:8}],selection:['row'],dialogs:[]};
  f.state.ui.dialogs=[{ref:'range',identity:{anchor_tid:mode==='foreign_dialog'?'foreign':tid}}];
  f.state.ui.masks=[{kind:'busy',ref:'range',dialog_ref:'range',target_tid:tid}];
  const read=f.channel.observe({condition:'owned filter range',timeoutMs:30,ready:()=>true});
  if(mode==='ready_after_load'){
   // Initial asynchronous observation sees loading; the next one sees a bound editor.
   await Promise.resolve();await Promise.resolve();await Promise.resolve();
   f.state.ui.masks=[];f.state.node_filter.dialogs=[{root_tid:tid,record_id:'row'}];
   await read;
   assert.equal(f.records.find(r=>r.phase==='node_observation_sample').readiness.satisfied,false);
  }else await assert.rejects(read,mode==='still_loading'?/readiness timeout/:/blocked/);
  assert.ok(!f.events.includes('mutated'));
 });

for(const mode of ['ready','loading','foreign_dialog','foreign_mask'])test('preview loading permits only a bounded owned wait: '+mode,async()=>{
 const workflow_ref={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
 const binding={document_id:'doc',workflow_ref,node:{document_id:'doc',workflow_id:'flow',node_id:'source'}};
 const root=workflow_ref.prefix+';ModelForm;PreviewWindow',node={...binding.node,verified:true,surface:'graph'};
 const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,dom_epoch:{document:'doc',revision:1},prepared_node_context:node,scan:{complete:true},wizard:{status:'absent'},
  ui:{elements:[],masks:[{kind:'busy',dialog_ref:'preview',target_tid:mode==='foreign_mask'?'foreign':root+';PreviewForm'}],
   dialogs:[{ref:'preview',identity:{anchor_tid:mode==='foreign_dialog'?'foreign':root}}],truncated:{dialogs:false,masks:false}}};
 let clock=0,reads=0;const records=[];
 const channel=createNodeProcedure({operation:{id:'preview',deadline:10000,action:{action_key:'node.apply',revision:'1'}},preparedNodeContext:binding,targetOrigin:state.origin,targetBuild:state.loginom_build,
  now:()=>++clock,wait:async()=>{},record:async e=>{records.push(e);return structuredClone(e);},execute:async code=>{
   if(code.includes('function workspaceUiCapability'))return {status:'SUCCEEDED',output:structuredClone(state)};
   reads++;if(mode==='ready'&&reads>1){state.ui.masks=[];return {verified:true,node_id:'source',root_tid:root};}
   return {verified:false,reason:'preview_visible_form'};
  }});
 const read=channel.observe({condition:'preview ready',readPreview:true,timeoutMs:60,ready:s=>s.node_preview_schema?.verified===true});
 if(mode==='ready'){await read;assert.equal(records.find(r=>r.phase==='node_observation_sample').readiness.satisfied,false);}
 else await assert.rejects(read,mode==='loading'?/readiness timeout/:/blocked/);
 assert.equal(records.some(r=>r.phase==='node_step_prepared'),false);
});

test('Join link menu uses a unique bounded portal only during Join observation',async()=>{
 const workflow_ref={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
 const binding={document_id:'doc',workflow_ref,node:{document_id:'doc',workflow_id:'flow',node_id:'join'}};
 const node={...binding.node,verified:true,surface:'wizard'};
 const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,dom_epoch:{document:'dom',revision:1},prepared_node_context:node,scan:{complete:true},
  wizard:{status:'observed',stage:'join',root_tid:'MF;TF-1;WizrdMCF',root_ref:'wizard'},ui:{elements:[{tid:'mn',ref:'menu'}],masks:[],dialogs:[],truncated:{dialogs:false,masks:false}}};
 const roots=[];
 const channel=createNodeProcedure({operation:{id:'join-menu',deadline:10000,action:{action_key:'node.apply',revision:'1'}},preparedNodeContext:binding,targetOrigin:state.origin,targetBuild:state.loginom_build,
  now:()=>1,wait:async()=>{},record:async e=>structuredClone(e),execute:async code=>{
   if(code.includes('function workspaceUiCapability')){if(!code.includes('"discover_roots":true'))roots.push(/"root_ref":"([^"]+)"/.exec(code)?.[1]);return {status:'SUCCEEDED',output:structuredClone(state)};}
   return {verified:true,node_context:node};
  }});
 await channel.observe({condition:'Join remove menu',readJoin:true,ready:()=>true});assert.equal(roots.at(-1),'menu');
 await channel.observe({condition:'ordinary wizard',ready:()=>true});assert.equal(roots.at(-1),'wizard');
 state.ui.elements.push({tid:'mn',ref:'other'});await assert.rejects(channel.observe({condition:'ambiguous menu',readJoin:true,ready:()=>true}),/menu is ambiguous/);
});

test('pre-gesture recovery retains the handler stability condition',async()=>{const f=recoveryFixture({confirmIdentity:s=>s.binding});await f.perform();const observations=f.records.filter(e=>e.phase==='node_observation_completed');assert.equal(observations.length,2);assert.ok(observations.every(e=>e.readiness.required_samples===2));assert.equal(f.records.filter(e=>e.phase==='node_observation_sample').length,4);assert.equal(f.mutations,2);});

test('duplicate global role editor and its dropdown use bounded roots with strict owner guards',async()=>{
 for(const mode of ['bound','dropdown','unbound','foreign','busy','duplicate']){
  const base='MF;TF-1;WizrdMCF',editor='EditTuneColumnDefForm';
  const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'},dom_epoch:{document:'doc'},scan:{complete:true},
   wizard:{status:'observed',stage:'input_mapping',root_tid:base,root_ref:'wizard',column_parameters:{status:'observed',portal_bound:mode!=='unbound',root_tid:editor,root_ref:'editor',selected_column:{status:'observed',name:'Amount'}}},
   ui:{elements:[{tid:editor,ref:'editor'}],masks:mode==='busy'?[{kind:'loading',target_tid:base,ref:'wizard'}]:[],
    dialogs:[{ref:mode==='foreign'?'other':'editor',identity:{anchor_tid:editor}}],truncated:{dialogs:false,masks:false}}};
  if(mode==='dropdown')state.ui.elements.push({tid:editor+';cbxUsageType;boundlist',ref:'choices'});
  if(mode==='duplicate')state.ui.elements.push({tid:editor,ref:'duplicate'});
  let clock=1;const roots=[];
  const channel=createNodeProcedure({operation:{id:'reform',action:{action_key:'node.apply',revision:'1'},deadline:10000,checkpoint:{document_id:'doc',workflow_ref:state.workflow_ref}},targetOrigin:state.origin,targetBuild:state.loginom_build,
   now:()=>clock++,wait:async()=>{clock+=1000},record:async e=>structuredClone(e),execute:async code=>{if(!code.includes('"discover_roots":true'))roots.push(/"root_ref":"([^"]+)"/.exec(code)?.[1]);return {status:'SUCCEEDED',output:structuredClone(state)};}});
  const read=()=>channel.observe({condition:'bound duplicate editor',ready:()=>true,timeoutMs:2000});
  if(['bound','dropdown'].includes(mode)){await read();assert.deepEqual(roots,[mode==='dropdown'?'choices':'editor']);}else await assert.rejects(read());
 }
});
test('missing values prompt is read through its portal and requires a bound constant field',async()=>{
 for(const fault of ['none','title','field','method','control','signature']){
  const node={document_id:'doc',workflow_id:'wf',node_id:'node'},ref={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'workflow'}]},base='MF;TF-1;WizrdMCF';
  const native={verified:true,node_context:{verified:true,...node,surface:'wizard',tid:base},method_context:{field_name:'Note',record_id:'r'},fields:[{name:fault==='field'?'other':'Note',record_id:'r',used:true,type:'string',method:fault==='method'?'mean':'constant'}]};
  const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:ref,dom_epoch:{document:'doc'},prepared_node_context:native.node_context,scan:{complete:true},wizard:{status:'observed',stage:'missing_values',root_ref:'wizard',root_tid:base},ui:{masks:[],dialogs:[{ref:'portal',title:fault==='title'?'Other':'Редактирование значения замены для пропусков'}],truncated:{dialogs:false,masks:false},elements:['msgbox;cnt;cnt;txt','msgbox;tlb;ok','msgbox;tlb;cancel'].map(tid=>({tid,ref:tid,identity:{anchor_tid:tid},signature:{dialog_ref:fault==='signature'?'other':'portal'}}))}};
  if(fault==='control')state.ui.elements.pop();let clock=1;const roots=[];
  const channel=createNodeProcedure({operation:{id:'mv-prompt',action:{action_key:'node.apply',revision:'1'},deadline:10000},preparedNodeContext:{document_id:'doc',workflow_ref:{...ref,workflow_id:'wf'},node},targetOrigin:state.origin,targetBuild:state.loginom_build,now:()=>clock++,wait:async()=>{clock+=1000},record:async e=>structuredClone(e),execute:async code=>{
   if(code.includes('function readMissingValuesBrowser'))return structuredClone(native);
   if(!code.includes('"discover_roots":true'))roots.push(/"root_ref":"([^"]+)"/.exec(code)?.[1]);
   return {status:'SUCCEEDED',output:structuredClone(state)};
  }});
  const read=()=>channel.observe({condition:'owned prompt',readMissingValues:true,ready:()=>true,timeoutMs:2000});
  if(fault==='none'){await read();assert.ok(roots.includes('portal'));}else await assert.rejects(read());
 }
});

test('a source body proof permits only one strict stale refusal refresh',async()=>{
 for(const refusals of [1,2]){
  const f=recoveryFixture({refusals,receipt:{error:{code:'UI_REFERENCE_STALE'}},refreshReplacedBody:()=>true});
  if(refusals===1)await f.perform();else await assert.rejects(f.perform());
  assert.equal(f.mutations,2);const events=f.records.filter(e=>e.phase==='node_step_refresh_authorized');
  assert.equal(events.length,1);assert.equal(events[0].reason,'prepared_graph_body_replaced');
 }
});
for(const [name,options] of Object.entries({
 noOptIn:{refreshReplacedBody:undefined},unproved:{refreshReplacedBody:()=>false},
 effect:{receipt:{effect_possible:true}},ambiguous:{receipt:{status:'AMBIGUOUS'}},cleanup:{receipt:{cleanup_complete:false}},
 gesture:{receipt:{trace:[{event:'ui_gesture_applied'}]}},preconditions:{receipt:{trace:[{event:'ui_preconditions_verified'}]}},
 missingTrace:{receipt:{trace:undefined}},wrongPhase:{receipt:{phase:'applying'}},wrongError:{receipt:{error:{code:'UI_CONTEXT_CHANGED'}}},
 journal:{recordFailure:true},identity:{changedIdentity:true},intent:{changedIntent:true},
}))test('source body refresh refuses '+name,async()=>{
 const f=recoveryFixture({refreshReplacedBody:()=>true,...options,receipt:{error:{code:'UI_REFERENCE_STALE'},...options.receipt}});
 await assert.rejects(f.perform());assert.equal(f.mutations,1);
});
for(const kind of ['cancel','deadline'])test('source body refresh respects fresh '+kind,async()=>{
 const controller=new AbortController();let clock=1;
 const f=recoveryFixture({receipt:{error:{code:'UI_REFERENCE_STALE'}},refreshReplacedBody:()=>true,now:()=>clock,signal:controller.signal,
 onRefresh:()=>{if(kind==='cancel')controller.abort();else clock=10000;}});
 await assert.rejects(f.perform());assert.equal(f.mutations,1);
});


test('an incomplete observation preserves the original refusal in the journal',async()=>{
 const f=fixture({staleReads:3});
 await assert.rejects(f.channel.observe({condition:'closed dialog',ready:()=>true}),error=>{
  assert.match(error.message,/UI_ROOT_STALE/);
  assert.equal(error.nodeObservationRefusal.error.code,'UI_ROOT_STALE');return true;
 });
 const refused=f.records.filter(r=>r.phase==='node_observation_refused');
 assert.equal(refused.length,1);assert.equal(refused[0].outcome.error.code,'UI_ROOT_STALE');
 assert.ok(!f.events.includes('mutated'));
});

test('bound completion gives mask settlement only the remaining parent deadline',async()=>{
  for(const verb of ['finish_wizard','apply_output_column','cancel_output_column','apply_reform_column','cancel_reform_column','click']) {
    const workflow_ref={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
    const binding={document_id:'doc',workflow_ref,node:{document_id:'doc',workflow_id:'flow',node_id:'node'}};
    const state={origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,dom_epoch:{document:'dom',revision:1},
      prepared_node_context:{...binding.node,verified:true,surface:'graph',tid:'MF;TF-1;Graph;Import'},scan:{complete:true},wizard:{status:'absent'},
      ui:{elements:[{ref:'ui-button',allowed_actions:[verb]}],masks:[],dialogs:[],truncated:{dialogs:false,masks:false}}};
    const operation={id:'parent',deadline:65000,action:{action_key:'node.apply',revision:'1'}};
    const channel=createNodeProcedure({operation,preparedNodeContext:binding,targetOrigin:state.origin,targetBuild:state.loginom_build,
      now:()=>1000,wait:async()=>{},record:async e=>structuredClone(e),wrapMutation:(code,receipt)=>({code,receipt}),
      execute:async(code,options)=>{
        if(typeof code==='string')return {status:'SUCCEEDED',output:structuredClone(state)};
        assert.equal(options.timeout,verb==='click'?35000:69000);
        if(verb==='click')assert.doesNotMatch(code.code,/"settlement_timeout_ms":/);
        else assert.match(code.code,/"settlement_timeout_ms":64000/);
        return {status:'SUCCEEDED',operation_id:code.receipt.id,action_key:'ui.act',cleanup_complete:true,effect_possible:true,output:state};
      }});
    await channel.observe({condition:'bound completion',ready:()=>true});
    await channel.act({verb,ref:'ui-button'});
    assert.equal(operation.deadline,65000);
  }
});
