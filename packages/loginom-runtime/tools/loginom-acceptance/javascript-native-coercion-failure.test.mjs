import test from 'node:test';
import assert from 'node:assert/strict';
import {roundtrip} from './javascript-native-roundtrip.test.mjs';
import {sourceEvidence} from './javascript-native-input.test.mjs';
import {javascriptCoercionIds,javascriptCoercionCase} from './javascript-native-coercion-cases.mjs';
import {nativeInputProvenance,verifyNativeInputRead} from './javascript-native-input-contract.mjs';
import {verifyNativeRoundtripExecution,verifyNativeRoundtripRead} from './javascript-native-roundtrip-contract.mjs';
import {sealJavascriptCoercionFailure,verifyCoercionFailedExecution,verifyCoercionFailureWitness,verifyCoercionFailureOutcome} from './javascript-native-coercion-failure.mjs';
import {readNativeCoercionFailure} from './javascript-native-coercion-failure-driver.mjs';
import {readNativeRoundtrip} from './javascript-native-roundtrip-driver.mjs';
import {javascriptNativeRoundtripCode} from './javascript-native-roundtrip-binding.mjs';
import {readJavascriptNativeRoundtrip,javascriptNativeRoundtripStatus} from './javascript-native-roundtrip-read.mjs';
import {decodeVariantFrame} from '../../client/lib/variant-native-decode.mjs';
import {completeJavascriptNativeRoundtrip} from './javascript-native-roundtrip-owner.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const runtimeError='TypeError: native Set rejected value\n   at module (<main>:9:1)';

// Recorded-object/transport fixture only: tests do not run a JS coercion engine
// or claim this synthetic error establishes a live line mapping.
export async function fixture(id=javascriptCoercionIds[0],{message=runtimeError,reply}={}){
 const x=await roundtrip({fixtureId:id,wizardOnly:true,reply}),f=x.f;
 await x.prepare();x.dispose();await x.seal();
 f.b.package_id='d:w';x.inputRaw.package_id='d:w';
 const node={document_id:'d',workflow_id:'w',node_id:'js'},spec=javascriptCoercionCase(id);
 const execution={verified:true,status:'failed',failure_verified:true,owner_verified:true,cleanup_complete:true,output_refreshed:false,
  node,root_id:'1',group_id:'4',group_record_id:'4',process_id:'4.1',process_record_id:'5',execution_id:'d:1:4',
  ownership_source:'native_process_model_identity_and_show_node',error_source:'native_child_error_details',error:{code:'NODE_EXECUTION_FAILED',message},
  trial:{phase:'initial',node_id:'js',source_sha256:spec.source_sha256},fresh_baseline:{node,root_id:'1',roots:[{process_id:'2'}]},
  launch_identity:{node,root_id:'1',group_id:'4',group_record_id:'4',execution_id:'d:1:4'}};
 const child={internalId:5,data:{id:'4.1',Status:2,ErrorDetails:message,ModelNode:x.js.data,ProgressBarCls:'bg-progress-ptpsError',CanCancelProcess:false},childNodes:[]};
 const group={internalId:4,data:{id:'4',Status:2,ErrorDetails:'Failed child',loaded:true,ProgressBarCls:'bg-progress-ptpsError',CanCancelProcess:false},childNodes:[child]};
 f.root.childNodes.push(group);
 const binding={...f.b,read_id:'before'},lifecycle={...clone(f.env.__loginomJavascriptNativeInputReadV1.last),retired:false};
 const provenance=nativeInputProvenance(sourceEvidence(id));
 const before={binding,raw:x.inputRaw,lifecycle,exact:verifyNativeInputRead(x.inputRaw,{binding,lifecycle,provenance})};
 const input={node:{document_id:'d',workflow_id:'w',node_id:'n'},table:{port_guid:'p'},native_input:{native:before}};
 const seal=()=>f.page.evaluate(sealJavascriptCoercionFailure,{fixture_id:id,source:spec.source,source_sha256:spec.source_sha256,execution});
 const bind=failed=>{
  f.model.FPreviewManager.FPreviewVisible=true;
  return f.execute(javascriptNativeRoundtripCode({...f.b,binding_id:'upstream',roundtrip_role:'upstream',source_sha256:spec.source_sha256,failed_terminal:failed}));
 };
 const read=async failed=>{
  const binding=await bind(failed),raw=await readJavascriptNativeRoundtrip(f.page,binding,decodeVariantFrame,{operationId:'upstream'});
  const lifecycle=await javascriptNativeRoundtripStatus(f.page),expected={...binding,read_id:'upstream'};
  return {raw,lifecycle,binding:expected,exact:verifyNativeRoundtripRead(raw,{binding:expected,lifecycle,input:before,role:'upstream'})};
 };
 return {x,f,node,id,spec,execution,child,group,before,input,seal,bind,read};
}
for(const id of javascriptCoercionIds){
 test(id+' real serialized failed witness and original upstream with zero OUTPUT reads',async()=>{
  const s=await fixture(id);verifyCoercionFailedExecution(s.execution,s.node,id);
  const failed=await s.seal();verifyCoercionFailureWitness(failed,s.execution,s.node,id);
  assert.throws(()=>verifyNativeRoundtripExecution(s.execution,s.node,id));
  await assert.rejects(async()=>s.f.page.evaluate(completeJavascriptNativeRoundtrip,{execution:s.execution,source_sha256:s.spec.source_sha256}));
  const upstream=await s.read(failed),results={before:s.before,failed,upstream,output:{status:'not_read_failed_execution'}};
  const outcome=verifyCoercionFailureOutcome(results,id);
  assert.equal(outcome.status,'owned_execution_failure_unattributed');assert.equal(outcome.case_complete,false);
  assert.equal(outcome.rejection_attributed,false);assert.equal(outcome.input_exact,true);assert.equal(outcome.upstream_exact,true);
  assert.equal(outcome.exact_pass,false);assert.equal(outcome.g5_complete,false);
  assert.equal(s.f.env.__loginomJavascriptNativeRoundtripV1.executionWitness,undefined);
  assert.equal(s.f.env.__loginomJavascriptNativeRoundtripV1.bindings.has('output'),false);
  assert.deepEqual(s.f.counters,{sent:2,requests:2,responses:2});
  await assert.rejects(async()=>s.bind(failed),/already reserved/);
 });
}
const sealFaults={
 'wrong child native owner':s=>s.child.data.ModelNode={},
 'second owned child':s=>s.group.childNodes.push({...s.child,internalId:8,data:{...s.child.data,id:'4.2'}}),
 'group not direct':s=>{s.f.root.childNodes.pop();s.f.group.childNodes.push(s.group);},
 'wrong record':s=>s.child.internalId=99,
 'newer JS child':s=>s.f.root.childNodes.push({internalId:9,data:{id:'9.1',ModelNode:s.x.js.data},childNodes:[]}),
 'pending reader':s=>s.f.env.__loginomJavascriptNativeRoundtripReadV1={document:s.f.env.document,active:{pending:1}},
 'lost input release':s=>s.f.env.__loginomJavascriptNativeInputReadV1.last.releasedResponses=0,
 'completed group':s=>s.group.data.Status=3,
 'cancelled child':s=>s.child.data.ProgressBarCls='bg-progress-ptpsExplicitCanceled',
 'ambiguous progress':s=>s.child.data.ProgressBarCls+=' bg-progress-ptpsCompleted',
 'cancellable child':s=>s.child.data.CanCancelProcess=true,
 'unloaded group':s=>s.group.data.loaded=false,
 'empty native error':s=>s.child.data.ErrorDetails='',
 'truncated error':s=>{s.child.data.ErrorDetails='x'.repeat(1001);s.execution.error.message='x'.repeat(1000);},
 'different native error':s=>s.child.data.ErrorDetails='different',
 'oversized raw whitespace':s=>s.child.data.ErrorDetails=' '.repeat(1001)+s.execution.error.message,
 'wrong source':s=>s.execution.trial.source_sha256='0'.repeat(64),
 'stale group':s=>s.execution.fresh_baseline.roots.push({process_id:'4'}),
 'wrong launch':s=>s.execution.launch_identity.group_record_id='99',
 'missing Show Node proof':s=>delete s.execution.ownership_source,
 'running JS':s=>s.x.js.FRunning=true,
 'input reexecuted':s=>s.f.root.childNodes.push({internalId:9,data:{id:'9',ModelNode:s.f.node.data},childNodes:[]}),
 'changed graph':s=>s.x.f.model.FDiagram.FLinks.FCollection[0].FTargetPort={},
 'changed sealed source':s=>s.f.env.__loginomJavascriptNativeRoundtripV1.source+=' ',
};
for(const [name,mutate]of Object.entries(sealFaults))test('failed witness refuses '+name+' before upstream',async()=>{
 const s=await fixture();mutate(s);await assert.rejects(async()=>s.seal());assert.equal(s.f.counters.sent,1);
});
const heldFaults={
 'child data replacement':s=>s.child.data={...s.child.data},
 'group data replacement':s=>s.group.data={...s.group.data},
 'child error':s=>s.child.data.ErrorDetails+=' changed',
 'child state':s=>s.child.data.ProgressBarCls='bg-progress-ptpsProcessing',
 'history':s=>s.f.root.childNodes.push({internalId:10,data:{id:'10',Status:3,ErrorDetails:''},childNodes:[]}),
 'edge':s=>s.f.model.FDiagram.FLinks.FCollection[0].FGuid='changed',
 'upstream cache':s=>s.f.helper.$FData={},
 'upstream subscription':s=>s.f.helper.$FDataChangeCookie.$.$O++,
 'source':s=>s.f.env.__loginomJavascriptNativeRoundtripV1.source_sha256='0'.repeat(64),
 'failed capability':s=>s.f.env.__loginomJavascriptCoercionFailureV1={...s.f.env.__loginomJavascriptCoercionFailureV1},
};
for(const [name,mutate]of Object.entries(heldFaults))test('held failed witness refuses '+name+' during native response and releases both buffers',async()=>{
 let s; s=await fixture(undefined,{reply:()=>{if(s)mutate(s);}});const failed=await s.seal();
 await assert.rejects(()=>s.read(failed));assert.deepEqual(s.f.counters,{sent:2,requests:2,responses:2});
 const status=await javascriptNativeRoundtripStatus(s.f.page);assert.equal(status.retired,true);assert.equal(status.published,false);
});
for(const name of ['output','missing-witness','changed-witness'])test('failed binding refuses '+name+' before requests',async()=>{
 const s=await fixture(),failed=await s.seal();s.f.model.FPreviewManager.FPreviewVisible=true;
 const args={...s.f.b,binding_id:'bad',roundtrip_role:name==='output'?'output':'upstream',source_sha256:s.spec.source_sha256,failed_terminal:clone(failed)};
 if(name==='missing-witness')delete args.failed_terminal;
 if(name==='changed-witness')args.failed_terminal.source_sha256='0'.repeat(64);
 await assert.rejects(()=>s.f.execute(javascriptNativeRoundtripCode(args)));assert.equal(s.f.counters.sent,1);
});
for(const message of ['Error: conversion failed','SyntaxError: bad token\n at module (<main>:9:1)',
 'TypeError: import failed\n at module (builtIn/Data:9:1)','Error: JS_INT_COERCION_CANDIDATE\n at module (<main>:6:1)',
 'TypeError: runtime failed without position',runtimeError])test('owned failure remains incomplete without observed source mapping: '+message.split('\n')[0],async()=>{
 const s=await fixture(undefined,{message}),failed=await s.seal(),upstream=await s.read(failed);
 assert.equal(verifyCoercionFailureOutcome({before:s.before,failed,upstream,output:{status:'not_read_failed_execution'}},s.id).rejection_attributed,false);
});

for(const id of javascriptCoercionIds)for(const mode of ['ok','seal-ack','native-ack','final-ack','upstream-changed','after-ack-drift','after-ack-pending'])test(id+' production failed driver/native read/ACK '+mode,async()=>{
 const s=await fixture(id,{reply:(f,r)=>{if(mode==='upstream-changed'&&f.counters.sent>1)r.$FData[safeOffset(id)]^=1;}});
 const records=[],actions=[],states=[];
 const state={prepared_node_context:{...s.input.node,verified:true,surface:'graph'},wizard:{status:'absent'},
  node_outputs:{verified:true,ports:[{index:0,active:true,tid:'input-output',port_guid:'p'}]},
  ui:{elements:[{tid:'input-output',ref:'input-output',allowed_actions:['click','press']},{tid:'preview;p.h;close',ref:'close',allowed_actions:['click']}]},
  node_preview_schema:{verified:true,port_guid:'p',port:0,root_tid:'preview',fields:[{name:'Value',label:'Value',type:s.spec.type}]}};
 const readUpstream=args=>readNativeRoundtrip(args,{
  verifyFrontends:async()=>[],verifyCountLoaders:()=>({fixture:'count-loader-source'}),
  openPreview:async()=>assert.fail('JS OUTPUT must never open'),
  createProcedure:()=>({observe:async({ready})=>{assert.equal(ready(state),true);return state;},perform:async({ready,resolve,identity})=>{
   assert.equal(ready(state),true);assert.ok(identity());const action=resolve(state);actions.push(action);
   if(action.key==='F3')s.f.model.FPreviewManager.FPreviewVisible=true;
   if(action.ref==='close')s.f.model.FPreviewManager.FPreviewVisible=false;
  }})
 });
 const run=()=>readNativeCoercionFailure({page:s.f.page,input:s.input,node:s.node,execution:s.execution,fixtureId:id,
  workflow:{workflow_id:'w',tab_tid:'tab',prefix:'TF'},deadline:s.f.b.deadline,targetOrigin:'http://test',targetBuild:'7.4.2',validateSource:()=>{},
  options:{execute:s.f.execute,now:Date.now,exclusiveNodeOperation:()=>true,receiptOptions:()=>({}),onRecord:async event=>{
   records.push(clone(event));const saved=clone(event);
   if(mode==='seal-ack'&&saved.failed)saved.failed.error_details='changed';
   if(mode==='native-ack'&&saved.proof)saved.proof.lifecycle.releasedResponses=0;
   if(mode==='final-ack'&&saved.results)saved.results.outcome.rejection_attributed=true;
   if(mode==='after-ack-drift'&&saved.results)s.child.data.ErrorDetails+=' changed';
   if(mode==='after-ack-pending'&&saved.results)s.f.env.__loginomJavascriptNativeRoundtripReadV1.active={pending:1};
   return saved;
  }},onState:async(state,uncertain)=>states.push({state,uncertain})},{readUpstream});
 if(mode==='ok'){
  const results=await run();assert.equal(results.outcome.case_complete,false);assert.equal(results.outcome.upstream_exact,true);
  assert.ok(Object.isFrozen(results.before));assert.ok(Object.isFrozen(results.failed.execution));assert.ok(Object.isFrozen(results.upstream.raw.cells[0]));
  assert.deepEqual(actions.map(a=>a.ref),['input-output','input-output','close']);
  assert.equal(states.at(-1).uncertain,false);
  assert.throws(()=>{results.upstream.raw.cells[0].payload[2]=55;});
  assert.equal(records.at(-1).phase,'native_coercion_failed_upstream_verified');
 }else await assert.rejects(run);
 assert.equal(s.f.counters.sent,mode==='seal-ack'?1:2);
 assert.equal(s.f.env.__loginomJavascriptNativeRoundtripV1.bindings.has('output'),false);
 if(mode==='upstream-changed')assert.equal(records.some(e=>e.phase==='native_coercion_failed_upstream_verified'),false);
});
function safeOffset(id){return javascriptCoercionCase(id).type==='string'?28:14;}

for(const [name,mutate]of Object.entries({
 'wrong source':e=>e.trial.source_sha256='0'.repeat(64),
 'wrong node':e=>e.node.node_id='other',
 'generic notification':e=>e.error_source='notification',
 'cancelled':e=>e.status='cancelled',
 'unverified owner':e=>e.owner_verified=false,
 'cleanup incomplete':e=>e.cleanup_complete=false,
 'wrong launch':e=>e.launch_identity.group_id='6',
 'stale baseline':e=>e.fresh_baseline.roots.push({process_id:'4'}),
}))test('host failed execution refuses '+name,async()=>{
 const s=await fixture(),execution=clone(s.execution);mutate(execution);
 assert.throws(()=>verifyCoercionFailedExecution(execution,s.node,s.id));
});
for(const [name,mutate]of Object.entries({
 'OUTPUT evidence':r=>r.output.raw={},
 'case':r=>r.failed.fixture_id=javascriptCoercionIds[1],
 'source':r=>r.failed.source+=' ',
 'native error':r=>r.failed.error_details='different',
 'upstream witness':r=>r.upstream.binding.failed_terminal.execution.process_record_id='different',
 'upstream release':r=>r.upstream.lifecycle.releasedResponses=0,
 'upstream owner':r=>{r.upstream.binding.node_id=r.upstream.raw.node_id='foreign';},
 'upstream child':r=>r.upstream.binding.completed_child.process_id='2.2',
 'frozen input bytes':r=>r.before.raw.cells[0].payload[2]^=1,
 'stored upstream bytes':r=>r.upstream.exact.cells[0].native.bytes_le='0000000000000000',
}))test('final failed outcome refuses '+name,async()=>{
 const s=await fixture(),failed=await s.seal(),upstream=await s.read(failed);
 const results=clone({before:s.before,failed,upstream,output:{status:'not_read_failed_execution'}});mutate(results);
 assert.throws(()=>verifyCoercionFailureOutcome(results,s.id));
});

test('failed terminal seal cannot be replayed or promoted to completed',async()=>{
 const s=await fixture();await s.seal();
 await assert.rejects(async()=>s.seal(),/one fixed-source/);
 assert.throws(()=>{s.f.env.__loginomJavascriptNativeRoundtripV1.stage='completed';});
 assert.equal(s.f.counters.sent,1);
});
