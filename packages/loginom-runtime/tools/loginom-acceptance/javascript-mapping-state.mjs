// Host-side admission of an observed mapping. Configured-only is explicitly
// opt-in and never becomes a full source-identity proof.
export function javascriptMappingState(mapping,node,{direction,allowConfiguredOnly=false}={}) {
  const owner=mapping?.node_context;
  if(!['input','output'].includes(direction)||typeof allowConfiguredOnly!=='boolean'
    ||mapping?.inventory_complete!==true||mapping.state_source!=='cached_mapping_stores'
    ||typeof mapping.autosync!=='boolean'||mapping.settings_applied!==false||mapping.package_saved!==false
    ||owner?.verified!==true||owner.surface!=='wizard'
    ||!['document_id','workflow_id','node_id'].every(k=>typeof node?.[k]==='string'&&node[k]&&owner[k]===node[k])
    ||!Array.isArray(mapping.source_fields)||mapping.source_fields.length>1000
    ||!Array.isArray(mapping.target_fields)||mapping.target_fields.length>1000)
    throw Error('Mapping observation or owner is incomplete');
  if(mapping.verified===true&&mapping.source_identity_verified===true
    &&mapping.configured_inventory_verified!==true&&mapping.source_pending===undefined
    &&(mapping.source_fields.length>0||mapping.target_fields.length===0))return 'complete';
  const proof=mapping.source_pending;
  const prefix=owner.tid+';DataSetOutputSocketWizard;';
  if(!allowConfiguredOnly||direction!=='output'||mapping.verified!==false
    ||mapping.source_identity_verified!==false||mapping.configured_inventory_verified!==true
    ||mapping.reason!=='mapping_source_pending'||mapping.mapping_wizard!=='DataSetOutputSocketWizard'
    ||typeof owner.tid!=='string'||!owner.tid.endsWith(';WizrdMCF')
    ||owner.output_port?.direction!=='output'||owner.output_port.port!==0
    ||typeof owner.output_port.port_guid!=='string'||!owner.output_port.port_guid
    ||proof?.kind!=='hidden_source_column'||proof.native_header_verified!==true
    ||proof.header_tid!==prefix+'grdTargetColumns;headercontainer'||proof.column_tid!==prefix+'colSourceDisplayName'
    ||proof.data_index!=='SourceDisplayName'||proof.item_id!=='colSourceDisplayName'
    ||proof.hidden!==true||proof.visible!==false||proof.source_count!==0||mapping.source_fields.length!==0
    ||proof.target_count!==mapping.target_fields.length||mapping.target_fields.length===0||mapping.target_fields.length>200
    ||mapping.target_fields.some(t=>t.source!==null||t.exclusion_source!==null||t.excluded!==false)
    ||JSON.stringify(mapping.rendered_indices)!==JSON.stringify(mapping.target_fields.map((_,index)=>index)))
    throw Error('Full source mapping or explicit configured-only proof required');
  return 'configured_only';
}
