import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {variablesColumnUnionParametersSchema,validateVariablesColumnUnionParameters,resolveVariablesColumnUnionInputs} from './variables-coluniondatavar-parameters.mjs';
import {variablesColumnUnionConfigurationReadback} from './variables-coluniondatavar-readback.mjs';
import {preflightVariablesColumnUnion} from './variables-coluniondatavar-preflight.mjs';
import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
import {selectPreparedGraphNode} from './node-graph-selection.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
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
  async openWizard(ctx){
   const request=options.operation.parameters;
   if(request.target.kind==='new'&&request.parameters.column_union?.mapping==='manual'){
    // 7.4.2 materializes the variable mapping stores only after the union's
    // first Execute. Complete its default automatic setup once, before the
    // ordinary driver's final-execution baseline is captured.
    const channel=createNodeProcedure({operation:options.operation,execute:options.execute,record:options.onRecord,now:options.now,maxSteps:4096,...config,signal:ctx.signal,
     preparedNodeContext:{document_id:request.document_id,workflow_ref:request.workflow_ref,node:ctx.node},
     wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...options.receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
    const driver=createNodeExecutionProcedure(channel,ctx.node);await driver.prepare();
    const graph=await channel.observe({condition:'new union before native materialization',ready:s=>s.prepared_node_context?.surface==='graph'});
    await selectPreparedGraphNode(channel,graph,'select new union for initial automatic setup');await openPreparedWizard(channel);
    const mapping=await channel.observe({condition:'new union default automatic mapping',readVariablesColumnUnion:true,ready:s=>s.node_variables_column_union?.mapping==='automatic'});
    const step=async(s,key,verb)=>channel.perform({condition:'initial union '+key,initialObservation:s,ready:s=>s.ui.elements.filter(e=>e.tid===s.wizard?.root_tid+';'+key&&e.allowed_actions.includes(verb)).length===1,
     identity:s=>s.prepared_node_context,resolve:s=>({verb,ref:s.ui.elements.find(e=>e.tid===s.wizard.root_tid+';'+key).ref,...(verb==='wizard_step'?{expected_stage:'done'}:{})})});
    await step(mapping,'btnNext','wizard_step');
    const done=await channel.observe({condition:'initial automatic union Done',ready:s=>s.wizard?.stage==='done'});await step(done,'btnDone','finish_wizard');
    await finishConfiguredGraph(channel,driver,'execute',ctx.node);const execution=await driver.waitCompleted();
    await options.onRecord({phase:'node_variables_union_materialized',operation_id:options.operation.id,node:ctx.node,execution});
    // Deactivate on the graph before opening settings. The native wizard's
    // confirmation switches controllers before its acknowledgement settles.
    const deactivate=s=>s.ui.elements.filter(e=>e.graph_execution?.node_id===ctx.node.node_id&&e.graph_execution.mode==='deactivate'&&e.allowed_actions.includes('deactivate_graph_node'));
    const active=await channel.observe({condition:'materialized union deactivation control',readOutputs:true,ready:s=>s.prepared_node_context?.surface==='graph'&&deactivate(s).length===1});
    await channel.perform({condition:'deactivate materialized union before manual settings',initialObservation:active,ready:s=>deactivate(s).length===1,
     identity:()=>ctx.node,resolve:s=>({verb:'deactivate_graph_node',ref:deactivate(s)[0].ref})});
    await channel.observe({condition:'materialized union inactive before manual settings',readOutputs:true,ready:s=>s.prepared_node_context?.surface==='graph'
     &&s.ui.elements.some(e=>e.graph_execution?.node_id===ctx.node.node_id&&e.allowed_actions.includes('execute_graph_node'))});
   }
   return drivers.openWizard(ctx);
  },
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
