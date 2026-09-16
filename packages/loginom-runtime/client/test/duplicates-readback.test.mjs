import test from 'node:test';import assert from 'node:assert/strict';
import {bindReformInput} from '../lib/reform-input.mjs';
import {duplicatesConfigurationReadback} from '../lib/duplicates-readback.mjs'
import {DUPLICATES_OUTPUT} from '../lib/duplicates-parameters.mjs';
function fixture(){
 const node={document_id:'d',workflow_id:'w',node_id:'n'},owner={...node,verified:true},source={record_id:'s',field_id:'8',name:'Raw',label:'Same',type:'string'};
 const im={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',autosync:true,node_context:{...owner,input_port:{port:0}},source_fields:[source],target_fields:[{record_id:'i',field_id:'3',index:0,name:'Raw',label:'Same',type:'string',data_kind:'Дискретный',source}]};
 const c=bindReformInput({verified:true,inventory_complete:true,node_context:owner,caching:{value:0,display:'Отключено',variable:false},fields:[{index:0,record_id:'r',field_id:'3',name:'Raw',label:'Same',type:'string',data_kind:'Дискретный',usage_type:3}]},im);
 const output=[...DUPLICATES_OUTPUT,{name:'Raw',label:'Same',type:'string'}].map((f,i)=>({...f,record_id:'out'+i,field_id:String(i),index:i}));
 const m={verified:true,inventory_complete:true,source_identity_verified:true,node_context:{...owner,output_port:{port:0}},autosync:true,source_fields:output,target_fields:output.map(f=>({...f,excluded:false,source:{...f}}))};
 const phase=(name,value)=>({phase:name,status:'verified',receipt_id:'op:'+name,value:{verified:true,cleanup_complete:true,...value}});
 return {node,operation_id:'op',phases:[phase('input_mapping',{native_mapping:im,finish:{settings_applied:true}}),phase('configure',{configuration:c,validation:{status:'accepted_by_loginom_next',node_context:owner},preservation:{unrequested_fields:true,unrequested_properties:true,caching:true}}),phase('node_finish',{mode:'done',settings_applied:true,node_context:owner}),phase('output_mapping',{native_mapping:m,finish:{settings_applied:true}}),phase('finish',{mode:'execute',settings_applied:true,node_context:owner})]};
}
test('duplicate readback binds complete roles and preserved output without persistence claims',()=>{
 const r=duplicatesConfigurationReadback(fixture());assert.equal(r.kind,'duplicates');assert.equal(r.fields[0].usage_type,3);assert.equal(r.fields[0].input_field.name,'Raw');assert.equal(r.output_mapping.fields.length,5);assert.equal(r.package_persistence_verified,false);
});
test('duplicate readback preserves an existing output order independently of role-grid order',()=>{
 const f=fixture(),m=f.phases[3].value.native_mapping;
 m.target_fields.reverse().forEach((field,index)=>{field.index=index;});
 const r=duplicatesConfigurationReadback(f);
 assert.equal(r.output_mapping.fields[0].name,'Raw');
 m.target_fields[1].name='Raw';
 assert.throws(()=>duplicatesConfigurationReadback(f));
});
test('duplicate readback rejects incomplete, foreign, stale or altered role/mapping receipts',()=>{
 for(const mutate of [f=>f.phases.pop(),f=>f.phases[0].receipt_id='other',
 f=>f.phases[1].value.configuration.fields[0].input_field.name='Other',f=>f.phases[1].value.validation.status='unverified',
 f=>f.phases[1].value.configuration.fields[0].usage_type=0,f=>f.phases[2].value.settings_applied=false,
 f=>f.phases[3].value.native_mapping.target_fields[0].source=null,f=>f.phases[3].value.native_mapping.target_fields[0].type='string',
 f=>f.phases[3].value.native_mapping.target_fields.pop(),f=>f.phases[3].value.native_mapping.target_fields[4].excluded=true,
 f=>f.phases[3].value.native_mapping.node_context.output_port.port=1,f=>f.phases[4].value.node_context.node_id='other',f=>f.phases[3].value.finish.settings_applied=false]){
 const f=fixture();mutate(f);assert.throws(()=>duplicatesConfigurationReadback(f));
 }
});
