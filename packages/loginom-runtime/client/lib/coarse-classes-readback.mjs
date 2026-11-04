const need=(v,m)=>{if(!v)throw Error('Coarse classes readback: '+m);};
export function coarseClassesConfigurationReadback({node,phases,operation_id}){
 const phase=name=>{const ps=phases.filter(p=>p.phase===name),p=ps[0];need(ps.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified&&p.value.cleanup_complete,'verified '+name+' required');return p;};
 const input=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish');
 const c=configured.value.configuration,training=finished.value.training??{status:'not_requested'},applying=c?.mode==='apply';
 need(c?.verified&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k]),'configuration owner changed');
 need(applying?saved.value.settings_applied===false&&saved.value.draft_discarded===true&&finished.value.settings_applied===false&&training.status==='not_requested':configured.value.validation?.status==='accepted_by_loginom_next'&&saved.value.settings_applied===true&&finished.value.settings_applied===true,'internal commits; apply must discard its draft without training');
 need(applying||finished.value.mode!=='execute'||training.status==='trained'&&training.execution_id!==finished.value.execution_id&&training.source?.length===1,'separate current-input training required');
 need(!applying||c.state==='materialized'&&c.classes.length>0,'saved materialized classes required');
 need(mapped.value.ports?.length===3&&mapped.value.ports.every((p,i)=>p.port===i&&p.schema.length>0),'three exact output mappings required');
 return {kind:'coarse_classes',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:c.mode,
  ...Object.fromEntries(['input_field','target_field','event_value','partition','min_class_percent','max_classes','uniformity_percent','roles'].map(k=>[k,structuredClone(c[k])])),
  state:(training.model??c).state,classes:structuredClone((training.model??c).classes),training:structuredClone(training),output_mappings:mapped.value.ports.map(p=>({port:p.port,fields:p.schema.map((f,index)=>({...f,index,source_name:f.name}))})),package_persistence_verified:false};
}
