import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {createNodeProcedure,NodeReadinessTimeout}=await import(process.env.NODE_PROCEDURE_UNDER_TEST
 ?pathToFileURL(process.env.NODE_PROCEDURE_UNDER_TEST).href:'../lib/node-procedure.mjs');

function fixture({ackDelay=0,requiredTwo=false,failure,fail=false}={}){
 let clock=1,reads=0;const records=[];
 const pending={phase:'finish',effect_possible:true};
 const operation={id:'new-boundary-control',action:{action_key:'node.apply',revision:'1'},deadline:60000,pending,
  checkpoint:{workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'},document_id:'doc'}};
 const state={origin:'https://example.test',loginom_build:'7.4.2',workflow_ref:operation.checkpoint.workflow_ref,
  dom_epoch:{document:'doc',revision:1},scan:{complete:true},wizard:{status:'absent'},
  ui:{masks:[],dialogs:[],truncated:{elements:false,masks:false,dialogs:false},elements:[]}};
 const channel=createNodeProcedure({operation,now:()=>clock,monotonicNow:()=>clock,maxSteps:8,
  targetOrigin:state.origin,targetBuild:state.loginom_build,wait:async ms=>{clock+=ms},
  execute:async()=>{reads++;clock+=100;return{status:'SUCCEEDED',output:structuredClone(state)}},
  record:async event=>{records.push(structuredClone(event));if(event.phase==='node_observation_sample'){
   clock+=ackDelay;if(fail)throw failure;}return structuredClone(event)},
  wrapMutation:()=>{throw Error('unexpected mutation')}});
 return{channel,records,operation,pending,reads:()=>reads,options:{condition:'calculator graph execution continuity checkpoint',
  ready:()=>true,...(requiredTwo?{confirmIdentity:s=>s.dom_epoch}:{}),timeoutMs:15000}};
}

test('late durable sample acknowledgement refuses readiness and preserves original pending/deadlines',async()=>{
 const f=fixture({ackDelay:26234});
 await assert.rejects(f.channel.observe(f.options),e=>e instanceof NodeReadinessTimeout);
 assert.equal(f.reads(),2);assert.strictEqual(f.operation.pending,f.pending);assert.equal(f.operation.deadline,60000);
 const timeout=f.records.find(e=>e.phase==='node_observation_timeout');
 assert.deepEqual(timeout.last_sample_acknowledgement,{sample:0,satisfied:true,required_samples:1,confirmations:1,
  sampled_elapsed_ms:200,acknowledgement_elapsed_ms:26234,acknowledged_elapsed_ms:26434});
 assert.equal(timeout.effect_possible,false);assert.equal(f.records.filter(e=>e.phase==='node_observation_completed').length,0);
 await assert.rejects(f.channel.act({verb:'click',ref:'anything'}),/fresh internal observation/);
});
test('timely single sample remains usable without another read or diagnostic write',async()=>{
 const f=fixture({ackDelay:20});await f.channel.observe(f.options);assert.equal(f.reads(),2);
 assert.deepEqual(f.records.map(e=>e.phase),['node_observation_sample','node_observation_completed']);
});
test('late first sample cannot satisfy required identity confirmation',async()=>{
 const f=fixture({ackDelay:26234,requiredTwo:true});await assert.rejects(f.channel.observe(f.options),NodeReadinessTimeout);
 const ack=f.records.find(e=>e.phase==='node_observation_timeout').last_sample_acknowledgement;
 assert.equal(ack.required_samples,2);assert.equal(ack.confirmations,1);assert.equal(f.reads(),2);
});
test('sample recorder Error and falsy remain primary without fabricated acknowledgement',async()=>{
 for(const failure of [new Error('fsync failed'),false,0,null,undefined,'']){
  const f=fixture({ackDelay:26234,failure,fail:true});let rejected=false;
  try{await f.channel.observe(f.options)}catch(e){rejected=true;assert.strictEqual(e,failure)}
  assert.equal(rejected,true);assert.strictEqual(f.operation.pending,f.pending);
  assert.equal(f.records.filter(e=>['node_observation_timeout','node_observation_completed'].includes(e.phase)).length,0);
 }
});
