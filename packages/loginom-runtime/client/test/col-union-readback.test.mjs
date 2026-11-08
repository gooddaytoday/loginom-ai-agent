import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {colUnionConfigurationReadback} from '../lib/col-union-readback.mjs';
function fixture(count=2){
 const node={document_id:'doc',workflow_id:'flow',node_id:'node'},context={verified:true,...node};
 const source=(name,id)=>({record_id:id,index:0,name,label:'Code',type:'string',data_kind:'Дискретный'});
 const fields=Array.from({length:count},(_,i)=>source(i?'Code_'+i:'Code','s'+i));
 const ports=fields.map((f,port)=>{const input=source('Code','input'+port);return {port,native_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,node_context:{...context,input_port:{port,port_guid:'guid'+port}},source_fields:[input],target_fields:[{...input,source:input}],autosync:true},finish:{settings_applied:true,mode:'done',node_context:context}};});
 const configuration={verified:true,inventory_complete:true,binding_ready:true,node_context:context,input_fields:ports.map(p=>p.native_mapping.target_fields),sources:fields.map((_,port)=>port).map(port=>({port_guid:'guid'+port})),settings:{row_count:'maximum',padding:'repeat'}};
 const native_mapping={verified:true,inventory_complete:true,source_identity_verified:true,node_context:{...context,output_port:{port:0}},source_fields:fields,target_fields:fields.map((f,index)=>({...f,index,source:f,excluded:false})),autosync:false};
 const values=[{ports},{configuration,validation:{status:'accepted_by_loginom_next',node_context:context}},{settings_applied:true,mode:'done',node_context:context},{native_mapping,finish:{settings_applied:true,mode:'done',node_context:context}},{settings_applied:true,mode:'execute',node_context:context}];
 return {node,operation_id:'op',phases:['input_mapping','configure','node_finish','output_mapping','finish'].map((phase,i)=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,cleanup_complete:true,...values[i]}}))};
}
test('positional readback binds both same-label columns to all five owned phase receipts',()=>{const r=colUnionConfigurationReadback(fixture());assert.equal(r.kind,'col_union');assert.deepEqual(r.output_mapping.fields.map(f=>f.name),['Code','Code_1']);assert.equal(r.package_persistence_verified,false);});
test('positional readback refuses wrong source GUID, lost fields, foreign owners and missing receipts',()=>{
 for(const change of [f=>f.phases[0].value.ports[1].native_mapping.node_context.input_port.port_guid='foreign',f=>f.phases[3].value.native_mapping.source_fields.pop(),f=>f.phases[1].value.configuration.node_context={verified:true,document_id:'foreign'},f=>f.phases.pop(),f=>f.phases[3].value.native_mapping.target_fields[1].source=f.phases[3].value.native_mapping.target_fields[0].source]){const f=fixture();change(f);assert.throws(()=>colUnionConfigurationReadback(f));}
});

test('positional readback proves all three mappings and refuses a missing third input receipt',()=>{
 const f=fixture(3),r=colUnionConfigurationReadback(f);assert.equal(r.input_mappings.length,3);assert.equal(r.output_mapping.fields.length,3);
 f.phases[0].value.ports.pop();assert.throws(()=>colUnionConfigurationReadback(f));
});

test('production result schema accepts third-port readback and its determining selector',()=>{
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema);
 const readback=colUnionConfigurationReadback(fixture(3));readback.settings={row_count:'input',padding:'repeat',determining_input:'third'};
 const result={operation_id:'op',status:'SUCCEEDED',effect_possible:true,phases:[],node:readback.node,execution:{status:'not_requested',execution_id:null},output:{status:'not_refreshed',evidence_ref:null,ports:[]},configuration:{status:'applied',readback},package_saved:false,cleanup_complete:true,warnings:[]};
 assert.equal(validate(result).valid,true);
 readback.input_mappings[2].port=3;assert.equal(validate(result).valid,false);
});
