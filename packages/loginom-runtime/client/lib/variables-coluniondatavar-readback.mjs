export function variablesColumnUnionConfigurationReadback({node,phases,operation_id}){
 const receipt=name=>{const matches=phases.filter(p=>p.phase===name);if(matches.length!==1||matches[0].status!=='verified'||matches[0].receipt_id!==operation_id+':'+name||matches[0].value?.verified!==true)throw Error('Variables union verified '+name+' receipt required');return matches[0];};
 const configured=receipt('configure'),finished=receipt('finish'),c=configured.value.configuration;
 if(c?.mapping!=='automatic'||!c.node_context?.verified||!['document_id','workflow_id','node_id'].every(k=>c.node_context[k]===node[k])||!finished.value.settings_applied)throw Error('Variables union automatic mapping/finish required');
 const inputs=receipt('input_mapping').value.inputs;
 if(!Array.isArray(inputs)||inputs.length!==2)throw Error('Variables union exact input identities required');
 const read=phases.find(p=>p.phase==='read')?.value?.variable_ports?.[0],sources=receipt('input_mapping').value.source_fields;
 if(read&&(!Array.isArray(sources)||read.variables.length!==sources.length||read.variables.some((v,i)=>v.type!==sources[i].type||v.label!==sources[i].label)))throw Error('Variables union native output order/type/label differs from both complete inputs');
 return {kind:'variables_column_union',mode:'append_variables',mapping:'automatic',input_count:2,node:structuredClone(node),
  scope:'observed_after_verified_finish',values_are:'observed_ui_values',receipt_ids:[configured.receipt_id,finished.receipt_id],
  inputs,...(read?{output_names:read.variables.map(v=>v.name),mapping_fields:read.variables.map((v,i)=>({input:sources[i].input,source_name:sources[i].name,output_name:v.name}))}:{}),package_persistence_verified:false};
}
