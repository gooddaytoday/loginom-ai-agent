import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNodeTarget} from '../lib/node-target.mjs';
import {validateNodeTargetRequest} from '../lib/node-contracts.mjs';
import {nodeApiTools} from '../lib/node-api.mjs';
import {createUserWorkflowBindings,userNodeTool} from '../lib/user-workflow.mjs';
import {validateActionParameters} from '../lib/action-catalog.mjs';

const ref=node_id=>({document_id:'doc',workflow_id:'wf',node_id});
const workflow_ref={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'scenario',label:'Scenario'}]};
function fixture(){
 const graph={complete:true,document_id:'doc',workflow_ref,dom_epoch:1,foreign_links:[],nodes:[
  {ref:ref('source'),type:'imports.text',label:'Source',inputs:[],outputs:[0,1]},
  {ref:ref('filter'),type:'transform.filter_data',label:'Filter',inputs:[0],outputs:[0,1]},
  {ref:ref('target'),type:'transform.union_data',label:'Target',inputs:[0,1],outputs:[0]},
 ],links:[{source:'source',output:0,target:'filter',input:0},{source:'source',output:0,target:'target',input:0},
  {source:'source',output:1,target:'target',input:1}]};
 const request={document_id:'doc',workflow_ref,target:{kind:'existing',type:'transform.union_data',ref:ref('target')},
  inputs:[{source:ref('filter'),output:0,input:0,replace_existing:true}]};
 const calls=[],events=[],operation={id:'relink',deadline:Date.now()+10000};
 const adapter={observe:async()=>structuredClone(graph),preflight:async()=>{},positionMatches:()=>true,reconcile:async()=>({verified:false}),
  mutate:async effect=>{
   calls.push(effect.kind);const edge=effect.parameters.edge;
   if(effect.kind==='remove_link')graph.links=graph.links.filter(e=>JSON.stringify(e)!==JSON.stringify(edge));
   if(effect.kind==='connect')graph.links.push(edge);
   return {status:'SUCCEEDED',cleanup_complete:true,effect_possible:true};
  }};
 return {graph,request,calls,events,adapter,operation,run:()=>prepareNodeTarget({request,operation,adapter,record:async e=>{events.push(structuredClone(e));return e;}})};
}
test('explicit named input replacement preserves other links and journals both endpoints',async()=>{
 const f=fixture(),before=structuredClone(f.graph.links),result=await f.run();
 assert.equal(result.status,'SUCCEEDED',result.error);assert.deepEqual(f.calls,['remove_link','connect']);
 assert.deepEqual(f.graph.links,[before[0],before[2],{source:'filter',output:0,target:'target',input:0}]);
 assert.deepEqual(result.replaced_links,[{removed:before[1],created:{source:'filter',output:0,target:'target',input:0}}]);
 const effects=f.events.filter(e=>e.phase==='node_target_effect_prepared').map(e=>e.effect);
 assert.deepEqual(effects.map(e=>e.parameters.edge),[before[1],result.replaced_links[0].created]);
 assert.equal((await f.run()).replayed,true);assert.deepEqual(f.calls,['remove_link','connect']);
});
for(const flag of [undefined,false])test('occupied input refuses without explicit true: '+flag,async()=>{
 const f=fixture();if(flag===undefined)delete f.request.inputs[0].replace_existing;else f.request.inputs[0].replace_existing=flag;
 const before=structuredClone(f.graph),result=await f.run();
 assert.equal(result.status,'NOT_APPLIED');assert.match(result.error,/unowned link/);assert.deepEqual(f.calls,[]);assert.deepEqual(f.graph,before);
});
test('permission on another input cannot authorize an unnamed replacement',async()=>{
 const f=fixture();f.request.inputs=[{source:ref('filter'),output:0,input:0},{source:ref('filter'),output:1,input:1,replace_existing:true}];
 assert.equal((await f.run()).status,'NOT_APPLIED');assert.deepEqual(f.calls,[]);
});
test('duplicate incoming identities refuse before any graph mutation',async()=>{
 const f=fixture();f.graph.links.push({source:'source',output:1,target:'target',input:0});
 assert.equal((await f.run()).status,'NOT_APPLIED');assert.deepEqual(f.calls,[]);
});
for(const kind of ['remove_link','connect'])test('uncertain '+kind+' stays pending and never repeats',async()=>{
 const f=fixture(),mutate=f.adapter.mutate;
 f.adapter.mutate=async effect=>{const receipt=await mutate(effect);if(effect.kind===kind)throw Error('lost reply');return receipt;};
 assert.equal((await f.run()).status,'AMBIGUOUS');const calls=[...f.calls];
 assert.equal((await f.run()).status,'AMBIGUOUS');assert.deepEqual(f.calls,calls);assert.ok(f.operation.targetPhase.pending);
});
test('unrelated graph changes after deletion remain ambiguous',async()=>{
 const f=fixture(),mutate=f.adapter.mutate;
 f.adapter.mutate=async effect=>{const receipt=await mutate(effect);f.graph.nodes[0].label='changed';return receipt;};
 assert.equal((await f.run()).status,'AMBIGUOUS');assert.deepEqual(f.calls,['remove_link']);
});
test('read-only reconciliation can finish a lost removal without deleting twice',async()=>{
 const f=fixture(),mutate=f.adapter.mutate;
 f.adapter.mutate=async effect=>{const receipt=await mutate(effect);if(effect.kind==='remove_link')throw Error('lost reply');return receipt;};
 assert.equal((await f.run()).status,'AMBIGUOUS');
 f.adapter.reconcile=async()=>({verified:true,cleanup_complete:true,receipt:{status:'SUCCEEDED',cleanup_complete:true}});
 const result=await f.run();assert.equal(result.status,'SUCCEEDED',result.error);assert.deepEqual(f.calls,['remove_link','connect']);
 assert.equal(result.replaced_links[0].removed.source,'source');
});
test('the same source with a different output also needs explicit permission',async()=>{
 const f=fixture();f.request.inputs[0].source=ref('source');f.request.inputs[0].output=1;
 const result=await f.run();assert.equal(result.status,'SUCCEEDED',result.error);
 assert.equal(result.replaced_links[0].removed.output,0);assert.equal(result.replaced_links[0].created.output,1);
});
test('an already desired connection is a no-op even with permission',async()=>{
 const f=fixture();f.request.inputs[0].source=ref('source');
 const result=await f.run();assert.equal(result.status,'SUCCEEDED');assert.deepEqual(f.calls,[]);assert.equal(result.replaced_links,undefined);
});
test('a link on another input remains untouched when inputs are omitted',async()=>{
 const f=fixture(),before=structuredClone(f.graph);f.request.inputs=[];
 assert.equal((await f.run()).status,'SUCCEEDED');assert.deepEqual(f.graph,before);assert.deepEqual(f.calls,[]);
});
for(const edit of [r=>{r.inputs[0].replace_existing='true';},r=>{r.target={kind:'new',type:'transform.union_data'};},
 r=>{r.variable_inputs=[{source:ref('filter'),output:0,input:0,kind:'control',replace_existing:true}];},
 r=>{r.inputs[0].source.workflow_id='foreign';}])test('replacement request validation retains strict scope',()=>{
 const f=fixture();edit(f.request);assert.throws(()=>validateNodeTargetRequest(f.request));
});
test('compact tool publishes optional per-input permission and expands only prepared workflow',()=>{
 const f=fixture(),bindings=createUserWorkflowBindings(),tool=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 const args={...f.request,workflow_ref:{workflow_id:'wf'},operation_id:'relink',contract_revision:'1.0.0',mode:'append_all',parameters:{},finish:'done'};
 assert.throws(()=>bindings.expandNode(args),/UNKNOWN_PREPARED_WORKFLOW/);
 validateActionParameters(tool.inputSchema,args);bindings.remember({document_id:'doc',workflow_ref});
 assert.deepEqual(bindings.expandNode(args).inputs,f.request.inputs);
 assert.ok(!tool.inputSchema.properties.inputs.items.required.includes('replace_existing'));
});
