import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateCorrAnalysisParameters} from './corr-analysis-parameters.mjs';
import {configureCorrAnalysis} from './corr-analysis-procedure.mjs';
import {corrAnalysisConfigurationReadback} from './corr-analysis-readback.mjs';
import {readCorrAnalysisOutputs,CORR_ANALYSIS_OUTPUT} from './corr-analysis-output.mjs';
import {corrAnalysisParametersSchema} from './node-api.mjs';
export function createCorrAnalysisNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'research.corr_analysis',mode:'pearson',revision:'corr-analysis-v1-internal-1',parameterSchema:corrAnalysisParametersSchema,
 validate:validateCorrAnalysisParameters,readback:corrAnalysisConfigurationReadback,
 configurationObservation:{condition:'correlation wizard',ready:s=>['input_mapping','corr_analysis'].includes(s.wizard?.stage)},
 configure:configureCorrAnalysis,
 async configureAllOutputs(){return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,ports:[{port:0,schema:CORR_ANALYSIS_OUTPUT}]};},
 readOutputs:readCorrAnalysisOutputs,
});}
