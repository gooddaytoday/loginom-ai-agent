const requireValue=(value,message)=>{if(!value)throw new Error(message);};
const id=v=>typeof v==='string' && /^[1-9][0-9]*(?:\.[1-9][0-9]*)*$/.test(v);
const nonempty=v=>typeof v==='string' && v.length>0;
const sameNode=(a,b)=>['document_id','workflow_id','node_id'].every(k=>nonempty(a?.[k])&&a[k]===b?.[k]);

function inventory(snapshot,node,rootId) {
  requireValue(snapshot?.verified===true && snapshot.show_completed===true && snapshot.inventory_complete===true,
    'Complete process history with completed entries is required');
  requireValue(nonempty(snapshot.root_id) && (!rootId||snapshot.root_id===rootId)
    && Array.isArray(snapshot.processes) && snapshot.processes.length<=2000,'Process root identity missing or changed');
  requireValue(snapshot.node_context?.verified===true && sameNode(snapshot.node_context,node),'Process history belongs to another prepared node');
  const ps=snapshot.processes,ids=new Set(ps.map(p=>p.process_id)),records=new Set(ps.map(p=>p.record_id));
  requireValue(ids.size===ps.length && records.size===ps.length && ps.every(p=>id(p.process_id)&&nonempty(p.record_id)
    && (p.parent_id===null?!p.process_id.includes('.'):ids.has(p.parent_id)
      && p.process_id.slice(0,p.process_id.lastIndexOf('.'))===p.parent_id)), 'Process IDs, records or parents are ambiguous');
  return ps;
}

// A browser-local process ID alone is not an execution identity. Retain the
// complete pre-launch inventory, native root incarnation and prepared node.
export function captureExecutionBaseline(snapshot,node) {
  const ps=inventory(snapshot,node);
  return {root_id:snapshot.root_id,node:structuredClone(node),roots:ps.filter(p=>p.parent_id===null)
    .map(p=>({process_id:p.process_id,record_id:p.record_id,completed:p.state==='completed'&&p.error===false})),launch_verified:false};
}

export function identifyNewExecution(baseline,snapshot) {
  const roots=inventory(snapshot,baseline.node,baseline.root_id).filter(p=>p.parent_id===null);
  const missing=baseline.roots.filter(old=>!roots.some(p=>p.process_id===old.process_id&&p.record_id===old.record_id));
  const fresh=roots.filter(p=>!baseline.roots.some(old=>old.process_id===p.process_id));
  // Loginom may evict the oldest completed history entry as a new group arrives.
  // Accept only this narrow transition; never accept reset/reused IDs, loss of
  // an active record, multiple launches, or a change of any retained record.
  const ordered=[...baseline.roots].sort((a,b)=>BigInt(a.process_id)<BigInt(b.process_id)?-1:1);
  const rolling=ordered.length>=2&&missing.length===1&&missing[0].process_id===ordered[0].process_id&&missing[0].completed===true
    &&roots.length===ordered.length&&fresh.length===1&&BigInt(fresh[0].process_id)===BigInt(ordered.at(-1).process_id)+1n
    &&ordered.slice(1).every(old=>roots.some(p=>p.process_id===old.process_id&&p.record_id===old.record_id));
  requireValue(missing.length===0||rolling,'Previous process history disappeared or changed');
  requireValue(fresh.length===1,'Exactly one new execution group is required');
  requireValue(!baseline.roots.some(old=>old.record_id===fresh[0].record_id),'Execution record was reused');
  return {group_id:fresh[0].process_id,group_record_id:fresh[0].record_id,root_id:baseline.root_id,
    node:structuredClone(baseline.node),execution_id:baseline.node.document_id+':'+baseline.root_id+':'+fresh[0].process_id,
    owner_verified:false,completed:false};
}

export function verifyCompletedExecution(execution,snapshot,owner) {
  const ps=inventory(snapshot,execution.node,execution.root_id);
  const group=ps.find(p=>p.parent_id===null&&p.process_id===execution.group_id&&p.record_id===execution.group_record_id);
  requireValue(group?.state==='completed' && group.error===false && group.children_loaded===true,'New execution group is not completed or loaded');
  // A group may also execute upstream nodes. The UI's Show Node action must
  // independently bind the selected child to the requested node.
  const p=ps.find(p=>p.process_id===owner?.process_id&&p.record_id===owner?.record_id
    && p.process_id.startsWith(execution.group_id+'.'));
  requireValue(ps.filter(p=>p.selected===true).length===1 && p?.rendered===true && p.selected===true && p.state==='completed' && p.error===false,
    'The selected requested node process is not completed');
  requireValue(owner?.verified===true && owner.node_selected===true && sameNode(owner.node,execution.node),
    'Process ownership is not bound to the requested selected node');
  return {verified:true,cleanup_complete:true,effect_possible:false,status:'completed',execution_id:execution.execution_id,
    process_id:p.process_id,process_record_id:p.record_id,group_id:execution.group_id,owner_verified:true};
}

// A dependency can fail before the requested child starts. This proves failure
// of the uniquely identified launch group, not execution of that child.
export function verifyFailedExecution(execution,snapshot) {
  const ps=inventory(snapshot,execution.node,execution.root_id);
  const group=ps.find(p=>p.parent_id===null&&p.process_id===execution.group_id&&p.record_id===execution.group_record_id);
  requireValue(execution.execution_id===execution.node.document_id+':'+execution.root_id+':'+execution.group_id,
    'Failed execution identity differs');
  requireValue(group?.error===true&&group.progress_state?.verified===true&&group.progress_state.state==='failed'
    &&group.progress_state.source==='native_progress_record'&&group.progress_state.terminal===true
    &&group.progress_state.can_cancel===false&&nonempty(group.error_details?.trim()),'Same execution group must have a verified terminal failure and reason');
  return {verified:true,status:'failed',execution_id:execution.execution_id,node:structuredClone(execution.node),
    root_id:execution.root_id,group_id:execution.group_id,group_record_id:execution.group_record_id,
    failure_verified:true,output_refreshed:false,error:{code:'NODE_EXECUTION_FAILED',message:group.error_details.slice(0,1000)}};
}

// Upstream dependencies can add sibling processes to this launch. Their captions
// do not identify the requested child; use cached ModelNode object ownership.
// Show Node remains an independent check before accepting completion.
export function selectExecutionChild(execution,snapshot) {
  const ps=inventory(snapshot,execution.node,execution.root_id);
  const group=ps.find(p=>p.parent_id===null&&p.process_id===execution.group_id&&p.record_id===execution.group_record_id);
  requireValue(group?.children_loaded===true,'Execution children are not loaded');
  const children=ps.filter(p=>p.parent_id===execution.group_id);
  if(children.length===1)return structuredClone(children[0]);
  const owned=children.filter(p=>p.owner?.verified===true&&p.owner.node_id===execution.node.node_id
    &&p.owner.source==='native_process_model_identity');
  requireValue(owned.length===1,'Exactly one native-owned execution child is required');
  return structuredClone(owned[0]);
}

// Freeze the exact cancellable child before opening its menu. A matching
// caption or a running group is not evidence that this is the requested node.
// Return an expected proof to compare with the native menu; this is not itself
// an ownership observation and must never authorize cancellation on its own.
export function expectedExecutionStopProof(execution,snapshot) {
  const ps=inventory(snapshot,execution.node,execution.root_id);
  const group=ps.find(p=>p.parent_id===null&&p.process_id===execution.group_id&&p.record_id===execution.group_record_id);
  requireValue(group?.children_loaded===true,'Execution group is missing or not loaded');
  const child=selectExecutionChild(execution,snapshot),state=child.progress_state;
  requireValue(state?.verified===true && ['running','not_responding'].includes(state.state)
    && state.terminal===false && state.can_cancel===true,'Execution child is not cancellable');
  return {root_id:execution.root_id,record_id:child.record_id,process_id:child.process_id,node_id:execution.node.node_id,
    owner_verified:true,can_cancel:true,source:'native_process_model_identity'};
}

export function verifyCancelledExecution(execution,snapshot,proof) {
  const ps=inventory(snapshot,execution.node,execution.root_id);
  requireValue(proof?.root_id===execution.root_id&&proof.node_id===execution.node.node_id&&proof.owner_verified===true
    &&proof.can_cancel===true&&proof.source==='native_process_model_identity','Native cancellation ownership proof required');
  const group=ps.find(p=>p.parent_id===null&&p.process_id===execution.group_id&&p.record_id===execution.group_record_id);
  const child=ps.find(p=>p.parent_id===execution.group_id&&p.process_id===proof.process_id&&p.record_id===proof.record_id);
  const owned=selectExecutionChild(execution,snapshot);
  requireValue(owned.process_id===proof.process_id&&owned.record_id===proof.record_id,
    'Cancelled process ownership changed');
  for(const p of [group,child])requireValue(p?.progress_state?.verified===true&&p.progress_state.state==='cancelled'
    &&p.progress_state.terminal===true&&p.progress_state.can_cancel===false,'Same execution records must be terminal cancelled');
  return {verified:true,status:'cancelled',execution_id:execution.execution_id,group_id:execution.group_id,
    process_id:child.process_id,process_record_id:child.record_id,owner_verified:true,
    output_refreshed:false,stop_verified:true};
}
