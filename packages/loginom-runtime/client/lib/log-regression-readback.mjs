const need=(v,m)=>{if(!v)throw Error('Logistic regression readback: '+m);};
export function logRegressionConfigurationReadback({node,phases,operation_id}){
 const phase=name=>{const rows=phases.filter(p=>p.phase===name);need(rows.length===1&&rows[0].status==='verified'&&rows[0].receipt_id===operation_id+':'+name&&rows[0].value?.verified===true&&rows[0].value.cleanup_complete===true,'verified '+name);return rows[0];};
 const input=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish');
 const c=configured.value.configuration,training=finished.value.training??{status:'not_requested'};
 need(c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k]),'configuration owner changed');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&saved.value.settings_applied===true&&finished.value.settings_applied===true,'settings were not committed');
 need(finished.value.mode!=='execute'||training.status==='trained'&&training.execution_id!==finished.value.execution_id&&training.source?.length===1,'training on connected source must complete before Execute');
 return {kind:'log_regression',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:c.mode??'enter',
  input_fields:c.fields.filter(f=>f.usage_type===3).map(f=>f.name),target_field:c.target_field,classes:structuredClone(c.classes),event:c.event,threshold:c.threshold,intercept:c.intercept,epsilon:c.epsilon,
  normalization:'none',train_percent:100,validation:'none',calibration:'train',training:structuredClone(training),package_persistence_verified:false};
}
