import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateCoarseClassesParameters,resolveCoarseClassesFields} from './coarse-classes-parameters.mjs';
import {configureCoarseClasses,observeCoarseClasses} from './coarse-classes-procedure.mjs';
import {coarseClassesConfigurationReadback} from './coarse-classes-readback.mjs';
import {configureCoarseClassesOutputs,readCoarseClassesOutputs} from './coarse-classes-output.mjs';
import {coarseClassesParametersSchema} from './node-api.mjs';
import {trainConfiguredNode} from './node-execution-procedure.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
const need=(v,m)=>{if(!v)throw Error('CoarseClasses: '+m);};
export async function coarseClassesBeforeGraphExecute(options,ctx,c,channel){
 if(options.operation.nodeApply.request.mode==='apply')return {};
 const request={document_id:ctx.document_id,workflow_ref:ctx.workflow_ref},graph=await options.operation.nodeTargetAdapter.observe(request,ctx.deadline);
 const source=graph.links.filter(e=>e.target===ctx.node.node_id).map(e=>({node:graph.nodes.find(n=>n.ref.node_id===e.source)?.ref,output:e.output,input:e.input}));
 need(source.length===1&&source[0].input===0&&source[0].node,'one current input source required for Train');
 const training=await trainConfiguredNode(channel,ctx.node),after=await options.operation.nodeTargetAdapter.observe(request,ctx.deadline);
 need(JSON.stringify(after.links.filter(e=>e.target===ctx.node.node_id))===JSON.stringify(graph.links.filter(e=>e.target===ctx.node.node_id)),'source changed during Train');
 await openPreparedWizard(channel);
 const learned=await configureCoarseClasses(channel,{}, {request:{mode:'apply'},preconfiguration:{target_fields:c.fields}});
 await closePreparedWizard(channel);
 return {training:{...training,source,model:{state:'materialized',classes:learned.configuration.classes}}};
}
export function createCoarseClassesNodeSupport(config){
 const support=createTabularTransformNodeSupport(config,{
  type:'preprocessing.coarse_classes',modes:['internal','apply'],revision:'coarse-classes-v1-internal-1',parameterSchema:coarseClassesParametersSchema,
  validate:validateCoarseClassesParameters,validateInput:(p,resolved,native)=>resolveCoarseClassesFields(p,resolved.fields??native.target_fields),readback:coarseClassesConfigurationReadback,
  configurationObservation:{condition:'owned coarseClasses numeric field page',readCoarseClasses:true,ready:s=>s.wizard?.stage==='coarse_classes'&&s.node_coarse_classes?.verified===true},
  async beforeOpen(channel,request){
   if(request.mode!=='apply')return;
   await channel.openInputPort(0);
   const s=await channel.observe({condition:'read saved coarseClasses input without commit',readMappings:true,ready:s=>s.node_mapping?.verified&&s.node_mapping.inventory_complete});
   const mapping=s.node_mapping;need(mapping.source_identity_verified,'complete current saved input mapping required');
   await closePreparedWizard(channel);return mapping;
  },
  async configure(channel,p,context){
   if(context.request.finish==='close')return {verified:true,cleanup_complete:true,effect_possible:false,configuration:(await observeCoarseClasses(channel,'owned draft for disposal')).node_coarse_classes,draft_edits_skipped:true};
   return configureCoarseClasses(channel,p,context);
  },
  configureAllOutputs:configureCoarseClassesOutputs,beforeGraphExecute:coarseClassesBeforeGraphExecute,readOutputs:readCoarseClassesOutputs,
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
