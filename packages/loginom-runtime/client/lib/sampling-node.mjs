import {readOutputDefinitionPages} from './import-definition-pages.mjs';
import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateSamplingParameters} from './sampling-parameters.mjs';
import {samplingParametersSchema} from './node-api.mjs';
import {configureSampling} from './sampling-procedure.mjs';
import {samplingConfigurationReadback} from './sampling-readback.mjs';
import {samplingOutputColumns,alignSamplingOutput,readSamplingOutputs} from './sampling-output.mjs';
export function createSamplingNodeSupport(config){return createSequentialNodeSupport(config,{type:'preprocessing.sampling',validate:validateSamplingParameters,parameterSchema:samplingParametersSchema});}
export function createSequentialNodeSupport(config,{type,validate,parameterSchema}){return createTabularTransformNodeSupport(config,{
 type,mode:'sequential',modes:['sequential','random','stratified','biased'],revision:'sequential-v1-internal-1',parameterSchema,validate,readback:samplingConfigurationReadback,
 configurationObservation:{condition:'sequential settings',readSampling:true,ready:s=>['sampling','data_partition'].includes(s.wizard?.stage)&&s.node_sampling?.verified===true},
 configure:configureSampling,
 async configureAllOutputs(channel,c,p,mappings,finishWizard){
  const ports=[];
  for(let port=0;port<(c.kind==='data_partition'?3:1);port++){
   await channel.openOutputPort(port);
   const s=await channel.observe({condition:'sequential output '+port+' schema',readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
   const m=s.node_mapping;
   if(!m.inventory_complete||!m.source_identity_verified||m.node_context.output_port?.port!==port)throw Error('Sequential output owner differs');
   const schema=m.target_fields.filter(f=>!f.excluded).map(({name,label,type,data_kind})=>({name,label,type,data_kind}));
   if(c.new_node)alignSamplingOutput(schema,samplingOutputColumns(c,port));
   const definition=await readOutputDefinitionPages(channel,{expectedCount:m.target_fields.length});
   if(!definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===m.target_fields[i][k])))throw Error('Sequential output definition differs');
   const finish=await finishWizard('done',true,definition);
   ports.push({port,schema,native_mapping:m,finish});
  }
  return {verified:true,cleanup_complete:true,effect_possible:true,ports};
 },
 readOutputs:readSamplingOutputs,
});}
