import {isDeepStrictEqual} from 'node:util';
import {createNodeExecutionProcedure} from './node-execution-procedure.mjs';
import {captureExecutionBaseline} from './node-execution-evidence.mjs';
const need=(value,message)=>{if(!value)throw Error(message);};

// Retain the pre-configuration history. Only the known native input-activation
// group may enter the final baseline; an earlier Execute must remain an error.
export function verifyDataPartitionConfigurationBaseline(initial,current,snapshot){
 need(initial?.launch_verified===false&&current?.launch_verified===false,'Unlaunched DataPartition baselines required');
 need(isDeepStrictEqual(initial.node,current.node)&&initial.root_id===current.root_id,'DataPartition baseline owner changed');
 need(isDeepStrictEqual(captureExecutionBaseline(snapshot,current.node),current),'DataPartition baseline snapshot changed');
 need(initial.roots.every(old=>current.roots.some(root=>root.process_id===old.process_id&&root.record_id===old.record_id
  &&(!old.completed||root.completed))),'DataPartition previous process history changed');
 const fresh=current.roots.filter(root=>!initial.roots.some(old=>old.process_id===root.process_id));
 need(fresh.length<=1,'Unexpected extra DataPartition configuration process groups');
 for(const root of fresh){
  need(!initial.roots.some(old=>old.record_id===root.record_id),'DataPartition configuration process record reused');
  const group=snapshot.processes.find(process=>process.parent_id===null&&process.process_id===root.process_id&&process.record_id===root.record_id);
  const children=snapshot.processes.filter(process=>process.parent_id===root.process_id);
  need(group.caption==='Активация входов узла'&&group.children_loaded===true&&children.length===1,'Unexpected DataPartition pre-launch process');
  for(const process of [group,...children])need(process.state==='completed'&&process.error===false&&process.progress_state?.verified===true
   &&process.progress_state.source==='native_progress_record'&&process.progress_state.terminal===true&&process.progress_state.can_cancel===false,
   'DataPartition configuration activation is not confirmed completed');
  need(children[0].owner?.verified===true&&children[0].owner.source==='native_process_model_identity'
   &&children[0].owner.node_id===current.node.node_id,'DataPartition configuration activation owner changed');
 }
 return {verified:true,initial_baseline:structuredClone(initial),execution_baseline:structuredClone(current),
  configuration_activations:structuredClone(snapshot.processes.filter(process=>fresh.some(root=>process.process_id===root.process_id||process.parent_id===root.process_id)))};
}

export async function prepareDataPartitionExecution(channel,node,{baseline,configuration,outputs,operation}){
 need(operation.transportUncertain!==true,'Uncertain DataPartition operation cannot prepare another execution');
 need(configuration?.verified===true&&configuration.mode===operation.nodeApply.request.mode
  &&outputs?.verified===true&&outputs.ports?.length===3,'Confirmed DataPartition configuration/output commits required');
 let snapshot;
 const driver=createNodeExecutionProcedure({perform:spec=>channel.perform(spec),observe:async spec=>{
  const observed=await channel.observe(spec);
  if(observed.node_processes?.verified===true&&observed.node_processes.inventory_complete===true
   &&observed.node_processes.show_completed===true)snapshot=structuredClone(observed.node_processes);
  return observed;
 }},node);
 const current=await driver.prepare();
 const evidence=verifyDataPartitionConfigurationBaseline(baseline,current,snapshot);
 return {driver,evidence};
}
