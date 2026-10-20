// Reader choice uses the independently observed owned Preview definition,
// never an expected result or inferred category combinations.
export function coldNativeEligible(configuration, output) {
 if (!configuration || output?.verified !== true || output.inventory_complete !== true
  || output.node_context?.verified !== true
  || !['document_id','workflow_id','node_id'].every(k=>typeof configuration.node_context?.[k]==='string' && configuration.node_context[k]===output.node_context?.[k])
  || output.port !== 0 || output.node_id !== configuration.node_context.node_id || !Array.isArray(output.fields)) return false;
 // Native DateTime supplies bytes, not inferred civil dates.
 return output.fields.length>0 && output.fields.length<=8
  && output.fields.every(f=>['string','integer','real','boolean','variant'].includes(f.type));
}

// A graph body can be repainted between two observations. Keep the native
// node and command identity; the common perform still binds fresh UI refs.
export function coldGraphExecutionIdentity(identity,node) {
 for(const key of ['launch','deactivation']) {
  const control=identity[key];
  if(control?.source==='native_selected_graph_node'&&control.node_id===node.node_id) {
   const {node_ref,...native}=control;
   return {...identity,[key]:native};
  }
 }
 return identity;
}

// The ordinary Views gesture may return a completed timeout receipt after
// dispatch. Reconcile only that owned opening by observation; never click again.
export async function openColdOutputViews(channel,{state,output},{node,operation,readReceipt,record}) {
 const owned=s=>s.prepared_node_context?.verified===true
  &&['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===node[k]);
 const controls=s=>s.ui.elements.filter(e=>e.allowed_actions.includes('open_node_views'));
 let s=state;
 if(s.node_outputs.node_selected!==true||controls(s).length!==1){
  const tid=s.prepared_node_context.tid;
  await channel.perform({condition:'select cold output node',initialObservation:s,
   ready:s=>owned(s)&&s.ui.elements.filter(e=>e.tid===tid&&e.graph_node?.part==='body'&&e.allowed_actions.includes('click')).length===1,
   resolve:s=>({verb:'click',ref:s.ui.elements.find(e=>e.tid===tid&&e.graph_node?.part==='body').ref}),identity:()=>({node})});
  s=await channel.observe({condition:'cold output visualizers control',readOutputs:true,
   ready:s=>owned(s)&&s.node_outputs?.node_selected===true&&controls(s).length===1});
 }
 try {
  await channel.perform({condition:'open cold output visualizers',initialObservation:s,
   ready:s=>owned(s)&&s.node_outputs?.node_selected===true&&controls(s).length===1,
   resolve:s=>({verb:'open_node_views',ref:controls(s)[0].ref}),identity:()=>({node,port_guid:output.port_guid})});
 } catch(error) {
  const r=error.receipt,step=channel.lastPreparedStep;
  if(operation.transportUncertain||Date.now()>=operation.deadline||step?.action?.verb!=='open_node_views'||r?.operation_id!==step.internal_operation_id
   ||r.action_key!=='ui.act'||r.status!=='AMBIGUOUS'||r.phase!=='observing'||r.effect_possible!==true
   ||r.cleanup_complete!==true||r.error?.code!=='UI_DEADLINE_EXCEEDED'||!Array.isArray(r.trace)
   ||r.trace.filter(e=>e.event==='ui_preconditions_verified'&&e.verb==='open_node_views').length!==1
   ||JSON.stringify(r.trace.find(e=>e.event==='ui_preconditions_verified')?.refs)!==JSON.stringify([step.action.ref])
   ||r.trace.filter(e=>e.event==='ui_gesture_applied'&&e.verb==='open_node_views').length!==1)throw error;
  const inspected=await readReceipt({id:step.internal_operation_id,operation_id:step.internal_operation_id,
   action_key:'ui.act',signature:step.signature});
  if(inspected?.state!=='completed'||JSON.stringify(inspected.receipt)!==JSON.stringify(r))throw error;
  await channel.observe({condition:'settle the dispatched cold output opening',readOutputs:true,
   ready:s=>owned(s)&&s.prepared_node_context.surface==='views'&&s.node_outputs?.verified===true
    &&s.node_outputs.port_panels?.filter(p=>p.port_guid===output.port_guid).length===1
    &&s.ui.dialogs.length===0&&s.ui.masks.length===0});
  await record({phase:'cold_output_views_settled',operation_id:operation.id,
   opening_operation_id:r.operation_id,node,port_guid:output.port_guid,effect_possible:true,deadline:operation.deadline});
 }
}

export async function performColdNodeAction(channel,options,{node,operation,record,now=Date.now}) {
 let binding,intent,verb,document,workflow,fresh;
 const identity=s=>{
  const value=coldGraphExecutionIdentity(options.identity(s),node),next=JSON.stringify(value);
  if(binding!==undefined&&(binding!==next||document!==s.dom_epoch?.document||workflow!==JSON.stringify(s.workflow_ref)))
   throw Error('Cold execution control identity changed');
  binding=next;document=s.dom_epoch?.document;workflow=JSON.stringify(s.workflow_ref);
  return value;
 };
 const resolve=s=>{
  const action=options.resolve(s),next=JSON.stringify(Object.fromEntries(Object.entries(action).filter(([k])=>!['ref','source_ref','target_ref'].includes(k))));
  if(intent!==undefined&&intent!==next)throw Error('Cold execution control intent changed');
  intent=next;verb=action.verb;return action;
 };
 for(let attempt=0;attempt<2;attempt++) {
  try{return await channel.perform({...options,identity,resolve,...(attempt?{initialObservation:fresh}:{})});}
  catch(error) {
   const r=error.receipt,s=r?.output;
   if(attempt||now()>=operation.deadline||operation.transportUncertain||r?.status!=='NOT_APPLIED'
    ||r.action_key!=='ui.act'||r.phase!=='preconditions'||r.error?.code!=='GRAPH_EXECUTION_CONTEXT_CHANGED'
    ||r.effect_possible!==false||r.cleanup_complete!==true||!Array.isArray(r.trace)
    ||r.trace.some(e=>['ui_preconditions_verified','ui_gesture_applied'].includes(e.event))
    ||s?.prepared_node_context?.verified!==true||!['document_id','workflow_id','node_id'].every(k=>s.prepared_node_context[k]===node[k])
    ||s.prepared_node_context.surface!=='graph'||s.prepared_node_context.locked!==false
    ||binding===undefined||!['execute_graph_node','deactivate_graph_node'].includes(verb))throw error;
   identity(s);
   await record({phase:'cold_graph_execution_control_refresh',operation_id:operation.id,
    refused_operation_id:r.operation_id,deadline:operation.deadline,effect_possible:false});
   fresh=await channel.observe({condition:options.condition,ready:options.ready,readOutputs:true,
    confirmIdentity:options.confirmIdentity,timeoutMs:options.timeoutMs??15000});
  }
 }
}

// Resume only execution observation after a settled refusal before a gesture.
// The driver retains its original baseline, launch and process identities.
export async function runColdExecution({driver,channel,node,operation,readReceipt,record,now=Date.now}) {
 await driver.prepare();
 await driver.launchGraph();
 for(const phase of ['identify','waitCompleted']) {
  for(let attempt=0;attempt<2;attempt++) {
   try {
    const result=await driver[phase]();
    if(phase==='waitCompleted')return result;
    break;
   } catch(error) {
    if(attempt||now()>=operation.deadline||operation.transportUncertain)throw error;
    if(!error.receipt&&error.message!=='Node procedure recovery target or intent changed')throw error;
    const step=channel.lastPreparedStep;
    const response=step&&await readReceipt({id:step.internal_operation_id,
     operation_id:step.internal_operation_id,action_key:'ui.act',signature:step.signature});
    const refused=response?.state==='completed'?response.receipt:null;
    if(!refused||refused.operation_id!==step.internal_operation_id||refused.action_key!=='ui.act'
      ||refused.status!=='NOT_APPLIED'||refused.effect_possible!==false||refused.cleanup_complete!==true
      ||!Array.isArray(refused.trace)||refused.trace.some(e=>['ui_preconditions_verified','ui_gesture_applied'].includes(e.event)))throw error;
    const owned=b=>b?.verified===true&&['document_id','workflow_id','node_id'].every(k=>b[k]===node[k]);
    const mismatch=refused.trace.filter(e=>e.event==='prepared_node_surface_mismatch');
    const lockOnly=refused.phase==='observing'&&refused.error?.code==='PREPARED_NODE_CONTEXT_CHANGED'
     &&mismatch.length===1&&[mismatch[0].before,mismatch[0].after].every(b=>owned(b)&&b.surface==='graph'&&typeof b.locked==='boolean')
     &&mismatch[0].before.locked!==mismatch[0].after.locked
     &&JSON.stringify({...mismatch[0].before,locked:false})===JSON.stringify({...mismatch[0].after,locked:false});
    const epochOnly=refused.phase==='preconditions'&&refused.error?.code==='UI_EPOCH_CHANGED'
     &&owned(refused.output?.prepared_node_context)&&mismatch.length===0;
    if(!lockOnly&&!epochOnly)throw error;
    await record({phase:'cold_execution_observation_refresh',operation_id:operation.id,
     execution_phase:phase,refused_operation_id:refused.operation_id,reason:lockOnly?'graph_lock_changed':'ui_epoch_changed',
     deadline:operation.deadline,effect_possible:false});
   }
  }
 }
}
