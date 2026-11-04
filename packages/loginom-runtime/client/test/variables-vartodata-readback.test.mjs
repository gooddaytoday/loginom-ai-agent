import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {variablesToTableConfigurationReadback} from '../lib/variables-vartodata-readback.mjs';
const variables=JSON.parse(readFileSync(new URL('../../../../docs/node-development/nodes/variables-vartodata/fixtures/variables.json',import.meta.url)));
function fixture(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'n'},owner={...node,verified:true,surface:'wizard'};
 const sources=variables.map(({name,label,type},i)=>({record_id:'source-'+i,index:i,name,label,type,data_kind:type==='string'?'discrete':'continuous'}));
 const mapping={verified:true,inventory_complete:true,source_identity_verified:true,node_context:{...owner,output_port:{port:0}},autosync:true,
  source_fields:sources,target_fields:sources.map((s,index)=>({...s,record_id:'target-'+index,excluded:false,source:s}))};
 const finish={verified:true,cleanup_complete:true,settings_applied:true,mode:'done',node_context:owner};
 const values={configure:{configuration:{verified:true,inventory_complete:true,node_context:owner,mode:'columns'},validation:{status:'accepted_by_loginom_next',node_context:owner}},
  node_finish:finish,output_mapping:{native_mapping:mapping,finish},finish:{...finish,mode:'execute'}};
 const phases=Object.entries(values).map(([phase,value])=>({phase,receipt_id:'op:'+phase,status:'verified',value:Object.assign(value,{verified:true,cleanup_complete:true})}));
 return {node,operation_id:'op',phases,mapping,values,run(){return variablesToTableConfigurationReadback(this);}};
}
test('configuration readback retains mode and complete native output metadata in fixture order without copying values',()=>{
 const f=fixture(),r=f.run();assert.equal(r.mode,'columns');assert.equal(r.package_persistence_verified,false);
 assert.deepEqual(r.output_mapping.fields.map(({name,label,type})=>({name,label,type})),variables.map(({name,label,type})=>({name,label,type})));
 assert.equal(JSON.stringify(r).includes('Привет'),false);assert.equal(r.receipt_ids.length,4);
});
test('a requested orientation, draft or partial receipt cannot stand in for observed committed settings',()=>{
 for(const change of [f=>f.values.configure.configuration.mode='rows',f=>f.values.configure.configuration.verified=false,
  f=>f.values.configure.configuration.inventory_complete=false,f=>f.values.configure.validation.status='requested',
  f=>f.values.node_finish.settings_applied=false,f=>f.values.output_mapping.finish.settings_applied=false,
  f=>f.values.finish.mode='close',f=>f.phases[0].status='pending',f=>f.phases.push(f.phases[0]),
  f=>f.phases[0].receipt_id='foreign:configure',f=>f.phases[0].value.cleanup_complete=false]){
  const f=fixture();change(f);awaitFailure(f);
 }
});
function awaitFailure(f){assert.throws(()=>f.run());}
test('mapping source identity, ownership, scalar types and complete unique fields must be independently observed',()=>{
 for(const change of [f=>f.mapping.node_context.node_id='other',f=>f.mapping.node_context.output_port.port=1,
  f=>f.mapping.inventory_complete=false,f=>f.mapping.source_identity_verified=false,
  f=>f.mapping.source_fields.pop(),f=>f.mapping.target_fields[0].source={...f.mapping.source_fields[0],record_id:'foreign'},
  f=>f.mapping.target_fields[1].source=f.mapping.source_fields[0],f=>f.mapping.target_fields[0].index=2,
  f=>f.mapping.source_fields[0].type='variant',f=>f.mapping.target_fields[0].type='string']){
  const f=fixture();change(f);assert.throws(()=>f.run());
 }
});
test('the real committed readback fits its public result schema without claiming package persistence',()=>{
 const f=fixture(),validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema);
 const result={operation_id:'op',status:'SUCCEEDED',effect_possible:true,phases:[],node:f.node,execution:{status:'not_requested',execution_id:null},
  output:{status:'not_refreshed',evidence_ref:null},package_saved:false,cleanup_complete:true,warnings:[],configuration:{status:'applied',readback:f.run()}};
 assert.equal(validate(result).valid,true);
 for(const change of [r=>r.configuration.readback.mode='rows',r=>r.configuration.readback.package_persistence_verified=true,
  r=>r.configuration.readback.receipt_ids.pop(),r=>delete r.configuration.readback.output_mapping.fields[0].source_name]){
  const invalid=structuredClone(result);change(invalid);assert.equal(validate(invalid).valid,false);
 }
});
