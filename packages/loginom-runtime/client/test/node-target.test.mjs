import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNodeTarget } from '../lib/node-target.mjs';
import { describeNodeTypes, validateNodeTargetRequest } from '../lib/node-contracts.mjs';
const ref = id => ({ document_id: 'doc', workflow_id: 'wf', node_id: id });
const workflow = { workflow_id: 'wf', tab_tid: 'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1', prefix: 'MF;TF-1', navigation_path: [{tid:'path',label:'Scenario'}] };
const source = { ref: ref('source'), type: 'imports.text', label: 'Source', position: {x:8,y:8}, inputs: [], outputs: [0] };
const request = () => ({ document_id:'doc', workflow_ref:workflow, target:{kind:'new',type:'transform.union_data',label:'Target',position:{x:160,y:160}}, inputs:[{source:ref('source'),output:0,input:0},{source:ref('source'),output:0,input:1},{source:ref('source'),output:0,input:2}] });
function fixture() {
 let graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[structuredClone(source)],links:[]};
 const calls=[],events=[],operation={id:'op',deadline:Date.now()+10000};
 const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:(n,p)=>JSON.stringify(n.position)===JSON.stringify(p),
  reconcile:async()=>({verified:false}),mutate:async(effect)=>{
   calls.push(effect.kind);const p=effect.parameters;
   if(effect.kind==='create')graph.nodes.push({ref:ref('target'),type:p.type,label:'Union',position:p.position,inputs:[0,1],outputs:[0]});
   if(effect.kind==='rename')graph.nodes[1].label=p.label;
   if(effect.kind==='move')graph.nodes[1].position=p.position;
   if(effect.kind==='connect')graph.links.push(p.edge);
   if(effect.kind==='add_input')graph.nodes[1].inputs.push(p.input);
   if(effect.kind==='remove_link')graph.links=graph.links.filter(e=>JSON.stringify(e)!==JSON.stringify(p.edge));
   return {status:'SUCCEEDED',cleanup_complete:true,effect_possible:true};
  }};
 return {adapter,operation,calls,events,get graph(){return graph;},run:(r=request())=>prepareNodeTarget({request:r,operation,adapter,record:async e=>{events.push(e);return e;}})};
}
test('graph phase creates, renames and connects three inputs under one operation; replay is read-only',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);assert.equal(r.configured,false);assert.equal(f.graph.links.length,3);
 assert.deepEqual(f.calls,['create','rename','connect','connect','add_input','connect']);const again=await f.run();assert.equal(again.replayed,true);assert.equal(f.calls.length,6);
 assert.equal(f.events.filter(e=>e.phase==='node_target_effect_prepared').length,6);
});
test('invalid source output is rejected before creation',async()=>{
 const f=fixture(),r=request();r.inputs[0].output=4;assert.equal((await f.run(r)).status,'NOT_APPLIED');assert.equal(f.calls.length,0);
});
test('lost response after drop retains pending and never creates a duplicate',async()=>{
 const f=fixture(),mutate=f.adapter.mutate;f.adapter.mutate=async e=>{await mutate(e);throw new Error('lost response');};
 assert.equal((await f.run()).status,'AMBIGUOUS');assert.equal((await f.run()).status,'AMBIGUOUS');assert.deepEqual(f.calls,['create']);assert.equal(f.graph.nodes.length,2);
});
test('automatic placement is retained across a lost creation reply without selecting or creating twice',async()=>{
 const f=fixture(),r=request();delete r.target.position;let choices=0;
 f.adapter.choosePosition=async()=>{choices++;return {x:320,y:256};};
 const mutate=f.adapter.mutate;let lost=true;
 f.adapter.mutate=async effect=>{const receipt=await mutate(effect);if(effect.kind==='create'&&lost){lost=false;throw Error('lost');}return receipt;};
 assert.equal((await f.run(r)).status,'AMBIGUOUS');
 assert.deepEqual(f.operation.targetPhase.newPosition,{x:320,y:256});
 f.adapter.reconcile=async()=>({verified:true,cleanup_complete:true});
 assert.equal((await f.run(r)).status,'SUCCEEDED');
 assert.equal(choices,1);assert.equal(f.calls.filter(k=>k==='create').length,1);
 assert.equal(r.target.position,undefined);
});
test('no free visible position refuses before creating a node',async()=>{
 const f=fixture(),r=request();delete r.target.position;
 f.adapter.choosePosition=async()=>{throw Error('no free visible position');};
 assert.equal((await f.run(r)).status,'NOT_APPLIED');assert.deepEqual(f.calls,[]);
});
test('unrelated graph mutation cannot be accepted as successful creation',async()=>{
 const f=fixture(),mutate=f.adapter.mutate;f.adapter.mutate=async e=>{const r=await mutate(e);f.graph.nodes[0].label='unexpected';return r;};
 assert.equal((await f.run()).status,'AMBIGUOUS');assert.equal(f.calls.length,1);
});
test('existing identity preserves unrequested properties and correct links without gestures',async()=>{
 const f=fixture();await f.run();const r=request();r.target={kind:'existing',type:'transform.union_data',ref:ref('target')};
 const op={id:'existing',deadline:Date.now()+10000};const result=await prepareNodeTarget({request:r,operation:op,adapter:f.adapter,record:async e=>e});
 assert.equal(result.status,'SUCCEEDED',result.error);assert.equal(f.calls.length,6);
});
test('duplicate labels never resolve an existing target by label',async()=>{
 const f=fixture();f.graph.nodes.push({...structuredClone(source),ref:ref('different')});
 const r=request();r.target={kind:'existing',type:'imports.text',ref:ref('absent')};r.inputs=[];
 assert.equal((await f.run(r)).status,'NOT_APPLIED');assert.equal(f.calls.length,0);
});
test('journal failure before effect prevents gesture',async()=>{
 const f=fixture();const result=await prepareNodeTarget({request:request(),operation:f.operation,adapter:f.adapter,record:async()=>{throw new Error('disk');}});
 assert.equal(result.status,'NOT_APPLIED');assert.equal(f.calls.length,0);
});
test('contract rejects foreign references, dual targets and absent ports',()=>{
 const r=request();r.inputs[0].source.workflow_id='foreign';assert.throws(()=>validateNodeTargetRequest(r),/another workflow/);
 const dual=request();dual.target.ref=ref('x');assert.throws(()=>validateNodeTargetRequest(dual));
 const missing=request();missing.target.type='transform.calculator';assert.throws(()=>validateNodeTargetRequest(missing),/does not exist/);
});
test('selected cards distinguish semantics, support and all cache pins',()=>{
 const types=['transform.join_data','transform.union_data'];const a=describeNodeTypes(types,{runtime:'1',skill:'a'});const b=describeNodeTypes(types,{runtime:'1',skill:'b'});
 assert.match(a[0].semantics,/keys/);assert.match(a[1].semantics,/duplicates/);assert.notEqual(a[0].cache_key,b[0].cache_key);assert.equal(a[0].full_node_apply_available,false);
 assert.throws(()=>describeNodeTypes(['transform.col_union_data']));assert.throws(()=>describeNodeTypes([types[0],types[0]]));
});
test('lost-reply recovery requires both a completed receipt and the exact graph delta',async()=>{
 const f=fixture(),mutate=f.adapter.mutate;let first=true;
 f.adapter.mutate=async e=>{const r=await mutate(e);if(first){first=false;throw new Error('lost');}return r;};
 assert.equal((await f.run()).status,'AMBIGUOUS');f.adapter.reconcile=async()=>({verified:true,cleanup_complete:true});
 const result=await f.run();assert.equal(result.status,'SUCCEEDED',result.error);assert.equal(f.calls.filter(c=>c==='create').length,1);
});
test('a recovered receipt cannot authorize an unrelated graph change',async()=>{
 const f=fixture(),mutate=f.adapter.mutate;f.adapter.mutate=async e=>{await mutate(e);throw new Error('lost');};await f.run();
 f.adapter.reconcile=async()=>({verified:true,cleanup_complete:true});f.graph.nodes[0].label='foreign';assert.equal((await f.run()).status,'AMBIGUOUS');
});
test('strict pre-effect refusal does not claim a created node',async()=>{
 const f=fixture();f.adapter.mutate=async()=>({status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});const r=await f.run();assert.equal(r.status,'NOT_APPLIED');assert.equal(r.partial_effect,false);
});
test('correct automatic link is retained; a wrong owned automatic link alone is removed',async()=>{
 for(const output of [0,1]){
  const f=fixture();f.graph.nodes[0].outputs=[0,1];const mutate=f.adapter.mutate;
  f.adapter.mutate=async e=>{const result=await mutate(e);if(e.kind==='create')f.graph.links.push({source:'source',output,target:'target',input:0});return result;};
  const r=await f.run();assert.equal(r.status,'SUCCEEDED',r.error);
  assert.equal(f.calls.filter(c=>c==='remove_link').length,output===0?0:1);
  assert.equal(f.graph.nodes[0].outputs.length,2);assert.equal(f.graph.links.length,3);
 }
});
test('additional port gaps fail before any creation',async()=>{
 const f=fixture(),r=request();r.inputs=[{source:ref('source'),output:0,input:3}];const result=await f.run(r);
 assert.equal(result.status,'NOT_APPLIED');assert.equal(f.calls.length,0);
});
test('cancellation at the durable pre-gesture boundary does not start a gesture',async()=>{
 const f=fixture(),controller=new AbortController();
 const result=await prepareNodeTarget({request:request(),operation:f.operation,adapter:f.adapter,signal:controller.signal,
  record:async e=>{if(e.phase==='node_target_effect_prepared')controller.abort();return e;}});
 assert.equal(result.status,'NOT_APPLIED');assert.equal(result.pending,null);assert.equal(f.calls.length,0);
});

test('native adapter waits out a transient mask without sending a mutation',async()=>{
 const {createNodeTargetBrowserAdapter}=await import('../lib/node-target-browser.mjs');let reads=0,waits=0;
 const adapter=createNodeTargetBrowserAdapter({origin:'http://example.test',build:'7.4.2',execute:async code=>{
  assert.ok(!code.includes('async function mutateGraph'));
  if(code.includes('waitForFunction')){waits++;return true;}
  if(++reads===1)throw new Error('Graph is blocked');return {complete:true};
 }});
 assert.deepEqual(await adapter.observe(request(),Date.now()+1000),{complete:true});assert.equal(reads,2);assert.equal(waits,1);
});
test('native adapter never retries a foreign-workflow read error',async()=>{
 const {createNodeTargetBrowserAdapter}=await import('../lib/node-target-browser.mjs');let calls=0;
 const adapter=createNodeTargetBrowserAdapter({origin:'http://example.test',build:'7.4.2',execute:async()=>{calls++;throw new Error('Prepared workflow changed');}});
 await assert.rejects(adapter.observe(request(),Date.now()+1000),/workflow changed/);assert.equal(calls,1);
});
test('native adapter rechecks full graph after pending port paint and bounds persistent failures',async()=>{
 const {createNodeTargetBrowserAdapter}=await import('../lib/node-target-browser.mjs');
 for(const persistent of [false,true]){
  let reads=0,paints=0;
  const adapter=createNodeTargetBrowserAdapter({origin:'http://example.test',build:'7.4.2',execute:async code=>{
   assert.ok(!code.includes('async function mutateGraph'));
   if(code.includes('requestAnimationFrame')){paints++;return true;}
   reads++;if(persistent||reads===1)throw Error('Visible port identity is not rendered');
   return {complete:true,nodes:['unchanged'],links:['unchanged']};
  }});
  if(persistent){await assert.rejects(adapter.observe(request(),Date.now()+1000),/Visible port/);assert.equal(reads,3);assert.equal(paints,2);}
  else{assert.deepEqual(await adapter.observe(request(),Date.now()+1000),{complete:true,nodes:['unchanged'],links:['unchanged']});assert.equal(reads,2);assert.equal(paints,1);}
 }
});
test('Union lost Input_Add or connection reply cannot create a duplicate on retry',async()=>{
 for(const kind of ['add_input','connect']){
  const f=fixture(),mutate=f.adapter.mutate;let lost=false;
  f.adapter.mutate=async e=>{const r=await mutate(e);if(e.kind===kind&&!lost){lost=true;throw Error('lost '+kind);}return r;};
  assert.equal((await f.run()).status,'AMBIGUOUS');const before=[...f.calls];assert.equal((await f.run()).status,'AMBIGUOUS');assert.deepEqual(f.calls,before);
  f.adapter.reconcile=async()=>({verified:true,cleanup_complete:true});assert.equal((await f.run()).status,'SUCCEEDED');
  assert.equal(f.calls.filter(x=>x==='add_input').length,1);assert.equal(f.graph.links.length,3);
 }
});

for(const lost of [false,true])test('pre-dispatch refusal cannot clear '+(lost?'lost post-refusal observation':'changed graph'),async()=>{
 const f=fixture();let refused=false;const observe=f.adapter.observe;
 f.adapter.observe=async()=>{if(refused&&lost)throw Error('observation lost');return observe();};
 f.adapter.mutate=async()=>{refused=true;if(!lost)f.graph.nodes[0].label='changed';return {status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};};
 const r=await f.run();assert.equal(r.status,'AMBIGUOUS');assert.equal(r.cleanup_complete,false);assert.ok(r.pending);
 assert.equal(f.operation.targetPhase.refusals?.length??0,0);
});

test('post-refusal graph evidence must be durably acknowledged before clearing pending',async()=>{
 const f=fixture();f.adapter.mutate=async()=>({status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});
 const result=await prepareNodeTarget({request:request(),operation:f.operation,adapter:f.adapter,record:async e=>e.phase==='node_target_refusal_observed'?{...e,refusal:{}}:e});
 assert.equal(result.status,'AMBIGUOUS');assert.equal(result.cleanup_complete,false);assert.ok(result.pending);
});

test('selection timeout after create and rename retains partial remove pending even with completed cleanup',async()=>{
 const f=fixture(),mutate=f.adapter.mutate;f.graph.nodes[0].outputs=[0,1];
 f.adapter.mutate=async e=>{
  if(e.kind==='remove_link'){f.calls.push(e.kind);return {status:'AMBIGUOUS',effect_possible:true,cleanup_complete:true,error:'selection timeout'};}
  const result=await mutate(e);if(e.kind==='create')f.graph.links.push({source:'source',output:1,target:'target',input:0});return result;
 };
 const first=await f.run();assert.equal(first.status,'AMBIGUOUS');assert.equal(first.partial_effect,true);
 assert.equal(f.operation.targetPhase.pending.kind,'remove_link');assert.deepEqual(f.calls,['create','rename','remove_link']);
 f.adapter.reconcile=async()=>({verified:true,cleanup_complete:true});
 const resumed=await f.run();assert.equal(resumed.status,'AMBIGUOUS');assert.equal(resumed.partial_effect,true);
 assert.equal(f.operation.targetPhase.pending.kind,'remove_link');assert.deepEqual(f.calls,['create','rename','remove_link']);
 assert.equal(f.graph.links.length,1);assert.equal(f.graph.nodes[1].label,'Target');
});


test('all node connections wait through a transient graph mask and still reject graph drift before linking',async()=>{
 const {createNodeTargetBrowserAdapter}=await import('../lib/node-target-browser.mjs');let reads=0,waits=0;
 const before={complete:true,marker:'before'},after={complete:true,marker:'changed'};
 const adapter=createNodeTargetBrowserAdapter({origin:'http://example.test',build:'7.4.2',pinned:{},execute:async code=>{
  if(code.includes('waitForFunction')){waits++;return true;}
  assert.ok(code.includes('async function readGraph'));reads++;if(reads===2)throw Error('Graph is blocked');return reads===1?before:after;
 }});
 const r={target:{type:'transform.group_data'}};await adapter.observe(r,Date.now()+1000);
 const result=await adapter.mutate({id:'link',kind:'connect',before,parameters:{edge:{}}},Date.now()+1000);
 assert.equal(result.status,'NOT_APPLIED');assert.equal(result.effect_possible,false);assert.equal(reads,3);assert.equal(waits,1);
});

for(const fault of ['none','late_dom','changed_graph','possible_effect','cleanup_missing'])test('confirmed native connect refusal: '+fault,async()=>{
 const f=fixture(),mutate=f.adapter.mutate;let refused=false;
 f.adapter.mutate=async effect=>{
  if(effect.kind==='connect'&&!refused){refused=true;
   if(fault==='late_dom')f.graph.nodes[0].dom_epoch++;
   if(fault==='changed_graph')f.graph.nodes[0].label='changed';
   return {action_key:'link.create',operation_id:effect.id,status:'FAILED',phase:'preconditions',effect_possible:fault==='possible_effect',cleanup_complete:fault!=='cleanup_missing',error:{code:'CAPABILITY_ERROR',message:'not dispatched'}};
  }
  return mutate(effect);
 };
 const result=await f.run();
 if(['none','late_dom'].includes(fault)){assert.equal(result.status,'SUCCEEDED',result.error);assert.equal(f.graph.links.length,3);assert.equal(f.calls.filter(k=>k==='create').length,1);assert.equal(f.operation.targetPhase.refusals.length,1);assert.equal(f.operation.targetPhase.refusals[0].receipt.native_status,'FAILED');}
 else{assert.equal(result.status,'AMBIGUOUS');assert.ok(f.operation.targetPhase.pending);assert.equal(f.graph.links.length,0);}
});

for(const fault of ['none','incomplete_receipt','changed_graph','wrong_id'])test('lost refused connect response recovery: '+fault,async()=>{
 const f=fixture(),mutate=f.adapter.mutate;let lost=false,receipt;
 f.adapter.mutate=async effect=>{
  if(effect.kind==='connect'&&!lost){lost=true;receipt={action_key:'link.create',operation_id:effect.id,status:'FAILED',phase:'preconditions',effect_possible:false,cleanup_complete:true,error:{code:'CAPABILITY_ERROR',message:'not dispatched'}};throw Error('lost response');}
  return mutate(effect);
 };
 assert.equal((await f.run()).status,'AMBIGUOUS');
 f.adapter.reconcile=async()=>({completed:fault!=='incomplete_receipt',verified:false,cleanup_complete:true,receipt:{...receipt,...(fault==='wrong_id'?{operation_id:'foreign'}:{})}});
 if(fault==='changed_graph')f.graph.nodes[0].label='changed';
 const result=await f.run();
 if(fault==='none'){assert.equal(result.status,'SUCCEEDED',result.error);assert.equal(f.calls.filter(k=>k==='create').length,1);assert.equal(f.graph.links.length,3);assert.equal(f.operation.targetPhase.refusals.length,1);}
 else{assert.equal(result.status,'AMBIGUOUS');assert.ok(f.operation.targetPhase.pending);assert.equal(f.graph.links.length,0);}
});

for(const complete of [true,false])test('read-only inspection resolves only confirmed precondition refusal '+complete,async()=>{
 const {inspectNodeTarget}=await import('../lib/node-target.mjs');
 const f=fixture(),mutate=f.adapter.mutate;let receipt;
 f.adapter.mutate=async effect=>{if(effect.kind==='connect'&&!receipt){receipt={action_key:'link.create',operation_id:effect.id,status:'FAILED',phase:'preconditions',effect_possible:false,cleanup_complete:true,error:{code:'CAPABILITY_ERROR'}};throw Error('lost reply');}return mutate(effect);};
 await f.run();f.adapter.reconcile=async()=>({completed:complete,verified:false,cleanup_complete:true,receipt});
 const count=f.calls.length;const result=await inspectNodeTarget({request:f.request,operation:f.operation,adapter:f.adapter,record:async e=>e,deadline:Date.now()+1000});
 assert.equal(f.calls.length,count);assert.equal(result.resume_available===true,complete);
 assert.equal(!!f.operation.targetPhase.pending,!complete);
 if(complete){assert.equal((await f.run()).status,'SUCCEEDED');assert.equal(f.calls.filter(x=>x==='create').length,1);}
});
