import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothingConfigurationReadback} from '../lib/smoothing-readback.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
function fixture(){
 const node={document_id:'d',workflow_id:'w',node_id:'n'},owner={verified:true,...node};
 const fields=[{name:'I',label:'I',type:'integer',used:true,lambda:1,period:6,strength:'lambda'}];
 const sources=['I_S','I'].map((name,i)=>({record_id:String(i),name,label:name,type:i===0?'real':'integer'}));
 const m={verified:true,inventory_complete:true,source_identity_verified:true,node_context:{...owner,output_port:{port:0}},source_fields:sources,target_fields:sources.map((source,index)=>({index,...source,source,excluded:false}))};
 const im={verified:true,inventory_complete:true,node_context:{...owner,input_port:{port:0}},target_fields:fields};
 const c={verified:true,inventory_complete:true,node_context:owner,fields,input_fields:fields.map(({name,label,type})=>({name,label,type}))};
 const phases=['input_mapping','configure','node_finish','output_mapping','finish'].map(phase=>({phase,receipt_id:'op:'+phase,status:'verified',value:{verified:true,cleanup_complete:true,
  ...(phase==='configure'?{configuration:c,validation:{status:'accepted_by_loginom_next',node_context:owner}}:{}),
  ...(['node_finish','finish'].includes(phase)?{settings_applied:true,mode:'done',node_context:owner}:{}),
  ...(phase==='input_mapping'?{native_mapping:im,finish:{settings_applied:true}}:{}),
  ...(phase==='output_mapping'?{native_mapping:m,finish:{settings_applied:true}}:{}),
 }}));
 return {node,phases,operation_id:'op'};
}
test('readback binds all five receipts to exact smoothing/input/output ownership',()=>{
 const input=fixture(),result=smoothingConfigurationReadback(input);
 assert.deepEqual(result.smoothing,[{field:'I',lambda:1,period:6,strength:'lambda'}]);assert.equal(result.output_port,0);
 assert.deepEqual(result.fields.map(f=>[f.name,f.source_field,f.smoothed]),[['I_S','I',true],['I','I',false]]);
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration.properties.readback);
 assert.equal(validate(result).valid,true);
 for(const change of [i=>i.phases[0].value.native_mapping.node_context.node_id='foreign',i=>i.phases[2].value.settings_applied=false,i=>i.phases[3].value.native_mapping.target_fields.pop(),i=>i.phases[3].value.native_mapping.target_fields[0].type='integer',i=>i.phases[1].value.configuration.fields[0].used=false,i=>i.phases[4].receipt_id='other']){
  const copy=fixture();change(copy);assert.throws(()=>smoothingConfigurationReadback(copy));
 }
});
