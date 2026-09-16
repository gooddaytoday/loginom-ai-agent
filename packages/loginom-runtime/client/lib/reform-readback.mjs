import {bindReformInput} from './reform-input.mjs';
import {reformOutputSources} from './reform-output.mjs';
const need=(v,m)=>{if(!v)throw Error('Reform readback: '+m);};
const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]));
export function reformConfigurationReadback({node,phases,operation_id}){
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const receipt=name=>{const xs=phases.filter(p=>p.phase===name),p=xs[0];need(xs.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name);return p;};
 const input=receipt('input_mapping'),configured=receipt('configure'),saved=receipt('node_finish'),mapped=receipt('output_mapping'),finished=receipt('finish');
 const c=configured.value.configuration,im=input.value.native_mapping,m=mapped.value.native_mapping;
 need(c?.source_identity_verified===true&&owner(c.node_context),'configured owner and source identity');
 const bound=bindReformInput(c,im);need(JSON.stringify(bound.fields)===JSON.stringify(c.fields),'retained incoming correspondence');
 reformOutputSources(c,m);
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&owner(configured.value.validation.node_context),'Loginom validation');
 need(['unrequested_fields','unrequested_properties','caching'].every(k=>configured.value.preservation?.[k]===true),'preservation proof');
 need(saved.value.settings_applied===true&&saved.value.mode==='done'&&owner(saved.value.node_context)
  &&finished.value.settings_applied===true&&['done','execute'].includes(finished.value.mode)&&owner(finished.value.node_context),'settings finish');
 need(input.value.finish?.settings_applied===true&&mapped.value.finish?.settings_applied===true
  &&m.node_context.output_port?.port===0,'port finish');
 const linked=new Set(),output=m.target_fields.map((field,index)=>{
  const source=field.source??field.exclusion_source;
  need(field.index===index&&typeof field.excluded==='boolean'&&source&&!linked.has(source.record_id)
   &&m.source_fields.some(s=>JSON.stringify(s)===JSON.stringify(source)),'exact output source link');linked.add(source.record_id);
  return {...pick(field,['index','name','label','type','data_kind','excluded']),source_name:source.name};
 });
 need(linked.size===m.source_fields.length,'complete output source coverage');
 return {kind:'field_parameters',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),
  fields:c.fields.map(f=>({...pick(f,['index','field_id','name','label','type','data_kind','usage_type','caching_method','excluded']),input_field:structuredClone(f.input_field)})),
  caching:structuredClone(c.caching),preservation:structuredClone(configured.value.preservation),
  input_mapping:{port:0,autosync:im.autosync,fields:im.target_fields.map(f=>({...pick(f,['index','field_id','name','label','type','data_kind']),source_name:f.source.name}))},
  output_mapping:{port:0,autosync:m.autosync,fields:output},package_persistence_verified:false};
}
