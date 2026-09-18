import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNodeReadRequest,alignReadSchema} from '../lib/node-read-contract.mjs';
import {applyNode,validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {dispatchNodeApi,nodeApiTools} from '../lib/node-api.mjs';
const node={document_id:'doc',workflow_id:'wf',node_id:'node'};
const schema=[{index:0,name:'value',label:'Value',type:'real'}];
const source=()=>({parameters:{contract_revision:'1.0.0',target:{type:'transform.calculator',label:'Calculation'},workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'MF;TF-1;path',label:'Scenario'}]}},outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{node,cleanup_complete:true,execution:{status:'completed'},output:{ports:[{port:0,schema}]}}}});
const args={operation_id:'read',source_operation_id:'created',read:{sample_rows:100,require_exact_numbers:true}};
const handlers=new Map([['transform.calculator',{revision:'1',modes:['expression'],validate(){throw Error('Configuration validation must not run');},configure(){throw Error('Configuration must not run');},configurationReadback(){throw Error('No configuration readback');}}]]);
test('read API accepts only local operation identity and bounded reading options',async()=>{
 const calls=[],runtime={tools:nodeApiTools,startNodeRead:a=>{calls.push(a);return a;}};
 await dispatchNodeApi(runtime,'dock_node_read',args);assert.deepEqual(calls,[args]);
 for(const patch of [{parameters:{}},{target:node},{finish:'done'},{read:{sample_rows:101}},{read:{coverage:'full'}},{source_operation_id:''}]){
  await assert.rejects(dispatchNodeApi(runtime,'dock_node_read',{...args,...patch}));
 }
 assert.equal(calls.length,1);
});
test('unknown, failed, unsettled, file-only and absent-port sources refuse before execution',()=>{
 for(const mutate of [s=>s.outcome.status='FAILED',s=>s.outcome.cleanup_complete=false,s=>s.outcome.output.execution.status='pending',s=>s.parameters.target.type='exports.text',s=>s.outcome.output.output.ports=[]]){
  const s=source();mutate(s);assert.throws(()=>buildNodeReadRequest(args,s));
 }
 assert.throws(()=>buildNodeReadRequest(args,undefined));
 assert.throws(()=>buildNodeReadRequest({...args,read:{ports:[1]}},source()));
 const s=source(),before=structuredClone(s),request=buildNodeReadRequest(args,s);
 validateNodeApplyRequest(request,handlers);assert.deepEqual(s,before);
 assert.deepEqual(request.inputs,[]);assert.deepEqual(request.mappings,[]);assert.equal(request.target.kind,'existing');
});
test('read lifecycle skips every configuration phase and retries without another launch',async()=>{
 const request=buildNodeReadRequest(args,source()),operation={id:'read'},calls=[];
 const result=(phase,value={})=>async()=>{calls.push(phase);return {verified:true,cleanup_complete:true,effect_possible:false,...value};};
 const forbidden=()=>{throw Error('Wizard or mapping touched');};
 const drivers={verifySource:result('source'),prepareTarget:result('target',{node}),openWizard:forbidden,mapPorts:forbidden,finish:forbidden,
  finishGraph:result('finish',{mode:'execute',execution_id:'exec',settings_applied:false}),
  waitExecution:result('execute',{execution_id:'exec',status:'completed'}),
  readOutput:result('read',{execution_id:'exec',status:'complete',evidence_ref:'read:output',ports:[{port:0,fresh:true}]}),verifyContinuation:async()=>false};
 const run=()=>applyNode({request,operation,handlers,drivers,record:async e=>structuredClone(e)});
 const out=await run();assert.equal(out.status,'SUCCEEDED',JSON.stringify(out));assert.equal(out.configuration.status,'not_requested');
 assert.deepEqual(calls,['source','target','finish','execute','read']);assert.deepEqual(await run(),out);assert.equal(calls.length,5);
});
test('field reordering preserves identity while type, label, missing and repeated fields refuse',()=>{
 const fields=[...schema,{index:1,name:'key',label:'Key',type:'string'}];
 const reordered=[{...fields[1],index:0},{...fields[0],index:1}];assert.deepEqual(alignReadSchema(reordered,fields),reordered);
 for(const actual of [[...reordered,{...reordered[0],index:2}],[reordered[0]],reordered.map(f=>({...f,type:'boolean'})),reordered.map(f=>({...f,label:'Wrong'}))])assert.throws(()=>alignReadSchema(actual,fields));
});
test('read refuses settings mutation and stale execution output without retrying browser effects',async()=>{
 for(const fault of ['settings','execution','output','lost_finish']){
  const request=buildNodeReadRequest(args,source()),operation={id:'read'},calls=[];
  const ok=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});
  const drivers={verifySource:async()=>ok({}),prepareTarget:async()=>ok({node}),mapPorts:async()=>{throw Error('Forbidden');},openWizard:async()=>{throw Error('Forbidden');},finish:async()=>{throw Error('Forbidden');},
   finishGraph:async()=>{calls.push('finish');if(fault==='lost_finish')throw Error('Response lost');return ok({mode:'execute',execution_id:'fresh',settings_applied:fault==='settings'});},
   waitExecution:async()=>ok({execution_id:fault==='execution'?'stale':'fresh',status:'completed'}),
   readOutput:async()=>ok({execution_id:fault==='output'?'stale':'fresh',status:'complete',evidence_ref:'output',ports:[{port:0,fresh:true}]}),verifyContinuation:async()=>false};
  const run=()=>applyNode({request,operation,handlers,drivers,record:async e=>structuredClone(e)});
  const out=await run();assert.notEqual(out.status,'SUCCEEDED',fault);
  try{await run();}catch{}assert.equal(calls.length,1,fault);
 }
});
function unreadSource(){
 const s=source(),n=s.outcome.output;n.output.ports=[];
 const phases=['input_mapping','configure','node_finish','output_mapping','finish'];
 n.phases=phases.map(phase=>({phase,receipt_id:'created:'+phase,status:'verified'}));
 n.configuration={status:'applied',readback:{scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
 receipt_ids:n.phases.map(p=>p.receipt_id),output_mapping:{port:0,autosync:false,fields:[
  {index:0,name:'hidden',label:'Hidden',type:'string',data_kind:'Дискретный',source_name:'hidden',excluded:true},
  {...schema[0],index:1,data_kind:'Непрерывный',source_name:'value',excluded:false}]}}};return s;
}
test('first read uses verified local output mapping without a prior preview',()=>{
 const s=unreadSource(),before=structuredClone(s),r=buildNodeReadRequest(args,s);validateNodeApplyRequest(r,handlers);
 assert.deepEqual(r.parameters.schemas,[{port:0,schema:[{...schema[0],data_kind:'Непрерывный'}]}]);assert.deepEqual(s,before);
});
for(const [name,mutate] of Object.entries({
 owner:r=>r.node.node_id='other',document:r=>r.node.document_id='other',workflow:r=>r.node.workflow_id='other',
 scope:r=>r.scope='caller_provided',values:r=>r.values_are='requested_values',receipts:r=>r.receipt_ids[0]='foreign:configure',
 noFinish:r=>r.receipt_ids.pop(),noMapping:r=>r.receipt_ids.splice(3,1),duplicateReceipt:r=>r.receipt_ids.push(r.receipt_ids[0]),
 fieldOrder:r=>r.output_mapping.fields[1].index=0,fieldType:r=>delete r.output_mapping.fields[1].type,
 allExcluded:r=>r.output_mapping.fields[1].excluded=true,ambiguousExclusion:r=>r.output_mapping.fields[1].excluded='false',
 missingSource:r=>delete r.output_mapping.fields[1].source_name,
 duplicatePort:r=>r.output_mappings=[r.output_mapping,r.output_mapping],
 }))test('first read rejects untrusted retained mapping: '+name,()=>{
 const s=unreadSource();mutate(s.outcome.output.configuration.readback);assert.throws(()=>buildNodeReadRequest(args,s));
});
test('first read rejects unverified phases and never borrows a missing port',()=>{
 const s=unreadSource();s.outcome.output.phases[0].status='pending';assert.throws(()=>buildNodeReadRequest(args,s));
 assert.throws(()=>buildNodeReadRequest({...args,read:{ports:[1]}},unreadSource()));
});
