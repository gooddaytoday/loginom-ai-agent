import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightGroupingSource} from '../lib/grouping-preflight.mjs';
import {validateGroupingParameters} from '../lib/grouping-parameters.mjs';
import {applyNode} from '../lib/node-apply.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';

function fixture(ports,{lost=false}={}){
 const upstream={document_id:'doc',workflow_id:'workflow',node_id:'upstream'};
 const request={operation_id:'sum-prefixes',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;path',label:'Scenario'}]},
  target:{kind:'new',type:'transform.group_data',label:'Cumulative revenue'},inputs:[{source:upstream,output:0,input:0}],
  mode:'aggregate',parameters:{group_by:[{kind:'input_field',name:'ProductID'}],measures:[{field:{kind:'input_field',name:'Contribution'},function:'sum',name:'CumulativeRevenue',label:'CumulativeRevenue'}]},
  mappings:[],finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true},
  budgets:{configure_ms:600000,execute_ms:120000,total_ms:600000}};
 const owner={...upstream,verified:true,surface:'graph',locked:false},calls=[],records=[];
 const operation={id:request.operation_id,parameters:request,action:{action_key:'node.apply',revision:'1.0.0'}};
 const record=async event=>{records.push(structuredClone(event));return structuredClone(event);};
 const options={operation,onRecord:record,now:()=>1000,receiptOptions:()=>assert.fail('No mutation receipt is allowed'),execute:async code=>{
  if(code.includes('readOutputContext')){
   calls.push('outputs');if(lost)throw Error('Native output read transport lost');
   return {verified:true,surface:'graph',node_selected:false,ports,node_context:owner};
  }
  calls.push('workspace');
  return {status:'SUCCEEDED',cleanup_complete:true,effect_possible:false,output:{origin:'http://loginom.invalid',loginom_build:'7.4.2',
   workflow_ref:request.workflow_ref,dom_epoch:{document:'doc'},prepared_node_context:owner,wizard:{status:'absent'},scan:{complete:true},
   ui:{elements:[],masks:[],dialogs:[],truncated:{dialogs:false,masks:false}}}};
 }};
 const run=()=>applyNode({request,operation,record,now:()=>1000,
  handlers:new Map([['transform.group_data',{revision:'1',modes:['aggregate'],validate:validateGroupingParameters,configure:()=>assert.fail('No wizard may open')}]]),
  drivers:{verifySource:async()=>({verified:true,cleanup_complete:true,effect_possible:false}),
   activateWorkflow:async()=>({verified:true,cleanup_complete:true,effect_possible:false}),
   prepareTarget:async(graph,ctx)=>{operation.deadline=ctx.deadline;await preflightGroupingSource(options,ctx,{targetOrigin:'http://loginom.invalid',targetBuild:'7.4.2'});assert.fail('No target may be created');}}});
 return {run,operation,calls,records};
}

for(const ports of [[],[{index:1,active:true}]])test('unconfirmed requested output zero refuses without leaving a Grouping target to release: '+JSON.stringify(ports),async()=>{
 const f=fixture(ports),outcome=await f.run();
 assert.equal(outcome.status,'NOT_APPLIED',JSON.stringify(outcome));assert.equal(outcome.effect_possible,false);assert.equal(outcome.cleanup_complete,true);
 assert.equal(outcome.node,null);assert.equal(outcome.pending_phase,null);assert.equal(f.operation.nodeApply.pending,null);
 assert.match(outcome.error.message,/output 0 of node upstream.*not uniquely confirmed/);
 assert.match(outcome.error.message,/No Grouping node or link was created.*SAME existing upstream node.*NEW operation_id/);
 assert.ok(f.records.some(e=>e.phase==='node_phase_refused'&&e.receipt.phase==='target'));
 assert.ok(f.calls.includes('outputs'));assert.ok(f.calls.every(c=>['outputs','workspace'].includes(c)));
 const reply=compactNodeResult({operation_id:'sum-prefixes',state:'settled',outcome:{...outcome,output:outcome}});
 assert.equal(reply.next_step.tool,'dock_node_apply');assert.match(reply.next_step.instruction,/NEW operation_id.*No node mutation or browser recovery/);
});
test('unknown upstream observation failure keeps the target boundary unresolved',async()=>{
 const f=fixture([],{lost:true}),outcome=await f.run();
 assert.equal(outcome.status,'AMBIGUOUS');assert.equal(outcome.cleanup_complete,false);assert.equal(outcome.pending_phase,'target');
 assert.match(outcome.error.message,/transport lost/);assert.ok(f.operation.nodeApply.pending);
 assert.ok(!f.records.some(e=>e.phase==='node_phase_refused'));
});
