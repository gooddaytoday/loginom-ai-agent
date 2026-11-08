import {validateVariablesToTableOutputFields} from './variables-vartodata-parameters.mjs';
import {ensureGroupingOutputSources} from './grouping-output-sources.mjs';
import {resolveConfiguredOutputMapping,configureOutputFields,reorderOutputFields,configureOutputAutosync} from './port-mapping-procedure.mjs';
const need=(value,message)=>{if(!value)throw Error('Variables-to-table output: '+message);};
export async function configureVariablesToTableOutput(channel,configuration,parameters,mapping={}){
 const node=configuration.node_context;
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true
  &&s.node_mapping.inventory_complete===true&&s.node_mapping.source_identity_verified===true
  &&s.node_mapping.node_context?.verified===true&&s.node_mapping.node_context.output_port?.port===0
  &&['document_id','workflow_id','node_id'].every(k=>s.node_mapping.node_context[k]===node[k]);
 // After the upstream set changed, Loginom may first show this output with its
 // sources not yet retrieved (empty source list, unbound targets). The native
 // "Get source columns" retrieves them without executing the node.
 const stale=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true
  &&s.node_mapping.mapping_wizard==='DerivedDataSourceOutputSocketWizard'&&s.node_mapping.source_fields?.length===0
  &&s.node_mapping.node_context?.verified===true&&s.node_mapping.node_context.output_port?.port===0
  &&['document_id','workflow_id','node_id'].every(k=>s.node_mapping.node_context[k]===node[k]);
 let state=await channel.observe({condition:'owned variables-to-table derived output',readMappings:true,ready:s=>ready(s)||stale(s)});
 if(!ready(state)){
  state=await ensureGroupingOutputSources(channel,state);
  state=await channel.observe({condition:'owned variables-to-table derived output after source retrieval',readMappings:true,ready});
 }
 const baseline=state.node_mapping;
 validateVariablesToTableOutputFields(baseline.source_fields,configuration.mode);
 need(baseline.target_fields.length===baseline.source_fields.length,'complete derived output required');
 const linked=new Set();
 for(const f of baseline.target_fields){
  const source=f.source??f.exclusion_source;
  need(source&&!linked.has(source.record_id)&&baseline.source_fields.filter(s=>JSON.stringify(s)===JSON.stringify(source)).length===1&&f.type===source.type,'complete unique native source links required');
  linked.add(source.record_id);
 }
 const sources=baseline.source_fields.map(f=>({...f,used:true})),requested={direction:'output',port:0,...mapping},changes=[];
 resolveConfiguredOutputMapping(requested,sources,baseline);
 if(requested.fields||requested.changes){
  changes.push(await configureOutputFields(channel,requested,sources));
  state=await channel.observe({condition:'variables-to-table output metadata readback',readMappings:true,ready});
  const resolved=resolveConfiguredOutputMapping(requested,sources,state.node_mapping);
  if(resolved.fields)changes.push(await reorderOutputFields(channel,resolved.fields.map(f=>f.current.record_id)));
 }
 if(requested.autosync!==undefined)changes.push(await configureOutputAutosync(channel,requested.autosync));
 state=await channel.observe({condition:'variables-to-table complete output readback',readMappings:true,ready});
 need(JSON.stringify(state.node_mapping.source_fields)===JSON.stringify(baseline.source_fields),'derived sources changed');
 return {verified:true,cleanup_complete:true,effect_possible:changes.length>0,source_identity_verified:true,native_mapping:state.node_mapping,changes};
}
