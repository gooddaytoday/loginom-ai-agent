export function supernodeConfigurationReadback({node,phases,operation_id}){
 const need=(v,m)=>{if(!v)throw Error('Supernode readback: '+m);};
 const receipt=name=>{
  const all=phases.filter(p=>p.phase===name),p=all[0];
  need(all.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name
   &&p.value?.verified===true&&p.value.cleanup_complete===true,'unique verified '+name+' required');return p;
 };
 const configured=receipt('configure'),committed=receipt('node_finish'),mapped=receipt('output_mapping'),finished=receipt('finish');
 const c=configured.value.configuration;
 need(c?.verified===true&&c.inventory_complete===true&&['tabular_boundary','variable_boundary'].includes(c.mode)
  &&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k]),'configuration owner differs');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&committed.value.settings_applied===true,'native Next and Done required');
 const boundary=Object.fromEntries(['input','output'].map(direction=>{
  const p=c.boundary?.[direction];
  const variable=direction==='input'&&c.mode==='variable_boundary';
  need(p?.kind===(variable?'variables':'table')&&typeof p.record_id==='string'&&p.record_id&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(p.name)
   &&typeof p.label==='string'&&p.label.length>0&&(direction!=='input'||variable||p.requirement==='required'),'complete observed table boundary required');
  if(variable){
   const v=mapped.value.variable_boundary;
   need(typeof v?.port_guid==='string'&&v.port_guid&&v.kind==='variables'&&v.definitions?.length>0
    &&v.definitions.every((d,i)=>d.index===i&&Number.isSafeInteger(d.id)&&d.type==='integer'&&Number.isSafeInteger(d.value)&&d.is_null===false),'complete observed variable definitions required');
   return [direction,{kind:p.kind,name:p.name,label:p.label,port_guid:v.port_guid,definitions:structuredClone(v.definitions)}];
  }
  return [direction,{kind:p.kind,name:p.name,label:p.label,...(direction==='input'?{requirement:p.requirement}:{})}];
 }));
 return {kind:'supernode',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[configured,committed,mapped,finished].map(p=>p.receipt_id),mode:c.mode,boundary,package_persistence_verified:false};
}
