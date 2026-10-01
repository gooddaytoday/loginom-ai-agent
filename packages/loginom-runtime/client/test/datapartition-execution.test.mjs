import test from 'node:test';
import assert from 'node:assert/strict';
import {captureExecutionBaseline,identifyNewExecution} from '../lib/node-execution-evidence.mjs';
import {verifyDataPartitionConfigurationBaseline,prepareDataPartitionExecution} from '../lib/datapartition-execution.mjs';
const node={document_id:'d',workflow_id:'w',node_id:'n'};
const terminal={verified:true,state:'completed',terminal:true,can_cancel:false,source:'native_progress_record'};
function fixture(){
 const old={process_id:'1',record_id:'r1',parent_id:null,state:'completed',error:false};
 const snapshot={verified:true,show_completed:true,inventory_complete:true,root_id:'history',node_context:{...node,verified:true},processes:[old]};
 const initial=captureExecutionBaseline(snapshot,node);
 snapshot.processes.push({process_id:'2',record_id:'r2',parent_id:null,state:'completed',error:false,caption:'Активация входов узла',children_loaded:true,progress_state:terminal},
  {process_id:'2.1',record_id:'child2',parent_id:'2',state:'completed',error:false,progress_state:terminal,owner:{verified:true,node_id:'n',source:'native_process_model_identity'}});
 return {snapshot,initial,current:captureExecutionBaseline(snapshot,node)};
}

test('DataPartition retains observed input activation separately before one fresh Execute',()=>{
 const f=fixture(),proof=verifyDataPartitionConfigurationBaseline(f.initial,f.current,f.snapshot);
 assert.equal(proof.verified,true);assert.equal(proof.initial_baseline.roots.length,1);
 assert.equal(proof.execution_baseline.roots.length,2);assert.equal(proof.configuration_activations.length,2);
 f.snapshot.processes.push({process_id:'3',record_id:'r3',parent_id:null,state:'completed',error:false});
 assert.equal(identifyNewExecution(f.current,f.snapshot).group_id,'3');
 f.snapshot.processes.push({process_id:'4',record_id:'r4',parent_id:null,state:'completed',error:false});
 assert.throws(()=>identifyNewExecution(f.current,f.snapshot),/Exactly one/);
});

test('DataPartition rejects unknown/premature Execute, wrong owner and extra configuration roots',()=>{
 for(const change of [f=>f.snapshot.processes[1].caption='Активация узлов',f=>f.snapshot.processes[2].owner.node_id='other',
  f=>f.snapshot.processes[2].owner.source='caption',f=>f.snapshot.processes[1].progress_state={...terminal,terminal:false},
  f=>f.snapshot.processes[1].children_loaded=false,f=>f.snapshot.processes.push({process_id:'3',record_id:'r3',parent_id:null,state:'completed',error:false})]){
  const f=fixture();change(f);f.current=captureExecutionBaseline(f.snapshot,node);
  assert.throws(()=>verifyDataPartitionConfigurationBaseline(f.initial,f.current,f.snapshot));
 }
});

test('DataPartition rejects stale, reused or already-launched baselines',()=>{
 for(const change of [f=>f.initial.launch_verified=true,f=>f.current.launch_verified=true,f=>f.initial.root_id='old-history',
  f=>f.initial.node={...node,node_id:'other'},f=>f.initial.roots[0].record_id='old-record',
  f=>f.current.roots[1].record_id='wrong-record',f=>f.snapshot.processes[0].record_id='reused']){
  const f=fixture();change(f);assert.throws(()=>verifyDataPartitionConfigurationBaseline(f.initial,f.current,f.snapshot));
 }
});

test('DataPartition lost reply or unconfirmed commits cannot reach deferred prepare',async()=>{
 for(const change of [x=>x.operation.transportUncertain=true,x=>x.configuration.verified=false,x=>x.outputs.verified=false,x=>x.outputs.ports.pop()]){
  const options={configuration:{verified:true,mode:'biased'},outputs:{verified:true,ports:[0,1,2]},operation:{transportUncertain:false,nodeApply:{request:{mode:'biased'}}}};
  change(options);let calls=0;
  await assert.rejects(prepareDataPartitionExecution({observe:async()=>{calls++;throw Error('unexpected effect')},perform:async()=>{calls++;throw Error('unexpected effect')}},node,options));
  assert.equal(calls,0);
 }
});

for(const lost of [false,true])test('DataPartition deferred standard driver never repeats Execute, lost reply: '+lost,async()=>{
 const f=fixture();let opened=false,menu=false,launches=0;
 const element=(tid,allowed_actions=['click'])=>({tid,ref:tid,allowed_actions});
 const state=()=>({wizard:{status:'absent'},prepared_node_context:{...node,verified:true,surface:'graph',locked:false},
  node_outputs:{verified:true,node_selected:true},node_processes:{...f.snapshot,verified:opened},ui:{elements:[
   element('MF;cntMain;tlbMainToolbar;btnProgress'),
   ...(opened?[element('ConsoleForm;ProgressForm;trpProgress;grd;tbl',['right_click']),element('ConsoleForm;btnClose')]:[]),
   ...(menu?[element('mnContextMenu;mniShowCompletedProcesses',['click','press'])]:[]),
   {...element('launch',['execute_graph_node']),graph_execution:{node_id:node.node_id,mode:'execute',source:'native_node_execution_state'}}]}});
 const channel={observe:async spec=>{const s=state();assert.ok(spec.ready(s),spec.condition);return structuredClone(s)},perform:async spec=>{
  const s=state();assert.ok(spec.ready(s),spec.condition);const action=spec.resolve(s);
  if(action.ref==='MF;cntMain;tlbMainToolbar;btnProgress')opened=true;
  if(action.verb==='right_click')menu=true;if(action.verb==='press')menu=false;
  if(action.ref==='ConsoleForm;btnClose')opened=false;
  if(action.verb==='execute_graph_node'){launches++;if(lost)throw Error('lost Execute reply')}
  return {status:'SUCCEEDED'};
 }};
 const prepared=await prepareDataPartitionExecution(channel,node,{baseline:f.initial,configuration:{verified:true,mode:'biased'},outputs:{verified:true,ports:[0,1,2]},operation:{transportUncertain:false,nodeApply:{request:{mode:'biased'}}}});
 assert.equal(prepared.evidence.configuration_activations.length,2);
 if(lost)await assert.rejects(prepared.driver.launchGraph(),/lost Execute reply/);
 if(!lost)assert.equal((await prepared.driver.launchGraph()).launch_gesture_verified,true);
 await assert.rejects(prepared.driver.launchGraph(),/not-yet-launched/);assert.equal(launches,1);
});
