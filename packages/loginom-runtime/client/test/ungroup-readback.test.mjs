import test from 'node:test';import assert from 'node:assert/strict';
import {ungroupConfigurationReadback} from '../lib/ungroup-readback.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema);
function fixture(){
 const node={document_id:'document',workflow_id:'workflow',node_id:'join'},owner={...node,verified:true};
 const input_fields=[['Group','Total'],['Group','Item','Share']].map(ns=>ns.map((name,i)=>({name,label:name,type:['Total','Share'].includes(name)?'real':'string',record_id:name,field_id:String(i),index:i})));
 const mapping=(source_fields,direction,port)=>({verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,node_context:{...owner,[direction+'_port']:{port}},source_fields,
  target_fields:source_fields.map((f,i)=>({...f,index:i,record_id:'t'+f.record_id,data_kind:'Дискретный',excluded:false,source:f}))});
 const finish={settings_applied:true,mode:'done',node_context:owner};
 const c={verified:true,inventory_complete:true,node_context:owner,input_fields,method:'shares',ungroup:{keys:[{total:'Group',support:'Group'}],value_fields:['Total'],item_fields:['Item'],share_fields:['Share'],rounding:{format:'none'},balance:'none'}};
 const values={input_mapping:{ports:input_fields.map((fs,port)=>({port,native_mapping:mapping(fs,'input',port),finish}))},configure:{configuration:c,keys:[{left:'Key',right:'Id'}],validation:{status:'accepted_by_loginom_next',node_context:owner}},node_finish:finish,
 output_mapping:{native_mapping:mapping([...input_fields[0],{name:'Total_Rounded',label:'Rounded',type:'real',record_id:'rounded'},input_fields[1][1],{name:'OutputValue',label:'Result',type:'real',record_id:'result'}],'output',0),finish},finish};
 const phases=Object.entries(values).map(([phase,value])=>({phase,receipt_id:'op:'+phase,status:'verified',value:{...value,verified:true,cleanup_complete:true}}));
 return {node,phases,operation_id:'op'};
}
test('Ungroup readback binds two inputs, complete output and exact receipts',()=>{const r=ungroupConfigurationReadback(fixture());assert.equal(r.kind,'ungroup');assert.equal(r.input_mappings.length,2);assert.deepEqual(r.output_mapping.fields.map(f=>f.name),['Group','Total','Total_Rounded','Item','OutputValue']);assert.equal(r.package_persistence_verified,false);});
test('Ungroup readback rejects foreign or partial inputs, incomplete output and invented flags',()=>{
 for(const change of [f=>f.phases[0].value.ports[1].port=0,f=>f.phases[0].value.ports[1].native_mapping.node_context.node_id='foreign',f=>f.phases[0].value.ports[1].native_mapping.source_identity_verified=false,f=>f.phases[0].value.ports.pop(),f=>f.phases[1].value.configuration.method='computed',f=>f.phases[3].value.native_mapping.target_fields.pop(),f=>f.phases[3].value.finish={settings_applied:true,mode:'done',node_context:{}},f=>f.phases[4].receipt_id='other']){
  const f=fixture();change(f);assert.throws(()=>ungroupConfigurationReadback(f));
 }
});
test('Ungroup readback fits the registered result schema',()=>{
 const f=fixture(),r=ungroupConfigurationReadback(f);
 const result=validate({operation_id:'op',status:'SUCCEEDED',effect_possible:true,phases:[],node:f.node,
 execution:{status:'not_requested',execution_id:null},output:{status:'not_refreshed',evidence_ref:null,ports:[]},
 package_saved:false,cleanup_complete:true,warnings:[],configuration:{status:'applied',readback:r}});
 assert.equal(result.valid,true,JSON.stringify(result));
});
