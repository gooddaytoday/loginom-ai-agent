import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {captureFixture} from '../../../scripts/node-acceptance/tests/fixtures/replacement-capture/fixture.mjs';
import {captureReplacement,validateCaptureResult} from '../src/acceptance/replacement-input0-readonly-v1.mjs';
import {retainCaptureOwner,bindCaptureRuntime} from '../src/retained-capture.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const resource={path:'runtime/src/acceptance/replacement-input0-readonly-v1.mjs',sha256:createHash('sha256').update(await readFile(new URL('../src/acceptance/replacement-input0-readonly-v1.mjs',import.meta.url))).digest('hex')};
async function fixture(){
 const cap=await captureFixture(),f={...cap.f,...cap},page=f.page;let reads=0,dirty=false;const directory=await mkdtemp(join(tmpdir(),'replacement-fixed-'));
 const tab=f.main.Items.Workspace.getActiveTab();f.main.Items.Workspace.getActiveTab=()=>tab;
 const conn=f.main.FMapTree.FServerConnection;conn.Connected=true;conn.Session={IsPackageModified:async p=>{assert.equal(p,f.pkg.Package);return dirty;}};
 f.pkg.Package={};f.pkg.ReadOnly=false;f.pkg.HasRunningNodes=()=>false;f.main.FMapTree.PackageNodes={Count:1,Items:()=>f.pkg};
 const evaluate=page.evaluate;page.evaluate=async(...a)=>{reads++;return JSON.parse(JSON.stringify(await evaluate(...a)));};page.isClosed=()=>false;
 const context={pages:()=>[page]},controller=new AbortController(),originalSignal=new AbortController();
 const owner={id:'own-original',page,context,account:conn.UserName,origin:'https://loginom.test',generation:3,chat:'original-chat'};
 const session={directory,metadata:{sessionId:'original-session',clientRevision:'revision'},save:async()=>{throw Error('No save')}};
 const state={startupOwner:owner,captureStartupBinding:Object.freeze({...owner,owner}),session,controller};
 const binding=Object.freeze({harness:'replacement-input0-readonly-v1',owner:'host',run:'original-run',lease:'host:original-run',generation:3,chat:owner.chat,account:owner.account,packagePath:f.packagePath,admission:'own-admission',session:'original-session',expires:Date.now()+60000});
 const retained=retainCaptureOwner(state,binding,Object.freeze({...resource})),bridge={},client={};state.bridge=bridge;state.client=client;bindCaptureRuntime(retained,bridge,client);
 const request={operation_id:'original-node',document_id:f.binding.document_id,workflow_ref:structuredClone(f.binding.workflow_ref),target:{type:'transform.replace_columns'}},opening={value:{opening_operation_id:f.proof.result.input_port.opening_operation_id},receipt_id:f.proof.result.input_port.opening_operation_id};
 const node={request,state:{node:structuredClone(f.binding.node)},opening,signal:originalSignal.signal,deadline:Date.now()+60000,requestSha256:hash(request),openingSha256:hash(opening)};
 const req=hash(request),op=hash(opening),nd=hash(node.state.node),deadline=node.deadline;
 node.assertCurrent=()=>{if(hash(request)!==req||hash(opening)!==op||hash(node.state.node)!==nd||node.deadline!==deadline||Date.now()>=deadline||node.signal.aborted)throw Error('ORIGINAL_NODE_CHANGED');};
 const identity={session_id:binding.session,document_id:request.document_id,tab_tid:request.workflow_ref.tab_tid,account:owner.account,package_path:f.packagePath,loginom_build:'7.4.2'};
 const publication={...identity,owner:binding.owner,run:binding.run,lease:binding.lease,generation:3,chat:binding.chat,admission:binding.admission,resource_path:resource.path,resource_sha256:resource.sha256,origin:owner.origin,runtime_revision:'revision',operation_id:request.operation_id,opening_operation_id:opening.receipt_id,workflow_id:request.workflow_ref.workflow_id,node_id:node.state.node.node_id,deadline:node.deadline,request_sha256:node.requestSha256,opening_sha256:node.openingSha256};
 const runtime={hasActiveWork:()=>false,hasUnsettledWork:()=>false},args={binding,identity,retained,runtime,session,node,publication,signal:controller.signal,deadline:node.deadline};
 return {...f,args,owner,state,node,page,conn,controller,originalSignal,reads:()=>reads,setDirty:v=>dirty=v,cleanup:()=>rm(directory,{recursive:true,force:true})};
}
test('fixed Replacement consumer real native reader/serialized observer, no host authority substituted',async()=>{
 const f=await fixture();try{const r=await captureReplacement(f.args);assert.equal(r.status,'DIAGNOSTIC_READ');assert.equal(validateCaptureResult(r,f.args),true);assert.equal(r.admission_confirmed,false);assert.equal(r.native_capture_admitted,false);assert.equal(r.effect_possible,false);assert.equal(r.settings_applied,false);assert.deepEqual(f.page.events,[]);assert.equal(r.raw.semantic_connections_verified,false);assert.ok(f.reads()>6);
 const bad=structuredClone(r);bad.final_observation.output.prepared_node_context.input_port.port_guid='foreign';assert.throws(()=>validateCaptureResult(bad,f.args));
 }finally{await f.cleanup()}
});
const before={
 wrong_kind:f=>{f.args.binding=Object.freeze({...f.args.binding,harness:'calculator-grouped-before-done-v1'})},
 foreign_owner:f=>{f.owner.id='foreign'},foreign_page:f=>{f.owner.page={}},foreign_context:f=>{f.owner.context={}},foreign_generation:f=>{f.owner.generation++},foreign_chat:f=>{f.owner.chat='foreign'},foreign_session:f=>{f.args.session={}},resource_path:f=>{f.args.retained={...f.args.retained,resource:Object.freeze({...resource,path:'foreign'})}},
 account:f=>{f.args.publication.account='foreign'},lease:f=>{f.args.publication.lease='foreign'},run:f=>{f.args.publication.run='foreign'},admission:f=>{f.args.publication.admission='foreign'},resource_hash:f=>{f.args.publication.resource_sha256='0'.repeat(64)},request:f=>{f.node.request.target.type='imports.text'},node:f=>{f.node.state.node.node_id='foreign'},opening:f=>{f.node.opening.value.opening_operation_id='foreign'},epoch:f=>{f.args.publication.opening_sha256='foreign'},root:f=>{f.args.publication.document_id='foreign'},
 active:f=>{f.args.runtime.hasActiveWork=()=>true},unknown_active:f=>{f.args.runtime.hasActiveWork=()=>undefined},unsettled:f=>{f.args.runtime.hasUnsettledWork=()=>true},unknown_unsettled:f=>{f.args.runtime.hasUnsettledWork=()=>null},cancelled:f=>{f.controller.abort()},original_cancelled:f=>{f.originalSignal.abort()},deadline:f=>{f.args.deadline=Date.now()-1},expired:f=>{f.node.deadline=Date.now()-1}
};
for(const [name,mutate] of Object.entries(before))test('fixed adapter refuses before read '+name,async()=>{const f=await fixture();try{mutate(f);await assert.rejects(captureReplacement(f.args));assert.equal(f.reads(),0);assert.deepEqual(f.page.events,[])}finally{await f.cleanup()}});
for(const scenario of ['dirty','unknown_dirty','running','unknown_running','readonly','unknown_readonly','foreign_inventory','missing_inventory','disconnected','input_guid','input_index','input_opening','native_node','native_account'])test('native fact refusal '+scenario,async()=>{
 const f=await fixture();try{
 if(scenario==='dirty')f.setDirty(true);if(scenario==='unknown_dirty')f.setDirty(undefined);
 if(scenario==='running')f.pkg.HasRunningNodes=()=>true;if(scenario==='unknown_running')f.pkg.HasRunningNodes=()=>undefined;
 if(scenario==='readonly')f.pkg.ReadOnly=true;if(scenario==='unknown_readonly')delete f.pkg.ReadOnly;
 if(scenario==='foreign_inventory')f.main.FMapTree.PackageNodes.Items=()=>({});if(scenario==='missing_inventory')f.main.FMapTree.PackageNodes.Count=0;
 if(scenario==='disconnected')f.conn.Connected=false;
 const receipt=f.prep.inputPortOpenReceipts.values().next().value;
 if(scenario==='input_guid')receipt.portGuid='foreign';if(scenario==='input_index')receipt.nativeIndex=1;if(scenario==='input_opening')receipt.operation_id='foreign';
 if(scenario==='native_node')f.native[5].FGuid='foreign';if(scenario==='native_account')f.conn.UserName='foreign';
 await assert.rejects(captureReplacement(f.args));assert.deepEqual(f.page.events,[]);
 }finally{await f.cleanup()}
});
for(const value of [Error('primary',{cause:false}),undefined,null,false,0,''])test('exact native rejection '+String(value),async()=>{
 const f=await fixture();try{f.conn.Session.IsPackageModified=()=>Promise.reject(value);let caught=false;try{await captureReplacement(f.args)}catch(e){caught=true;assert.equal(e,value)}assert.equal(caught,true);assert.deepEqual(f.page.events,[])}finally{await f.cleanup()}
});
for(const scenario of ['owner','pending','running','deadline','original_signal','native_proxy','native_connection','native_session','opening','input0','dirty'])test('read-await drift '+scenario,async()=>{
 const f=await fixture();try{f.conn.Session.IsPackageModified=async()=>{if(scenario==='owner')f.owner.id='foreign';if(scenario==='pending')f.args.runtime.hasUnsettledWork=()=>true;if(scenario==='running')f.args.runtime.hasActiveWork=()=>true;if(scenario==='deadline')f.node.deadline=0;if(scenario==='original_signal')f.originalSignal.abort();if(scenario==='native_proxy')f.pkg.Package={};if(scenario==='native_connection')f.main.FMapTree.FServerConnection={...f.conn};if(scenario==='native_session')f.conn.Session={...f.conn.Session};if(scenario==='opening')f.prep.inputPortOpenReceipts.values().next().value.operation_id='foreign';if(scenario==='input0')f.port.FIndex=1;if(scenario==='dirty')return true;return false;};await assert.rejects(captureReplacement(f.args));assert.deepEqual(f.page.events,[])}finally{await f.cleanup()}
});
