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

export function verifyDataPartitionHistoryRefresh(initial,before,after,receipts){
 const previous=captureExecutionBaseline(before,initial.node),current=captureExecutionBaseline(after,initial.node);
 const configuration=verifyDataPartitionConfigurationBaseline(initial,previous,before);
 need(previous.root_id===current.root_id&&before.processes.length>=30,'Owned long DataPartition history refresh required');
 need(receipts?.length===3&&receipts.every(receipt=>receipt.result?.status==='SUCCEEDED'
   &&receipt.result.cleanup_complete===true&&receipt.result.action_key==='ui.act'&&typeof receipt.result.operation_id==='string')
  &&new Set(receipts.map(receipt=>receipt.result.operation_id)).size===3
  &&receipts[0].tid==='mnContextMenu;mniShowCompletedProcesses'&&receipts[0].verb==='click'
  &&receipts[1].tid==='ConsoleForm;ProgressForm;trpProgress;grd;tbl'&&receipts[1].verb==='right_click'
  &&receipts[2].tid==='mnContextMenu;mniShowCompletedProcesses'&&receipts[2].verb==='click',
  'Acknowledged standard DataPartition history filter refresh required');
 const semantic=snapshot=>snapshot.processes.map(process=>{
  need(process.state==='completed'&&process.error===false&&process.progress_state?.verified===true
   &&process.progress_state.source==='native_progress_record'&&process.progress_state.terminal===true
   &&process.progress_state.can_cancel===false,'Only confirmed completed DataPartition history can refresh');
  return Object.fromEntries(['process_id','parent_id','caption','state','error','progress_state'].map(key=>[key,process[key]]));
 });
 need(isDeepStrictEqual(semantic(before),semantic(after)),'DataPartition logical process history changed during refresh');
 need(after.processes.every(process=>{
  const old=before.processes.find(previous=>previous.process_id===process.process_id);
  // The native filter recreates UI records and may drop a cached owner. Retain
  // the pre-refresh verified activation proof; a different owner is forbidden.
  return (!process.owner||isDeepStrictEqual(process.owner,old.owner))
   &&!before.processes.some(previous=>previous.record_id===process.record_id&&previous.process_id!==process.process_id);
 }),'DataPartition history refresh changed native process ownership');
 return {...configuration,execution_baseline:structuredClone(current),history_refresh:{verified:true,
  before:structuredClone(before),after:structuredClone(after),receipts:structuredClone(receipts)}};
}

export async function prepareDataPartitionExecution(channel,node,{baseline,configuration,outputs,operation}){
 need(operation.transportUncertain!==true,'Uncertain DataPartition operation cannot prepare another execution');
 need(configuration?.verified===true&&configuration.mode===operation.nodeApply.request.mode
  &&outputs?.verified===true&&outputs.ports?.length===3,'Confirmed DataPartition configuration/output commits required');
 let snapshot,refreshBefore,refreshAfter,hidden=false,preparing=true;
 const receipts=[];
 const driver=createNodeExecutionProcedure({perform:async spec=>{
  let action,tid;
  const result=await channel.perform({...spec,resolve:state=>{
   action=spec.resolve(state);
   need(!preparing||action.verb!=='execute_graph_node','DataPartition Execute cannot enter a preparation baseline');
   tid=state.ui.elements.find(element=>element.ref===action.ref)?.tid;
   return action;
  }});
  if(refreshBefore&&!refreshAfter)receipts.push({tid,verb:action?.verb,result:structuredClone(result)});
  return result;
 },observe:async spec=>{
  const observed=await channel.observe(spec);
  if(observed.node_processes?.verified===true&&observed.node_processes.inventory_complete===true
   &&observed.node_processes.show_completed===true)snapshot=structuredClone(observed.node_processes);
  if(spec.condition==='completed process filter observed'&&observed.node_processes?.show_completed===true&&snapshot?.processes.length>=30
   &&snapshot.processes.every(process=>process.state==='completed'&&process.error===false))refreshBefore=structuredClone(snapshot);
  if(spec.condition==='completed history temporarily hidden'){
   need(refreshBefore&&receipts.length===1&&observed.node_processes?.verified===true
    &&observed.node_processes.show_completed===false&&observed.node_processes.processes.length===0,
    'DataPartition history filter hide is unconfirmed');hidden=true;
  }
  if(spec.condition==='complete history refreshed before execution baseline'){
   need(hidden&&receipts.length===3,'DataPartition history restoration is unconfirmed');refreshAfter=structuredClone(snapshot);
  }
  return observed;
 }},node);
 const current=await driver.prepare();
 preparing=false;
 const evidence=refreshBefore?verifyDataPartitionHistoryRefresh(baseline,refreshBefore,refreshAfter,receipts)
  :verifyDataPartitionConfigurationBaseline(baseline,current,snapshot);
 need(isDeepStrictEqual(current,evidence.execution_baseline),'DataPartition final baseline differs from its verified history');
 return {driver,evidence};
}
