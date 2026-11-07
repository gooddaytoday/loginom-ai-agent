import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';
export function auditFilterBindings(events,initial,final){
 const checkpoints=events.flatMap((e,index)=>e.phase==='node_checkpoint'&&e.result?.status==='SUCCEEDED'&&e.result.cleanup_complete===true?[{index,result:e.result}]:[]);
 const matches=(c,expected)=>c.result.execution?.status==='completed'&&expected.outputs.every(w=>
  c.result.output?.ports?.some(p=>p.port===w.output_port&&p.fresh===true&&p.execution_id===c.result.execution.execution_id&&matchesExpectedOutput(p,w)));
 const first=checkpoints.find(c=>matches(c,initial)&&c.result.configuration?.bindings?.length===1);assert.ok(first,'FILTER_BINDING_INITIAL');
 const b=first.result.configuration.bindings[0];
 assert.equal(b.parameter,'/groups/0/0/value');assert.equal(b.mode,'variable');assert.equal(b.variable.name,'Limit');assert.equal(b.variable.type,'integer');
 assert.equal(b.source.type,'variables.user');assert.equal(b.source.output,4);assert.equal(b.verified,true);
 const patch=events.findIndex((e,i)=>i>first.index&&e.phase==='node_apply_prepared'&&e.request?.target?.type==='variables.user'&&e.request.parameters?.variables?.some(v=>v.name==='Limit'&&v.value===8));
 assert.ok(patch>first.index,'FILTER_BINDING_SOURCE_UPDATE');
 assert.equal(events[patch].request.target.ref.node_id,b.source.ref.node_id);
 assert.deepEqual(events[patch].request.parameters.variables,[{name:'Limit',type:'integer',value:8}]);
 const second=checkpoints.find(c=>c.index>patch&&c.result.node.node_id===first.result.node.node_id&&matches(c,final)&&c.result.execution.execution_id!==first.result.execution.execution_id);
 assert.ok(second,'FILTER_BINDING_FINAL_SAME_NODE');
 for(const [c,spec] of [[first,initial],[second,final]])for(const want of spec.outputs){
  if(want.column_order==='any')continue;
  const p=c.result.output.ports.find(p=>p.port===want.output_port);assert.deepEqual(p.schema.map(f=>f.name),want.columns.map(f=>f.name),'FILTER_BINDING_FIELD_ORDER');
 }
 for(const [index,e] of events.entries()){
  if(index<=first.index||e.phase!=='node_apply_prepared'||e.request?.target?.type!=='transform.filter_data')continue;
  const r=e.request;assert.equal(r.target.kind,'existing','FILTER_BINDING_SECOND_NODE');assert.equal(r.target.ref.node_id,first.result.node.node_id);
  assert.ok(r.mode==='read_existing_output'||Object.keys(r.parameters).length===0&&!r.inputs.length&&!r.mappings.length&&!r.variable_inputs?.length&&!r.bindings?.length,'FILTER_BINDING_RECONFIGURED');
 }
 const source=c=>c.result.node?.node_id===b.source.ref.node_id?c.result.configuration?.readback?.variables??c.result.output?.variable_ports?.[0]?.variables:undefined;
 const before=checkpoints.filter(c=>c.index<first.index).map(source).filter(Boolean).at(-1),after=checkpoints.filter(c=>c.index>patch).map(source).find(Boolean);
 assert.ok(before&&after,'FILTER_BINDING_SOURCE_INVENTORY');
 assert.deepEqual(before.map(v=>[v.id,v.index,v.name,v.type]),after.map(v=>[v.id,v.index,v.name,v.type]),'FILTER_BINDING_VARIABLE_IDENTITY');
 const sentinel=v=>v.find(x=>x.name==='Sentinel');assert.ok(sentinel(before),'FILTER_BINDING_SENTINEL');assert.deepEqual(sentinel(before),sentinel(after));
 return {status:'PASS',node:first.result.node,binding:b,initial_execution_id:first.result.execution.execution_id,final_execution_id:second.result.execution.execution_id};
}
export async function observeFilterBindingInventory({load,graph,channelFor,expected,record}){
 const {readFilterBindings}=await load('client/lib/variable-binding-readback.mjs');
 assert.ok(Array.isArray(expected.binding_inventory)&&expected.binding_inventory.length>0&&expected.binding_inventory.length<=32,'COLD_BINDING_EXPECTED');
 const result=[];
 for(const want of expected.binding_inventory){
  assert.equal(want.node.type,'transform.filter_data');
  const targets=graph.nodes.filter(n=>n.type===want.node.type&&(want.node.label===undefined||n.label===want.node.label));
  assert.equal(targets.length,1,'COLD_BINDING_NODE_UNIQUE');
  const node=targets[0].ref,links=(graph.variable_links??[]).filter(l=>l.target===node.node_id&&l.kind==='control'&&l.input===0);
  const source=links.length===1?graph.nodes.find(n=>n.ref.node_id===links[0].source):null;
  const sourceProof=source?.type==='variables.user'?{...await channelFor(source.ref,'cold-binding-source').configureUserVariables([],'close'),source:source.ref}:undefined;
  const bindings=await readFilterBindings(channelFor(node,'cold-bindings'),{readGraph:async()=>graph,sourceProof});
  assert.equal(bindings.length,expected.binding_inventory.filter(w=>w.node.type===want.node.type&&w.node.label===want.node.label).length,'COLD_BINDING_COMPLETE');
  const matches=bindings.filter(b=>b.parameter===want.parameter);assert.equal(matches.length,1,'COLD_BINDING_PARAMETER');
  const b=matches[0];assert.equal(b.mode,want.mode);assert.equal(b.verified,true);
  for(const [key,value] of Object.entries(want.variable))assert.deepEqual(b.variable[key],value,'COLD_BINDING_VARIABLE:'+key);
  assert.equal(b.source.type,want.source.type);assert.equal(b.source.output,want.source.output);
  result.push({node,bindings});
 }
 await record({phase:'cold_parameter_bindings',inventory:result,settings_applied:false});return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [initial,final,events]=process.argv.slice(2).map(p=>JSON.parse(readFileSync(p,'utf8')));
 console.log(JSON.stringify(auditFilterBindings(events,initial,final)));
}
