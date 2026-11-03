import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateBinningParameters,resolveBinningField} from './binning-parameters.mjs';
import {configureBinning,observeBinning,inspectBinningSettings} from './binning-procedure.mjs';
import {binningConfigurationReadback} from './binning-readback.mjs';
import {configureBinningOutputs,readBinningOutputs} from './binning-output.mjs';
import {binningParametersSchema} from './node-api.mjs';
import {trainConfiguredNode} from './node-execution-procedure.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
const need=(v,m)=>{if(!v)throw Error('Binning: '+m);};
export async function binningBeforeGraphExecute(options,ctx,c,channel){
 if(options.operation.nodeApply.request.mode==='apply')return {};
 const request={document_id:ctx.document_id,workflow_ref:ctx.workflow_ref},graph=await options.operation.nodeTargetAdapter.observe(request,ctx.deadline);
 const source=graph.links.filter(e=>e.target===ctx.node.node_id).map(e=>({node:graph.nodes.find(n=>n.ref.node_id===e.source)?.ref,output:e.output,input:e.input}));
 need(source.length===1&&source[0].input===0&&source[0].node,'one current input source required for Train');
 const training=await trainConfiguredNode(channel,ctx.node),after=await options.operation.nodeTargetAdapter.observe(request,ctx.deadline);
 need(JSON.stringify(after.links.filter(e=>e.target===ctx.node.node_id))===JSON.stringify(graph.links.filter(e=>e.target===ctx.node.node_id)),'source changed during Train');
 await openPreparedWizard(channel);
 const initial=await observeBinning(channel,'saved model after explicit Train'),field=c.fields.findIndex(f=>f.name===c.field);
 const learned=(await inspectBinningSettings(channel,initial.node_binning,field)).node_binning;
 need(learned.state==='materialized'&&learned.intervals.length>0,'Train did not materialize intervals');
 await closePreparedWizard(channel);
 return {training:{...training,source,model:{state:'materialized',intervals:learned.intervals}}};
}
export function createBinningNodeSupport(config){
 const support=createTabularTransformNodeSupport(config,{
  type:'preprocessing.binning',modes:['internal','apply'],revision:'binning-v1-internal-1',parameterSchema:binningParametersSchema,
  validate:validateBinningParameters,validateInput:(p,resolved,native)=>resolveBinningField(p,resolved.fields??native.target_fields),readback:binningConfigurationReadback,
  configurationObservation:{condition:'owned binning numeric field page',readBinning:true,ready:s=>s.wizard?.stage==='binning'&&s.node_binning?.verified===true},
  async beforeOpen(channel,request){
   if(request.mode!=='apply')return;
   await channel.openInputPort(0);
   const s=await channel.observe({condition:'read saved binning input without commit',readMappings:true,ready:s=>s.node_mapping?.verified&&s.node_mapping.inventory_complete});
   const mapping=s.node_mapping;need(mapping.source_identity_verified,'complete current saved input mapping required');
   await closePreparedWizard(channel);return mapping;
  },
  async configure(channel,p,context){
   if(context.request.finish==='close')return {verified:true,cleanup_complete:true,effect_possible:false,configuration:(await observeBinning(channel,'owned draft for disposal')).node_binning,draft_edits_skipped:true};
   return configureBinning(channel,p,context);
  },
  configureAllOutputs:configureBinningOutputs,beforeGraphExecute:binningBeforeGraphExecute,readOutputs:readBinningOutputs,
 });
 return {...support,nodeApplyDriverFactory:options=>{
  const drivers=support.nodeApplyDriverFactory(options);
  if(options.operation.parameters.mode!=='apply')return drivers;
  return {...drivers,
   async mapPorts(mappings,ctx){if(ctx.receipt_id===options.operation.id+':input_mapping')return {verified:true,cleanup_complete:true,effect_possible:false,settings_applied:false};return drivers.mapPorts(mappings,ctx);},
   async finish(mode,ctx){return drivers.finish('close',ctx);},
   async finishGraph(mode,ctx){return {...await drivers.finishGraph(mode,ctx),settings_applied:false};},
  };
 }};
}
