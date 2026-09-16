import {filterConditionMatches} from './filter-procedure.mjs';
const need=(ok,message)=>{if(!ok)throw Error('Filter readback: '+message);};
const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]));
export function filterConfigurationReadback({node,phases,operation_id}){
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const receipt=name=>{const xs=phases.filter(p=>p.phase===name),p=xs[0];need(xs.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name);return p;};
 const input=receipt('input_mapping'),configured=receipt('configure'),saved=receipt('node_finish'),mapped=receipt('output_mapping'),finished=receipt('finish');
 const c=configured.value.configuration,im=input.value.native_mapping,groups=configured.value.groups;
 need(c?.verified&&c.inventory_complete&&owner(c.node_context)&&c.rows?.length,'configuration owner');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&owner(configured.value.validation.node_context),'validation');
 need(saved.value.settings_applied===true&&saved.value.mode==='done'&&owner(saved.value.node_context)
  &&finished.value.settings_applied===true&&['done','execute'].includes(finished.value.mode)&&owner(finished.value.node_context),'finish');
 need(im?.verified&&im.inventory_complete&&owner(im.node_context)&&im.node_context.input_port?.port===0&&input.value.finish?.settings_applied===true,'input owner');
 const inputFields=im.target_fields.map(f=>{need(f.source&&im.source_fields.some(s=>s.record_id===f.source.record_id&&s.name===f.source.name),'input source');return {...pick(f,['index','name','label','type','data_kind']),source_name:f.source.name};});
 const schema=fields=>fields.map(f=>pick(f,['name','label','type'])).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 need(JSON.stringify(schema(inputFields))===JSON.stringify(schema(c.input_fields)),'input schema differs');
 const flat=groups.flatMap((group,i)=>[...(i?[null]:[]),...group]);need(flat.length===c.rows.length,'condition count');
 need(flat.every((w,i)=>w?filterConditionMatches(c.rows[i],w):c.rows[i].kind==='or'),'condition readback');
 need(mapped.value.ports?.length===2,'both mappings required');
 const outputs=mapped.value.ports.map((p,port)=>{
  const m=p.native_mapping;need(p.port===port&&m?.verified&&m.inventory_complete&&m.source_identity_verified&&owner(m.node_context)
   &&m.node_context.output_port?.port===port&&p.finish?.settings_applied===true,'output owner');
  const links=new Set(),fields=m.target_fields.map((f,index)=>{
   const source=f.source??f.exclusion_source;need(f.index===index&&source&&m.source_fields.some(s=>JSON.stringify(s)===JSON.stringify(source))&&!links.has(source.record_id),'output source link');links.add(source.record_id);
   return {...pick(f,['index','name','label','type','data_kind','excluded']),source_name:source.name};
  });need(links.size===m.source_fields.length,'complete output schema');return {port,autosync:m.autosync,fields};
 });
 return {kind:'row_filter',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),
  groups:structuredClone(groups),input_mapping:{port:0,autosync:im.autosync,fields:inputFields},output_mappings:outputs,package_persistence_verified:false};
}
