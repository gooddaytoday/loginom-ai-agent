import {ensureJoinOutputComplete} from './join-output-sync.mjs';
import {resolveConfiguredOutputMapping,configureOutputFields,reorderOutputFields,configureOutputAutosync} from './port-mapping-procedure.mjs';
import {readOutputDefinitionPages} from './import-definition-pages.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {resolveJoinKeys,joinOutputFields} from './join-parameters.mjs';
import {ensureGroupingOutputSources} from './grouping-output-sources.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
export const effectiveJoinInput=(mapping,native)=>{
 const resolved=resolveConfiguredOutputMapping(mapping,native.source_fields.map(f=>({...f,used:true})),native);
 return resolved.fields??native.target_fields;
};
const schema=fields=>fields.map(({name,label,type})=>({name,label,type}));
export async function configureJoinInputs(channel,mappings,ctx,request,finishWizard){
 const observations=[];
 // Validate both effective schemas before committing either port. Keep the
 // second wizard open for its commit; the node wizard is still opened once.
 for(const port of [0,1]){
  await channel.openInputPort(port);
  const s=await channel.observe({condition:'join input '+port+' schema',readMappings:true,ready:s=>s.wizard?.stage==='input_mapping'&&s.node_mapping?.verified&&s.node_mapping.node_context.input_port?.port===port});
  const mapping=mappings.find(m=>m.port===port)??{direction:'input',port};
  let fields,error;try{fields=effectiveJoinInput(mapping,s.node_mapping);}catch(e){error=e;}
  observations.push({port,native_mapping:s.node_mapping,fields,mapping});
  if(port===0||error)await closePreparedWizard(channel);
  if(error)throw error;
 }
 try{
  if(request.parameters.keys){
   resolveJoinKeys(request.parameters,observations.map(o=>o.fields));
   const fields=joinOutputFields({input_fields:observations.map(o=>o.fields),...request.parameters});
   need(new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length,'Join output source names conflict; rename an input field explicitly');
   const output=request.mappings.find(m=>m.direction==='output');
   if(output?.fields)need(output.fields.length===fields.length&&output.fields.every(f=>fields.some(s=>s.name===f.source.name)),'Join output mapping is incomplete');
  }
 }catch(e){await closePreparedWizard(channel);throw e;}
 const results=[];
 for(const port of [1,0]){
  if(port===0)await channel.openInputPort(port);
  const ready=s=>s.wizard?.stage==='input_mapping'&&s.node_mapping?.verified&&s.node_mapping.node_context.input_port?.port===port;
  let s=await channel.observe({condition:'join input '+port+' before configuration',readMappings:true,ready});
  const planned=observations[port],requested=planned.mapping,sources=s.node_mapping.source_fields.map(f=>({...f,used:true}));
  need(JSON.stringify(schema(effectiveJoinInput(requested,s.node_mapping)))===JSON.stringify(schema(planned.fields)),'Join input changed after validation');
  const changes=[];
  if(requested.fields){
   changes.push(await configureOutputFields(channel,requested,sources));
   s=await channel.observe({condition:'join input '+port+' fields edited',readMappings:true,ready});
   const resolved=resolveConfiguredOutputMapping(requested,sources,s.node_mapping);
   changes.push(await reorderOutputFields(channel,resolved.fields.map(f=>f.current.record_id)));
  }
  if(requested.autosync!==undefined)changes.push(await configureOutputAutosync(channel,requested.autosync));
  s=await channel.observe({condition:'join input '+port+' final mapping',readMappings:true,ready});
  const native_mapping=s.node_mapping,definition=await readOutputDefinitionPages(channel,{expectedCount:native_mapping.target_fields.length});
  need(definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===native_mapping.target_fields[i][k])),'Join input rendered definition differs');
  const finish=await finishWizard('done',true,definition);
  results.push({port,native_mapping,definition,changes,finish});
 }
 return {verified:true,cleanup_complete:true,effect_possible:true,ports:results.sort((a,b)=>a.port-b.port),source_identity_verified:true};
}
export async function configureJoinOutput(channel,configuration,parameters,mapping={}){
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true;
 const sources=joinOutputFields(configuration),requested={direction:'output',port:0,...mapping},changes=[];
 let s=await channel.observe({condition:'join output inventory',readMappings:true,ready});
 s=await ensureGroupingOutputSources(channel,s);
 s=await ensureJoinOutputComplete(channel,s);
 resolveConfiguredOutputMapping(requested,sources,s.node_mapping);
 if(requested.fields){
  changes.push(await configureOutputFields(channel,requested,sources));
  s=await channel.observe({condition:'join output fields configured',readMappings:true,ready});
  const resolved=resolveConfiguredOutputMapping(requested,sources,s.node_mapping);
  changes.push(await reorderOutputFields(channel,resolved.fields.map(f=>f.current.record_id)));
 }
 if(requested.autosync!==undefined)changes.push(await configureOutputAutosync(channel,requested.autosync));
 s=await channel.observe({condition:'join output mapping readback',readMappings:true,ready});
 resolveConfiguredOutputMapping(requested,sources,s.node_mapping);
 return {verified:true,cleanup_complete:true,effect_possible:changes.length>0,source_identity_verified:true,native_mapping:s.node_mapping,changes};
}
