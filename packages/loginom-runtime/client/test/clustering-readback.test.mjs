import test from 'node:test';
import assert from 'node:assert/strict';
import {clusteringConfigurationReadback} from '../lib/clustering-readback.mjs';
const node={document_id:'doc',workflow_id:'workflow',node_id:'clustering'};
function candidate(){
 const values={input_mapping:{},configure:{configuration:{verified:true,node_context:node,fields:[{name:'RowID',usage_type:0},{name:'X',usage_type:3},{name:'Y',usage_type:3}],normalization:[{name:'X',norm_type:0},{name:'Y',norm_type:0}],clusters:3,seed:42},validation:{status:'accepted_by_loginom_next'}},node_finish:{settings_applied:true},output_mapping:{},finish:{settings_applied:true,mode:'execute',execution_id:'execute-2',training:{status:'trained',node,execution_id:'train-1',source:[{node:{...node,node_id:'import'},output:0,input:0}]}}};
 return {node,operation_id:'operation',phases:Object.entries(values).map(([phase,value])=>({phase,status:'verified',receipt_id:'operation:'+phase,value:{verified:true,cleanup_complete:true,...value}}))};
}
test('readback distinguishes native training from subsequent execution and names its input',()=>{
 const result=clusteringConfigurationReadback(candidate());
 assert.deepEqual(result.features,['X','Y']);
 assert.equal(result.training.status,'trained');assert.equal(result.training.source[0].node.node_id,'import');
 assert.equal(result.training.execution_id,'train-1');assert.equal(result.normalization,'none');
});
test('readback reports observed standardization and rejects mixed or incomplete native settings',()=>{
 const input=candidate();
 input.phases[1].value.configuration.normalization.forEach(f=>f.norm_type=5);
 assert.equal(clusteringConfigurationReadback(input).normalization,'standardize');
 input.phases[1].value.configuration.normalization[0].norm_type=0;
 assert.throws(()=>clusteringConfigurationReadback(input),/normalization/);
 input.phases[1].value.configuration.normalization.pop();
 assert.throws(()=>clusteringConfigurationReadback(input),/normalization/);
});
test('ordinary execution alone cannot claim a trained model',()=>{
 for(const alter of [v=>delete v.training,v=>v.training.execution_id=v.execution_id,v=>v.training.source=[]]){
  const input=candidate();alter(input.phases.at(-1).value);
  assert.throws(()=>clusteringConfigurationReadback(input),/training on the connected source/);
 }
});
test('Done commits settings without claiming training and foreign settings refuse',()=>{
 const input=candidate();input.phases.at(-1).value.mode='done';delete input.phases.at(-1).value.training;
 assert.equal(clusteringConfigurationReadback(input).training.status,'not_requested');
 input.phases[1].value.configuration.node_context={...node,node_id:'foreign'};
 assert.throws(()=>clusteringConfigurationReadback(input),/configuration owner/);
});
