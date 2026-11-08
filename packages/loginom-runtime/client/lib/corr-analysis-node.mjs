import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateCorrAnalysisParameters} from './corr-analysis-parameters.mjs';
import {configureCorrAnalysis} from './corr-analysis-procedure.mjs';
import {corrAnalysisConfigurationReadback} from './corr-analysis-readback.mjs';
import {readCorrAnalysisOutputs,corrAnalysisOutputSchema} from './corr-analysis-output.mjs';
import {corrAnalysisParametersSchema} from './node-api.mjs';
export function createCorrAnalysisNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'research.corr_analysis',modes:['pearson','spearman','kendall'],revision:'corr-analysis-v2-internal-1',parameterSchema:corrAnalysisParametersSchema,
 validate:validateCorrAnalysisParameters,readback:corrAnalysisConfigurationReadback,
 configurationObservation:{condition:'correlation wizard',ready:s=>['input_mapping','corr_analysis'].includes(s.wizard?.stage)},
 configure:configureCorrAnalysis,
 async configureAllOutputs(channel,configured){return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,ports:[{port:0,schema:corrAnalysisOutputSchema(configured.mode)}]};},
 readOutputs:readCorrAnalysisOutputs,
});}
