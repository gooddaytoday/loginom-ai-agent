import test from 'node:test';import assert from 'node:assert/strict';
import {unionConfigurationReadback} from '../lib/union-readback.mjs';
function fixture(){
 const node={document_id:'document',workflow_id:'workflow',node_id:'union'},owner={...node,verified:true};
 const input_fields=[['Key','Left'],['Id','Right']].map(ns=>ns.map((name,i)=>({name,label:name,type:'string',record_id:name,field_id:String(i),index:i})));
 const mapping=(source_fields,direction,port)=>({verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,node_context:{...owner,[direction+'_port']:{port}},source_fields,
  target_fields:source_fields.map((f,i)=>({...f,index:i,record_id:'t'+f.record_id,data_kind:'Дискретный',excluded:false,source:f}))});
 const finish={settings_applied:true,mode:'done',node_context:owner};
 const c={verified:true,inventory_complete:true,node_context:owner,input_fields,prefixes:{enabled:false,name:'Union',label:'Объединение'},mappings:[{port:1,pairs:[{main:'Key',source:'Id'}],unmatched:['Right']}]};
 const values={input_mapping:{ports:input_fields.map((fs,port)=>({port,native_mapping:mapping(fs,'input',port),finish}))},configure:{configuration:c,validation:{status:'accepted_by_loginom_next',node_context:owner}},node_finish:finish,
 output_mapping:{native_mapping:mapping([...input_fields[0],input_fields[1][1]],'output',0),finish},finish};
 const phases=Object.entries(values).map(([phase,value])=>({phase,receipt_id:'op:'+phase,status:'verified',value:{...value,verified:true,cleanup_complete:true}}));
 return {node,phases,operation_id:'op'};
}
test('Union readback binds two inputs, complete output and exact receipts',()=>{const r=unionConfigurationReadback(fixture());assert.equal(r.kind,'union');assert.equal(r.input_mappings.length,2);assert.deepEqual(r.output_mapping.fields.map(f=>f.name),['Key','Left','Right']);assert.equal(r.package_persistence_verified,false);});
test('Union readback rejects foreign or partial inputs, incomplete output and invented flags',()=>{
 for(const change of [f=>f.phases[0].value.ports[1].port=0,f=>f.phases[0].value.ports[1].native_mapping.node_context.node_id='foreign',f=>f.phases[0].value.ports[1].native_mapping.source_identity_verified=false,f=>f.phases[0].value.ports.pop(),f=>delete f.phases[1].value.configuration.prefixes.enabled,f=>f.phases[3].value.native_mapping.target_fields.pop(),f=>f.phases[3].value.finish={settings_applied:true,mode:'done',node_context:{}},f=>f.phases[4].receipt_id='other']){
  const f=fixture();change(f);assert.throws(()=>unionConfigurationReadback(f));
 }
});
test('Union readback registers its exact public schema',async()=>{const {validateActionParameters}=await import('../lib/action-catalog.mjs');const {nodeApplyResultSchema}=await import('../lib/node-result-schema.mjs');const schema=nodeApplyResultSchema.properties.configuration.properties.readback;const r=unionConfigurationReadback(fixture());assert.doesNotThrow(()=>validateActionParameters(schema,r));});
