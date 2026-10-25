import test from 'node:test';
import assert from 'node:assert/strict';
import {coldProcessObservation,runColdExecution} from '../cold-reader-policy.mjs';
import {createNodeProcedure} from '../../../packages/loginom-runtime/client/lib/node-procedure.mjs';
import {captureExecutionBaseline,identifyNewExecution,verifyCompletedExecution} from '../../../packages/loginom-runtime/client/lib/node-execution-evidence.mjs';

function fixture({mutate=()=>{},mutateProcesses=()=>{},repeat=false,deadline=10000}={}) {
 const node={document_id:'doc',workflow_id:'flow',node_id:'rest-output'};
 const workflow_ref={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',
  navigation_path:[{tid:'MF;TF-1;cnrNaviMode;b.s_Scenario',label:'Scenario'}]};
 const before={...node,verified:true,surface:'graph',tid:'MF;TF-1;Graph;Output',locked:true};
 const after={...before,locked:false};mutate({before,after});
 const process=(id,parent=null)=>({process_id:id,parent_id:parent,record_id:'record-'+id,state:'completed',error:false,
  rendered:true,selected:parent!==null,children_loaded:true});
 const inventory=(...processes)=>({verified:true,inventory_complete:true,show_completed:true,root_id:'root',node_context:{...after},processes});
 const completed=inventory(process('1'),process('2'),process('2.1','2'));
 const execution=identifyNewExecution(captureExecutionBaseline(inventory(process('1')),node),completed);
 const operation={id:'cold-read-expected-0',deadline,action:{action_key:'acceptance.cold_read',revision:'1'}};
 const records=[],calls=[];let reads=0,clock=1;
 const record=async e=>{records.push(e);return e};
 const capture=coldProcessObservation(async code=>{
  if(code.includes('async function readNodeProcesses')){
   reads++;
   const result=structuredClone(completed);result.node_context=structuredClone(repeat||reads===1?before:after);
   if(reads>1)mutateProcesses(result);
   return result;
  }
  assert.ok(code.includes('function workspaceUiCapability'),'only native process and UI reads');
  return {status:'SUCCEEDED',action_key:'workspace.observe',output:{origin:'http://example.test',loginom_build:'7.4.2',workflow_ref,
   dom_epoch:{document:'dom',revision:reads+1},prepared_node_context:structuredClone(after),scan:{complete:true},wizard:{status:'absent'},
   ui:{elements:[{tid:'ConsoleForm',ref:'console'}],masks:[],dialogs:[],truncated:{masks:false,dialogs:false}}}};
 },{node,operation,record});
 const procedure=createNodeProcedure({operation,preparedNodeContext:{document_id:'doc',workflow_ref,node},execute:capture.execute,record,
  targetOrigin:'http://example.test',targetBuild:'7.4.2',now:()=>clock,wait:async ms=>{clock+=ms},wrapMutation:()=>{throw Error('unexpected gesture')}});
 const channel={observe:options=>capture.observe(procedure,options)};
 const driver={prepare:async()=>calls.push('prepare'),launchGraph:async()=>calls.push('launchGraph'),
  identify:async()=>{calls.push('identify');},
  waitCompleted:async()=>{calls.push('waitCompleted');const s=await observe();
   return verifyCompletedExecution(execution,s.node_processes,{verified:true,node_selected:true,node,process_id:'2.1',record_id:'record-2.1'});}};
 const observe=()=>channel.observe({condition:'new node execution completed',readProcesses:true,ready:s=>s.node_processes?.verified===true});
 return {run:()=>runColdExecution({driver,channel,node,operation,record,now:()=>clock,
   readReceipt:async()=>{throw Error('read-only refusal has no gesture receipt')}}),records,calls,operation};
}

test('cold uses the shared reader lock reread without restarting its completion wait',async()=>{
 const f=fixture();assert.equal((await f.run()).status,'completed');
 assert.deepEqual(f.calls,['prepare','launchGraph','identify','waitCompleted']);
 assert.equal(f.operation.deadline,10000);
 const retries=f.records.filter(e=>e.phase==='node_observation_lock_retried');
 assert.equal(retries.length,1);
 assert.deepEqual(retries[0].ui_node_context,{...retries[0].native_node_context,locked:false});
 assert.equal(retries[0].native_node_context.locked,true);
 assert.equal(f.records.filter(e=>e.phase==='cold_process_context_refused').length,0);
 assert.equal(f.records.filter(e=>e.phase==='cold_execution_observation_refresh').length,0);
 const samples=f.records.filter(e=>e.phase==='node_observation_sample');
 assert.equal(samples.length,1);
 assert.ok(samples.every(e=>e.outcome.output.node_processes.node_context.locked===false),'refused evidence never becomes a successful sample');
});

for(const [name,options] of Object.entries({
 repeated:{repeat:true},
 foreignDocument:{mutate:({before})=>before.document_id='foreign'},
 foreignWorkflow:{mutate:({before})=>before.workflow_id='foreign'},
 foreignNode:{mutate:({before})=>before.node_id='foreign'},
 changedSurface:{mutate:({before})=>before.surface='views'},
 changedTid:{mutate:({before})=>before.tid='other'},
 unverified:{mutate:({before})=>before.verified=false},
 missingLock:{mutate:({before})=>delete before.locked},
 extraChange:{mutate:({before})=>before.navigation_node={tid:'other',label:'Other'}},
 replacedRoot:{mutateProcesses:s=>s.root_id='other'},
 replacedGroup:{mutateProcesses:s=>s.processes[1].record_id='other'},
 replacedChild:{mutateProcesses:s=>s.processes[2].record_id='other'},
}))test('cold native context refresh refuses '+name,async()=>{
 const f=fixture(options);await assert.rejects(f.run());
 assert.equal(f.calls.filter(c=>c==='launchGraph').length,1);
 assert.ok(f.calls.filter(c=>c==='waitCompleted').length<=2);
});

test('cold shared reader exhausts the original deadline on continuous mixed snapshots',async()=>{
 const f=fixture({repeat:true,deadline:451});
 await assert.rejects(f.run(),/Node procedure readiness timeout: new node execution completed/);
 assert.equal(f.operation.deadline,451);
 assert.deepEqual(f.calls,['prepare','launchGraph','identify','waitCompleted']);
 assert.equal(f.records.filter(e=>e.phase==='node_observation_lock_retried').length,3);
 assert.equal(f.records.filter(e=>e.phase==='node_observation_sample').length,0);
 assert.equal(f.records.filter(e=>e.phase==='cold_execution_observation_refresh').length,0);
});

// Exercise the outer cold fallback at its own boundary. The shared reader now
// absorbs lock-only transitions (#321), so it cannot trigger these policy guards.
function fallbackFixture({expired=false,transport=false,phase='waitCompleted',repeat=false}={}) {
 const node={document_id:'doc',workflow_id:'flow',node_id:'rest-output'};
 const before={...node,verified:true,surface:'graph',tid:'MF;TF-1;Graph;Output',locked:true};
 const error=Object.assign(Error('Native process/output context changed during observation'),{
  coldProcessContext:{condition:'new node execution completed',before,after:{...before,locked:false}},
 });
 const operation={id:'cold-fallback',deadline:10000,transportUncertain:transport};
 const calls=[],records=[],completed={status:'completed'};let refusals=0;
 const driver=Object.fromEntries(['prepare','launchGraph','identify','waitCompleted'].map(name=>[name,async()=>{
  calls.push(name);
  if(name===phase&&(refusals++===0||repeat))throw error;
  if(name==='waitCompleted')return completed;
 }]));
 return {calls,records,error,operation,completed,run:()=>runColdExecution({driver,channel:{},node,operation,
  now:()=>expired?10000:1,record:async e=>records.push(e),
  readReceipt:async()=>{throw Error('read-only refusal has no gesture receipt')},
 })};
}

test('cold fallback retries only the original completion wait after an owned lock-only refusal',async()=>{
 const f=fallbackFixture();assert.equal(await f.run(),f.completed);
 assert.deepEqual(f.calls,['prepare','launchGraph','identify','waitCompleted','waitCompleted']);
 assert.equal(f.operation.deadline,10000);
 assert.equal(f.records.filter(e=>e.phase==='cold_execution_observation_refresh').length,1);
});

for(const [name,options] of Object.entries({
 expired:{expired:true},transport:{transport:true},wrongPhase:{phase:'identify'},repeated:{repeat:true},
}))test('cold fallback refuses '+name,async()=>{
 const f=fallbackFixture(options);await assert.rejects(f.run(),error=>error===f.error);
 assert.equal(f.operation.deadline,10000);
 assert.deepEqual(f.calls,['prepare','launchGraph','identify',
  ...(options.phase==='identify'?[]:['waitCompleted']),...(options.repeat?['waitCompleted']:[])]);
 assert.equal(f.records.length,options.repeat?1:0);
});
