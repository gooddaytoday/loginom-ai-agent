const need=(v,m)=>{if(!v)throw Error('Date/time readback: '+m);};
const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]));
export function dateTimeConfigurationReadback({node,phases,operation_id}){
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const receipt=name=>{const xs=phases.filter(p=>p.phase===name),p=xs[0];need(xs.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name);return p;};
 const input=receipt('input_mapping'),configured=receipt('configure'),saved=receipt('node_finish'),mapped=receipt('output_mapping'),finished=receipt('finish');
 const c=configured.value.configuration,m=mapped.value.native_mapping,im=input.value.native_mapping;
 need(c?.verified&&c.inventory_complete&&owner(c.node_context)&&Array.isArray(c.field_matrices)&&c.field_matrices.length===c.fields.length,'date/time configuration owner');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&owner(configured.value.validation.node_context),'date/time validation');
 need(saved.value.settings_applied===true&&saved.value.mode==='done'&&owner(saved.value.node_context)
  &&finished.value.settings_applied===true&&['done','execute'].includes(finished.value.mode)&&owner(finished.value.node_context),'date/time finish');
 need(m?.verified&&m.inventory_complete&&m.source_identity_verified&&m.mapping_wizard==='DerivedDataSourceOutputSocketWizard'
  &&owner(m.node_context)&&m.node_context.output_port?.port===0&&mapped.value.finish?.settings_applied===true,'derived output owner');
 need(im?.verified&&im.inventory_complete&&owner(im.node_context)&&im.node_context.input_port?.port===0&&input.value.finish?.settings_applied===true,'input owner');
 const inputFields=im.target_fields.map(f=>{const source=f.source;need(source&&im.source_fields.some(s=>s.record_id===source.record_id&&s.name===source.name),'input source');return {...pick(f,['index','name','label','type','data_kind']),source_name:source.name};});
 need(JSON.stringify(inputFields.map(f=>pick(f,['name','label','type'])))===JSON.stringify(c.input_fields.map(f=>pick(f,['name','label','type']))),'input schema differs');
 const linked=new Set();
 const output=m.target_fields.map((f,i)=>{
  const source=f.source??f.exclusion_source;
  need(f.index===i&&!f.inherited&&typeof f.excluded==='boolean'&&source
   &&m.source_fields.some(s=>JSON.stringify(s)===JSON.stringify(source))&&!linked.has(source.record_id),'derived source identity');
  linked.add(source.record_id);
  return {...pick(f,['index','name','label','type','data_kind','excluded']),source_name:source.name};
 });
 need(linked.size===m.source_fields.length,'derived source coverage');
 const fieldNames=new Set(),matrixKeys=['first','last','number','string'];let generatedCount=0;
 for(const f of c.field_matrices){
  need(c.fields.some(i=>i.name===f.name)&&!fieldNames.has(f.name)&&Array.isArray(f.matrix)&&f.matrix.length===29,'complete field matrix required');fieldNames.add(f.name);
  const keys=new Set();for(const r of f.matrix){const key=r.func+':'+r.iso;need(!keys.has(key)&&Number.isSafeInteger(r.func)&&r.func>=0&&r.func<=18&&typeof r.iso==='boolean'&&matrixKeys.every(k=>typeof r[k]==='boolean'),'unique native matrix row');keys.add(key);generatedCount+=matrixKeys.filter(k=>r[k]).length;}
 }
 need(m.source_fields.filter(f=>f.required).length===generatedCount,'generated output count differs from full matrix');
 return {kind:'date_time',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:'calendar',
  fields:structuredClone(c.field_matrices),input_mapping:{port:0,autosync:im.autosync,fields:inputFields},output_mapping:{port:0,autosync:m.autosync,fields:output},package_persistence_verified:false};
}
