import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {conditionParametersSchema,validateConditionParameters} from './control-condition-parameters.mjs';
import {conditionConfigurationReadback} from './control-condition-readback.mjs';
import {alignReadSchema} from './node-read-contract.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const verified=value=>({verified:true,effect_possible:false,cleanup_complete:true,...value});
// Every branch passes the table unchanged; the native output schema is the
// evidence. An inactive branch port refuses the stock read as not active.
export async function readConditionOutputs(channel,read,ctx){
 const observed=await channel.observe({condition:'Condition branch ports after execution',readOutputs:true,ready:s=>s.node_outputs?.verified===true&&s.node_outputs.surface==='graph'});
 const branch_activity=observed.node_outputs.ports.map(p=>({port:p.index,label:p.label,executed:p.active===true}));
 need(branch_activity.length===2,'Condition must expose exactly two branch table outputs');
 const ports=[];
 for(const port of read.ports){
  need(branch_activity.find(b=>b.port===port)?.executed===true,'Condition output '+port+' did not execute: its branch was not selected (blocked). branch_activity shows which branch ran; read only that port.');
  const {output}=await channel.readOutputPort({port,execution:ctx.portExecution,sampleRows:read.sample_rows,requireExactNumbers:read.require_exact_numbers});
  output.schema=alignReadSchema(output.schema,null);
  ports.push(output);
 }
 need(new Set(ports.map(p=>p.port_guid)).size===ports.length,'Condition outputs share an unexpected identity');
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports,branch_activity};
}
export function createConditionNodeSupport(config){
 return createTabularTransformNodeSupport(config,{
  type:'control.condition',modes:['ports','variable_branch'],revision:'control-condition-v1',parameterSchema:conditionParametersSchema,
  validate:validateConditionParameters,readback:conditionConfigurationReadback,
  configurationObservation:{condition:'owned Condition ports page',ready:s=>s.wizard?.stage==='condition_ports'},
  configureInputs:async()=>verified({not_applicable:true,mappings:[]}),
  configureAllOutputs:async(_channel,configuration)=>verified({not_applicable:true,node_context:configuration.node_context}),
  configure:(channel,parameters,{request})=>channel.configureCondition({mode:request.mode,parameters}),
  readOutputs:readConditionOutputs,
 });
}
