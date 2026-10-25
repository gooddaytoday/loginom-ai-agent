import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionRuntime} from '../lib/executor.mjs';
import {releaseNodeTarget} from '../lib/node-target.mjs';
import {createNodeTargetBrowserAdapter} from '../lib/node-target-browser.mjs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';

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
      ...(type==='programming.javascript'?{releasePendingPhases:['input_mapping','open','configure'],
        releasePending:async()=>{throw Error('Early target must use its graph release verifier');}}:{}),
      verifySource:async()=>{if(phase==='source')throw Error('Injected source failure');return ok();},
      ...(['target_before_create','target_source_child','target_release_hook'].includes(phase)?{beforeTarget:async()=>{
        if(phase==='target_release_hook'){operation.nodeEffectPossible=true;operation.cleanupConfirmed=false;}
        if(phase==='target_source_child'){
          state.preflightCalls=(state.preflightCalls??0)+1;
          assert.ok(events.find(e=>e.phase==='node_target_checkpoint'&&e.target_state.last_graph));
          operation.nodeEffectPossible=true;operation.cleanupConfirmed=false;
          operation.lastReceipt={id:'apply:n1',operation_id:'apply:n1',action_key:'ui.act',signature:'signature'};
          if(state.preflightSuccess)return ok();
        }
        throw Error('Injected preflight failure before creation');
      }}:{}),
      ...(phase==='target_release_hook'?{releaseBeforeTarget:async({deadline})=>{
        state.releaseCalls=(state.releaseCalls??0)+1;assert.ok(deadline>Date.now());
        if(!state.allowChildRelease)throw Error('child still unsettled');
        operation.preTargetGraph=structuredClone(graph);operation.cleanupConfirmed=true;
      }}:{}),
      openWizard:async()=>{throw Error('No wizard should open');},mapPorts:async()=>ok(),verifyContinuation:async()=>true,
      finish:async()=>ok(),waitExecution:async()=>ok(),readOutput:async()=>ok()};},
    onRecord:async event=>{
      events.push(structuredClone(event));
      if(state.failPreflightAck&&event.phase==='node_target_checkpoint'&&event.target_state.last_graph&&!event.target_state.baseline)
        throw Error('Injected source checkpoint acknowledgement failure');
      if(state.fail&&phase==='target'&&event.phase==='node_phase_completed'&&event.receipt?.phase==='target')throw Error('Injected target acknowledgement failure');
      if(phase==='target_pending'&&event.phase==='node_target_checkpoint'&&event.target_state.pending)throw Error('Injected graph checkpoint failure');
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

for(const fault of ['running','unknown','cleanup','missing','identity','completed'])
test('handoff reads the original target ledger without a parent receipt: '+fault,async()=>{
  const f=fixture('target_pending');await stop(f);
  assert.equal(f.state.operation.lastReceipt,undefined);assert.equal(f.state.operation.nodeApply.node,null);
  const effect=f.state.operation.targetPhase.pending,key='node-target:doc/'+effect.id;
  const ledger=new Map(),page={[Symbol.for('loginom-dock.operation-receipts.v1')]:ledger},timeouts=[];let reads=0;
  if(fault!=='missing')ledger.set(key,{state:['running','unknown'].includes(fault)?fault:'completed',
    signature:fault==='identity'?'foreign':createHash('sha256').update(JSON.stringify({...effect,receipt:undefined})).digest('hex'),
    outcome:{status:'SUCCEEDED',cleanup_complete:fault!=='cleanup'}});
  const adapter=createNodeTargetBrowserAdapter({origin:'http://example.test',build:'7.4.2',execute:async(code,options)=>{
    if(code.includes('"receipt_read":true')){reads++;timeouts.push(options.timeout);assert.ok(options.timeout>0);
      return runInNewContext('('+code+')(page)',{page});}
    assert.match(code,/async function readGraph/);return structuredClone(f.state.graph);
  }});
  await adapter.observe(f.request,Date.now()+10000);f.adapter.reconcile=adapter.reconcile;
  if(fault==='completed')f.state.blocked=true;
  assert.equal((await release(f)).error.code,'NODE_RELEASE_REFUSED');
  const basis=f.runtime.browserRecoveryBasis('apply');assert.equal(basis.reason,'NODE_RELEASE_REFUSED');
  const before=reads,handoff=await f.runtime.browserRecoveryHandoff('apply');
  assert.equal(handoff.stopped,fault==='completed');assert.equal(reads,before+1);assert.ok(timeouts.at(-1)<=10000);
  if(fault==='completed'){
    f.state.blocked=false;
    const result=await f.runtime.verifyBrowserRecovery({operationId:'apply',step:basis.step,attested:{}});
    assert.equal(result.status,'continuable',JSON.stringify(result));assert.equal(result.original_operation.status,'FAILED');
    f.runtime.assertPreparationAllowed();
  }else{
    assert.throws(()=>f.runtime.assertPreparationAllowed());
    assert.ok(f.state.operation.targetPhase.pending);assert.equal(f.state.operation.nodeApply.pending.phase,'target');
    await assert.rejects(f.runtime.verifyBrowserRecovery({operationId:'apply',step:basis.step,attested:{}}),/lease/);
  }
  assert.deepEqual(f.calls,['create']);
});

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

for(const type of ['imports.text','exports.text','programming.javascript'])test('refused early release offers only graph-restoring browser recovery, then re-verifies: '+type,async()=>{
  const f=fixture('target',type);await stop(f);f.state.blocked=true;
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

function stoppedCrossTablePreflight(type='transform.cross_table'){
 const f=fixture('target_source_child',type);
 for(let i=0;i<5;i++)f.state.graph.nodes.push({ref:{...node,node_id:'retained-'+i},type:i===0?'imports.text':i<3?'transform.group_data':'transform.sorting',
  label:'Retained '+i,position:{x:100+i*100,y:100},inputs:i?[0]:[],outputs:[0],locked:false});
 for(const [source,target] of [[0,1],[0,2],[1,3],[2,4]])f.state.graph.links.push({source:'retained-'+source,output:0,target:'retained-'+target,input:0});
 f.state.receiptResult={state:'completed',receipt:{status:'AMBIGUOUS',action_key:'ui.act',action_revision:'1',operation_id:'apply:n1',
  phase:'observing',effect_possible:true,output:{},error:{code:'WIZARD_CONTEXT_CHANGED',message:'Original wizard context changed'},trace:[],cleanup_complete:true}};
 return f;
}
for(const type of ['transform.cross_table','transform.calculator','preprocessing.data_recovery'])
for(const browser of [false,true])test(type+' source child failure releases the checkpointed original graph, browser='+browser,async()=>{
 const f=stoppedCrossTablePreflight(type);await stop(f);
 assert.equal(f.state.operation.nodeApply.pending.phase,'target');assert.equal(f.state.operation.targetPhase.baseline,null);
 assert.equal(f.state.operation.targetPhase.last_graph.nodes.length,5);assert.equal(f.state.preflightCalls,1);
 assert.deepEqual(f.state.operation.targetPhase.last_graph.links,f.state.graph.links);assert.equal(f.state.graph.links.length,4);
 await f.runtime.inspect({operationId:'apply'});
 assert.equal(f.state.operation.nodeApply.pending.phase,'target');
 if(browser){
  f.state.blocked=true;assert.equal((await release(f)).error.code,'NODE_RELEASE_REFUSED');
  const basis=f.runtime.browserRecoveryBasis('apply');assert.equal(basis.step.kind,'node_target');
  assert.equal((await f.runtime.browserRecoveryHandoff('apply')).stopped,true);f.state.blocked=false;
  const result=await f.runtime.verifyBrowserRecovery({operationId:'apply',step:basis.step,attested:{actions_performed:['observed quiet original graph']}});
  assert.equal(result.status,'continuable',JSON.stringify(result));assert.equal(result.original_operation.status,'FAILED');
  assert.equal(f.state.operation.nodeApply.result.node,null);
 }else{
  const result=await release(f);assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
  const original=result.output.original_outcome.output;
  assert.equal(original.node,null);assert.equal(original.package_saved,false);
  assert.equal(original.execution.status,'not_requested');assert.equal(original.configuration.status,'not_requested');
  assert.match(original.next_step.instruction,/did not create/);assert.match(original.next_step.instruction,/Source\/preflight effects are not undone/);
 }
 f.runtime.assertPreparationAllowed();assert.equal(f.runtime.hasUnsettledWork(),false);
 assert.equal(f.state.preflightCalls,1);assert.deepEqual(f.calls,[]);
});
for(const type of ['transform.cross_table','transform.calculator','preprocessing.data_recovery'])
for(const fault of ['changed_graph','extra_node','receipt_pending','receipt_cleanup','transport','release_ack'])
 test('checkpointed '+type+' source child still refuses '+fault,async()=>{
 const f=stoppedCrossTablePreflight(type);await stop(f);
 if(fault==='changed_graph')f.state.graph.nodes[0].label='Changed';
 if(fault==='extra_node')f.state.graph.nodes.push({...structuredClone(f.state.graph.nodes[0]),ref:{...node,node_id:'unexpected'}});
 if(fault==='receipt_pending')f.state.receiptResult.state='pending';
 if(fault==='receipt_cleanup')f.state.receiptResult.receipt.cleanup_complete=false;
 if(fault==='transport')f.state.operation.transportUncertain=true;
 if(fault==='release_ack')f.state.failReleaseAck=true;
 if(fault==='transport')await assert.rejects(release(f),/unconfirmed/);
 else assert.equal((await release(f)).error.code,'NODE_RELEASE_REFUSED');
 assert.throws(()=>f.runtime.assertPreparationAllowed(),/pending|unsettled|uncertain/);
 assert.deepEqual(f.calls,[]);assert.equal(f.state.preflightCalls,1);
});

for(const type of ['transform.cross_table','transform.calculator','preprocessing.data_recovery'])
test(type+' unfinished checkpointed preflight cannot resume its source gestures',async()=>{
 const f=stoppedCrossTablePreflight(type);await stop(f);
 await f.runtime.startNodeApply(f.request,{resume:true});
 const job=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
 assert.equal(job.outcome.status,'AMBIGUOUS');assert.equal(f.state.operation.nodeApply.pending.phase,'target');
 assert.equal(f.state.preflightCalls,1);assert.deepEqual(f.calls,[]);
});

for(const type of ['transform.cross_table','transform.calculator','preprocessing.data_recovery'])
test(type+' source preflight checkpoint ACK failure prevents all child and target gestures',async()=>{
 const f=stoppedCrossTablePreflight(type);f.state.failPreflightAck=true;await stop(f);
 assert.equal(f.state.preflightCalls,undefined);assert.deepEqual(f.calls,[]);assert.equal(f.state.graph.nodes.length,5);
});

for(const type of ['transform.cross_table','transform.calculator','preprocessing.data_recovery'])
test(type+' successful checkpointed preflight still prepares its one new target',async()=>{
 const f=stoppedCrossTablePreflight(type);f.state.preflightSuccess=true;await stop(f);
 assert.equal(f.state.preflightCalls,1);assert.deepEqual(f.calls,['create']);
 assert.equal(f.state.graph.nodes.length,6);assert.equal(f.state.operation.targetPhase.completed,true);
 assert.equal(f.state.operation.nodeApply.node.node_id,'created');
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

test('early REST child release hook must settle before the parent graph release',async()=>{
 const f=fixture('target_release_hook');await stop(f);
 assert.equal((await release(f)).error.code,'NODE_RELEASE_REFUSED');assert.equal(f.state.releaseCalls,1);
 assert.throws(()=>f.runtime.assertPreparationAllowed());
 f.state.allowChildRelease=true;
 const released=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release2'});
 assert.equal(released.status,'SUCCEEDED',JSON.stringify(released));assert.equal(f.state.releaseCalls,2);
 f.runtime.assertPreparationAllowed();assert.deepEqual(f.calls,[]);
});

for(const confirmed of [true,false])test('D49 pending move release requires native requested position: '+confirmed,async()=>{
 const f=fixture('target_pending','transform.calculator');
 // Reduced J2 graph: the same GUID at (152,1528), requested (180,400).
 f.state.graph.nodes.push({ref:node,type:'transform.calculator',label:'Поля справочника стран',position:{x:152,y:1528},inputs:[0],outputs:[0],locked:false,dom_epoch:468});
 f.request.target={kind:'existing',type:'transform.calculator',ref:node,position:{x:180,y:400}};
 f.adapter.positionMatches=(n,p)=>n.position.x===Math.round(p.x/8)*8&&n.position.y===Math.round(p.y/8)*8;
 f.adapter.mutate=async e=>{
  f.calls.push(e.kind);
  if(confirmed){f.state.graph.nodes[0].position={x:184,y:400};f.state.graph.nodes[0].dom_epoch++;}
  return {status:'AMBIGUOUS',effect_possible:true,cleanup_complete:true};
 };
 await stop(f);
 const result=await release(f);
 if(confirmed){assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.doesNotThrow(()=>f.runtime.assertPreparationAllowed());}
 else{assert.equal(result.error.code,'NODE_RELEASE_REFUSED');assert.throws(()=>f.runtime.assertPreparationAllowed(),/pending|unsettled|uncertain/);}
 assert.deepEqual(f.calls,['move'],'release never replays a move');
});
