export function loopConfigurationReadback({node,phases,operation_id}){
 const need=(v,m)=>{if(!v)throw Error('Loop readback: '+m);};
 const phase=name=>{const ps=phases.filter(p=>p.phase===name),p=ps[0];need(ps.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name+' required');return p;};
 const c=phase('configure'),d=phase('node_finish'),o=phase('output_mapping'),f=phase('finish'),v=c.value.configuration;
 need(v?.verified===true&&v.mode==='group_rows'&&['document_id','workflow_id','node_id'].every(k=>v.node_context?.[k]===node[k]),'configuration owner differs');
 need(c.value.validation?.status==='accepted_by_loginom_next'&&d.value.settings_applied===true&&f.value.settings_applied===true,'native Next/Done/finish required');
 need(v.body.ref.document_id===node.document_id&&v.body.ref.workflow_id===node.workflow_id&&v.body.ref.node_id!==node.node_id,'body scope differs');
 const ports=o.value.actual_ports;
 need(ports?.length===2&&ports[0].direction==='input'&&ports[1].direction==='output'&&ports.every(p=>p.kind==='table'&&p.index===0&&typeof p.guid==='string'),'complete actual ports required');
 need(ports[0].guid===v.input_port.guid,'group input identity changed');
 const s=v.settings;
 need(s.group===true&&s.group_size==='1'&&!s.parallel&&!s.identifiers&&!s.ignore_errors&&!s.save_configuration&&s.variable==='','unsupported observed settings');
 return {kind:'loop',scope:'observed_before_verified_finish',values_are:'observed_ui_values',mode:'group_rows',node:structuredClone(node),receipt_ids:[c,d,o,f].map(p=>p.receipt_id),
  body:structuredClone(v.body),derived_component:structuredClone(v.derived_component),group_size:1,input_port:structuredClone(v.input_port),parallel:false,iteration_identifiers:false,ignore_errors:false,save_configuration:false,ports:structuredClone(ports),package_persistence_verified:false};
}
