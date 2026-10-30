import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeOperationRunner} from '../lib/node-operation-runner.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';

test('shutdown cancels locally, drains the original worker and preserves uncertainty',async()=>{
 const finish=Promise.withResolvers();let signal,stopSignal;
 const runner=createNodeOperationRunner({validate:()=>1,progress:()=>null,
  run:async(_request,options)=>{signal=options.signal;stopSignal=options.stopSignal;await finish.promise;
   return {status:'AMBIGUOUS',effect_possible:true,cleanup_complete:false};}});
 runner.start({operation_id:'own'});
 let closed=false;const closing=runner.close().then(()=>{closed=true;});
 assert.equal(signal.aborted,true);assert.equal(stopSignal.aborted,false);
 assert.equal(runner.status('own').state,'running');assert.equal(closed,false);
 assert.throws(()=>runner.start({operation_id:'other'}),/closing/);
 assert.throws(()=>runner.start({operation_id:'own'},{resume:true}),/closing/);
 finish.resolve();await closing;
 assert.equal(runner.status('own').state,'settled');assert.equal(runner.unsettled,true);
 assert.equal(runner.status('own').outcome.status,'AMBIGUOUS');
 await runner.close();assert.equal(stopSignal.aborted,false);
});

test('rejected resume preserves the original unresolved outcome and recovery route',async()=>{
 const outcome={status:'AMBIGUOUS',effect_possible:true,cleanup_complete:false,
  error:{code:'NODE_APPLY_STOPPED',message:'source field missing'},
  output:{node:{document_id:'d',workflow_id:'w',node_id:'n'},execution:{status:'not_requested'}}};
 const runner=createNodeOperationRunner({validate:()=>1,progress:()=>({pending_phase:'configure'}),
  run:async(request,{resume})=>{if(resume)throw Error('Inspect unresolved phase');return outcome;}});
 runner.start({operation_id:'one'});await runner.wait('one');
 runner.start({operation_id:'one'},{resume:true});const result=await runner.wait('one');
 assert.equal(runner.unsettled,true);assert.deepEqual(result.outcome,outcome);
 const compact=compactNodeResult(result);
 assert.equal(compact.status,'AMBIGUOUS');assert.deepEqual(compact.node,outcome.output.node);
 assert.equal(compact.error.code,'NODE_WORKER_REJECTED');
 assert.equal(compact.error.original_error.code,'NODE_APPLY_STOPPED');
 assert.equal(compact.next_step.tool,'dock_operation_inspect');
 runner.start({operation_id:'one'},{resume:true});
 assert.deepEqual((await runner.wait('one')).outcome,outcome);
});

test('ID-only resume retains the immutable original request and validates the current handler',async()=>{
 const calls=[];let revision='v1';
 const runner=createNodeOperationRunner({validate:r=>{assert.ok(r.parameters);return revision;},progress:()=>null,
  run:async(r,options)=>{calls.push(structuredClone({r,resume:options.resume}));r.parameters.value='worker mutation';return {status:'AMBIGUOUS'};}});
 const request={operation_id:'original',parameters:{value:'accepted'}};
 runner.start(request);request.parameters.value='caller mutation';await runner.wait('original');
 assert.equal(runner.start({operation_id:'original'},{resume:true}).attempt,2);await runner.wait('original');
 assert.deepEqual(calls.map(c=>c.r.parameters.value),['accepted','accepted']);assert.equal(calls[1].resume,true);
 assert.throws(()=>runner.start({operation_id:'original',parameters:{value:'changed'}},{resume:true}),/different parameters/);
 assert.throws(()=>runner.start({operation_id:'unknown'},{resume:true}),/Unknown node operation/);
 revision='v2';assert.throws(()=>runner.start({operation_id:'original'},{resume:true}),/different parameters/);
 assert.equal(calls.length,2);
});

test('resume admission refusal keeps the settled attempt and is not consulted for running or completed jobs',async()=>{
 const admitted=[];let outcome={status:'AMBIGUOUS'},release;
 const runner=createNodeOperationRunner({validate:()=>1,progress:()=>null,
  admitResume:id=>{admitted.push(id);if(outcome.status==='AMBIGUOUS')throw Error('Resume requires the original inspected node checkpoint without an unresolved phase');},
  run:async()=>{await new Promise(r=>{release=r;});return outcome;}});
 runner.start({operation_id:'one'});
 assert.equal(runner.start({operation_id:'one'},{resume:true}).attempt,1);assert.deepEqual(admitted,[]);
 release();const settled=await runner.wait('one');
 assert.throws(()=>runner.start({operation_id:'one'},{resume:true}),/unresolved phase/);
 assert.deepEqual(runner.status('one'),settled);assert.deepEqual(admitted,['one']);
 outcome={status:'SUCCEEDED'};runner.start({operation_id:'two'});release();const done=await runner.wait('two');
 assert.deepEqual(runner.start({operation_id:'two'},{resume:true}),done);assert.deepEqual(admitted,['one']);
});

test('ID-only resume does not duplicate a running or completed worker',async()=>{
 let release,count=0;const runner=createNodeOperationRunner({validate:()=>1,progress:()=>null,
  run:async()=>{count++;await new Promise(r=>{release=r;});return {status:'SUCCEEDED'};}});
 runner.start({operation_id:'one',parameters:{}});
 assert.equal(runner.start({operation_id:'one'},{resume:true}).attempt,1);assert.equal(count,1);
 release();const done=await runner.wait('one');assert.deepEqual(runner.start({operation_id:'one'},{resume:true}),done);assert.equal(count,1);
});


for(const phase of ['execute','materialization_execute'])test('native Stop can address the identified '+phase+' wait only',async()=>{
 let pending=phase,execution_id='own-execution',observedSignal,release;
 const completion=new Promise(resolve=>{release=resolve;});
 const runner=createNodeOperationRunner({validate:()=>1,
  progress:()=>({pending_phase:pending,execution:{status:'pending',execution_id}}),
  run:async(request,{stopSignal})=>{observedSignal=stopSignal;await completion;return {status:'FAILED'};}});
 runner.start({operation_id:'stop-one'});
 pending='materialization_start';assert.throws(()=>runner.stop('stop-one'),/currently being awaited/);
 pending=phase;execution_id=null;assert.throws(()=>runner.stop('stop-one'),/identified execution/);
 execution_id='own-execution';assert.equal(runner.stop('stop-one').server_stop_requested,true);
 assert.equal(observedSignal.aborted,true);release();await runner.wait('stop-one');
});

test('trusted scan receipt survives wait/resume and cannot be replaced by request parameters',async()=>{
 const seen=[];
 const runner=createNodeOperationRunner({validate:()=>1,progress:()=>null,
   run:async(r,{scanReceipt})=>{seen.push(structuredClone(scanReceipt));return {status:'AMBIGUOUS'};}});
 const receipt={profile_id:'p',records:17};
 runner.start({operation_id:'scan',parameters:{scanReceipt:{records:999}}},{scanReceipt:receipt});
 receipt.records=999;await runner.wait('scan');
 runner.start({operation_id:'scan'},{resume:true,scanReceipt:{records:999}});await runner.wait('scan');
 assert.deepEqual(seen,[{profile_id:'p',records:17},{profile_id:'p',records:17}]);
 assert.equal(runner.status('scan').scanReceipt,undefined);
});
