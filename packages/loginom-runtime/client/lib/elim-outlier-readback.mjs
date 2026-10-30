const need=(v,m)=>{if(!v)throw Error('Outlier detect readback: '+m);};
export function elimOutlierConfigurationReadback({node,phases,operation_id}){
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const phase=name=>{const rows=phases.filter(p=>p.phase===name),p=rows[0];need(rows.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name);return p;};
 const input=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish');
 const c=configured.value.configuration,training=finished.value.training??{status:'not_requested'};
 need(c?.verified&&c.inventory_complete&&owner(c.node_context),'configuration owner changed');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&owner(configured.value.validation.node_context)&&saved.value.settings_applied===true&&finished.value.settings_applied===true,'settings not committed');
 need(finished.value.mode!=='execute'||training.status==='trained'&&training.execution_id!==finished.value.execution_id&&training.source?.length===1,'Train current input required before Execute');
 const fields=c.field_settings.filter(f=>f.used).map(f=>({name:f.name,...f.settings}));
 need(fields.length>0&&fields.every(f=>['sd','iqr'].includes(f.method)&&f.extreme_factor>=f.outlier_factor&&f.outlier_policy==='keep'&&f.extreme_policy==='keep'),'complete keep/keep settings required');
 need(mapped.value.ports?.length===3&&mapped.value.ports.every((p,i)=>p.port===i&&p.schema.length===c.fields.length),'all output schemas required');
 return {kind:'elim_outlier',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:'detect',fields,ordered:c.ordered,training_basis:'current_input',training:structuredClone(training),
  output_mappings:mapped.value.ports.map(p=>({port:p.port,fields:p.schema.map((f,index)=>({...f,index,source_name:f.name}))})),package_persistence_verified:false};
}
