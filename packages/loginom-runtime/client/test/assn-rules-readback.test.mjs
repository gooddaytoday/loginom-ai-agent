import test from 'node:test';
import assert from 'node:assert/strict';
import {assnRulesConfigurationReadback} from '../lib/assn-rules-readback.mjs';
const node={document_id:'doc',workflow_id:'workflow',node_id:'clustering'};
function candidate(){
 const values={input_mapping:{},configure:{configuration:{verified:true,node_context:node,fields:[{name:'Transaction',usage_type:6},{name:'Item',usage_type:7}],roles:{transaction:6,item:7},min_support_pct:50,min_confidence_pct:60,max_items:2},validation:{status:'accepted_by_loginom_next'}},node_finish:{settings_applied:true},output_mapping:{},finish:{settings_applied:true,mode:'execute',execution_id:'execute-2',training:{status:'trained',node,execution_id:'train-1',source:[{node:{...node,node_id:'import'},output:0,input:0}]}}};
 return {node,operation_id:'operation',phases:Object.entries(values).map(([phase,value])=>({phase,status:'verified',receipt_id:'operation:'+phase,value:{verified:true,cleanup_complete:true,...value}}))};
}
test('readback distinguishes native training from subsequent execution and names its input',()=>{
 const result=assnRulesConfigurationReadback(candidate());
 assert.equal(result.transaction_field,'Transaction');assert.equal(result.item_field,'Item');assert.equal(result.min_support_pct,50);
 assert.equal(result.training.status,'trained');assert.equal(result.training.source[0].node.node_id,'import');
 assert.equal(result.training.execution_id,'train-1');assert.equal(result.min_lift,0);assert.equal(result.max_items,2);
});
test('readback preserves the observed item technical name independently of its label',()=>{
 for(const name of ['Item','Category','Товар категории']){
  const input=candidate();input.phases[1].value.configuration.fields[1]={name,label:'Товар',usage_type:7};
  assert.equal(assnRulesConfigurationReadback(input).item_field,name);
 }
});
test('ordinary execution alone cannot claim a trained model',()=>{
 for(const alter of [v=>delete v.training,v=>v.training.execution_id=v.execution_id,v=>v.training.source=[]]){
  const input=candidate();alter(input.phases.at(-1).value);
  assert.throws(()=>assnRulesConfigurationReadback(input),/training on the connected source/);
 }
});
test('Done commits settings without claiming training and foreign settings refuse',()=>{
 const input=candidate();input.phases.at(-1).value.mode='done';delete input.phases.at(-1).value.training;
 assert.equal(assnRulesConfigurationReadback(input).training.status,'not_requested');
 input.phases[1].value.configuration.node_context={...node,node_id:'foreign'};
 assert.throws(()=>assnRulesConfigurationReadback(input),/configuration owner/);
});
