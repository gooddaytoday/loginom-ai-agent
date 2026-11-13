export function conditionConfigurationReadback({node,phases,operation_id}){
 const need=(v,m)=>{if(!v)throw Error('Condition readback: '+m);};
 const receipt=phase=>{const ps=phases.filter(p=>p.phase===phase),p=ps[0];need(ps.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+phase&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+phase+' required');return p;};
 const c=receipt('configure'),f=receipt('finish'),configuration=c.value.configuration;
 const owner=context=>context?.verified===true&&['document_id','workflow_id','node_id'].every(k=>context[k]===node[k]);
 need(configuration?.verified===true&&['ports','variable_branch'].includes(configuration.mode)&&owner(configuration.node_context),'owned configuration required');
 need(c.value.validation?.status==='accepted_by_loginom_next'&&owner(c.value.validation.node_context),'native validation required');
 need(f.value.settings_applied===true&&owner(f.value.node_context)&&['done','execute'].includes(f.value.mode),'verified finish required');
 need(configuration.ports.length===2&&configuration.ports[0].kind==='table'&&configuration.ports[1].kind==='variables'&&configuration.ports.every(p=>p.pass_to_output===true),'table and variables inputs passed to every branch required');
 need(configuration.branches.length===1&&configuration.debug_mode===false,'one user branch without debug required');
 const branch=configuration.branches[0];
 return {kind:'control_condition',mode:configuration.mode,scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[c.receipt_id,f.receipt_id],
  inputs:[{kind:'table',port:0,label:configuration.ports[0].label},{kind:'variables',port:0,label:configuration.ports[1].label}],
  branches:[{name:branch.name,output_port:0,conditions:configuration.conditions?structuredClone(configuration.conditions).map(({variable,relation,value})=>({variable,relation,value})):null},
   {name:'Иначе',output_port:1,conditions:null}],
  pass_to_output:true,debug_mode:false,package_persistence_verified:false};
}
