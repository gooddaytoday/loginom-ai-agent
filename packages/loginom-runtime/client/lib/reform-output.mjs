import {ensureGroupingOutputSources as ensureDerivedOutputSources} from './grouping-output-sources.mjs';
import {resolveConfiguredOutputMapping,configureOutputFields,reorderOutputFields,configureOutputAutosync} from './port-mapping-procedure.mjs';
import {verifyCalculatorInlineSync} from './calculator-inline-mapping.mjs';
const need=(v,m)=>{if(!v)throw Error('Reform output: '+m);};
// Sync propagates a changed source label only when the output label still
// inherited the old value. Custom output labels and every other property keep
// the strict shared preservation contract.
export function verifyReformInlineSync(before,after,missing,baseline,configuration){
 const expected=structuredClone(before);
 for(const field of expected.target_fields){
  if(!field.source)continue;
  const current=configuration.fields.find(f=>!f.excluded&&f.name===field.source.name);
  const original=current&&baseline.fields.find(f=>f.field_id===current.field_id);
  const actual=after.target_fields.find(f=>f.source?.record_id===field.source.record_id);
  if(original&&actual&&field.label===original.label&&actual.label===current.label&&field.source.label===current.label)
   field.label=current.label;
 }
 return verifyCalculatorInlineSync(expected,after,missing);
}
export function reformOutputSources(configuration,native){
 need(configuration?.verified===true&&configuration.inventory_complete===true&&configuration.source_identity_verified===true,'verified input-bound configuration');
 need(native?.verified===true&&native.inventory_complete===true&&native.source_identity_verified===true,'complete native output mapping');
 const a=configuration.node_context,b=native.node_context;
 need(a?.verified&&b?.verified&&['document_id','workflow_id','node_id'].every(k=>a[k]===b[k]),'same configured node');
 const fields=configuration.fields.filter(f=>!f.excluded),sources=native.source_fields;
 need(fields.length===sources.length&&new Set(sources.map(f=>f.name)).size===fields.length
  &&sources.every(s=>fields.some(f=>f.name===s.name&&f.label===s.label&&f.type===s.type)),'converted source schema differs');
 // Output socket IDs are newly generated and differ from input/reform IDs.
 // Native output source links establish correspondence here; never reuse input IDs.
 return fields.map(f=>({...f,used:true}));
}
export async function configureReformOutput(channel,configuration,parameters,mapping={}){
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true;
 let s=await channel.observe({condition:'reform output inventory',readMappings:true,ready});
 s=await ensureDerivedOutputSources(channel,s);
 const sources=reformOutputSources(configuration,s.node_mapping),requested={direction:'output',port:0,...mapping},changes=[];
 resolveConfiguredOutputMapping(requested,sources,s.node_mapping);
 if(requested.fields){
  changes.push(await configureOutputFields(channel,requested,sources));
  s=await channel.observe({condition:'reform output fields configured',readMappings:true,ready});
  const resolved=resolveConfiguredOutputMapping(requested,sources,s.node_mapping);
  changes.push(await reorderOutputFields(channel,resolved.fields.map(f=>f.current.record_id)));
 }
 if(requested.autosync!==undefined)changes.push(await configureOutputAutosync(channel,requested.autosync));
 s=await channel.observe({condition:'reform complete output mapping readback',readMappings:true,ready});
 reformOutputSources(configuration,s.node_mapping);
 return {verified:true,cleanup_complete:true,effect_possible:changes.length>0,source_identity_verified:true,native_mapping:s.node_mapping,changes};
}
