import {createNodeProcedure} from './node-procedure.mjs';
import {createNodeTargetBrowserAdapter} from './node-target-browser.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {selectPreparedGraphNode} from './node-graph-selection.mjs';
import {resolveVariablesColumnUnionInputs,validateVariablesColumnUnionInventory,validateVariablesColumnUnionFields} from './variables-coluniondatavar-parameters.mjs';
export function variablesColumnUnionSourceExecution(snapshot,node){
 const need=(ok,m)=>{if(!ok)throw Error('Variables union read-only source: '+m);};
 need(snapshot?.verified===true&&snapshot.inventory_complete===true&&snapshot.show_completed===true&&typeof snapshot.root_id==='string'
  &&snapshot.node_context?.verified===true&&['document_id','workflow_id','node_id'].every(k=>snapshot.node_context[k]===node[k]),'complete owned history required');
 const ps=snapshot.processes,owned=ps.filter(p=>p.owner?.verified===true&&p.owner.node_id===node.node_id&&p.owner.source==='native_process_model_identity');
 need(owned.length>0&&owned.every(p=>/^[1-9]\d*(?:\.[1-9]\d*)+$/.test(p.process_id)),'execute and read both sources before manual mapping');
 const latest=owned.reduce((a,b)=>BigInt(a.process_id.split('.')[0])>BigInt(b.process_id.split('.')[0])?a:b),id=latest.process_id.split('.')[0];
 const group=ps.filter(p=>p.process_id===id&&p.parent_id===null);
 need(group.length===1&&group[0].children_loaded===true&&group[0].state==='completed'&&group[0].error===false
  &&latest.state==='completed'&&latest.error===false&&owned.filter(p=>p.process_id.split('.')[0]===id).length===1,'latest source execution must be completed');
 return {verified:true,cleanup_complete:true,effect_possible:false,status:'completed',owner_verified:true,
  execution_id:node.document_id+':'+snapshot.root_id+':'+id,group_id:id,process_id:latest.process_id,process_record_id:latest.record_id};
}
export async function preflightVariablesColumnUnion(options,ctx,config){
 const {operation,execute,onRecord,now,receiptOptions}=options,request=operation.parameters;
 const graph=await createNodeTargetBrowserAdapter({execute,origin:config.targetOrigin,build:config.targetBuild}).observe(request,ctx.deadline);
 const inputs=resolveVariablesColumnUnionInputs(request,graph),outputs=[];
 const channelFor=node=>createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:2048,...config,signal:ctx.signal,
  preparedNodeContext:{document_id:request.document_id,workflow_ref:request.workflow_ref,node},
  wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
 const manual=request.parameters.column_union?.mapping==='manual';
 const topology=request.variable_inputs?.some(i=>i.input===2)||request.parameters.column_union?.disconnect_input===2;
 if(topology&&manual)throw Error('Third input changes require automatic mapping');
 if(manual&&inputs.length!==2)throw Error('Manual mapping requires exactly two connected inputs');
 if(request.parameters.column_union?.disconnect_input===2
  &&graph.variable_links.filter(e=>e.target===request.target.ref.node_id&&e.kind==='variables'&&e.input===2).length!==1)throw Error('Exactly one observed third input link required');
 if(request.target.kind==='existing'&&!manual){
  const channel=channelFor(request.target.ref);
  const deactivate=s=>s.ui.elements.filter(e=>e.graph_execution?.node_id===request.target.ref.node_id&&e.graph_execution.mode==='deactivate'&&e.allowed_actions.includes('deactivate_graph_node'));
  const execute=s=>s.ui.elements.filter(e=>e.graph_execution?.node_id===request.target.ref.node_id&&e.allowed_actions.includes('execute_graph_node'));
  let state=await channel.observe({condition:'owned union before automatic mapping check',ready:s=>s.prepared_node_context?.surface==='graph'});
  await selectPreparedGraphNode(channel,state,'select union for read-only mapping preflight');
  if(topology)state=await channel.observe({condition:'selected union execution control before input change',readOutputs:true,ready:s=>s.prepared_node_context?.surface==='graph'&&(deactivate(s).length===1||execute(s).length===1)});
  if(topology&&deactivate(state).length===1){
   // An active union switches native controllers during the wizard's implicit
   // deactivation confirmation. Settle that graph action before opening it.
   await channel.perform({condition:'deactivate union before changing inputs',initialObservation:state,ready:s=>deactivate(s).length===1,
    identity:()=>request.target.ref,resolve:s=>({verb:'deactivate_graph_node',ref:deactivate(s)[0].ref})});
   state=await channel.observe({condition:'union inactive before input mapping inspection',readOutputs:true,ready:s=>s.prepared_node_context?.surface==='graph'&&execute(s).length===1});
  }
  await openPreparedWizard(channel);
  const observed=await channel.observe({condition:'saved union automatic mapping',readVariablesColumnUnion:true,ready:s=>s.node_variables_column_union?.verified===true});
  await closePreparedWizard(channel);
  if(topology&&observed.node_variables_column_union.mapping!=='automatic')throw Error('Third input changes require a saved automatic union');
 }
 if(request.finish==='close'&&!manual)return {verified:true,inputs,outputs,not_applicable:true};
 for(const input of inputs){
  const channel=channelFor(input.source),driver=createNodeExecutionProcedure(channel,input.source,{allowDeactivate:true});
  let execution;
  if(manual){
   await driver.prepare({keepConsoleOpen:true});
   const snapshot=await channel.observe({condition:'existing source execution for manual type preflight',readProcesses:true,ready:s=>s.node_processes?.verified===true});
   execution=variablesColumnUnionSourceExecution(snapshot.node_processes,input.source);
   const close=s=>s.ui.elements.filter(e=>['ConsoleForm;btnClose','MF;ConsoleForm;btnClose'].includes(e.tid)&&e.allowed_actions.includes('click'));
   await channel.perform({condition:'close read-only source history',initialObservation:snapshot,ready:s=>close(s).length===1,identity:()=>input.source,resolve:s=>({verb:'click',ref:close(s)[0].ref})});
  }else{
   await driver.prepare();await finishConfiguredGraph(channel,driver,'execute',input.source);execution=await driver.waitCompleted();
  }
  const read=await channel.readVariablePort({port:input.output,execution});outputs.push(read.output);
 }
 validateVariablesColumnUnionInventory(outputs);
 if(manual){
  const after=await createNodeTargetBrowserAdapter({execute,origin:config.targetOrigin,build:config.targetBuild}).observe(request,ctx.deadline);
  const domain=g=>({...g,nodes:g.nodes.map(({dom_epoch,...n})=>n)});
  if(JSON.stringify(domain(graph))!==JSON.stringify(domain(after)))throw Error('Variables union source graph changed during read-only preflight');
  await onRecord({phase:'node_variables_union_preflight',operation_id:operation.id,graph_before:graph,graph_after:after,outputs,settings_changed:false});
  try{validateVariablesColumnUnionFields(request.parameters,outputs);}catch(error){error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}
 }
 operation.variablesColumnUnionPreflight={inputs,outputs};
 return {verified:true,cleanup_complete:true,effect_possible:!manual,inputs,outputs};
}
