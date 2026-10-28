import test from 'node:test';
import assert from 'node:assert/strict';
import {sortingConfigurationReadback} from '../lib/sorting-readback.mjs';

// LAB-435 minA:1807: restored input has six fields, while the saved fixed
// output retains Debt and the excluded sorting key after the two-field run.
function fixture(){
 const node={document_id:'d',workflow_id:'w',node_id:'n'},owner={verified:true,...node};
 const fields=['Debt','OrderPosition','OrderID','Customer','OrderAmount','PaidAmount'].map((name,index)=>({index,name,label:name,type:index===1?'integer':index===2||index===3?'string':'real'}));
 const sources=fields.map((f,index)=>({...f,record_id:'s'+index}));
 const values={input_mapping:{native_mapping:{verified:true,inventory_complete:true,autosync:true,node_context:{...owner,input_port:{port:0}},source_fields:structuredClone(sources),target_fields:fields.map((f,index)=>({...f,source:structuredClone(sources[index])}))},finish:{settings_applied:true}},
 configure:{configuration:{verified:true,inventory_complete:true,node_context:owner,input_fields:fields,keys:[{...fields[1],order:0,direction:'ASC'}],comparison:{mode:'user_locale'},options:{}},validation:{status:'accepted_by_loginom_next',node_context:owner}},
 node_finish:{mode:'done',settings_applied:true,node_context:owner},
 output_mapping:{native_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,node_context:{...owner,output_port:{port:0}},source_fields:sources,
 target_fields:fields.slice(0,2).map((f,index)=>({...f,excluded:index===1,source:index===0?sources[index]:null,exclusion_source:index===1?sources[index]:null}))},finish:{settings_applied:true}},
 finish:{mode:'execute',settings_applied:true,node_context:owner}};
 return {node,operation_id:'op',phases:Object.entries(values).map(([phase,value])=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,cleanup_complete:true,...value}}))};
}
const mapping=f=>f.phases.find(p=>p.phase==='output_mapping').value.native_mapping;
test('sorting readback preserves a fixed retained projection after current input expands',()=>{
 const r=sortingConfigurationReadback(fixture());
 assert.equal(r.input_mapping.fields.length,6);
 assert.equal(r.output_mapping.autosync,false);
 assert.deepEqual(r.output_mapping.fields.map(f=>[f.source_name,f.excluded]),[['Debt',false],['OrderPosition',true]]);
 assert.equal(r.package_persistence_verified,false);
});
test('sorting readback requires derived sources to match the current configured input',()=>{
 for(const change of [m=>m.source_fields.pop(),m=>m.source_fields.push({...m.source_fields[2],record_id:'extra'}),
  m=>m.source_fields[2].name='foreign',m=>m.source_fields[2].type='real',m=>m.source_fields[2].label='foreign']){
  const f=fixture();change(mapping(f));assert.throws(()=>sortingConfigurationReadback(f),/derived source coverage/);
 }
});
test('sorting readback refuses incomplete autosync and unknown autosync, foreign or duplicate links',()=>{
 for(const change of [m=>m.autosync=true,m=>delete m.autosync,
  m=>m.target_fields[1].exclusion_source={...m.source_fields[1],record_id:'foreign'},
  m=>m.target_fields[1].exclusion_source=m.source_fields[0]]){
  const f=fixture();change(mapping(f));assert.throws(()=>sortingConfigurationReadback(f));
 }
});
test('sorting readback still accepts complete output coverage with autosync enabled',()=>{
 const f=fixture(),m=mapping(f);m.autosync=true;
 m.target_fields.push(...m.source_fields.slice(2).map(source=>({...source,source,excluded:false})));
 assert.equal(sortingConfigurationReadback(f).output_mapping.fields.length,6);
});
