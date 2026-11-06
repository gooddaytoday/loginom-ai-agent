export function variablesReplaceConfigurationReadback({node,phases,operation_id}){
 const need=(v,m)=>{if(!v)throw Error('Variables replacement readback: '+m);};
 const receipt=phase=>{const ps=phases.filter(p=>p.phase===phase),p=ps[0];need(ps.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+phase&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+phase+' required');return p;};
 const c=receipt('configure'),f=receipt('finish'),configuration=c.value.configuration;
 const owner=context=>context?.verified===true&&['document_id','workflow_id','node_id'].every(k=>context[k]===node[k]);
 need(configuration?.verified===true&&configuration.inventory_complete===true&&configuration.mode==='exact'&&owner(configuration.node_context),'complete owned rules required');
 need(c.value.syntax_validation?.status==='accepted_by_loginom_next'&&owner(c.value.syntax_validation.node_context),'native validation required');
 need(f.value.settings_applied===true&&owner(f.value.node_context)&&['done','execute'].includes(f.value.mode),'verified finish required');
 need(Array.isArray(configuration.output_mapping)&&configuration.output_mapping.length===configuration.input_fields.length
  &&configuration.output_mapping.every((m,i)=>m.index===i&&['name','label','type'].every(k=>m[k]===configuration.input_fields[i][k])),'preserved output metadata required');
 return {kind:'variables_replace',mode:'exact',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[c.receipt_id,f.receipt_id],rules:structuredClone(configuration.rules),output_variables:structuredClone(configuration.output_mapping),package_persistence_verified:false};
}
