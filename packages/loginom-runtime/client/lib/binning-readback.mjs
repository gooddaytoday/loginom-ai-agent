const need=(v,m)=>{if(!v)throw Error('Binning readback: '+m);};
export function binningConfigurationReadback({node,phases,operation_id}){
 const phase=name=>{const ps=phases.filter(p=>p.phase===name),p=ps[0];need(ps.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified&&p.value.cleanup_complete,'verified '+name+' required');return p;};
 const input=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish');
 const c=configured.value.configuration,training=finished.value.training??{status:'not_requested'},applying=c?.mode==='apply';
 need(c?.verified&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k]),'configuration owner changed');
 need(applying?saved.value.settings_applied===false&&saved.value.draft_discarded===true&&finished.value.settings_applied===false&&training.status==='not_requested':configured.value.validation?.status==='accepted_by_loginom_next'&&saved.value.settings_applied===true&&finished.value.settings_applied===true,'settings must be committed for internal or preserved for apply');
 need(applying||finished.value.mode!=='execute'||training.status==='trained'&&training.execution_id!==finished.value.execution_id&&training.source?.length===1,'separate training on current input must precede Execute');
 const model=training.model??c;
 need(!applying||model.state==='materialized'&&model.intervals.length>0,'apply requires materialized saved intervals');
 need(mapped.value.ports?.length===2&&mapped.value.ports.every((p,i)=>p.port===i&&p.schema.length>0),'both output mappings required');
 return {kind:'binning',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),
  mode:applying?'apply':'internal',field:c.field,type:c.type,method:c.method,size:c.size,limits:c.limits??null,rounding:false,open_ends:false,ties:c.method==='frequency'?'next':null,
  state:model.state,intervals:structuredClone(model.intervals),training:structuredClone(training),output_mappings:mapped.value.ports.map(p=>({port:p.port,fields:p.schema.map((f,index)=>({...f,index,source_name:f.name}))})),package_persistence_verified:false};
}
