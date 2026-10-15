import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {createNodeProcedure}=await import(process.env.NODE_PROCEDURE_UNDER_TEST
  ?pathToFileURL(process.env.NODE_PROCEDURE_UNDER_TEST).href:'../lib/node-procedure.mjs');

function fixture({failure,failAt,recordFails=false,lateAbort=false,prepared=false}={}){
 const records=[],controller=new AbortController(),late=new Error('late abort');
 let calls=0,clock=1,fail=false;
 const pending={phase:'read',effect_possible:true};
 const operation={id:'original',action:{action_key:'node.apply',revision:'1'},deadline:60000,
  checkpoint:{workflow_ref:{prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',workflow_id:'flow',navigation_path:[{tid:'flow',label:'Scenario'}]},document_id:'doc'},pending};
 const state={origin:'https://example.test',loginom_build:'7.4.2',workflow_ref:operation.checkpoint.workflow_ref,
  dom_epoch:{document:'doc',revision:1},scan:{complete:true},wizard:{status:'absent'},
  ui:{masks:[],dialogs:[],truncated:{elements:false,masks:false,dialogs:false},elements:[{ref:'ui-button',allowed_actions:['click']}]}};
 const binding=prepared?{document_id:'doc',workflow_ref:operation.checkpoint.workflow_ref,node:{document_id:'doc',workflow_id:'flow',node_id:'node'}}:undefined;
 if(prepared)state.prepared_node_context={...binding.node,verified:true,surface:'graph',locked:false,tid:'MF;TF-1;Graph;Replacement'};
 const channel=createNodeProcedure({operation,preparedNodeContext:binding,signal:controller.signal,maxSteps:20,now:()=>clock,
  monotonicNow:()=>clock,targetOrigin:'https://example.test',targetBuild:'7.4.2',
  record:async event=>{records.push(structuredClone(event));if(recordFails&&event.phase==='node_observation_read_failed')throw Error('secondary journal failure');return structuredClone(event);},
  wrapMutation:()=>{throw Error('unexpected mutation');},
  execute:async(code,options)=>{
   assert.equal(typeof code,'string');calls++;assert.ok(options.timeout>=5000&&options.timeout<=15000);clock+=100;
   if(fail&&calls===failAt){if(lateAbort)controller.abort(late);throw failure;}
   return {status:'SUCCEEDED',output:structuredClone(state)};
  }});
 return {channel,records,operation,pending,arm(){fail=true;calls=0;},calls:()=>calls};
}

for(const [stage,failAt]of [['roots',1],['detail',2]])for(const recordFails of [false,true]){
 test(stage+' read failure keeps first Error/falsy and pending; recorder failure='+recordFails,async()=>{
  for(const failure of [new Error('MCP error -32001: Request timed out'),false,0,null,undefined,'transport']){
   const f=fixture({failure,failAt,recordFails});await f.channel.observe({condition:'initial ready',ready:()=>true});f.arm();
   let rejected=false;
   try{await f.channel.observe({condition:'new Table active',ready:()=>true});}
   catch(error){rejected=true;assert.strictEqual(error,failure);}
   assert.equal(rejected,true);assert.equal(f.calls(),failAt);
   const diagnostic=f.records.filter(r=>r.phase==='node_observation_read_failed');assert.equal(diagnostic.length,1);
   assert.equal(diagnostic[0].stage,stage);assert.equal(diagnostic[0].condition,'new Table active');
   assert.equal(diagnostic[0].internal_operation_id,'original:n2');assert.equal(diagnostic[0].parent_deadline,60000);
   assert.equal(diagnostic[0].observation_deadline,15201);assert.equal(diagnostic[0].elapsed_ms,100);
   assert.equal(diagnostic[0].timeout_ms,stage==='roots'?15000:14900);
   assert.strictEqual(f.operation.pending,f.pending);assert.deepEqual(f.pending,{phase:'read',effect_possible:true});
   assert.equal(f.records.filter(r=>r.phase==='node_observation_completed').length,1);
   assert.equal(f.records.filter(r=>r.phase==='node_observation_timeout').length,0);
   await assert.rejects(f.channel.act({verb:'click',ref:'ui-button'}),/fresh internal observation/);
  }
 });
}
test('a late local abort cannot replace the first failed read',async()=>{
 const failure=new Error('primary transport');const f=fixture({failure,failAt:1,lateAbort:true});f.arm();
 await assert.rejects(f.channel.observe({condition:'new Table active',ready:()=>true}),error=>error===failure);
 assert.equal(f.records.filter(r=>r.phase==='node_observation_interrupted').length,0);
 assert.equal(f.records.filter(r=>r.phase==='node_observation_read_failed').length,1);
});
test('successful observation emits no failure diagnostic',async()=>{
 const f=fixture();await f.channel.observe({condition:'new Table active',ready:()=>true});
 assert.equal(f.records.filter(r=>r.phase==='node_observation_read_failed').length,0);
 assert.equal(f.records.filter(r=>r.phase==='node_observation_completed').length,1);
});

test('native output read records its exact stage and original RPC error',async()=>{
 const failure=new Error('MCP native output timeout');const f=fixture({failure,failAt:3,prepared:true});f.arm();
 await assert.rejects(f.channel.observe({condition:'new Table active',readOutputs:true,ready:()=>true}),error=>error===failure);
 assert.equal(f.calls(),3);const diagnostic=f.records.find(r=>r.phase==='node_observation_read_failed');
 assert.equal(diagnostic.stage,'node_outputs');assert.equal(diagnostic.timeout_ms,14800);
 assert.strictEqual(f.operation.pending,f.pending);
});
