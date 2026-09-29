// Operator-only G3 witness; never publish this diagnostic source to knowledge.
import {createHash} from 'node:crypto';
import {javascriptBusinessProbes} from './javascript-business-probes.mjs';
import {javascriptMaterializationObservation} from './javascript-materialization-observation.mjs';

const base=javascriptBusinessProbes().find(probe=>probe.id==='p1-business-code-base');
if(base.source_sha256!=='1bc0f8123e1c2a6f1924ee69e0e9373d720e4ea301f4f928d347535e06b61ec3')
  throw Error('G3 business source pin differs');
const snapshot='function snapshot() {\n'
  +'  if (OutputTable.ColumnCount !== 5) throw Error("JS_BRIDGE_COLUMN_COUNT");\n'
  +'  return [0,1,2,3,4].map(function(index) {\n'
  +'    var column=OutputTable.GetColumn(index);\n'
  +'    if (column.Index !== index || typeof column.Name !== "string" || typeof column.DisplayName !== "string"'
  +' || column.Name.length > 128 || column.DisplayName.length > 128 || typeof column.DataType !== "number")'
  +' throw Error("JS_BRIDGE_METADATA_SHAPE");\n'
  +'    return {index:column.Index,name:column.Name,display_name:column.DisplayName,data_type:column.DataType};\n'
  +'  });\n}\nvar before=snapshot();\n';
const source=base.source.replace('{Name:"Status",DataType:DataType.String}]);',
  '{Name:"Status",DataType:DataType.String},{Name:"__JS_Metadata",DataType:DataType.String}]);')
  .replace('for (var row=0;',snapshot+'for (var row=0;')
  .replace('  OutputTable.Set("Status",net<0?"возврат":net===0?"ноль":"продажа");\n',
    '  OutputTable.Set("Status",net<0?"возврат":net===0?"ноль":"продажа");\n'
    +'  var metadata=JSON.stringify({version:1,probe_id:"g3-code-business-bridge",column_count:5,row:row,before:before,after:snapshot()});\n'
    +'  if (metadata.length > 4096) throw Error("JS_BRIDGE_JSON_BOUND");\n'
    +'  OutputTable.Set(4,metadata);\n');

export function javascriptBridgeProbe() {
  return {...structuredClone(base),id:'g3-code-business-bridge',scope:'G3-bridge',source,
    source_sha256:createHash('sha256').update(source,'utf8').digest('hex'),
    schema:[...structuredClone(base.schema),{name:'__JS_Metadata',label:'__JS_Metadata',type:'string'}],
    expected:null,expectation:'characterization'};
}

// Only canonical JSON emitted by the pinned source is admitted. Comparing its
// reserialization also rejects repeated keys, aliases, whitespace and truncation.
export function javascriptBridgeMetadata(text,row) {
  const need=(value,message)=>{if(!value)throw Error('G3 metadata: '+message);};
  need(typeof text==='string'&&Buffer.byteLength(text,'utf8')<=4096,'bound');
  const value=JSON.parse(text);
  const keys=(object,names)=>object!==null&&typeof object==='object'&&!Array.isArray(object)
    &&Object.keys(object).length===names.length&&names.every(name=>Object.hasOwn(object,name));
  need(JSON.stringify(value)===text&&keys(value,['version','probe_id','column_count','row','before','after'])
    &&value.version===1&&value.probe_id==='g3-code-business-bridge'&&value.column_count===5
    &&value.row===row&&!Object.is(value.row,-0),'canonical envelope');
  for(const phase of ['before','after']){
    need(Array.isArray(value[phase])&&value[phase].length===5,'five observed columns');
    value[phase].forEach((column,index)=>{
      need(keys(column,['index','name','display_name','data_type'])&&column.index===index&&!Object.is(column.index,-0)
        &&[1,2,3,4,5,6].includes(column.data_type),'column index/type/keys');
      need(['name','display_name'].every(key=>typeof column[key]==='string'&&column[key].length<=128
        &&Buffer.byteLength(column[key],'utf8')<=512),'metadata strings');
    });
  }
  return value;
}

export function javascriptBridgeObservation({node,before,after,table}) {
  const observed=javascriptMaterializationObservation({node,before,after,table});
  if(table.sample_complete!==true||table.sample_rows!==6||table.row_count!==6
    ||table.sample.length!==6||table.schema.length!==5)throw Error('G3 complete 6x5 Table required');
  const metadata=table.sample.map((row,index)=>{
    const cell=row[4];
    if(row.length!==5||cell?.type!=='string'||cell.is_null!==false||cell.precision!=='display_text')
      throw Error('G3 observed telemetry cell required');
    return javascriptBridgeMetadata(cell.value,index);
  });
  const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'};
  const shape=columns=>columns.map(column=>({name:column.name,label:column.label,type:column.type}));
  const logical=metadata[0].before.map(column=>({name:column.name,label:column.display_name,type:types[column.data_type]}));
  const stable=metadata.every(item=>JSON.stringify(item.before)===JSON.stringify(metadata[0].before)
    &&JSON.stringify(item.after)===JSON.stringify(metadata[0].before));
  const cachedSourceMatched=JSON.stringify(logical)===JSON.stringify(shape(after.source_fields));
  const physicalMatched=JSON.stringify(logical)===JSON.stringify(shape(table.schema));
  return {...observed,generated_logical_schema_observed:true,logical_schema:logical,
    logical_metadata:metadata,logical_schema_stable:stable,
    logical_cached_source_schema_matched:cachedSourceMatched,logical_physical_schema_matched:physicalMatched,
    bridge_verified:stable&&cachedSourceMatched&&physicalMatched&&observed.mapping_links_verified
      &&observed.mapping_target_table_schema_matched,
    proof_level:'private_logical_metadata_cached_mapping_and_bound_output0'};
}
