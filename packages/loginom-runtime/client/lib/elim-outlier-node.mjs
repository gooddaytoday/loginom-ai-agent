import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateElimOutlierParameters,resolveElimOutlierParameters} from './elim-outlier-parameters.mjs';
import {elimOutlierParametersSchema} from './node-api.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
import {configureElimOutlier} from './elim-outlier-procedure.mjs';
import {elimOutlierConfigurationReadback} from './elim-outlier-readback.mjs';
import {readElimOutlierOutputs} from './elim-outlier-output.mjs';
import {trainConfiguredNode} from './node-execution-procedure.mjs';
const need=(v,m)=>{if(!v)throw Error('Outlier detect: '+m);};
export function createElimOutlierNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'preprocessing.elim_outlier',mode:'detect',revision:'elim-outlier-v1-internal-1',parameterSchema:elimOutlierParametersSchema,
 validate:validateElimOutlierParameters,validateInput:(p,resolved,native)=>{if(p.outlier?.fields)resolveElimOutlierParameters(p,resolved.fields??native.target_fields);},readback:elimOutlierConfigurationReadback,
 preflight:(options,ctx,config)=>preflightTabularSource(options,ctx,config,{required:options.operation.parameters.parameters.outlier?.fields!==undefined,resolve:resolveElimOutlierParameters,label:'elim_outlier'}),
 configurationObservation:{condition:'outlier detect fields',readElimOutlier:true,ready:s=>s.wizard?.stage==='elim_outlier'&&s.node_elim_outlier?.verified===true},
 async configure(channel,p,context){
  if(context.request.finish==='close'){
   const s=await channel.observe({condition:'outlier draft for disposal',readElimOutlier:true,ready:s=>s.node_elim_outlier?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_elim_outlier,draft_edits_skipped:true};
  }
  return configureElimOutlier(channel,p,context);
 },
 async configureAllOutputs(channel,c){return {verified:true,cleanup_complete:true,effect_possible:false,deferred_schema:true,ports:[0,1,2].map(port=>({port,schema:c.fields.map(({name,label,type,data_kind})=>({name,label,type,data_kind}))}))};},
 async beforeGraphExecute(options,ctx,configuration,channel){
  const request={document_id:ctx.document_id,workflow_ref:ctx.workflow_ref},graph=await options.operation.nodeTargetAdapter.observe(request,ctx.deadline);
  const source=graph.links.filter(e=>e.target===ctx.node.node_id).map(e=>({node:graph.nodes.find(n=>n.ref.node_id===e.source)?.ref,output:e.output,input:e.input}));
  need(source.length===1&&source[0].input===0&&source[0].node,'one current input source required for Train');
  const training=await trainConfiguredNode(channel,ctx.node),after=await options.operation.nodeTargetAdapter.observe(request,ctx.deadline);
  need(JSON.stringify(after.links.filter(e=>e.target===ctx.node.node_id))===JSON.stringify(graph.links.filter(e=>e.target===ctx.node.node_id)),'input changed during Train');
  return {training:{...training,source}};
 },
 readOutputs:readElimOutlierOutputs,
});}
