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
function preflightJoinSchemas(request,preflight){
 const proof=preflight?.proofs;
 need(preflight?.verified===true&&proof?.length===2,'Both Join source preflight receipts required');
 return proof.map((p,port)=>{
  const input=request.inputs.find(i=>i.input===port);
  need(input&&p?.verified===true&&p.cleanup_complete===true&&p.parameters_valid===true&&p.settings_changed===false
   &&p.port===input.output&&p.preview?.verified===true&&p.preview.inventory_complete===true
   &&p.preview.port===input.output&&p.preview.node_id===input.source.node_id
   &&p.node_context?.verified===true&&p.node_context.surface==='graph'
   &&['document_id','workflow_id','node_id'].every(k=>p.source?.[k]===input.source[k]&&p.node_context[k]===input.source[k])
   &&Array.isArray(p.schema),'Join source preflight receipt differs from requested input '+port);
  return p.schema;
 });
}
export async function configureJoinInputs(channel,mappings,ctx,request,finishWizard,{preflight}={}){
 const newNode=request.target.kind==='new';
 // The verified upstream previews already provide both planned schemas for
 // a new Join. Saved inputs can have names and types set by their mappings.
 const planned=newNode?preflightJoinSchemas(request,preflight):[];
 const mappingFor=port=>mappings.find(m=>m.port===port)??{direction:'input',port};
 if(!newNode)for(const port of [0,1]){
  await channel.openInputPort(port);
  const s=await channel.observe({condition:'join input '+port+' schema',readMappings:true,ready:s=>s.wizard?.stage==='input_mapping'&&s.node_mapping?.verified&&s.node_mapping.node_context.input_port?.port===port});
  let error;try{planned[port]=effectiveJoinInput(mappingFor(port),s.node_mapping);}catch(e){error=e;}
  if(port===0||error)await closePreparedWizard(channel);
  if(error)throw error;
 }
 try{
  if(request.parameters.keys){
   resolveJoinKeys(request.parameters,planned);
   const fields=joinOutputFields({input_fields:planned,...request.parameters,mode:request.mode});
   need(new Set(fields.map(f=>f.name.toLowerCase())).size===fields.length,'Join output source names conflict; rename an input field explicitly');
   const output=request.mappings.find(m=>m.direction==='output');
   if(output?.fields)need(output.fields.length===fields.length&&output.fields.every(f=>fields.some(s=>s.name===f.source.name)),'Join output mapping is incomplete');
  }
 }catch(e){if(!newNode)await closePreparedWizard(channel);throw e;}
 const results=[];
 // Check the first native input before committing either port on a new Join.
 // The existing Join still has its second wizard open after schema validation.
 for(const port of newNode?[0,1]:[1,0]){
  if(newNode||port===0)await channel.openInputPort(port);
  const ready=s=>s.wizard?.stage==='input_mapping'&&s.node_mapping?.verified&&s.node_mapping.node_context.input_port?.port===port;
  let s=await channel.observe({condition:'join input '+port+' before configuration',readMappings:true,ready});
  const requested=mappingFor(port),sources=s.node_mapping.source_fields.map(f=>({...f,used:true}));
  try{
   need(JSON.stringify(schema(effectiveJoinInput(requested,s.node_mapping)))===JSON.stringify(schema(planned[port])),'Join input changed after validation');
  }catch(error){
   const closed=await closePreparedWizard(channel);
   if(newNode&&port===0)error.nodePhaseRefusal={phase:'input_mapping',status:'FAILED',effect_possible:true,
    cleanup_complete:true,settings_unchanged:true,verification:'join_first_input_schema_refused',proof:{closed}};
   throw error;
  }
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
