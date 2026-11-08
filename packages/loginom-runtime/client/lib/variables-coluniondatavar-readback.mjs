export function variablesColumnUnionConfigurationReadback({node,phases,operation_id}){
 const receipt=name=>{const matches=phases.filter(p=>p.phase===name);if(matches.length!==1||matches[0].status!=='verified'||matches[0].receipt_id!==operation_id+':'+name||matches[0].value?.verified!==true)throw Error('Variables union verified '+name+' receipt required');return matches[0];};
 const configured=receipt('configure'),finished=receipt('finish'),c=configured.value.configuration;
 if(!['automatic','manual'].includes(c?.mapping)||!c.node_context?.verified||!['document_id','workflow_id','node_id'].every(k=>c.node_context[k]===node[k])||!finished.value.settings_applied)throw Error('Variables union verified mapping/finish required');
 const inputs=receipt('input_mapping').value.inputs;
 if(!Array.isArray(inputs)||inputs.length!==2)throw Error('Variables union exact input identities required');
 const read=phases.find(p=>p.phase==='read')?.value?.variable_ports?.[0],sources=receipt('input_mapping').value.source_fields;
 if(c.mapping==='manual'){
  if(!c.inventory_complete||!Array.isArray(c.fields)||!c.fields.length||c.fields.some(f=>!sources.some(s=>s.input===f.input&&s.name===f.source&&(s.type===f.type||s.type==='integer'&&f.type==='string')))
   ||read&&(read.variables.length!==c.fields.length||read.variables.some((v,i)=>v.name!==c.fields[i].name||v.label!==c.fields[i].label||v.type!==c.fields[i].type)))throw Error('Variables union complete ordered manual output differs');
  return {kind:'variables_column_union',mode:'append_variables',mapping:'manual',input_count:2,node:structuredClone(node),scope:'observed_after_verified_finish',values_are:'observed_ui_values',receipt_ids:[configured.receipt_id,finished.receipt_id],inputs,
   fields:c.fields,output_names:c.fields.map(f=>f.name),mapping_fields:c.fields.map(f=>({input:f.input,source_name:f.source,output_name:f.name})),package_persistence_verified:false};
 }
 if(read&&(!Array.isArray(sources)||read.variables.length!==sources.length||read.variables.some((v,i)=>v.type!==sources[i].type||v.label!==sources[i].label)))throw Error('Variables union native output order/type/label differs from both complete inputs');
 return {kind:'variables_column_union',mode:'append_variables',mapping:'automatic',input_count:2,node:structuredClone(node),
  scope:'observed_after_verified_finish',values_are:'observed_ui_values',receipt_ids:[configured.receipt_id,finished.receipt_id],
  inputs,...(read?{output_names:read.variables.map(v=>v.name),mapping_fields:read.variables.map((v,i)=>({input:sources[i].input,source_name:sources[i].name,output_name:v.name}))}:{}),package_persistence_verified:false};
}
