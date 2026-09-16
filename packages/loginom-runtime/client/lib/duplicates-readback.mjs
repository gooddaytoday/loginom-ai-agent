import {bindReformInput} from './reform-input.mjs';
import {DUPLICATES_OUTPUT} from './duplicates-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error('Duplicates readback: '+m);};
export function duplicatesConfigurationReadback({node,phases,operation_id}){
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const receipt=name=>{const xs=phases.filter(p=>p.phase===name),p=xs[0];need(xs.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name);return p;};
 const input=receipt('input_mapping'),configured=receipt('configure'),saved=receipt('node_finish'),mapped=receipt('output_mapping'),finished=receipt('finish');
 const c=configured.value.configuration,im=input.value.native_mapping,m=mapped.value.native_mapping;
 need(owner(c?.node_context)&&c.source_identity_verified===true,'configured owner');
 need(JSON.stringify(bindReformInput(c,im).fields)===JSON.stringify(c.fields),'incoming correspondence');
 need(c.fields.some(f=>f.usage_type===3)&&c.fields.every(f=>[0,3,4].includes(f.usage_type)),'complete valid roles');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&owner(configured.value.validation.node_context),'accepted roles');
 need(saved.value.settings_applied===true&&saved.value.mode==='done'&&owner(saved.value.node_context)
  &&finished.value.settings_applied===true&&['done','execute'].includes(finished.value.mode)&&owner(finished.value.node_context),'verified finish');
 const expected=[...DUPLICATES_OUTPUT,...c.fields];
 need(owner(m?.node_context)&&m.node_context.output_port?.port===0&&m.inventory_complete===true&&m.source_identity_verified===true
  &&mapped.value.finish?.settings_applied===true&&input.value.finish?.settings_applied===true,'verified port mapping');
 need(m.source_fields.length===expected.length&&m.target_fields.length===expected.length,'complete output');
 const linked=new Set(),names=new Set();
 const expectedByName=new Map(expected.map(f=>[f.name,f]));
 need(expectedByName.size===expected.length,'unique expected output fields');
 need(m.target_fields.every((f,i)=>{
  const source=f.source,definition=expectedByName.get(f.name);
  if(f.index!==i||f.excluded!==false||!source||linked.has(source.record_id)
   ||!definition||names.has(f.name)
   ||m.source_fields.filter(s=>JSON.stringify(s)===JSON.stringify(source)).length!==1)return false;
  linked.add(source.record_id);
  names.add(f.name);
  return ['name','label','type'].every(k=>f[k]===definition[k]&&source[k]===definition[k]);
 })&&linked.size===m.source_fields.length,'service fields and all original fields preserved');
 return {kind:'duplicates',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),
  fields:c.fields.map(({index,field_id,name,label,type,data_kind,usage_type,input_field})=>({index,field_id,name,label,type,data_kind,usage_type,input_field})),
  input_mapping:{port:0,fields:im.target_fields.map(f=>({name:f.name,source_name:f.source.name}))},
  output_mapping:{port:0,fields:m.target_fields.map(f=>({name:f.name,label:f.label,type:f.type,source_name:f.source.name}))},package_persistence_verified:false};
}
