import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';
export function auditBooleanBindings(events,initial,final){
 const type=final.outputs[0].output_node_type,parameter=type==='transform.group_data'?'/sort_result':'/compare_with_locale';
 const checkpoints=events.flatMap((e,index)=>e.phase==='node_checkpoint'&&e.result?.status==='SUCCEEDED'&&e.result.cleanup_complete===true?[{index,result:e.result}]:[]);
 const matches=(c,expected)=>c.result.execution?.status==='completed'&&expected.outputs.every(w=>
  c.result.output?.ports?.some(p=>p.port===w.output_port&&p.fresh===true&&p.execution_id===c.result.execution.execution_id&&matchesExpectedOutput(p,w)));
 const first=checkpoints.find(c=>matches(c,initial)&&c.result.configuration?.bindings?.length===1);assert.ok(first,'BOOLEAN_BINDING_INITIAL');
 const b=first.result.configuration.bindings[0];
 assert.equal(b.parameter,parameter);assert.equal(b.mode,'variable');assert.equal(b.variable.name,'Flag');assert.equal(b.variable.type,'boolean');
 assert.equal(b.source.type,'variables.user');assert.equal(b.source.output,4);assert.equal(b.verified,true);
 const patch=events.findIndex((e,i)=>i>first.index&&e.phase==='node_apply_prepared'&&e.request?.target?.type==='variables.user'&&e.request.parameters?.variables?.some(v=>v.name==='Flag'&&v.value===true));
 assert.ok(patch>first.index,'BOOLEAN_BINDING_SOURCE_UPDATE');
 assert.equal(events[patch].request.target.ref.node_id,b.source.ref.node_id);
 assert.deepEqual(events[patch].request.parameters.variables,[{name:'Flag',type:'boolean',value:true}]);
 const second=checkpoints.find(c=>c.index>patch&&c.result.node.node_id===first.result.node.node_id&&matches(c,final)&&c.result.execution.execution_id!==first.result.execution.execution_id);
 assert.ok(second,'BOOLEAN_BINDING_FINAL_SAME_NODE');
 for(const [c,spec] of [[first,initial],[second,final]])for(const want of spec.outputs){
  if(want.column_order==='any')continue;
  const p=c.result.output.ports.find(p=>p.port===want.output_port);assert.deepEqual(p.schema.map(f=>f.name),want.columns.map(f=>f.name),'BOOLEAN_BINDING_FIELD_ORDER');
 }
 for(const [index,e] of events.entries()){
  if(index<=first.index||e.phase!=='node_apply_prepared'||e.request?.target?.type!==type)continue;
  const r=e.request;assert.equal(r.target.kind,'existing','BOOLEAN_BINDING_SECOND_NODE');assert.equal(r.target.ref.node_id,first.result.node.node_id);
  assert.ok(r.mode==='read_existing_output'||Object.keys(r.parameters).length===0&&!r.inputs.length&&!r.mappings.length&&!r.variable_inputs?.length&&!r.bindings?.length,'BOOLEAN_BINDING_RECONFIGURED');
 }
 const source=c=>c.result.node?.node_id===b.source.ref.node_id?c.result.configuration?.readback?.variables??c.result.output?.variable_ports?.[0]?.variables:undefined;
 const before=checkpoints.filter(c=>c.index<first.index).map(source).filter(Boolean).at(-1),after=checkpoints.filter(c=>c.index>patch).map(source).find(Boolean);
 assert.ok(before&&after,'BOOLEAN_BINDING_SOURCE_INVENTORY');
 for(const [variables,value] of [[before,false],[after,true]]){const flags=variables.filter(v=>v.name==='Flag');assert.equal(flags.length,1);assert.equal(flags[0].type,'boolean');assert.equal(flags[0].cell?.value??flags[0].value,value,'BOOLEAN_BINDING_FLAG_VALUE');}
 assert.deepEqual(before.map(v=>[v.id,v.index,v.name,v.type]),after.map(v=>[v.id,v.index,v.name,v.type]),'BOOLEAN_BINDING_VARIABLE_IDENTITY');
 const sentinel=v=>v.find(x=>x.name==='Sentinel');assert.ok(sentinel(before),'BOOLEAN_BINDING_SENTINEL');assert.deepEqual(sentinel(before),sentinel(after));
 return {status:'PASS',node:first.result.node,binding:b,initial_execution_id:first.result.execution.execution_id,final_execution_id:second.result.execution.execution_id};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [initial,final,events]=process.argv.slice(2).map(p=>JSON.parse(readFileSync(p,'utf8')));
 console.log(JSON.stringify(auditBooleanBindings(events,initial,final)));
}
