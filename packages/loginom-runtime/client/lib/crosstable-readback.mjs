import {resolveCrossTableSchema} from './crosstable-schema.mjs';
const need=(v,m)=>{if(!v)throw Error('CrossTable readback: '+m);};
const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]));
export function crossTableConfigurationReadback({node,phases,operation_id}){
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const receipt=name=>{const xs=phases.filter(p=>p.phase===name),p=xs[0];
  need(xs.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name);return p;};
 const input=receipt('input_mapping'),configured=receipt('configure'),saved=receipt('node_finish'),mapped=receipt('output_mapping'),finished=receipt('finish');
 const c=configured.value.configuration,im=input.value.native_mapping;
 need(c?.verified&&c.inventory_complete&&owner(c.node_context)&&c.kind==='crosstable','configuration owner');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&owner(configured.value.validation.node_context),'native validation');
 need(im?.verified&&im.inventory_complete&&owner(im.node_context)&&im.node_context.input_port?.port===0
  &&input.value.finish?.settings_applied===true,'input definition owner');
 need(saved.value.mode==='done'&&saved.value.settings_applied===true&&owner(saved.value.node_context),'native settings finish');
 need(mapped.value.deferred_schema===true&&owner(mapped.value.node_context),'deferred schema owner');
 need(['done','execute'].includes(finished.value.mode)&&owner(finished.value.node_context),'graph finish owner');
 const field=f=>pick(f,['name','label','type','order']);
 const result={kind:'crosstable',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:'pivot',category_mode:c.category_mode,
  row_keys:c.row_keys.map(field),column:c.column?pick(c.column,['name','label','type']):null,columns:(c.columns??(c.column?[c.column]:[])).map(field),
  facts:c.facts.map(f=>({...field(f),functions:[...f.functions]})),options:{...c.options},
  output_scope:'not_materialized',execution_id:null,category_fields:[],package_persistence_verified:false};
 if(finished.value.mode==='execute'&&phases.some(p=>p.phase==='read')){
  const executed=receipt('execute'),read=receipt('read'),port=read.value.ports?.[0];
  need(executed.value.status==='completed'&&executed.value.owner_verified===true&&typeof executed.value.execution_id==='string'
   &&port?.port===0&&port.fresh===true&&port.execution_id===executed.value.execution_id,'fresh output ownership');
  const schema=resolveCrossTableSchema(port.schema,result);
  need(JSON.stringify(schema.category_fields)===JSON.stringify(port.category_fields),'materialized category identities differ');
  result.receipt_ids.push(executed.receipt_id,read.receipt_id);result.execution_id=executed.value.execution_id;
  result.output_scope='observed_after_verified_execution';result.category_fields=schema.category_fields;
 }
 return result;
}
