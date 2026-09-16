import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateSortingParameters,validateSortingInputParameters} from './sorting-parameters.mjs';
import {preflightSortingSource} from './sorting-preflight.mjs';
import {configureSorting} from './sorting-procedure.mjs';
import {configureSortingOutput} from './sorting-output.mjs';
import {sortingConfigurationReadback} from './sorting-readback.mjs';
import {sortingParametersSchema} from './node-api.mjs';
import {configureSortingInlineMapping} from './sorting-inline-mapping.mjs';
export function createSortingNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.sorting',mode:'keys',revision:'sorting-v3-internal-1',readback:sortingConfigurationReadback,parameterSchema:sortingParametersSchema,
 validate:validateSortingParameters,validateInput:validateSortingInputParameters,preflight:preflightSortingSource,
 configurationObservation:{condition:'sorting configuration page',readSorting:true,ready:s=>s.wizard?.stage==='sorting'&&s.node_sorting?.verified===true},
 async configure(channel,p,{request}){
  const changed=await configureSorting(channel,p,{newNode:request.target.kind==='new'});if(request.finish==='close')return changed;
  await channel.perform({condition:'validate sorting and advance',ready:s=>s.wizard?.stage==='sorting',identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(es.length!==1)throw Error('Sorting Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:['output_mapping','done']};}});
  const destination=await channel.observe({condition:'sorting validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  const inline_mapping=destination.wizard.stage==='output_mapping'?await configureSortingInlineMapping(channel,changed.configuration):null;
  const done=await channel.observe({condition:'sorting accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureSortingOutput,
});}
