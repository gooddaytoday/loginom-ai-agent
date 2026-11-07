import {isUnchangedTransformExecution} from './node-read-contract.mjs';
import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {resolveFilterBindings,filterBindingSchema,preserveFilterBindings,configureSavedFilterBindings} from './filter-bindings.mjs';
import {readFilterBindings,filterBindingVariables} from './variable-binding-readback.mjs';
import {preflightBuiltinBindings} from './variable-binding-source.mjs';
import {validateFilterConditions,resolveFilterConditions,isFilterVariable} from './filter-parameters.mjs';
import {configureFilter} from './filter-procedure.mjs';
import {configureFilterOutputs,readFilterOutputs} from './filter-output.mjs';
import {filterConfigurationReadback} from './filter-readback.mjs';
import {filterParametersSchema} from './node-api.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
export function validateFilterParameters(p,mode,r){
 if(r.bindings?.length){
  need(!p.groups?.flat().some(c=>isFilterVariable(c.values)),'BINDING_PARAMETER_UNSUPPORTED: variable lists cannot be combined with bindings');
  need(r.target.kind==='existing'||r.variable_inputs?.some(i=>i.kind==='control'&&i.input===0),'BINDING_PORT_MISMATCH: control input 0 requires one source');
  if(p.groups!==undefined)p=resolveFilterBindings(p,r.bindings);
  else need(r.target.kind==='existing','New filter bindings require groups');
 }
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
 type:'transform.filter_data',mode:'conditions',revision:'filter-v3-bindings-1',inputMappingRecovery:true,openRecovery:true,parameterSchema:filterParametersSchema,bindingSchema:filterBindingSchema,readback:filterConfigurationReadback,
 validate:validateFilterParameters,
 validateInput:(p,resolved,native,{request})=>p.groups===undefined?undefined:resolveFilterConditions(resolveFilterBindings(p,request.bindings),resolved.fields??native.target_fields),
 preflight:preflightFilterSource,
 beforeInput:prepareFilterInput,
 async afterDone(channel,request,configured,{readGraph,options,ctx}){
  if(!request.bindings?.length)return;
  const graph=await readGraph(),links=(graph.variable_links??[]).filter(l=>l.target===ctx.node.node_id&&l.kind==='control'&&l.input===0);
  const source=links.length===1?graph.nodes.find(n=>n.ref.node_id===links[0].source):null;
  const sourceProof=source?.type==='variables.user'?await preflightBuiltinBindings(options,ctx,config,source.ref):undefined;
  return readFilterBindings(channel,{readGraph,expected:configured,sourceProof});
 },
 configurationObservation:{condition:'filter configuration page',readFilter:true,ready:s=>s.wizard?.stage==='row_filter'&&s.node_filter?.verified===true},
 async configure(channel,p,{request,bindingSource,bindingMapping}){
  if(request.finish==='close'){
   const s=await channel.observe({condition:'filter draft ready for disposal',readFilter:true,ready:s=>s.wizard?.stage==='row_filter'&&s.node_filter?.verified===true});
   return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_filter,draft_edits_skipped:true};
  }
  let changed,controlVariables;
  if(request.bindings?.length){
   const s=await channel.observe({condition:'binding row baseline',readFilter:true,ready:s=>s.wizard?.stage==='row_filter'&&s.node_filter?.verified===true});
   need(!s.node_filter.rows.some(r=>r.variable_mode===128),'BINDING_PARAMETER_UNSUPPORTED: saved variable lists cannot be combined with bindings');
   preserveFilterBindings(s.node_filter,p,request.bindings);
   if(bindingSource&&request.bindings.length)controlVariables=filterBindingVariables(s.node_filter,bindingMapping,bindingSource,
    [...request.bindings.map(b=>b.variable.name),...s.node_filter.rows.flatMap(r=>r.value?.kind==='variable'?[r.value.name]:[])]);
   if(request.bindings.length&&p.groups===undefined)changed=await configureSavedFilterBindings(channel,p,request.bindings,s.node_filter,{controlVariables});
   else p=resolveFilterBindings(p,request.bindings);
  }
  changed??=await configureFilter(channel,p,{newNode:request.target.kind==='new',controlVariables});
  const s=await channel.observe({condition:'filter ready for validation',readFilter:true,ready:s=>s.wizard?.stage==='row_filter'&&s.node_filter?.verified===true});
  await channel.perform({condition:'validate filter conditions',initialObservation:s,ready:s=>s.wizard?.stage==='row_filter',identity:s=>s.prepared_node_context,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(es.length===1,'Filter Next unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:'done'};}});
  const done=await channel.observe({condition:'filter accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
  return {...changed,validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
 },configureAllOutputs:configureFilterOutputs,readOutputs:readFilterOutputs,
});}

export async function preflightFilterSource(options,ctx,config){
 const request=options.operation.parameters;
 if(!isUnchangedTransformExecution(request)&&request.finish!=='close'&&(request.target.kind==='existing'||request.variable_inputs?.some(i=>i.kind==='control'))){
  const graph=await options.operation.nodeTargetAdapter.observe({document_id:request.document_id,workflow_ref:request.workflow_ref},ctx.deadline,ctx.signal);
  need(graph.complete===true&&graph.document_id===request.document_id&&graph.workflow_ref.workflow_id===request.workflow_ref.workflow_id,'Complete filter control source graph required');
  const sources=request.target.kind==='new'||request.bindings?.length&&request.variable_inputs?.some(i=>i.kind==='control')?request.variable_inputs.filter(i=>i.kind==='control').map(i=>i.source.node_id)
   :(graph.variable_links??graph.links??[]).filter(l=>l.kind==='control'&&l.target===request.target.ref.node_id).map(l=>l.source);
  if(request.bindings?.length)need(sources.length===1,'BINDING_PORT_MISMATCH: control input 0 requires one source');
  for(const id of sources){
   const nodes=graph.nodes.filter(n=>n.ref.node_id===id);need(nodes.length===1,'Unique filter control source required');
   if(nodes[0].type==='variables.user'&&(!request.bindings?.length||request.parameters.groups?.flat().some(c=>isFilterVariable(c.value??c.values)))){
    const error=Error('Filter control variables require an executed source such as Table to variables or Variables calculator. Builtin Scenario variables output 4 is inactive and cannot supply filter values.');
    error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;
   }
   if(nodes[0].type==='variables.user'&&request.bindings?.length)options.operation.variableBindingSource=await preflightBuiltinBindings(options,ctx,config,nodes[0].ref);
  }
 }
 return preflightTabularSource(options,ctx,config,{required:request.parameters.groups!==undefined,
  resolve:(p,fields)=>resolveFilterConditions(resolveFilterBindings(p,request.bindings),fields),label:'filter'});
}

export async function prepareFilterInput(options,ctx,{channel}){
 const request=options.operation.nodeApply.request;
 // A new control edge initially exposes NULL local values to the filter
 // wizard. Commit the unchanged W1 mapping first to materialize its source;
 // preserve explicit mappings already completed by the shared driver.
 if(request.target.kind==='new'&&request.finish!=='close'&&request.variable_inputs?.some(i=>i.kind==='control')
  &&(request.bindings?.length||request.parameters?.groups?.flat().some(c=>isFilterVariable(c.value??c.values)))
  &&!request.mappings?.some(m=>m.kind==='control')){
  const mapped=await channel.mapVariablePort({direction:'input',kind:'control',port:0});
  if(request.bindings?.length)options.operation.variableBindingMapping=mapped.mapping;
  need(mapped.verified===true&&mapped.cleanup_complete===true&&mapped.independent_readback===true,'Filter control mapping materialization is unconfirmed');
 }
 if(request.target.kind==='existing'&&request.finish!=='close'&&request.bindings?.length&&!request.mappings?.some(m=>m.kind==='control')){
  const mapped=await channel.readVariablePortMapping({direction:'input',kind:'control',port:0});
  need(mapped.verified===true&&mapped.cleanup_complete===true&&mapped.independent_readback===true,'Saved filter control mapping read is unconfirmed');
  options.operation.variableBindingMapping=mapped.mapping;
 }
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
