import test from 'node:test';
import assert from 'node:assert/strict';
import {dataPartitionConfigurationReadback} from '../lib/datapartition-readback.mjs';

function fixture(){
 const node={document_id:'d',workflow_id:'w',node_id:'n'},context={...node,verified:true,surface:'wizard'};
 const value={type:'string',is_null:true,value:null};
 const field={index:0,record_id:'source',name:'Group',label:'Group',type:'string',data_kind:'Дискретный',required:false};
 const membership={index:0,record_id:'member',name:'IsTestSet',label:'Тестовое множество',type:'boolean',data_kind:'Дискретный',required:true};
 const target={...field,source:field};
 const native={verified:true,inventory_complete:true,node_context:{...context,input_port:{port:0}},source_fields:[field],target_fields:[target]};
 const configuration={verified:true,inventory_complete:true,node_context:context,input_fields:[target],mode:'biased',
  parameters:{biased:{field:'Group',adjustments:[{value,factor:2}]}},method_rows:[{record_id:'ephemeral',value,factor:2,count:8,source_count:4}]};
 const mapping=[0,1,2].map(port=>{const fields=port===0?[membership,{...field,index:1}]:[field];return {port,
  native_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,node_context:{...context,output_port:{port,port_guid:'p'+port}},
   source_fields:fields,target_fields:fields.map(f=>({...f,source:f,excluded:false}))},finish:{settings_applied:true}}});
 const phases=[['input_mapping',{verified:true,cleanup_complete:true,native_mapping:native,finish:{settings_applied:true}}],
  ['configure',{verified:true,cleanup_complete:true,configuration,validation:{status:'accepted_by_loginom_next',node_context:context},requested_parameters:{biased:{field:'Group',adjustments:[{value,count:8}]}}}],
  ['node_finish',{verified:true,cleanup_complete:true,settings_applied:true,mode:'done',node_context:context}],
  ['output_mapping',{verified:true,cleanup_complete:true,ports:mapping}],
  ['finish',{verified:true,cleanup_complete:true,settings_applied:true,mode:'execute',node_context:context}]]
  .map(([phase,value])=>({phase,value,status:'verified',receipt_id:'op:'+phase}));
 return {node,phases,operation_id:'op'};
}

test('bias public readback retains effective factor/count/source count and typed NULL without ephemeral record IDs',()=>{
 const input=fixture(),result=dataPartitionConfigurationReadback(input);
 assert.deepEqual(result.bias_inventory,[{value:{type:'string',is_null:true,value:null},factor:2,count:8,source_count:4}]);
 assert.equal(result.requested_parameters.biased.adjustments[0].count,8);
 for(const change of [c=>c.method_rows[0].count=1.5,c=>c.method_rows[0].source_count=-1,c=>c.method_rows[0].factor=3,c=>c.method_rows[0].value={type:'string',is_null:false,value:'NULL'}]){
  const bad=fixture();change(bad.phases.find(p=>p.phase==='configure').value.configuration);assert.throws(()=>dataPartitionConfigurationReadback(bad));
 }
})
