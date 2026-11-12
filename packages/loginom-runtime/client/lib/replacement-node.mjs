import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateReplacementParameters,validateReplacementInputParameters} from './replacement-parameters.mjs';
import {preflightReplacementSource,configureExternalReplacementInputs} from './replacement-preflight.mjs';
import {configureReplacement} from './replacement-procedure.mjs';
import {configureReplacementOutput} from './replacement-output.mjs';
import {replacementConfigurationReadback} from './replacement-readback.mjs';
import {replacementParametersSchema} from './node-api.mjs';
import {configureReplacementInlineMapping} from './replacement-output.mjs';
const parameterSchema=structuredClone(replacementParametersSchema);
parameterSchema.description='Exact: typed pairs; string case_sensitive or numeric precision>=0 (hundredths), nearest key, ties larger, nonzero adds _Delta=key-input. Int64: decimal strings. result_type defaults to input; other keep with changed type only for Boolean (Variant). Boolean requires other null/keep, datetime null and local ISO whole seconds. Regex: ordered string patterns to literal whole-cell constants ($1 literal); inline (?i), no case_sensitive/precision, other keep/null. Mixed: string pairs before regex_pairs; case_sensitive controls exact only. A supplied internal rule replaces both tables. External: string keys/results from table input 1, explicit external:{port:1,value,replacement,information,unused} covering all mapped fields; no pairs/regex_pairs, case_sensitive required, other keep/null. Duplicate keys fail. Existing omission preserves rules/output_mode.';
const ruleSchema=parameterSchema.properties.rules.items.anyOf[0];
ruleSchema.properties.case_sensitive.description='Required for exact/mixed string rules. For regex omit; use inline (?i). Omit this key completely for integer and real rules.';
ruleSchema.properties.precision.description='Required for integer/real: finite nonnegative absolute tolerance, at most two decimal places; 0=exact. Nearest key wins, ties choose larger. Nonzero adds real _Delta=key-input (null if unmatched). Omit for string.';
export function createReplacementNodeSupport(config){const implementation=options=>({
 type:'transform.replace_columns',modes:['exact','regex','mixed','external'],revision:'replacement-v1-external-1',readback:replacementConfigurationReadback,parameterSchema,
 ...(options?.operation.parameters.mode==='external'?{configureInputs:configureExternalReplacementInputs}:{}),
 validate:validateReplacementParameters,validateInput:validateReplacementInputParameters,preflight:preflightReplacementSource,
 configurationObservation:{condition:'replacement configuration page',readReplacement:true,ready:s=>s.wizard?.stage==='replacement'&&s.node_replacement?.verified===true},
 async configure(channel,p,{request}){
  const changed=await configureReplacement(channel,p,{newNode:request.target.kind==='new',mode:request.mode});if(request.finish==='close')return changed;
  await channel.perform({condition:'validate replacement and advance',ready:s=>s.wizard?.stage==='replacement',identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(es.length!==1)throw Error('Replacement Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:['output_mapping','done']};}});
  const destination=await channel.observe({condition:'replacement validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  const inline_mapping=destination.wizard.stage==='output_mapping'?await configureReplacementInlineMapping(channel,changed.configuration):null;
  const done=await channel.observe({condition:'replacement accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureReplacementOutput,
});
 const support=createTabularTransformNodeSupport(config,implementation());
 return {...support,nodeApplyDriverFactory:options=>createTabularTransformNodeSupport(config,implementation(options)).nodeApplyDriverFactory(options)};
}
