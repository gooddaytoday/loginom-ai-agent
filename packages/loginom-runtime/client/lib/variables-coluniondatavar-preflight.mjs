import {createNodeProcedure} from './node-procedure.mjs';
import {createNodeTargetBrowserAdapter} from './node-target-browser.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {selectPreparedGraphNode} from './node-graph-selection.mjs';
import {resolveVariablesColumnUnionInputs,validateVariablesColumnUnionInventory} from './variables-coluniondatavar-parameters.mjs';
export async function preflightVariablesColumnUnion(options,ctx,config){
 const {operation,execute,onRecord,now,receiptOptions}=options,request=operation.parameters;
 const graph=await createNodeTargetBrowserAdapter({execute,origin:config.targetOrigin,build:config.targetBuild}).observe(request,ctx.deadline);
 const inputs=resolveVariablesColumnUnionInputs(request,graph),outputs=[];
 const channelFor=node=>createNodeProcedure({operation,execute,record:onRecord,now,maxSteps:2048,...config,signal:ctx.signal,
  preparedNodeContext:{document_id:request.document_id,workflow_ref:request.workflow_ref,node},
  wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
 if(request.target.kind==='existing'){
  const channel=channelFor(request.target.ref),state=await channel.observe({condition:'owned union before automatic mapping check',ready:s=>s.prepared_node_context?.surface==='graph'});
  await selectPreparedGraphNode(channel,state,'select union for read-only mapping preflight');await openPreparedWizard(channel);
  const observed=await channel.observe({condition:'saved union automatic mapping',readVariablesColumnUnion:true,ready:s=>s.node_variables_column_union?.verified===true});
  await closePreparedWizard(channel);
 }
 if(request.finish==='close')return {verified:true,inputs,outputs,not_applicable:true};
 for(const input of inputs){
  const channel=channelFor(input.source),driver=createNodeExecutionProcedure(channel,input.source,{allowDeactivate:true});
  await driver.prepare();await finishConfiguredGraph(channel,driver,'execute',input.source);
  const execution=await driver.waitCompleted();
  const read=await channel.readVariablePort({port:input.output,execution});outputs.push(read.output);
 }
 validateVariablesColumnUnionInventory(outputs);
 for(const field of request.parameters.column_union?.fields??[]){
  const found=outputs[field.input].variables.filter(v=>v.name===field.source);
  if(found.length!==1||!(found[0].type===field.type||found[0].type==='integer'&&field.type==='string'))throw Error('Variables column union: unique source and unchanged type or integer to string required');
 }
 operation.variablesColumnUnionPreflight={inputs,outputs};
 return {verified:true,cleanup_complete:true,effect_possible:true,inputs,outputs};
}
