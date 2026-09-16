import {ensureGroupingOutputSources} from './grouping-output-sources.mjs';
import {readOutputDefinitionPages,observeOutputDefinitionPage} from './import-definition-pages.mjs';
import {verifyGroupingStaleRemoval,verifyGroupingAutosyncRestore} from './grouping-inline-mapping.mjs';
import {verifyCalculatorInlineSync} from './calculator-inline-mapping.mjs';
import {configureOutputAutosync} from './port-mapping-procedure.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const need=(v,m)=>{if(!v)throw Error(m);};
export function verifyCollapseSourceFetch(before,after){
 const project=f=>{const {record_id,source,exclusion_source,...rest}=f;if(f.excluded)delete rest.field_id;return rest;};
 need(before.source_fields.length===0&&after.source_fields.length>0&&after.inventory_complete&&after.source_identity_verified
  &&same(before.node_context,after.node_context)&&before.autosync===after.autosync&&same(before.target_fields.map(project),after.target_fields.map(project)), 'Collapse source fetch changed the retained output definition');
}
export function collapseObsoleteFields(native,sources){
 need(native.verified&&native.inventory_complete&&native.source_identity_verified&&native.mapping_wizard==='DerivedDataSourceOutputSocketWizard','Owned complete collapse output required');
 need(native.source_fields.length===sources.length&&native.source_fields.every(f=>sources.some(s=>['name','label','type'].every(k=>s[k]===f[k])))&&new Set(native.source_fields.map(f=>f.name)).size===sources.length,'Collapse output sources differ from roles');
 const obsolete=native.target_fields.filter(f=>!f.source&&!f.exclusion_source);
 need(obsolete.every(f=>f.source===null&&f.excluded===false&&f.inherited===false&&f.required===false&&!sources.some(s=>s.name===f.name)),'Only obsolete unbound collapse outputs can be removed');
 return obsolete;
}
export async function reconcileCollapseOutput(channel,initial,sources){
 let state=await ensureGroupingOutputSources(channel,initial,{verify:verifyCollapseSourceFetch});
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true&&s.node_mapping.mapping_wizard==='DerivedDataSourceOutputSocketWizard';
 const original=state.node_mapping,removed=[];
 for(const stale of collapseObsoleteFields(original,sources)){
  state=await channel.observe({condition:'collapse obsolete output before removal',readMappings:true,ready});
  const before=state.node_mapping,field=before.target_fields.find(f=>f.record_id===stale.record_id);
  const retained=({index,group_index,...rest})=>rest;need(field&&same(retained(field),retained(stale)),'Collapse obsolete output changed');
  const definition=await readOutputDefinitionPages(channel,{expectedCount:before.target_fields.length});
  state=await observeOutputDefinitionPage(channel,{offset:Math.floor(field.index/8)*8,schemaId:definition.schema_id,total:definition.total_columns,field});
  const root=state.wizard.root_ref,row=s=>s.wizard?.output_columns?.fields?.find(f=>f.index===field.index&&f.name===field.name&&f.label===field.label);
  await channel.perform({condition:'select obsolete collapse output',initialObservation:state,ready:s=>s.wizard?.root_ref===root&&!!row(s),identity:()=>field,resolve:s=>({verb:'click',ref:row(s).name_ref})});
  state=await channel.observe({condition:'selected obsolete collapse output',readMappings:true,outputColumnPage:{offset:Math.floor(field.index/8)*8,limit:8},ready:s=>ready(s)&&s.wizard.root_ref===root&&row(s)?.selected});
  const semantic=({rendered_indices,...rest})=>rest;need(same(semantic(state.node_mapping),semantic(before)),'Collapse output changed before removal');
  await channel.perform({condition:'remove only obsolete collapse output',initialObservation:state,ready:s=>ready(s)&&s.wizard.root_ref===root&&row(s)?.selected&&same(semantic(s.node_mapping),semantic(before)),identity:()=>field,resolve:s=>({verb:'press',ref:row(s).name_ref,key:'Delete'})});
  state=await channel.observe({condition:'obsolete collapse output removed',readMappings:true,ready});
  verifyGroupingStaleRemoval(before,state.node_mapping,field);removed.push(field.name);
 }
 collapseObsoleteFields(state.node_mapping,sources);
 const before=state.node_mapping,linked=before.target_fields.map(f=>(f.source??f.exclusion_source)?.record_id);
 need(linked.every(Boolean)&&new Set(linked).size===linked.length,'Collapse outputs need unique source links');
 const missing=before.source_fields.filter(f=>!linked.includes(f.record_id));
 if(missing.length){
  await channel.perform({condition:'add missing collapse output fields',initialObservation:state,ready,identity:()=>before.node_context,resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';DerivedDataSourceOutputSocketWizard;btnSyncThroughColumns'&&e.allowed_actions.includes('click'));need(es.length===1,'Collapse output synchronization unavailable');return {verb:'click',ref:es[0].ref};}});
  state=await channel.observe({condition:'missing collapse outputs added',readMappings:true,ready});verifyCalculatorInlineSync(before,state.node_mapping,missing);
 }
 if(state.node_mapping.autosync!==original.autosync){const before=state.node_mapping;await configureOutputAutosync(channel,original.autosync);state=await channel.observe({condition:'collapse output autosync restored',readMappings:true,ready});verifyGroupingAutosyncRestore(before,state.node_mapping,original.autosync);}
 need(state.node_mapping.target_fields.length===sources.length,'Incomplete collapse output coverage');
 return state;
}
