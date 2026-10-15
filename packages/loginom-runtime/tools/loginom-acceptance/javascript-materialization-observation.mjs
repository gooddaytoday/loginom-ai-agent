// Private C0 observation. Mapping records and the bound Table are actual UI
// caches; neither expected business cells nor source text establish G3 lineage.
import {javascriptMappingState} from './javascript-mapping-state.mjs';

export function javascriptMaterializationObservation({node,before,after,table}) {
  const need=(value,message)=>{if(!value)throw Error('C0 materialization: '+message);};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  for(const mapping of [before,after]) {
    javascriptMappingState(mapping,node,{direction:'output',allowConfiguredOnly:true});
    const owner=mapping?.node_context;
    need(owner?.verified===true&&owner.surface==='wizard'
      &&['document_id','workflow_id','node_id'].every(key=>node?.[key]&&owner[key]===node[key])
      &&owner.output_port?.direction==='output'&&owner.output_port.port===0
      &&typeof owner.output_port.port_guid==='string'&&owner.output_port.port_guid
      &&mapping.inventory_complete===true&&mapping.state_source==='cached_mapping_stores'
      &&(mapping.verified===true||mapping.configured_inventory_verified===true
        &&mapping.reason==='mapping_source_pending'),'complete owned output0 mapping');
    need(Array.isArray(mapping.source_fields)&&Array.isArray(mapping.target_fields),'field inventories');
  }
  const port=before.node_context.output_port.port_guid;
  need(after.node_context.output_port.port_guid===port
    &&table?.physical_output?.port_index===0&&table.physical_output.table_ref?.port_guid===port
    &&typeof table.physical_output.table_ref.view_guid==='string'
    &&typeof table.physical_output.table_ref.table_tid==='string','same physical output0 Table');
  const source=after.source_fields,target=after.target_fields.filter(field=>field.excluded!==true);
  const materialized=after.verified===true&&after.source_identity_verified===true&&source.length>0;
  const shape=fields=>fields.map(field=>({name:field.name,label:field.label,type:field.type}));
  const reciprocal=materialized&&source.length===target.length&&target.every(field=>{
    const matches=source.filter(item=>item.record_id===field.source?.record_id&&item.field_id===field.source?.field_id);
    return matches.length===1&&same(matches[0],field.source);
  });
  const physicalSchemaMatched=reciprocal&&same(shape(target),shape(table.schema));
  return {status:materialized?'materialized':'configured_only',port_guid:port,
    before:structuredClone(before),after:structuredClone(after),
    physical_table:structuredClone(table.physical_output),
    physical_schema:shape(table.schema),mapping_links_verified:reciprocal,
    mapping_target_table_schema_matched:physicalSchemaMatched,
    generated_logical_schema_observed:false,bridge_verified:false,
    proof_level:'private_cached_mapping_and_bound_table',native_bytes_verified:false,gates_closed:[]};
}
