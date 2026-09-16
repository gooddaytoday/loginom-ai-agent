// Project verified UI receipts, never request parameters or calculated values.
const requireValue=(v,m)=>{if(!v)throw Error('Calculator readback: '+m);};
const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]));
export function calculatorConfigurationReadback({node,phases,operation_id}) {
 const receipt=name=>{
  const matches=phases.filter(p=>p.phase===name),p=matches[0];
  requireValue(matches.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name
   &&p.value?.verified===true&&p.value.cleanup_complete===true,'unique verified '+name+' required');return p;
 };
 const incoming=receipt('input_mapping'),configured=receipt('configure'),nodeFinished=receipt('node_finish'),mapped=receipt('output_mapping'),finished=receipt('finish');
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const c=configured.value.configuration,m=mapped.value.native_mapping;
 requireValue(c?.verified===true&&c.inventory_complete===true&&c.mode==='expression'&&owner(c.node_context), 'expression owner differs');
 requireValue(configured.value.syntax_validation?.status==='accepted_by_loginom_next'
  &&owner(configured.value.syntax_validation.node_context),'syntax was not accepted');
 requireValue(nodeFinished.value.mode==='done'&&nodeFinished.value.settings_applied===true&&owner(nodeFinished.value.node_context)
  &&finished.value.settings_applied===true&&['done','execute'].includes(finished.value.mode)&&owner(finished.value.node_context), 'finish differs');
 requireValue(Array.isArray(c.expressions)&&c.expressions.length>0&&c.expressions.length<=128
  &&new Set(c.expressions.map(e=>e.name.toLowerCase())).size===c.expressions.length
  &&c.expressions.every((e,i)=>e.index===i&&typeof e.formula==='string'&&e.formula.length<=2048
   &&['name','label','type','description'].every(k=>typeof e[k]==='string')
   &&['replace','intermediate','cached'].every(k=>typeof e[k]==='boolean')),'incomplete expressions');
 requireValue(Array.isArray(c.input_fields)&&c.input_fields.length<=1000,'incomplete input fields');
 requireValue(m?.verified===true&&m.inventory_complete===true&&m.source_identity_verified===true&&owner(m.node_context)
  &&mapped.value.source_identity_verified===true&&typeof m.autosync==='boolean'
  &&m.node_context.output_port?.direction==='output'&&m.node_context.output_port.port===0
  &&Array.isArray(m.source_fields)&&Array.isArray(m.target_fields)&&m.target_fields.length<=1000,'output mapping differs');
 const projectMapping=(mapping,direction)=>{
  requireValue(mapping?.verified===true&&mapping.inventory_complete===true&&mapping.source_identity_verified===true
   &&owner(mapping.node_context)&&mapping.node_context[direction+'_port']?.direction===direction
   &&mapping.node_context[direction+'_port'].port===0&&typeof mapping.autosync==='boolean'
   &&Array.isArray(mapping.source_fields)&&Array.isArray(mapping.target_fields),'owned '+direction+' mapping required');
  const fields=mapping.target_fields.map((f,i)=>{
   const source=f.source??f.exclusion_source,matches=mapping.source_fields.filter(s=>s.record_id===source?.record_id);
   requireValue(matches.length===1&&JSON.stringify(matches[0])===JSON.stringify(source)&&f.index===i
    &&(typeof f.excluded==='boolean'||direction==='input'&&f.excluded===undefined)&&['name','label','type','data_kind'].every(k=>typeof f[k]==='string'), 'mapping source differs');
   return {...pick(f,['index','name','label','type','data_kind']),excluded:f.excluded??false,source_name:source.name};
  });
  requireValue(new Set(fields.map(f=>f.source_name)).size===mapping.source_fields.length&&fields.length===mapping.source_fields.length,'incomplete mapping');
  return {port:0,autosync:mapping.autosync,fields};
 };
 const input_mapping=projectMapping(incoming.value.native_mapping,'input'),output_mapping=projectMapping(m,'output');
 requireValue(incoming.value.source_identity_verified===true&&incoming.value.finish?.settings_applied===true
  &&owner(incoming.value.finish.node_context),'input mapping was not accepted');
 requireValue(JSON.stringify(input_mapping.fields.map(f=>pick(f,['name','label','type'])))
  ===JSON.stringify(c.input_fields.map(f=>pick(f,['name','label','type']))),'configured input schema differs');
 return {kind:'calculator',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[incoming,configured,nodeFinished,mapped,finished].map(p=>p.receipt_id),mode:'expression',
  expressions:c.expressions.map(e=>pick(e,['index','name','label','type','formula','replace','intermediate','cached','description'])),
  input_fields:c.input_fields.map(f=>pick(f,['name','label','type'])),
  syntax_validation:'accepted_by_loginom_next',input_mapping,output_mapping,package_persistence_verified:false};
}
