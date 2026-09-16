import test from 'node:test';
import assert from 'node:assert/strict';
import {captureExecutionBaseline,identifyNewExecution,verifyCompletedExecution,selectExecutionChild} from '../lib/node-execution-evidence.mjs';
const node={document_id:'document',workflow_id:'workflow',node_id:'node'};
const process=(id,parent=null)=>({process_id:id,parent_id:parent,record_id:'record-'+id,state:'completed',error:false,rendered:true,selected:parent!==null,children_loaded:true});
const snapshot=(...ps)=>({verified:true,inventory_complete:true,show_completed:true,root_id:'root',node_context:{verified:true,...node},processes:ps});
const initial=snapshot(process('1')),next=snapshot(process('1'),process('2'),process('2.1','2'));
const owner={verified:true,node_selected:true,node,process_id:'2.1',record_id:'record-2.1'};
test('execution is identified from a new group and an independently selected node',()=>{
 const baseline=captureExecutionBaseline(initial,node),execution=identifyNewExecution(baseline,next);
 assert.equal(execution.owner_verified,false);assert.equal(execution.completed,false);
 const result=verifyCompletedExecution(execution,next,owner);assert.equal(result.verified,true);assert.equal(result.status,'completed');
 assert.equal(result.execution_id,'document:root:2');
});
for(const [name,mutate] of Object.entries({hidden_history:s=>s.show_completed=false,incomplete:s=>s.inventory_complete=false,
 root_replaced:s=>s.root_id='other',old_entry_deleted:s=>s.processes.shift(),reused_old_id:s=>s.processes[0].record_id='replaced',
 concurrent_groups:s=>s.processes.push(process('3')),no_new_group:s=>s.processes=s.processes.slice(0,1),
}))test('new execution rejects '+name,()=>{
 const s=structuredClone(next);mutate(s);assert.throws(()=>identifyNewExecution(captureExecutionBaseline(initial,node),s));
});
for(const [name,mutate] of Object.entries({wrong_node:o=>o.node={...node,node_id:'other'},wrong_workflow:o=>o.node={...node,workflow_id:'other'},
 stale_process:o=>o.process_id='1.1',wrong_record:o=>o.record_id='other',unselected:o=>o.node_selected=false,unverified:o=>o.verified=false,
}))test('completion rejects '+name,()=>{
 const o=structuredClone(owner);mutate(o);assert.throws(()=>verifyCompletedExecution(identifyNewExecution(captureExecutionBaseline(initial,node),next),next,o));
});
test('a green node icon or an execution summary cannot replace process completion',()=>{
 const e=identifyNewExecution(captureExecutionBaseline(initial,node),next),s=structuredClone(next);s.processes[2].state='pending_or_failed';
 assert.throws(()=>verifyCompletedExecution(e,s,{...owner,active:true}));
 s.processes[2].state='completed';s.processes[2].error=true;assert.throws(()=>verifyCompletedExecution(e,s,owner));
});

for(const [name,mutate] of Object.entries({
 duplicate_id:s=>s.processes.push({...s.processes[1],record_id:'another'}),
 duplicate_record:s=>s.processes[1].record_id=s.processes[0].record_id,
 missing_record:s=>delete s.processes[1].record_id,
 foreign_node:s=>s.node_context.node_id='other',
 orphan:s=>s.processes[2].parent_id='7',
}))test('process inventory rejects '+name,()=>{
 const s=structuredClone(next);mutate(s);assert.throws(()=>identifyNewExecution(captureExecutionBaseline(initial,node),s));
});
test('a completed upstream process does not prevent identifying the requested child',()=>{
 const s=structuredClone(next);s.processes.push({...process('2.2','2'),selected:false});
 const e=identifyNewExecution(captureExecutionBaseline(initial,node),s);
 assert.equal(verifyCompletedExecution(e,s,owner).process_id,'2.1');
 s.processes[2].selected=false;assert.throws(()=>verifyCompletedExecution(e,s,owner));
});
test('completion requires loaded children and cannot adopt a visualizer process from another group',()=>{
 const s=structuredClone(next),e=identifyNewExecution(captureExecutionBaseline(initial,node),s);
 s.processes[1].children_loaded=false;assert.throws(()=>verifyCompletedExecution(e,s,owner));
 s.processes[1].children_loaded=true;s.processes.push(process('3'),{...process('3.1','3'),selected:false});
 assert.throws(()=>verifyCompletedExecution(e,s,{...owner,process_id:'3.1',record_id:'record-3.1'}));
 assert.equal(verifyCompletedExecution(e,s,owner).execution_id,e.execution_id);
});

const nativeOwner={verified:true,node_id:'node',source:'native_process_model_identity'};
function dependencies(){const s=structuredClone(next);s.processes.push({...process('2.2','2'),selected:false,owner:{...nativeOwner}});return s;}
test('dependency execution selects the native-owned child and still requires Show Node proof',()=>{
 const s=dependencies(),e=identifyNewExecution(captureExecutionBaseline(initial,node),s);
 const selected=selectExecutionChild(e,s);assert.equal(selected.process_id,'2.2');
 assert.throws(()=>verifyCompletedExecution(e,s,{...owner,process_id:'2.2',record_id:'record-2.2'}));
 selected.owner.node_id='mutated';assert.equal(s.processes[3].owner.node_id,'node');
 s.processes[2].selected=false;s.processes[3].selected=true;
 assert.equal(verifyCompletedExecution(e,s,{...owner,process_id:'2.2',record_id:'record-2.2'}).process_id,'2.2');
});
for(const [name,mutate] of Object.entries({
 missing:s=>delete s.processes[3].owner,
 foreign:s=>s.processes[3].owner.node_id='other',
 unverified:s=>s.processes[3].owner.verified=false,
 guessed:s=>s.processes[3].owner.source='caption',
 ambiguous:s=>s.processes[2].owner={...nativeOwner},
 unloaded:s=>s.processes[1].children_loaded=false,
}))test('dependency child selection rejects '+name,()=>{
 const s=dependencies(),e=identifyNewExecution(captureExecutionBaseline(initial,node),s);mutate(s);
 assert.throws(()=>selectExecutionChild(e,s));
});

test('one oldest completed eviction preserves the unique next execution identity',()=>{
 const before=snapshot(process('8'),process('9')),after=snapshot(process('9'),process('10'));
 assert.equal(identifyNewExecution(captureExecutionBaseline(before,node),after).group_id,'10');
 for(const mutate of [s=>s.processes[0].record_id='changed',s=>s.processes[1].process_id='11',s=>s.processes[0].process_id='8']){
  const wrong=structuredClone(after);mutate(wrong);assert.throws(()=>identifyNewExecution(captureExecutionBaseline(before,node),wrong));
 }
 before.processes[0].state='pending_or_failed';assert.throws(()=>identifyNewExecution(captureExecutionBaseline(before,node),after));
});

test('failed launch retains its native group and reason without claiming that the target child executed',async()=>{
 const {verifyFailedExecution}=await import('../lib/node-execution-evidence.mjs');
 const s=structuredClone(next),e=identifyNewExecution(captureExecutionBaseline(initial,node),s);
 Object.assign(s.processes[1],{state:'pending_or_failed',error:true,error_details:'Input file not found',progress_state:{verified:true,state:'failed',terminal:true,can_cancel:false,source:'native_progress_record'}});
 s.processes[2].state='pending_or_failed';
 const r=verifyFailedExecution(e,s);assert.equal(r.status,'failed');assert.equal(r.group_record_id,'record-2');assert.equal(r.error.message,'Input file not found');assert.equal(r.output_refreshed,false);
 for(const change of [x=>x.root_id='foreign',x=>x.node_context.node_id='foreign',x=>x.inventory_complete=false,
  x=>x.processes[1].record_id='foreign',x=>x.processes[1].error=false,x=>x.processes[1].error_details='',
  x=>x.processes[1].progress_state.verified=false,x=>x.processes[1].progress_state.state='parent_failed',
  x=>x.processes[1].progress_state.terminal=false,x=>x.processes[1].progress_state.can_cancel=true,x=>x.processes[1].progress_state.source='caption']){
  const bad=structuredClone(s);change(bad);assert.throws(()=>verifyFailedExecution(e,bad));
 }
});
