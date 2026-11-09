import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateAssnRulesParameters,resolveAssnRulesRoles} from './assn-rules-parameters.mjs';
import {configureAssnRules} from './assn-rules-procedure.mjs';
import {assnRulesConfigurationReadback} from './assn-rules-readback.mjs';
import {readAssnRulesOutputs,assnRulesOutputColumns} from './assn-rules-output.mjs';
import {assnRulesParametersSchema} from './node-api.mjs';
import {readOutputDefinitionPages} from './import-definition-pages.mjs';
import {trainConfiguredNode} from './node-execution-procedure.mjs';
const need=(value,message)=>{if(!value)throw Error('Association rules: '+message);};
export function createAssnRulesNodeSupport(config){
 let inputPorts=[];
 return createTabularTransformNodeSupport(config,{
 type:'datamining.assn_rules',mode:'fp_growth',revision:'assn-rules-v1-internal-1',parameterSchema:assnRulesParametersSchema,
 async beforeInput(options,ctx){
  const graph=await options.operation.nodeTargetAdapter.observe({document_id:ctx.document_id,workflow_ref:ctx.workflow_ref},ctx.deadline);
  inputPorts=graph.links.filter(e=>e.target===ctx.node.node_id).map(e=>e.input).sort();
  need(inputPorts[0]===0&&inputPorts.length<=2&&inputPorts.every((port,i)=>port===i),'main input 0 and optional auxiliary input 1 required');
 },
 async configureInputs(channel,mappings,ctx,request,finishWizard){
  const ports=[];
  for(const port of inputPorts){
   await channel.openInputPort(port);
   const state=await channel.observe({condition:'assn-rules input '+port+' full mapping',readMappings:true,ready:s=>s.wizard?.stage==='input_mapping'&&s.node_mapping?.verified===true&&s.node_mapping.node_context.input_port?.port===port});
   const native_mapping=state.node_mapping;
   need(native_mapping.inventory_complete&&native_mapping.source_identity_verified&&native_mapping.target_fields.length>0,'complete incoming fields required');
   if(port===0)resolveAssnRulesRoles(request.parameters,native_mapping.target_fields);
   const definition=await readOutputDefinitionPages(channel,{expectedCount:native_mapping.target_fields.length});
   need(definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===native_mapping.target_fields[i][k])),'incoming definition differs');
   const finish=await finishWizard('done',true,definition);
   ports.push({port,native_mapping,definition,finish});
  }
  return {verified:true,cleanup_complete:true,effect_possible:true,ports,native_mapping:ports[0].native_mapping,source_identity_verified:true};
 },
 validate:validateAssnRulesParameters,validateInput:(p,resolved,native)=>resolveAssnRulesRoles(p,resolved.fields??native.target_fields),readback:assnRulesConfigurationReadback,
 configurationObservation:{condition:'assn-rules feature roles',readAssnRules:true,ready:s=>s.wizard?.stage==='input_mapping'&&s.node_assn_rules?.verified===true},
 async configure(channel,p,context){
  if(context.request.finish==='close'){
   const state=await channel.observe({condition:'assn-rules draft for disposal',readAssnRules:true,ready:s=>s.node_assn_rules?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:state.node_assn_rules,draft_edits_skipped:true};
  }
  return configureAssnRules(channel,p,context);
 },
 async configureAllOutputs(channel,configuration){
  // Both schemas are materialized by native training/Execute. This slice
  // accepts no mapping overrides; read each actual tabular schema afterwards.
  return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,ports:[0,1].map(port=>({port,schema:assnRulesOutputColumns(configuration,port)}))};
 },
 async beforeGraphExecute(options,ctx,configuration,channel){
  const request={document_id:ctx.document_id,workflow_ref:ctx.workflow_ref};
  const graph=await options.operation.nodeTargetAdapter.observe(request,ctx.deadline);
  const source=graph.links.filter(e=>e.target===ctx.node.node_id).map(e=>({node:graph.nodes.find(n=>n.ref.node_id===e.source)?.ref,output:e.output,input:e.input}));
  need(source.length>=1&&source.length<=2&&source.some(s=>s.input===0)&&source.every(s=>[0,1].includes(s.input)&&s.node)&&new Set(source.map(s=>s.input)).size===source.length,'main and optional auxiliary sources required for training');
  const training=await trainConfiguredNode(channel,ctx.node);
  const after=await options.operation.nodeTargetAdapter.observe(request,ctx.deadline);
  need(JSON.stringify(after.links.filter(e=>e.target===ctx.node.node_id))===JSON.stringify(graph.links.filter(e=>e.target===ctx.node.node_id)),'source changed during training');
  return {training:{...training,source}};
 },
 readOutputs:readAssnRulesOutputs,
});}
