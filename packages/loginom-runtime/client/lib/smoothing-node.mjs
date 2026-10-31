import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateSmoothingParameters,resolveSmoothingParameters,validateSmoothingInputParameters} from './smoothing-parameters.mjs';
import {smoothingParametersSchema} from './node-api.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
import {configureSmoothing} from './smoothing-procedure.mjs';
import {configureSmoothingOutput} from './smoothing-output.mjs';
import {smoothingConfigurationReadback} from './smoothing-readback.mjs';
export function createSmoothingNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'preprocessing.smoothing',mode:'hodrick_prescott',fullUiOutput:true,revision:'smoothing-v1-internal-1',parameterSchema:smoothingParametersSchema,
 readback:smoothingConfigurationReadback,validate:validateSmoothingParameters,validateInput:validateSmoothingInputParameters,
 preflight:(options,ctx,config)=>preflightTabularSource(options,ctx,config,{required:options.operation.parameters.parameters.smoothing!==undefined,resolve:resolveSmoothingParameters,label:'smoothing'}),
 configurationObservation:{condition:'smoothing settings',readSmoothing:true,ready:s=>s.wizard?.stage==='smoothing'&&s.node_smoothing?.verified===true},
 async configure(channel,p,{request,inputMapping}){
  if(request.finish==='close'){
   const s=await channel.observe({condition:'smoothing draft ready for disposal',readSmoothing:true,ready:s=>s.node_smoothing?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_smoothing,draft_edits_skipped:true};
  }
  const changed=await configureSmoothing(channel,p,{inputMapping});
  const advance=stage=>channel.perform({condition:'validate smoothing '+stage,ready:s=>s.wizard?.stage===stage,identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(es.length!==1)throw Error('Smoothing Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:stage==='smoothing'?['output_mapping','done']:'done'};}});
  await advance('smoothing');
  const destination=await channel.observe({condition:'validated smoothing destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  let inline_mapping;
  if(destination.wizard.stage==='output_mapping'){
   inline_mapping=await configureSmoothingOutput(channel,changed.configuration,p,{},request);await advance('output_mapping');
  }
  const done=await channel.observe({condition:'smoothing accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureSmoothingOutput,
});}
