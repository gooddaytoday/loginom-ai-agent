import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {elimOutlierConfigurationReadback} from '../lib/elim-outlier-readback.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
const node={document_id:'doc',workflow_id:'wf',node_id:'outlier'},owner={...node,verified:true};
function fixture(){
 const schema=[{name:'X',label:'Value',type:'real',data_kind:'Непрерывный'}];
 const fields=[{name:'X',used:true,settings:{method:'sd',outlier_factor:1,extreme_factor:3,outlier_policy:'keep',extreme_policy:'keep'}}];
 const values={input_mapping:{},configure:{configuration:{verified:true,inventory_complete:true,node_context:owner,fields:schema,field_settings:fields,ordered:false},validation:{status:'accepted_by_loginom_next',node_context:owner}},node_finish:{settings_applied:true,node_context:owner},output_mapping:{ports:[0,1,2].map(port=>({port,schema}))},finish:{mode:'execute',execution_id:'execute',settings_applied:true,node_context:owner,training:{status:'trained',node,execution_id:'train',source:[{node:{...node,node_id:'input'},input:0,output:0}]}}};
 return {node,operation_id:'op',phases:Object.entries(values).map(([phase,value])=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,cleanup_complete:true,...structuredClone(value)}}))};
}
test('readback binds complete keep settings and all three schemas to independent Train/Execute receipts',()=>{
 const readback=elimOutlierConfigurationReadback(fixture());
 assert.equal(readback.training_basis,'current_input');assert.deepEqual(readback.output_mappings.map(p=>p.port),[0,1,2]);assert.equal(readback.package_persistence_verified,false);
 const schema=nodeApplyResultSchema.properties.configuration.properties.readback;
 // Exercise the published union, independently of the handler's return value.
 const union=JSON.stringify(nodeApplyResultSchema).includes('elim_outlier');assert.equal(union,true);
 const validator=new AjvJsonSchemaValidator().getValidator(schema);
 assert.equal(validator(readback).valid,true);
});
test('readback refuses lost receipts, changed owner, clipping, untrained execution and missing port',()=>{
 for(const change of [f=>f.phases.pop(),f=>f.phases[1].value.configuration.node_context.node_id='foreign',f=>f.phases[1].value.configuration.field_settings[0].settings.extreme_policy='clip',f=>f.phases[4].value.training.status='not_requested',f=>f.phases[4].value.training.execution_id='execute',f=>f.phases[3].value.ports.pop(),f=>f.phases[0].value.cleanup_complete=false,f=>f.phases[1].receipt_id='foreign']){const f=fixture();change(f);assert.throws(()=>elimOutlierConfigurationReadback(f));}
});
