import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeProcedure,NodeReadinessTimeout} from '../lib/node-procedure.mjs';

function fixture({delays=[15760],confirmIdentity=false,ready=true,change,recordFailure,refreshFailure=false,onRefresh,deadline=60000}={}) {
 let clock=1,reads=0,samples=0,mutations=0;const records=[],controller=new AbortController();
 const pending={phase:'read',effect_possible:true};
 const operation={id:'fresh-table-read',action:{action_key:'node.apply',revision:'1'},deadline,pending,
  checkpoint:{workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'},document_id:'doc'}};
 const state={origin:'https://example.test',loginom_build:'7.4.2',workflow_ref:operation.checkpoint.workflow_ref,
  dom_epoch:{document:'doc',revision:1},scan:{complete:true},wizard:{status:'absent'},
  ui:{masks:[],dialogs:[],truncated:{elements:false,masks:false,dialogs:false},elements:[]}};
 const channel=createNodeProcedure({operation,signal:controller.signal,now:()=>clock,monotonicNow:()=>clock,maxSteps:100,
  targetOrigin:state.origin,targetBuild:state.loginom_build,wait:async ms=>{clock+=ms},
  execute:async()=>{reads++;clock+=100;return{status:'SUCCEEDED',output:structuredClone(state)}},
  record:async event=>{
   records.push(structuredClone(event));
   if(event.phase==='node_observation_sample'){
    clock+=delays[samples++]??0;
    if(recordFailure)throw recordFailure;
    if(samples===1){state.dom_epoch.revision=2;change?.({state,operation,controller});}
   }
   if(event.phase==='node_observation_refresh_prepared'){
    if(refreshFailure)throw Error('secondary refresh recording failure');
    onRefresh?.({operation,controller,advance:ms=>{clock+=ms},event});
   }
   return structuredClone(event);
  },wrapMutation:()=>{mutations++;throw Error('unexpected mutation')}});
 return{channel,records,operation,pending,state,controller,reads:()=>reads,mutations:()=>mutations,options:{
  condition:'Table data_types toggle available',ready:()=>ready,
  ...(confirmIdentity?{confirmIdentity:s=>s.dom_epoch}:{}),timeoutMs:15000,refreshAfterLateAcknowledgement:true}};
}

test('observed slow fsync refuses the first sample and rediscovers once under the original parent',async()=>{
 const f=fixture(),snapshot=await f.channel.observe(f.options);
 assert.equal(snapshot.dom_epoch.revision,2);assert.equal(f.reads(),4);assert.equal(f.mutations(),0);
 assert.strictEqual(f.operation.pending,f.pending);assert.equal(f.operation.deadline,60000);
 const timeout=f.records.find(e=>e.phase==='node_observation_timeout');assert.equal(timeout.effect_possible,false);
 assert.equal(timeout.parent_deadline,60000);assert.equal(timeout.timeout_ms,15000);
 assert.equal(timeout.last_sample_acknowledgement.satisfied,true);assert.equal(timeout.last_sample_acknowledgement.acknowledgement_elapsed_ms,15760);
 const completed=f.records.filter(e=>e.phase==='node_observation_completed');assert.equal(completed.length,1);
 assert.notEqual(completed[0].internal_operation_id,timeout.internal_operation_id);
 assert.equal(f.records.filter(e=>e.phase==='node_observation_refresh_prepared').length,1);
});
test('default observers retain the original late-ack refusal',async()=>{
 const f=fixture();await assert.rejects(f.channel.observe({...f.options,refreshAfterLateAcknowledgement:false}),NodeReadinessTimeout);
 assert.equal(f.reads(),2);assert.equal(f.records.some(e=>e.phase==='node_observation_completed'),false);
});
test('a second slow acknowledgement is terminal; no unbounded refresh',async()=>{
 const f=fixture({delays:[15760,15760]});await assert.rejects(f.channel.observe(f.options),NodeReadinessTimeout);
 assert.equal(f.reads(),4);assert.equal(f.records.filter(e=>e.phase==='node_observation_refresh_prepared').length,1);
 assert.equal(f.records.filter(e=>e.phase==='node_observation_timeout').length,2);assert.equal(f.mutations(),0);
});
for(const [name,options]of[
 ['unsatisfied sample',{ready:false}],
 ['insufficient identity confirmations',{confirmIdentity:true}],
 ['parent expired',{deadline:16000,delays:[17000]}],
 ['cancelled',{change:({controller})=>controller.abort(Error('cancel'))}],
 ['parent replaced',{change:({operation})=>{operation.deadline=120000;}}],
])test(name+' does not refresh or authorize',async()=>{
 const f=fixture(options);await assert.rejects(f.channel.observe(f.options));assert.equal(f.reads(),2);
 assert.equal(f.records.some(e=>e.phase==='node_observation_refresh_prepared'),false);
 assert.equal(f.records.some(e=>e.phase==='node_observation_completed'),false);assert.equal(f.mutations(),0);
});
test('foreign document on fresh rediscovery remains refused',async()=>{
 const f=fixture({change:({state})=>{state.dom_epoch.document='foreign';}});
 await assert.rejects(f.channel.observe(f.options),/document or workflow changed/);
 assert.equal(f.records.some(e=>e.phase==='node_observation_completed'),false);assert.equal(f.mutations(),0);
});
test('failed refresh journal acknowledgement preserves the original timeout',async()=>{
 const f=fixture({refreshFailure:true});await assert.rejects(f.channel.observe(f.options),NodeReadinessTimeout);
 assert.equal(f.reads(),2);assert.equal(f.mutations(),0);
});
test('failed sample persistence is primary and never eligible',async()=>{
 const failure=Error('sample fsync failed'),f=fixture({recordFailure:failure});
 await assert.rejects(f.channel.observe(f.options),e=>e===failure);assert.equal(f.reads(),2);
 assert.equal(f.records.some(e=>e.phase==='node_observation_refresh_prepared'),false);
});
test('a timely sample adds no retry records or extra reads',async()=>{
 const f=fixture({delays:[20]});await f.channel.observe(f.options);assert.equal(f.reads(),2);
 assert.deepEqual(f.records.map(e=>e.phase),['node_observation_sample','node_observation_completed']);
});

for(const [name,onRefresh]of[
 ['deadline expiry',({advance})=>advance(60000)],
 ['deadline replacement',({operation})=>{operation.deadline=120000;}],
 ['cancellation',({controller})=>controller.abort(Error('cancel during acknowledgement'))],
 ['incorrect reason',({event})=>{event.reason='foreign';}],
])test(name+' during refresh acknowledgement preserves original refusal',async()=>{
 const f=fixture({onRefresh});await assert.rejects(f.channel.observe(f.options),NodeReadinessTimeout);
 assert.equal(f.reads(),2);assert.equal(f.mutations(),0);
 assert.equal(f.records.some(e=>e.phase==='node_observation_completed'),false);
});
