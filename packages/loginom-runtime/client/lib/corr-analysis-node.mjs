import {preflightTabularSource} from './sorting-preflight.mjs';
import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateCorrAnalysisParameters,resolveCorrAnalysisSets} from './corr-analysis-parameters.mjs';
import {configureCorrAnalysis} from './corr-analysis-procedure.mjs';
import {corrAnalysisConfigurationReadback} from './corr-analysis-readback.mjs';
import {readCorrAnalysisOutputs,corrAnalysisOutputSchema} from './corr-analysis-output.mjs';
import {corrAnalysisParametersSchema} from './node-api.mjs';
export function preflightCorrAnalysisSource(options,ctx,config){
 const r=options.operation.parameters;
 return preflightTabularSource(options,ctx,config,{required:r.finish!=='close',label:'corr_analysis',
  resolve:(p,fields)=>resolveCorrAnalysisSets(p,fields,r.mode??'pearson')});
}
export function createCorrAnalysisNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'research.corr_analysis',modes:['pearson','spearman','kendall'],revision:'corr-analysis-v2-internal-1',parameterSchema:corrAnalysisParametersSchema,
 validate:validateCorrAnalysisParameters,preflight:preflightCorrAnalysisSource,readback:corrAnalysisConfigurationReadback,
 configurationObservation:{condition:'correlation wizard',ready:s=>['input_mapping','corr_analysis'].includes(s.wizard?.stage)},
 configure:configureCorrAnalysis,
 async configureAllOutputs(channel,configured){return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,ports:[{port:0,schema:corrAnalysisOutputSchema(configured.mode)}]};},
 readOutputs:readCorrAnalysisOutputs,
});}
