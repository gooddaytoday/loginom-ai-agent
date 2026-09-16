import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateMissingValuesParameters,validateMissingValuesInputParameters} from './missing-values-parameters.mjs';
import {preflightMissingValuesSource} from './missing-values-preflight.mjs';
import {configureMissingValues} from './missing-values-procedure.mjs';
import {configureMissingValuesOutput,configureMissingValuesInlineMapping} from './missing-values-output.mjs';
import {missingValuesConfigurationReadback} from './missing-values-readback.mjs';
import {missingValuesParametersSchema} from './node-api.mjs';
export function createMissingValuesNodeSupport(config){return createTabularTransformNodeSupport(config,{
 refreshGraphBodyAfterPortCommit:true,
 type:'preprocessing.data_recovery',mode:'impute',revision:'missing-values-v1-internal-1',inputMappingRecovery:true,readback:missingValuesConfigurationReadback,parameterSchema:missingValuesParametersSchema,
 validate:validateMissingValuesParameters,validateInput:validateMissingValuesInputParameters,preflight:preflightMissingValuesSource,
 configurationObservation:{condition:'missing_values configuration page',readMissingValues:true,ready:s=>s.wizard?.stage==='missing_values'&&s.node_missing_values?.verified===true},
 async configure(channel,p,{request}){
  const changed=await configureMissingValues(channel,p,{newNode:request.target.kind==='new'});if(request.finish==='close')return changed;
  await channel.perform({condition:'validate missing_values and advance',ready:s=>s.wizard?.stage==='missing_values',identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(es.length!==1)throw Error('MissingValues Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:['output_mapping','done']};}});
  const destination=await channel.observe({condition:'missing_values validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  const inline_mapping=destination.wizard.stage==='output_mapping'?await configureMissingValuesInlineMapping(channel,changed.configuration):null;
  const done=await channel.observe({condition:'missing_values accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureMissingValuesOutput,
});}
