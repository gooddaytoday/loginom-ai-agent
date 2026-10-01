import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {javascriptColumnNameIds,javascriptColumnNameProbes,verifyJavascriptPublicColumnNames} from './javascript-column-names.mjs';
import {javascriptPublicCodeProbe,javascriptPublicCodeOracle} from './javascript-public-code-live.mjs';
import {javascriptCodeReadback} from '../../client/lib/javascript-code-node.mjs';

function fixture(id) {
  const probe=javascriptPublicCodeProbe(id,'code'),node={document_id:'doc',workflow_id:'flow',node_id:'js'};
  const schema=probe.schema.map((field,index)=>({...field,index,data_kind:index===0?'Непрерывный':'Дискретный'}));
  const table={fresh:true,port_guid:'output0',row_count:1,sample_rows:1,sample_complete:true,
    filter_enabled:false,precision:{numbers_verified:true,limitations:[]},schema,
    sample:probe.expected.map(row=>row.map((value,index)=>({value,type:schema[index].type,is_null:false,
      precision:index===0?'exact_integer':'display_text'})))};
  const source_fields=schema.map(field=>({...field,field_id:'field'+field.index,record_id:'source'+field.index,required:true}));
  const mapping={verified:true,inventory_complete:true,source_identity_verified:true,state_source:'cached_mapping_stores',
    mapping_wizard:'DataSetOutputSocketWizard',autosync:true,settings_applied:false,package_saved:false,
    node_context:{...node,verified:true,surface:'wizard',output_port:{direction:'output',port:0,port_guid:table.port_guid}},
    source_fields,target_fields:source_fields.map(field=>({...field,record_id:'target'+field.index,
      required:false,excluded:false,inherited:false,source:structuredClone(field)}))};
  const phases=[
    {phase:'node_finish',value:{source_readback_verified:true,wizard_commit_verified:true,schema_mode:'code',
      source_sha256:probe.source_sha256,source_utf8_bytes:Buffer.byteLength(probe.source),source_lf_lines:probe.source.split('\n').length}},
    {phase:'input_mapping',value:{native_mapping:mapping}},
    {phase:'output_mapping',value:{native_mapping:mapping}},
    {phase:'materialization_execute',value:{owner_verified:true,status:'completed',execution_id:'first'}},
    {phase:'execute',value:{owner_verified:true,status:'completed',execution_id:'final'}},
  ].map((phase,index)=>({...phase,receipt_id:'receipt'+index}));
  return {probe,node,table,mapping,readback:javascriptCodeReadback({node,phases})};
}

for(const id of javascriptColumnNameIds)test('actual Code readback retains observed Name/DisplayName: '+id,()=>{
  const value=fixture(id),proof=verifyJavascriptPublicColumnNames(value);
  assert.equal(value.probe.native_input_fixture,'integer-safe');
  assert.equal(createHash('sha256').update(value.probe.source).digest('hex'),value.probe.source_sha256);
  assert.equal(javascriptPublicCodeOracle(value.probe,value.table).gate_passed,true);
  assert.equal(proof.source_to_physical_verified,true);
  assert.equal(proof.normalization_algorithm_verified,false);
  assert.equal(proof.add_column_verified,false);
  assert.equal(proof.native_bytes_verified,false);
  assert.equal(proof.method,'AssignColumns');
  assert.deepEqual(proof.code_api.before,proof.code_api.after);
  assert.deepEqual(proof.code_api.after,proof.physical_schema);
  assert.throws(()=>javascriptPublicCodeProbe(id,'declared'),/fixed schema mode/);
});

const changes={
  case:v=>{v.probe.id='g5-column-names-unknown';},
  source:v=>{v.probe.source+='// drift';},
  source_sha:v=>{v.probe.source_sha256='f'.repeat(64);},
  requested_name:v=>{v.probe.requested_name='Other';},
  requested_label:v=>{v.probe.requested_display_name='Other';},
  physical_name:v=>{v.table.schema[0].name='Сумма';},
  physical_label:v=>{v.table.schema[0].label='Other';},
  physical_type:v=>{v.table.schema[0].type='real';},
  row_count:v=>{v.table.row_count=2;},
  missing_row:v=>{v.table.sample=[];},
  null_integer:v=>{v.table.sample[0][0]={value:null,is_null:true,type:'integer',precision:'exact_null'};},
  value:v=>{v.table.sample[0][0].value='-9007199254740990';},
  code_api:v=>{v.table.sample[0][1].value=v.table.sample[0][1].value.replace('Summa','Other');},
  duplicate_json:v=>{v.table.sample[0][1].value=v.table.sample[0][1].value.replace('"version":1','"version":1,"version":1');},
  metadata_type:v=>{v.table.sample[0][1].type='integer';},
  stale:v=>{v.table.fresh=false;},
  filtered:v=>{v.table.filter_enabled=true;},
  incomplete:v=>{v.table.sample_complete=false;},
  mapping_verified:v=>{v.mapping.verified=false;},
  mapping_complete:v=>{v.mapping.inventory_complete=false;},
  mapping_source_verified:v=>{v.mapping.source_identity_verified=false;},
  mapping_kind:v=>{v.mapping.state_source='invented';},
  mapping_wizard:v=>{v.mapping.mapping_wizard='DataSetInputSocketWizard';},
  mapping_saved:v=>{v.mapping.package_saved=true;},
  mapping_applied:v=>{v.mapping.settings_applied=true;},
  mapping_autosync:v=>{v.mapping.autosync=false;},
  foreign_document:v=>{v.mapping.node_context.document_id='foreign';},
  foreign_workflow:v=>{v.mapping.node_context.workflow_id='foreign';},
  foreign_node:v=>{v.mapping.node_context.node_id='foreign';},
  foreign_surface:v=>{v.mapping.node_context.surface='workflow';},
  foreign_port:v=>{v.mapping.node_context.output_port.port_guid='foreign';},
  input_port:v=>{v.mapping.node_context.output_port.direction='input';},
  missing_source:v=>{v.mapping.source_fields.pop();},
  missing_target:v=>{v.mapping.target_fields.pop();},
  duplicate_source:v=>{v.mapping.source_fields[1].record_id=v.mapping.source_fields[0].record_id;},
  duplicate_target:v=>{v.mapping.target_fields[1].record_id=v.mapping.target_fields[0].record_id;},
  wrong_source_name:v=>{v.mapping.source_fields[0].name='requested';},
  wrong_source_label:v=>{v.mapping.source_fields[0].label='requested';},
  wrong_target_name:v=>{v.mapping.target_fields[0].name='requested';},
  wrong_target_label:v=>{v.mapping.target_fields[0].label='requested';},
  reciprocal_source:v=>{v.mapping.target_fields[0].source.field_id='foreign';},
  source_required:v=>{v.mapping.source_fields[0].required=false;},
  target_required:v=>{v.mapping.target_fields[0].required=true;},
  excluded:v=>{v.mapping.target_fields[0].excluded=true;},
  inherited:v=>{v.mapping.target_fields[0].inherited=true;},
  public_source:v=>{v.readback.source.sha256='f'.repeat(64);},
  public_mode:v=>{v.readback.schema_mode='declared';},
  public_name:v=>{v.readback.output_mapping.fields[0].name='requested';},
  public_label:v=>{v.readback.output_mapping.fields[0].label='requested';},
  public_source_name:v=>{v.readback.output_mapping.fields[0].source_name='requested';},
  public_field_missing:v=>{v.readback.output_mapping.fields.pop();},
};
for(const [name,change] of Object.entries(changes))test('column-name proof refuses '+name,()=>{
  const value=fixture('g5-column-names-cyrillic'),before=JSON.stringify(value);change(value);
  assert.notEqual(JSON.stringify(value),before,'mutation must affect the fixture');
  assert.throws(()=>verifyJavascriptPublicColumnNames(value));
});

test('names distinguish technical Name from Unicode DisplayName and make no AddColumn claim',()=>{
  const cyrillic=javascriptColumnNameProbes.find(probe=>probe.id==='g5-column-names-cyrillic');
  const label=javascriptColumnNameProbes.find(probe=>probe.id==='g5-column-names-unicode-label');
  assert.equal(cyrillic.requested_name,'Сумма');assert.equal(cyrillic.schema[0].name,'Summa');
  assert.equal(label.requested_name,'Value');assert.equal(label.schema[0].label,'Сумма ё');
});
