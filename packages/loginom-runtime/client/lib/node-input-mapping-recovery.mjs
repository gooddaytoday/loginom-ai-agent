const need=(value,message)=>{if(!value)throw Error('Input mapping recovery: '+message);};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export const sameInputRecovery=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export const inputMappingOrigin=origin=>new URL(origin).href;
const sameNode=(a,b)=>['document_id','workflow_id','node_id'].every(k=>typeof a?.[k]==='string'&&a[k]===b?.[k]);

export function inputMappingState(mapping,node){
 need(mapping?.verified===true&&mapping.inventory_complete===true&&mapping.source_identity_verified===true
  &&mapping.mapping_wizard==='TuneDataSourceMappingWizard'&&sameNode(mapping.node_context,node),'complete owned input mapping required');
 const p=mapping.node_context.input_port;
 need(p?.direction==='input'&&p.port===0&&typeof p.port_guid==='string'&&p.port_guid.length>0,'input port 0 identity required');
 // Ext recreates record IDs and painted row windows when reopening. Native field
 // IDs, ordering, sources, usage, type, kind and autosync must remain identical.
 const fields=x=>Array.isArray(x)?x.map(fields):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>k!=='record_id').map(([k,v])=>[k,fields(v)])):x;
 return {node:structuredClone(node),port:{direction:p.direction,port:p.port,native_index:p.native_index,port_guid:p.port_guid},
  autosync:mapping.autosync,source_fields:fields(mapping.source_fields),target_fields:fields(mapping.target_fields)};
}
export function inputMappingGraph(graph,node){
 need(graph?.complete===true&&graph.document_id===node.document_id&&graph.workflow_ref?.workflow_id===node.workflow_id
  &&Array.isArray(graph.foreign_links)&&graph.foreign_links.length===0,'complete prepared graph required');
 const links=graph.links.filter(e=>e.target===node.node_id);
 need(links.length===1&&links[0].input===0,'one unchanged source connection required');
 const nodes=[node.node_id,links[0].source].map(id=>{
  const found=graph.nodes.filter(n=>n.ref.node_id===id);need(found.length===1&&!found[0].locked,'unlocked source/target required');
  const {ref,type,label,inputs,outputs}=found[0];return {ref,type,label,inputs,outputs};
 });
 return {nodes,links};
}
export function verifyInputMappingFinish(checkpoint,response){
 const r=response?.receipt,c=checkpoint;
 need(response?.state==='completed'&&r?.status==='SUCCEEDED'&&r.cleanup_complete===true
  &&r.operation_id===c.finish_reference?.id&&r.action_key==='ui.act','original completed browser receipt required');
 need(inputMappingOrigin(r.output?.origin)===c.origin&&r.output.loginom_build===c.build&&sameNode(r.output.prepared_node_context,c.node)
  &&r.output.prepared_node_context.surface==='graph'&&r.output.prepared_node_context.locked===false
  &&r.output.wizard?.status==='absent','finish belongs to a different prepared graph');
 const finishes=r.trace?.filter(e=>e.event==='input_port_finish_verified')??[];
 need(finishes.length===1&&finishes[0].wizard_root_ref===c.wizard_root_ref
  &&r.trace.filter(e=>e.event==='ui_gesture_applied').length===1
  &&r.trace.some(e=>e.event==='ui_gesture_applied'&&e.verb==='finish_wizard'),'exact input Done proof required');
 return r;
}
export function inputRecoveryBoundary(operation,now){
 const s=operation.nodeApply;
 need(s?.pending?.phase==='input_mapping'&&s.pending.receipt_id===operation.id+':input_mapping'
  &&s.phases.at(-1)?.phase==='target'&&s.phases.every(p=>['source','workflow','target'].includes(p.phase))
  &&s.execution.status==='not_requested'&&s.output.status==='not_refreshed','original pre-execution boundary required');
 need(now()<Math.min(s.deadline,s.configure_deadline,s.pending.deadline),'original configuration deadline expired');
 return s;
}
export async function reconcileInputMappingPhase({operation,readReceipt,record,now=Date.now,signal}){
 const s=inputRecoveryBoundary(operation,now),driver=operation.nodeApplyDrivers;
 need(typeof driver?.recoverInputMapping==='function','handler has no admitted recovery');
 const pending=structuredClone(s.pending),value=await driver.recoverInputMapping({readReceipt,signal});
 need(value?.verified===true&&value.cleanup_complete===true&&value.finish?.settings_applied===true
  &&value.finish.execution_started===false&&value.recovery?.verified===true,'mapping reconciliation incomplete');
 inputRecoveryBoundary(operation,now);need(sameInputRecovery(pending,s.pending),'pending checkpoint changed');
 const receipt={phase:'input_mapping',receipt_id:pending.receipt_id,status:'verified',effect_possible:true,value};
 const event={operation_id:operation.id,action_key:'node.apply',action_revision:s.request.contract_revision,
  phase:'node_phase_completed',signature:s.signature,receipt};
 const ack=await record(event);need(ack&&sameInputRecovery(event,Object.fromEntries(Object.keys(event).map(k=>[k,ack[k]]))),'phase journal acknowledgement differs');
 s.phases.push(structuredClone(receipt));s.pending=null;s.cleanup_complete=true;s.effect_possible=true;s.input_mapping_recovered=true;
 operation.cleanupConfirmed=true;operation.transportUncertain=false;
 return value;
}
