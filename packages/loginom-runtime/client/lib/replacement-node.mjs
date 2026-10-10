import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateReplacementParameters,validateReplacementInputParameters} from './replacement-parameters.mjs';
import {preflightReplacementSource} from './replacement-preflight.mjs';
import {configureReplacement} from './replacement-procedure.mjs';
import {configureReplacementOutput} from './replacement-output.mjs';
import {replacementConfigurationReadback} from './replacement-readback.mjs';
import {replacementParametersSchema} from './node-api.mjs';
import {configureReplacementInlineMapping} from './replacement-output.mjs';
const parameterSchema=structuredClone(replacementParametersSchema);
parameterSchema.description='Exact internal replacement table. String rules require case_sensitive and omit precision. Integer/real rules require precision=0 and omit case_sensitive. Large Int64 values must be decimal strings, never rounded JSON numbers. Existing-node patches preserve omitted rules and output_mode.';
const ruleSchema=parameterSchema.properties.rules.items;
ruleSchema.properties.case_sensitive.description='Required only for string rules. Omit this key completely for integer and real rules.';
ruleSchema.properties.precision.description='Required as 0 only for integer and real rules. Omit this key completely for string rules.';
export function createReplacementNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.replace_columns',mode:'exact',revision:'replacement-v1-internal-3',readback:replacementConfigurationReadback,parameterSchema,
 validate:validateReplacementParameters,validateInput:validateReplacementInputParameters,preflight:preflightReplacementSource,
 configurationObservation:{condition:'replacement configuration page',readReplacement:true,ready:s=>s.wizard?.stage==='replacement'&&s.node_replacement?.verified===true},
 async configure(channel,p,{request}){
  const changed=await configureReplacement(channel,p,{newNode:request.target.kind==='new'});if(request.finish==='close')return changed;
  await channel.perform({condition:'validate replacement and advance',ready:s=>s.wizard?.stage==='replacement',identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(es.length!==1)throw Error('Replacement Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:['output_mapping','done']};}});
  const destination=await channel.observe({condition:'replacement validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  const inline_mapping=destination.wizard.stage==='output_mapping'?await configureReplacementInlineMapping(channel,changed.configuration):null;
  const done=await channel.observe({condition:'replacement accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureReplacementOutput,
});}
