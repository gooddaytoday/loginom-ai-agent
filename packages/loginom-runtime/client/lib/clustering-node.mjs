import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateClusteringParameters,resolveClusteringFeatures} from './clustering-parameters.mjs';
import {configureClustering} from './clustering-procedure.mjs';
import {clusteringConfigurationReadback} from './clustering-readback.mjs';
import {readClusteringOutputs,clusteringOutputColumns} from './clustering-output.mjs';
import {clusteringParametersSchema} from './node-api.mjs';
import {trainConfiguredNode} from './node-execution-procedure.mjs';
const need=(value,message)=>{if(!value)throw Error('Clustering: '+message);};
export function createClusteringNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'datamining.clustering',mode:'k_means',revision:'clustering-v1-internal-1',parameterSchema:clusteringParametersSchema,
 validate:validateClusteringParameters,validateInput:(p,resolved,native)=>resolveClusteringFeatures(p,resolved.fields??native.target_fields),readback:clusteringConfigurationReadback,
 configurationObservation:{condition:'clustering feature roles',readClustering:true,ready:s=>s.wizard?.stage==='input_mapping'&&s.node_clustering?.verified===true},
 async configure(channel,p,context){
  if(context.request.finish==='close'){
   const state=await channel.observe({condition:'clustering draft for disposal',readClustering:true,ready:s=>s.node_clustering?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:state.node_clustering,draft_edits_skipped:true};
  }
  return configureClustering(channel,p,context);
 },
 async configureAllOutputs(channel,configuration){
  // Both schemas are materialized by native training/Execute. This slice
  // accepts no mapping overrides; read each actual tabular schema afterwards.
  return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,ports:[0,1].map(port=>({port,schema:clusteringOutputColumns(configuration,port)}))};
 },
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
 readOutputs:readClusteringOutputs,
});}
