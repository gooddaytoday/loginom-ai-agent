import test from 'node:test';import assert from 'node:assert/strict';
import {bindReformInput} from '../lib/reform-input.mjs';
import {resolveReformChanges} from '../lib/reform-parameters.mjs';
const fixture=()=>{
 const node={verified:true,document_id:'doc',workflow_id:'flow',node_id:'reform',surface:'wizard'};
 const sources=[{record_id:'s3',field_id:'3',name:'RawPrice',label:'Same',type:'string'},{record_id:'s1',field_id:'1',name:'Region',label:'Same',type:'string'}];
 const input={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...node,input_port:{port:0}},source_fields:sources,
  target_fields:sources.map((source,index)=>({...source,record_id:'t'+index,index,name:index===0?'UnitPrice':source.name,source}))};
 const configuration={verified:true,inventory_complete:true,node_context:node,fields:input.target_fields.map((f,index)=>({record_id:'r'+index,field_id:f.field_id,index,name:index===0?'Amount':f.name,label:f.label,type:index===0?'real':f.type,excluded:index===1}))};
 return {input,configuration};
};
test('reform binds renamed and excluded fields through persistent IDs after input reorder',()=>{
 const f=fixture(),saved=structuredClone(f),c=bindReformInput(f.configuration,f.input);
 assert.deepEqual(f,saved);assert.equal(c.source_identity_verified,true);assert.equal(c.fields[0].input_field.name,'UnitPrice');assert.equal(c.fields[0].input_field.source_name,'RawPrice');
 const p=resolveReformChanges({changes:[{field:{kind:'input_field',name:'UnitPrice'},type:'integer'}]},c);
 assert.equal(p.changes[0].original.name,'Amount');assert.equal(p.fields[0].type,'integer');assert.equal(p.fields[1].excluded,true);
});
test('reform never substitutes name, label or index when native source identity is unavailable',()=>{
 for(const mutate of [f=>f.input.source_identity_verified=false,f=>f.input.node_context.node_id='other',f=>f.input.node_context.input_port.port=1,
  f=>f.input.target_fields[0].field_id='5',f=>f.input.target_fields[1].field_id='3',f=>f.input.target_fields[0].source=null,
  f=>f.input.source_fields=[],f=>f.input.target_fields[0].source={...f.input.target_fields[0].source,name:'Foreign'},
  f=>f.input.target_fields[0].index=1,f=>f.input.target_fields.pop(),f=>f.input.target_fields[1].name='UnitPrice']){
  const f=fixture();mutate(f);assert.throws(()=>bindReformInput(f.configuration,f.input),/Reform input binding/);
 }
});
test('input-name patches require verified input binding even if the current name happens to match',()=>{
 const f=fixture();assert.throws(()=>resolveReformChanges({changes:[{field:{kind:'input_field',name:'Amount'},label:'X'}]},f.configuration),/Verified reform input/);
});
