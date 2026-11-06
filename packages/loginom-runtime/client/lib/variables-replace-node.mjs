import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {variablesReplaceParametersSchema} from './variables-replace-schema.mjs';
import {validateVariablesReplaceParameters} from './variables-replace-parameters.mjs';
import {variablesReplaceConfigurationReadback} from './variables-replace-readback.mjs';
const verified=value=>({verified:true,effect_possible:false,cleanup_complete:true,...value});
export function createVariablesReplaceNodeSupport(config){
 const support=createTabularTransformNodeSupport(config,{
  type:'variables.replace',mode:'exact',revision:'variables-replace-v1',parameterSchema:variablesReplaceParametersSchema,
  validate:validateVariablesReplaceParameters,readback:variablesReplaceConfigurationReadback,
  configurationObservation:{condition:'owned variable replacement wizard',ready:s=>s.wizard?.stage==='variables_replace'},
  configureInputs:async()=>verified({not_applicable:true,mappings:[]}),
  configureAllOutputs:async(_channel,configuration)=>verified({not_applicable:true,node_context:configuration.node_context}),
  configure:(channel,parameters,{request})=>channel.configureVariablesReplace({parameters,new_node:request.target.kind==='new',finish:request.finish}),
 });
 return {...support,nodeApplyDriverFactory:options=>({...support.nodeApplyDriverFactory(options),
  verifySource:async()=>verified({not_applicable:true,source_kind:'upstream_variables'})})};
}
