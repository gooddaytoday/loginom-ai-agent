import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateColUnionParameters} from './col-union-parameters.mjs';
import {configureColUnion,colUnionReady} from './col-union-procedure.mjs';
import {configureColUnionInputs,configureColUnionOutput} from './col-union-mappings.mjs';
import {colUnionConfigurationReadback} from './col-union-readback.mjs';
import {colUnionParametersSchema} from './node-api.mjs';
import {preflightColUnion} from './col-union-preflight.mjs';
export function createColUnionNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.col_union_data',modes:['positional'],revision:'col-union-v1-internal-1',readback:colUnionConfigurationReadback,parameterSchema:colUnionParametersSchema,
 validate:validateColUnionParameters,preflight:preflightColUnion,configureInputs:configureColUnionInputs,
 configurationObservation:{condition:'positional union settings',readColUnion:true,ready:colUnionReady},
 async configure(channel,p,options){
  const changed=await configureColUnion(channel,p,options);if(options.request.finish==='close')return changed;
  const advance=stage=>channel.perform({condition:'accept positional union '+stage,ready:s=>s.wizard?.stage===stage,identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(es.length!==1)throw Error('ColUnion Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:stage==='col_union'?['output_mapping','done']:'done'};}});
  await advance('col_union');
  const destination=await channel.observe({condition:'validated positional union destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  let inline_mapping;
  if(destination.wizard.stage==='output_mapping'){
   inline_mapping=await configureColUnionOutput(channel,changed.configuration,p,{},options.request);await advance('output_mapping');
  }
  const done=await channel.observe({condition:'positional union accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureColUnionOutput,
});}
