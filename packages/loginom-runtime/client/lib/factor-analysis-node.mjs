import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateFactorAnalysisParameters,resolveFactorAnalysisFeatures} from './factor-analysis-parameters.mjs';
import {configureFactorAnalysis} from './factor-analysis-procedure.mjs';
import {factorAnalysisConfigurationReadback} from './factor-analysis-readback.mjs';
import {readFactorAnalysisOutputs,configureFactorAnalysisOutputs} from './factor-analysis-output.mjs';
import {factorAnalysisParametersSchema} from './node-api.mjs';
import {trainConfiguredNode} from './node-execution-procedure.mjs';
const need=(value,message)=>{if(!value)throw Error('FactorAnalysis: '+message);};
export function createFactorAnalysisNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'research.factor_analysis',modes:['pca_fixed','pca_eigenvalue','pca_variance'],revision:'factor-analysis-v1-internal-2',parameterSchema:factorAnalysisParametersSchema,
 validate:validateFactorAnalysisParameters,validateInput:(p,resolved,native)=>resolveFactorAnalysisFeatures(p,resolved.fields??native.target_fields),readback:factorAnalysisConfigurationReadback,
 configurationObservation:{condition:'factor-analysis feature roles',readFactorAnalysis:true,ready:s=>s.wizard?.stage==='input_mapping'&&s.node_factor_analysis?.verified===true},
 async configure(channel,p,context){
  if(context.request.finish==='close'){
   const state=await channel.observe({condition:'factor-analysis draft for disposal',readFactorAnalysis:true,ready:s=>s.node_factor_analysis?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:state.node_factor_analysis,draft_edits_skipped:true};
  }
  return configureFactorAnalysis(channel,p,context);
 },
 configureAllOutputs:configureFactorAnalysisOutputs,
 async beforeGraphExecute(options,ctx,configuration,channel){
  const request={document_id:ctx.document_id,workflow_ref:ctx.workflow_ref};
  const graph=await options.operation.nodeTargetAdapter.observe(request,ctx.deadline);
  const source=graph.links.filter(e=>e.target===ctx.node.node_id).map(e=>({node:graph.nodes.find(n=>n.ref.node_id===e.source)?.ref,output:e.output,input:e.input}));
  need(source.length===1&&source[0].input===0&&source[0].node,'one current input source is required for training');
  const training=await trainConfiguredNode(channel,ctx.node);
  const after=await options.operation.nodeTargetAdapter.observe(request,ctx.deadline);
  need(JSON.stringify(after.links.filter(e=>e.target===ctx.node.node_id))===JSON.stringify(graph.links.filter(e=>e.target===ctx.node.node_id)),'source changed during training');
  return {training:{...training,source}};
 },
 readOutputs:readFactorAnalysisOutputs,
});}
