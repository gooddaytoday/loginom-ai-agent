import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionRuntime} from '../lib/executor.mjs';
const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const request={document_id:'doc',workflow_ref:workflow,target:{kind:'new',type:'imports.text',label:'Source',position:{x:320,y:280}},inputs:[]};
function fixture(){
 const calls=[],events=[];const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[],links:[],foreign_links:[]};
 const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:(n,p)=>JSON.stringify(n.position)===JSON.stringify(p),reconcile:async()=>({verified:true,cleanup_complete:true}),mutate:async e=>{calls.push(e.kind);if(e.kind==='create')graph.nodes.push({ref:{document_id:'doc',workflow_id:'wf',node_id:'new'},type:e.parameters.type,label:'Source',position:e.parameters.position,inputs:[],outputs:[0]});return {status:'SUCCEEDED',cleanup_complete:true};}};
 const runtime=createActionRuntime({pinned:{actions:new Map(),selectors:new Map(),pins:{}},execute:async()=>{throw new Error('Unexpected public transport');},onRecord:async e=>{events.push(e);return e;},nodeTargetAdapterFactory:()=>adapter});
 return {runtime,adapter,calls,events,graph};
}
test('internal target shares inspect, operation IDs, preparation gate and replay',async()=>{
 const f=fixture(),r=await f.runtime.runNodeTarget(request,{operationId:'one'});assert.equal(r.status,'SUCCEEDED');assert.equal(r.output.configured,false);
 assert.equal((await f.runtime.inspect({operationId:'one'})).output.state,'resolved');
 await f.runtime.runNodeTarget(request,{operationId:'one'});assert.deepEqual(f.calls,['create']);
 await assert.rejects(f.runtime.runNodeTarget({...request,target:{...request.target,label:'different'}},{operationId:'one'}),/already used/);
 assert.ok(f.events.some(e=>e.phase==='node_target_effect_prepared'));
});
test('inspect reconciles a lost child reply without resuming gestures, original ID resumes',async()=>{
 const f=fixture(),mutate=f.adapter.mutate;let lost=true;f.adapter.mutate=async e=>{const r=await mutate(e);if(lost){lost=false;throw new Error('lost');}return r;};
 assert.equal((await f.runtime.runNodeTarget(request,{operationId:'lost'})).status,'AMBIGUOUS');
 assert.throws(()=>f.runtime.assertPreparationAllowed(),/pending|uncertain/);
 await assert.rejects(f.runtime.runNodeTarget(request,{operationId:'other'}),/pending/);
 const inspected=await f.runtime.inspect({operationId:'lost'});assert.equal(inspected.output.outcome.output.resume_available,true);assert.deepEqual(f.calls,['create']);
 const resumed=await f.runtime.runNodeTarget(request,{operationId:'lost',resume:true});assert.equal(resumed.status,'SUCCEEDED');assert.deepEqual(f.calls,['create']);
});
test('cancellation retains the gate until the browser returns, inspect never duplicates',async()=>{
 const f=fixture(),controller=new AbortController();let release;const mutate=f.adapter.mutate;
 f.adapter.mutate=async e=>{await new Promise(r=>{release=r;});return mutate(e);};
 const running=f.runtime.runNodeTarget(request,{operationId:'cancel',signal:controller.signal});
 for(let i=0;!release&&i<100;i++)await new Promise(r=>setImmediate(r));assert.ok(release);controller.abort();
 await assert.rejects(f.runtime.runNodeTarget(request,{operationId:'other'}),/running/);
 assert.throws(()=>f.runtime.assertPreparationAllowed(),/running/);release();
 assert.equal((await running).status,'AMBIGUOUS');await f.runtime.inspect({operationId:'cancel'});assert.deepEqual(f.calls,['create']);
});
test('a changed graph after read-only recovery cannot authorize resume',async()=>{
 const f=fixture(),mutate=f.adapter.mutate;f.adapter.mutate=async e=>{await mutate(e);throw new Error('lost');};
 await f.runtime.runNodeTarget(request,{operationId:'one'});await f.runtime.inspect({operationId:'one'});
 f.graph.nodes[0].label='Foreign change';await assert.rejects(f.runtime.runNodeTarget(request,{operationId:'one',resume:true}),/changed/);assert.deepEqual(f.calls,['create']);
});
test('replacement of the workflow DOM epoch invalidates a child effect',async()=>{
 const f=fixture();f.graph.dom_epoch=1;const mutate=f.adapter.mutate;f.adapter.mutate=async e=>{const r=await mutate(e);f.graph.dom_epoch=2;return r;};
 assert.equal((await f.runtime.runNodeTarget(request,{operationId:'epoch'})).status,'AMBIGUOUS');
 const result=await f.runtime.inspect({operationId:'epoch'});assert.equal(result.output.state,'pending');assert.deepEqual(f.calls,['create']);
});
test('JSON key order is not part of the target identity or replay signature',async()=>{
 const f=fixture();await f.runtime.runNodeTarget(request,{operationId:'ordered'});
 const reverse=v=>Array.isArray(v)?v.map(reverse):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;
 const result=await f.runtime.runNodeTarget(reverse(request),{operationId:'ordered'});assert.equal(result.status,'SUCCEEDED');assert.deepEqual(f.calls,['create']);
});
