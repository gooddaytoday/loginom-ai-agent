import test from 'node:test';import assert from 'node:assert/strict';
import {inputMappingOrigin,inputMappingState,inputMappingGraph,verifyInputMappingFinish,inputRecoveryBoundary,reconcileInputMappingPhase,sameInputRecovery} from '../lib/node-input-mapping-recovery.mjs';
const node={document_id:'d',workflow_id:'w',node_id:'n'};
const mapping=()=>({verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',autosync:true,
 node_context:{...node,verified:true,input_port:{direction:'input',port:0,native_index:0,port_guid:'port',opening_operation_id:'open'}},
 source_fields:[{record_id:'s1',field_id:'4',index:0,name:'A',type:'real'}],target_fields:[{record_id:'t1',field_id:'4',index:0,name:'A',type:'real',data_kind:'Непрерывный',usage_type:3,source:{record_id:'s1',field_id:'4',name:'A'}}],rendered_indices:[0]});
test('mapping recovery ignores only ephemeral row IDs and retains all mapping semantics and port identity',()=>{
 const m=mapping(),copy=structuredClone(m);copy.source_fields[0].record_id='s2';copy.target_fields[0].record_id='t2';copy.target_fields[0].source.record_id='s2';copy.rendered_indices=[];copy.node_context.input_port.opening_operation_id='probe';
 assert.ok(sameInputRecovery(inputMappingState(m,node),inputMappingState(copy,node)));
 for(const change of [x=>x.autosync=false,x=>x.target_fields[0].name='other',x=>x.target_fields[0].usage_type=4,x=>x.target_fields[0].origin_type=1,x=>x.target_fields[0].source.field_id='5',x=>x.target_fields[0].type='integer',x=>x.node_context.input_port.port_guid='foreign']){
  const bad=structuredClone(m);change(bad);assert.equal(sameInputRecovery(inputMappingState(m,node),inputMappingState(bad,node)),false);
 }
 const bad=mapping();bad.node_context.node_id='foreign';assert.throws(()=>inputMappingState(bad,node));
});
const checkpoint=()=>({node,origin:inputMappingOrigin('http://test'),build:'7.4.2',wizard_root_ref:'wizard',finish_reference:{id:'op:n7'}});
const finish=()=>({state:'completed',receipt:{status:'SUCCEEDED',cleanup_complete:true,operation_id:'op:n7',action_key:'ui.act',
 output:{origin:'http://test',loginom_build:'7.4.2',prepared_node_context:{...node,surface:'graph',locked:false},wizard:{status:'absent'}},
 trace:[{event:'ui_gesture_applied',verb:'finish_wizard'},{event:'input_port_finish_verified',wizard_root_ref:'wizard'}]}});
test('a historical receipt must prove the original input Done and exact prepared owner before any probe',()=>{
 assert.equal(verifyInputMappingFinish(checkpoint(),finish()).operation_id,'op:n7');
 for(const change of [r=>r.state='unknown',r=>r.receipt.operation_id='other',r=>r.receipt.cleanup_complete=false,
  r=>r.receipt.output.prepared_node_context.node_id='foreign',r=>r.receipt.output.prepared_node_context.locked=true,
  r=>r.receipt.output.wizard.status='observed',r=>r.receipt.trace[0].verb='execute_wizard',r=>r.receipt.trace[1].event='output_port_finish_verified',
  r=>r.receipt.trace[1].wizard_root_ref='other']){const r=finish();change(r);assert.throws(()=>verifyInputMappingFinish(checkpoint(),r));}
});
test('source replacement remains a different graph even with equal labels and columns',()=>{
 const graph={complete:true,document_id:'d',workflow_ref:{workflow_id:'w'},foreign_links:[],links:[{source:'source',output:0,target:'n',input:0}],nodes:['source','n'].map(id=>({ref:{...node,node_id:id},type:'t',label:'Same',inputs:[0],outputs:[0],locked:false}))};
 const before=inputMappingGraph(graph,node),after=structuredClone(graph);after.nodes[0].ref.node_id='replacement';after.links[0].source='replacement';assert.equal(sameInputRecovery(before,inputMappingGraph(after,node)),false);
 after.foreign_links=['unknown'];assert.throws(()=>inputMappingGraph(after,node));
});
function operation(){return {id:'op',nodeApply:{node,signature:'sig',request:{contract_revision:'1.0.0'},phases:[{phase:'source'},{phase:'workflow'},{phase:'target'}],pending:{phase:'input_mapping',receipt_id:'op:input_mapping',deadline:100},deadline:200,configure_deadline:100,execution:{status:'not_requested'},output:{status:'not_refreshed'},cleanup_complete:false},transportUncertain:true};}
test('reconciliation accepts the phase only after durable proof, retaining original ID and no execution',async()=>{
 const op=operation();op.nodeApplyDrivers={recoverInputMapping:async()=>({verified:true,cleanup_complete:true,finish:{settings_applied:true,execution_started:false},recovery:{verified:true}})};
 const events=[];await reconcileInputMappingPhase({operation:op,now:()=>1,record:async e=>{events.push(e);return structuredClone(e);}});
 assert.equal(op.nodeApply.pending,null);assert.equal(op.nodeApply.execution.status,'not_requested');assert.equal(op.transportUncertain,false);assert.equal(events[0].receipt.receipt_id,'op:input_mapping');assert.equal(op.nodeApply.phases.at(-1).phase,'input_mapping');
 await assert.rejects(reconcileInputMappingPhase({operation:op,now:()=>1}),/boundary/);
});
test('unproven mappings, interrupted probes, deadlines and failed journal writes keep the original pending',async()=>{
 for(const fault of ['mismatch','cleanup','execute','journal','deadline']){
  const op=operation();let calls=0;op.nodeApplyDrivers={recoverInputMapping:async()=>{calls++;if(fault==='mismatch')throw Error('mapping differs');return {verified:true,cleanup_complete:fault!=='cleanup',finish:{settings_applied:true,execution_started:fault==='execute'},recovery:{verified:true}};}};
  await assert.rejects(reconcileInputMappingPhase({operation:op,now:()=>fault==='deadline'?100:1,record:async e=>fault==='journal'?{}:e}));
  assert.equal(op.nodeApply.pending.receipt_id,'op:input_mapping');assert.equal(op.nodeApply.phases.length,3);assert.equal(op.transportUncertain,true);if(fault==='deadline')assert.equal(calls,0);
 }
});

test('prepared recovery proof survives the real redacted durable journal without weakening acknowledgement',async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {createExecutionJournal}=await import('../lib/execution-journal.mjs');
 const directory=await mkdtemp(join(tmpdir(),'input-recovery-'));
 try{
  const record=createExecutionJournal({directory,metadata:{sessionId:'session',clientRevision:'revision'}});
  const event={phase:'node_input_mapping_commit_prepared',checkpoint:checkpoint()};
  const ack=await record(event);assert.ok(sameInputRecovery(event,{phase:ack.phase,checkpoint:ack.checkpoint}));
  const persisted=JSON.parse((await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim());
  assert.equal(verifyInputMappingFinish(persisted.checkpoint,finish()).operation_id,'op:n7');
  const op=operation();op.nodeApplyDrivers={recoverInputMapping:async()=>({verified:true,cleanup_complete:true,finish:{settings_applied:true,execution_started:false},recovery:{verified:true}})};
  await reconcileInputMappingPhase({operation:op,now:()=>1,record});assert.equal(op.nodeApply.pending,null);
 }finally{await rm(directory,{recursive:true,force:true});}
});
