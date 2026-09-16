import test from 'node:test';import assert from 'node:assert/strict';
import {collapseConfigurationReadback} from '../lib/collapse-readback.mjs';
function fixture(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'n'},owner={...node,verified:true};
 const inputs=[{name:'Id',label:'Id',type:'integer'},{name:'A',label:'Amount',type:'real'}];
 const sources=[inputs[0],{name:'Names',label:'Имена',type:'string'},{name:'DisplayNames',label:'Метки',type:'string'},{name:'Values',label:'Значения',type:'variant'},{name:'DataTypes',label:'Типы данных',type:'integer'}];
 const mapping=(fields,direction)=>{const fs=fields.map((f,index)=>({...f,index,record_id:'s'+index,field_id:String(index)}));return {verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,node_context:{...owner,[direction+'_port']:{port:0}},source_fields:fs,target_fields:fs.map((f,index)=>({...f,index,record_id:'t'+index,source:f,excluded:false,data_kind:'Дискретный'}))};};
 const finish={settings_applied:true,mode:'done',node_context:owner};
 const configuration={verified:true,inventory_complete:true,node_context:owner,input_fields:inputs,information:[{...inputs[0],order:0}],transposed:[{...inputs[1],order:0}],skip_null:{value:false,switch_pressed:false}};
 const values={input_mapping:{native_mapping:mapping(inputs,'input'),finish},configure:{configuration,validation:{status:'accepted_by_loginom_next',node_context:owner}},node_finish:finish,output_mapping:{native_mapping:mapping(sources,'output'),finish},finish};
 return {node,operation_id:'op',phases:Object.entries(values).map(([phase,value])=>({phase,receipt_id:'op:'+phase,status:'verified',value:{...value,verified:true,cleanup_complete:true}}))};
}
test('collapse readback binds roles, output sources and five owned finished phases',async()=>{
 const f=fixture(),r=collapseConfigurationReadback(f);assert.equal(r.kind,'collapse');assert.equal(r.ignore_empty,false);assert.equal(r.transposed[0].name,'A');assert.equal(r.output_mapping.fields[3].type,'variant');assert.equal(r.package_persistence_verified,false);
 const {validateActionParameters}=await import('../lib/action-catalog.mjs');const {nodeApplyResultSchema}=await import('../lib/node-result-schema.mjs');assert.doesNotThrow(()=>validateActionParameters(nodeApplyResultSchema.properties.configuration.properties.readback,r));
});
test('collapse readback refuses foreign owners, unfinished receipts and incomplete output coverage',()=>{
 for(const change of [f=>f.phases[0].value.finish={settings_applied:true,node_context:{}},f=>f.phases[3].value.finish={settings_applied:true,node_context:{}},f=>f.phases[1].value.configuration.node_context={verified:true,node_id:'other'},f=>f.phases[4].receipt_id='other',f=>f.phases[3].value.native_mapping.target_fields.pop(),f=>f.phases[0].value.native_mapping.target_fields[0].name='Wrong',f=>f.phases[1].value.validation.status='not_validated']){const f=fixture();change(f);assert.throws(()=>collapseConfigurationReadback(f));}
});
