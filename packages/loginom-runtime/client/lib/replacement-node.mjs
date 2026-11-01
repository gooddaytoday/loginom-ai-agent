import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateReplacementParameters,validateReplacementInputParameters} from './replacement-parameters.mjs';
import {preflightReplacementSource} from './replacement-preflight.mjs';
import {configureReplacement} from './replacement-procedure.mjs';
import {configureReplacementOutput} from './replacement-output.mjs';
import {replacementConfigurationReadback} from './replacement-readback.mjs';
import {replacementParametersSchema} from './node-api.mjs';
import {configureReplacementInlineMapping} from './replacement-output.mjs';
const parameterSchema=structuredClone(replacementParametersSchema);
parameterSchema.description='Internal replacement table: exact or regex. Exact result_type changes the constant type (omitted=input type); keys retain type, to/other.value use result_type. No automatic conversion of unmatched text. Different result_type requires other null/value, datetime requires null with local ISO whole seconds. Regex: string patterns, ordered first match replaces the whole cell with a literal string ($1 stays literal); omit case_sensitive/precision, use inline (?i), other keep/null only. Exact string rules require case_sensitive and omit precision. Integer/real rules require precision>=0 (hundredths) and omit case_sensitive; absolute inclusive tolerance, nearest key, ties choose larger. Nonzero precision adds real <field>_Delta=key-input. Large Int64 values must be decimal strings, never rounded JSON numbers. Existing-node patches preserve omitted rules and output_mode.';
const ruleSchema=parameterSchema.properties.rules.items;
ruleSchema.properties.case_sensitive.description='Required only for exact string rules. For regex omit; use inline (?i). Omit this key completely for integer and real rules.';
ruleSchema.properties.precision.description='Required for integer/real: finite nonnegative absolute tolerance, at most two decimal places; 0=exact. Nearest key wins, ties choose larger. Nonzero adds real _Delta=key-input (null if unmatched). Omit for string.';
export function createReplacementNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.replace_columns',modes:['exact','regex'],revision:'replacement-v1-internal-5',readback:replacementConfigurationReadback,parameterSchema,
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
});}
