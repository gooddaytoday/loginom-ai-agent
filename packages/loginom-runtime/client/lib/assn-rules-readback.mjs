const need=(v,m)=>{if(!v)throw Error('Association rules readback: '+m);};
export function assnRulesConfigurationReadback({node,phases,operation_id}){
 const phase=name=>{const rows=phases.filter(p=>p.phase===name);need(rows.length===1&&rows[0].status==='verified'&&rows[0].receipt_id===operation_id+':'+name&&rows[0].value?.verified===true&&rows[0].value.cleanup_complete===true,'verified '+name);return rows[0];};
 const input=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish');
 const c=configured.value.configuration,training=finished.value.training??{status:'not_requested'};
 need(c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k]),'configuration owner changed');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&saved.value.settings_applied===true&&finished.value.settings_applied===true,'settings were not committed');
 need(finished.value.mode!=='execute'||training.status==='trained'&&training.execution_id!==finished.value.execution_id&&training.source?.length>=1&&training.source.length<=2&&training.source.some(s=>s.input===0)&&training.source.every(s=>[0,1].includes(s.input)&&s.node)&&new Set(training.source.map(s=>s.input)).size===training.source.length,'training on the connected source must complete before Execute');
 return {kind:'assn_rules',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:'fp_growth',
  transaction_field:c.fields.find(f=>f.usage_type===c.roles.transaction)?.name,item_field:c.fields.find(f=>f.usage_type===c.roles.item)?.name,
  min_support_pct:c.min_support_pct,min_confidence_pct:c.min_confidence_pct,max_items:c.max_items,selected_item_field:c.auxiliary?.fields.find(f=>f.usage_type===c.auxiliary.roles.item)?.name??null,contain_selected_items:c.contain_selected_items??false,exclude_support_above_pct:c.exclude_support_above_pct??null,min_lift:c.min_lift,singletons:true,consequence_limit:c.max_consequents,training:structuredClone(training),package_persistence_verified:false};
}
