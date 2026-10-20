import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionRuntime} from '../lib/executor.mjs';
import {releaseNodeTarget} from '../lib/node-target.mjs';

const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const node={document_id:'doc',workflow_id:'wf',node_id:'created'};
function fixture(phase='target',type='imports.text'){
  const events=[],calls=[],graph={complete:true,interaction_ready:true,document_id:'doc',workflow_ref:workflow,dom_epoch:1,nodes:[],links:[],foreign_links:[]};
  const state={blocked:false,fail:true,graph};
  const ok=()=>({verified:true,cleanup_complete:true,effect_possible:false});
  const adapter={
    observe:async()=>{if(state.blocked)throw Error('Graph is blocked');return structuredClone(graph);},
    verifyWorkflow:async()=>({...ok(),status:'SUCCEEDED',document_id:'doc',workflow_ref:workflow}),
    readWorkflowReceipt:async()=>({output:{state:'completed',receipt:{...ok(),status:'SUCCEEDED',document_id:'doc',workflow_ref:workflow}}}),
    activateWorkflow:async()=>{if(phase==='workflow')throw Error('Injected workflow failure');return ok();},
    preflight:async()=>{},positionMatches:(n,p)=>JSON.stringify(n.position)===JSON.stringify(p),
    mutate:async effect=>{calls.push(effect.kind);if(effect.kind==='create')graph.nodes.push({ref:node,type,label:'Target',position:effect.parameters.position,inputs:[],outputs:[0],locked:false});return {status:'SUCCEEDED',cleanup_complete:true};},
    reconcile:async()=>({verified:true,cleanup_complete:true})};
  const request={operation_id:'apply',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
    target:{kind:'new',type,label:'Target',position:{x:320,y:280}},inputs:[],mode:'test',parameters:{},mappings:[],finish:'execute',
    read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
  const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},browserRecovery:true,
    execute:async code=>{if(state.receiptResult&&code.includes('receipt_read'))return {status:'SUCCEEDED',action_key:'operation.receipt',action_revision:'1',
      operation_id:'apply',phase:'observed',effect_possible:false,output:state.receiptResult,error:null,trace:[]};throw Error('Unexpected browser transport');},nodeTargetAdapterFactory:()=>adapter,
    nodeApplyHandlers:new Map([[type,{revision:'1',modes:['test'],validate:()=>{},configure:async()=>ok()}]]),
    nodeApplyDriverFactory:({operation})=>{state.operation=operation;return {
      verifySource:async()=>{if(phase==='source')throw Error('Injected source failure');return ok();},
      ...(phase==='target_before_create'?{beforeTarget:async()=>{throw Error('Injected preflight failure before creation');}}:{}),
      openWizard:async()=>{throw Error('No wizard should open');},mapPorts:async()=>ok(),verifyContinuation:async()=>true,
      finish:async()=>ok(),waitExecution:async()=>ok(),readOutput:async()=>ok()};},
    onRecord:async event=>{
      events.push(structuredClone(event));
      if(state.fail&&phase==='target'&&event.phase==='node_phase_completed'&&event.receipt?.phase==='target')throw Error('Injected target acknowledgement failure');
      if(state.failReleaseAck&&event.phase==='node_operation_released')throw Error('Injected release acknowledgement failure');
      return event;
    }});
  return {runtime,state,request,adapter,events,calls};
}
async function stop(f){
  f.runtime.startNodeApply(f.request);
  const job=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
  assert.ok(['AMBIGUOUS','NOT_APPLIED'].includes(job.outcome?.status),JSON.stringify(job));
  assert.ok(job.outcome.output.pending_phase);
  return job;
}
const release=f=>f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release'});

for(const phase of ['source','workflow','target'])test('release before accepted node: '+phase,async()=>{
  const f=fixture(phase);await stop(f);
  assert.equal(f.state.operation.nodeApply.node,null);
  const result=await release(f);
  assert.equal(result.status,'SUCCEEDED');
  assert.equal(result.output.original_outcome.status,'FAILED');
  const out=result.output.original_outcome.output;
  assert.equal(out.package_saved,false);assert.equal(out.configuration.status,'not_requested');
  assert.deepEqual(out.node,phase==='target'?node:null);
  assert.equal(out.execution.status,'not_requested');
  assert.equal(f.events.at(-2).phase,'operation_abandoned');
  assert.doesNotThrow(()=>f.runtime.assertPreparationAllowed());
  assert.deepEqual(f.calls,phase==='target'?['create']:[]);
});

for(const type of ['programming.javascript','exports.text'])test('pre-target release does not depend on type-specific driver: '+type,async()=>{
  const f=fixture('source',type);await stop(f);
  assert.equal((await release(f)).status,'SUCCEEDED');
});

test('inspect may reconcile target without losing its release alternative',async()=>{
  const f=fixture();await stop(f);
  const advice=(await f.runtime.inspect({operationId:'apply'})).output;
  assert.ok(advice.recovery_options.includes('abandon_operation'));
  assert.equal((await release(f)).status,'SUCCEEDED');
  assert.deepEqual(f.calls,['create']);
});

for(const change of ['foreign_document','foreign_workflow','locked','changed_graph','missing_node','unknown_receipt'])test('early release preserves guard: '+change,async()=>{
  const f=fixture();await stop(f);
  if(change==='foreign_document')f.state.graph.document_id='other';
  if(change==='foreign_workflow')f.state.graph.workflow_ref={...workflow,workflow_id:'other'};
  if(change==='locked')f.state.graph.nodes[0].locked=true;
  if(change==='changed_graph')f.state.graph.nodes[0].label='Other';
  if(change==='missing_node')f.state.graph.nodes=[];
  if(change==='unknown_receipt')f.state.operation.lastReceipt={id:'unknown'};
  const outcome=await release(f);
  assert.equal(outcome.error.code,'NODE_RELEASE_REFUSED');
  assert.throws(()=>f.runtime.assertPreparationAllowed(),/pending|unsettled|uncertain/);
  assert.deepEqual(f.calls,['create']);
});

test('unknown transport never admits early release or browser recovery',async()=>{
  const f=fixture();await stop(f);f.state.operation.transportUncertain=true;
  await assert.rejects(release(f),/unconfirmed|unavailable/);
  assert.throws(()=>f.runtime.browserRecoveryBasis('apply'),/No browser recovery trigger/);
});

test('refused early release offers only graph-restoring browser recovery, then re-verifies',async()=>{
  const f=fixture();await stop(f);f.state.blocked=true;
  const refused=await release(f);
  assert.equal(refused.output.next_step.tool,'dock_browser_recovery');
  const basis=f.runtime.browserRecoveryBasis('apply');
  assert.equal(basis.step.kind,'node_target');
  assert.match(basis.goal.required_result,/Do not create, delete/);
  assert.equal((await f.runtime.browserRecoveryHandoff('apply')).stopped,true);
  const denied=await f.runtime.verifyBrowserRecovery({operationId:'apply',step:basis.step,attested:{}});
  assert.equal(denied.status,'unresolved');assert.equal(denied.uncertain,false);
  f.state.blocked=false;
  const verified=await f.runtime.verifyBrowserRecovery({operationId:'apply',step:basis.step,attested:{}});
  assert.equal(verified.status,'continuable');assert.equal(verified.next_step.tool,'dock_node_apply');
  assert.doesNotThrow(()=>f.runtime.assertPreparationAllowed());
  assert.deepEqual(f.calls,['create']);
});

test('release acknowledgement failure keeps the operation and gate',async()=>{
  const f=fixture();await stop(f);f.state.failReleaseAck=true;
  assert.equal((await release(f)).status,'AMBIGUOUS');
  assert.equal(f.state.operation.nodeApply.result,undefined);
  assert.throws(()=>f.runtime.assertPreparationAllowed(),/pending|unsettled|uncertain/);
});

test('pre-target proof cancellation and absolute release deadline refuse without gestures',async()=>{
  const f=fixture('source');await stop(f);
  const args={operation:f.state.operation,adapter:f.adapter,record:async e=>e,readReceipt:async()=>null,deadline:10,now:()=>10};
  await assert.rejects(releaseNodeTarget(args),/deadline/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(releaseNodeTarget({...args,now:()=>0,signal:controller.signal}),/abort/i);
  assert.deepEqual(f.calls,[]);
});

test('existing target is found by exact ref before any accepted state.node',async()=>{
  const f=fixture('source');
  f.request.target={kind:'existing',type:'imports.text',ref:node};
  f.state.graph.nodes.push({ref:node,type:'imports.text',label:'Target',inputs:[],outputs:[0],position:{x:320,y:280},locked:false});
  await stop(f);
  const result=await release(f);
  assert.deepEqual(result.output.original_outcome.output.node,node);
  assert.match(result.output.original_outcome.output.next_step.instruction,/do not recreate/);
  assert.deepEqual(f.calls,[]);
});

test('unreconciled target receipt cannot be released or repeated',async()=>{
  const f=fixture();await stop(f);
  const t=f.state.operation.targetPhase;
  t.pending={id:'missing-create',kind:'create',parameters:{type:'imports.text'},before:{...structuredClone(f.state.graph),nodes:[]}};
  f.adapter.reconcile=async()=>({verified:false,cleanup_complete:false});
  const result=await release(f);
  assert.equal(result.error.code,'NODE_RELEASE_REFUSED');
  assert.throws(()=>f.runtime.assertPreparationAllowed(),/pending|unsettled|uncertain/);
  assert.deepEqual(f.calls,['create']);
});

test('changing the graph during the read-only proof never releases it',async()=>{
  const f=fixture('source');await stop(f);
  let reads=0;
  f.adapter.observe=async()=>({...structuredClone(f.state.graph),dom_epoch:++reads});
  assert.equal((await release(f)).error.code,'NODE_RELEASE_REFUSED');
  assert.throws(()=>f.runtime.assertPreparationAllowed(),/pending|unsettled|uncertain/);
  assert.deepEqual(f.calls,[]);
});

test('a hidden preflight child with possible effects cannot be cleared by a quiet graph',async()=>{
  const f=fixture('source');await stop(f);
  f.state.operation.nodeEffectPossible=true;f.state.operation.cleanupConfirmed=false;
  assert.equal((await release(f)).error.code,'NODE_RELEASE_REFUSED');
  assert.throws(()=>f.runtime.assertPreparationAllowed(),/pending|unsettled|uncertain/);
  assert.deepEqual(f.calls,[]);
});

test('early existing-output read retains the public read continuation',async()=>{
  const f=fixture('source');
  f.request.target={kind:'existing',type:'imports.text',ref:node};
  f.request.mode='read_existing_output';f.request.read.ports=[0];
  f.request.parameters={source_operation_id:'source-op',schemas:[{port:0,schema:[{index:0,name:'Id',label:'Id',type:'integer',data_kind:'Непрерывный'}]}]};
  f.state.graph.nodes.push({ref:node,type:'imports.text',label:'Target',inputs:[],outputs:[0],position:{x:320,y:280},locked:false});
  await stop(f);
  const result=await release(f);
  assert.equal(result.output.original_outcome.output.next_step.tool,'dock_node_read');
  assert.match(result.output.original_outcome.output.next_step.instruction,/source-op/);
  assert.deepEqual(f.calls,[]);
});

test('target preflight refusal before creation releases without inventing a target ref',async()=>{
  const f=fixture('target_before_create');await stop(f);
  assert.equal(f.state.operation.nodeApply.pending.phase,'target');
  assert.equal(f.state.operation.targetPhase,undefined);
  const result=await release(f);
  assert.equal(result.status,'SUCCEEDED');assert.equal(result.output.original_outcome.output.node,null);
  assert.match(result.output.original_outcome.output.next_step.instruction,/did not create/);
  assert.deepEqual(f.calls,[]);
});

test('completed last browser call without cleanup refuses release and handoff',async()=>{
  const f=fixture();await stop(f);
  f.state.operation.lastReceipt={id:'original',operation_id:'original',action_key:'ui.act',signature:'signature'};
  f.state.receiptResult={state:'completed',receipt:{status:'SUCCEEDED',action_key:'ui.act',action_revision:'1',operation_id:'original',
    phase:'verified',effect_possible:true,output:{},error:null,trace:[],cleanup_complete:false}};
  assert.equal((await release(f)).error.code,'NODE_RELEASE_REFUSED');
  const handoff=await f.runtime.browserRecoveryHandoff('apply');
  assert.equal(handoff.stopped,false);
  assert.throws(()=>f.runtime.assertPreparationAllowed(),/pending|unsettled|uncertain/);
});

test('expired proof read cannot issue a second observation or release the gate',async()=>{
  const f=fixture('source');await stop(f);
  let clock=0,reads=0;
  f.adapter.observe=async()=>{reads++;clock=10;return structuredClone(f.state.graph);};
  await assert.rejects(releaseNodeTarget({operation:f.state.operation,adapter:f.adapter,record:async e=>e,
    readReceipt:async()=>null,deadline:10,now:()=>clock}),/deadline/);
  assert.equal(reads,1);assert.throws(()=>f.runtime.assertPreparationAllowed(),/pending|unsettled|uncertain/);
});

for(const route of ['release','finish','handoff'])for(const fault of ['running','unknown','missing','cleanup','foreign','unverified','no_reader'])
test('workflow receipt guard '+route+' / '+fault,async()=>{
  const f=fixture('workflow');await stop(f);let reads=0;
  f.state.blocked=true;await release(f);const basis=f.runtime.browserRecoveryBasis('apply');
  if(route==='finish')assert.equal((await f.runtime.browserRecoveryHandoff('apply')).stopped,true);
  f.state.blocked=false;
  f.adapter.readWorkflowReceipt=async(value,ctx)=>{reads++;assert.deepEqual(value,{document_id:'doc',workflow_ref:workflow});
    assert.equal(ctx.receipt_id,'apply:workflow');return {output:{state:['running','unknown','missing'].includes(fault)?fault:'completed',
      receipt:{status:'SUCCEEDED',verified:fault!=='unverified',cleanup_complete:fault!=='cleanup',document_id:fault==='foreign'?'other':'doc',workflow_ref:workflow}}};};
  if(fault==='no_reader')delete f.adapter.readWorkflowReceipt;
  const result=route==='release'?await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release2'})
    :route==='handoff'?await f.runtime.browserRecoveryHandoff('apply'):await f.runtime.verifyBrowserRecovery({operationId:'apply',step:basis.step,attested:{}});
  if(route==='release')assert.equal(result.error.code,'NODE_RELEASE_REFUSED');
  else if(route==='handoff')assert.equal(result.stopped,false);
  else assert.equal(result.status,'unresolved');
  assert.equal(reads,fault==='no_reader'?0:1);assert.equal(f.state.operation.nodeApply.pending.phase,'workflow');
  assert.throws(()=>f.runtime.assertPreparationAllowed());assert.deepEqual(f.calls,[]);
});

for(const route of ['release','finish'])for(const ready of [false,undefined,null])for(const at of [1,2,'both'])
test('graph interaction guard '+route+' / '+ready+' / read '+at,async()=>{
  const f=fixture('source');await stop(f);let step;
  if(route==='finish'){f.state.blocked=true;await release(f);step=f.runtime.browserRecoveryBasis('apply').step;
    assert.equal((await f.runtime.browserRecoveryHandoff('apply')).stopped,true);f.state.blocked=false;}
  let reads=0;f.adapter.observe=async()=>({...structuredClone(f.state.graph),interaction_ready:++reads===at||at==='both'?ready:true});
  const result=route==='release'?await release(f):await f.runtime.verifyBrowserRecovery({operationId:'apply',step,attested:{}});
  if(route==='release')assert.equal(result.error.code,'NODE_RELEASE_REFUSED');else assert.equal(result.status,'unresolved');
  assert.throws(()=>f.runtime.assertPreparationAllowed());assert.equal(f.state.operation.nodeApply.result,undefined);assert.deepEqual(f.calls,[]);
});
