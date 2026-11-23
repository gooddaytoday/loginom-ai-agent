import {DATA_TO_VAR_FUNCTIONS,dataToVarMask} from './variables-datatovar-parameters.mjs';

const need=(ok,message)=>{if(!ok)throw Error('Table to variables readback: '+message);};
const pick=(v,keys)=>Object.fromEntries(keys.map(k=>[k,v[k]]));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// This is configuration evidence, not a variable-value reader. The latter is
// owned by the shared typed variable-port path, including fresh execution.
export function dataToVarConfigurationReadback({node,phases,operation_id}){
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const receipt=phase=>{
  const xs=phases.filter(p=>p.phase===phase),p=xs[0];
  need(xs.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+phase
   &&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+phase+' receipt required');return p;
 };
 const input=receipt('input_mapping'),configured=receipt('configure'),saved=receipt('node_finish'),finished=receipt('finish');
 const c=configured.value.configuration,im=input.value.native_mapping;
 need(c?.verified===true&&c.inventory_complete===true&&owner(c.node_context)
  &&Array.isArray(c.input_fields)&&Array.isArray(c.fields)&&c.fields.length>0&&c.fields.length<=16,'complete native configuration owner required');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&owner(configured.value.validation.node_context),'native Next validation required');
 for(const [p,modes]of [[saved,['done']],[finished,['done','execute']]])need(modes.includes(p.value.mode)
  &&p.value.settings_applied===true&&owner(p.value.node_context),'verified settings finish required');
 need(im?.verified===true&&im.inventory_complete===true&&owner(im.node_context)&&im.node_context.input_port?.port===0
  &&input.value.finish?.verified===true&&input.value.finish.cleanup_complete===true
  &&input.value.finish.settings_applied===true&&owner(input.value.finish.node_context),'native input mapping owner required');
 need(Array.isArray(im.target_fields)&&Array.isArray(im.source_fields)&&im.target_fields.every(f=>!f.excluded),'complete active table input required');
 const inputFields=im.target_fields.map((f,index)=>{
  need(f.index===index&&f.source&&im.source_fields.filter(s=>s.record_id===f.source.record_id&&s.name===f.source.name).length===1,'exact table input source required');
  return {...pick(f,['index','name','label','type']),source_name:f.source.name};
 });
 need(same(inputFields.map(f=>pick(f,['name','label','type'])),c.input_fields.map(f=>pick(f,['name','label','type']))),'input schema differs from native configuration');
 need(new Set(c.input_fields.map(f=>f.record_id)).size===c.input_fields.length
  &&new Set(c.input_fields.map(f=>f.name.toLowerCase())).size===c.input_fields.length,'unique native input identities required');
 const seen=new Set(),fields=c.fields.map((f,index)=>{
  need(f.order===index&&f.role==='selected'&&!seen.has(f.record_id)
   &&c.input_fields.filter(x=>same(x,f)).length===1&&dataToVarMask(f.type,f.functions),'supported ordered native aggregation required');
  seen.add(f.record_id);
  return {...pick(f,['name','label','type','order']),aggregations:Object.keys(DATA_TO_VAR_FUNCTIONS).filter(a=>(f.functions&DATA_TO_VAR_FUNCTIONS[a])!==0)};
 });
 need(fields.reduce((n,f)=>n+f.aggregations.length,0)<=128,'bounded native variable definition required');
 return {kind:'variables_from_table',mode:'aggregate',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[input,configured,saved,finished].map(p=>p.receipt_id),fields,input_mapping:{port:0,autosync:im.autosync,fields:inputFields},
  output_port:0,port_kind:'variables',package_persistence_verified:false};
}
