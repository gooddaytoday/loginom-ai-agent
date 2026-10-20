import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateFilterConditions,resolveFilterConditions} from './filter-parameters.mjs';
import {configureFilter} from './filter-procedure.mjs';
import {configureFilterOutputs,readFilterOutputs} from './filter-output.mjs';
import {filterConfigurationReadback} from './filter-readback.mjs';
import {filterParametersSchema} from './node-api.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
export function validateFilterParameters(p,mode,r){
 need(mode==='conditions','Filter supports conditions mode, including row_number operands');
 if(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===0)need(r.target.kind==='existing','New filter requires explicit conditions');
 else validateFilterConditions(p);
 need(r.target.kind==='existing'||r.inputs.length===1,'New filter requires one explicit input');
 need(r.inputs.length<=1&&r.inputs.every(i=>i.input===0),'Filter has one table input');
 need(r.read.ports.every(p=>p===0||p===1),'Filter has two table outputs');
 need(r.finish!=='execute'||r.read.ports.length>0,'Execute must read at least one selected filter output');
 need(r.mappings.every(m=>(m.direction==='input'?m.port===0:m.port===0||m.port===1)
  &&(m.fields??[]).every(f=>f.source?.kind==='configured_field'&&(m.direction==='output'||f.excluded!==true))),'Invalid filter port mapping');
 need(r.finish!=='close'||r.mappings.every(m=>m.direction!=='input'),'Close cannot commit input mappings');
}
export function createFilterNodeSupport(config){return createTabularTransformNodeSupport(config,{
 type:'transform.filter_data',mode:'conditions',revision:'filter-v3-internal-1',inputMappingRecovery:true,openRecovery:true,parameterSchema:filterParametersSchema,readback:filterConfigurationReadback,
 validate:validateFilterParameters,
 validateInput:(p,resolved,native)=>p.groups===undefined?undefined:resolveFilterConditions(p,resolved.fields??native.target_fields),
 preflight:(options,ctx,config)=>preflightTabularSource(options,ctx,config,{required:options.operation.parameters.parameters.groups!==undefined,resolve:resolveFilterConditions,label:'filter'}),
 beforeInput:prepareFilterInput,
 configurationObservation:{condition:'filter configuration page',readFilter:true,ready:s=>s.wizard?.stage==='row_filter'&&s.node_filter?.verified===true},
 async configure(channel,p,{request}){
  if(request.finish==='close'){
   const s=await channel.observe({condition:'filter draft ready for disposal',readFilter:true,ready:s=>s.wizard?.stage==='row_filter'&&s.node_filter?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_filter,draft_edits_skipped:true};
  }
  const changed=await configureFilter(channel,p);
  const s=await channel.observe({condition:'filter ready for validation',readFilter:true,ready:s=>s.wizard?.stage==='row_filter'&&s.node_filter?.verified===true});
  await channel.perform({condition:'validate filter conditions',initialObservation:s,ready:s=>s.wizard?.stage==='row_filter',identity:s=>s.prepared_node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(es.length===1,'Filter Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:'done'};}});
  const done=await channel.observe({condition:'filter accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureAllOutputs:configureFilterOutputs,readOutputs:readFilterOutputs,
});}

export async function prepareFilterInput(options,ctx,{channel}){
 const request=options.operation.nodeApply.request;
 if(request.target.kind!=='existing'||request.finish!=='execute'||request.inputs.length!==0)return;
 const state=await channel.observe({condition:'existing filter before input schema refresh',readOutputs:true,
  ready:s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'
   &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===ctx.node[k])
   &&s.wizard?.status==='absent'&&s.node_outputs?.verified===true});
 need(state.node_outputs.ports.length===2&&[0,1].every(index=>state.node_outputs.ports.filter(p=>p.index===index&&typeof p.active==='boolean').length===1),
  'Existing filter output activity is incomplete');
 if(state.node_outputs.ports.some(p=>p.active))return;
 // Saved autosync mappings contain only referenced fields until execution.
 // Materialize the unchanged Filter before opening its input/condition drafts.
 const execution=createNodeExecutionProcedure(channel,ctx.node);
 await execution.prepare();
 await finishConfiguredGraph(channel,execution,'execute',ctx.node);
 const completed=await execution.waitCompleted({signal:ctx.signal,stopSignal:ctx.stopSignal});
 need(completed.verified===true&&completed.owner_verified===true&&completed.status==='completed'&&completed.cleanup_complete===true,
  'Existing filter schema execution is unconfirmed');
}
