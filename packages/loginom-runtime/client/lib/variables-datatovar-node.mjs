import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateDataToVarParameters,resolveDataToVarParameters,dataToVarParametersSchema} from './variables-datatovar-parameters.mjs';
import {configureDataToVarWizard} from './variables-datatovar-procedure.mjs';
import {dataToVarConfigurationReadback} from './variables-datatovar-readback.mjs';
import {preflightDataToVarSource} from './variables-datatovar-preflight.mjs';

export function createDataToVarNodeSupport(config){
 return createTabularTransformNodeSupport(config,{
  type:'variables.from_table',mode:'aggregate',revision:'datatovar-v1-internal-1',
  parameterSchema:dataToVarParametersSchema,readback:dataToVarConfigurationReadback,
  validate:validateDataToVarParameters,preflight:preflightDataToVarSource,
  configurationObservation:{condition:'table-to-variables configuration page',readDataToVar:true,
   ready:s=>s.wizard?.stage==='datatovar'&&s.node_datatovar?.verified===true},
  validateInput(p,resolved,mapping){
   if(p.fields!==undefined)resolveDataToVarParameters(p,(resolved.fields??mapping.target_fields).filter(f=>!f.excluded));
  },
  configure:(channel,p,{request})=>configureDataToVarWizard(channel,p,{finish:request.finish,newNode:request.target.kind==='new'}),
  // DataToVar has no table output-mapping wizard. The shared W1 wrapper reads
  // the real variable port only after the accepted completed graph execution.
  async configureAllOutputs(channel,configuration,p,mappings){
   if(mappings.length)throw Error('Table to variables has no table output mapping');
   const s=await channel.observe({condition:'table-to-variables graph after Done',
    ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
   return {verified:true,cleanup_complete:true,effect_possible:false,not_applicable:true,
    node_context:s.prepared_node_context,port_kind:'variables',port:0};
  },
 });
}
