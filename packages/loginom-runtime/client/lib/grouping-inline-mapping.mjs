import {configureOutputAutosync} from './port-mapping-procedure.mjs';
import {resolveGeneratedGroupingSources} from './grouping-output.mjs';
import {readOutputDefinitionPages,observeOutputDefinitionPage} from './import-definition-pages.mjs';
import {verifyCalculatorInlineSync} from './calculator-inline-mapping.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const need=(v,m)=>{if(!v)throw Error(m);};
const semantic=({rendered_indices,...rest})=>rest;
const retained=({index,group_index,...rest})=>rest;
export function validateGroupingInlineSources(configuration,native){
 need(native?.verified===true&&native.inventory_complete===true&&native.source_identity_verified===true
  &&native.mapping_wizard==='DerivedDataSourceMappingEngineOutputPortWizard','Owned grouping conditional output required');
 resolveGeneratedGroupingSources(configuration,native);
 need(native.target_fields.every(f=>!f.excluded&&!f.inherited&&f.required===false),'Unsupported retained grouping output');
 return native.target_fields.filter(f=>f.source===null);
}
export function verifyGroupingStaleRemoval(before,after,field){
 need(field.source===null&&field.required===false&&!field.excluded&&!field.inherited,'Only an obsolete unbound grouping field may be removed');
 need(same(before.source_fields,after.source_fields)&&after.autosync===false
  &&same(before.node_context,after.node_context),'Grouping removal changed port ownership or source');
 const remaining=before.target_fields.filter(f=>f.record_id!==field.record_id);
 const groups=new Map();
 need(remaining.length===before.target_fields.length-1&&same(remaining.map(retained),after.target_fields.map(retained))
  &&after.target_fields.every((f,i)=>{const group=f.excluded===true,next=groups.get(group)??0;groups.set(group,next+1);return f.index===i&&f.group_index===next;}),'Grouping removal changed unrelated output fields');
 return true;
}
export function verifyGroupingAutosyncRestore(before,after,value){
 const project=m=>({...semantic(m),target_fields:m.target_fields.map(({record_id,...field})=>field)});
 need(after.autosync===value&&same({...project(before),autosync:value},project(after)),
  'Grouping autosync restoration changed fields');
 return true;
}
export function configureGroupingInlineMapping(channel,configuration){
 return configureDerivedInlineMapping(channel,configuration,validateGroupingInlineSources,
  (before,after,missing)=>verifyGroupingInlineSync(configuration,before,after,missing));
}
export function verifyGroupingInlineSync(configuration,before,after,missing){
 need(same(before.node_context,after.node_context),'Grouping synchronization changed port ownership');
 const resolved=resolveGeneratedGroupingSources(configuration,before);
 const retainedSources=new Set(before.target_fields.map(f=>f.source?.record_id));
 // With one aggregate Loginom can append target Other bound to source
 // Other_Sum. The existing grouping definitions resolve both native spellings.
 // Normalize only that generated name for the shared strict comparison; keep
 // the original source record, label, type and all retained fields unchanged.
 const comparable={...after,target_fields:after.target_fields.map(f=>{
  if(retainedSources.has(f.source?.record_id))return f;
  const generated=resolved.find(e=>e.source.record_id===f.source?.record_id);
  return generated&&f.name===generated.name?{...f,name:generated.source.name}:f;
 })};
 return verifyCalculatorInlineSync(before,comparable,missing);
}
// Both grouping and sorting expose this same conditional native output page
// after their input-derived schema changes. Each supplies its source contract.
export async function configureDerivedInlineMapping(channel,configuration,validateSources,verifySync=verifyCalculatorInlineSync,{sourceOf=f=>f.source}={}){
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true
  &&s.node_mapping.mapping_wizard==='DerivedDataSourceMappingEngineOutputPortWizard';
 let state=await channel.observe({condition:'grouping conditional output inventory',readMappings:true,ready});
 const before=state.node_mapping,removed=[];
 for(const obsolete of validateSources(configuration,before)){
  state=await channel.observe({condition:'obsolete grouping field before removal',readMappings:true,ready});
  const baseline=state.node_mapping,field=baseline.target_fields.find(f=>f.record_id===obsolete.record_id);
  need(field&&same(retained(field),retained(obsolete)),'Obsolete grouping field changed');
  const definitions=await readOutputDefinitionPages(channel,{expectedCount:baseline.target_fields.length});
  state=await observeOutputDefinitionPage(channel,{offset:Math.floor(field.index/8)*8,schemaId:definitions.schema_id,total:definitions.total_columns,field});
  const rowOf=s=>s.wizard?.output_columns?.fields?.find(f=>f.index===field.index&&f.name===field.name&&f.label===field.label);
  const root=state.wizard.root_ref;
  await channel.perform({condition:'select obsolete grouping output',initialObservation:state,ready:s=>s.wizard?.root_ref===root&&!!rowOf(s),identity:()=>field,
   resolve:s=>({verb:'click',ref:rowOf(s).name_ref})});
  state=await channel.observe({condition:'bound obsolete grouping field selected',readMappings:true,outputColumnPage:{offset:Math.floor(field.index/8)*8,limit:8},
   ready:s=>ready(s)&&s.wizard.root_ref===root&&rowOf(s)?.selected===true});
  need(same(semantic(state.node_mapping),semantic(baseline)),'Grouping output changed before deletion');
  await channel.perform({condition:'remove only obsolete grouping output',initialObservation:state,
   ready:s=>ready(s)&&s.wizard.root_ref===root&&rowOf(s)?.selected===true&&same(semantic(s.node_mapping),semantic(baseline)),identity:()=>field,
   resolve:s=>({verb:'press',ref:rowOf(s).name_ref,key:'Delete'})});
  state=await channel.observe({condition:'obsolete grouping output removed',readMappings:true,ready});
  verifyGroupingStaleRemoval(baseline,state.node_mapping,field);removed.push({field,before:baseline,after:state.node_mapping});
 }
 state=await channel.observe({condition:'grouping output after pruning',readMappings:true,ready});
 validateSources(configuration,state.node_mapping);
 const baseline=state.node_mapping,linked=baseline.target_fields.map(f=>sourceOf(f)?.record_id);
 need(linked.every(Boolean)&&new Set(linked).size===linked.length,'Grouping output must have unique source links');
 const missing=baseline.source_fields.filter(f=>!linked.includes(f.record_id));
 if(missing.length){
  await channel.perform({condition:'synchronize requested grouping fields',initialObservation:state,ready,identity:()=>baseline.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';DerivedDataSourceMappingEngineOutputPortWizard;btnSyncThroughColumns'&&e.allowed_actions.includes('click'));need(es.length===1,'Grouping synchronization unavailable');return {verb:'click',ref:es[0].ref};}});
  state=await channel.observe({condition:'requested grouping fields synchronized',readMappings:true,ready});
  verifySync(baseline,state.node_mapping,missing);
 }
 const changed=state.node_mapping;
 if(changed.autosync!==before.autosync){
  await configureOutputAutosync(channel,before.autosync);
  state=await channel.observe({condition:'grouping autosync restored after pruning',readMappings:true,ready});
  verifyGroupingAutosyncRestore(changed,state.node_mapping,before.autosync);
 }
 const after=state.node_mapping;
 need(after.target_fields.length===after.source_fields.length,'Incomplete grouping conditional output');
 await channel.perform({condition:'finish grouping conditional mapping',initialObservation:state,ready,identity:()=>after.node_context,
  resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(es.length===1,'Grouping conditional Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:'done'};}});
 return {verified:true,before,after,removed,added_sources:missing.map(f=>f.name)};
}
