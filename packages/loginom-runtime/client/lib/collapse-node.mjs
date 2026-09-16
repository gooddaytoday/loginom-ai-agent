import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateCollapseParameters,validateCollapseInputParameters} from './collapse-parameters.mjs';
import {preflightCollapseSource} from './collapse-preflight.mjs';
import {configureCollapse} from './collapse-procedure.mjs';
import {configureCollapseOutput} from './collapse-output.mjs';
import {collapseConfigurationReadback} from './collapse-readback.mjs';
import {collapseParametersSchema} from './node-api.mjs';
import {configureCollapseInlineMapping} from './collapse-inline-mapping.mjs';
import {checkCollapseExistingInput} from './collapse-existing-input.mjs';
export function createCollapseNodeSupport(config){return createTabularTransformNodeSupport(config,{
 nativeFullOutput:true,
 type:'transform.collapse_columns',mode:'unpivot',revision:'collapse-v1-internal-1',readback:collapseConfigurationReadback,parameterSchema:collapseParametersSchema,
 validate:validateCollapseParameters,validateInput:validateCollapseInputParameters,preflight:preflightCollapseSource,
 beforeInput:(options,ctx,config)=>checkCollapseExistingInput(options,ctx,config,{recheck:true}),
 configurationObservation:{condition:'collapse configuration page',readCollapse:true,ready:s=>s.wizard?.stage==='collapse'&&s.node_collapse?.verified===true},
 async configure(channel,p,{request}){
  const changed=await configureCollapse(channel,p,{newNode:request.target.kind==='new'});if(request.finish==='close')return changed;
  await channel.perform({condition:'validate collapse and advance',ready:s=>s.wizard?.stage==='collapse',identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(es.length!==1)throw Error('Collapse Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:['output_mapping','done']};}});
  const destination=await channel.observe({condition:'collapse validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  const inline_mapping=destination.wizard.stage==='output_mapping'?await configureCollapseInlineMapping(channel,changed.configuration):null;
  const done=await channel.observe({condition:'collapse accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureCollapseOutput,
});}
