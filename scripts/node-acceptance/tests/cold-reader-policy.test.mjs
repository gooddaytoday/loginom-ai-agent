import test from 'node:test';
import assert from 'node:assert/strict';
import {coldNativeEligible,coldGraphExecutionIdentity,performColdNodeAction,runColdExecution,openColdOutputViews} from '../cold-reader-policy.mjs';
import {createNodeProcedure} from '../../../packages/loginom-runtime/client/lib/node-procedure.mjs';
const node={document_id:'doc',workflow_id:'wf',node_id:'cross'};

function windowFixture(change=()=>{}) {
 const calls=[],execution={verified:true,owner_verified:true,status:'completed',execution_id:'doc:1',process_id:'1.1',process_record_id:'child'};
 const rows=Array.from({length:100},(_,i)=>[{type:'integer',is_null:false,value:String(i+1)},
  {type:'string',is_null:false,value:('row '+i+' ').padEnd(6000,'я')}]);
 const channel={async readOutputPort(request){
  calls.push(structuredClone(request));
  const start=request.rowOffset,end=Math.min(start+43,100);
  const result={verified:true,cleanup_complete:true,node_context:{...node,verified:true},output:{
   port:0,port_guid:'port',fresh:true,execution_id:execution.execution_id,freshness_basis:'completed_execution_port_source',
   schema:[{index:0,name:'I',label:'I',type:'integer'},{index:1,name:'S',label:'S',type:'string'}],
   row_count:100,row_offset:start,next_row_offset:end,sample_rows:end-start,sample_complete:false,
   sample:structuredClone(rows.slice(start,end)),precision:{numbers_verified:true,limitations:[]},
   window_binding:{...node,execution_id:execution.execution_id,process_id:execution.process_id,process_record_id:execution.process_record_id},read_limit:'preview_cell_or_byte_budget'}};
  change(result,calls.length);return result;
 }};
 return {channel,execution,calls,rows};
}
test('cold windows cover all 100 rows in order including both boundaries and complete text',async()=>{
 const {readColdPortWindows}=await import('../cold-reader-policy.mjs'),f=windowFixture();
 const result=await readColdPortWindows(f.channel,{node,execution:f.execution,port:0,rowCount:100});
 assert.deepEqual(f.calls.map(r=>r.rowOffset),[0,43,86]);
 assert.equal(result.sample_complete,true);assert.equal(result.sample_rows,100);
 assert.deepEqual(result.sample,f.rows);assert.equal(result.read_limit,undefined);
 assert.deepEqual(result.windows.map(w=>[w.row_offset,w.next_row_offset]),[[0,43],[43,86],[86,100]]);
});
for(const [fault,change] of Object.entries({
 document:r=>r.node_context.document_id='other',node:r=>r.node_context.node_id='other',
 execution:r=>r.output.execution_id='other',process:r=>r.output.window_binding.process_record_id='other',
 port:r=>r.output.port_guid='other',
 gap:r=>r.output.row_offset++,overlap:r=>r.output.row_offset--,end:r=>r.output.next_row_offset++,
 count:r=>r.output.row_count++,schema:r=>r.output.schema[0].name='other',
 cleanup:r=>r.cleanup_complete=false,precision:r=>r.output.precision.numbers_verified=false,
 empty:r=>{r.output.sample=[];r.output.sample_rows=0;r.output.next_row_offset=r.output.row_offset;},
}))test('cold refuses '+fault+' change between windows without publishing stitched output',async()=>{
 const {readColdPortWindows}=await import('../cold-reader-policy.mjs'),f=windowFixture((r,n)=>{if(n===2)change(r);});
 await assert.rejects(()=>readColdPortWindows(f.channel,{node,execution:f.execution,port:0,rowCount:100}),/COLD_PORT_WINDOW/);
 assert.equal(f.calls.length,2);
});
const configuration={node_context:node};
const output=(types)=>({verified:true,inventory_complete:true,node_context:{...node,verified:true},port:0,node_id:node.node_id,
 fields:types.map(type=>({type,excluded:false}))});
test('actual small scalar and Variant definitions select native independently of expectations',()=>{
 assert.equal(coldNativeEligible(configuration,output(['string','real','integer','boolean'])),true);
 assert.equal(coldNativeEligible(configuration,output(Array(8).fill('variant'))),true);
});

function executionFixture({phase='identify',lock=false,repeat=false,mutate=()=>{},expired=false,transport=false}={}) {
 const calls=[],records=[],receipts=new Map();let sequence=0,failures=0;
 const operation={id:'cold',deadline:1000,nodeStepSequence:0,transportUncertain:transport};
 const context={...node,verified:true,surface:'graph',tid:'graph-node',locked:false};
 const receipt={status:'NOT_APPLIED',action_key:'ui.act',phase:lock?'observing':'preconditions',
  effect_possible:false,cleanup_complete:true,error:{code:lock?'PREPARED_NODE_CONTEXT_CHANGED':'UI_EPOCH_CHANGED'},
  output:{prepared_node_context:context},trace:lock?[{event:'prepared_node_surface_mismatch',before:{...context,locked:true},after:{...context}}]:[]};
 mutate(receipt);
 const steps=[];
 const step=(verb,r)=>{
  const id='cold:n'+(++sequence);operation.nodeStepSequence=sequence;
  const prepared={step:sequence,internal_operation_id:id,signature:id,verb};steps.push(prepared);
  receipts.set(id,{state:'completed',receipt:{...r,operation_id:id}});return prepared;
 };
 const driver={prepare:async()=>calls.push('prepare')};
 for(const key of ['launchGraph','identify','waitCompleted'])driver[key]=async()=>{
  calls.push(key);
  if(key===phase&&(repeat||failures++===0)) {
   step(key==='launchGraph'?'execute_graph_node':'click',receipt);
   const error=Error(lock?'locked during observation':'Node procedure recovery target or intent changed');
   if(lock)error.receipt=receipt;
   throw error;
  }
  return key==='waitCompleted'?{status:'completed',verified:true,owner_verified:true}:{};
 };
 const channel={get lastPreparedStep(){return steps.at(-1)},stepsSince:n=>steps.filter(s=>s.step>n)};
 const run=()=>runColdExecution({driver,channel,node,operation,
  readReceipt:async ref=>receipts.get(ref.id),record:async e=>records.push(e),now:()=>expired?1000:1});
 return {run,calls,records,operation};
}

test('n9 rebinds a repainted body through the common bounded perform',async()=>{
 let reads=0,mutations=0;const records=[];
 const operation={id:'n9',action:{action_key:'acceptance.cold_read',revision:'1'},deadline:1000,
  checkpoint:{document_id:'dom-doc',workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'}}};
 const channel=createNodeProcedure({operation,now:()=>1,wait:async()=>{},maxSteps:20,
  targetOrigin:'http://example.test',targetBuild:'7.4.2',record:async e=>{records.push(e);return e},
  wrapMutation:(code,reference)=>({reference}),execute:async code=>{
   if(typeof code==='string')return {status:'SUCCEEDED',output:{origin:'http://example.test',loginom_build:'7.4.2',
    workflow_ref:operation.checkpoint.workflow_ref,dom_epoch:{document:'dom-doc',revision:++reads},scan:{complete:true},
    wizard:{status:'absent'},ui:{masks:[],dialogs:[],truncated:{masks:false,dialogs:false},
     elements:[{ref:'ui-'+reads,allowed_actions:['click'],kind:'control'}]},
    launch:{node_id:node.node_id,node_ref:'body-'+reads,mode:'execute',source:'native_selected_graph_node'}}};
   mutations++;
   return {operation_id:code.reference.id,action_key:'ui.act',status:mutations===1?'NOT_APPLIED':'SUCCEEDED',
    phase:mutations===1?'preconditions':'completed',effect_possible:mutations>1,cleanup_complete:true,
    error:{code:'UI_EPOCH_CHANGED'},trace:[]};
  }});
 await channel.perform({condition:'repainted execution control',ready:()=>true,
  resolve:s=>({verb:'click',ref:s.ui.elements[0].ref}),
  identity:s=>coldGraphExecutionIdentity({node,launch:s.launch},node)});
 assert.equal(mutations,2);assert.equal(operation.deadline,1000);
 assert.equal(records.filter(e=>e.phase==='node_step_refresh_authorized').length,1);
 assert.equal(new Set(records.filter(e=>e.phase==='node_step_prepared').map(e=>e.internal_operation_id)).size,2);
});
test('graph execution identity retains native owner, command and source',()=>{
 const launch={node_id:node.node_id,node_ref:'old-body',mode:'execute',source:'native_selected_graph_node'};
 for(const key of ['launch','deactivation']) {
  const original={node,[key]:launch};
  assert.deepEqual(coldGraphExecutionIdentity(original,node),{node,[key]:{node_id:node.node_id,mode:'execute',source:launch.source}});
  assert.equal(original[key].node_ref,'old-body');
 }
 for(const changed of [{node_id:'foreign'},{source:'other'}]) {
  const identity={node,launch:{...launch,...changed}};
  assert.equal(coldGraphExecutionIdentity(identity,node),identity);
 }
});
function graphControlFixture({repeat=false,mutate=()=>{},changedIntent=false}={}) {
 let attempts=0,reads=0;const records=[];
 const operation={id:'graph-control',deadline:1000};
 const snapshot={prepared_node_context:{...node,verified:true,surface:'graph',locked:false},
  dom_epoch:{document:'dom-doc',revision:1},workflow_ref:{prefix:'MF;TF-1',tab_tid:'tab'},
  node_outputs:{verified:true,node_selected:true},
  launch:{node_id:node.node_id,node_ref:'body-1',mode:'execute',source:'native_selected_graph_node'}};
 const options={condition:'native execution control',initialObservation:snapshot,
  ready:s=>s.node_outputs?.verified===true&&s.node_outputs.node_selected===true,
  identity:s=>({node,launch:s.launch}),resolve:s=>({verb:changedIntent&&reads?'deactivate_graph_node':'execute_graph_node',ref:s.launch.node_ref})};
 const channel={
  perform:async o=>{
   attempts++;const s=o.initialObservation;o.resolve(s);o.identity(s);
   if(attempts>1&&!repeat)return {status:'SUCCEEDED'};
   const {node_outputs,...current}=structuredClone(s);
   current.launch.node_ref='body-2';
   const receipt={status:'NOT_APPLIED',action_key:'ui.act',operation_id:'graph:n'+attempts,
    phase:'preconditions',error:{code:'GRAPH_EXECUTION_CONTEXT_CHANGED'},effect_possible:false,cleanup_complete:true,trace:[],output:current};
   mutate(receipt);throw Object.assign(Error('graph repainted'),{receipt});
  },
  observe:async o=>{reads++;assert.equal(o.readOutputs,true);assert.equal(o.ready(snapshot),true);
   return {...snapshot,launch:{...snapshot.launch,node_ref:'body-3'}};},
 };
 return {run:()=>performColdNodeAction(channel,options,{node,operation,record:async e=>records.push(e),now:()=>1}),
  records,operation,get attempts(){return attempts},get reads(){return reads}};
}
test('native pre-gesture body replacement gets one full output observation and fresh action',async()=>{
 const f=graphControlFixture();assert.equal((await f.run()).status,'SUCCEEDED');
 assert.equal(f.attempts,2);assert.equal(f.reads,1);assert.equal(f.records.length,1);assert.equal(f.operation.deadline,1000);
});
for(const [name,options] of Object.entries({
 repeated:{repeat:true},changedIntent:{changedIntent:true},
 possibleEffect:{mutate:r=>r.effect_possible=true},unknown:{mutate:r=>r.status='AMBIGUOUS'},
 cleanup:{mutate:r=>r.cleanup_complete=false},gesture:{mutate:r=>r.trace.push({event:'ui_gesture_applied'})},
 foreignNode:{mutate:r=>r.output.prepared_node_context.node_id='foreign'},
 foreignDocument:{mutate:r=>r.output.dom_epoch.document='foreign'},
 changedCommand:{mutate:r=>r.output.launch.mode='deactivate'},
}))test('graph control refresh refuses '+name,async()=>{
 const f=graphControlFixture(options);await assert.rejects(f.run());
 assert.ok(f.attempts<=2);assert.ok(f.reads<=1);
 if(!options.repeat&&!options.changedIntent){assert.equal(f.attempts,1);assert.equal(f.reads,0);}
});
test('cold execution never restarts a refused launch stage',async()=>{
 const f=executionFixture({phase:'launchGraph'});await assert.rejects(f.run());
 assert.deepEqual(f.calls,['prepare','launchGraph']);assert.equal(f.records.length,0);
});
test('n11 lock transition refreshes ownership reading without launching again',async()=>{
 const f=executionFixture({phase:'waitCompleted',lock:true});await f.run();
 assert.deepEqual(f.calls,['prepare','launchGraph','identify','waitCompleted','waitCompleted']);
 assert.equal(f.records[0].reason,'graph_lock_changed');assert.equal(f.operation.deadline,1000);
});
test('console epoch refusal refreshes identification without repeating Execute',async()=>{
 const f=executionFixture({phase:'identify'});await f.run();
 assert.equal(f.calls.filter(c=>c==='launchGraph').length,1);
 assert.equal(f.calls.filter(c=>c==='identify').length,2);
});
test('cold refresh stops after one resumed attempt',async()=>{
 const f=executionFixture({repeat:true});await assert.rejects(f.run());
 assert.equal(f.calls.filter(c=>c==='identify').length,2);assert.equal(f.records.length,1);
});
for(const [name,options] of Object.entries({
 expired:{expired:true},transport:{transport:true},
 possibleEffect:{mutate:r=>r.effect_possible=true},unknown:{mutate:r=>r.status='AMBIGUOUS'},
 noCleanup:{mutate:r=>r.cleanup_complete=false},missingTrace:{mutate:r=>delete r.trace},
 preconditionsPassed:{mutate:r=>r.trace.push({event:'ui_preconditions_verified'})},
 gestureApplied:{mutate:r=>r.trace.push({event:'ui_gesture_applied'})},
 foreignDocument:{mutate:r=>r.output.prepared_node_context.document_id='foreign'},
 foreignWorkflow:{mutate:r=>r.output.prepared_node_context.workflow_id='foreign'},
 foreignNode:{mutate:r=>r.output.prepared_node_context.node_id='foreign'},
 wrongCode:{mutate:r=>r.error.code='UI_REFERENCE_STALE'},
 changedLockOwner:{lock:true,mutate:r=>r.trace[0].after.node_id='foreign'},
 changedSurface:{lock:true,mutate:r=>r.trace[0].after.surface='views'},
 changedTid:{lock:true,mutate:r=>r.trace[0].after.tid='other'},
 noLockTransition:{lock:true,mutate:r=>r.trace[0].before.locked=false},
}))test('cold refresh refuses '+name,async()=>{
 const f=executionFixture(options);await assert.rejects(f.run());
 assert.equal(f.calls.filter(c=>c==='launchGraph').length,1);assert.equal(f.calls.filter(c=>c==='identify').length,1);
});
test('wide and civil DateTime definitions retain formatted reading',()=>{
 assert.equal(coldNativeEligible(configuration,output(Array(9).fill('real'))),false);
 assert.equal(coldNativeEligible(configuration,output(['string','datetime'])),false);
});
test('incomplete, foreign or wrong-port definitions cannot select native',()=>{
 for(const mutate of [o=>o.verified=false,o=>o.inventory_complete=false,o=>o.node_context.node_id='other',
  o=>o.port=1,o=>o.fields=[],o=>o.fields[0].type='unknown']){
  const o=output(['real']);mutate(o);assert.equal(coldNativeEligible(configuration,o),false);
 }
});

function openingFixture(change=()=>{}){
 const operation={id:'cold',deadline:Date.now()+60000},records=[];
 const output={port_guid:'port',active:true,index:0};
 const state={prepared_node_context:{...node,verified:true,surface:'graph'},node_outputs:{node_selected:true},
  ui:{elements:[{ref:'views',allowed_actions:['open_node_views']}],dialogs:[],masks:[]}};
 const after={...state,prepared_node_context:{...state.prepared_node_context,surface:'views'},
  node_outputs:{verified:true,port_panels:[{port_guid:'port'}]}};
 const receipt={operation_id:'cold:n1',action_key:'ui.act',status:'AMBIGUOUS',phase:'observing',effect_possible:true,
  cleanup_complete:true,error:{code:'UI_DEADLINE_EXCEEDED'},trace:[
   {event:'ui_preconditions_verified',verb:'open_node_views',refs:['views']},
   {event:'ui_gesture_applied',verb:'open_node_views'}]};
 let gestures=0,reads=0,inspections=0;
 const step={internal_operation_id:receipt.operation_id,signature:'signature',action:{verb:'open_node_views',ref:'views'}};
 const fixture={receipt,operation,after,step,inspection:{state:'completed',receipt:structuredClone(receipt)}};
 change(fixture);
 const channel={lastPreparedStep:step,perform:async options=>{
  assert.equal(options.ready(state),true);assert.deepEqual(options.resolve(state),{verb:'open_node_views',ref:'views'});
  gestures++;throw Object.assign(Error('original opening timeout'),{receipt});
 },observe:async options=>{reads++;if(!options.ready(after))throw Error('Views do not own the original output');return after;}};
 return {run:()=>openColdOutputViews(channel,{state,output},{node,operation,record:async e=>records.push(e),
  readReceipt:async ref=>{inspections++;assert.equal(ref.signature,'signature');return fixture.inspection;}}),
  records,counts:()=>({gestures,reads,inspections})};
}
test('completed timed-out Views opening settles read-only without repeating its possible gesture',async()=>{
 const f=openingFixture();await f.run();assert.deepEqual(f.counts(),{gestures:1,reads:1,inspections:1});
 assert.equal(f.records[0].phase,'cold_output_views_settled');assert.equal(f.records[0].effect_possible,true);
});
for(const [name,change] of Object.entries({
 transport:f=>f.operation.transportUncertain=true,expired:f=>f.operation.deadline=Date.now(),
 unissued:f=>f.receipt.effect_possible=false,noCleanup:f=>f.receipt.cleanup_complete=false,
 wrongStatus:f=>f.receipt.status='NOT_APPLIED',wrongCode:f=>f.receipt.error.code='OTHER',
 noTrace:f=>f.receipt.trace=[],noGesture:f=>f.receipt.trace.pop(),
 duplicateGesture:f=>f.receipt.trace.push(f.receipt.trace[1]),
 foreignRef:f=>f.receipt.trace[0].refs=['other'],foreignReceipt:f=>f.receipt.operation_id='other',
 unconfirmed:f=>f.inspection.state='pending',changedReceipt:f=>f.inspection.receipt.cleanup_complete=false,
 foreignNode:f=>f.after.prepared_node_context.node_id='other',
 foreignPort:f=>f.after.node_outputs.port_panels[0].port_guid='other',
 dialog:f=>f.after.ui.dialogs=[{}],mask:f=>f.after.ui.masks=[{}],
}))test('cold Views settlement refuses '+name,async()=>{
 const f=openingFixture(change);await assert.rejects(f.run());assert.equal(f.counts().gestures,1);
 assert.equal(f.records.length,0);
});
