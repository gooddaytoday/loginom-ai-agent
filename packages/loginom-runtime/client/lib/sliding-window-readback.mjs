import {slidingWindowOutputOrigins} from './sliding-window-output.mjs';
const need=(v,m)=>{if(!v)throw Error('Sliding window readback: '+m);};
export function slidingWindowConfigurationReadback({node,phases,operation_id}){
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const receipt=name=>{const xs=phases.filter(p=>p.phase===name),p=xs[0];need(xs.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name);return p;};
 const input=receipt('input_mapping'),configured=receipt('configure'),saved=receipt('node_finish'),mapped=receipt('output_mapping'),finished=receipt('finish');
 const c=configured.value.configuration,im=input.value.native_mapping,m=mapped.value.native_mapping;
 need(c?.verified&&c.inventory_complete&&owner(c.node_context),'complete configuration owner');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&owner(configured.value.validation.node_context),'accepted configuration');
 need(saved.value.settings_applied===true&&saved.value.mode==='done'&&owner(saved.value.node_context)
  &&finished.value.settings_applied===true&&['done','execute'].includes(finished.value.mode)&&owner(finished.value.node_context),'verified finish');
 need(im?.verified&&im.inventory_complete&&owner(im.node_context)&&im.node_context.input_port?.port===0&&input.value.finish?.settings_applied===true,'input owner');
 need(JSON.stringify(im.target_fields.map(({name,label,type})=>({name,label,type})))===JSON.stringify(c.fields.map(({name,label,type})=>({name,label,type}))),'input schema differs');
 need(m?.verified&&m.inventory_complete&&m.source_identity_verified&&owner(m.node_context)&&m.node_context.output_port?.port===0&&mapped.value.finish?.settings_applied===true,'output owner');
 const origins=slidingWindowOutputOrigins(c,m.source_fields),linked=new Set();
 const output=m.target_fields.map((f,index)=>{
  const source=f.source??f.exclusion_source,origin=source&&origins.find(o=>o.record_id===source.record_id);
  need(f.index===index&&origin&&!linked.has(source.record_id)&&m.source_fields.some(s=>JSON.stringify(s)===JSON.stringify(source))&&f.type===origin.type,'output source correspondence');linked.add(source.record_id);
  return {name:f.name,label:f.label,type:f.type,source_field:origin.source_field,offset:origin.offset,excluded:f.excluded};
 });
 need(linked.size===origins.length,'complete output coverage');
 return {kind:'sliding_window',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:'lag',
  incomplete_records:c.incomplete_records,windows:c.fields.map(f=>({field:f.name,history:f.history,horizon:f.horizon})),output_port:0,fields:output,package_persistence_verified:false};
}
