import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateVariablesCalculatorParameters,resolveVariablesCalculatorPatch} from './variables-calculator-parameters.mjs';
import {variablesCalculatorParametersSchema} from './variables-calculator-schema.mjs';
import {variablesCalculatorConfigurationReadback} from './variables-calculator-readback.mjs';
import {advanceVariablesCalculatorConfiguration} from './variables-calculator-procedure.mjs';
const verified=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});
export function createVariablesCalculatorNodeSupport(config) {
 const support=createTabularTransformNodeSupport(config,{
  type:'variables.calculator',mode:'expression',revision:'variables-calculator-v1',
  parameterSchema:variablesCalculatorParametersSchema,validate:validateVariablesCalculatorParameters,readback:variablesCalculatorConfigurationReadback,
  configurationObservation:{condition:'owned variables calculator configuration',readVariablesCalculator:true,
   ready:s=>s.wizard?.stage==='variables_calculator'&&s.node_variables_calculator?.verified===true},
  configureInputs:async()=>verified({not_applicable:true,mappings:[]}),
  configureAllOutputs:async(_channel,configuration)=>verified({not_applicable:true,node_context:configuration.node_context}),
  async configure(channel,parameters,{request}) {
   const state=await channel.observe({condition:'complete variables calculator before patch',readVariablesCalculator:true,
    ready:s=>s.wizard?.stage==='variables_calculator'&&s.node_variables_calculator?.verified===true});
   const plan=resolveVariablesCalculatorPatch(parameters,state.node_variables_calculator,{newNode:request.target.kind==='new'});
   const changed=await channel.configureVariablesCalculator(plan);
   return request.finish==='close'?changed:advanceVariablesCalculatorConfiguration(channel,changed);
  },
 });
 return {...support,nodeApplyDriverFactory:options=>({...support.nodeApplyDriverFactory(options),
  verifySource:async()=>verified({not_applicable:true,source_kind:'no_required_input'})})};
}
