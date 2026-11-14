const need=(v,m)=>{if(!v)throw Error('Python readback: '+m);};
// Compact: identity of the saved code, never its text.
export function pythonConfigurationReadback({node,phases,operation_id}){
 const phase=name=>{const rows=phases.filter(p=>p.phase===name);need(rows.length===1&&rows[0].status==='verified'&&rows[0].receipt_id===operation_id+':'+name&&rows[0].value?.verified===true&&rows[0].value.cleanup_complete===true,'verified '+name+' required');return rows[0];};
 const input=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish'),c=configured.value.configuration;
 need(c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k]),'configuration owner changed');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&saved.value.settings_applied===true&&finished.value.settings_applied===true,'settings were not committed');
 need(['code','declared'].includes(c.schema_mode)&&/^[a-f0-9]{64}$/.test(c.source_sha256),'schema mode or code identity missing');
 return {kind:'python',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),
  mode:'script',execution_mode:'external_process',schema_mode:c.schema_mode,...(c.schema_mode==='declared'?{columns:structuredClone(c.columns)}:{}),
  source_sha256:c.source_sha256,source_utf8_bytes:c.source_utf8_bytes,source_lf_lines:c.source_lf_lines,separate_process:c.separate_process===true,package_persistence_verified:false};
}
