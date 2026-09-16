import test from 'node:test';import assert from 'node:assert/strict';
import {observeResponse} from './text-export-observer-response.mjs';
import {parseBrowserResult,createNativeObserver} from './text-export-observer-native.mjs';
import {createReadObserverGate} from './text-export-read-observer.mjs';
import {syntheticBinding,syntheticNativeResponses} from './text-export-observer-fixture.mjs';
import {bindObserver} from './text-export-observer-binding.mjs';
import {mkdtemp,rm,realpath,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const reply=r=>({content:[{type:'text',text:JSON.stringify(r)}]});
async function exercise(kind){
 const events=[],abort=new AbortController();let now=10;
 const received=kind==='negative'?{status:'NOT_APPLIED',phase:'preconditions',effect_possible:false,cleanup_complete:true,error:{code:'DOWNLOAD_CONTEXT_CHANGED',message:'SECRET'},trace:[{event:'download_context_refused',checks:{epoch:false,storage:true,secret:'SECRET'}}],output:{ui:{secret:'SECRET'}}}:{status:'SUCCEEDED',cleanup_complete:true,effect_possible:true,pending_ui_actions:0};
 const invoke=async()=>{if(kind==='transport')throw Error('SECRET');if(kind==='cancel_throw'){abort.abort();throw Error('SECRET');}if(kind==='cancel_reply')abort.abort();return kind==='parse'?{content:[{type:'text',text:'SECRET malformed'}]}:reply(received);};
 let error;try{await observeResponse({invoke,parse:r=>{assert.equal(events.at(-1).phase,'received');return parseBrowserResult(r);},validate:r=>{assert.equal(events.at(-1).phase,'decoded');assert.equal(r.status,'SUCCEEDED');},guard:()=>{abort.signal.throwIfAborted();assert.ok(now<100);},record:async e=>events.push(e),clock:()=>now++,signal:abort.signal,deadline:100,binding:{seq:1,run_id:'run',session_id:'session',read_id:'read',step_kind:'download'},code:'async page=>null'});}catch(e){error=e;}
 assert.ok(!JSON.stringify(events).includes('SECRET'));assert.ok(events.every(e=>e.request_sha256.length===64&&e.code_sha256.length===64&&e.session_id==='session'&&e.deadline_ms===100));return {events,error};
}
test('received negative is retained before assertions with effects and safe diagnostic checks',async()=>{
 const {events,error}=await exercise('negative');assert.ok(error);assert.deepEqual(events.map(e=>e.phase),['received','decoded','failure']);const n=events[1].native;assert.equal(n.code,'DOWNLOAD_CONTEXT_CHANGED');assert.equal(n.effect_possible,false);assert.equal(n.cleanup_complete,true);assert.equal(n.pending_ui_actions,null);assert.equal(n.context_checks[0].epoch,false);assert.equal(events[2].failure_kind,'validation_failure');assert.equal(events[2].response_received,true);
});
test('malformed received text retains only envelope fingerprint, never invents decoded reply',async()=>{
 const {events,error}=await exercise('parse');assert.ok(error);assert.deepEqual(events.map(e=>e.phase),['received','failure']);assert.equal(events[1].failure_kind,'parse_failure');assert.equal(events[1].native.effect_possible,null);
});
test('transport throw has no received receipt and does not assert absent gesture',async()=>{
 const {events,error}=await exercise('transport');assert.ok(error);assert.equal(events.length,1);assert.equal(events[0].failure_kind,'transport_throw');assert.equal(events[0].response_received,false);assert.equal(events[0].native.cleanup_complete,null);
});
test('cancellation distinguishes no reply from late received reply; neither validates',async()=>{
 for(const kind of ['cancel_throw','cancel_reply']){const {events,error}=await exercise(kind);assert.ok(error);const f=events.at(-1);assert.equal(f.failure_kind,'cancellation');assert.equal(f.response_received,kind==='cancel_reply');assert.equal(f.cancelled,true);assert.ok(!events.some(e=>e.phase==='validated'));}
});
test('success records received then decoded then validated',async()=>{
 const {events,error}=await exercise('success');assert.equal(error,undefined);assert.deepEqual(events.map(e=>e.phase),['received','decoded','validated']);assert.equal(events[1].native.pending_ui_actions,0);
});
test('oversized response and receipt persistence failure refuse parsing or success',async()=>{
 for(const kind of ['large','write']){let parsed=0,validated=0;const events=[];await assert.rejects(observeResponse({invoke:async()=>({content:[{type:'text',text:'s'.repeat(kind==='large'?1048577:1)}]}),parse:()=>{parsed++;return {};},validate:()=>validated++,guard:()=>{},record:async e=>{events.push(e);if(kind==='write'&&e.phase==='received')throw Error('disk');},clock:()=>1,signal:new AbortController().signal,deadline:100,binding:{seq:1},code:'safe'}));assert.equal(parsed,0);assert.equal(validated,0);assert.equal(events.at(-1).phase,'failure');}
});
test('actual gate refuses replace for each incomplete native boundary; success alone dispatches once',async t=>{
 for(const kind of ['negative','parse','transport','cancel','success']){
  const root=await realpath(await mkdtemp(join(tmpdir(),'node17-response-')));t.after(()=>rm(root,{recursive:true,force:true}));
  const f=syntheticBinding(),context=bindObserver({...f,overallDeadline:performance.now()+60000});const queue=syntheticNativeResponses(context),actions=[],responses=[],outer=[];let dispatch=0;
  const native=createNativeObserver({artifactRoot:root,record:async e=>actions.push(e),recordResponse:async e=>responses.push(e),invoke:async({code,signal})=>{
   const r=queue.shift();if(r.observer_download_count){
    if(kind==='negative')return reply({status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true,error:{code:'DOWNLOAD_CONTEXT_CHANGED'}});
    if(kind==='parse')return {content:[{type:'text',text:'invalid'}]};
    if(kind==='transport')throw Error('transport');
    if(kind==='cancel'){await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));}
    const path=JSON.parse(code.match(/"download_path":("[^"\\]*(?:\\.[^"\\]*)*")/)[1]);await writeFile(path,'x\n');
   }return reply(r);
  }});
  const gate=createReadObserverGate({artifactRoot:root,budgetMs:kind==='cancel'?100:60000,append:async e=>outer.push(JSON.parse(e)),observe:native,dispatch:async()=>{dispatch++;return {};}});
  if(kind==='success'){await gate.invoke(f.request,context);assert.equal(dispatch,1);assert.equal(actions.at(-1).phase,'completed');}
  else{await assert.rejects(gate.invoke(f.request,context));await new Promise(r=>setTimeout(r,5));assert.equal(dispatch,0);assert.equal(gate.state().poisoned,true);assert.equal(actions.at(-1).phase,'failure');assert.equal(actions.at(-2).phase,'prepared');assert.equal(actions.at(-1).step.kind,'download');assert.equal(responses.at(-1).phase,'failure');assert.ok(!outer.some(e=>e.kind==='replace_dispatch'));}
 }
});

test('caller cancellation before any prepared step prevents graph browser invocation',async()=>{
 const abort=new AbortController();abort.abort();let calls=0;const responses=[],actions=[];
 const native=createNativeObserver({artifactRoot:'/unused',cancellationSignal:abort.signal,recordResponse:async e=>responses.push(e),record:async e=>actions.push(e),invoke:async()=>{calls++;}});
 const f=syntheticBinding(),context=bindObserver({...f,overallDeadline:performance.now()+1000});
 await assert.rejects(native({context,readId:'read',deadline:performance.now()+1000,downloadPath:'/unused',signal:new AbortController().signal}));assert.equal(calls,0);assert.equal(actions.length,0);
});

test('cancellation after prepared records failure without invoking the browser',async()=>{
 const abort=new AbortController(),actions=[],responses=[];let calls=0;
 const native=createNativeObserver({artifactRoot:'/unused',record:async e=>{actions.push(e);if(e.phase==='prepared')abort.abort();},recordResponse:async e=>responses.push(e),invoke:async()=>calls++});
 const f=syntheticBinding(),context=bindObserver({...f,overallDeadline:performance.now()+1000});
 await assert.rejects(native({context,readId:'read',deadline:performance.now()+1000,downloadPath:'/unused',signal:abort.signal}));
 assert.equal(calls,0);assert.deepEqual(actions.map(e=>e.phase),['prepared','failure']);assert.equal(responses[0].failure_kind,'cancellation');assert.equal(responses[0].invocation_started,false);assert.equal(responses[0].response_received,false);
});
