import {configureGroupingInlineMapping} from './grouping-inline-mapping.mjs';
import {preflightGroupingSource} from './grouping-preflight.mjs';
import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateGroupingParameters} from './grouping-parameters.mjs';
import {configureGrouping} from './grouping-procedure.mjs';
import {configureGroupingOutput} from './grouping-output.mjs';
import {groupingConfigurationReadback} from './grouping-readback.mjs';
import {groupingParametersSchema} from './node-api.mjs';
export function createGroupingNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.group_data',mode:'aggregate',revision:'grouping-v3-internal-1',readback:groupingConfigurationReadback,parameterSchema:groupingParametersSchema,
 validate:validateGroupingParameters,preflight:preflightGroupingSource,
 configurationObservation:{condition:'grouping configuration page',readGrouping:true,ready:s=>s.wizard?.stage==='grouping'&&s.node_grouping?.verified===true},
 async configure(channel,p,{request}){
  const changed=await configureGrouping(channel,p);if(request.finish==='close')return changed;
  await channel.perform({condition:'validate grouping and advance',ready:s=>s.wizard?.stage==='grouping',identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(es.length!==1)throw Error('Grouping Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:['output_mapping','done']};}});
  const destination=await channel.observe({condition:'grouping validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  const inline_mapping=destination.wizard.stage==='output_mapping'?await configureGroupingInlineMapping(channel,changed.configuration):null;
  const done=await channel.observe({condition:'grouping accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureGroupingOutput,
});}
