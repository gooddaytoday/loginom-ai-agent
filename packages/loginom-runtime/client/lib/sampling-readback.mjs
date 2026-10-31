const need=(v,m)=>{if(!v)throw Error('Sequential readback: '+m);};
export function samplingConfigurationReadback({node,phases,operation_id}){
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const phase=name=>{const rows=phases.filter(p=>p.phase===name),p=rows[0];need(rows.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name);return p;};
 const input=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish');
 const c=configured.value.configuration;
 need(c?.verified&&c.inventory_complete&&owner(c.node_context)&&owner(input.value.native_mapping?.node_context),'configuration owner');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&owner(configured.value.validation.node_context)&&saved.value.settings_applied===true&&owner(saved.value.node_context)&&finished.value.settings_applied===true&&owner(finished.value.node_context),'settings not committed');
 need(mapped.value.ports.length===(c.kind==='data_partition'?3:1),'complete output schemas required');
 for(const [index,p] of mapped.value.ports.entries()){
  const m=p.native_mapping;
  need(p.port===index&&m?.verified&&m.inventory_complete&&m.source_identity_verified&&owner(m.node_context)&&m.node_context.output_port?.port===index
   &&p.finish?.verified&&p.finish.cleanup_complete&&p.finish.settings_applied&&owner(p.finish.node_context),'output mapping owner or finish differs');
  const fields=m.target_fields.filter(f=>!f.excluded).map(({name,label,type,data_kind})=>({name,label,type,data_kind}));
  need(JSON.stringify(fields)===JSON.stringify(p.schema),'retained output schema differs');
 }
 return {kind:c.kind,scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:c.mode??'sequential',counts:c.counts,groups:c.groups,...(c.mode&&c.mode!=='sequential'?{seed:c.seed,strata_fields:c.strata?.rows.filter(r=>r.values.UsageFlag).map(r=>r.values.Name)??[],bias_field:c.bias_fields?.rows.find(r=>r.selected)?.values.Name??null,bias_factors:c.bias?.rows.map(r=>({value:r.values.Value,factor:r.values.Factor}))??[],test_priority:c.test_priority??false}:{}),
  output_mappings:mapped.value.ports.map(p=>({port:p.port,fields:p.schema.map((f,index)=>({...f,index,source_name:f.name}))})),package_persistence_verified:false};
}
