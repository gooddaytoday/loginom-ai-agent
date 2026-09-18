import {ensureGroupingOutputSources} from './grouping-output-sources.mjs';
import {resolveConfiguredOutputMapping,configureOutputFields,reorderOutputFields,configureOutputAutosync} from './port-mapping-procedure.mjs';
import {configureDerivedInlineMapping} from './grouping-inline-mapping.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
export function replacementSources(configuration,mode){
 need(['replace','add'].includes(mode),'Verified replacement output mode required');
 const changed=new Set(configuration.rules.map(r=>r.field.name));
 return configuration.input_fields.flatMap(f=>{
  const original={name:f.name,label:f.label,type:f.type};if(!changed.has(f.name))return [original];
  return [...(mode==='add'?[original]:[]),{name:f.name+(mode==='add'?'_Replace':''),label:f.label+' Замена',type:f.type},{name:f.name+'_Replaced',label:f.label+' Заменен',type:'boolean'}];
 });
}
export function validateReplacementSources(configuration,native){
 need(native?.verified&&native.inventory_complete&&native.source_identity_verified,'Complete replacement output required');
 const mode=native.produce_mode==='supplement'?'add':['replace','default'].includes(native.produce_mode)?'replace':null;
 const sources=replacementSources(configuration,mode);
 need(sources.length===native.source_fields.length&&new Set(native.source_fields.map(f=>f.name)).size===sources.length&&native.source_fields.every(s=>sources.some(f=>f.name===s.name&&f.label===s.label&&f.type===s.type)),'Replacement generated schema differs');
 const expectedMode=configuration.effective_output_mode??configuration.requested_output_mode;
 if(expectedMode)need(mode===expectedMode,'Replacement output mode differs');
 return native.target_fields.filter(f=>f.source===null&&!f.excluded);
}
export async function observeReplacementOutputPolicy(channel){
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true;
 const view=await channel.observe({condition:'replacement output view',ready:s=>s.wizard?.stage==='output_mapping'});
 const tables=view.ui.elements.filter(e=>[view.wizard.root_tid+';DerivedDataSourceMappingEngineOutputPortWizard;rbTable;DisplayEl',view.wizard.root_tid+';DerivedDataSourceOutputSocketWizard;rbTable;DisplayEl'].includes(e.tid)&&e.allowed_actions.includes('click'));
 need(tables.length===1,'Replacement output table view unavailable');
 await channel.perform({condition:'show replacement output definitions',initialObservation:view,ready:s=>s.wizard?.stage==='output_mapping',identity:()=>view.prepared_node_context,resolve:()=>({verb:'click',ref:tables[0].ref})});
 return channel.observe({condition:'replacement output policy',readMappings:true,ready});
}
async function setMode(channel,configuration){
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true;
 let s=await observeReplacementOutputPolicy(channel);
 const desired=configuration.requested_output_mode,actual=s.node_mapping.produce_mode;
 if(desired&&(desired==='add'?actual!=='supplement':actual!=='replace')){
  const form=s.node_mapping.mapping_wizard,root=s.wizard.root_tid,base=root+';'+form+';btnProduceType';
  const stage=s=>s.wizard?.stage==='output_mapping';
  const click=async tid=>{
   await channel.perform({condition:'replacement output view control',initialObservation:s,ready:stage,identity:()=>({node:configuration.node_context,tid}),resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===tid&&e.allowed_actions.includes('click'));need(es.length===1,'Replacement output control unavailable: '+tid);return {verb:'click',ref:es[0].ref};}});
   s=await channel.observe({condition:'replacement output view changed',readMappings:true,ready:stage});
  };
  await click(root+';'+form+';rbLinks;DisplayEl');
  for(const tid of [base,base+';mn;'+(desired==='add'?'dptSupplement':'dptReplace')]){
   await channel.perform({condition:'set replacement output policy',initialObservation:s,ready:stage,identity:()=>({node:configuration.node_context,desired}),resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===tid&&e.allowed_actions.includes('click'));need(es.length===1,'Replacement output policy unavailable');return {verb:'click',ref:es[0].ref};}});
   s=await channel.observe({condition:'replacement output policy control',readMappings:true,ready:stage});
  }
  await click(root+';'+form+';rbTable;DisplayEl');
  s=await channel.observe({condition:'replacement output policy applied',readMappings:true,ready:s=>ready(s)&&s.node_mapping.produce_mode===(desired==='add'?'supplement':'replace')});
 }
 return s;
}
export async function configureReplacementInlineMapping(channel,configuration){
 await setMode(channel,configuration);
 return configureDerivedInlineMapping(channel,configuration,validateReplacementSources,undefined,{sourceOf:f=>f.source??f.exclusion_source});
}
export async function configureReplacementOutput(channel,configuration,parameters,mapping={}){
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true;
 let s=await setMode(channel,configuration);s=await ensureGroupingOutputSources(channel,s);
 validateReplacementSources(configuration,s.node_mapping);
 const mode=s.node_mapping.produce_mode==='supplement'?'add':'replace',sources=replacementSources(configuration,mode).map(f=>({...f,used:true})),requested={direction:'output',port:0,...mapping},changes=[];
 resolveConfiguredOutputMapping(requested,sources,s.node_mapping);
 if(requested.fields||requested.changes){changes.push(await configureOutputFields(channel,requested,sources));s=await channel.observe({condition:'replacement edited output',readMappings:true,ready});const resolved=resolveConfiguredOutputMapping(requested,sources,s.node_mapping);changes.push(await reorderOutputFields(channel,resolved.fields.map(f=>f.current.record_id)));}
 if(requested.autosync!==undefined)changes.push(await configureOutputAutosync(channel,requested.autosync));
 s=await channel.observe({condition:'replacement output readback',readMappings:true,ready});validateReplacementSources(configuration,s.node_mapping);
 return {verified:true,cleanup_complete:true,effect_possible:changes.length>0,source_identity_verified:true,native_mapping:s.node_mapping,changes};
}
