import test from 'node:test';
import assert from 'node:assert/strict';
import {variablesCalculatorConfigurationReadback} from '../lib/variables-calculator-readback.mjs';
const fixture=()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'node'},owner={...node,verified:true,surface:'wizard'};
 const configuration={verified:true,inventory_complete:true,mode:'expression',node_context:owner,
  expressions:[{index:0,name:'missing',label:'Нет значения',type:'integer',formula:'NULL',description:'',intermediate:false,record_id:'r0',expression_id:'0'}]};
 const phase=(phase,value)=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,cleanup_complete:true,...value}});
 const phases=[phase('configure',{configuration,syntax_validation:{status:'accepted_by_loginom_next',node_context:owner}}),
  phase('finish',{mode:'execute',settings_applied:true,node_context:{...owner,surface:'graph'}})];
 return {node,operation_id:'op',phases};
};
test('configuration readback projects verified native settings without claiming output values or persistence',()=>{
 const r=variablesCalculatorConfigurationReadback(fixture());assert.equal(r.kind,'variables_calculator');
 assert.equal(r.expressions[0].formula,'NULL');assert.equal(r.expressions[0].type,'integer');
 assert.equal(r.package_persistence_verified,false);assert.equal(Object.hasOwn(r,'values'),false);
 assert.equal(Object.hasOwn(r.expressions[0],'record_id'),false);
});
test('missing or repeated receipts, foreign owners, missing syntax confirmation and incomplete inventory refuse',()=>{
 for(const mutate of [f=>f.phases.pop(),f=>f.phases.push(f.phases[0]),f=>f.phases[0].status='pending',
  f=>f.phases[0].receipt_id='wrong',f=>f.phases[0].value.cleanup_complete=false,
  f=>f.phases[0].value.configuration.node_context.node_id='foreign',
  f=>f.phases[0].value.configuration.inventory_complete=false,
  f=>f.phases[0].value.configuration.expressions[0].index=1,
  f=>f.phases[0].value.configuration.expressions[0].type='variant',
  f=>f.phases[0].value.configuration.expressions.push({...f.phases[0].value.configuration.expressions[0],index:1}),
  f=>f.phases[0].value.syntax_validation.status='unverified',f=>f.phases[1].value.settings_applied=false,
  f=>f.phases[1].value.node_context.node_id='foreign']){
  const f=fixture();mutate(f);assert.throws(()=>variablesCalculatorConfigurationReadback(f));
 }
});
