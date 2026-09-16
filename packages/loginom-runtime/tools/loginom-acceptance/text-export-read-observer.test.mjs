import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,realpath} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,relative} from 'node:path';import {createHash} from 'node:crypto';
import {createReadObserverGate} from './text-export-read-observer.mjs';
const digest=x=>createHash('sha256').update(x).digest('hex');
import {syntheticBinding,syntheticNativeResponses} from './text-export-observer-fixture.mjs';
import {bindObserver} from './text-export-observer-binding.mjs';
import {createNativeObserver} from './text-export-observer-native.mjs';
async function fixture(t,change={},options={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'node17-observer-test-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const f=syntheticBinding(),context=bindObserver({...f,overallDeadline:performance.now()+3600000}),request=f.request,lines=[],calls=[];
 const queue=syntheticNativeResponses(context),actions=[];
 const native=createNativeObserver({artifactRoot:root,record:async e=>actions.push(e),invoke:async({code})=>{
  const response=queue.shift();if(response.observer_download_count){const path=JSON.parse(code.match(/"download_path":("[^"\\]*(?:\\.[^"\\]*)*")/)[1]);await writeFile(path,'x\n');}
  return {content:[{type:'text',text:JSON.stringify(response)}]};
 }});
 const observe=async opts=>({...await native(opts),...change});
 const gate=createReadObserverGate({artifactRoot:root,append:async s=>lines.push(s),observe,dispatch:async r=>{calls.push(structuredClone(r));return {actual_reply:true};},...options});
 return {root,context,request,gate,lines,calls,observe,actions};
}
test('unit-only successful observation dispatches exact request once with causal chain',async t=>{
 const f=await fixture(t);const original=structuredClone(f.request);assert.deepEqual(await f.gate.invoke(f.request,f.context),{actual_reply:true});assert.deepEqual(f.calls,[original]);assert.deepEqual(f.lines.map(s=>JSON.parse(s).kind),['reject_bound','read_started','read_completed','replace_dispatch']);await assert.rejects(f.gate.invoke(f.request,f.context));assert.equal(f.calls.length,1);
});
test('missing cleanup, changed state, bytes, identity or event chain never dispatch',async t=>{
 for(const change of [{cleanup_complete:false},{sha256:'0'.repeat(64)},{download_count:2},{listener_before_gesture:false},{workflow_returned:false},{raw:[]},{after:{complete:false}}]){
  const f=await fixture(t,change);await assert.rejects(f.gate.invoke(f.request,f.context),/NOT_DISPATCHED/);assert.equal(f.calls.length,0);assert.equal(f.gate.state().poisoned,true);
 }
});
test('real bytes are checked independently of claimed hash and passed flag',async t=>{
 const f=await fixture(t,{}, {observe:async({readId,downloadPath})=>{await writeFile(downloadPath,'y\n');return {passed:true,read_id:readId};}});await assert.rejects(f.gate.invoke(f.request,f.context),/NOT_DISPATCHED/);assert.equal(f.calls.length,0);
});
test('deadline and late observer completion cannot release replace',async t=>{
 let release;const f=await fixture(t,{}, {budgetMs:10,observe:()=>new Promise(r=>release=r)});await assert.rejects(f.gate.invoke(f.request,f.context),/NOT_DISPATCHED/);release({passed:true});await new Promise(r=>setTimeout(r,5));assert.equal(f.calls.length,0);await assert.rejects(f.gate.invoke(f.request),/BLOCKED/);
});
test('concurrent calls are blocked throughout read interval',async t=>{
 let release,started;const ready=new Promise(r=>started=r);const f=await fixture(t,{}, {observe:async()=>{started();return new Promise(r=>release=r);}});const pending=f.gate.invoke(f.request,f.context);await ready;await assert.rejects(f.gate.invoke({params:{name:'dock_action_run'}}),/BLOCKED/);release({});await assert.rejects(pending);assert.equal(f.calls.length,0);
});
test('default core remains closed without an explicitly wired observer',async t=>{
 const f=await fixture(t,{}, {observe:undefined});await assert.rejects(f.gate.invoke(f.request,f.context),/NOT_DISPATCHED/);assert.equal(f.calls.length,0);
});
test('dispatch transport failure is not described as no dispatch',async t=>{
 const f=await fixture(t,{}, {dispatch:async()=>{throw Error('transport');}});await assert.rejects(f.gate.invoke(f.request,f.context),/DISPATCH_OUTCOME_UNCERTAIN/);
});

test('expired overall run budget cannot dispatch or start an observer',async t=>{
 let observed=0;const f=await fixture(t,{}, {observe:async()=>{observed++;}});f.context.overall_deadline_ms=0;await assert.rejects(f.gate.invoke(f.request,f.context),/NOT_DISPATCHED/);assert.equal(observed,0);assert.equal(f.calls.length,0);
});
