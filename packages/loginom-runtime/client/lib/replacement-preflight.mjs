import {preflightTabularSource} from './sorting-preflight.mjs';
import {resolveReplacementParameters,resolveExternalReplacementParameters} from './replacement-parameters.mjs';
export function preflightReplacementSource(options,ctx,config){if(options.operation.parameters.mode==='external')return preflightExternalReplacement(options,ctx,config);return preflightTabularSource(options,ctx,config,{required:options.operation.parameters.parameters.rules!==undefined,resolve:resolveReplacementParameters,label:'replacement'});}

import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {resolveConfiguredOutputMapping,configureOutputFields,reorderOutputFields,configureOutputAutosync} from './port-mapping-procedure.mjs';
import {readOutputDefinitionPages} from './import-definition-pages.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const effective=(mapping,native)=>{
 need(native?.verified&&native.inventory_complete&&native.source_identity_verified&&native.target_fields.length===native.source_fields.length&&native.target_fields.every(f=>f.source&&!f.excluded),'Complete external replacement input required');
 return resolveConfiguredOutputMapping(mapping,native.source_fields.map(f=>({...f,used:true})),native).fields??native.target_fields;
};
async function preflightExternalReplacement(options,ctx,config){
 const request=options.operation.parameters;
 if(request.finish==='close'||!request.parameters.rules)return {verified:true,not_applicable:true};
 const schemas=[],proofs=[];
 for(const port of [0,1]){
  if(request.target.kind==='new'||request.inputs.some(i=>i.input===port))proofs.push(await preflightTabularSource(options,ctx,config,{required:true,existingSource:true,inputPort:port,label:'replacement_input_'+port,resolve:(_,fields)=>{schemas[port]=fields;}}));
  else{
   const {operation,execute,onRecord,now,receiptOptions}=options;
   const channel=createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:256,...config,signal:ctx.signal,preparedNodeContext:{document_id:request.document_id,workflow_ref:request.workflow_ref,node:request.target.ref},wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
   await channel.openInputPort(port);
   const state=await channel.observe({condition:'external replacement unchanged input preflight',readMappings:true,ready:s=>s.node_mapping?.verified&&s.node_mapping.node_context.input_port?.port===port});
   let error;try{schemas[port]=effective(request.mappings.find(m=>m.direction==='input'&&m.port===port)??{direction:'input',port},state.node_mapping);}catch(e){error=e;}
   const closed=await closePreparedWizard(channel);proofs.push({port,native_mapping:state.node_mapping,closed});if(error)throw error;
  }
 }
 try{resolveExternalReplacementParameters(request.parameters,schemas);}catch(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 return {verified:true,proofs};
}
export async function configureExternalReplacementInputs(channel,mappings,ctx,request,finishWizard){
 const observations=[];
 for(const port of [0,1]){
  await channel.openInputPort(port);
  const s=await channel.observe({condition:'external replacement input '+port+' schema',readMappings:true,ready:s=>s.wizard?.stage==='input_mapping'&&s.node_mapping?.verified&&s.node_mapping.node_context.input_port?.port===port});
  const mapping=mappings.find(m=>m.port===port)??{direction:'input',port};
  let fields,error;try{fields=effective(mapping,s.node_mapping);}catch(e){error=e;}
  observations.push({port,fields,mapping});if(port===0||error)await closePreparedWizard(channel);if(error)throw error;
 }
 try{resolveExternalReplacementParameters(request.parameters,observations.map(o=>o.fields));}catch(e){await closePreparedWizard(channel);throw e;}
 const results=[];
 for(const port of [1,0]){
  if(port===0)await channel.openInputPort(port);
  const ready=s=>s.wizard?.stage==='input_mapping'&&s.node_mapping?.verified&&s.node_mapping.node_context.input_port?.port===port;
  let s=await channel.observe({condition:'external replacement input before configuration',readMappings:true,ready});
  const requested=observations[port].mapping,sources=s.node_mapping.source_fields.map(f=>({...f,used:true})),schema=fs=>fs.map(({name,label,type})=>({name,label,type}));
  need(JSON.stringify(schema(effective(requested,s.node_mapping)))===JSON.stringify(schema(observations[port].fields)),'External replacement input changed after validation');
  const changes=[];
  if(requested.fields||requested.changes){changes.push(await configureOutputFields(channel,requested,sources));s=await channel.observe({condition:'external input fields edited',readMappings:true,ready});const resolved=resolveConfiguredOutputMapping(requested,sources,s.node_mapping);if(resolved.fields)changes.push(await reorderOutputFields(channel,resolved.fields.map(f=>f.current.record_id)));}
  if(requested.autosync!==undefined)changes.push(await configureOutputAutosync(channel,requested.autosync));
  s=await channel.observe({condition:'external replacement input readback',readMappings:true,ready});
  const native_mapping=s.node_mapping,definition=await readOutputDefinitionPages(channel,{expectedCount:native_mapping.target_fields.length});
  need(definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===native_mapping.target_fields[i][k])),'External replacement input definition differs');
  results.push({port,native_mapping,definition,changes,finish:await finishWizard('done',true,definition)});
 }
 return {verified:true,cleanup_complete:true,effect_possible:true,ports:results.sort((a,b)=>a.port-b.port),source_identity_verified:true};
}
