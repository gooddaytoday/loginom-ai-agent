const need=(v,m)=>{if(!v)throw Error('Reform input binding: '+m);};
const owner=(a,b)=>a?.verified===true&&b?.verified===true&&['document_id','workflow_id','node_id'].every(k=>typeof a[k]==='string'&&a[k]===b[k]);
// Loginom preserves the incoming field ID through reform renames, exclusions,
// type changes and incoming reordering. Ext record IDs belong to each editor;
// labels and positions are not a correspondence. Never fall back to either.
export function bindReformInput(configuration,input){
 need(configuration?.verified===true&&configuration.inventory_complete===true&&Array.isArray(configuration.fields),'complete reform inventory');
 need(input?.verified===true&&input.inventory_complete===true&&input.source_identity_verified===true
  &&input.mapping_wizard==='TuneDataSourceMappingWizard'&&input.node_context?.input_port?.port===0
  &&owner(configuration.node_context,input.node_context),'owned input port zero');
 const targets=input.target_fields,sources=input.source_fields;
 need(Array.isArray(targets)&&Array.isArray(sources)&&targets.length===configuration.fields.length,'matching full input inventory');
 const ids=targets.map(f=>f.field_id),names=targets.map(f=>f.name);
 need(ids.every(id=>typeof id==='string'&&/^\d+$/.test(id))&&new Set(ids).size===ids.length
  &&names.every(n=>typeof n==='string'&&n.length>0)&&new Set(names).size===names.length,'unique incoming identities');
 const fields=configuration.fields.map((field,index)=>{
  const candidates=targets.filter(f=>f.field_id===field.field_id);need(candidates.length===1,'exact incoming field ID');const incoming=candidates[0];
  need(incoming.index===index&&field.index===index,'current incoming order');
  const source=incoming.source;need(source&&sources.filter(s=>s.record_id===source.record_id&&JSON.stringify(s)===JSON.stringify(source)).length===1,'bound upstream source');
  return {...field,input_field:{field_id:incoming.field_id,name:incoming.name,label:incoming.label,type:incoming.type,index:incoming.index,
   source_name:source.name,source_field_id:source.field_id}};
 });
 return {...configuration,fields,source_identity_verified:true,input_mapping:structuredClone(input)};
}
