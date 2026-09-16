import test from 'node:test';import assert from 'node:assert/strict';
import {bindReformInput} from '../lib/reform-input.mjs';
import {reformConfigurationReadback} from '../lib/reform-readback.mjs';
function fixture(){
 const node={document_id:'d',workflow_id:'w',node_id:'n'},owner={...node,verified:true},source={record_id:'s',field_id:'8',name:'Raw',label:'Same',type:'string'};
 const im={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',autosync:true,node_context:{...owner,input_port:{port:0}},source_fields:[source],target_fields:[{record_id:'i',field_id:'3',index:0,name:'Raw',label:'Same',type:'string',data_kind:'Дискретный',source}]};
 const c=bindReformInput({verified:true,inventory_complete:true,node_context:owner,caching:{value:0,display:'Отключено',variable:false},fields:[{index:0,record_id:'r',field_id:'3',name:'Amount',label:'Same',type:'real',data_kind:'Непрерывный',usage_type:7,caching_method:0,excluded:false}]},im);
 const converted={record_id:'converted',field_id:'0',name:'Amount',label:'Same',type:'real'},m={verified:true,inventory_complete:true,source_identity_verified:true,node_context:{...owner,output_port:{port:0}},autosync:true,source_fields:[converted],target_fields:[{index:0,name:'Amount',label:'Same',type:'real',data_kind:'Непрерывный',excluded:false,source:converted}]};
 const phase=(name,value)=>({phase:name,status:'verified',receipt_id:'op:'+name,value:{verified:true,cleanup_complete:true,...value}});
 return {node,operation_id:'op',phases:[phase('input_mapping',{native_mapping:im,finish:{settings_applied:true}}),phase('configure',{configuration:c,validation:{status:'accepted_by_loginom_next',node_context:owner},preservation:{unrequested_fields:true,unrequested_properties:true,caching:true}}),phase('node_finish',{mode:'done',settings_applied:true,node_context:owner}),phase('output_mapping',{native_mapping:m,finish:{settings_applied:true}}),phase('finish',{mode:'execute',settings_applied:true,node_context:owner})]};
}
test('reform readback reports verified fields and mappings without claiming package persistence',()=>{
 const r=reformConfigurationReadback(fixture());assert.equal(r.kind,'field_parameters');assert.equal(r.fields[0].input_field.name,'Raw');assert.equal(r.fields[0].name,'Amount');assert.equal(r.fields[0].type,'real');assert.equal(r.receipt_ids.length,5);assert.equal(r.package_persistence_verified,false);
});
test('reform readback refuses missing, foreign or inconsistent phase evidence',()=>{
 for(const mutate of [f=>f.phases.pop(),f=>f.phases[0].receipt_id='other',f=>f.phases[1].value.preservation.caching=false,
  f=>f.phases[1].value.configuration.fields[0].input_field.name='Other',f=>f.phases[1].value.validation.status='unverified',
  f=>f.phases[2].value.settings_applied=false,f=>f.phases[3].value.native_mapping.target_fields[0].source=null,
  f=>f.phases[3].value.native_mapping.node_context.output_port.port=1,f=>f.phases[4].value.node_context={...f.node,node_id:'other',verified:true},
  f=>f.phases[3].value.finish.settings_applied=false]){
  const f=fixture();mutate(f);assert.throws(()=>reformConfigurationReadback(f));
 }
});
