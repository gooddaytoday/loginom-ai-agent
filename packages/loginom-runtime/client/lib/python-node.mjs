import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validatePythonParameters} from './python-parameters.mjs';
import {configurePython} from './python-procedure.mjs';
import {pythonConfigurationReadback} from './python-readback.mjs';
import {readPythonOutputs} from './python-output.mjs';
import {javascriptParametersSchema} from './node-api.mjs';

export function createPythonNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'programming.python',mode:'script',revision:'python-v1-internal-1',parameterSchema:javascriptParametersSchema,
 validate:validatePythonParameters,readback:pythonConfigurationReadback,
 skipInputMapping(graph,node){
  // Empty request inputs can also mean "retain the existing connection".
  const owned=graph?.nodes?.filter(n=>['document_id','workflow_id','node_id'].every(k=>n.ref?.[k]===node[k]));
  return graph?.complete===true&&graph.document_id===node.document_id&&graph.workflow_ref?.workflow_id===node.workflow_id
   &&owned?.length===1&&owned[0].type==='programming.python'&&owned[0].locked===false
   &&Array.isArray(graph.foreign_links)&&graph.foreign_links.length===0
   &&[graph.links,graph.variable_links??[]].every(links=>Array.isArray(links)
    &&links.every(link=>typeof link?.target==='string'&&link.target!==node.node_id));
 },
 configurationObservation:{condition:'python wizard',ready:s=>['input_mapping','python_columns','python_code'].includes(s.wizard?.stage)},
 configure:configurePython,
 async configureAllOutputs(channel,configured){
  return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,
   ports:[{port:0,schema:configured.schema_mode==='declared'?configured.columns.map(({name,type})=>({name,type})):null}]};
 },
 readOutputs:readPythonOutputs,
});}
