import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateVariablesToTableParameters,variablesToTableParametersSchema} from './variables-vartodata-parameters.mjs';
import {configureVariablesToTable} from './variables-vartodata-procedure.mjs';
import {configureVariablesToTableOutput} from './variables-vartodata-output.mjs';
import {variablesToTableConfigurationReadback} from './variables-vartodata-readback.mjs';

// Wizard/output module only. Public registration and source preflight await
// W1's typed variable-port lifecycle; do not route a table input into this node.
export function createVariablesToTableNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'variables.to_table',mode:'columns',revision:'variables-vartodata-v1-internal-1',
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
