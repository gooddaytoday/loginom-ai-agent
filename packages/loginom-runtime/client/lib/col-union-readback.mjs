import {validateColUnionOutput} from './col-union-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error('ColUnion readback: '+m);};
const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]));
const schema=fs=>fs.map(f=>pick(f,['name','label','type'])).sort((a,b)=>a.name.localeCompare(b.name));
export function colUnionConfigurationReadback({node,phases,operation_id}){
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const receipt=name=>{const xs=phases.filter(p=>p.phase===name),p=xs[0];need(xs.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name);return p;};
 const input=receipt('input_mapping'),configured=receipt('configure'),saved=receipt('node_finish'),mapped=receipt('output_mapping'),finished=receipt('finish');
 const c=configured.value.configuration,m=mapped.value.native_mapping;
 need(c?.verified&&c.inventory_complete&&owner(c.node_context)&&c.binding_ready===true,'configuration owner');
 need(['minimum','maximum','input'].includes(c.settings?.row_count)&&['null','repeat','last'].includes(c.settings.padding)
  &&Array.isArray(c.input_fields)&&c.input_fields.length===2,'explicit settings and both input schemas');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&owner(configured.value.validation.node_context),'validation');
 need(saved.value.settings_applied===true&&saved.value.mode==='done'&&owner(saved.value.node_context)
  &&finished.value.settings_applied===true&&['done','execute'].includes(finished.value.mode)&&owner(finished.value.node_context),'finish');
 need(input.value.ports?.length===c.input_fields.length,'all inputs required');
 const inputs=input.value.ports.map((p,port)=>{
  const im=p.native_mapping;need(p.port===port&&im?.verified&&im.inventory_complete&&im.source_identity_verified&&owner(im.node_context)&&im.node_context.input_port?.port===port&&c.sources?.[port]?.port_guid===im.node_context.input_port.port_guid&&p.finish?.settings_applied===true&&p.finish.mode==='done'&&owner(p.finish.node_context),'input owner');
  const seen=new Set(),fields=im.target_fields.map(f=>{const source=f.source;need(source&&!seen.has(source.record_id)&&im.source_fields.some(s=>JSON.stringify(s)===JSON.stringify(source)),'input source');seen.add(source.record_id);return {...pick(f,['index','name','label','type','data_kind']),source_name:source.name};});
  need(seen.size===im.source_fields.length&&JSON.stringify(schema(fields))===JSON.stringify(schema(c.input_fields[port])),'input schema differs');
  return {port,autosync:im.autosync,fields};
 });
 need(m?.verified&&m.inventory_complete&&m.source_identity_verified&&owner(m.node_context)&&m.node_context.output_port?.port===0&&mapped.value.finish?.settings_applied===true&&mapped.value.finish.mode==='done'&&owner(mapped.value.finish.node_context),'output owner');
 validateColUnionOutput(c,m);
 const linked=new Set(),fields=m.target_fields.map((f,i)=>{const source=f.source??f.exclusion_source;
  need(f.index===i&&typeof f.excluded==='boolean'&&source&&!linked.has(source.record_id)&&m.source_fields.some(s=>JSON.stringify(s)===JSON.stringify(source)),'output source identity');linked.add(source.record_id);
  return {...pick(f,['index','name','label','type','data_kind','excluded']),source_name:source.name};
 });need(linked.size===m.source_fields.length,'complete output sources');
 return {kind:'col_union',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),
  mode:'positional',settings:structuredClone(c.settings),input_mappings:inputs,
  output_mapping:{port:0,autosync:m.autosync,fields},package_persistence_verified:false};
}
