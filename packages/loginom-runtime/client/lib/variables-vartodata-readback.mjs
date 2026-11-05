import {validateVariablesToTableOutputFields} from './variables-vartodata-parameters.mjs';
const need=(value,message)=>{if(!value)throw Error('Variables-to-table readback: '+message);};
export function variablesToTableConfigurationReadback({node,phases,operation_id}){
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const receipt=name=>{
  const matches=phases.filter(p=>p.phase===name),p=matches[0];
  need(matches.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name
   &&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name);
  return p;
 };
 const targeted=receipt('target'),configured=receipt('configure'),saved=receipt('node_finish'),mapped=receipt('output_mapping'),finished=receipt('finish');
 const c=configured.value.configuration,m=mapped.value.native_mapping;
 const links=targeted.value.target?.variable_links;
 need(Array.isArray(links)&&links.length===1,'one verified variable edge required');
 const edge=links[0];
 need(edge.kind==='variables'&&edge.target===node.node_id&&edge.input===0&&typeof edge.source==='string'&&edge.source!==node.node_id
  &&Number.isInteger(edge.output)&&edge.output>=0&&[edge.source_port_guid,edge.target_port_guid].every(v=>typeof v==='string'&&v.length>0),'typed variable edge ownership');
 need(c?.verified===true&&c.inventory_complete===true&&owner(c.node_context)&&['columns','rows'].includes(c.mode),'observed supported configuration');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&owner(configured.value.validation.node_context),'native validation');
 need(saved.value.settings_applied===true&&saved.value.mode==='done'&&owner(saved.value.node_context)
  &&finished.value.settings_applied===true&&['done','execute'].includes(finished.value.mode)&&owner(finished.value.node_context),'committed settings');
 need(m?.verified===true&&m.inventory_complete===true&&m.source_identity_verified===true&&owner(m.node_context)
  &&m.node_context.output_port?.port===0&&typeof m.autosync==='boolean'
  &&mapped.value.finish?.settings_applied===true&&owner(mapped.value.finish.node_context),'owned native output mapping');
 validateVariablesToTableOutputFields(m.source_fields,c.mode);
 need(Array.isArray(m.target_fields)&&m.target_fields.length===m.source_fields.length,'complete derived fields');
 const used=new Set();
 const fields=m.target_fields.map((f,index)=>{
  const source=f.source??f.exclusion_source;
  need(f.index===index&&source&&typeof source.record_id==='string'&&source.record_id.length>0&&!used.has(source.record_id)
   &&m.source_fields.filter(s=>JSON.stringify(s)===JSON.stringify(source)).length===1
   &&typeof f.excluded==='boolean'&&typeof f.name==='string'&&typeof f.label==='string'&&typeof f.data_kind==='string'
   &&f.type===source.type,'derived field identity');
  used.add(source.record_id);
  return {index,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind,excluded:f.excluded,source_name:source.name};
 });
 need(new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length,'unique output names');
 return {kind:'variables_to_table',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[targeted,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:c.mode,variable_input:{kind:'variables',source:{document_id:node.document_id,workflow_id:node.workflow_id,node_id:edge.source},output:edge.output,input:0,source_port_guid:edge.source_port_guid,target_port_guid:edge.target_port_guid},
  output_mapping:{port:0,autosync:m.autosync,fields},package_persistence_verified:false};
}
