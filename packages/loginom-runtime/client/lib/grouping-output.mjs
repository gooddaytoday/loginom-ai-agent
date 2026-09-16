import {ensureGroupingOutputSources} from './grouping-output-sources.mjs';
import {GROUPING_FUNCTIONS} from './grouping-parameters.mjs';
import {configureOutputFields,reorderOutputFields,configureOutputAutosync} from './port-mapping-procedure.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function groupingOutputDefinitions(configuration){
 const fields=configuration.keys.map(f=>({name:f.name,label:f.label,type:f.type,field:f.name,function:null}));
 for(const f of configuration.measures){
  const functions=Object.entries(GROUPING_FUNCTIONS).filter(([,v])=>(f.functions&v.bit)!==0);
  need(functions.length>0&&(f.functions&~31)===0,'Unsupported grouping functions');
  for(const [fn,v] of functions)fields.push({name:f.name+(functions.length>1?'_'+v.suffix:''),label:f.label+'|'+v.label,
   type:fn==='sum'||fn==='avg'?'real':fn==='count'?'integer':f.type,field:f.name,function:fn});
 }
 return fields;
}
// Native source names can carry the aggregation suffix even for a single
// function (observed Text_Count), while the derived target initially uses Text.
// Resolve only the two explicit native spellings, exact type/label and a full
// bijection; never associate by target label or ordinal position.
export function resolveGeneratedGroupingSources(configuration,native){
 const expected=groupingOutputDefinitions(configuration);
 need(native.source_fields.length===expected.length,'Grouping source inventory differs');
 const used=new Set();
 return expected.map(e=>{
  const names=e.function?[e.name,e.field+'_'+GROUPING_FUNCTIONS[e.function].suffix]:[e.name];
  const matches=native.source_fields.filter(f=>names.includes(f.name)&&f.label===e.label&&f.type===e.type);
  need(matches.length===1&&!used.has(matches[0].record_id),'Generated grouping source differs: '+e.name);
  used.add(matches[0].record_id);return {...e,source:matches[0]};
 });
}
export function resolveGroupingOutput(configuration,parameters,native,mapping={}){
 need(native?.verified===true&&native.inventory_complete===true&&native.mapping_wizard==='DerivedDataSourceOutputSocketWizard'
  &&native.source_identity_verified===true,'Complete native grouping output required');
 const expected=groupingOutputDefinitions(configuration),actual=native.target_fields;
 need(native.source_fields.length===expected.length&&actual.length===expected.length&&actual.every(f=>f.inherited===false),'Grouping output inventory differs');
 const preserved=parameters.group_by===undefined;
 const resolved=resolveGeneratedGroupingSources(configuration,native).map(e=>{
  const source=e.source,matches=actual.filter(f=>(f.source??f.exclusion_source)?.record_id===source.record_id&&f.type===e.type);
  need(matches.length===1,'Generated grouping output identity differs: '+e.name);const current=matches[0];
  const desired=!preserved&&e.function?parameters.measures.find(m=>m.field.name===e.field&&m.function===e.function):null;
  return {current,source,name:preserved?current.name:desired?.name??e.name,label:preserved?current.label:desired?.label??e.label,
   field:e.field,function:e.function,excluded:current.excluded};
 });
 if(preserved&&mapping.fields===undefined)return {fields:null};
 let ordered=preserved?actual.map(f=>resolved.find(r=>r.current.record_id===f.record_id)):
  [...configuration.keys.map(f=>resolved.find(r=>r.field===f.name&&!r.function)),...parameters.measures.map(m=>resolved.find(r=>r.field===m.field.name&&r.function===m.function))];
 if(mapping.fields){
  need(mapping.fields.length===ordered.length,'Grouping output mapping must account for every configured field');
  const names=new Set();ordered=mapping.fields.map(f=>{
   need(f.source?.kind==='configured_field'&&!names.has(f.source.name),'Unique configured grouping output references required');names.add(f.source.name);
   const r=ordered.find(r=>r.name===f.source.name);need(r,'Configured grouping output field missing');
   const excluded=f.excluded===true;need(!r.current.excluded||excluded,'Restoring excluded grouping fields requires a verified inclusion handler');
   const name=f.name??(excluded?r.source.name:r.name),label=f.label??(excluded?r.source.label:r.label);
   need(!excluded||r.source.required===false&&r.current.required===false&&!r.function&&name===r.source.name&&label===r.source.label,'Only optional grouping keys retaining source names can be excluded');
   return {...r,name,label,excluded};
  });
 }
 need(ordered.some(f=>!f.excluded)&&new Set(ordered.map(f=>f.name.toLowerCase())).size===ordered.length,'Grouping output name conflict or empty output');
 return {fields:ordered};
}
export async function configureGroupingOutput(channel,configuration,parameters,mapping={}){
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true;
 let initial=await channel.observe({condition:'grouping output inventory',readMappings:true,ready});
 initial=await ensureGroupingOutputSources(channel,initial);
 const planned=resolveGroupingOutput(configuration,parameters,initial.node_mapping,mapping),changes=[];
 if(planned.fields){
  const requested={direction:'output',port:0,fields:planned.fields.map(f=>({source:{kind:'configured_field',name:f.source.name},name:f.name,label:f.label,excluded:f.excluded}))};
  changes.push(await configureOutputFields(channel,requested,resolveGeneratedGroupingSources(configuration,initial.node_mapping).map(f=>({...f,name:f.source.name,used:true}))));
  const edited=(await channel.observe({condition:'grouping mapped fields before reorder',readMappings:true,ready})).node_mapping;
  const ids=planned.fields.map(f=>{const matches=edited.target_fields.filter(t=>(t.source??t.exclusion_source)?.record_id===f.source.record_id);need(matches.length===1,'Grouping mapped source changed');return matches[0].record_id;});
  changes.push(await reorderOutputFields(channel,ids));
 }
 if(mapping.autosync!==undefined)changes.push(await configureOutputAutosync(channel,mapping.autosync));
 const final=await channel.observe({condition:'grouping output names and order applied',readMappings:true,ready});
 if(planned.fields){const order=[...planned.fields.filter(f=>!f.excluded),...planned.fields.filter(f=>f.excluded)];
  need(same(final.node_mapping.target_fields.map(f=>({source:(f.source??f.exclusion_source)?.name,name:f.name,label:f.label,type:f.type,excluded:f.excluded})),
   order.map(f=>({source:f.source.name,name:f.name,label:f.label,type:f.current.type,excluded:f.excluded}))),'Grouping output differs after configuration');
 }
 return {verified:true,cleanup_complete:true,effect_possible:changes.length>0,native_mapping:final.node_mapping,changes};
}
