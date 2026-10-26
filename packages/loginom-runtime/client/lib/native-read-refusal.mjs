const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const owner=(context,node)=>context?.verified===true&&context.surface==='graph'
 &&['document_id','workflow_id','node_id'].every(k=>context[k]===node[k]);
export function verifiedJavascriptUiReadRefusal(refusal,node,execution,read) {
 const p=refusal?.proof,r=p?.returned;
 return read?.coverage==='full'&&read.sample_rows===100&&read.require_exact_numbers===true
  &&refusal?.phase==='read'&&refusal.status==='FAILED'&&refusal.verification==='javascript_full_bound_refused'
  &&refusal.effect_possible===false&&refusal.cleanup_complete===true&&refusal.settings_unchanged===true
  &&Number.isSafeInteger(p?.row_count)&&p.row_count>100
  &&Number.isInteger(p.sample_rows)&&p.sample_rows>=0&&p.sample_rows<=100
  &&execution?.status==='completed'&&same(p.execution,execution)
  &&same(p.table,r?.source_table)&&r?.verified===true&&r.execution_started===false&&r.reopen_performed===false&&owner(r.node_context,node)
  &&['view_guid','port_guid','table_tid'].every(k=>typeof r.source_table?.[k]==='string'&&r.source_table[k].length>0);
}

export function refuseJavascriptFullRead(read,data,returned,ctx) {
 const refusal={phase:'read',status:'FAILED',verification:'javascript_full_bound_refused',effect_possible:false,
  cleanup_complete:true,settings_unchanged:true,proof:{table:data.table,row_count:data.row_count,sample_rows:data.sample_rows,
   execution:structuredClone(ctx.execution),returned}};
 if(!verifiedJavascriptUiReadRefusal(refusal,ctx.node,ctx.execution,read))throw Error('JavaScript full read refusal cleanup is unverified');
 const error=Error('JavaScript full output has '+data.row_count+' rows; the UI read limit is 100. Workflow restored; read a sample of at most 100 rows or verify the downloaded CSV Export.');
 error.nodePhaseRefusal=refusal;throw error;
}
export function verifiedJavascriptPortReadRefusal(refusal,node,execution,read) {
 const p=refusal?.proof,r=p?.port_read,o=r?.output;
 return read?.coverage==='full'&&read.sample_rows===100&&read.require_exact_numbers===true
  &&refusal?.phase==='read'&&refusal.status==='FAILED'&&refusal.verification==='javascript_full_bound_refused'
  &&refusal.effect_possible===false&&refusal.cleanup_complete===true&&refusal.settings_unchanged===true
  &&execution?.status==='completed'&&same(p?.execution,execution)
  &&r?.verified===true&&r.cleanup_complete===true&&owner(r.node_context,node)
  &&o?.port===0&&o.fresh===true&&o.freshness_basis==='completed_execution_port_source'
  &&o.execution_id===execution.execution_id&&typeof p.port_guid==='string'&&p.port_guid.length>0&&o.port_guid===p.port_guid
  &&Number.isSafeInteger(o.row_count)&&o.row_count>0&&Number.isInteger(o.sample_rows)
  &&o.sample_rows>=0&&o.sample_rows<=100&&o.sample_rows<o.row_count&&o.sample_complete===false
  &&(o.row_count>100||o.read_limit==='preview_cell_or_byte_budget');
}
export function refuseJavascriptPortFullRead(read,result,ctx,portGuid) {
 const output=result?.output;
 const refusal={phase:'read',status:'FAILED',verification:'javascript_full_bound_refused',effect_possible:false,
  cleanup_complete:true,settings_unchanged:true,proof:{execution:structuredClone(ctx.execution),port_guid:portGuid,
   port_read:{verified:result?.verified,cleanup_complete:result?.cleanup_complete,node_context:result?.node_context,
    output:Object.fromEntries(['port','port_guid','fresh','freshness_basis','execution_id','row_count','sample_rows','sample_complete','read_limit']
     .filter(key=>Object.hasOwn(output??{},key)).map(key=>[key,output[key]]))}}};
 if(!verifiedJavascriptPortReadRefusal(refusal,ctx.node,ctx.execution,read))throw Error('JavaScript full read refusal cleanup is unverified');
 const error=Error(output.row_count>100?'JavaScript full output has '+output.row_count+' rows; the read limit is 100. Port cleanup confirmed; read a sample of at most 100 rows or verify the downloaded CSV Export.'
  :'Full JavaScript output exceeds bounded read coverage (cell or byte limit). Port cleanup confirmed; read a sample or verify the downloaded CSV Export.');
 error.nodePhaseRefusal=refusal;throw error;
}
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
 const p=refusal?.proof,b=p?.binding;
 return refusal?.phase==='read'&&refusal.status==='FAILED'&&refusal.effect_possible===true
  &&refusal.cleanup_complete===true&&refusal.settings_unchanged===true
  &&refusal.verification==='text_export_read_refused_restored'&&p?.navigation_only===true&&p.operation_id===operationId
  &&['document_id','workflow_id','node_id'].every(k=>b?.[k]===node?.[k])
  &&execution?.status==='completed'&&b?.execution_id===execution.execution_id
  &&typeof b?.destination==='string'&&typeof b?.session_id==='string'
  &&p.lease_released===true&&p.restored?.verified===true&&p.restored.cleanup_complete===true
  &&p.restored.quiet===true&&owner(p.restored.node_context,node)&&p.restored.node_context.locked===false;
}
