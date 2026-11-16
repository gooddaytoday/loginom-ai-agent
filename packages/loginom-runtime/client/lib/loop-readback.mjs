export function loopConfigurationReadback({node,phases,operation_id}){
 const need=(v,m)=>{if(!v)throw Error('Loop readback: '+m);};
 const phase=name=>{const ps=phases.filter(p=>p.phase===name),p=ps[0];need(ps.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name+' required');return p;};
 const c=phase('configure'),d=phase('node_finish'),o=phase('output_mapping'),f=phase('finish'),v=c.value.configuration;
 need(v?.verified===true&&['group_rows','for'].includes(v.mode)&&['document_id','workflow_id','node_id'].every(k=>v.node_context?.[k]===node[k]),'configuration owner differs');
 need(c.value.validation?.status==='accepted_by_loginom_next'&&d.value.settings_applied===true&&f.value.settings_applied===true,'native Next/Done/finish required');
 need(v.body.ref.document_id===node.document_id&&v.body.ref.workflow_id===node.workflow_id&&v.body.ref.node_id!==node.node_id,'body scope differs');
 const ports=o.value.actual_ports,vendor=o.value.derived_component;
 need(typeof vendor?.module==='string'&&Number.isSafeInteger(vendor.instance),'saved derived component required');
 need(ports?.length===2&&ports[0].direction==='input'&&ports[1].direction==='output'&&ports.every((p,i)=>p.kind===(v.mode==='for'&&i===0?'variables':'table')&&p.index===0&&typeof p.guid==='string'),'complete actual ports required');
 need(ports[0].guid===v.input_port.guid,'group input identity changed');
 const s=v.settings;
 if(v.mode==='for'){
  const variable=s.variable_identity,saved=o.value.saved_configuration;
  need(s.for===true&&s.count_literal===true&&/^[1-9][0-9]*$/.test(s.count)&&Number.isSafeInteger(Number(s.count))
   &&!s.parallel&&!s.ignore_errors&&!s.save_configuration&&typeof s.identifiers==='boolean'
   &&variable?.port_guid===ports[0].guid&&Number.isSafeInteger(variable.definition_id)&&variable.type==='integer'&&variable.selected===true,'unsupported FOR settings');
  need(saved?.count===Number(s.count)&&saved.iteration_identifiers===s.identifiers
   &&saved.variable?.definition_id===variable.definition_id&&saved.variable.port_guid===variable.port_guid
   &&saved.variable.name===variable.name&&saved.variable.type===variable.type,'saved FOR readback differs');
  return {kind:'loop',scope:'observed_before_verified_finish',values_are:'observed_ui_values',mode:'for',node:structuredClone(node),receipt_ids:[c,d,o,f].map(p=>p.receipt_id),
   body:structuredClone(v.body),derived_component:structuredClone(vendor),count:Number(s.count),variable:structuredClone(saved.variable),input_port:structuredClone(v.input_port),parallel:false,iteration_identifiers:s.identifiers,ignore_errors:false,save_configuration:false,ports:structuredClone(ports),package_persistence_verified:false};
 }
 need(s.group===true&&s.group_size==='1'&&!s.parallel&&!s.identifiers&&!s.ignore_errors&&!s.save_configuration&&s.variable==='','unsupported observed settings');
 return {kind:'loop',scope:'observed_before_verified_finish',values_are:'observed_ui_values',mode:'group_rows',node:structuredClone(node),receipt_ids:[c,d,o,f].map(p=>p.receipt_id),
  body:structuredClone(v.body),derived_component:structuredClone(o.value.derived_component),group_size:1,input_port:structuredClone(v.input_port),parallel:false,iteration_identifiers:false,ignore_errors:false,save_configuration:false,ports:structuredClone(ports),package_persistence_verified:false};
}
