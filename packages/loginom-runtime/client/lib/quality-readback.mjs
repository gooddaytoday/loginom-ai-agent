const need=(v,m)=>{if(!v)throw Error('Quality readback: '+m);};
export function qualityConfigurationReadback({node,phases,operation_id}){
 const phase=name=>{const xs=phases.filter(p=>p.phase===name),p=xs[0];need(xs.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name);return p;};
 const input=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish');
 const c=configured.value.configuration,im=input.value.native_mapping;
 const owner=n=>['document_id','workflow_id','node_id'].every(k=>n?.[k]===node[k]);
 need(c?.verified===true&&owner(c.node_context)&&owner(im?.node_context)&&im.source_identity_verified===true,'configuration/input owner');
 need(saved.value.settings_applied===true&&finished.value.settings_applied===true,'verified native finish');
 need(c.mode==='profile'&&mapped.value.ports?.length===5,'profile outputs');
 const project=fields=>fields.map(({name,label,type,data_kind})=>({name,label,type,data_kind}));
 need(JSON.stringify(project(c.fields))===JSON.stringify(project(im.target_fields)),'input fields changed');
 return {kind:'quality',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:'profile',fields:project(c.fields),
  hidden_settings:'not_exposed_by_native_wizard',output_schema_scope:'verified_on_read',package_persistence_verified:false};
}
