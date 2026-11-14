const need=(condition,message)=>{if(!condition)throw Error(message);};
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);

export function verifyJavascriptUnconnectedInput(graph,node){
  need(graph?.complete===true&&graph.document_id===node.document_id
    &&graph.workflow_ref?.workflow_id===node.workflow_id&&Array.isArray(graph.nodes)
    &&graph.nodes.filter(item=>same(item.ref,node)).length===1
    &&Array.isArray(graph.links)&&Array.isArray(graph.foreign_links)&&graph.foreign_links.length===0
    &&[graph.links,graph.variable_links??[],graph.service_links??[]].every(edges=>Array.isArray(edges)
      &&edges.every(edge=>typeof edge.target==='string'&&edge.target!==node.node_id)),
  'JavaScript unconnected input requires a complete owned graph without incoming links');
  return true;
}

export function javascriptUnconnectedInputMapping(mapping,graph,node){
  verifyJavascriptUnconnectedInput(graph,node);
  const context=mapping?.node_context,port=context?.input_port;
  need(mapping?.verified===true&&mapping.inventory_complete===true&&mapping.source_identity_verified===true
    &&mapping.state_source==='cached_mapping_stores'&&mapping.mapping_wizard==='TuneDataSourceMappingWizard'
    &&mapping.settings_applied===false&&mapping.package_saved===false
    &&typeof mapping.autosync==='boolean'&&Array.isArray(mapping.source_fields)&&mapping.source_fields.length===0
    &&Array.isArray(mapping.target_fields)&&mapping.target_fields.length===0
    &&context?.verified===true&&context.surface==='wizard'
    &&['document_id','workflow_id','node_id'].every(key=>context[key]===node[key])
    &&port?.direction==='input'&&port.port===0&&typeof port.port_guid==='string'&&port.port_guid.length>0,
  'JavaScript unconnected input native mapping unavailable');
  return {...mapping,input_state:'unconnected',no_incoming_links_verified:true};
}

export function verifyJavascriptMappingGraph(before,after,node){
  const domain=value=>({document_id:value.document_id,workflow_ref:value.workflow_ref,
    nodes:value.nodes.map(({dom_epoch,...item})=>item),links:value.links,foreign_links:value.foreign_links});
  need(before?.complete===true&&after?.complete===true&&before.document_id===node.document_id
    &&after.document_id===node.document_id&&before.workflow_ref.workflow_id===node.workflow_id
    &&after.workflow_ref.workflow_id===node.workflow_id,'JavaScript mapping graph owner changed');
  const previous=before.nodes.find(item=>same(item.ref,node)),current=after.nodes.find(item=>same(item.ref,node));
  need(previous&&current,'JavaScript mapping node disappeared');
  const expected=previous.locked===true&&current.locked===false
    ?{...before,nodes:before.nodes.map(item=>item===previous?{...item,locked:false}:item)}:before;
  need(same(domain(expected),domain(after)),'JavaScript complete mapping graph changed');
  return true;
}
