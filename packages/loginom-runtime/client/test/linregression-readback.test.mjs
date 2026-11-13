import test from 'node:test';
import assert from 'node:assert/strict';
import {linRegressionConfigurationReadback} from '../lib/linregression-readback.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
const node={document_id:'doc',workflow_id:'workflow',node_id:'regression'};
test('sequential partition readback retains observed row counts in the additive result schema',()=>{
 const input=candidate(),partition={method:'sequential',train_count:16,test_count:2};
 input.phases[1].value.configuration.partition=partition;
 const result=linRegressionConfigurationReadback(input);
 assert.deepEqual(result.partition,partition);
 const validator=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration.properties.readback);
 assert.equal(validator(result).valid,true);
 partition.test_count=3;assert.equal(result.partition.test_count,2);
 assert.equal(validator({...result,partition:{...result.partition,method:'random'}}).valid,false);
});
function candidate(){
 const values={input_mapping:{},configure:{configuration:{verified:true,node_context:node,fields:[{name:'RowID',usage_type:0},{name:'X',usage_type:3},{name:'Y',usage_type:4}],target_field:'Y',intercept:true},validation:{status:'accepted_by_loginom_next'}},node_finish:{settings_applied:true},output_mapping:{},finish:{settings_applied:true,mode:'execute',execution_id:'execute-2',training:{status:'trained',node,execution_id:'train-1',source:[{node:{...node,node_id:'import'},output:0,input:0}]}}};
 return {node,operation_id:'operation',phases:Object.entries(values).map(([phase,value])=>({phase,status:'verified',receipt_id:'operation:'+phase,value:{verified:true,cleanup_complete:true,...value}}))};
}
test('readback distinguishes native training from subsequent execution and names its input',()=>{
 const result=linRegressionConfigurationReadback(candidate());
 assert.deepEqual(result.input_fields,['X']);assert.equal(result.target_field,'Y');assert.equal(result.intercept,true);
 assert.equal(result.training.status,'trained');assert.equal(result.training.source[0].node.node_id,'import');
 assert.equal(result.training.execution_id,'train-1');assert.equal(result.normalization,'none');
});
test('ordinary execution alone cannot claim a trained model',()=>{
 for(const alter of [v=>delete v.training,v=>v.training.execution_id=v.execution_id,v=>v.training.source=[]]){
  const input=candidate();alter(input.phases.at(-1).value);
  assert.throws(()=>linRegressionConfigurationReadback(input),/training on the connected source/);
 }
});
test('apply reports preserved settings and never claims a new training execution',()=>{
 const input=candidate();input.phases[1].value.configuration.mode='apply';
 Object.assign(input.phases[2].value,{settings_applied:false,draft_discarded:true});
 input.phases.at(-1).value.settings_applied=false;
 delete input.phases.at(-1).value.training;
 const result=linRegressionConfigurationReadback(input);
 assert.equal(result.mode,'apply');assert.equal(result.training.status,'not_requested');
 input.phases.at(-1).value.training={status:'trained'};
 assert.throws(()=>linRegressionConfigurationReadback(input),/apply must never train/);
});
test('Done commits settings without claiming training and foreign settings refuse',()=>{
 const input=candidate();input.phases.at(-1).value.mode='done';delete input.phases.at(-1).value.training;
 assert.equal(linRegressionConfigurationReadback(input).training.status,'not_requested');
 input.phases[1].value.configuration.node_context={...node,node_id:'foreign'};
 assert.throws(()=>linRegressionConfigurationReadback(input),/configuration owner/);
});

test('Ridge readback reports observed manual lambda without aliasing configuration',()=>{
 const input=candidate(),configuration=input.phases[1].value.configuration;
 Object.assign(configuration,{mode:'ridge',regularization:{setup:'manual',lambda_l2:1},epsilon:1e-10});
 const result=linRegressionConfigurationReadback(input);
 assert.equal(result.mode,'ridge');assert.deepEqual(result.regularization,{setup:'manual',lambda_l2:1});
 assert.equal(result.epsilon,1e-10);assert.equal(result.training.status,'trained');
 configuration.regularization.lambda_l2=2;assert.equal(result.regularization.lambda_l2,1);
});
test('Elastic Net readback confirms method, both lambdas and fixed internal epsilon',()=>{
 const input=candidate(),c=input.phases[1].value.configuration;
 Object.assign(c,{mode:'elastic',regularization:{setup:'manual',lambda_l1:1,lambda_l2:3},epsilon:1e-12});
 const result=linRegressionConfigurationReadback(input);
 assert.equal(result.mode,'elastic');assert.equal(result.epsilon,1e-12);
 assert.deepEqual(result.regularization,{setup:'manual',lambda_l1:1,lambda_l2:3});
 const validator=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration.properties.readback);
 assert.equal(validator(result).valid,true);
 assert.equal(validator({...result,epsilon:1e-10}).valid,false);
 assert.equal(validator({...result,regularization:{setup:'manual',lambda_l1:1}}).valid,false);
 c.regularization.lambda_l2=4;assert.equal(result.regularization.lambda_l2,3);
});
test('Enter readback reports the requested coefficient statistics and observed confidence level',()=>{
 const input=candidate(),configuration=input.phases[1].value.configuration;
 assert.equal(linRegressionConfigurationReadback(input).statistics,'coefficients');
 Object.assign(configuration,{statistics:'full',confidence_level:95});
 const result=linRegressionConfigurationReadback(input);
 assert.equal(result.statistics,'full');assert.equal(result.confidence_level,95);
 const validator=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration.properties.readback);
 assert.equal(validator(result).valid,true);assert.equal(validator(linRegressionConfigurationReadback(candidate())).valid,true);
 assert.equal(validator({...result,statistics:'all'}).valid,false);
 Object.assign(configuration,{mode:'ridge',regularization:{setup:'manual',lambda_l2:1},epsilon:1e-10});
 assert.equal(linRegressionConfigurationReadback(input).statistics,undefined);
});
