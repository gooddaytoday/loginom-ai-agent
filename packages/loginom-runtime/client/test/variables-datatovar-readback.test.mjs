import test from 'node:test';
import assert from 'node:assert/strict';
import {dataToVarConfigurationReadback} from '../lib/variables-datatovar-readback.mjs';

function fixture(){
 const node={document_id:'d',workflow_id:'w',node_id:'n'},owner={...node,verified:true};
 const input={index:0,name:'X',label:'X',type:'integer',record_id:'x',source:{record_id:'sx',name:'X'}};
 const f={record_id:'x',name:'X',label:'X',type:'integer',role:'selected',order:0,functions:31};
 const phase=(phase,value)=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,cleanup_complete:true,...value}});
 return {node,operation_id:'op',phases:[
  phase('input_mapping',{native_mapping:{verified:true,inventory_complete:true,node_context:{...owner,input_port:{port:0}},source_fields:[{record_id:'sx',name:'X'}],target_fields:[input],autosync:false},finish:{verified:true,settings_applied:true,cleanup_complete:true,node_context:owner}}),
  phase('configure',{configuration:{verified:true,inventory_complete:true,node_context:owner,input_fields:[f],fields:[f]},validation:{status:'accepted_by_loginom_next',node_context:owner}}),
  phase('node_finish',{mode:'done',settings_applied:true,node_context:owner}),
  phase('finish',{mode:'execute',settings_applied:true,node_context:owner}),
 ]};
}

test('DataToVar readback binds actual field/function settings to exact verified finishes',()=>{
 const r=dataToVarConfigurationReadback(fixture());
 assert.equal(r.kind,'variables_from_table');assert.equal(r.mode,'aggregate');
 assert.deepEqual(r.fields,[{name:'X',label:'X',type:'integer',order:0,aggregations:['sum','count','min','max','avg']}]);
 assert.equal(r.output_port,0);assert.equal(r.port_kind,'variables');assert.equal(r.package_persistence_verified,false);
 assert.equal(r.variables,undefined);assert.equal(r.values_are,'observed_ui_values');
});

test('DataToVar readback refuses stale/duplicate receipts, foreign owners and mismatched input metadata',()=>{
 for(const mutate of [f=>f.phases.push(f.phases[1]),f=>f.phases[1].receipt_id='old:configure',f=>f.phases[1].status='pending',
  f=>f.phases[1].value.configuration.node_context.node_id='foreign',f=>f.phases[1].value.validation.status='unobserved',
  f=>f.phases[2].value.settings_applied=false,f=>f.phases[3].value.cleanup_complete=false,
  f=>f.phases[0].value.native_mapping.target_fields[0].label='changed',
  f=>f.phases[0].value.native_mapping.target_fields[0].source.record_id='foreign',
  f=>f.phases[1].value.configuration.fields[0].functions=16384,
  f=>{const c=f.phases[1].value.configuration;c.fields[0].type=c.input_fields[0].type='string';},
  f=>f.phases[1].value.configuration.fields[0].order=1,
  f=>f.phases[1].value.configuration.fields.push({...f.phases[1].value.configuration.fields[0]}),
 ]){const f=fixture();mutate(f);assert.throws(()=>dataToVarConfigurationReadback(f));}
});

test('DataToVar readback reports extended functions in native order for scalar input types',()=>{
 const f=fixture(),c=f.phases[1].value.configuration,input=f.phases[0].value.native_mapping.target_fields[0];
 c.fields[0].type=c.input_fields[0].type=input.type='string';c.fields[0].functions=c.input_fields[0].functions=8192|4096|2;
 assert.deepEqual(dataToVarConfigurationReadback(f).fields[0].aggregations,['count','only','concat']);
 c.fields[0].type=c.input_fields[0].type=input.type='datetime';
 assert.throws(()=>dataToVarConfigurationReadback(f),/supported ordered/);
});
