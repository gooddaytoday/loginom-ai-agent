import test from 'node:test';
import assert from 'node:assert/strict';
import {javascriptDiscoveryProbe,javascriptDiscoveryOracle} from './javascript-discovery-probes.mjs';
import {javascriptMaterializationObservation} from './javascript-materialization-observation.mjs';

function fixture() {
  const probe=javascriptDiscoveryProbe('c0-code-materialization');
  const node={document_id:'doc',workflow_id:'flow',node_id:'js'};
  const source=probe.schema.map((field,index)=>({...field,index,record_id:'source-'+index,field_id:String(index),required:false}));
  const mapping={verified:true,source_identity_verified:true,inventory_complete:true,
    state_source:'cached_mapping_stores',autosync:true,settings_applied:false,package_saved:false,
    node_context:{...node,verified:true,surface:'wizard',tid:'MF;TF-1;WizrdMCF',
      output_port:{direction:'output',port:0,port_guid:'physical-port'}},
    source_fields:source,target_fields:source.map((field,index)=>({...field,record_id:'target-'+index,source:structuredClone(field),excluded:false}))};
  const table={schema:structuredClone(probe.schema),row_count:6,sample_rows:6,sample_complete:true,
    filter_enabled:false,precision:{numbers_verified:true,limitations:[]},
    physical_output:{port_index:0,table_ref:{port_guid:'physical-port',view_guid:'view',table_tid:'table'}},
    sample:probe.expected.map(row=>row.map((value,index)=>({type:probe.schema[index].type,is_null:false,value,
      precision:probe.schema[index].type==='integer'?'exact_integer':'display_text'})))};
  return {node,before:structuredClone(mapping),after:mapping,table,probe};
}

test('C0 uses unchanged business source/oracle and never infers logical lineage',()=>{
  const f=fixture(),base=javascriptDiscoveryProbe('p1-business-code-base');
  assert.equal(f.probe.source_sha256,base.source_sha256);
  assert.equal(f.probe.oracle_sha256,base.oracle_sha256);
  assert.equal(javascriptDiscoveryOracle(f.probe,f.table).gate_passed,true);
  const result=javascriptMaterializationObservation(f);
  assert.equal(result.status,'materialized');assert.equal(result.mapping_links_verified,true);
  assert.equal(result.mapping_target_table_schema_matched,true);
  assert.equal(result.bridge_verified,false);assert.deepEqual(result.gates_closed,[]);
});

for(const [name,change] of Object.entries({
  owner:f=>f.after.node_context.node_id='foreign',
  direction:f=>f.after.node_context.output_port.direction='input',
  port:f=>f.after.node_context.output_port.port_guid='foreign',
  physical_port:f=>f.table.physical_output.table_ref.port_guid='foreign',
  partial:f=>f.after.inventory_complete=false,
  source_pending_without_proof:f=>{f.after.verified=false;f.after.configured_inventory_verified=true;f.after.reason='mapping_source_pending';},
}))test('C0 rejects '+name,()=>{const f=fixture();change(f);assert.throws(()=>javascriptMaterializationObservation(f));});

for(const [name,change] of Object.entries({
  record:f=>f.after.target_fields[0].source.record_id='foreign',
  field_id:f=>f.after.target_fields[0].source.field_id='foreign',
  duplicate:f=>f.after.source_fields.push(structuredClone(f.after.source_fields[0])),
  schema:f=>f.table.schema[0].type='real',
}))test('C0 records unmatched '+name+' without promoting bridge',()=>{
  const f=fixture();change(f);const result=javascriptMaterializationObservation(f);
  assert.equal(result.mapping_target_table_schema_matched,false);assert.equal(result.bridge_verified,false);
});
