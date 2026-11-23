import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateQualityParameters,resolveQualityFields,resolveQualitySource,qualityParametersSchema} from './quality-parameters.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
import {configureQuality} from './quality-procedure.mjs';
import {qualityConfigurationReadback} from './quality-readback.mjs';
import {QUALITY_SUMMARY,readQualityOutputs} from './quality-output.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
export function createQualityNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'research.quality',mode:'profile',revision:'quality-v1-internal-1',parameterSchema:qualityParametersSchema,
 validate:validateQualityParameters,readback:qualityConfigurationReadback,
 preflight:(options,ctx,config)=>preflightTabularSource(options,ctx,config,{required:true,resolve:resolveQualitySource,label:'quality'}),
 async validateInput(p,resolved,native,{channel,record,operationId}){
  try{return resolveQualityFields(p,native.target_fields);}catch(error){
   const closed=await closePreparedWizard(channel),proof={verified:true,settings_unchanged:true,cleanup_complete:true,input:native,closed};
   const phase='quality_input_validation_refused',saved=await record({phase,operation_id:operationId,proof});
   if(saved?.phase!==phase||JSON.stringify(saved.proof)!==JSON.stringify(proof))throw Error('Quality input refusal was not acknowledged');
   error.nodePhaseRefusal={phase:'input_mapping',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,verification:phase};throw error;
  }
 },
 configurationObservation:{condition:'Quality native output pages',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)},
 configure:configureQuality,
 async configureAllOutputs(channel,c){return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,
  ports:[0,1,2,3,4].map(port=>({port,schema:port===4?QUALITY_SUMMARY:c.fields}))};},
 readOutputs:readQualityOutputs,
});}
