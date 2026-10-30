import test from 'node:test';
import assert from 'node:assert/strict';
import {slidingWindowConfigurationReadback} from '../lib/sliding-window-readback.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
function fixture(){
 const node={document_id:'d',workflow_id:'w',node_id:'n'},owner={verified:true,...node};
 const fields=[{name:'I',label:'I',type:'integer',history:1,horizon:0}];
 const sources=['I_H_1','I'].map((name,i)=>({record_id:String(i),name,label:name,type:'integer'}));
 const m={verified:true,inventory_complete:true,source_identity_verified:true,node_context:{...owner,output_port:{port:0}},source_fields:sources,target_fields:sources.map((source,index)=>({index,...source,source,excluded:false}))};
 const im={verified:true,inventory_complete:true,node_context:{...owner,input_port:{port:0}},target_fields:fields};
 const c={verified:true,inventory_complete:true,node_context:owner,fields,incomplete_records:'drop_added'};
 const phases=['input_mapping','configure','node_finish','output_mapping','finish'].map(phase=>({phase,receipt_id:'op:'+phase,status:'verified',value:{verified:true,cleanup_complete:true,
  ...(phase==='configure'?{configuration:c,validation:{status:'accepted_by_loginom_next',node_context:owner}}:{}),
  ...(['node_finish','finish'].includes(phase)?{settings_applied:true,mode:'done',node_context:owner}:{}),
  ...(phase==='input_mapping'?{native_mapping:im,finish:{settings_applied:true}}:{}),
  ...(phase==='output_mapping'?{native_mapping:m,finish:{settings_applied:true}}:{}),
 }}));
 return {node,phases,operation_id:'op'};
}
test('readback binds all five receipts to exact window/input/output ownership',()=>{
 const input=fixture(),result=slidingWindowConfigurationReadback(input);
 assert.deepEqual(result.windows,[{field:'I',history:1,horizon:0}]);assert.equal(result.output_port,0);
 assert.deepEqual(result.fields.map(f=>[f.name,f.source_field,f.offset]),[['I_H_1','I',-1],['I','I',0]]);
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration.properties.readback);
 assert.equal(validate(result).valid,true);
 for(const change of [i=>i.phases[0].value.native_mapping.node_context.node_id='foreign',i=>i.phases[2].value.settings_applied=false,i=>i.phases[3].value.native_mapping.target_fields.pop(),i=>i.phases[3].value.native_mapping.target_fields[0].type='real',i=>i.phases[1].value.configuration.fields[0].history=2,i=>i.phases[4].receipt_id='other']){
  const copy=fixture();change(copy);assert.throws(()=>slidingWindowConfigurationReadback(copy));
 }
});
