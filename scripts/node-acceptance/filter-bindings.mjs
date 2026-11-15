import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';
export function auditFilterBindings(events,initial,final){
 if(final.row_filter_typed||final.row_filter_null)return auditTypedFilterBindings(events,initial,final);
 const top=final.row_filter_top_n===true,name=top?'TopN':'Limit',value=top?5:8;
 const checkpoints=events.flatMap((e,index)=>e.phase==='node_checkpoint'&&e.result?.status==='SUCCEEDED'&&e.result.cleanup_complete===true?[{index,result:e.result}]:[]);
 const matches=(c,expected)=>c.result.execution?.status==='completed'&&expected.outputs.every(w=>
  c.result.output?.ports?.some(p=>p.port===w.output_port&&p.fresh===true&&p.execution_id===c.result.execution.execution_id&&matchesExpectedOutput(p,w)));
 const first=checkpoints.find(c=>matches(c,initial)&&c.result.configuration?.bindings?.length===1);assert.ok(first,'FILTER_BINDING_INITIAL');
 const b=first.result.configuration.bindings[0];
 assert.equal(b.parameter,'/groups/0/0/value');assert.equal(b.mode,'variable');assert.equal(b.variable.name,name);assert.equal(b.variable.type,'integer');
 assert.equal(b.source.type,'variables.user');assert.equal(b.source.output,4);assert.equal(b.verified,true);
 if(top)assert.deepEqual(first.result.configuration.readback?.groups,[[{field:{kind:'row_number'},type:'integer',operator:'<=',value:{kind:'variable',name}}]],'FILTER_TOP_N_CONDITION');
 const patch=events.findIndex((e,i)=>i>first.index&&e.phase==='node_apply_prepared'&&e.request?.target?.type==='variables.user'&&e.request.parameters?.variables?.some(v=>v.name===name&&v.value===value));
 assert.ok(patch>first.index,'FILTER_BINDING_SOURCE_UPDATE');
 assert.equal(events[patch].request.target.ref.node_id,b.source.ref.node_id);
 assert.deepEqual(events[patch].request.parameters.variables,[{name,type:'integer',value}]);
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
 if(top){
  for(const [variables,want] of [[before,'3'],[after,'5']]){
   const cell=variables.find(v=>v.name===name)?.cell;
   assert.equal(cell?.type,'integer');assert.equal(cell.is_null,false);assert.equal(cell.precision,'exact_integer');assert.equal(cell.value,want);
  }
 }
 if(!top){const sentinel=v=>v.find(x=>x.name==='Sentinel');assert.ok(sentinel(before),'FILTER_BINDING_SENTINEL');assert.deepEqual(sentinel(before),sentinel(after));}
 return {status:'PASS',node:first.result.node,binding:b,initial_execution_id:first.result.execution.execution_id,final_execution_id:second.result.execution.execution_id};
}
function auditTypedFilterBindings(events,initial,final){
 const typed=final.row_filter_typed===true;
 const conditions=[{field:{kind:'input_field',name:'Score'},type:'real',operator:'>=',value:{kind:'variable',name:'MinScore'}},
  ...(typed?[{field:{kind:'input_field',name:'Seen'},type:'datetime',operator:'>=',value:{kind:'variable',name:'Since'}}]:[])];
 const checkpoints=events.flatMap((e,index)=>e.phase==='node_checkpoint'&&e.result?.status==='SUCCEEDED'&&e.result.cleanup_complete===true?[{index,result:e.result}]:[]);
 const matches=(c,want)=>c.result.execution?.status==='completed'&&want.outputs.every(w=>c.result.output?.ports?.some(p=>p.port===w.output_port&&p.fresh===true&&p.execution_id===c.result.execution.execution_id&&matchesExpectedOutput(p,w)));
 const first=checkpoints.find(c=>matches(c,initial)&&c.result.configuration?.bindings?.length===conditions.length);
 assert.ok(first,'FILTER_TYPED_INITIAL');assert.deepEqual(first.result.configuration.readback?.groups,[conditions],'FILTER_TYPED_CONDITIONS');
 const bindings=first.result.configuration.bindings;
 for(const [i,condition] of conditions.entries()){
  const b=bindings.find(b=>b.parameter===`/groups/0/${i}/value`);assert.ok(b,'FILTER_TYPED_BINDING');
  assert.equal(b.mode,'variable');assert.equal(b.verified,true);assert.equal(b.variable.name,condition.value.name);
  assert.equal(b.variable.type,condition.type);assert.equal(b.variable.is_null,!typed);
  assert.equal(b.source.type,'variables.user');assert.equal(b.source.output,4);
  assert.equal(b.source.ref.node_id,bindings[0].source.ref.node_id);
 }
 const source=bindings[0].source.ref.node_id;
 const inventory=c=>c.result.node?.node_id===source?c.result.configuration?.readback?.variables??c.result.output?.variable_ports?.[0]?.variables:undefined;
 const before=checkpoints.filter(c=>c.index<first.index).map(inventory).filter(Boolean).at(-1);assert.ok(before,'FILTER_TYPED_SOURCE');
 const values=typed?[2.5,'2024-03-01T00:00:00.000']:[null];
 for(const [i,c] of conditions.entries()){
  const v=before.find(v=>v.name===c.value.name);assert.equal(v?.type,c.type);assert.equal(v.cell?.is_null,!typed);
  assert.equal(v.cell?.value,values[i]);
 }
 let last=first;
 if(typed){
  const patch=events.findIndex((e,i)=>i>first.index&&e.phase==='node_apply_prepared'&&e.request?.target?.type==='variables.user'
   &&e.request.target.ref?.node_id===source&&e.request.parameters?.variables?.some(v=>v.name==='MinScore'&&v.value===0.5));
  assert.ok(patch>first.index,'FILTER_TYPED_PATCH');
  const variables=events[patch].request.parameters.variables;assert.equal(variables.length,2);
  assert.ok(variables.some(v=>v.name==='MinScore'&&v.type==='real'&&v.value===0.5));
  assert.ok(variables.some(v=>v.name==='Since'&&v.type==='datetime'&&v.value.replace(/\.000$/,'')==='2024-02-29T00:00:00'));
  last=checkpoints.find(c=>c.index>patch&&c.result.node.node_id===first.result.node.node_id&&matches(c,final)
   &&c.result.execution.execution_id!==first.result.execution.execution_id);assert.ok(last,'FILTER_TYPED_FINAL');
  const after=checkpoints.filter(c=>c.index>patch).map(inventory).find(Boolean);assert.ok(after,'FILTER_TYPED_UPDATED_SOURCE');
  assert.deepEqual(before.map(v=>[v.id,v.index,v.name,v.type]),after.map(v=>[v.id,v.index,v.name,v.type]),'FILTER_TYPED_IDENTITY');
 }
 for(const [i,e] of events.entries())if(i>first.index&&e.phase==='node_apply_prepared'&&e.request?.target?.type==='transform.filter_data'){
  const r=e.request;assert.equal(r.target.kind,'existing');assert.equal(r.target.ref.node_id,first.result.node.node_id);
  assert.ok(r.mode==='read_existing_output'||Object.keys(r.parameters).length===0&&!r.inputs.length&&!r.mappings.length&&!r.variable_inputs?.length&&!r.bindings?.length,'FILTER_TYPED_RECONFIGURED');
 }
 return {status:'PASS',node:first.result.node,bindings,initial_execution_id:first.result.execution.execution_id,final_execution_id:last.result.execution.execution_id};
}
export async function observeFilterBindingInventory({load,graph,channelFor,expected,record}){
 const {readFilterBindings,readBooleanBindings}=await load('client/lib/variable-binding-readback.mjs');
 assert.ok(Array.isArray(expected.binding_inventory)&&expected.binding_inventory.length>0&&expected.binding_inventory.length<=32,'COLD_BINDING_EXPECTED');
 const result=[];
 for(const want of expected.binding_inventory){
  assert.ok(['transform.filter_data','transform.group_data','transform.sorting'].includes(want.node.type));
  const targets=graph.nodes.filter(n=>n.type===want.node.type&&(want.node.label===undefined||n.label===want.node.label));
  assert.equal(targets.length,1,'COLD_BINDING_NODE_UNIQUE');
  const node=targets[0].ref,links=(graph.variable_links??[]).filter(l=>l.target===node.node_id&&l.kind==='control'&&l.input===0);
  const source=links.length===1?graph.nodes.find(n=>n.ref.node_id===links[0].source):null;
  const sourceProof=source?.type==='variables.user'?{...await channelFor(source.ref,'cold-binding-source').configureUserVariables([],'close'),source:source.ref}:undefined;
  if(want.field||want.condition){
   const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs'),{closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
   const channel=channelFor(node,'cold-top-n-condition');
   try{
    await openPreparedWizard(channel);
    const state=await channel.observe({condition:'saved row-number variable threshold',readFilter:true,ready:s=>s.node_filter?.verified===true&&s.node_filter.inventory_complete===true});
    const rows=state.node_filter.rows;assert.equal(rows.length,expected.binding_inventory.length,'COLD_FILTER_CONDITIONS');
    const row=rows[Number(want.parameter.split('/')[3])];
    assert.deepEqual(row.field,want.condition?.field??want.field);assert.equal(row.operator_code,want.condition?.operator_code??1);assert.equal(row.variable_mode,1);
    if(want.condition)assert.equal(row.type,want.condition.type);
    assert.deepEqual(row.value,{kind:'variable',name:want.variable.name});
    await record({phase:want.condition?'cold_filter_condition':'cold_top_n_condition',row,settings_applied:false});
   }finally{await closePreparedWizard(channel);}
  }
  const bindings=await (want.node.type==='transform.filter_data'?readFilterBindings:readBooleanBindings)(channelFor(node,'cold-bindings'),{type:want.node.type,node,readGraph:async()=>graph,sourceProof});
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
