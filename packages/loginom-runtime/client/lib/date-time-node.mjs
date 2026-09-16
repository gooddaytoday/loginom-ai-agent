import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateDateTimeParameters,resolveDateTimeParameters,validateDateTimeInputParameters} from './date-time-parameters.mjs';
import {dateTimeParametersSchema} from './node-api.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
import {configureDateTime} from './date-time-procedure.mjs';
import {configureDateTimeOutput} from './date-time-output.mjs';
import {dateTimeConfigurationReadback} from './date-time-readback.mjs';
import {readDateTimeRemovalBaseline,planDateTimeRemovals} from './date-time-removal.mjs';
import {inspectDateTimeConfigure} from './date-time-continuation.mjs';
export function createDateTimeNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.date_time',mode:'calendar',revision:'date-time-v1-internal-1',parameterSchema:dateTimeParametersSchema,
 readback:dateTimeConfigurationReadback,validate:validateDateTimeParameters,validateInput:validateDateTimeInputParameters,
 preflight:(options,ctx,config)=>preflightTabularSource(options,ctx,config,{required:options.operation.parameters.parameters.fields!==undefined,resolve:resolveDateTimeParameters,label:'date_time'}),
 configurationObservation:{condition:'date/time matrix',readDateTime:true,ready:s=>s.wizard?.stage==='date_time'&&s.node_date_time?.verified===true},
 beforeOpen:readDateTimeRemovalBaseline,
 inspectConfigure:inspectDateTimeConfigure,
 async configure(channel,p,{request,inputMapping,preconfiguration,progress}){
  if(request.finish==='close'){
   const s=await channel.observe({condition:'date/time draft ready for disposal',readDateTime:true,ready:s=>s.wizard?.stage==='date_time'&&s.node_date_time?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_date_time,draft_edits_skipped:true};
  }
  let removed=progress?.removed??[];
  const changed=await configureDateTime(channel,p,{inputMapping,progress,...(preconfiguration?{beforeChanges:original=>{
   removed=planDateTimeRemovals(original,p,preconfiguration.native_mapping);
   if(progress)progress.removed=structuredClone(removed);
  }}:{})});
  const advance=async(stage,expected)=>channel.perform({condition:'validate date/time '+stage,ready:s=>s.wizard?.stage===stage,identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(es.length!==1)throw Error('Date/time Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:expected};}});
  await advance('date_time',['output_mapping','done']);
  const destination=await channel.observe({condition:'validated date/time destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  let inline_mapping;
  if(destination.wizard.stage==='output_mapping'){
   inline_mapping=await configureDateTimeOutput(channel,changed.configuration,p,{},{removed});await advance('output_mapping','done');
  }
  const done=await channel.observe({condition:'date/time accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,removed_outputs:removed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureDateTimeOutput,
});}
