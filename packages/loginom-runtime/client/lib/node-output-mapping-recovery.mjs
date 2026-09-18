const need=(value,message)=>{if(!value)throw Error('Output mapping recovery: '+message);};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export const sameOutputRecovery=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export const outputMappingOrigin=origin=>new URL(origin).href;
const sameNode=(a,b)=>['document_id','workflow_id','node_id'].every(k=>typeof a?.[k]==='string'&&a[k]===b?.[k]);

export function outputMappingState(mapping,node){
 need(mapping?.verified===true&&mapping.inventory_complete===true&&mapping.source_identity_verified===true
  &&mapping.mapping_wizard==='DerivedDataSourceOutputSocketWizard'&&sameNode(mapping.node_context,node),'complete owned output mapping required');
 const p=mapping.node_context.output_port;
 need(p?.direction==='output'&&p.port===0&&typeof p.port_guid==='string'&&p.port_guid.length>0,'output port 0 identity required');
 // Ext recreates record IDs and painted row windows when reopening. Native field
 // IDs, ordering, sources, usage, type, kind and autosync must remain identical.
 const fields=x=>Array.isArray(x)?x.map(fields):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>k!=='record_id').map(([k,v])=>[k,fields(v)])):x;
 const source_fields=fields(mapping.source_fields),target_fields=fields(mapping.target_fields);
 // 7.4.2 recreates the excluded-row placeholder after Done (live probe:
 // credit_score placeholder 18 -> 27, exclusion_source field_id 4 unchanged).
 // Keep the actual source identity and every exclusion setting. Active output
 // IDs remain strict; only a uniquely bound excluded placeholder is ephemeral.
 for(const field of target_fields)if(field.excluded===true&&field.source===null){
  need(field.exclusion_source?.field_id&&source_fields.filter(s=>sameOutputRecovery(s,field.exclusion_source)).length===1,
   'excluded placeholder must retain its exact unique source');
  delete field.field_id;
 }
 return {node:structuredClone(node),port:{direction:p.direction,port:p.port,native_index:p.native_index,port_guid:p.port_guid},
  autosync:mapping.autosync,source_fields,target_fields};
}
export function verifyOutputMappingFinish(checkpoint,response){
 const r=response?.receipt,c=checkpoint;
 need(response?.state==='completed'&&r?.status==='SUCCEEDED'&&r.cleanup_complete===true
  &&r.operation_id===c.finish_reference?.id&&r.action_key==='ui.act','original completed browser receipt required');
 need(outputMappingOrigin(r.output?.origin)===c.origin&&r.output.loginom_build===c.build&&sameNode(r.output.prepared_node_context,c.node)
  &&r.output.prepared_node_context.surface==='graph'&&r.output.prepared_node_context.locked===false
  &&r.output.wizard?.status==='absent','finish belongs to a different prepared graph');
 const finishes=r.trace?.filter(e=>e.event==='output_port_finish_verified')??[];
 need(finishes.length===1&&finishes[0].wizard_root_ref===c.wizard_root_ref
  &&r.trace.filter(e=>e.event==='ui_gesture_applied').length===1
  &&r.trace.some(e=>e.event==='ui_gesture_applied'&&e.verb==='finish_wizard'),'exact output Done proof required');
 return r;
}
export function outputRecoveryBoundary(operation,now){
 const s=operation.nodeApply;
 need(s?.pending?.phase==='output_mapping'&&s.pending.receipt_id===operation.id+':output_mapping'
  &&s.request.target?.type==='transform.calculator'&&s.phases.at(-1)?.phase==='node_finish'
  &&s.phases.every(p=>['source','workflow','target','input_mapping','open','configure','node_finish'].includes(p.phase))
  &&s.execution.status==='not_requested'&&s.output.status==='not_refreshed','original pre-execution boundary required');
 need(now()<Math.min(s.deadline,s.configure_deadline,s.pending.deadline),'original configuration deadline expired');
 return s;
}
export async function reconcileOutputMappingPhase({operation,readReceipt,record,now=Date.now,signal}){
 const s=outputRecoveryBoundary(operation,now),driver=operation.nodeApplyDrivers;
 need(typeof driver?.recoverOutputMapping==='function','handler has no admitted recovery');
 const pending=structuredClone(s.pending),value=await driver.recoverOutputMapping({readReceipt,signal});
 need(value?.verified===true&&value.cleanup_complete===true&&value.finish?.settings_applied===true
  &&value.finish.execution_started===false&&value.recovery?.verified===true,'mapping reconciliation incomplete');
 outputRecoveryBoundary(operation,now);need(sameOutputRecovery(pending,s.pending),'pending checkpoint changed');
 const receipt={phase:'output_mapping',receipt_id:pending.receipt_id,status:'verified',effect_possible:true,value};
 const event={operation_id:operation.id,action_key:'node.apply',action_revision:s.request.contract_revision,
  phase:'node_phase_completed',signature:s.signature,receipt};
 const ack=await record(event);need(ack&&sameOutputRecovery(event,Object.fromEntries(Object.keys(event).map(k=>[k,ack[k]]))),'phase journal acknowledgement differs');
 s.phases.push(structuredClone(receipt));s.pending=null;s.cleanup_complete=true;s.effect_possible=true;s.output_mapping_recovered=true;
 operation.cleanupConfirmed=true;operation.transportUncertain=false;
 return value;
}

export function outputRecoveryCalculatorState(configuration,node){
 need(configuration?.verified===true&&configuration.inventory_complete===true
  &&configuration.mode==='expression'&&sameNode(configuration.node_context,node),'complete owned calculator configuration required');
 const pick=(value,keys)=>Object.fromEntries(keys.map(k=>{need(Object.hasOwn(value,k),'calculator field missing: '+k);return [k,value[k]];}));
 return {node:structuredClone(node),mode:configuration.mode,
  expressions:configuration.expressions.map(e=>pick(e,['index','expression_id','name','label','type','formula','intermediate','replace','cached','description'])),
  input_fields:configuration.input_fields.map(f=>pick(f,['name','label','type','replaced']))};
}
