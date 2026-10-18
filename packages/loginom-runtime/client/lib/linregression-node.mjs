import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateLinRegressionParameters,resolveLinRegressionRoles} from './linregression-parameters.mjs';
import {configureLinRegression} from './linregression-procedure.mjs';
import {linRegressionConfigurationReadback} from './linregression-readback.mjs';
import {readLinRegressionOutputs,configureLinRegressionOutputs} from './linregression-output.mjs';
import {linRegressionParametersSchema} from './node-api.mjs';
import {trainConfiguredNode} from './node-execution-procedure.mjs';
const need=(value,message)=>{if(!value)throw Error('LinRegression: '+message);};
export function createLinRegressionNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'datamining.lin_regression',mode:'enter',revision:'linregression-v1-internal-1',parameterSchema:linRegressionParametersSchema,
 validate:validateLinRegressionParameters,validateInput:(p,resolved,native)=>resolveLinRegressionRoles(p,resolved.fields??native.target_fields),readback:linRegressionConfigurationReadback,
 configurationObservation:{condition:'linregression feature roles',readLinRegression:true,ready:s=>s.wizard?.stage==='input_mapping'&&s.node_linregression?.verified===true},
 async configure(channel,p,context){
  if(context.request.finish==='close'){
   const state=await channel.observe({condition:'linregression draft for disposal',readLinRegression:true,ready:s=>s.node_linregression?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:state.node_linregression,draft_edits_skipped:true};
  }
  return configureLinRegression(channel,p,context);
 },
 configureAllOutputs:configureLinRegressionOutputs,
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
 readOutputs:readLinRegressionOutputs,
});}
