const need=(v,m)=>{if(!v)throw Error('PREPARED_SOURCE:'+m);};
export function verifyPreparedSourceGraph(graph,prepared,account,fixture){
 need(prepared.status==='READY'&&prepared.package_ref?.path==='/'+account+'/'+fixture.package_basename,'own package required');
 need(graph.complete===true&&graph.document_id===prepared.document_id
  &&graph.workflow_ref?.workflow_id===prepared.workflow_ref.workflow_id
  &&graph.nodes?.length===2&&graph.foreign_links?.length===0&&graph.links?.length===1,'complete two-node graph required');
 const input=graph.nodes.filter(n=>n.type==='imports.text'),collapse=graph.nodes.filter(n=>n.type==='transform.collapse_columns');
 need(input.length===1&&collapse.length===1&&input[0].label==='VariantInput'&&collapse[0].label==='VariantSource','source identities differ');
 const nodes=[input[0],collapse[0]];
 need(nodes.every(n=>!n.locked&&n.ref.document_id===prepared.document_id&&n.ref.workflow_id===prepared.workflow_ref.workflow_id)
  &&nodes[0].ref.node_id!==nodes[1].ref.node_id,'source owner differs');
 const edge=graph.links[0];need(edge.source===nodes[0].ref.node_id&&edge.target===nodes[1].ref.node_id&&edge.input===0&&edge.output===0,'source link differs');
 return nodes.map(n=>n.ref);
}
export function verifyPreparedSourceSettings(sources,nodes,fixture){
 need(sources.imports.length===1&&sources.collapses.length===1&&sources.crossTables.length===0,'source inventory differs');
 const input=sources.imports[0],collapse=sources.collapses[0];
 need(input.node_id===nodes[0].node_id&&collapse.node_id===nodes[1].node_id,'settings owner differs');
 const c=collapse.configuration;
 need(JSON.stringify(c.information.map(f=>f.name))===JSON.stringify(fixture.collapse.information)
  &&JSON.stringify(c.transposed.map(f=>f.name))===JSON.stringify(fixture.collapse.transposed)
  &&c.ignore_empty===fixture.collapse.ignore_empty,'Collapse roles differ');
 need(JSON.stringify(input.configuration.output_mapping.fields.map(({name,label,type})=>({name,label,type})))===JSON.stringify(fixture.file.columns),'import schema differs');
 for(const fields of [c.information,c.transposed])need(fields.every(f=>fixture.file.columns.some(w=>w.name===f.name&&w.label===f.label&&w.type===f.type)),'Collapse field schema differs');
 // Opening a readonly wizard creates fresh local record IDs. Compare every
 // semantic setting, excluding only those ephemeral store identities.
 const semantic=fields=>fields.map(({record_id,...field})=>field);
 return {import:input.configuration,collapse:{...c,information:semantic(c.information),transposed:semantic(c.transposed)}};
}
