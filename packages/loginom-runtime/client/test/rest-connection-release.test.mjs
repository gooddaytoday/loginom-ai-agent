import test from 'node:test';
import assert from 'node:assert/strict';
import {runRestStep} from '../lib/rest-step.mjs';
import {releaseNodeTarget} from '../lib/node-target.mjs';
import {releaseNodeApply} from '../lib/node-apply.mjs';
import {createRestRequestNodeSupport} from '../lib/rest-request-node.mjs';

const workflow={workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
const request={operation_id:'countries-rest',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'new',type:'integration.rest_request',label:'Countries'},
 inputs:[{source:{document_id:'doc',workflow_id:'flow',node_id:'raw'},input:0,output:0}],mode:'request',
 parameters:{connection:{name:'API REST Countries',base_url:'https://restcountries.com/v3.1/all'},query_parameters:[{name:'fields',field:'CountryFields'}]},
 mappings:[],finish:'execute',read:{ports:[],sample_rows:0,require_exact_numbers:false},
 budgets:{configure_ms:60000,execute_ms:60000,total_ms:60000}};

for(const fault of ['none','ack','receipt','transport','document','workflow','incomplete','busy','connection','changed_graph'])
test('D33 settled connection placement refusal releases only its checkpoint: '+fault,async()=>{
 const graph={complete:true,interaction_ready:true,document_id:'doc',workflow_ref:workflow,dom_epoch:1,
  nodes:[{ref:{document_id:'doc',workflow_id:'flow',node_id:'encoder'},type:'programming.javascript',label:'URL query encoding',
   inputs:[0],outputs:[0],position:{x:64,y:64},locked:false}],links:[],foreign_links:[]};
 const checkpoint={graph:structuredClone(graph),connection:{name:request.parameters.connection.name,base_url:request.parameters.connection.base_url}};
 if(fault==='document')checkpoint.graph.document_id='foreign';
 if(fault==='workflow')checkpoint.graph.workflow_ref={...workflow,workflow_id:'foreign'};
 if(fault==='incomplete')checkpoint.graph.complete=false;
 if(fault==='busy')checkpoint.graph.interaction_ready=false;
 if(fault==='connection')checkpoint.connection.name='Foreign';
 const outcome={status:'AMBIGUOUS',action_key:'node.rest.connection.internal',action_revision:'1',operation_id:'countries-rest:n1',
  phase:'connection',effect_possible:true,cleanup_complete:true,
  output:{verified:false,effect_possible:true,cleanup_complete:true,pre_target_checkpoint:checkpoint},
  error:{code:'REST_STEP_UNCONFIRMED',message:'REST connection: connection placement is not fully visible'},trace:[]};
 if(fault==='receipt')outcome.operation_id='foreign';
 const operation={id:request.operation_id,parameters:request,nodeEffectPossible:true,cleanupConfirmed:true,
  nodeApply:{request,signature:'signature',pending:{phase:'target'},node:null,phases:[],effect_possible:true,
   execution:{status:'not_requested',execution_id:null},output:{status:'not_refreshed',ports:[]}}};
 const events=[];let calls=0;
 const record=async e=>{events.push(structuredClone(e));return fault==='ack'&&e.phase==='node_step_completed'?{...e,outcome:null}:e;};
 await assert.rejects(runRestStep({operation,onRecord:record,receiptOptions:()=>({}),execute:async()=>{
  calls++;if(fault==='transport')throw Error('lost reply');return outcome;
 }},{document_id:'doc',workflow_ref:workflow,deadline:Date.now()+60000},'connection',()=> 'async()=>({})',request.parameters,{}));
 assert.equal(calls,1);
 if(fault==='changed_graph')graph.nodes[0].label='Foreign edit';
 const adapter={observe:async()=>structuredClone(graph),verifyWorkflow:async()=>({status:'SUCCEEDED',verified:true,
  cleanup_complete:true,effect_possible:false,document_id:'doc',workflow_ref:workflow})};
 const release=()=>releaseNodeApply({operation,handlers:createRestRequestNodeSupport({}).nodeApplyHandlers,drivers:{},record,
  releaseBeforeTarget:()=>releaseNodeTarget({operation,adapter,record,readReceipt:async()=>null,deadline:Date.now()+60000})});
 if(fault==='none'){
  const result=await release();assert.equal(result.status,'FAILED');assert.equal(result.cleanup_complete,true);
  assert.equal(result.pending_phase,null);assert.equal(result.node,null);assert.equal(result.package_saved,false);
  assert.match(result.warnings[0],/saved REST connection.*API REST Countries.*remains/);
  assert.equal(graph.nodes.length,1);assert.equal(events.at(-1).phase,'node_operation_released');
  assert.deepEqual(operation.preTargetGraph,graph);
 }else{
  await assert.rejects(release());assert.equal(operation.nodeApply.pending.phase,'target');
  assert.equal(operation.nodeApply.result,undefined);
  if(fault!=='changed_graph')assert.equal(operation.preTargetGraph,undefined);
 }
 assert.equal(calls,1,'release never repeats connection creation or the drag');
});
