import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateLogRegressionParameters,resolveLogRegressionRoles} from './log-regression-parameters.mjs';
import {configureLogRegression} from './log-regression-procedure.mjs';
import {logRegressionConfigurationReadback} from './log-regression-readback.mjs';
import {readLogRegressionOutputs,configureLogRegressionOutputs} from './log-regression-output.mjs';
import {logRegressionParametersSchema} from './node-api.mjs';
import {trainConfiguredNode} from './node-execution-procedure.mjs';
const need=(v,m)=>{if(!v)throw Error('Logistic regression: '+m);};
export function createLogRegressionNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'datamining.log_regression',modes:['enter','forward','backward','stepwise'],revision:'log-regression-v1-internal-1',parameterSchema:logRegressionParametersSchema,
 validate:validateLogRegressionParameters,validateInput:(p,resolved,native)=>resolveLogRegressionRoles(p,resolved.fields??native.target_fields),readback:logRegressionConfigurationReadback,
 configurationObservation:{condition:'logistic feature roles',readLogRegression:true,ready:s=>s.wizard?.stage==='input_mapping'&&s.node_logregression?.verified===true},
 async configure(channel,p,context){
  if(context.request.finish==='close'){
   const s=await channel.observe({condition:'logistic draft for disposal',readLogRegression:true,ready:s=>s.node_logregression?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_logregression,draft_edits_skipped:true};
  }
  return configureLogRegression(channel,p,context);
 },
 configureAllOutputs:configureLogRegressionOutputs,
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
 readOutputs:readLogRegressionOutputs,
});}
