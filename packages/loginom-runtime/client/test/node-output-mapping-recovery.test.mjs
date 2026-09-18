import test from 'node:test';import assert from 'node:assert/strict';
import {outputMappingOrigin,outputMappingState,verifyOutputMappingFinish,outputRecoveryBoundary,reconcileOutputMappingPhase,sameOutputRecovery} from '../lib/node-output-mapping-recovery.mjs';
const node={document_id:'d',workflow_id:'w',node_id:'n'};
const mapping=()=>({verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',autosync:true,
 node_context:{...node,verified:true,output_port:{direction:'output',port:0,native_index:0,port_guid:'port',opening_operation_id:'open'}},
 source_fields:[{record_id:'s1',field_id:'4',index:0,name:'A',type:'real'}],target_fields:[{record_id:'t1',field_id:'4',index:0,name:'A',type:'real',data_kind:'Непрерывный',usage_type:3,source:{record_id:'s1',field_id:'4',name:'A'}}],rendered_indices:[0]});
test('mapping recovery ignores only ephemeral row IDs and retains all mapping semantics and port identity',()=>{
 const m=mapping(),copy=structuredClone(m);copy.source_fields[0].record_id='s2';copy.target_fields[0].record_id='t2';copy.target_fields[0].source.record_id='s2';copy.rendered_indices=[];copy.node_context.output_port.opening_operation_id='probe';
 assert.ok(sameOutputRecovery(outputMappingState(m,node),outputMappingState(copy,node)));
 for(const change of [x=>x.autosync=false,x=>x.target_fields[0].name='other',x=>x.target_fields[0].usage_type=4,x=>x.target_fields[0].origin_type=1,x=>x.target_fields[0].source.field_id='5',x=>x.target_fields[0].type='integer',x=>x.node_context.output_port.port_guid='foreign']){
  const bad=structuredClone(m);change(bad);assert.equal(sameOutputRecovery(outputMappingState(m,node),outputMappingState(bad,node)),false);
 }
 const bad=mapping();bad.node_context.node_id='foreign';assert.throws(()=>outputMappingState(bad,node));
});
const checkpoint=()=>({node,origin:outputMappingOrigin('http://test'),build:'7.4.2',wizard_root_ref:'wizard',finish_reference:{id:'op:n7'}});
test('only a uniquely source-bound excluded placeholder may receive a new ID after Done',()=>{
 const m=mapping();m.target_fields[0].excluded=true;m.target_fields[0].source=null;
 m.target_fields[0].exclusion_source=structuredClone(m.source_fields[0]);
 const expected=outputMappingState(m,node),copy=structuredClone(m);copy.target_fields[0].field_id='new-placeholder';
 assert.deepEqual(outputMappingState(copy,node),expected);
 const active=mapping(),changed=structuredClone(active);changed.target_fields[0].field_id='other';
 assert.notDeepEqual(outputMappingState(active,node),outputMappingState(changed,node));
 copy.target_fields[0].exclusion_source.field_id='foreign';assert.throws(()=>outputMappingState(copy,node),/unique source/);
 const missing=structuredClone(m);delete missing.target_fields[0].exclusion_source;assert.throws(()=>outputMappingState(missing,node));
 const duplicate=structuredClone(m);duplicate.source_fields.push(duplicate.source_fields[0]);assert.throws(()=>outputMappingState(duplicate,node));
});
const finish=()=>({state:'completed',receipt:{status:'SUCCEEDED',cleanup_complete:true,operation_id:'op:n7',action_key:'ui.act',
 output:{origin:'http://test',loginom_build:'7.4.2',prepared_node_context:{...node,surface:'graph',locked:false},wizard:{status:'absent'}},
 trace:[{event:'ui_gesture_applied',verb:'finish_wizard'},{event:'output_port_finish_verified',wizard_root_ref:'wizard'}]}});
test('a historical receipt must prove the original output Done and exact prepared owner before any probe',()=>{
 assert.equal(verifyOutputMappingFinish(checkpoint(),finish()).operation_id,'op:n7');
 for(const change of [r=>r.state='unknown',r=>r.receipt.operation_id='other',r=>r.receipt.cleanup_complete=false,
  r=>r.receipt.output.prepared_node_context.node_id='foreign',r=>r.receipt.output.prepared_node_context.locked=true,
  r=>r.receipt.output.wizard.status='observed',r=>r.receipt.trace[0].verb='execute_wizard',r=>r.receipt.trace[1].event='input_port_finish_verified',
  r=>r.receipt.trace[1].wizard_root_ref='other']){const r=finish();change(r);assert.throws(()=>verifyOutputMappingFinish(checkpoint(),r));}
});
function operation(){return {id:'op',nodeApply:{node,signature:'sig',request:{contract_revision:'1.0.0',target:{type:'transform.calculator'}},phases:['source','workflow','target','input_mapping','open','configure','node_finish'].map(phase=>({phase})),pending:{phase:'output_mapping',receipt_id:'op:output_mapping',deadline:100},deadline:200,configure_deadline:100,execution:{status:'not_requested'},output:{status:'not_refreshed'},cleanup_complete:false},transportUncertain:true};}
test('reconciliation accepts the phase only after durable proof, retaining original ID and no execution',async()=>{
 const op=operation();op.nodeApplyDrivers={recoverOutputMapping:async()=>({verified:true,cleanup_complete:true,finish:{settings_applied:true,execution_started:false},recovery:{verified:true}})};
 const events=[];await reconcileOutputMappingPhase({operation:op,now:()=>1,record:async e=>{events.push(e);return structuredClone(e);}});
 assert.equal(op.nodeApply.pending,null);assert.equal(op.nodeApply.execution.status,'not_requested');assert.equal(op.transportUncertain,false);assert.equal(events[0].receipt.receipt_id,'op:output_mapping');assert.equal(op.nodeApply.phases.at(-1).phase,'output_mapping');
 await assert.rejects(reconcileOutputMappingPhase({operation:op,now:()=>1}),/boundary/);
});
test('unproven mappings, interrupted probes, deadlines and failed journal writes keep the original pending',async()=>{
 for(const fault of ['mismatch','cleanup','execute','journal','deadline']){
  const op=operation();let calls=0;op.nodeApplyDrivers={recoverOutputMapping:async()=>{calls++;if(fault==='mismatch')throw Error('mapping differs');return {verified:true,cleanup_complete:fault!=='cleanup',finish:{settings_applied:true,execution_started:fault==='execute'},recovery:{verified:true}};}};
  await assert.rejects(reconcileOutputMappingPhase({operation:op,now:()=>fault==='deadline'?100:1,record:async e=>fault==='journal'?{}:e}));
  assert.equal(op.nodeApply.pending.receipt_id,'op:output_mapping');assert.equal(op.nodeApply.phases.length,7);assert.equal(op.transportUncertain,true);if(fault==='deadline')assert.equal(calls,0);
 }
});

test('prepared recovery proof survives the real redacted durable journal without weakening acknowledgement',async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {createExecutionJournal}=await import('../lib/execution-journal.mjs');
 const directory=await mkdtemp(join(tmpdir(),'output-recovery-'));
 try{
  const record=createExecutionJournal({directory,metadata:{sessionId:'session',clientRevision:'revision'}});
  const event={phase:'node_output_mapping_commit_prepared',checkpoint:checkpoint()};
  const ack=await record(event);assert.ok(sameOutputRecovery(event,{phase:ack.phase,checkpoint:ack.checkpoint}));
  const persisted=JSON.parse((await readFile(join(directory,'execution-events.jsonl'),'utf8')).trim());
  assert.equal(verifyOutputMappingFinish(persisted.checkpoint,finish()).operation_id,'op:n7');
  const op=operation();op.nodeApplyDrivers={recoverOutputMapping:async()=>({verified:true,cleanup_complete:true,finish:{settings_applied:true,execution_started:false},recovery:{verified:true}})};
  await reconcileOutputMappingPhase({operation:op,now:()=>1,record});assert.equal(op.nodeApply.pending,null);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('output reconciliation also retains the configured formulas and input schema',async()=>{
 const {outputRecoveryCalculatorState}=await import('../lib/node-output-mapping-recovery.mjs');
 const c={verified:true,inventory_complete:true,mode:'expression',node_context:node,expressions:[{index:0,record_id:'1',expression_id:'0',name:'B',label:'B',type:'real',formula:'A*2',intermediate:false,replace:false,cached:false,description:'',selected:true}],input_fields:[{record_id:'2',name:'A',label:'A',type:'real',replaced:false}]};
 const expected=outputRecoveryCalculatorState(c,node),copy=structuredClone(c);copy.expressions[0].record_id='3';copy.expressions[0].selected=false;assert.deepEqual(outputRecoveryCalculatorState(copy,node),expected);
 for(const change of [x=>x.expressions[0].formula='A*3',x=>x.input_fields[0].type='string',x=>x.expressions[0].intermediate=true]){const wrong=structuredClone(c);change(wrong);assert.notDeepEqual(outputRecoveryCalculatorState(wrong,node),expected);}
});
