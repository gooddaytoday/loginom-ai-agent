import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validatePythonParameters} from './python-parameters.mjs';
import {configurePython} from './python-procedure.mjs';
import {pythonConfigurationReadback} from './python-readback.mjs';
import {readPythonOutputs} from './python-output.mjs';
import {javascriptParametersSchema} from './node-api.mjs';

export function createPythonNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'programming.python',mode:'script',revision:'python-v1-internal-1',parameterSchema:javascriptParametersSchema,
 validate:validatePythonParameters,readback:pythonConfigurationReadback,
 configurationObservation:{condition:'python wizard',ready:s=>['input_mapping','python_columns','python_code'].includes(s.wizard?.stage)},
 configure:configurePython,
 async configureAllOutputs(channel,configured){
  return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,
   ports:[{port:0,schema:configured.schema_mode==='declared'?configured.columns.map(({name,type})=>({name,type})):null}]};
 },
 readOutputs:readPythonOutputs,
});}
