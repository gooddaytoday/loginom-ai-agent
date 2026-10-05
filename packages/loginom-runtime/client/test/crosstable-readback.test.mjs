import test from 'node:test';
import assert from 'node:assert/strict';
import {crossTableConfigurationReadback} from '../lib/crosstable-readback.mjs';
import {resolveCrossTableSchema} from '../lib/crosstable-schema.mjs';
const node={document_id:'doc',workflow_id:'wf',node_id:'cross'};
const owner={...node,verified:true};
const configuration={kind:'crosstable',verified:true,inventory_complete:true,node_context:owner,category_mode:'sliding',
 row_keys:[{name:'Region',label:'Region',type:'string',order:0}],column:{name:'Category',label:'Category',type:'string'},
 facts:[{name:'Amount',label:'Amount',type:'real',order:0,functions:['sum']}],options:{separator:'|',unique_names:false,limit:0,min_values:0}};
const schema=[{index:0,name:'Region',label:'Region',type:'string'},
 {index:1,name:'C_1_Amount_Sum',label:'A|Amount|Сумма',type:'real'}];
function phases(execute=false){
 const values={input_mapping:{native_mapping:{verified:true,inventory_complete:true,node_context:{...owner,input_port:{port:0}}},finish:{settings_applied:true}},
 configure:{configuration,validation:{status:'accepted_by_loginom_next',node_context:owner}},
 node_finish:{mode:'done',settings_applied:true,node_context:owner},output_mapping:{deferred_schema:true,node_context:owner},
 finish:{mode:execute?'execute':'done',node_context:owner}};
 if(execute){values.execute={status:'completed',owner_verified:true,execution_id:'fresh'};
 values.read={ports:[{port:0,fresh:true,execution_id:'fresh',schema,category_fields:resolveCrossTableSchema(schema,configuration).category_fields}]};}
 return Object.entries(values).map(([phase,value])=>({phase,receipt_id:'op:'+phase,status:'verified',value:{...structuredClone(value),verified:true,cleanup_complete:true}}));
}
const read=ps=>crossTableConfigurationReadback({node,phases:ps,operation_id:'op'});
test('Done reports deferred schema without inventing execution or package persistence',()=>{
 const r=read(phases());assert.equal(r.output_scope,'not_materialized');assert.equal(r.execution_id,null);
 assert.deepEqual(r.category_fields,[]);assert.equal(r.package_persistence_verified,false);assert.equal(r.receipt_ids.length,5);
});
test('materialized readback requires fresh execution and matching category identities',()=>{
 const r=read(phases(true));assert.equal(r.execution_id,'fresh');assert.equal(r.category_fields[0].category,'A');assert.equal(r.receipt_ids.length,7);
 for(const mutate of [ps=>ps[0].value.native_mapping.node_context.node_id='foreign',
  ps=>ps[1].value.validation.status='assumed',ps=>ps[2].value.settings_applied=false,
  ps=>ps[3].value.deferred_schema=false,ps=>ps[5].value.owner_verified=false,
  ps=>ps[6].value.ports[0].execution_id='old',ps=>ps[6].value.ports[0].category_fields[0].category='B',
  ps=>ps[6].value.ports[0].schema.pop(),ps=>ps.push(structuredClone(ps[1]))]){
  const ps=phases(true);mutate(ps);assert.throws(()=>read(ps));
 }
});
test('materialized mapping requires an owned completed first execution',()=>{
 const ps=phases(),mapped=ps.find(p=>p.phase==='output_mapping');
 delete mapped.value.deferred_schema;
 mapped.value.native_mapping={verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,
  node_context:{...owner,output_port:{port:0}},source_fields:[],target_fields:[]};
 mapped.value.finish={settings_applied:true};
 mapped.value.initial_materialization={finish:{node_context:owner},execution:{verified:true,owner_verified:true,status:'completed',execution_id:'doc:root:group'}};
 assert.equal(read(ps).output_mapping.autosync,false);
 for(const damage of [v=>v.initial_materialization.finish.node_context.node_id='foreign',
  v=>v.initial_materialization.execution.status='failed',v=>v.initial_materialization.execution.execution_id='foreign:root:group',
  v=>v.initial_materialization.execution.owner_verified=false,v=>v.native_mapping.node_context.output_port.port=1]){
  const copy=structuredClone(ps);damage(copy.find(p=>p.phase==='output_mapping').value);assert.throws(()=>read(copy));
 }
});
