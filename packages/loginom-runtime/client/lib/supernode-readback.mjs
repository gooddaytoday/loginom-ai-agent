export function supernodeConfigurationReadback({node,phases,operation_id}){
 const need=(v,m)=>{if(!v)throw Error('Supernode readback: '+m);};
 const receipt=name=>{
  const all=phases.filter(p=>p.phase===name),p=all[0];
  need(all.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name
   &&p.value?.verified===true&&p.value.cleanup_complete===true,'unique verified '+name+' required');return p;
 };
 const configured=receipt('configure'),committed=receipt('node_finish'),mapped=receipt('output_mapping'),finished=receipt('finish');
 const c=configured.value.configuration;
 need(c?.verified===true&&c.inventory_complete===true&&c.mode==='tabular_boundary'
  &&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k]),'configuration owner differs');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&committed.value.settings_applied===true,'native Next and Done required');
 const boundary=Object.fromEntries(['input','output'].map(direction=>{
  const p=c.boundary?.[direction];
  need(p?.kind==='table'&&typeof p.record_id==='string'&&p.record_id&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(p.name)
   &&typeof p.label==='string'&&p.label.length>0&&(direction!=='input'||p.requirement==='required'),'complete observed table boundary required');
  return [direction,{kind:p.kind,name:p.name,label:p.label,...(direction==='input'?{requirement:p.requirement}:{})}];
 }));
 return {kind:'supernode',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[configured,committed,mapped,finished].map(p=>p.receipt_id),mode:'tabular_boundary',boundary,package_persistence_verified:false};
}
