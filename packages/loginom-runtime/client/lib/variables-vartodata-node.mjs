import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateVariablesToTableParameters,variablesToTableParametersSchema} from './variables-vartodata-parameters.mjs';
import {configureVariablesToTable} from './variables-vartodata-procedure.mjs';
import {configureVariablesToTableOutput} from './variables-vartodata-output.mjs';
import {variablesToTableConfigurationReadback} from './variables-vartodata-readback.mjs';

// W1 owns typed variable links; this module owns both orientations and table output.
export function createVariablesToTableNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'variables.to_table',modes:['columns','rows'],revision:'variables-vartodata-v2-internal-2',
 readback:variablesToTableConfigurationReadback,parameterSchema:variablesToTableParametersSchema,
 validate:validateVariablesToTableParameters,
 async configureInputs(channel,mappings){
  if(mappings.length)throw Error('Variables-to-table has no table input mapping');
  return {verified:true,cleanup_complete:true,effect_possible:false,not_applicable:true,mappings:[]};
 },
 configurationObservation:{condition:'variables-to-table orientation page',readVariablesToTable:true,
  ready:s=>s.wizard?.stage==='variables_to_table'&&s.node_variables_to_table?.verified===true},
 configure:configureVariablesToTable,configureOutput:configureVariablesToTableOutput,
});}
