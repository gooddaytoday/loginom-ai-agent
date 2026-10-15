import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {createNodeProcedure}=await import(process.env.NODE_PROCEDURE_UNDER_TEST
 ?pathToFileURL(process.env.NODE_PROCEDURE_UNDER_TEST).href:'../lib/node-procedure.mjs');

function fixture({failure,recordFails=false,lateAbort=false,success=false}={}){
 const records=[],controller=new AbortController(),pending={phase:'configure',effect_possible:true};let clock=1,armed=false,calls=0;
 const operation={id:'fresh',deadline:60000,action:{action_key:'node.apply',revision:'1'},pending,
  checkpoint:{document_id:'doc',workflow_ref:{prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',workflow_id:'flow',navigation_path:[{tid:'flow',label:'Scenario'}]}}};
 const state={origin:'https://example.test',loginom_build:'7.4.2',workflow_ref:operation.checkpoint.workflow_ref,dom_epoch:{document:'doc',revision:1},scan:{complete:true},wizard:{status:'absent'},ui:{masks:[],dialogs:[],truncated:{elements:false,masks:false,dialogs:false},elements:[{ref:'ui-cell',allowed_actions:['double_click']}]}};
 const channel=createNodeProcedure({operation,signal:controller.signal,maxSteps:20,now:()=>clock,monotonicNow:()=>clock,targetOrigin:state.origin,targetBuild:'7.4.2',wrapMutation:code=>code,
  record:async e=>{records.push(structuredClone(e));if(e.phase==='node_step_prepared')clock+=7000;if(recordFails&&e.phase==='node_step_execute_failed')throw Error('secondary record failure');return structuredClone(e);},
  execute:async(code,options)=>{calls++;if(!armed){clock+=100;return{status:'SUCCEEDED',output:structuredClone(state)}}assert.equal(options.timeout,35000);clock+=35000;
   if(lateAbort)controller.abort(Error('late abort'));if(!success)throw failure;
   return{status:'SUCCEEDED',operation_id:'fresh:n2',action_key:'ui.act',effect_possible:true,cleanup_complete:true,output:structuredClone(state)};
  }});
 return{channel,operation,pending,records,arm(){armed=true;calls=0},calls:()=>calls};
}
for(const recordFails of [false,true])for(const lateAbort of [false,true])test(`failed step keeps first rejection/pending recordFails=${recordFails} lateAbort=${lateAbort}`,async()=>{
 for(const failure of [new Error('MCP error -32001: Request timed out'),false,0,null,undefined,'transport']){
  const f=fixture({failure,recordFails,lateAbort});await f.channel.observe({condition:'cell ready',ready:()=>true});f.arm();let caught=false;
  try{await f.channel.act({verb:'double_click',ref:'ui-cell'})}catch(e){caught=true;assert.strictEqual(e,failure)}assert.equal(caught,true);
  assert.equal(f.calls(),1);assert.strictEqual(f.operation.pending,f.pending);assert.equal(f.operation.transportUncertain,true);assert.equal(f.operation.cleanupConfirmed,false);
  const diagnostic=f.records.filter(r=>r.phase==='node_step_execute_failed');assert.equal(diagnostic.length,1);
  assert.deepEqual(Object.fromEntries(['step','internal_operation_id','verb','timeout_ms','elapsed_ms','prepared_to_execute_ms','parent_deadline'].map(k=>[k,diagnostic[0][k]])),{step:2,internal_operation_id:'fresh:n2',verb:'double_click',timeout_ms:35000,elapsed_ms:35000,prepared_to_execute_ms:7000,parent_deadline:60000});
  assert.equal('cause'in diagnostic[0],false);assert.equal('error'in diagnostic[0],false);assert.equal(f.records.filter(r=>r.phase==='node_step_completed').length,0);
  await assert.rejects(f.channel.act({verb:'double_click',ref:'ui-cell'}));assert.equal(f.calls(),1);
 }
});
test('successful step retains prepared/completed with no failure diagnostic',async()=>{
 const f=fixture({success:true});await f.channel.observe({condition:'cell ready',ready:()=>true});f.arm();const r=await f.channel.act({verb:'double_click',ref:'ui-cell'});assert.equal(r.status,'SUCCEEDED');assert.equal(f.records.filter(r=>r.phase==='node_step_execute_failed').length,0);assert.equal(f.records.filter(r=>r.phase==='node_step_completed').length,1);
});
