import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionRuntime,parseCapabilityResult} from '../lib/executor.mjs';
import vm from 'node:vm';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeJobResultSchema} from '../lib/node-result-schema.mjs';
import {actions} from './support/executor-fixture.mjs';
const validateJob=new AjvJsonSchemaValidator().getValidator(nodeJobResultSchema);
const assertJob=job=>{const result=validateJob(job);assert.equal(result.valid,true,result.errorMessage);};
const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const request=()=>({operation_id:'apply',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'new',type:'imports.text',label:'Source',position:{x:320,y:280}},inputs:[],mode:'delimited',parameters:{},mappings:[],finish:'done',
 read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}});
function fixture({execute=async()=>{throw Error('Unexpected public transport')},wrapDrivers,now=Date.now,pinnedActions=new Map()}={}){
 const calls=[],events=[];const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[],links:[],foreign_links:[]};
 const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:(n,p)=>JSON.stringify(n.position)===JSON.stringify(p),reconcile:async()=>({verified:true,cleanup_complete:true}),mutate:async e=>{calls.push(e.kind);if(e.kind==='create')graph.nodes.push({ref:{document_id:'doc',workflow_id:'wf',node_id:'new'},type:e.parameters.type,label:'Source',position:e.parameters.position,inputs:[],outputs:[0]});return {status:'SUCCEEDED',cleanup_complete:true};}};
 const ok=(name,extra={})=>async()=>{calls.push(name);return {verified:true,cleanup_complete:true,effect_possible:false,...extra}};
 const handler={revision:'1',modes:['delimited'],validate:()=>{},configure:ok('configure')};
 const drivers={verifySource:ok('source'),mapPorts:ok('mapping'),openWizard:ok('open'),finish:ok('finish',{mode:'done',execution_started:false,execution_id:null}),
  waitExecution:ok('execute'),readOutput:ok('read'),verifyContinuation:async()=>true};
 let failRecord;
 const handlers=new Map([['imports.text',handler]]);
 const runtime=createActionRuntime({pinned:{actions:pinnedActions,selectors:new Map(),pins:{}},allowCandidate:pinnedActions.size>0,execute,now,
  nodeTargetAdapterFactory:()=>adapter,nodeApplyHandlers:handlers,nodeApplyDriverFactory:context=>wrapDrivers?wrapDrivers(context,drivers):drivers,
  onRecord:async e=>{events.push(e);if(e.phase===failRecord)throw Error('disk unavailable');return e;}});
 return {runtime,adapter,calls,events,graph,drivers,handler,handlers,failRecord:p=>{failRecord=p}};
}
test('node drivers carry plain observations and typed outcomes through the real bridge parser',async()=>{
 let observed;
 const f=fixture({execute:async code=>{
  const value=await vm.runInNewContext('('+code+')(null)');
  return parseCapabilityResult({content:[{type:'text',text:JSON.stringify(value)}]});
 },wrapDrivers:(context,drivers)=>({...drivers,verifySource:async()=>{
  observed=await context.execute('async page => ({native_columns:["Id"],count:0})');
  const domain=await context.execute('async page => ({status:"NOT_APPLIED",effect_possible:false,cleanup_complete:true})');
  assert.equal(domain.status,'NOT_APPLIED');
  return {verified:true,cleanup_complete:true,effect_possible:false};
 }})});
 const result=await f.runtime.runNodeApply(request());assert.equal(result.status,'SUCCEEDED');
 assert.deepEqual(observed,{native_columns:['Id'],count:0});
});
test('read-only target refusal is NOT_APPLIED with confirmed cleanup and no graph retry',async()=>{
 const f=fixture();f.adapter.observe=async()=>{throw Error('Prepared workflow changed');};
 const result=await f.runtime.runNodeApply(request());
 assert.equal(result.status,'NOT_APPLIED');assert.equal(result.effect_possible,false);assert.equal(result.cleanup_complete,true);
 assert.equal(result.output.node,null);assert.deepEqual(f.calls,['source']);
 assert.ok(f.events.some(e=>e.phase==='node_phase_refused'&&e.receipt.phase==='target'&&e.receipt.effect_possible===false));
 const count=f.calls.length;await f.runtime.runNodeApply(request());assert.equal(f.calls.length,count);
});
test('lost target mutation response retains ambiguity and pending cleanup',async()=>{
 const f=fixture();f.adapter.mutate=async()=>{throw Error('lost gesture response');};
 const result=await f.runtime.runNodeApply(request());
 assert.equal(result.status,'AMBIGUOUS');assert.equal(result.effect_possible,true);assert.equal(result.cleanup_complete,false);
 assert.ok(!f.events.some(e=>e.phase==='node_phase_refused'));
});
test('apply owns the accepted graph driver, inspect and replay under one ID',async()=>{
 const f=fixture(),result=await f.runtime.runNodeApply(request());
 assert.equal(result.status,'SUCCEEDED');assert.equal(result.output.node.node_id,'new');assert.equal(result.output.output.status,'not_refreshed');
 assert.deepEqual(f.calls,['source','create','mapping','open','configure','mapping','finish']);
 assert.ok(f.events.some(e=>e.phase==='node_target_checkpoint'&&e.operation_id==='apply'));
 assert.ok(f.events.some(e=>e.phase==='node_checkpoint'&&e.operation_id==='apply'));
 assert.equal((await f.runtime.inspect({operationId:'apply'})).output.state,'resolved');
 const count=f.calls.length;assert.deepEqual(await f.runtime.runNodeApply(request()),result);assert.equal(f.calls.length,count);
 f.runtime.assertPreparationAllowed();assert.ok(!f.runtime.tools.some(t=>t.name.includes('node_apply')));
});
test('validation and missing drivers cannot create a graph or journal effects',async()=>{
 const f=fixture();f.handler.validate=()=>{throw Error('unsupported schema')};await assert.rejects(f.runtime.runNodeApply(request()),/unsupported/);
 assert.equal(f.events.length,0);assert.equal(f.calls.length,0);
});
test('same ID cannot be shared with graph operation or changed handler',async()=>{
 const f=fixture();await f.runtime.runNodeApply(request());
 const {document_id,workflow_ref,target,inputs}=request();
 await assert.rejects(f.runtime.runNodeTarget({document_id,workflow_ref,target,inputs},{operationId:'apply'}),/already used/);
 f.handler.revision='2';await assert.rejects(f.runtime.runNodeApply(request()),/different parameters or handler/);
});
test('lost finish cannot be repeated, abandoned, or repaired through generic UI',async()=>{
 const f=fixture();f.drivers.finish=async()=>{f.calls.push('finish');throw Error('lost reply')};
 const r=await f.runtime.runNodeApply(request());assert.equal(r.status,'AMBIGUOUS');assert.equal(r.output.pending_phase,'finish');
 const count=f.calls.length;assert.equal((await f.runtime.runNodeApply(request())).status,'AMBIGUOUS');
 const state=(await f.runtime.inspect({operationId:'apply'})).output;
 assert.equal(state.state,'pending');assert.deepEqual(state.recovery_options,[]);assert.equal(state.internal_resume_available,false);
 await assert.rejects(f.runtime.runNodeApply(request(),{resume:true}),/unresolved phase/);
 await assert.rejects(f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'repair'}),/enclosing node procedure/);
 await assert.rejects(f.runtime.uiAct({verb:'click',ref:'ui-1'},{operationId:'gesture',observationId:'obs',recoveryOperationId:'apply'}),/original node phase/);
 await assert.rejects(f.runtime.runNodeApply({...request(),operation_id:'other'}),/pending/);
 assert.equal(f.calls.length,count);assert.throws(()=>f.runtime.assertPreparationAllowed(),/uncertain/);
});
test('a save behind a retained ambiguous configure returns that node outcome, not a phantom active call',async()=>{
 const f=fixture({pinnedActions:actions});
 f.handler.configure=async()=>{f.calls.push('configure');throw Error('Node procedure readiness timeout: editor; no mutation was authorized')};
 const r=await f.runtime.runNodeApply(request());assert.equal(r.status,'AMBIGUOUS');assert.equal(r.output.pending_phase,'configure');
 const count=f.calls.length;
 const saved=await f.runtime.run('package.save_checkpoint',{path:'/user/abc.lgp',conflict_policy:'replace'},{operationId:'save'});
 assert.equal(saved.operation_id,'apply');assert.equal(saved.status,'AMBIGUOUS');assert.equal(saved.error.code,'NODE_APPLY_STOPPED');
 await assert.rejects(f.runtime.run('package.save_checkpoint',{path:'/user/abc.lgp',conflict_policy:'replace'},{operationId:'apply'}),/different parameters/);
 const refused=f.runtime.requestFailure(Error('Use the enclosing node procedure to resume this internal phase'));
 assert.equal(refused.operation_id,'apply');assert.deepEqual(refused.output.available_actions,[]);
 assert.equal(f.calls.length,count);
});
test('concurrent inspection cannot release the gate before a cancelled call completes',async()=>{
 const f=fixture(),controller=new AbortController();let release;
 f.handler.configure=async()=>{await new Promise(r=>{release=r});return {verified:true,cleanup_complete:true}};
 const task=f.runtime.runNodeApply(request(),{signal:controller.signal});
 for(let i=0;!release&&i<100;i++)await new Promise(r=>setImmediate(r));assert.ok(release);controller.abort();
 assert.equal((await f.runtime.inspect({operationId:'apply'})).output.state,'pending');
 await assert.rejects(f.runtime.runNodeApply({...request(),operation_id:'other'}),/running/);
 release();const r=await task;assert.equal(r.status,'AMBIGUOUS');assert.equal(r.cleanup_complete,true);assert.ok(!f.calls.includes('finish'));
 // Only an explicit checked continuation can finish an interrupted operation.
 const resumed=await f.runtime.runNodeApply(request(),{resume:true});assert.equal(resumed.status,'SUCCEEDED');
 assert.equal(f.calls.filter(c=>c==='create').length,1);assert.equal(f.calls.filter(c=>c==='finish').length,1);
});
test('unknown graph mutation keeps enclosing node phase pending',async()=>{
 const f=fixture(),mutate=f.adapter.mutate;f.adapter.mutate=async e=>{await mutate(e);throw Error('lost graph reply')};
 const r=await f.runtime.runNodeApply(request());assert.equal(r.output.pending_phase,'target');
 const count=f.calls.length;await f.runtime.inspect({operationId:'apply'});assert.equal(f.calls.length,count);assert.ok(!f.calls.includes('open'));
});
test('late workflow receipt permits only explicit continuation without another activation',async()=>{
 const f=fixture();let available=false;
 const receipt={status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:true,document_id:'doc',workflow_ref:workflow};
 f.adapter.activateWorkflow=async()=>{f.calls.push('activate');throw Error('lost reply');};
 f.adapter.readWorkflowReceipt=async()=>({output:{state:available?'completed':'running',receipt}});
 f.adapter.verifyWorkflow=async()=>({...receipt,effect_possible:false});
 const paused=await f.runtime.runNodeApply(request());assert.equal(paused.output.pending_phase,'workflow');
 await f.runtime.inspect({operationId:'apply'});assert.deepEqual(f.calls,['source','activate']);
 available=true;const inspected=await f.runtime.inspect({operationId:'apply'});
 assert.equal(inspected.output.internal_resume_available,true);assert.equal(inspected.output.state,'pending');
 assert.deepEqual(f.calls,['source','activate']);
 const resumed=await f.runtime.runNodeApply(request(),{resume:true});assert.equal(resumed.status,'SUCCEEDED');
 assert.equal(f.calls.filter(c=>c==='activate').length,1);assert.equal(f.calls.filter(c=>c==='create').length,1);
 assert.equal(f.events.filter(e=>e.phase==='node_phase_completed'&&e.receipt.phase==='workflow').length,1);
 assert.ok(f.events.some(e=>e.phase==='node_continuation_checked'&&e.boundary==='workflow'&&e.verified));
});
test('workflow recovery rejects unknown, foreign, unclean and replaced live documents',async()=>{
 for(const variant of ['unknown','foreign','unclean','replaced','source']){
  const f=fixture();const receipt={status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:true,document_id:'doc',workflow_ref:workflow};
  f.adapter.activateWorkflow=async()=>{throw Error('lost reply');};
  f.adapter.readWorkflowReceipt=async()=>({output:{state:variant==='unknown'?'unknown':'completed',receipt:{...receipt,
   ...(variant==='foreign'?{document_id:'other'}:{}),...(variant==='unclean'?{cleanup_complete:false}:{})}}});
  f.adapter.verifyWorkflow=async()=>({...receipt,effect_possible:false,...(variant==='replaced'?{document_id:'other'}:{})});
  let changed=false;
  if(variant==='source')f.drivers.verifySource=async()=>({verified:true,cleanup_complete:true,source:changed?'changed':'original'});
  await f.runtime.runNodeApply(request());changed=true;
  if(variant==='source')assert.notEqual((await f.runtime.runNodeApply(request(),{resume:true})).status,'SUCCEEDED');
  else await assert.rejects(f.runtime.runNodeApply(request(),{resume:true}),/unresolved phase/);
  assert.ok(!f.calls.includes('create'));
 }
});
test('workflow inspection holds the gate and never extends an expired original deadline',async()=>{
 let time=1000,release;const f=fixture({now:()=>time});
 const receipt={status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:true,document_id:'doc',workflow_ref:workflow};
 f.adapter.activateWorkflow=async()=>{throw Error('lost reply');};
 f.adapter.readWorkflowReceipt=async()=>{await new Promise(r=>{release=r});return {output:{state:'completed',receipt}};};
 f.adapter.verifyWorkflow=async()=>({...receipt,effect_possible:false});
 await f.runtime.runNodeApply(request());const inspecting=f.runtime.inspect({operationId:'apply'});
 for(let i=0;!release&&i<100;i++)await new Promise(r=>setImmediate(r));assert.ok(release);
 await assert.rejects(f.runtime.runNodeApply({...request(),operation_id:'other'}),/running/);
 time=40000;release();await inspecting;
 const result=await f.runtime.runNodeApply(request(),{resume:true});assert.notEqual(result.status,'SUCCEEDED');
 assert.ok(!f.calls.includes('create'));
});
test('unacknowledged workflow receipt recovery retains the unresolved phase',async()=>{
 const f=fixture(),receipt={status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:true,document_id:'doc',workflow_ref:workflow};
 f.adapter.activateWorkflow=async()=>{throw Error('lost reply');};
 f.adapter.readWorkflowReceipt=async()=>({output:{state:'completed',receipt}});
 f.adapter.verifyWorkflow=async()=>({...receipt,effect_possible:false});
 await f.runtime.runNodeApply(request());f.failRecord('node_phase_completed');
 await assert.rejects(f.runtime.inspect({operationId:'apply'}),/disk unavailable/);
 assert.throws(()=>f.runtime.assertPreparationAllowed(),/uncertain/);assert.ok(!f.calls.includes('create'));
});
test('refused continuation preserves accepted phases and node without further effects',async()=>{
 const f=fixture(),controller=new AbortController();
 f.handler.configure=async()=>{controller.abort();return {verified:true,cleanup_complete:true}};
 f.drivers.verifyContinuation=async()=>false;
 const paused=await f.runtime.runNodeApply(request(),{signal:controller.signal});
 const before=f.calls.length,refused=await f.runtime.runNodeApply(request(),{resume:true});
 assert.equal(refused.status,'AMBIGUOUS');assert.equal(refused.cleanup_complete,true);
 assert.deepEqual(refused.output.phases,paused.output.phases);assert.deepEqual(refused.output.node,paused.output.node);
 assert.deepEqual(refused.output.execution,paused.output.execution);assert.deepEqual(refused.output.output,paused.output.output);
 assert.equal(f.calls.length,before);assert.deepEqual(await f.runtime.runNodeApply(request()),refused);
});
test('checkpoint delivery journal failure is recoverable without repeating configuration',async()=>{
 const f=fixture();f.failRecord('completed');const first=await f.runtime.runNodeApply(request());assert.equal(first.error.code,'EVIDENCE_WRITE_FAILED');
 assert.equal(first.output.node.node_id,'new');assert.equal(first.output.configuration.status,'applied');
 assert.equal(first.output.status,'AMBIGUOUS');assert.equal(first.cleanup_complete,true);
 assert.throws(()=>f.runtime.assertPreparationAllowed(),/uncertain/);const count=f.calls.length;
 f.failRecord(null);assert.equal((await f.runtime.inspect({operationId:'apply'})).output.outcome.status,'SUCCEEDED');
 assert.equal(f.calls.length,count);f.runtime.assertPreparationAllowed();
});

test('background node status and timed waits retain one worker and expose only accepted progress',async()=>{
 const f=fixture();let release;
 f.handler.configure=async()=>{f.calls.push('configure');await new Promise(r=>{release=r});return {verified:true,cleanup_complete:true};};
 const start=f.runtime.startNodeApply(request());assert.equal(start.state,'running');assert.equal(start.operation_id,'apply');
 assertJob(start);
 for(let i=0;!release&&i<100;i++)await new Promise(r=>setImmediate(r));assert.ok(release);
 const count=f.calls.length,events=f.events.length;
 const status=f.runtime.nodeApplyStatus('apply');assert.equal(status.progress.pending_phase,'configure');
 assertJob(status);
 assert.equal(status.progress.cleanup_complete,false);assert.equal(status.progress.execution.status,'not_requested');
 assert.deepEqual(await f.runtime.waitNodeApply('apply',{timeoutMs:1}),status);
 assert.deepEqual(f.runtime.startNodeApply(request()),status);assert.equal(f.calls.length,count);assert.equal(f.events.length,events);
 // Public reads must not replace the observation context used by the worker.
 await assert.rejects(f.runtime.observe(),/background node operation is running/);
 await assert.rejects(f.runtime.inspect({operationId:'apply'}),/background node operation is running/);
 const rejected=f.runtime.requestFailure(Error('competing request'));
 assert.equal(rejected.request_rejected,true);
 assert.equal(rejected.output.active_node_job.operation_id,'apply');
 assert.equal(rejected.output.active_node_job.state,'running');
 assert.throws(()=>f.runtime.startNodeApply({...request(),operation_id:'competing'}),/Another node operation is running/);
 assert.throws(()=>f.runtime.nodeApplyStatus('competing'),/Unknown/);
 assert.equal(f.calls.length,count);assert.equal(f.events.length,events);
 status.progress.accepted_phases.push('forged');assert.ok(!f.runtime.nodeApplyStatus('apply').progress.accepted_phases.includes('forged'));
 const controller=new AbortController(),wait=f.runtime.waitNodeApply('apply',{timeoutMs:10000,signal:controller.signal});controller.abort();
 await assert.rejects(wait);assert.equal(f.runtime.nodeApplyStatus('apply').cancel_requested,false);
 await assert.rejects(f.runtime.runNodeApply({...request(),operation_id:'other'}),/running/);
 release();const done=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});assert.equal(done.state,'settled');assert.equal(done.outcome.status,'SUCCEEDED');
 assert.equal(f.runtime.requestFailure(Error('later request')).output.active_node_job,undefined);
 assertJob(done);
 assert.equal(f.calls.filter(x=>x==='configure').length,1);assert.equal(f.calls.filter(x=>x==='finish').length,1);
 assert.deepEqual(f.runtime.startNodeApply(request()),done);
 assert.throws(()=>f.runtime.startNodeApply({...request(),target:{...request().target,label:'Changed'}}),/different parameters/);
});

test('background cancellation holds the browser gate until cleanup and explicit resume uses the accepted phases',async()=>{
 const f=fixture();let release;
 f.handler.configure=async()=>{f.calls.push('configure');await new Promise(r=>{release=r});return {verified:true,cleanup_complete:true};};
 f.runtime.startNodeApply(request());
 for(let i=0;!release&&i<100;i++)await new Promise(r=>setImmediate(r));assert.ok(release);
 const cancelled=f.runtime.cancelNodeApply('apply');assert.equal(cancelled.state,'running');assert.equal(cancelled.cancel_requested,true);
 assert.equal(cancelled.server_stop_requested,false);assert.throws(()=>f.runtime.assertPreparationAllowed(),/running/);
 assert.equal(f.runtime.startNodeApply(request(),{resume:true}).attempt,1);
 release();const stopped=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
 assert.equal(stopped.state,'settled');assert.equal(stopped.outcome.status,'AMBIGUOUS');assert.equal(stopped.outcome.cleanup_complete,true);
 assert.equal(stopped.progress.pending_phase,null);assert.ok(!f.calls.includes('finish'));
 const count=f.calls.length;await f.runtime.inspect({operationId:'apply'});assert.equal(f.calls.length,count);
 assert.equal(f.runtime.startNodeApply({operation_id:'apply'},{resume:true}).attempt,2);
 const done=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});assert.equal(done.outcome.status,'SUCCEEDED');
 assert.equal(f.calls.filter(x=>x==='create').length,1);assert.equal(f.calls.filter(x=>x==='configure').length,1);assert.equal(f.calls.filter(x=>x==='finish').length,1);
});

test('background failed worker is settled and cannot silently restart or accept a changed handler',async()=>{
 const f=fixture();f.failRecord('prepared');f.runtime.startNodeApply(request());
 const failed=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});assert.equal(failed.state,'settled');assert.equal(failed.error.code,'NODE_WORKER_REJECTED');
 assert.equal(failed.outcome,null);assert.equal(f.calls.length,0);assert.deepEqual(f.runtime.startNodeApply(request()),failed);
 assertJob(failed);
 f.handler.revision='changed';assert.throws(()=>f.runtime.startNodeApply(request()),/different parameters/);
 assert.throws(()=>f.runtime.nodeApplyStatus('unknown'),/Unknown/);await assert.rejects(f.runtime.waitNodeApply('apply',{timeoutMs:Infinity}),/timeout/);
});

test('server stop retains the gate through confirmed cancellation and preserves configured partial result',async()=>{
 const f=fixture(),r={...request(),finish:'execute'};let entered=false,finishStop;
 f.drivers.finish=async()=>({verified:true,cleanup_complete:true,mode:'execute',execution_started:true,execution_id:'doc:root:1'});
 f.drivers.waitExecution=async ctx=>{
  entered=true;assert.equal(ctx.signal.aborted,false);
  await new Promise(resolve=>ctx.stopSignal.addEventListener('abort',resolve,{once:true}));
  assert.equal(ctx.signal.aborted,false);f.calls.push('server_cancel');
  await new Promise(resolve=>{finishStop=resolve});
  return {verified:true,cleanup_complete:true,status:'cancelled',stop_verified:true,owner_verified:true,execution_id:'doc:root:1'};
 };
 f.drivers.readOutput=async()=>assert.fail('Cancelled execution must not read output');
 f.runtime.startNodeApply(r);
 for(let i=0;!entered&&i<100;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(entered);
 const before=f.runtime.nodeApplyStatus('apply');assert.equal(before.server_stop_requested,false);
 const requested=f.runtime.stopNodeApply('apply');assert.equal(requested.server_stop_requested,true);assert.equal(requested.cancel_requested,false);
 assert.equal(f.runtime.stopNodeApply('apply').server_stop_requested,true);
 for(let i=0;!finishStop&&i<100;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(finishStop);
 assert.throws(()=>f.runtime.assertPreparationAllowed(),/running/);
 await assert.rejects(f.runtime.runNodeApply({...r,operation_id:'other'}),/running/);
 assert.equal((await f.runtime.waitNodeApply('apply',{timeoutMs:1})).state,'running');
 finishStop();const done=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
 assert.equal(done.state,'settled');assert.equal(done.outcome.status,'FAILED');
 assert.equal(done.outcome.error.code,'NODE_EXECUTION_CANCELLED');
 assertJob(done);
 const result=done.outcome.output;assert.equal(result.configuration.status,'applied');assert.equal(result.execution.status,'cancelled');
 assert.equal(result.node.node_id,'new');assert.equal(result.output.status,'not_refreshed');assert.equal(result.package_saved,false);
 assert.equal(result.checkpoint_kind,'local_node_stopped');assert.ok(f.events.some(e=>e.phase==='node_checkpoint'&&e.result.execution.status==='cancelled'));
 f.runtime.assertPreparationAllowed();const count=f.calls.length;
 assert.deepEqual(f.runtime.startNodeApply(r,{resume:true}),done);assert.deepEqual(f.runtime.stopNodeApply('apply'),done);
 assert.equal((await f.runtime.runNodeApply(r)).output.execution.status,'cancelled');assert.equal(f.calls.length,count);
});

test('server stop refuses an execution that has not been identified',async()=>{
 const f=fixture();let release;
 f.handler.configure=async()=>{await new Promise(r=>{release=r});return {verified:true,cleanup_complete:true}};
 f.runtime.startNodeApply(request());for(let i=0;!release&&i<100;i++)await new Promise(r=>setImmediate(r));
 assert.throws(()=>f.runtime.stopNodeApply('apply'),/identified execution/);
 assert.equal(f.runtime.nodeApplyStatus('apply').server_stop_requested,false);
 release();await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
});

test('unknown server stop preserves the unresolved execution and prevents another run',async()=>{
 const f=fixture(),r={...request(),finish:'execute'};let entered=false;
 f.drivers.finish=async()=>({verified:true,cleanup_complete:true,mode:'execute',execution_started:true,execution_id:'doc:root:1'});
 f.drivers.waitExecution=async ctx=>{entered=true;await new Promise(resolve=>ctx.stopSignal.addEventListener('abort',resolve,{once:true}));throw Error('Unknown stop receipt');};
 f.runtime.startNodeApply(r);for(let i=0;!entered&&i<100;i++)await new Promise(resolve=>setImmediate(resolve));
 f.runtime.stopNodeApply('apply');const done=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
 assert.equal(done.outcome.status,'AMBIGUOUS');assert.equal(done.outcome.output.pending_phase,'execute');
 assertJob(done);
 assert.equal(done.outcome.output.execution.execution_id,'doc:root:1');assert.equal(done.outcome.cleanup_complete,false);
 assert.throws(()=>f.runtime.assertPreparationAllowed(),/uncertain/);assert.deepEqual(f.runtime.stopNodeApply('apply'),done);
 await assert.rejects(f.runtime.runNodeApply({...r,operation_id:'other'}),/pending/);
});

test('public schema retains complete no-effect state and journal failure recovery snapshots',async()=>{
 for(const phase of ['node_apply_prepared','completed']) {
  const f=fixture();f.failRecord(phase);f.runtime.startNodeApply(request());
  const done=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});assertJob(done);
  assert.equal(done.state,'settled');assert.equal(done.outcome.output.package_saved,false);
  if(phase==='node_apply_prepared') {
   assert.equal(done.outcome.status,'NOT_APPLIED');assert.equal(done.outcome.effect_possible,false);
   assert.equal(done.outcome.output.node,null);assert.equal(f.calls.length,0);
  }else {
   assert.equal(done.outcome.output.node.node_id,'new');assert.equal(done.outcome.error.code,'EVIDENCE_WRITE_FAILED');
   const count=f.calls.length;f.failRecord(null);await f.runtime.inspect({operationId:'apply'});
   assert.equal(f.calls.length,count);
  }
 }
});

test('cached node operation cannot change from embedded to separate wizard placement',async()=>{
 const f=fixture();await f.runtime.runNodeApply(request());f.handler.output_wizard='separate';
 await assert.rejects(f.runtime.runNodeApply(request()),/different parameters/);
});
test('background node operation identity includes separate wizard placement',async()=>{
 const f=fixture();f.runtime.startNodeApply(request());await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
 f.handler.output_wizard='separate';assert.throws(()=>f.runtime.startNodeApply(request()),/different parameters/);
});

for(const mismatch of ['missing_upload','digest'])test('real source preflight '+mismatch+' releases the session before any browser call',async()=>{
 const {verifyTextImportSource,validateTextImportNodeParameters}=await import('../lib/text-import-node.mjs');
 const r=request();r.parameters={source:{artifact_id:'a',upload_operation_id:'upload',bytes:12,sha256:'a'.repeat(64)},settings:{
  source:{source_path:'/user/data.csv',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
  format:{delimiter:';',text_qualifier:'"',null_marker:'NULL',decimal_separator:'.'},
  columns:[{name:'A',label:'A',type:'integer',data_kind:'Дискретный',used:true}]}};
 const artifact={artifact_id:'a',bytes:12,sha256:'a'.repeat(64)},proof={...artifact,status:'SUCCEEDED',verification_id:'verify',bytes_verified:true,upload_completion_verified:true,destination:'/user/data.csv'};
 const uploads=[{operation_id:'upload',artifact,outcome:{status:'SUCCEEDED',cleanup_complete:true,operation_id:'upload',action_key:'artifact.upload',output:{...proof,server_copy_verification:proof}}}];
 const f=fixture();f.handler.validate=validateTextImportNodeParameters;
 f.drivers.verifySource=async p=>{f.calls.push('source');return verifyTextImportSource(p,uploads);};
 const bad=structuredClone(r);bad.operation_id='bad-source';
 if(mismatch==='missing_upload')bad.parameters.source.upload_operation_id='typo';else bad.parameters.source.sha256='b'.repeat(64);
 const failed=await f.runtime.runNodeApply(bad);
 assert.equal(failed.status,'NOT_APPLIED');assert.equal(failed.effect_possible,false);assert.equal(failed.cleanup_complete,true);assert.equal(failed.output.pending_phase,null);
 assert.deepEqual(f.calls,['source']);f.runtime.assertPreparationAllowed();
 assert.ok(f.events.some(e=>e.phase==='node_phase_refused'&&e.receipt.phase==='source'));
 await f.runtime.runNodeApply(bad);assert.deepEqual(f.calls,['source']);
 assert.equal((await f.runtime.runNodeApply(r)).status,'SUCCEEDED');assert.equal(f.calls.filter(c=>c==='create').length,1);
});

for(const ending of ['completed','cancelled'])test('cancel during execute wait resumes the same execution and can finish '+ending,async()=>{
 let operation,waitEntered,attempt=0;const f=fixture({wrapDrivers:(ctx,drivers)=>{operation=ctx.operation;return drivers;}});
 const r={...request(),finish:'execute'};
 f.drivers.finish=async()=>{f.calls.push('finish');operation.cleanupConfirmed=true;return {verified:true,cleanup_complete:true,mode:'execute',execution_id:'doc:root:1'};};
 f.drivers.waitExecution=async ctx=>{
  attempt++;waitEntered=true;f.calls.push('wait');
  if(attempt===1){await new Promise(resolve=>ctx.signal.addEventListener('abort',resolve,{once:true}));const error=new Error('read wait cancelled');
   error.nodeExecutionWaitPause={execution_id:ctx.execution.execution_id,read_only:true,cleanup_complete:true};throw error;}
  if(ending==='cancelled')await new Promise(resolve=>ctx.stopSignal.addEventListener('abort',resolve,{once:true}));
  return {verified:true,cleanup_complete:true,status:ending,execution_id:ctx.execution.execution_id,...(ending==='cancelled'?{owner_verified:true,stop_verified:true}:{})};
 };
 f.drivers.readOutput=async(read,ctx)=>({verified:true,cleanup_complete:true,status:'complete',ports:[],evidence_ref:'read',execution_id:ctx.execution.execution_id});
 f.runtime.startNodeApply(r);
 for(let i=0;!waitEntered&&i<100;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(waitEntered);
 f.runtime.cancelNodeApply('apply');const paused=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});assertJob(paused);
 assert.equal(paused.outcome.status,'AMBIGUOUS');assert.equal(paused.outcome.cleanup_complete,true);assert.equal(paused.progress.pending_phase,null);
 assert.equal(paused.progress.execution.execution_id,'doc:root:1');assert.ok(operation.nodeApply.execution_wait);
 const originalDeadline=operation.nodeApply.execution_wait.deadline;
 await assert.rejects(f.runtime.runNodeApply({...r,operation_id:'other'}),/remains pending/);
 const count=f.calls.length;const inspected=await f.runtime.inspect({operationId:'apply'});assert.equal(inspected.output.cleanup_confirmed,true);assert.equal(f.calls.length,count);
 waitEntered=false;assert.equal(f.runtime.startNodeApply(r,{resume:true}).attempt,2);
 if(ending==='cancelled'){
  for(let i=0;!waitEntered&&i<100;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(waitEntered);
  f.runtime.stopNodeApply('apply');
 }
 const done=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});assertJob(done);
 assert.equal(done.outcome.output.execution.status,ending);assert.equal(done.outcome.cleanup_complete,true);
 assert.equal(f.calls.filter(c=>c==='create').length,1);assert.equal(f.calls.filter(c=>c==='configure').length,1);assert.equal(f.calls.filter(c=>c==='finish').length,1);
 assert.equal(operation.nodeApply.execution_wait,undefined);
 const waits=f.events.filter(e=>e.phase==='node_phase_prepared'&&e.receipt.phase==='execute');
 assert.equal(waits.length,2);assert.ok(waits[1].receipt.deadline<=originalDeadline);f.runtime.assertPreparationAllowed();
});

for(const fault of ['unknown_transport','cleanup_missing','foreign_execution','journal_failure','untyped_abort'])test('execute wait refuses unsafe pause: '+fault,async()=>{
 let operation,entered;const f=fixture({wrapDrivers:(ctx,drivers)=>{operation=ctx.operation;return drivers;}}),r={...request(),finish:'execute'};
 f.drivers.finish=async()=>{operation.cleanupConfirmed=fault!=='cleanup_missing';return {verified:true,cleanup_complete:true,mode:'execute',execution_id:'doc:root:1'};};
 f.drivers.waitExecution=async ctx=>{
  entered=true;await new Promise(resolve=>ctx.signal.addEventListener('abort',resolve,{once:true}));
  if(fault==='unknown_transport')operation.transportUncertain=true;
  const error=new Error('interrupted');if(fault!=='untyped_abort')error.nodeExecutionWaitPause={read_only:true,cleanup_complete:true,execution_id:fault==='foreign_execution'?'other':'doc:root:1'};
  throw error;
 };
 if(fault==='journal_failure')f.failRecord('node_phase_paused');
 f.runtime.startNodeApply(r);for(let i=0;!entered&&i<100;i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(entered);
 f.runtime.cancelNodeApply('apply');const done=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
 assert.equal(done.outcome.status,'AMBIGUOUS');assert.equal(done.outcome.cleanup_complete,false);assert.equal(done.progress.pending_phase,'execute');
 await assert.rejects(f.runtime.runNodeApply(r,{resume:true}),/unresolved phase/);
});

test('verified unchanged workflow followed by typed preflight refusal frees the gate without creating a node',async()=>{
 let invalid=true;
 const f=fixture({wrapDrivers:(_context,drivers)=>({...drivers,beforeTarget:async()=>{
  if(invalid){const error=Error('missing input');error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 }})});
 f.adapter.verifyWorkflow=async()=>({status:'SUCCEEDED',verified:true,document_id:request().document_id,workflow_ref:request().workflow_ref,effect_possible:false,cleanup_complete:true});
 f.adapter.activateWorkflow=f.adapter.verifyWorkflow;
 const refused=await f.runtime.runNodeApply(request());assert.equal(refused.status,'NOT_APPLIED');assert.equal(refused.effect_possible,false);assert.equal(refused.cleanup_complete,true);assert.equal(refused.output.node,null);assert.equal(f.graph.nodes.length,0);
 invalid=false;const corrected=await f.runtime.runNodeApply({...request(),operation_id:'corrected'});assert.equal(corrected.status,'SUCCEEDED');assert.equal(f.graph.nodes.length,1);
});

test('fresh reopened graph is bound before source schema preflight',async()=>{
 let bound=false,preflightReads=0;
 const f=fixture({wrapDrivers:(_context,drivers)=>({...drivers,beforeTarget:async()=>{assert.equal(bound,true);preflightReads++;}})});
 f.adapter.verifyWorkflow=async()=>({status:'SUCCEEDED',verified:true,document_id:'doc',workflow_ref:workflow,effect_possible:false,cleanup_complete:true});
 f.adapter.activateWorkflow=f.adapter.verifyWorkflow;
 const observe=f.adapter.observe;f.adapter.observe=async(...args)=>{bound=true;return observe(...args);};
 assert.equal((await f.runtime.runNodeApply(request())).status,'SUCCEEDED');assert.equal(preflightReads,1);
});

test('foreign graph cannot reach source preflight after workflow verification',async()=>{
 let preflightReads=0;
 const f=fixture({wrapDrivers:(_context,drivers)=>({...drivers,beforeTarget:async()=>{preflightReads++;}})});
 f.adapter.verifyWorkflow=async()=>({status:'SUCCEEDED',verified:true,document_id:'doc',workflow_ref:workflow,effect_possible:false,cleanup_complete:true});
 f.adapter.activateWorkflow=f.adapter.verifyWorkflow;
 f.adapter.observe=async()=>({...f.graph,document_id:'foreign'});
 assert.notEqual((await f.runtime.runNodeApply(request())).status,'SUCCEEDED');assert.equal(preflightReads,0);assert.equal(f.graph.nodes.length,0);
});

function targetRecoveryFixture({fault='rename',...options}={}){
 const f=fixture(options),mutate=f.adapter.mutate;let lose=true;
 const workflowReceipt={status:'SUCCEEDED',verified:true,cleanup_complete:true,effect_possible:false,document_id:'doc',workflow_ref:workflow};
 f.adapter.activateWorkflow=async()=>structuredClone(workflowReceipt);
 f.adapter.verifyWorkflow=async()=>structuredClone(workflowReceipt);
 f.adapter.mutate=async e=>{
  const result=await mutate(e);
  if(e.kind==='create')f.graph.nodes[0].label='Imported';
  if(e.kind==='rename')f.graph.nodes[0].label=e.parameters.label;
  if(e.kind===fault&&lose){lose=false;throw Error('lost graph reply after effect');}
  return result;
 };
 return f;
}
test('composite target inspect verifies create/rename receipts without repeating effects or releasing the gate',async()=>{
 for(const fault of ['create','rename']){
  const f=targetRecoveryFixture({fault});
  const paused=await f.runtime.runNodeApply(request());assert.equal(paused.output.pending_phase,'target');
  const count=f.calls.length;
  const inspected=await f.runtime.inspect({operationId:'apply'});
  assert.equal(inspected.output.internal_resume_available,true);assert.equal(f.calls.length,count);
  assert.ok(!f.calls.includes('open'));assert.throws(()=>f.runtime.assertPreparationAllowed(),/uncertain/);
  await assert.rejects(f.runtime.runNodeApply({...request(),operation_id:'other'}),/pending/);
  await f.runtime.inspect({operationId:'apply'});assert.equal(f.calls.length,count);
  const resumed=await f.runtime.runNodeApply(request(),{resume:true});assert.equal(resumed.status,'SUCCEEDED');
  assert.equal(f.calls.filter(c=>c==='create').length,1);assert.equal(f.calls.filter(c=>c==='rename').length,1);
  assert.equal(f.calls.filter(c=>c==='open').length,1);f.runtime.assertPreparationAllowed();
  assert.equal(f.events.filter(e=>e.phase==='node_target_reconciled').length,1);
 }
});
test('composite target recovery rejects unknown cleanup, wrong labels and foreign graph effects',async()=>{
 for(const variant of ['unknown','unclean','label','epoch','foreign']){
  const f=targetRecoveryFixture();f.graph.dom_epoch=1;
  await f.runtime.runNodeApply(request());
  if(variant==='unknown')f.adapter.reconcile=async()=>({verified:false,cleanup_complete:true});
  if(variant==='unclean')f.adapter.reconcile=async()=>({verified:true,cleanup_complete:false});
  if(variant==='label')f.graph.nodes[0].label='Wrong';
  if(variant==='epoch')f.graph.dom_epoch=2;
  if(variant==='foreign')f.graph.links.push({source:'other',output:0,target:'new',input:0});
  const count=f.calls.length,inspected=await f.runtime.inspect({operationId:'apply'});
  assert.equal(inspected.output.internal_resume_available,false);
  await assert.rejects(f.runtime.runNodeApply(request(),{resume:true}),/unresolved phase/);
  assert.equal(f.calls.length,count);assert.ok(!f.calls.includes('open'));
 }
});
test('target graph and source are checked again before explicit composite resume',async()=>{
 for(const variant of ['graph','source']){
  const f=targetRecoveryFixture();let changed=false;
  f.drivers.verifySource=async()=>({verified:true,cleanup_complete:true,source:changed?'changed':'original'});
  await f.runtime.runNodeApply(request());await f.runtime.inspect({operationId:'apply'});
  if(variant==='graph')f.graph.nodes[0].label='External edit';else changed=true;
  const count=f.calls.length,result=await f.runtime.runNodeApply(request(),{resume:true});
  assert.equal(result.status,'AMBIGUOUS');assert.equal(f.calls.length,count);assert.ok(!f.calls.includes('open'));
 }
});
test('target recovery journal failure and concurrent inspection retain the original gate',async()=>{
 const f=targetRecoveryFixture();await f.runtime.runNodeApply(request());f.failRecord('node_target_reconciled');
 await assert.rejects(f.runtime.inspect({operationId:'apply'}),/disk unavailable/);
 assert.throws(()=>f.runtime.assertPreparationAllowed(),/uncertain/);assert.ok(!f.calls.includes('open'));
 f.failRecord(null);let release;const observe=f.adapter.observe;
 f.adapter.observe=async()=>{await new Promise(r=>{release=r});return observe();};
 const inspecting=f.runtime.inspect({operationId:'apply'});
 for(let i=0;!release&&i<100;i++)await new Promise(r=>setImmediate(r));assert.ok(release);
 await assert.rejects(f.runtime.runNodeApply({...request(),operation_id:'other'}),/running/);
 release();await inspecting;assert.ok(!f.calls.includes('open'));
});
test('recovered target never extends the original configuration deadline',async()=>{
 let time=1000;const f=targetRecoveryFixture({now:()=>time});
 await f.runtime.runNodeApply(request());time=40000;
 await f.runtime.inspect({operationId:'apply'});
 const count=f.calls.length,result=await f.runtime.runNodeApply(request(),{resume:true});
 assert.equal(result.status,'AMBIGUOUS');assert.equal(f.calls.length,count);assert.ok(!f.calls.includes('open'));
});

test('source deactivation proof cannot become a no-effect refusal when later palette preflight fails',async()=>{
 const f=fixture({wrapDrivers:(_context,drivers)=>({...drivers,beforeTarget:async()=>({verified:true,cleanup_complete:true,effect_possible:true})})});
 f.adapter.verifyWorkflow=async()=>({status:'SUCCEEDED',verified:true,document_id:'doc',workflow_ref:workflow,effect_possible:false,cleanup_complete:true});
 f.adapter.activateWorkflow=f.adapter.verifyWorkflow;
 f.adapter.preflight=async()=>{throw Error('Component unavailable');};
 const result=await f.runtime.runNodeApply(request());
 assert.equal(result.status,'AMBIGUOUS');assert.equal(result.effect_possible,true);
 assert.equal(result.output.pending_phase,'target');assert.equal(f.graph.nodes.length,0);
});

const inspectedSourceProof=()=>({verified:true,cleanup_complete:true,effect_possible:true,settings_changed:false,
 target_refusal:{phase:'target',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,verification:'missing_values_preflight_completed'}});
function refusedAfterSource(proof=inspectedSourceProof()){
 const f=fixture({wrapDrivers:(_context,drivers)=>({...drivers,beforeTarget:async()=>proof})});
 f.adapter.verifyWorkflow=async()=>({status:'SUCCEEDED',verified:true,document_id:'doc',workflow_ref:workflow,effect_possible:false,cleanup_complete:true});
 f.adapter.activateWorkflow=f.adapter.verifyWorkflow;
 const mutate=f.adapter.mutate;
 f.adapter.mutate=async e=>e.parameters.position?.x===320?{status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true,error:'Requested drop surface is not reachable'}:mutate(e);
 return f;
}
test('verified source activity effect and refused graph settle FAILED, preserving ID and allowing a corrected new request',async()=>{
 const f=refusedAfterSource(),r=request();
 await f.runtime.startNodeApply(r);const job=await f.runtime.waitNodeApply(r.operation_id,{timeoutMs:1000});assertJob(job);
 assert.equal(job.outcome.status,'FAILED');assert.equal(job.outcome.effect_possible,true);assert.equal(job.outcome.cleanup_complete,true);
 assert.equal(job.outcome.output.pending_phase,null);assert.equal(job.outcome.output.node,null);assert.equal(f.graph.nodes.length,0);
 f.runtime.assertPreparationAllowed();assert.equal((await f.runtime.inspect({operationId:r.operation_id})).output.state,'resolved');
 const count=f.calls.length;assert.equal((await f.runtime.runNodeApply(r)).status,'FAILED');assert.equal(f.calls.length,count);
 assert.throws(()=>f.runtime.startNodeApply({...r,target:{...r.target,position:{x:500,y:280}}},{resume:true}),/different parameters/);
 await assert.rejects(f.runtime.runNodeApply(r,{resume:true}),/original inspected/);
 const corrected={...r,operation_id:'corrected',target:{...r.target,position:{x:500,y:280}}};
 assert.equal((await f.runtime.runNodeApply(corrected)).status,'SUCCEEDED');assert.equal(f.graph.nodes.length,1);
});
for(const [label,change] of [
 ['missing proof',p=>delete p.target_refusal],['unverified source',p=>p.verified=false],
 ['unfinished source cleanup',p=>p.cleanup_complete=false],['settings changed',p=>p.settings_changed=true],
 ['foreign verification',p=>p.target_refusal.verification='other'],
 ['unfinished refusal cleanup',p=>p.target_refusal.cleanup_complete=false],
 ['unknown settings',p=>p.target_refusal.settings_unchanged=false],
])test('target refusal retains uncertainty for '+label,async()=>{
 const proof=inspectedSourceProof();change(proof);const f=refusedAfterSource(proof);
 const r=await f.runtime.runNodeApply(request());assert.equal(r.status,'AMBIGUOUS');
 assert.equal(r.output.pending_phase,'target');assert.throws(()=>f.runtime.assertPreparationAllowed(),/pending|uncertain/);
});
test('known source inspection cannot clear a lost target gesture reply',async()=>{
 const f=refusedAfterSource();f.adapter.mutate=async()=>{throw Error('reply lost');};
 const r=await f.runtime.runNodeApply(request());assert.equal(r.status,'AMBIGUOUS');assert.equal(r.cleanup_complete,false);
 assert.throws(()=>f.runtime.assertPreparationAllowed(),/pending|uncertain/);
});
test('refusal journal failure keeps the operation pending',async()=>{
 const f=refusedAfterSource();f.failRecord('node_phase_refused');
 const r=await f.runtime.runNodeApply(request());assert.equal(r.status,'AMBIGUOUS');assert.equal(r.cleanup_complete,false);
 assert.throws(()=>f.runtime.assertPreparationAllowed(),/pending|uncertain/);
});

test('clipped explicit coordinates refuse before any source, browser or journal effect; corrected omission is accepted',async()=>{
 const f=fixture();const bad=request();bad.target.position={x:8,y:8};
 await assert.rejects(f.runtime.runNodeApply(bad),/target\.position\.x.*64/);
 assert.deepEqual(f.calls,[]);assert.deepEqual(f.events,[]);assert.equal(f.graph.nodes.length,0);
 const corrected=request();corrected.operation_id='corrected-edge';delete corrected.target.position;
 f.adapter.choosePosition=async()=>({x:104,y:200});
 const result=await f.runtime.runNodeApply(corrected);assert.equal(result.status,'SUCCEEDED');assert.equal(f.graph.nodes.length,1);
 assert.deepEqual(f.graph.nodes[0].position,{x:104,y:200});
});

test('public node inspect/resume recovers a lost precondition refusal without repeating the created node',async()=>{
 const f=fixture(),r=request(),mutate=f.adapter.mutate;let refused;
 f.handlers.set('transform.sorting',{...f.handler,modes:['keys']});r.target.type='transform.sorting';r.mode='keys';
 const source={document_id:'doc',workflow_id:'wf',node_id:'source'};
 f.graph.nodes.push({ref:source,type:'imports.text',label:'Original',position:{x:80,y:80},inputs:[],outputs:[0]});
 r.inputs=[{source,output:0,input:0}];
 f.adapter.mutate=async e=>{
  if(e.kind==='connect'){
   if(!refused){refused={status:'FAILED',action_key:'link.create',operation_id:e.id,phase:'preconditions',effect_possible:false,cleanup_complete:true,error:{code:'CAPABILITY_ERROR'}};throw Error('lost refusal reply');}
   f.calls.push('connect');f.graph.links.push(e.parameters.edge);return {status:'SUCCEEDED',cleanup_complete:true};
  }
  const result=await mutate(e);if(e.kind==='create')f.graph.nodes.find(n=>n.ref.node_id==='new').inputs=[0];return result;
 };
 f.adapter.reconcile=async()=>({completed:true,verified:false,cleanup_complete:true,receipt:refused});
 const initial=await f.runtime.runNodeApply(r);assert.equal(initial.output.pending_phase,'target');
 const count=f.calls.length;await f.runtime.inspect({operationId:r.operation_id});
 assert.equal(f.calls.length,count);assert.equal(f.calls.includes('open'),false);
 const result=await f.runtime.runNodeApply(r,{resume:true});assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
 assert.equal(f.calls.filter(c=>c==='create').length,1);assert.equal(f.calls.filter(c=>c==='connect').length,1);
 assert.equal(f.graph.nodes.length,2);assert.equal(f.graph.links.length,1);
});
