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
