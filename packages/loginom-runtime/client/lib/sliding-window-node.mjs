import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateSlidingWindowParameters,resolveSlidingWindowParameters,validateSlidingWindowInputParameters} from './sliding-window-parameters.mjs';
import {slidingWindowParametersSchema} from './node-api.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
import {configureSlidingWindow} from './sliding-window-procedure.mjs';
import {configureSlidingWindowOutput} from './sliding-window-output.mjs';
import {slidingWindowConfigurationReadback} from './sliding-window-readback.mjs';
export function createSlidingWindowNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.sliding_window',mode:'lag',fullUiOutput:true,revision:'sliding-window-v1-internal-1',parameterSchema:slidingWindowParametersSchema,
 readback:slidingWindowConfigurationReadback,validate:validateSlidingWindowParameters,validateInput:validateSlidingWindowInputParameters,
 preflight:(options,ctx,config)=>preflightTabularSource(options,ctx,config,{required:options.operation.parameters.parameters.windows!==undefined,resolve:resolveSlidingWindowParameters,label:'sliding_window'}),
 configurationObservation:{condition:'sliding window settings',readSlidingWindow:true,ready:s=>s.wizard?.stage==='sliding_window'&&s.node_sliding_window?.verified===true},
 async configure(channel,p,{request,inputMapping}){
  if(request.finish==='close'){
   const s=await channel.observe({condition:'sliding window draft ready for disposal',readSlidingWindow:true,ready:s=>s.node_sliding_window?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_sliding_window,draft_edits_skipped:true};
  }
  const changed=await configureSlidingWindow(channel,p,{inputMapping});
  const advance=stage=>channel.perform({condition:'validate sliding window '+stage,ready:s=>s.wizard?.stage===stage,identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(es.length!==1)throw Error('Sliding window Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:stage==='sliding_window'?['output_mapping','done']:'done'};}});
  await advance('sliding_window');
  const destination=await channel.observe({condition:'validated sliding window destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  let inline_mapping;
  if(destination.wizard.stage==='output_mapping'){
   inline_mapping=await configureSlidingWindowOutput(channel,changed.configuration,p,{},request);await advance('output_mapping');
  }
  const done=await channel.observe({condition:'sliding window accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureSlidingWindowOutput,
});}
