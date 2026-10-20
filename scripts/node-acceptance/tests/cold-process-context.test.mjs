import test from 'node:test';
import assert from 'node:assert/strict';
import {coldProcessObservation,runColdExecution} from '../cold-reader-policy.mjs';
import {createNodeProcedure} from '../../../packages/loginom-runtime/client/lib/node-procedure.mjs';
import {captureExecutionBaseline,identifyNewExecution,verifyCompletedExecution} from '../../../packages/loginom-runtime/client/lib/node-execution-evidence.mjs';

function fixture({mutate=()=>{},mutateProcesses=()=>{},repeat=false,phase='waitCompleted',expired=false,transport=false}={}) {
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
 const operation={id:'cold-read-expected-0',deadline:10000,action:{action_key:'acceptance.cold_read',revision:'1'},transportUncertain:transport};
 const records=[],calls=[];let reads=0;
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
  targetOrigin:'http://example.test',targetBuild:'7.4.2',now:()=>1,wait:async()=>{},wrapMutation:()=>{throw Error('unexpected gesture')}});
 const channel={observe:options=>capture.observe(procedure,options)};
 const driver={prepare:async()=>calls.push('prepare'),launchGraph:async()=>calls.push('launchGraph'),
  identify:async()=>{calls.push('identify');if(phase==='identify')return observe();},
  waitCompleted:async()=>{calls.push('waitCompleted');const s=await observe();
   return verifyCompletedExecution(execution,s.node_processes,{verified:true,node_selected:true,node,process_id:'2.1',record_id:'record-2.1'});}};
 const observe=()=>channel.observe({condition:'new node execution completed',readProcesses:true,ready:s=>s.node_processes?.verified===true});
 return {run:()=>runColdExecution({driver,channel,node,operation,record,now:()=>expired?10000:1,
   readReceipt:async()=>{throw Error('read-only refusal has no gesture receipt')}}),records,calls,operation};
}

test('cold waits through the owned native lock transition without replaying execution',async()=>{
 const f=fixture();assert.equal((await f.run()).status,'completed');
 assert.deepEqual(f.calls,['prepare','launchGraph','identify','waitCompleted','waitCompleted']);
 assert.equal(f.operation.deadline,10000);
 const refused=f.records.find(e=>e.phase==='cold_process_context_refused');
 assert.equal(refused.before.locked,true);assert.equal(refused.after.locked,false);
 assert.equal(f.records.filter(e=>e.phase==='cold_execution_observation_refresh').length,1);
 const samples=f.records.filter(e=>e.phase==='node_observation_sample');
 assert.equal(samples.length,1);
 assert.ok(samples.every(e=>e.outcome.output.node_processes.node_context.locked===false),'refused evidence never becomes a successful sample');
});

for(const [name,options] of Object.entries({
 repeated:{repeat:true},expired:{expired:true},transport:{transport:true},wrongPhase:{phase:'identify'},
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
