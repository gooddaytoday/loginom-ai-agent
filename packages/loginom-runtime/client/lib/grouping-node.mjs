import {configureGroupingInlineMapping} from './grouping-inline-mapping.mjs';
import {preflightGroupingSource} from './grouping-preflight.mjs';
import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateGroupingParameters} from './grouping-parameters.mjs';
import {configureGrouping} from './grouping-procedure.mjs';
import {configureGroupingOutput} from './grouping-output.mjs';
import {groupingConfigurationReadback} from './grouping-readback.mjs';
import {groupingParametersSchema} from './node-api.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
export function createGroupingNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.group_data',mode:'aggregate',revision:'grouping-v3-internal-1',readback:groupingConfigurationReadback,parameterSchema:groupingParametersSchema,
 validate:validateGroupingParameters,preflight:preflightGroupingSource,
 beforeInput:prepareGroupingInput,
 configurationObservation:{condition:'grouping configuration page',readGrouping:true,ready:s=>s.wizard?.stage==='grouping'&&s.node_grouping?.verified===true},
 async configure(channel,p,{request}){
  const changed=await configureGrouping(channel,p);if(request.finish==='close')return changed;
  await channel.perform({condition:'validate grouping and advance',ready:s=>s.wizard?.stage==='grouping',identity:()=>changed.configuration.node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(es.length!==1)throw Error('Grouping Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:['output_mapping','done']};}});
  const destination=await channel.observe({condition:'grouping validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
  const inline_mapping=destination.wizard.stage==='output_mapping'?await configureGroupingInlineMapping(channel,changed.configuration):null;
  const done=await channel.observe({condition:'grouping accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,...(inline_mapping?{inline_mapping}:{}),validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureOutput:configureGroupingOutput,
});}

export async function prepareGroupingInput(options,ctx,{channel}){
 const request=options.operation.nodeApply.request;
 if(request.target.kind!=='existing'||request.finish!=='execute'||request.inputs.length!==0)return;
 const state=await channel.observe({condition:'existing grouping before input schema refresh',readOutputs:true,
  ready:s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'
   &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===ctx.node[k])
   &&s.wizard?.status==='absent'&&s.node_outputs?.verified===true});
 if(state.node_outputs.ports.length!==1||state.node_outputs.ports[0].index!==0||typeof state.node_outputs.ports[0].active!=='boolean')
  throw Error('Existing grouping output activity is incomplete');
 if(state.node_outputs.ports[0].active)return;
 // Refresh the unchanged saved node and its ancestors before opening input
 // mappings: their persisted fields do not imply an active source table.
 const execution=createNodeExecutionProcedure(channel,ctx.node);
 await execution.prepare();
 await finishConfiguredGraph(channel,execution,'execute',ctx.node);
 const completed=await execution.waitCompleted({signal:ctx.signal,stopSignal:ctx.stopSignal});
 if(completed.verified!==true||completed.owner_verified!==true||completed.status!=='completed'||completed.cleanup_complete!==true)
  throw Error('Existing grouping schema execution is unconfirmed');
}
