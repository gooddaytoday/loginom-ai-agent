// Operator-only fixed AssignColumns cases. The expected names are independently
// recorded observations, never a normalization algorithm used by the handler.
import {javascriptTelemetryCase} from './javascript-schema-telemetry-cases.mjs';
import {parseJavascriptTelemetry} from './javascript-schema-telemetry-contract.mjs';
import {verifyJavascriptMismatchTable} from './javascript-mismatch-probe.mjs';

const need=(value,message)=>{if(!value)throw Error('Public column names: '+message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const cases=[
  ['control','Value','Value'],
  ['cyrillic','Summa','Value'],
  ['space','Value_Total','Value'],
  ['leading-digit','_1Value','Value'],
  ['unicode-label','Value','Сумма ё'],
];

export const javascriptColumnNameProbes=Object.freeze(cases.map(([id,name,label])=>{
  const telemetry=javascriptTelemetryCase('T-schema-'+id);
  const fields=[{index:0,name,display_name:label,data_type:4},
    {index:1,name:'__JS_Metadata',display_name:'__JS_Metadata',data_type:5}];
  const json=JSON.stringify({version:1,probe_id:telemetry.id,column_count:2,before:fields,after:fields});
  return Object.freeze({id:'g5-column-names-'+id,scope:'J24-column-names',schema_mode:'code',
    native_input_fixture:'integer-safe',source:telemetry.source,source_sha256:telemetry.source_sha256,
    telemetry_case_id:telemetry.id,requested_name:telemetry.requested_name,
    requested_display_name:telemetry.requested_display_name,
    schema:[{name,label,type:'integer'},{name:'__JS_Metadata',label:'__JS_Metadata',type:'string'}],
    expected:[['-9007199254740991',json]],expectation:'fixed'});
}));
export const javascriptColumnNameIds=Object.freeze(javascriptColumnNameProbes.map(probe=>probe.id));

// This verifies the actual native source/target mapping independently of the
// in-engine JSON and the decoded physical table. It never substitutes Name.
export function verifyJavascriptPublicColumnNames({probe,table,mapping,node,readback}) {
  const pinned=javascriptColumnNameProbes.find(value=>value.id===probe?.id);
  need(pinned&&Object.keys(pinned).every(key=>same(probe[key],pinned[key])),'fixed case/source differs');
  verifyJavascriptMismatchTable(table);
  need(table.fresh===true&&table.row_count===1&&table.sample.length===1&&table.schema.length===2
    &&same(table.schema.map(({name,label,type})=>({name,label,type})),pinned.schema),'physical schema differs');
  need(table.sample[0].length===2&&table.sample[0].every((cell,i)=>cell.type===pinned.schema[i].type
    &&cell.is_null===false&&cell.value===pinned.expected[0][i]),'complete typed values differ');
  const telemetry=parseJavascriptTelemetry(table.sample[0][1].value,pinned.telemetry_case_id);
  const physical=table.schema.map((field,index)=>({index,name:field.name,display_name:field.label,data_type:index===0?4:5}));
  need(same(telemetry.before,physical)&&same(telemetry.after,physical),'code API and physical schema differ');
  need(mapping?.verified===true&&mapping.inventory_complete===true&&mapping.source_identity_verified===true
    &&mapping.state_source==='cached_mapping_stores'&&mapping.mapping_wizard==='DataSetOutputSocketWizard'
    &&mapping.autosync===true&&mapping.settings_applied===false&&mapping.package_saved===false
    &&mapping.node_context?.verified===true&&mapping.node_context.surface==='wizard'
    &&['document_id','workflow_id','node_id'].every(key=>node?.[key]&&mapping.node_context[key]===node[key])
    &&mapping.node_context.output_port?.direction==='output'&&mapping.node_context.output_port.port===0
    &&mapping.node_context.output_port.port_guid===table.port_guid
    &&mapping.source_fields?.length===2&&mapping.target_fields?.length===2,'native mapping owner/completeness differs');
  need(new Set(mapping.source_fields.map(field=>field.record_id)).size===2
    &&new Set(mapping.target_fields.map(field=>field.record_id)).size===2,'native mapping record identities differ');
  mapping.target_fields.forEach((target,index)=>{
    const source=mapping.source_fields[index],column=table.schema[index];
    need(source.index===index&&target.index===index&&typeof source.field_id==='string'&&source.field_id
      &&typeof source.record_id==='string'&&source.record_id&&typeof target.record_id==='string'&&target.record_id
      &&['name','label','type','data_kind'].every(key=>source[key]===column[key]&&target[key]===column[key])
      &&source.required===true&&target.required===false&&target.excluded===false&&target.inherited===false
      &&same(target.source,source),'source to target physical field differs');
  });
  need(readback?.schema_mode==='code'&&readback.source?.sha256===pinned.source_sha256
    &&readback.output_mapping?.port===0&&readback.output_mapping.autosync===true
    &&readback.output_mapping.fields.length===2
    &&readback.output_mapping.fields.every((field,index)=>['index','name','label','type','data_kind']
      .every(key=>field[key]===table.schema[index][key])&&field.source_name===physical[index].name&&field.excluded===false),
  'public readback lost actual names');
  return {status:'OBSERVED',method:'AssignColumns',requested_name:pinned.requested_name,
    requested_display_name:pinned.requested_display_name,code_api:telemetry,
    physical_schema:physical,native_mapping:structuredClone(mapping),source_to_physical_verified:true,
    normalization_algorithm_verified:false,add_column_verified:false,native_bytes_verified:false};
}
