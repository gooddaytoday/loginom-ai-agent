import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {javascriptBridgeProbe,javascriptBridgeMetadata,javascriptBridgeObservation} from './javascript-bridge-probe.mjs';
import {inspectJavascriptModulePolicy} from '../../client/lib/javascript-module-policy.mjs';

function fixture() {
  const probe=javascriptBridgeProbe(),node={document_id:'doc',workflow_id:'flow',node_id:'js'};
  const types={integer:4,string:5};
  const fields=probe.schema.map((field,index)=>({...field,index,record_id:'source-'+index,field_id:String(index),required:true}));
  const columns=fields.map(field=>({index:field.index,name:field.name,display_name:field.label,data_type:types[field.type]}));
  const value=row=>({version:1,probe_id:probe.id,column_count:5,row,before:structuredClone(columns),after:structuredClone(columns)});
  const after={verified:true,source_identity_verified:true,inventory_complete:true,state_source:'cached_mapping_stores',
    autosync:true,settings_applied:false,package_saved:false,
    node_context:{...node,verified:true,surface:'wizard',tid:'MF;TF-1;WizrdMCF',output_port:{direction:'output',port:0,port_guid:'port'}},
    source_fields:fields,target_fields:fields.map((field,index)=>({...field,record_id:'target-'+index,excluded:false,source:structuredClone(field)}))};
  const table={schema:structuredClone(probe.schema),row_count:6,sample_rows:6,sample_complete:true,
    physical_output:{port_index:0,table_ref:{port_guid:'port',view_guid:'view',table_tid:'table'}},
    sample:Array.from({length:6},(_,row)=>[...Array.from({length:4},()=>({})),
      {type:'string',is_null:false,value:JSON.stringify(value(row)),precision:'display_text'}])};
  return {node,probe,before:structuredClone(after),after,table,value};
}

test('G3 source contains computed business logic and observed metadata, no expected monetary cells',()=>{
  const probe=javascriptBridgeProbe();
  assert.equal(inspectJavascriptModulePolicy(probe.source).status,'ADMITTED');
  assert.equal(probe.source_sha256,createHash('sha256').update(probe.source).digest('hex'));
  assert.equal(probe.source.includes('OutputTable.GetColumn(index)'),true);
  assert.equal(probe.expected,null);assert.equal(probe.schema.length,5);
  assert.equal(probe.source.includes('1800'),false);assert.equal(probe.source.includes('1950'),false);
  probe.schema[0].name='changed';assert.equal(javascriptBridgeProbe().schema[0].name,'RowID');
});

test('G3 compares observed logical/source/physical metadata and keeps byte/aggregate gates open',()=>{
  const result=javascriptBridgeObservation(fixture());
  assert.equal(result.bridge_verified,true);assert.equal(result.generated_logical_schema_observed,true);
  assert.equal(result.native_bytes_verified,false);assert.deepEqual(result.gates_closed,[]);
});

for(const [name,change] of Object.entries({
  label:f=>{f.after.source_fields[0].label='different';},
  link:f=>{f.after.target_fields[0].source.record_id='foreign';},
  physical:f=>{f.table.schema[0].name='Normalized0';},
  logical:f=>{f.table.sample[0][4].value=JSON.stringify({...f.value(0),after:f.value(0).after.map((column,index)=>index===0?{...column,name:'logical-only'}:column)});},
}))test('G3 preserves observed difference: '+name,()=>{
  const f=fixture();change(f);assert.equal(javascriptBridgeObservation(f).bridge_verified,false);
});

for(const [name,change] of Object.entries({
  row:value=>{value.row=5;},column_count:value=>{value.column_count=4;},extra:value=>{value.extra=true;},
  type:value=>{value.before[0].data_type=99;},index:value=>{value.after[0].index=1;},
  column_extra:value=>{value.after[0].extra=true;},name:value=>{value.before[0].name='x'.repeat(129);},
}))test('G3 metadata rejects '+name,()=>{
  const value=fixture().value(0);change(value);assert.throws(()=>javascriptBridgeMetadata(JSON.stringify(value),0));
});

test('G3 canonical telemetry rejects duplicate keys, truncation and changed native port',()=>{
  const f=fixture(),text=JSON.stringify(f.value(0));
  for(const invalid of [text.slice(0,-1),text.replace('"version":1','"version":9,"version":1'),' '+text])
    assert.throws(()=>javascriptBridgeMetadata(invalid,0));
  f.table.physical_output.table_ref.port_guid='foreign';assert.throws(()=>javascriptBridgeObservation(f));
});
