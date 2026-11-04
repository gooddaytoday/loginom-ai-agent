const need=(value,message)=>{if(!value)throw Error('Factor analysis readback: '+message);};
export function factorAnalysisConfigurationReadback({node,phases,operation_id}){
 const phase=name=>{const rows=phases.filter(p=>p.phase===name);need(rows.length===1&&rows[0].status==='verified'&&rows[0].receipt_id===operation_id+':'+name&&rows[0].value?.verified===true&&rows[0].value.cleanup_complete===true,'verified '+name);return rows[0];};
 const input=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish');
 const c=configured.value.configuration,training=finished.value.training??{status:'not_requested'};
 need(c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k]),'configuration owner changed');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&saved.value.settings_applied===true&&finished.value.settings_applied===true,'settings were not committed');
 need(finished.value.mode!=='execute'||training.status==='trained'&&training.execution_id!==finished.value.execution_id&&training.source?.length===1,'training on the connected source must complete before Execute');
 const features=c.fields.filter(f=>f.usage_type===3).map(f=>f.name);
 need(c.criterion==='fixed'&&c.rotation==='none'&&c.output_cap===false&&features.length>=c.factors,'unsupported PCA settings');
 const output_mappings=mapped.value.ports.map(({port,mapping})=>({port,fields:mapping.target_fields.map((f,index)=>({index,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind,source_name:f.source?.name??f.name}))}));
 return {kind:'factor_analysis',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:'pca_fixed',features,factors:c.factors,rotation:'none',
  training:structuredClone(training),output_mappings,package_persistence_verified:false};
}
