import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {autoCorrelationParametersSchema} from './node-api.mjs';
import {validateAutoCorrelationParameters,resolveAutoCorrelationField} from './auto-correlation-parameters.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
import {configureAutoCorrelation} from './auto-correlation-procedure.mjs';
import {autoCorrelationConfigurationReadback} from './auto-correlation-readback.mjs';
import {readAutoCorrelationOutputs} from './auto-correlation-output.mjs';
export function createAutoCorrelationNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'research.auto_correlation',mode:'time_domain',revision:'auto-correlation-v1-internal-1',parameterSchema:autoCorrelationParametersSchema,
 validate:validateAutoCorrelationParameters,readback:autoCorrelationConfigurationReadback,
 validateInput:(p,resolved,native)=>{if(p.autocorrelation?.field!==undefined)resolveAutoCorrelationField(p,resolved.fields??native.target_fields);},
 preflight:(options,ctx,config)=>preflightTabularSource(options,ctx,config,{required:options.operation.parameters.parameters.autocorrelation?.field!==undefined,resolve:resolveAutoCorrelationField,label:'auto_correlation'}),
 configurationObservation:{condition:'autocorrelation input roles',readAutoCorrelation:true,ready:s=>s.wizard?.stage==='input_mapping'&&s.node_auto_correlation?.verified===true},
 async configure(channel,p,context){
  if(context.request.finish==='close'){
   const s=await channel.observe({condition:'autocorrelation draft ready for disposal',readAutoCorrelation:true,ready:s=>s.node_auto_correlation?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_auto_correlation,draft_edits_skipped:true};
  }
  return configureAutoCorrelation(channel,p,context);
 },
 async configureAllOutputs(channel,c){return {verified:true,cleanup_complete:true,effect_possible:false,lag_count:c.lag_count,ports:[{port:0,schema:c.output_schema}]};},
 readOutputs:readAutoCorrelationOutputs,
});}
