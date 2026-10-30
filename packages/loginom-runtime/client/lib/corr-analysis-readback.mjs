const need=(v,m)=>{if(!v)throw Error('Correlation readback: '+m);};
export function corrAnalysisConfigurationReadback({node,phases,operation_id}){
 const phase=name=>{const rows=phases.filter(p=>p.phase===name);need(rows.length===1&&rows[0].status==='verified'&&rows[0].receipt_id===operation_id+':'+name&&rows[0].value?.verified===true&&rows[0].value.cleanup_complete===true,'verified '+name+' required');return rows[0];};
 const input=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish'),c=configured.value.configuration;
 need(c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k]),'configuration owner changed');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&saved.value.settings_applied===true&&finished.value.settings_applied===true,'settings were not committed');
 need(c.coefficients.pearson===true&&Object.entries(c.coefficients).every(([k,v])=>k==='pearson'||v===false),'unexpected coefficients');
 return {kind:'corr_analysis',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:'pearson',
  first_set:c.fields.filter(f=>f.first_set).map(f=>f.name),second_set:c.fields.filter(f=>f.second_set).map(f=>f.name),coefficients:['pearson'],package_persistence_verified:false};
}
