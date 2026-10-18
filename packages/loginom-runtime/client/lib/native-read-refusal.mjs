const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const owner=(context,node)=>context?.verified===true&&context.surface==='graph'
 &&['document_id','workflow_id','node_id'].every(k=>context[k]===node[k]);
export function verifiedNativeReadRefusal(refusal,node,execution,read) {
 const p=refusal?.proof,b=p?.binding;
 return read?.coverage==='full'&&refusal?.phase==='read'&&refusal.status==='FAILED'
  &&refusal.verification==='native_full_bound_refused'&&refusal.effect_possible===true
  &&refusal.cleanup_complete===true&&refusal.settings_unchanged===true
  &&b?.refusal?.code==='NATIVE_FULL_BOUND_EXCEEDED'&&b.port===0
  &&['document_id','workflow_id','node_id'].every(k=>b[k]===node?.[k])
  &&execution?.status==='completed'&&same(b.execution,execution)
  &&Number.isSafeInteger(b.row_count)&&b.row_count>=0&&Array.isArray(b.schema)&&b.schema.length>0
  &&(b.row_count>50||b.schema.length>8)&&typeof b.port_guid==='string'&&b.port_guid.length>0
  &&p.closed?.verified===true&&p.closed.cleanup_complete===true&&p.closed.preview_closed===true
  &&p.closed.port_guid===b.port_guid&&owner(p.closed.node_context,node);
}
export function verifiedExportReadRefusal(refusal,node,execution,operationId){
 const p=refusal?.proof,b=p?.binding,d=p?.download;
 return refusal?.phase==='read'&&refusal.status==='FAILED'&&refusal.effect_possible===true
  &&refusal.cleanup_complete===true&&refusal.settings_unchanged===true
  &&refusal.verification==='text_export_download_refused_restored'
  &&['document_id','workflow_id','node_id'].every(k=>b?.[k]===node?.[k])
  &&execution?.status==='completed'&&b?.execution_id===execution.execution_id
  &&typeof b?.destination==='string'&&typeof b?.session_id==='string'
  &&[':export-download',':export-download-1',':export-download-2'].some(suffix=>d?.operation_id===operationId+suffix)
  &&d.status==='NOT_APPLIED'&&d.effect_possible===false&&d.cleanup_complete===true
  &&d.code==='DOWNLOAD_GESTURE_NOT_CONFIRMED'&&d.gesture_error==='UI_EPOCH_CHANGED'
  &&p.lease_released===true&&p.restored?.verified===true&&p.restored.cleanup_complete===true
  &&p.restored.quiet===true&&owner(p.restored.node_context,node)&&p.restored.node_context.locked===false;
}
