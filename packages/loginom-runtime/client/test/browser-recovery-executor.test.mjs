import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchNodeApi } from '../lib/node-api.mjs';
import { createActionRuntime } from '../lib/executor.mjs';
import { NodeReleaseBlocked, releasePendingNode, verifyRecoveredPendingNode } from '../lib/node-pending-release.mjs';
import { createBrowserRecovery } from '../lib/browser-recovery.mjs';
import { createSerialGate } from '../lib/clipboard.mjs';
import { buildNodeReadRequest, nodeReadHandler, alignReadSchema } from '../lib/node-read-contract.mjs';
import { actions } from './support/executor-fixture.mjs';
import { compactNodeResult } from '../lib/user-results.mjs';
import { createExcelImportNodeSupport } from '../lib/imports-excel-node.mjs';
import { createJavascriptCodeNodeSupport } from '../lib/javascript-code-node.mjs';
import { createNodeReadDrivers } from '../lib/node-read-driver.mjs';
import { createTextImportNodeSupport } from '../lib/text-import-node.mjs';
import { createFilterNodeSupport } from '../lib/filter-node.mjs';
import { createCalculatorNodeSupport } from '../lib/calculator-node.mjs';
import { existingOutputExecution } from '../lib/node-execution-evidence.mjs';
import { createRedactor } from '../lib/redact.mjs';

const node = { document_id: 'doc', workflow_id: 'wf', node_id: 'new' };
const workflow = { workflow_id: 'wf', tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', prefix: 'MF;TF-1', navigation_path: [{ tid: 'path', label: 'Scenario' }] };
const graphOf = () => ({ complete: true, document_id: 'doc', workflow_ref: workflow,
  nodes: [{ ref: node, type: 'imports.text', label: 'Source', position: { x: 320, y: 280 }, inputs: [], outputs: [0] }], links: [], foreign_links: [] });
const request = (id = 'apply', target = { kind: 'new', type: 'imports.text', label: 'Source', position: { x: 320, y: 280 } }) => ({
  operation_id: id, contract_revision: '1.0.0', document_id: 'doc', workflow_ref: workflow, target, inputs: [], mode: 'delimited',
  parameters: {}, mappings: [], finish: 'execute', read: { ports: [], sample_rows: 0, require_exact_numbers: false },
  budgets: { configure_ms: 10000, execute_ms: 10000, total_ms: 30000 } });
const proved = () => ({ verified: true, cleanup_complete: true, effect_possible: true,
  node_context: { ...node, verified: true, surface: 'graph', locked: false }, graph: graphOf(),
  cleanup: { wizard_closed: false, read_view_restored: false, views_returned: false } });
const blocked = () => { throw new NodeReleaseBlocked('A Loginom wizard of this node is open', 'Ask the user to close it with Cancel.'); };

function fixture({ browserRecovery = true, release = blocked, releasePendingPhases, recoveryReleasePending,
  nodeType = 'imports.text', stopPhase = 'finish',now=Date.now } = {}) {
  const calls = [], events = [];
  const graph = { complete: true, document_id: 'doc', workflow_ref: workflow, nodes: [], links: [], foreign_links: [] };
  const adapter = { verifyWorkflow: async () => ({status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:false,document_id:'doc',workflow_ref:workflow}), observe: async () => { calls.push('graph'); return structuredClone(graph); }, preflight: async () => {},
    positionMatches: (n, p) => JSON.stringify(n.position) === JSON.stringify(p),
    reconcile: async () => ({ verified: true, cleanup_complete: true }),
    mutate: async e => { calls.push(e.kind); if (e.kind === 'create') graph.nodes.push({ ref: node, type: e.parameters.type, label: 'Source',
      position: e.parameters.position, inputs: [], outputs: [0] }); return { status: 'SUCCEEDED', cleanup_complete: true }; } };
  const ok = name => async () => { calls.push(name); if(name==='open'&&stopPhase==='open')throw Error('Managed wizard opening stopped'); return { verified: true, cleanup_complete: true, effect_possible: false }; };
  const state = { release, failFinish: stopPhase === 'finish' };
  const drivers = { verifySource: ok('source'), mapPorts: ok('mapping'), openWizard: ok('open'),
    finish: async mode => {
      calls.push('finish');
      if (state.receipt) state.receiptOptions('apply:finish', 'node.finish', 'signature');
      if (state.acceptExecute && mode === 'execute') state.acceptExecute(state.operation.id);
      if (state.failFinish) throw Error('Wizard Done was not confirmed');
      return { verified: true, cleanup_complete: true, mode, effect_possible: true, execution_id: 'exec', execution_started: true };
    },
    waitExecution: async () => ({ verified: true, cleanup_complete: true, status: 'completed', execution_id: 'exec' }),
    readOutput: async () => ({ verified: true, cleanup_complete: true, effect_possible: false, status: 'complete', execution_id: 'exec', evidence_ref: 'e', ports: [] }),
    verifyContinuation: async () => true,
    releasePending: async s => { calls.push('release:' + s.pending.phase); return state.release(s); },
    ...(releasePendingPhases ? { releasePendingPhases } : {}),
    ...(recoveryReleasePending ? { recoveryReleasePending } : {}) };
  const mode = nodeType === 'programming.javascript' ? 'script' : nodeType === 'imports.excel' ? 'xlsx' : nodeType === 'transform.filter_data' ? 'conditions' : nodeType === 'transform.calculator' ? 'expression' : 'delimited';
  const handler = { revision: '1', modes: [mode], validate: () => {}, configure: async () => {
    const result = await ok('configure')();
    if (stopPhase === 'configure' && state.receipt) state.receiptOptions('apply:configure', nodeType==='transform.filter_data'?'ui.act':'node.excel.configure.internal', 'signature');
    if (stopPhase === 'configure') throw Error('Managed source configuration stopped');
    return result;
  } };
  const runtime = createActionRuntime({ pinned: { actions, selectors: new Map(), pins: {} }, allowCandidate: true, browserRecovery,now,
    // Only the page receipt ledger is read through this transport.
    execute: async code => {
      if (state.transport && code.includes('node.apply.transport')) return {status:'SUCCEEDED',output:{value:await state.transport(code)}};
      if (!state.receipt || !code.includes('receipt_read')) throw Error('Unexpected public transport');
      const receipt = { status: stopPhase === 'configure' ? 'AMBIGUOUS' : 'SUCCEEDED',
        action_key: stopPhase === 'configure' ? (nodeType==='transform.filter_data'?'ui.act':'node.excel.configure.internal') : 'node.finish', action_revision: '1',
        operation_id: 'apply:' + stopPhase, phase: 'verified',
        effect_possible: true, output: {}, error: null, trace: [], cleanup_complete: state.receipt.cleanup };
      if ('operation_id' in state.receipt) receipt.operation_id = state.receipt.operation_id;
      if ('action_key' in state.receipt) receipt.action_key = state.receipt.action_key;
      return { status: 'SUCCEEDED', action_key: 'operation.receipt', action_revision: '1', operation_id: 'apply', phase: 'observed',
        effect_possible: false, error: null, trace: [], output: { state: state.receipt.state ?? 'completed', receipt } };
    },
    nodeTargetAdapterFactory: () => adapter, nodeApplyHandlers: new Map([['imports.text', handler],[nodeType, handler]]),
    nodeApplyDriverFactory: options => {
      state.receiptOptions = options.receiptOptions; state.operation = options.operation; state.readReceipt = options.readReceipt;
      if (options.operation.parameters.mode === 'read_existing_output' && nodeType === 'transform.filter_data')
        return createNodeReadDrivers(options,{targetOrigin:'http://test',targetBuild:'7.4.2'});
      if (options.operation.parameters.mode === 'read_existing_output' && state.readDriver) return { ...drivers, ...state.readDriver(options.operation) };
      if (nodeType === 'programming.javascript') {
        const js = createJavascriptCodeNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2',redactor:createRedactor()})
          .nodeApplyDriverFactory(options);
        drivers.releasePending = js.releasePending; drivers.releasePendingPhases = js.releasePendingPhases;
      }
      if (state.transport) {
        const support=nodeType==='imports.text'?createTextImportNodeSupport:nodeType==='transform.calculator'?createCalculatorNodeSupport:createFilterNodeSupport;
        const real=support({targetOrigin:'http://test',targetBuild:'7.4.2'}).nodeApplyDriverFactory(options);
        if(typeof real.recoveryChannel==='function')drivers.recoveryChannel=ctx=>({...real.recoveryChannel(ctx),observe:async ({ready})=>{
          const page={wizard:{status:'absent'},ui:{dialogs:[],masks:[]},prepared_node_context:{...node,verified:true,surface:'graph',locked:false}};
          assert.ok(ready(page));return page;
        }});
        if(drivers.recoveryChannel&&['transform.filter_data','transform.calculator'].includes(nodeType))drivers.recoveryReleasePending=(state,{signal,deadline})=>
          verifyRecoveredPendingNode({operation:options.operation,channel:drivers.recoveryChannel({...state.request,node:state.node,signal,deadline}),
            readReceipt:options.readReceipt,deadline,now:options.now});
      }
      return drivers;
    },
    onRecord: async e => { events.push(e); return state.ack ? state.ack(e) : e; } });
  return { runtime, calls, events, graph, state, request: (id, target) => ({...request(id, target), mode,
    target: {...request(id, target).target, type: nodeType}}) };
}

async function stopAtFinish(f, id = 'apply', target) {
  f.runtime.startNodeApply(f.request(id, target));
  const job = await f.runtime.waitNodeApply(id, { timeoutMs: 1000 });
  assert.equal(job.outcome.status, 'AMBIGUOUS');
  assert.equal(job.outcome.output.pending_phase, 'finish');
  return job;
}

async function recoverTable(change,{nodeType='transform.filter_data',stopPhase='configure',cache=true,badHandoff=false,lostBaseline=false}={}) {
  const controller=new AbortController();
  let clock=Date.now();
  const now=()=>clock;
  const f=fixture({nodeType,stopPhase,now}),ports=nodeType==='imports.text'||nodeType==='transform.calculator'?[0]:[0,1];
  const target={kind:'existing',type:nodeType,ref:node};
  f.graph.nodes.push({...graphOf().nodes[0],type:target.type,outputs:ports});
  const progress_state={verified:true,source:'native_progress_record',state:'completed'};
  const group = id => [{process_id:id,record_id:'group'+id,parent_id:null,children_loaded:true,state:'completed',error:false,progress_state},
    {process_id:id+'.1',record_id:'child'+id,parent_id:id,state:'completed',error:false,progress_state,
      owner:{verified:true,node_id:node.node_id,source:'native_process_model_identity'}}];
  const snapshot={verified:true,show_completed:true,inventory_complete:true,root_id:'root',node_context:{...node,verified:true,surface:'graph',locked:false},
    native_state:{active:true,running:false,locked:false},processes:group('1')};
  const schemas = [[{index:0,name:'Accepted',label:'Accepted',type:'integer'}],[{index:0,name:'Rejected',label:'Rejected',type:'integer'}]];
  const portReads=[];
  f.state.transport=code=>{
    if(code.includes('async function readNodeProcesses')){
      if(lostBaseline)throw Error('process history reply lost');
      return cache?structuredClone(snapshot):{verified:false,reason:'console_not_ready'};
    }
    if(code.includes('async function readNodePortOutput')){
      const native=existingOutputExecution(snapshot,node);
      const port=JSON.parse(code.match(/,({"port":\d+,"execution":.*?}),{"origin":/)[1]).port;
      assert.ok(code.includes('"process_record_id":"'+native.process_record_id+'"'));
      portReads.push(port);
      if(f.state.latePort===port)clock+=90001;
      return {verified:true,cleanup_complete:true,node_context:snapshot.node_context,output:{port,port_guid:'p'+port,fresh:true,
        freshness_basis:'completed_execution_port_source',execution_id:native.execution_id,schema:schemas[port],sample_rows:0,sample:[],sample_complete:true}};
    }
    throw Error('Unexpected native observation');
  };
  const req=f.request('apply',target);
  if(stopPhase==='configure')f.state.receipt={cleanup:false};
  if(nodeType==='transform.calculator')req.parameters={expressions:[]};
  if(nodeType==='imports.text')req.parameters={settings:{source:{encoding:'UTF-8'}},
    source:{artifact_id:'artifact',upload_operation_id:'upload',bytes:15,sha256:'a'.repeat(64)}};
  req.read.ports=ports;
  req.mappings=ports.map(port=>({direction:'output',port,fields:[{source:{kind:'configured_field',name:'Id'},name:schemas[port][0].name}]}));
  const support=nodeType==='imports.text'?createTextImportNodeSupport:nodeType==='transform.calculator'?createCalculatorNodeSupport:createFilterNodeSupport;
  support({}).nodeApplyHandlers.get(nodeType).validate(req.parameters,req.mode,req);
  f.runtime.startNodeApply(req);
  assert.equal((await f.runtime.waitNodeApply('apply',{timeoutMs:1000})).outcome.output.pending_phase,stopPhase);
  await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release'});
  const recovery=createBrowserRecovery({enabled:true,gate:createSerialGate(),executor:f.runtime,now,probe:async()=>({ok:true}),
    record:async e=>{f.events.push(e);return badHandoff&&e.phase==='browser_recovery_handoff'?{...e,proof:null}:e;},browser:{callTool:async()=>{change({snapshot,group,schemas,state:f.state,controller});return {content:[]};}}});
  const body=async args=>JSON.parse((await recovery.call('dock_browser_recovery',{operation_id:'apply',...args},{signal:controller.signal})).content[0].text);
  const started=await body({action:'start'});
  if(lostBaseline)return {f,end:started};
  assert.equal(started.phase,'browser');
  await recovery.call('browser_click',{element:'Complete',ref:'done'});
  f.state.release=()=>({...proved(),graph:{nodes:f.graph.nodes,links:[],foreign_links:[]}});
  return {f,portReads,snapshot,end:await body({action:'finish',actions_performed:['Completed settings']})};
}

test('recovery verifies the fresh filter process and both requested output schemas before release',async()=>{
  const {f,portReads,end}=await recoverTable(({snapshot,group})=>snapshot.processes.push(...group('2')));
  assert.equal(end.phase,'dock');
  assert.equal(end.verification.recovered_output?.execution.execution_id,'doc:root:2');
  assert.deepEqual(end.verification.recovered_output.ports.map(p=>p.schema[0].name),['Accepted','Rejected']);
  assert.deepEqual(portReads,[0,1]);
  assert.deepEqual(end.verification.original_operation,{operation_id:'apply',status:'FAILED',phase:'node_released',
    configuration:{status:'unknown'},execution:{status:'not_requested',execution_id:null}});
  assert.equal(f.calls.filter(c=>c==='configure').length,1);
  assert.ok(!f.calls.includes('finish'));
  const phases=f.events.map(e=>e.phase);
  assert.deepEqual(f.events.find(e=>e.phase==='browser_recovery_handoff').proof.execution_baseline.roots,
    [{process_id:'1',record_id:'group1',completed:true}]);
  assert.ok(phases.lastIndexOf('node_port_output_read')>=0&&phases.lastIndexOf('node_port_output_read')<phases.indexOf('node_operation_released'));
  assert.ok(phases.indexOf('browser_recovery_receipt')<phases.indexOf('operation_abandoned'));
});

test('the old active filter output stays readable without confirming recovery or authorizing Execute',async()=>{
  const {f,portReads,end}=await recoverTable(()=>{});
  assert.equal(end.phase,'dock');
  assert.equal(end.verification.recovered_output,null);
  assert.deepEqual(portReads,[]);
  assert.equal(end.verification.next_step.tool,'dock_node_read');
  assert.match(end.verification.next_step.instruction,/fresh execution.*not verified/);
  const source=end.verification.receipt_id;
  await dispatchNodeApi(f.runtime,'dock_node_read',{operation_id:'current',source_operation_id:source});
  const read=await dispatchNodeApi(f.runtime,'dock_node_wait',{operation_id:'current',timeout_ms:1000});
  assert.equal(read.outcome.status,'SUCCEEDED',JSON.stringify(read.outcome.error));
  assert.equal(read.outcome.output.execution.execution_id,'doc:root:1');
  for(const source_operation_id of [source,'current'])await assert.rejects(
    dispatchNodeApi(f.runtime,'dock_node_read',{operation_id:'repeat',source_operation_id,execution:'execute'}),/Cannot execute/);
  assert.equal(f.calls.filter(c=>c==='configure').length,1);
  assert.ok(!f.calls.includes('finish'));
});

test('a mismatched second filter port retains only the quiet-graph recovery facts',async()=>{
  const {portReads,end}=await recoverTable(({snapshot,group,schemas})=>{
    snapshot.processes.push(...group('2'));schemas[1][0].name='OldField';
  });
  assert.deepEqual(portReads,[0,1]);
  assert.equal(end.verification.recovered_output,null);
  assert.deepEqual(end.verification.facts,['node_released_on_quiet_graph','no_wizard_dialog_or_mask']);
});

test('a different durable schema acknowledgement leaves the original recovery ownership unsettled',async()=>{
  const {f,portReads,end}=await recoverTable(({snapshot,group,state})=>{
    snapshot.processes.push(...group('2'));
    state.ack=e=>e.phase==='browser_recovery_receipt'?{...e,receipt:{...e.receipt,recovered_output:null}}:e;
  });
  assert.deepEqual(portReads,[0,1]);
  assert.equal(end.verification.status,'unresolved');
  assert.match(end.verification.reason,/acknowledgement differs/);
  assert.equal(f.runtime.hasUnsettledWork(),true);
  assert.ok(!f.events.some(e=>e.phase==='operation_abandoned'));
});

test('cancellation during recovery receipt writing retains the lease after all port reads',async()=>{
  const {f,end}=await recoverTable(({snapshot,group,state,controller})=>{
    snapshot.processes.push(...group('2'));
    state.ack=e=>{if(e.phase==='browser_recovery_receipt')controller.abort();return e;};
  });
  assert.equal(end.verification.status,'unresolved');
  assert.equal(f.runtime.hasUnsettledWork(),true);
  assert.ok(!f.events.some(e=>e.phase==='operation_abandoned'));
});

test('a calculator stopped in configure verifies its new execution and does not return to configure',async()=>{
  const {f,end}=await recoverTable(({snapshot,group})=>snapshot.processes.push(...group('2')),
    {nodeType:'transform.calculator',stopPhase:'configure'});
  assert.equal(end.verification.recovered_output?.execution.execution_id,'doc:root:2');
  assert.deepEqual(end.verification.recovered_output.ports.map(p=>p.port),[0]);
  assert.equal(end.verification.next_step.tool,'dock_node_read');
  assert.match(end.verification.next_step.instruction,/new execution/);
  assert.doesNotMatch(end.verification.next_step.instruction,/complete intended settings/);
  assert.equal(f.calls.filter(c=>c==='configure').length,1);
  assert.ok(!f.calls.includes('finish'));
});

test('a text import stopped in open verifies its requested port without entering configure',async()=>{
  const {f,portReads,end}=await recoverTable(({snapshot,group})=>snapshot.processes.push(...group('2')),
    {nodeType:'imports.text',stopPhase:'open'});
  assert.equal(end.verification.recovered_output?.execution.execution_id,'doc:root:2');
  assert.deepEqual(portReads,[0]);
  assert.ok(!f.calls.includes('configure')&&!f.calls.includes('finish'));
});

for(const scenario of ['missing cache','foreign child','two new groups','changed root'])test('table recovery rejects '+scenario,async()=>{
  const {end,portReads}=await recoverTable(({snapshot,group})=>{
    const next=group('2');snapshot.processes.push(...next);
    if(scenario==='foreign child')next[1].owner.node_id='foreign';
    if(scenario==='two new groups')snapshot.processes.push(...group('3'));
    if(scenario==='changed root')snapshot.root_id='replacement';
  },{cache:scenario!=='missing cache'});
  assert.equal(end.phase,'dock');
  assert.equal(end.verification.recovered_output,null);
  assert.deepEqual(portReads,[]);
});

test('a late second port response retains the original phase and cannot publish fresh output',async()=>{
  const {f,end}=await recoverTable(({snapshot,group,state})=>{snapshot.processes.push(...group('2'));state.latePort=1;});
  assert.equal(end.verification.status,'unresolved');
  assert.equal(f.runtime.nodeApplyStatus('apply').outcome.output.pending_phase,'configure');
  assert.ok(!f.events.some(e=>['browser_recovery_receipt','node_operation_released'].includes(e.phase)));
});

test('a lost process-history read does not open the browser',async()=>{
  const {f,end}=await recoverTable(()=>assert.fail('browser opened after a lost history read'),{lostBaseline:true});
  assert.notEqual(end.phase,'browser');
  assert.match(JSON.stringify(end),/process history reply lost/);
  assert.equal(f.runtime.nodeApplyStatus('apply').outcome.output.pending_phase,'configure');
  assert.equal(f.runtime.hasUnsettledWork(),true);
});

test('a mismatched handoff acknowledgement cannot admit the browser with an unrecorded baseline',async()=>{
  await assert.rejects(recoverTable(()=>assert.fail('Browser received unconfirmed handoff'),{badHandoff:true}),/handoff.*acknowledgement differs/);
});

test('terminal Excel configure hands off without cleanup and finishes only after fresh native quiet proof', async () => {
  let wizard = true, observations = 0;
  const channel = { observe: async ({ready}) => {
    observations++;
    const value = {wizard: {status: wizard ? 'observed' : 'absent'},
      prepared_node_context: {...node, verified: true, surface: wizard ? 'wizard' : 'graph', locked: false},
      ui: {dialogs: [], masks: []}};
    if (!ready(value)) throw Error('Node procedure readiness timeout');
    return value;
  }, perform: async () => assert.fail('Recovery verifier must not perform a gesture') };
  const f = fixture({nodeType: 'imports.excel', stopPhase: 'configure',
    release: () => releasePendingNode({operation: f.state.operation, channel, readReceipt: f.state.readReceipt}),
    recoveryReleasePending: () => verifyRecoveredPendingNode({operation: f.state.operation, channel, readReceipt: f.state.readReceipt})});
  f.state.receipt = {cleanup: false};
  f.runtime.startNodeApply(f.request('apply'));
  const job = await f.runtime.waitNodeApply('apply', {timeoutMs: 1000});
  assert.equal(job.outcome.output.pending_phase, 'configure');
  assert.equal(job.outcome.output.execution.status, 'not_requested');
  const graphReads = f.calls.filter(c => c === 'graph').length;
  assert.equal((await f.runtime.recover('apply', {strategy: 'abandon_operation', recoveryOperationId: 'release-1'})).error.code,
    'NODE_RELEASE_REFUSED');
  assert.equal(observations, 0);
  assert.equal(f.calls.filter(c => c === 'graph').length, graphReads);
  const recovery = createBrowserRecovery({enabled: true, gate: createSerialGate(), executor: f.runtime,
    probe: async () => ({ok: true}), record: async event => {f.events.push(event); return event;},
    browser: {callTool: async () => {wizard = false; return {content: [{type: 'text', text: 'Cancelled own wizard'}]};}}});
  const body = reply => JSON.parse(reply.content[0].text);
  assert.equal(body(await recovery.call('dock_browser_recovery', {action: 'start', operation_id: 'apply'})).phase, 'browser');
  assert.deepEqual(f.events.find(e => e.phase === 'browser_recovery_handoff').proof,
    {receipt_id: 'apply:configure', receipt_state: 'completed', cleanup_complete: false});
  const finish = () => recovery.call('dock_browser_recovery', {action: 'finish', operation_id: 'apply', actions_performed: ['Cancelled wizard']});
  const unresolved = body(await finish());
  assert.equal(unresolved.verification.status, 'unresolved');
  assert.equal(unresolved.phase, 'browser');
  assert.equal(f.calls.filter(c => c === 'graph').length, graphReads);
  assert.equal(recovery.refusesDock('dock_node_apply'), true);
  assert.throws(() => f.runtime.startNodeApply(f.request('other')), /Browser recovery holds/);
  assert.equal((await recovery.call('browser_click', {element: 'Cancel', ref: 'cancel'})).isError, undefined);
  const fresh = observations;
  const verified = body(await finish());
  assert.equal(verified.verification.status, 'continuable');
  assert.equal(verified.phase, 'dock');
  assert.equal(observations - fresh, 2);
  assert.equal(f.calls.filter(c => c === 'graph').length - graphReads, 2);
  assert.equal(f.state.receipt.cleanup, false);
  const outcome = f.runtime.nodeApplyStatus('apply').outcome;
  assert.equal(outcome.status, 'FAILED');
  assert.equal(outcome.output.configuration.status, 'unknown');
  assert.equal(outcome.output.execution.status, 'not_requested');
  assert.equal(outcome.output.package_saved, false);
  assert.deepEqual(f.events.find(e => e.phase === 'node_operation_released').receipt.proof.cleanup,
    {wizard_closed: false, read_view_restored: false, views_returned: false});
  const phases = f.events.map(e => e.phase);
  assert.ok(phases.indexOf('browser_recovery_receipt') < phases.indexOf('operation_abandoned'));
  assert.equal(f.calls.filter(c => c === 'configure').length, 1);
  assert.equal(f.calls.includes('finish'), false);
  assert.equal(f.runtime.hasUnsettledWork(), false);
});

test('Excel inherits the recovery-only release verifier without dispatching an uncertain browser call',async()=>{
 const operation={transportUncertain:true,nodeApply:{node,pending:{phase:'configure'},
  request:{document_id:'doc',workflow_ref:workflow}}};
 const drivers=createExcelImportNodeSupport({}).nodeApplyDriverFactory({operation,now:()=>1,
  execute:async()=>assert.fail('Unconfirmed transport cannot read or mutate the browser')});
 await assert.rejects(drivers.recoveryReleasePending(operation.nodeApply),/last browser call has not confirmed completion/);
});

test('T1: a refused release points to browser recovery instead of asking the user', async () => {
  const f = fixture();
  await stopAtFinish(f);
  const refused = await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  assert.equal(refused.error.code, 'NODE_RELEASE_REFUSED');
  assert.equal(refused.output.user_action, undefined);
  assert.equal(refused.output.ui_blocker, 'Ask the user to close it with Cancel.');
  assert.deepEqual(refused.output.next_step.arguments, { action: 'start', operation_id: 'apply' });
  assert.equal(refused.output.next_step.reason, 'NODE_RELEASE_REFUSED');
  const advice = (await f.runtime.inspect({ operationId: 'apply' })).output;
  assert.equal(advice.next_steps[0].tool, 'dock_browser_recovery');
  const basis = f.runtime.browserRecoveryBasis('apply');
  assert.equal(basis.reason, 'NODE_RELEASE_REFUSED');
  assert.equal(basis.step.key, 'node|doc|wf|new|finish');
  assert.equal(basis.goal.ui_blocker, 'Ask the user to close it with Cancel.');
});

test('without the capability the existing user_action contract is unchanged', async () => {
  const f = fixture({ browserRecovery: false });
  await stopAtFinish(f);
  const refused = await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  assert.equal(refused.output.user_action, 'Ask the user to close it with Cancel.');
  assert.equal(refused.output.next_step, undefined);
  assert.throws(() => f.runtime.browserRecoveryBasis('apply'), /unavailable/);
  assert.equal((await f.runtime.inspect({ operationId: 'apply' })).output.next_steps.some(s => s.tool === 'dock_browser_recovery'), false);
});

test('Dock recovery comes first: an available release is not a trigger', async () => {
  const f = fixture({ release: proved });
  await stopAtFinish(f);
  const advice = (await f.runtime.inspect({ operationId: 'apply' })).output;
  assert.deepEqual(advice.recovery_options, ['abandon_operation']);
  assert.equal(advice.next_steps.some(s => s.tool === 'dock_browser_recovery'), false);
  assert.throws(() => f.runtime.browserRecoveryBasis('apply'), /No browser recovery trigger/);
});

test('T2: a dedicated browser release verifier permits phases outside native release', async () => {
  const f = fixture({ release: blocked, releasePendingPhases: ['read'], recoveryReleasePending: proved });
  await stopAtFinish(f);
  const advice = (await f.runtime.inspect({ operationId: 'apply' })).output;
  assert.deepEqual(advice.recovery_options, []);
  assert.equal(advice.browser_recovery, 'NO_RECOVERY_OPTION');
  assert.equal(advice.next_steps[0].tool, 'dock_browser_recovery');
  assert.equal(f.runtime.browserRecoveryBasis('apply').reason, 'NO_RECOVERY_OPTION');
  const basis = f.runtime.browserRecoveryBasis('apply');
  assert.equal((await f.runtime.browserRecoveryHandoff('apply')).stopped, true);
  assert.equal((await f.runtime.verifyBrowserRecovery({operationId:'apply',step:basis.step,
    attested:{actions_performed:['Returned to graph']}})).status, 'continuable');
  assert.equal(f.calls.some(call => call.startsWith('release:')), false);
});

test('JavaScript finish cannot offer or hand off browser recovery outside its real release phases', async () => {
  const f = fixture({nodeType:'programming.javascript'});
  await stopAtFinish(f);
  const advice = (await f.runtime.inspect({operationId:'apply'})).output;
  assert.deepEqual(advice.recovery_options, []);
  assert.equal(advice.browser_recovery, undefined);
  assert.equal(advice.next_steps.some(step => step.tool === 'dock_browser_recovery'), false);
  assert.throws(() => f.runtime.browserRecoveryBasis('apply'), /No browser recovery trigger/);
  assert.equal(f.calls.some(call => call.startsWith('release:')), false);
  assert.equal(f.runtime.hasUnsettledWork(), true);
  assert.equal(f.runtime.nodeApplyStatus('apply').outcome.output.pending_phase, 'finish');
});

test('JavaScript configure still offers browser recovery after its native release is refused', async () => {
  const f = fixture({nodeType:'programming.javascript',stopPhase:'configure'});
  f.runtime.startNodeApply(f.request('apply'));
  const stopped = await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
  assert.equal(stopped.outcome.output.pending_phase,'configure');
  assert.deepEqual((await f.runtime.inspect({operationId:'apply'})).output.recovery_options,['abandon_operation']);
  const refused = await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  assert.equal(refused.error.code,'NODE_RELEASE_REFUSED');
  assert.equal(refused.output.next_step.tool,'dock_browser_recovery');
  assert.equal(refused.output.next_step.reason,'NODE_RELEASE_REFUSED');
  assert.equal(f.runtime.browserRecoveryBasis('apply').step.phase,'configure');
});

test('the lease blocks Dock mutations; verification releases on proof and writes a receipt first', async () => {
  const f = fixture();
  await stopAtFinish(f);
  await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  const basis = f.runtime.browserRecoveryBasis('apply');
  const handoff = await f.runtime.browserRecoveryHandoff('apply');
  assert.equal(handoff.stopped, true);
  assert.throws(() => f.runtime.startNodeApply(request('other')), /Browser recovery holds the page/);
  await assert.rejects(f.runtime.run('package.save_checkpoint', { path: '/user/a.lgp', conflict_policy: 'replace' }, { operationId: 's' }),
    /Browser recovery holds the page/);
  assert.equal(f.runtime.nodeApplyStatus('apply').outcome.status, 'AMBIGUOUS');
  assert.equal(f.runtime.hasUnsettledWork(), true);

  // The wizard is still open: verification refuses and the lease stays with the browser phase.
  const unresolved = await f.runtime.verifyBrowserRecovery({ operationId: 'apply', step: basis.step, attested: { actions_performed: ['none'] } });
  assert.equal(unresolved.status, 'unresolved');
  assert.match(unresolved.reason, /wizard/);
  assert.throws(() => f.runtime.startNodeApply(request('other')), /Browser recovery holds the page/);

  f.state.release = proved;
  const verified = await f.runtime.verifyBrowserRecovery({ operationId: 'apply', step: basis.step,
    attested: { actions_performed: ['Clicked Cancel in the wizard'] } });
  assert.equal(verified.status, 'continuable');
  assert.equal(verified.receipt_id, 'apply:br1');
  assert.equal(verified.next_step.tool, 'dock_node_apply');
  assert.match(verified.next_step.instruction, /"kind":"existing"/);
  assert.equal(verified.original_operation.status, 'FAILED');
  const phases = f.events.map(e => e.phase);
  assert.ok(phases.indexOf('browser_recovery_receipt') < phases.lastIndexOf('operation_abandoned'));
  const receipt = f.events.find(e => e.phase === 'browser_recovery_receipt').receipt;
  assert.deepEqual(receipt.attested_by_model, { actions_performed: ['Clicked Cancel in the wizard'] });
  assert.equal(f.runtime.hasUnsettledWork(), false);
  f.runtime.assertPreparationAllowed();
  // Exact redelivery of the original request reports its failure and the linked recovery.
  const redelivered = f.runtime.nodeApplyStatus('apply').outcome.output;
  assert.deepEqual(redelivered.browser_recovery, { receipt_id: 'apply:br1', status: 'continuable',
    facts: ['node_released_on_quiet_graph', 'no_wizard_dialog_or_mask'] });
  assert.equal(compactNodeResult(f.runtime.nodeApplyStatus('apply')).browser_recovery.receipt_id, 'apply:br1');
});

test('T3: public finish offers only an existing-output read after repeated failure with unknown execution', async () => {
  const f = fixture();
  const accepted = [];
  f.state.acceptExecute = id => accepted.push(id);
  await stopAtFinish(f);
  await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  const first = f.runtime.browserRecoveryBasis('apply');
  await f.runtime.browserRecoveryHandoff('apply');
  f.state.release = proved;
  await f.runtime.verifyBrowserRecovery({ operationId: 'apply', step: first.step, attested: { actions_performed: ['Closed wizard'] } });

  // Dock continues over the existing node; the broken finish predicate fails again.
  f.state.release = () => { throw Error('Release verifier unavailable for this surface'); };
  const stopped = await stopAtFinish(f, 'apply-2', { kind: 'existing', type: 'imports.text', ref: node });
  assert.equal(stopped.outcome.output.execution.status, 'not_requested');
  const previous = (await f.runtime.inspect({ operationId: 'apply' })).output;
  assert.equal(previous.next_steps.some(step => step.tool === 'dock_browser_recovery'), false);
  assert.throws(() => f.runtime.browserRecoveryBasis('apply'), /No browser recovery trigger/);
  const advice = (await f.runtime.inspect({ operationId: 'apply-2' })).output;
  assert.equal(advice.browser_recovery, 'REPEATED_PHASE_FAILURE');
  const recovery = createBrowserRecovery({ enabled: true, gate: createSerialGate(), executor: f.runtime,
    probe: async () => ({ ok: true }), record: async event => event });
  const call = async args => JSON.parse((await recovery.call('dock_browser_recovery', args)).content[0].text);
  const started = await call({ action: 'start', operation_id: 'apply-2' });
  assert.equal(started.phase, 'browser');
  assert.equal(started.operation_id, 'apply-2');
  assert.equal(started.reason, 'REPEATED_PHASE_FAILURE');
  assert.equal(started.step.key, first.step.key);
  assert.deepEqual(started.goal.node, node);
  assert.equal(started.goal.stopped_phase, 'finish');
  assert.equal(started.goal.requested_finish, 'execute');
  assert.match(started.goal.required_result, /leave this node unlocked on the quiet graph/i);
  assert.match(started.goal.required_result, /do not click execute/i);
  assert.match(started.goal.required_result, /original execution may already have started/i);
  assert.doesNotMatch(started.goal.required_result, /settings and ports completed|and the node executed/i);
  assert.match(started.instruction, /current Loginom tab/);
  assert.equal(recovery.refusesDock('dock_node_apply'), true);
  f.state.release = proved;
  const finished = await call({ action: 'finish', operation_id: 'apply-2', actions_performed: ['Returned to the scenario graph'] });
  const verified = finished.verification;
  assert.equal(finished.phase, 'dock');
  assert.equal(verified.status, 'continuable');
  assert.equal(verified.original_operation.operation_id, 'apply-2');
  assert.equal(verified.original_operation.status, 'FAILED');
  assert.deepEqual(verified.original_operation.configuration, { status: 'unknown' });
  assert.deepEqual(verified.original_operation.execution, { status: 'unknown', execution_id: null });
  assert.deepEqual(verified.facts, ['node_released_on_quiet_graph', 'no_wizard_dialog_or_mask']);
  assert.equal(verified.next_step.tool, 'dock_node_read');
  assert.equal(verified.next_step.original_operation_id, 'apply-2');
  assert.equal(verified.receipt_id, 'apply-2:br2');
  assert.equal(f.runtime.nodeApplyStatus('apply-2').outcome.output.browser_recovery.receipt_id, verified.receipt_id);
  assert.equal(recovery.refusesDock('dock_node_apply'), false);
  assert.equal(f.runtime.hasUnsettledWork(), false);
  assert.match(verified.next_step.instruction, /NEW operation_id and source_operation_id:"apply-2:br2"/);
  assert.doesNotMatch(verified.next_step.instruction, /\bexecute\b|fresh execution|step was completed/i);
  assert.match(verified.next_step.instruction, /read an already active result or wait for an already running execution/i);

  assert.deepEqual(accepted, ['apply', 'apply-2']);
  const explicit = source => dispatchNodeApi(f.runtime, 'dock_node_read', {
    operation_id: 'explicit', source_operation_id: source, execution: 'execute' });
  const readDrivers = [];
  f.state.readDriver = operation => {
    readDrivers.push(operation.id);
    const execution_id = operation.parameters.finish === 'execute' ? 'fresh-' + operation.id : 'old-active';
    const proof = { verified: true, cleanup_complete: true, execution_id };
    return {
      finishGraph: async mode => {
        if (mode === 'execute') accepted.push(operation.id);
        return { ...proof, mode, settings_applied: false, execution_started: mode === 'execute' };
      },
      waitExecution: async () => ({ ...proof, status: 'completed' }),
      readOutput: async () => ({ ...proof, status: 'complete', evidence_ref: 'read',
        ports: [{ port: 0, fresh: true, schema: [{ index: 0, name: 'Id', label: 'Id', type: 'integer' }] }] }),
    };
  };
  const refuse = async (source, reason) => {
    const count = readDrivers.length;
    await assert.rejects(explicit(source), reason);
    await assert.rejects(dispatchNodeApi(f.runtime, 'dock_node_status', { operation_id: 'explicit' }), /Unknown node operation/);
    assert.equal(readDrivers.length, count);
    assert.deepEqual(accepted, ['apply', 'apply-2']);
  };
  await refuse(verified.receipt_id, /unknown execution/i);
  let source = verified.receipt_id;
  for (const id of ['current-1', 'current-2', 'current-3', verified.receipt_id]) {
    await dispatchNodeApi(f.runtime, 'dock_node_read', { operation_id: id, source_operation_id: source });
    const { outcome, error } = await dispatchNodeApi(f.runtime, 'dock_node_wait', { operation_id: id, timeout_ms: 1000 });
    assert.equal(error, null);
    assert.equal(outcome.status, 'SUCCEEDED', JSON.stringify(outcome));
    assert.deepEqual(outcome.output.node, node);
    assert.equal(outcome.output.execution.execution_id, 'old-active');
    assert.equal(outcome.cleanup_complete, true);
    source = id;
    await refuse(source, id === verified.receipt_id ? /ambiguous/i : /unknown execution/i);
  }

  const read = buildNodeReadRequest({ operation_id: 'reread', source_operation_id: 'apply-2:br2' },
    f.events.find(e => e.phase === 'browser_recovery_receipt' && e.receipt.id === 'apply-2:br2').receipt);
  assert.deepEqual(read.parameters, { source_operation_id: 'apply-2:br2', execution_policy: 'existing', observed_schema: true, schemas: [{ port: 0, schema: null }] });
  assert.deepEqual(read.target, { kind: 'existing', type: 'imports.text', ref: node });
  const reader = nodeReadHandler({ revision: '1', modes: ['delimited'] });
  reader.validate(read.parameters, 'read_existing_output', read);
  assert.throws(() => reader.validate({ ...read.parameters, observed_schema: false }, 'read_existing_output', read), /schema/);
});

test('T3: public start keeps settings and ports guidance for a stopped configure', async () => {
  const f = fixture({ stopPhase: 'configure' });
  const recovery = createBrowserRecovery({ enabled: true, gate: createSerialGate(), executor: f.runtime,
    probe: async () => ({ ok: true }), record: async event => event });
  const call = async args => JSON.parse((await recovery.call('dock_browser_recovery', args)).content[0].text);
  f.runtime.startNodeApply(f.request('apply'));
  await f.runtime.waitNodeApply('apply', { timeoutMs: 1000 });
  await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  assert.equal((await call({ action: 'start', operation_id: 'apply' })).reason, 'NODE_RELEASE_REFUSED');
  f.state.release = proved;
  assert.equal((await call({ action: 'finish', operation_id: 'apply', actions_performed: ['Returned to the scenario graph'] })).phase, 'dock');

  f.runtime.startNodeApply(f.request('apply-2', { kind: 'existing', type: 'imports.text', ref: node }));
  await f.runtime.waitNodeApply('apply-2', { timeoutMs: 1000 });
  const started = await call({ action: 'start', operation_id: 'apply-2' });
  assert.equal(started.phase, 'browser');
  assert.equal(started.reason, 'REPEATED_PHASE_FAILURE');
  assert.deepEqual(started.goal.node, node);
  assert.equal(started.goal.stopped_phase, 'configure');
  assert.equal(started.goal.requested_finish, 'execute');
  assert.match(started.goal.required_result, /settings and ports .*original request.*returning to the graph/i);
  assert.match(started.goal.required_result, /leave this node unlocked on the quiet graph/i);
  assert.doesNotMatch(started.goal.required_result, /\bexecute|already started/i);
  assert.equal((await call({ action: 'finish', operation_id: 'apply-2', actions_performed: ['Returned to the scenario graph'] })).phase, 'dock');
});

test('an observed-schema read accepts the fresh schema and still refuses ambiguity', () => {
  const columns = [{ index: 0, name: 'Id', label: 'Id', type: 'integer' }, { index: 1, name: 'Sum', label: 'Sum', type: 'real' }];
  assert.deepEqual(alignReadSchema(columns, null), columns);
  assert.throws(() => alignReadSchema([...columns, { index: 2, name: 'Id', label: 'Id2', type: 'integer' }], null), /ambiguous/);
  assert.throws(() => alignReadSchema([], null), /empty/);
});

test('unconfirmed calls are never a trigger and stop keeps the original gate', async () => {
  const f = fixture();
  await stopAtFinish(f);
  await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  await f.runtime.browserRecoveryHandoff('apply');
  const stopped = await f.runtime.stopBrowserRecovery({ operationId: 'apply' });
  assert.equal(stopped.state, 'retained');
  assert.equal((await f.runtime.inspect({ operationId: 'apply' })).output.state, 'pending');
  assert.throws(() => f.runtime.assertPreparationAllowed(), /uncertain/);
  assert.equal(f.runtime.hasUnsettledWork(), true);
});

function exportFixture() {
  const events = [], reads = [];
  const graph = { complete: true, document_id: 'doc', workflow_ref: workflow, nodes: [], links: [], foreign_links: [] };
  const adapter = { observe: async () => structuredClone(graph), preflight: async () => {},
    positionMatches: (n, p) => JSON.stringify(n.position) === JSON.stringify(p),
    reconcile: async () => ({ verified: true, cleanup_complete: true }),
    mutate: async e => { if (e.kind === 'create') graph.nodes.push({ ref: node, type: e.parameters.type, label: 'Export',
      position: e.parameters.position, inputs: [], outputs: [] }); return { status: 'SUCCEEDED', cleanup_complete: true }; } };
  const ok = async () => ({ verified: true, cleanup_complete: true, effect_possible: false });
  let operationRef;
  const refusal = operationId => Object.assign(Error('Download was not confirmed'), { nodePhaseRefusal: { phase: 'read', status: 'FAILED',
    effect_possible: true, cleanup_complete: true, settings_unchanged: true, verification: 'text_export_read_refused_restored',
    proof: { navigation_only: true, operation_id: operationId, lease_released: true,
      binding: { ...node, execution_id: 'exec', destination: '/user/out.csv', session_id: 'out' },
      restored: { verified: true, cleanup_complete: true, quiet: true, node_context: { ...node, verified: true, surface: 'graph', locked: false } } } } });
  const drivers = { verifySource: ok, mapPorts: ok, openWizard: ok,
    finish: async mode => ({ verified: true, cleanup_complete: true, mode, effect_possible: true, execution_id: 'exec', execution_started: true }),
    waitExecution: async () => ({ verified: true, cleanup_complete: true, status: 'completed', execution_id: 'exec' }),
    readOutput: async () => { operationRef.cleanupConfirmed = true; throw refusal(operationRef.id); },
    verifyContinuation: async () => true,
    releasePending: async () => { throw Error('not used'); },
    recoveryReadExport: async state => { reads.push(state.node.node_id);
      return { artifact_id: 'file-1', destination: '/user/out.csv', bytes: 42, sha256: 'a'.repeat(64), execution_id: 'exec' }; } };
  const handler = { revision: '1', fileOutput: true, modes: ['delimited'], validate: () => {}, configure: ok };
  const runtime = createActionRuntime({ pinned: { actions, selectors: new Map(), pins: {} }, allowCandidate: true, browserRecovery: true,
    execute: async () => { throw Error('Unexpected public transport'); },
    nodeTargetAdapterFactory: () => adapter, nodeApplyHandlers: new Map([['exports.text', handler]]),
    nodeApplyDriverFactory: ({ operation }) => { operationRef = operation; return drivers; },
    onRecord: async e => { events.push(e); return e; } });
  return { runtime, events, reads };
}

test('T4: an unconfirmed export download is recovered by a verified re-read without a new export', async () => {
  const { runtime, reads } = exportFixture();
  runtime.startNodeApply({ ...request('export'), target: { kind: 'new', type: 'exports.text', label: 'Export', position: { x: 320, y: 280 } } });
  const job = await runtime.waitNodeApply('export', { timeoutMs: 1000 });
  assert.equal(job.outcome.status, 'FAILED', JSON.stringify(job.outcome.error));
  assert.equal(job.outcome.output.next_step.tool, 'dock_browser_recovery');
  assert.equal(job.outcome.output.next_step.alternative_next_step.tool, 'dock_action_run');
  const basis = runtime.browserRecoveryBasis('export');
  assert.equal(basis.reason, 'EXPORT_DOWNLOAD_UNCONFIRMED');
  assert.equal((await runtime.browserRecoveryHandoff('export')).stopped, true);
  const verified = await runtime.verifyBrowserRecovery({ operationId: 'export', step: basis.step, attested: { actions_performed: ['Closed a dialog'] } });
  assert.equal(verified.status, 'completed');
  assert.deepEqual(verified.facts, ['export_file_storage_row_observed', 'export_file_bytes_verified']);
  assert.equal(verified.file_artifacts[0].sha256, 'a'.repeat(64));
  assert.deepEqual(reads, ['new']);
  assert.throws(() => runtime.browserRecoveryBasis('export'), /No browser recovery trigger/);
  const settled = runtime.nodeApplyStatus('export').outcome;
  assert.equal(settled.status, 'FAILED');
  assert.equal(settled.output.browser_recovery.file_artifacts[0].sha256, 'a'.repeat(64));
  assert.equal(settled.output.next_step.tool, 'dock_action_run');
});

test('handoff proves callback completion independently from UI cleanup', async () => {
  for (const cleanup of [false, true]) {
    const f = fixture();
    f.state.receipt = { cleanup };
    await stopAtFinish(f);
    await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
    const handoff = await f.runtime.browserRecoveryHandoff('apply');
    assert.equal(handoff.stopped, true, JSON.stringify(handoff));
    assert.equal(handoff.proof.cleanup_complete, cleanup);
  }
});

for (const identity of [{ operation_id: null }, { operation_id: 'foreign:step' }, { action_key: 'foreign.action' }]) {
  test('handoff refuses a cleaned-up receipt with a missing or foreign identity: ' + JSON.stringify(identity), async () => {
    const f = fixture();
    f.state.receipt = { cleanup: true, ...identity };
    await stopAtFinish(f);
    await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
    await assert.rejects(f.runtime.browserRecoveryHandoff('apply'), /different identity/);
    assert.equal(f.runtime.hasUnsettledWork(), true);
    assert.throws(() => f.runtime.assertPreparationAllowed(), /pending|uncertain/);
  });
}

test('terminal Excel configure cannot hand off an unsettled, foreign or transport-uncertain receipt', async () => {
  for (const fault of [{state: 'running'}, {state: 'unknown'}, {state: 'missing'}, {state: 'identity_mismatch'},
    {operation_id: null}, {operation_id: 'foreign:configure'}, {action_key: 'foreign.action'}, {transportUncertain: true}]) {
    const f = fixture({nodeType: 'imports.excel', stopPhase: 'configure'});
    f.state.receipt = {cleanup: false, ...fault};
    f.runtime.startNodeApply(f.request('apply'));
    await f.runtime.waitNodeApply('apply', {timeoutMs: 1000});
    await f.runtime.recover('apply', {strategy: 'abandon_operation', recoveryOperationId: 'release-1'});
    f.state.operation.transportUncertain = fault.transportUncertain === true;
    const reads = f.calls.filter(c => c === 'graph').length;
    const result = await f.runtime.browserRecoveryHandoff('apply').catch(error => ({stopped: false, reason: error.message}));
    assert.equal(result.stopped, false, JSON.stringify(fault));
    await assert.rejects(f.runtime.verifyBrowserRecovery({operationId: 'apply', step: {}, attested: {}}), /lease/);
    assert.equal(f.calls.filter(c => c === 'graph').length, reads);
    assert.equal(f.runtime.hasUnsettledWork(), true);
  }
});

test('an unknown recovery action outcome keeps Dock mutations blocked after stop', async () => {
  const f = fixture();
  await stopAtFinish(f);
  await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  await f.runtime.browserRecoveryHandoff('apply');
  const stopped = await f.runtime.stopBrowserRecovery({ operationId: 'apply', uncertain: true });
  assert.equal(stopped.state, 'retained_uncertain');
  assert.throws(() => f.runtime.startNodeApply(request('other')), /Browser recovery holds the page/);
  assert.equal(f.runtime.hasUnsettledWork(), true);
});

test('T4: a later export to the same file leaves the earlier download unconfirmed', async () => {
  const first = exportFixture();
  const target = { kind: 'new', type: 'exports.text', label: 'Export', position: { x: 320, y: 280 } };
  first.runtime.startNodeApply({ ...request('export'), target });
  assert.equal((await first.runtime.waitNodeApply('export', { timeoutMs: 1000 })).outcome.output.next_step.tool, 'dock_browser_recovery');
  // Another export to the same destination follows (its read is refused too, but it ran).
  first.runtime.startNodeApply({ ...request('export-2'), target: { kind: 'existing', type: 'exports.text', label: 'Export', ref: node } });
  const second = await first.runtime.waitNodeApply('export-2', { timeoutMs: 1000 });
  // The later export settled on its own; only the destination overlap ends eligibility.
  assert.equal(second.outcome.status, 'FAILED');
  assert.throws(() => first.runtime.browserRecoveryBasis('export'), /No browser recovery trigger/);
  assert.deepEqual(first.reads, []);
});

test('a release gesture with an unconfirmed browser call reports an unknown verification outcome', async () => {
  const f = fixture();
  await stopAtFinish(f);
  await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  const basis = f.runtime.browserRecoveryBasis('apply');
  await f.runtime.browserRecoveryHandoff('apply');
  f.state.release = () => { f.state.operation.transportUncertain = true; throw Error('Cancel click timed out'); };
  const verified = await f.runtime.verifyBrowserRecovery({ operationId: 'apply', step: basis.step, attested: { actions_performed: ['Clicked'] } });
  assert.equal(verified.status, 'unresolved');
  assert.equal(verified.uncertain, true);
});

test('a release whose own gesture receipt lacks cleanup is unknown even without a transport error', async () => {
  for (const cleanup of [false, true]) {
    const f = fixture();
    await stopAtFinish(f);
    await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
    const basis = f.runtime.browserRecoveryBasis('apply');
    await f.runtime.browserRecoveryHandoff('apply');
    // The release closes a dialog through its own receipt, then refuses on the next check.
    f.state.receipt = { cleanup };
    f.state.release = () => { f.state.receiptOptions('apply:finish', 'node.finish', 'signature-2'); throw Error('Graph is not quiet'); };
    const verified = await f.runtime.verifyBrowserRecovery({ operationId: 'apply', step: basis.step, attested: { actions_performed: ['Clicked'] } });
    assert.equal(verified.status, 'unresolved');
    assert.equal(verified.uncertain, !cleanup, 'cleanup ' + cleanup);
  }
});

test('a refusal before any release gesture stays a settled unresolved result', async () => {
  const f = fixture();
  await stopAtFinish(f);
  await f.runtime.recover('apply', { strategy: 'abandon_operation', recoveryOperationId: 'release-1' });
  const basis = f.runtime.browserRecoveryBasis('apply');
  await f.runtime.browserRecoveryHandoff('apply');
  const verified = await f.runtime.verifyBrowserRecovery({ operationId: 'apply', step: basis.step, attested: { actions_performed: ['Looked'] } });
  assert.equal(verified.status, 'unresolved');
  assert.equal(verified.uncertain, false);
});
