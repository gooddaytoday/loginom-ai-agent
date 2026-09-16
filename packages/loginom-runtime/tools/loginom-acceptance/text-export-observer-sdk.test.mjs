import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {offlineProof} from './text-export-observer-offline.mjs';
import {syntheticBinding} from './text-export-observer-fixture.mjs';
import {bindObserver} from './text-export-observer-binding.mjs';
import {checkStep,NATIVE_SMOKE_ADMITTED} from './text-export-observer-policy.mjs';
async function run(t,options){const root=await mkdtemp(join(tmpdir(),'node17-sdk-unit-'));t.after(()=>rm(root,{recursive:true,force:true}));return offlineProof(root,options);}
test('real SDK in-memory wrapper passes exact request once after synthetic native chain',async t=>{const r=await run(t);assert.equal(r.error,null);assert.equal(r.dispatched,1);assert.equal(r.calls,14);assert.equal(NATIVE_SMOKE_ADMITTED,false);});
test('unregistered foreign invocation poisons observer even when swallowed',async t=>{const r=await run(t,{illegalCallAt:3});assert.equal(r.illegalBlocked,true);assert.equal(r.dispatched,0);assert.equal(r.hook.violated,true);});
test('foreign owner, navigation, source, hidden scroll, duplicate download and cleanup negatives',async t=>{
 const variants=[
  [0,r=>({...r,document_id:'foreign'})],
  [0,r=>({...r,links:[]})],
  [2,r=>{r.output.ui.elements[0].tid='MF;Configure';return r;}],
  [5,r=>{r.output.file_storage.directory='/other';return r;}],
  [7,r=>{r.output.ui.elements[0].interaction.state='outside_viewport';return r;}],
  [8,r=>({...r,observer_download_count:2})],
  [8,r=>({...r,cleanup_complete:false})],
  [13,r=>{r.nodes[0].ref.node_id='other';return r;}]
 ];
 for(const [index,modify] of variants){const r=await run(t,{changeResponse:(r,i)=>i===index?modify(r):r});assert.equal(r.dispatched,0);assert.ok(r.error);}
});
test('binding refuses stale source, foreign run and unterminated operation anchors',()=>{
 const f=syntheticBinding();for(const change of [x=>{x.run.run_id='old'},x=>{x.session.sessionId='foreign'},x=>{const e=x.journal.trim().split('\n');x.journal=[e[0],...e.slice(2),e[1]].join('\n')},x=>{x.journal+=JSON.stringify({session_id:'session',runtime_revision:'a'.repeat(64),phase:'node_apply_prepared',operation_id:'pending'})+'\n'}]){
  const x=structuredClone(f);change(x);assert.throws(()=>bindObserver({...x,overallDeadline:performance.now()+60000}));
 }
});
test('unknown gestures never enter the native builder allowlist',()=>{const f=syntheticBinding(),c=bindObserver({...f,overallDeadline:performance.now()+60000});for(const kind of ['Configure','Finish','Execute','save','upload','reload','press','evaluate','scroll'])assert.throws(()=>checkStep({kind},c));});

test('lower-level SDK request cannot bypass the observer allowlist',async t=>{const r=await run(t,{illegalCallAt:3,illegalDirect:true});assert.equal(r.illegalBlocked,true);assert.equal(r.dispatched,0);assert.equal(r.hook.violated,true);});

test('issued compact workflow ref stays unchanged on the wire and binds full journal identity',async t=>{const r=await run(t,{compactWorkflow:true});assert.equal(r.error,null);assert.equal(r.dispatched,1);});

// MCP JSON field order is not part of document/workflow/node identity.
test('binding accepts reordered JSON keys but refuses changed or extra identity fields',()=>{
 const f=syntheticBinding();
 const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reorder(v)])):value;
 const original=bindObserver({...f,overallDeadline:1000});
 const ordered={...f,request:reorder(f.request)};
 assert.deepEqual(bindObserver({...ordered,overallDeadline:1000}),original);
 const journal=f.journal.trim().split('\n').map(JSON.parse).map(reorder).map(JSON.stringify).join('\n')+'\n';
 assert.deepEqual(bindObserver({...ordered,journal,overallDeadline:1000}).identity,original.identity);
 for(const key of ['document_id','workflow_id','node_id','extra']){
  const changed=structuredClone(ordered);changed.request.params.arguments.target.ref[key]='foreign';
  assert.throws(()=>bindObserver({...changed,overallDeadline:1000}));
 }
});

const refusedReturn=()=>({status:'NOT_APPLIED',phase:'preconditions',error:{code:'UI_EPOCH_CHANGED'},effect_possible:false,cleanup_complete:true,trace:[{event:'ui_observation_started'},{event:'ui_action_failed'}]});
const withReturnRefusals=(responses,count,change=()=>{})=>{
 const prefix=responses.slice(0,11),tail=responses.slice(11),extra=[];
 for(let i=0;i<count;i++){
  const refusal=refusedReturn();change(refusal,i);extra.push(refusal,structuredClone(responses[9]),structuredClone(responses[10]));
 }
 return [...prefix,...extra,...tail];
};
test('return refresh after one or two proven refusals downloads and dispatches exactly once',async t=>{
 for(const count of [1,2]){
  const r=await run(t,{transformResponses:xs=>withReturnRefusals(xs,count)});
  assert.equal(r.error,null);assert.equal(r.dispatched,1);assert.equal(r.calls,14+3*count);
 }
});
test('return cannot refresh unsafe receipts or more than twice',async t=>{
 for(const change of [r=>r.effect_possible=true,r=>r.cleanup_complete=false,r=>r.error.code='UI_CONTEXT_CHANGED',r=>delete r.trace,r=>r.trace.push({event:'ui_gesture_applied'}),r=>r.trace.push({event:'ui_preconditions_verified'})]){
  const r=await run(t,{transformResponses:xs=>withReturnRefusals(xs,1,change)});assert.ok(r.error);assert.equal(r.dispatched,0);assert.equal(r.calls,12);
 }
 const r=await run(t,{transformResponses:xs=>withReturnRefusals(xs,3)});assert.ok(r.error);assert.equal(r.dispatched,0);assert.equal(r.calls,18);
});
test('fresh return refuses changed package or tab before a second gesture',async t=>{
 for(const field of ['package_identity','active_identity']){
  const r=await run(t,{transformResponses:xs=>{const q=withReturnRefusals(xs,1);q[13].output[field]='foreign';return q;}});
  assert.ok(r.error);assert.equal(r.dispatched,0);assert.equal(r.calls,14);
 }
});
function withFileReveal(xs){
 for(const i of [6,7]){const s=xs[i].output;s.active_tab_ref='ui-storage';s.package_identity=null;const e=s.ui.elements[0];e.interaction.state='outside_viewport';e.scroll={ref:'ui-file-scroll',top:0,max_top:2075};}
 const s=xs[7].output,e=s.ui.elements[0];
 xs[8].trace=[{event:'download_file_revealed',applied:true,file_ref:e.ref,owner_ref:e.scroll.ref,from:0,to:400,max_top:2075,delta:400,document:s.dom_epoch.document},
  {event:'download_reveal_confirmed',file_ref:e.ref,owner_ref:e.scroll.ref,max_top_before:2075,max_top_after:2075,document:s.dom_epoch.document,interaction:'point_observed',file_tid:e.tid,origin:s.origin,loginom_build:s.loginom_build,workflow_ref:s.workflow_ref,active_tab_ref:s.active_tab_ref,package_identity:s.package_identity,directory:s.file_storage.directory},
  {event:'download_gesture_result',status:'SUCCEEDED',effect_possible:true,cleanup_complete:true,error_code:null}];return xs;
}
test('explicit exact-file reveal admits one bounded native owner scroll',async t=>{
 const r=await run(t,{transformResponses:withFileReveal});assert.equal(r.error,null);assert.equal(r.dispatched,1);assert.equal(r.calls,14);
});
test('native file reveal refuses missing proof, foreign owner and excessive motion',async t=>{
 for(const change of [r=>delete r.trace,r=>r.trace[0].delta=1001,r=>r.trace[0].owner_ref='foreign',r=>r.trace[1].document='foreign',r=>r.trace[1].max_top_after=9999,r=>r.trace.push(r.trace[0]),r=>r.trace[2].cleanup_complete=false]){
  const r=await run(t,{transformResponses:withFileReveal,changeResponse:(r,i)=>{if(i===8)change(r);return r;}});assert.ok(r.error);assert.equal(r.dispatched,0);
 }
});
