import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {variablesColumnUnionParametersSchema,validateVariablesColumnUnionParameters,resolveVariablesColumnUnionInputs} from './variables-coluniondatavar-parameters.mjs';
import {variablesColumnUnionConfigurationReadback} from './variables-coluniondatavar-readback.mjs';
import {preflightVariablesColumnUnion} from './variables-coluniondatavar-preflight.mjs';
const verified=value=>({verified:true,cleanup_complete:true,effect_possible:false,...value});
export function createVariablesColumnUnionNodeSupport(config){
 const support=createTabularTransformNodeSupport(config,{
  type:'variables.column_union',mode:'append_variables',revision:'variables-column-union-v1',parameterSchema:variablesColumnUnionParametersSchema,
  validate:validateVariablesColumnUnionParameters,readback:variablesColumnUnionConfigurationReadback,preflight:preflightVariablesColumnUnion,
  configureInputs:async()=>verified({not_applicable:true,mappings:[]}),
  configureAllOutputs:async(_channel,configuration)=>verified({not_applicable:true,node_context:configuration.node_context}),
  configurationObservation:{condition:'owned variables union automatic mapping',readVariablesColumnUnion:true,ready:s=>s.wizard?.stage==='variables_column_union'&&s.node_variables_column_union?.verified===true},
  async configure(channel,parameters,{request}){
   const state=await channel.observe({condition:'variables union mapping before native Next',readVariablesColumnUnion:true,ready:s=>s.node_variables_column_union?.verified===true});
   const configuration=state.node_variables_column_union;
   if(parameters.column_union?.mapping==='manual'||configuration.mapping!=='automatic')return channel.configureVariablesColumnUnion({parameters,finish:request.finish});
   if(request.finish==='close')return verified({configuration});
   await channel.perform({condition:'accept variables union automatic mapping',initialObservation:state,ready:s=>s.wizard?.stage==='variables_column_union',identity:()=>configuration.node_context,
    resolve:s=>{const controls=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));if(controls.length!==1)throw Error('Variables union Next unavailable');return {verb:'wizard_step',ref:controls[0].ref,expected_stage:'done'};}});
   await channel.observe({condition:'variables union automatic mapping accepted',ready:s=>s.wizard?.stage==='done'});
   return verified({configuration});
  },
 });
 return {...support,nodeApplyDriverFactory:options=>{const drivers=support.nodeApplyDriverFactory(options);return {...drivers,
  async mapPorts(mappings,ctx){
   const value=await drivers.mapPorts(mappings,ctx);if(ctx.receipt_id!==options.operation.id+':input_mapping')return value;
   const request=options.operation.parameters,graph=await options.operation.nodeTargetAdapter.observe({document_id:request.document_id,workflow_ref:request.workflow_ref},ctx.deadline,ctx.signal);
   const inputs=resolveVariablesColumnUnionInputs({...request,target:{kind:'existing',type:'variables.column_union',ref:ctx.node},variable_inputs:[]},graph).map(input=>{
    const edge=graph.variable_links.find(e=>e.target===ctx.node.node_id&&e.kind==='variables'&&e.input===input.input);
    return {...input,source_port_guid:edge.source_port_guid,target_port_guid:edge.target_port_guid};
   });
   return {...value,inputs,source_fields:options.operation.variablesColumnUnionPreflight?.outputs.flatMap((o,input)=>o.variables.map(v=>({input,name:v.name,label:v.label,type:v.type})))??[]};
  }
 };}};
}
