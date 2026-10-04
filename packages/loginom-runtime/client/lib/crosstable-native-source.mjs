const need=(v,m)=>{if(!v)throw Error('CrossTable exact source: '+m);};
const owner=(a,b)=>['document_id','workflow_id','node_id'].every(k=>a?.[k]===b?.[k]);
const schema=fields=>fields.map(f=>({name:f.name,label:f.label,type:f.type}));
export function verifyCrossTableExecutionOwner(proof,ctx){
 need(proof?.verified===true&&proof.owner_verified===true&&proof.status==='completed'
  &&proof.execution_id===ctx.execution.execution_id&&proof.execution_id.startsWith(ctx.document_id+':'),'completed native execution owner proof required');
 return true;
}

// Only the executor's private, settled history grants a Collapse ancestor.
// Latest failed or nonexecuted changes invalidate earlier completed settings.
export function completedCrossTableCollapses(history,ctx){
 need(Array.isArray(history)&&history.length<=1024,'bounded private history required');
 const seen=new Set(),result=[];
 for(const item of [...history].reverse()){
  const r=item.request,o=item.outcome?.output,ref=o?.node??r?.target?.ref;
  if(!ref||ref.document_id!==ctx.document_id||ref.workflow_id!==ctx.workflow_ref.workflow_id||seen.has(ref.node_id))continue;
  seen.add(ref.node_id);
  if(r.target?.type!=='transform.collapse_columns'||item.cleanup_confirmed!==true||item.outcome?.status!=='SUCCEEDED'
   ||o?.status!=='SUCCEEDED'||o.cleanup_complete!==true||o.execution?.status!=='completed')continue;
  const c=o.configuration?.readback;
  need(c?.kind==='collapse'&&c.values_are==='observed_ui_values'&&owner(c.node,ref)
   &&c.mode==='unpivot'&&typeof c.ignore_empty==='boolean','complete observed Collapse settings required');
  need(c.receipt_ids?.length===5&&c.receipt_ids.every(id=>o.phases?.some(p=>p.receipt_id===id&&p.status==='verified')),'Collapse configuration receipts required');
  need(Number.isSafeInteger(item.sequence),'Collapse execution order required');
  result.push({node_id:ref.node_id,execution_id:o.execution.execution_id,sequence:item.sequence,configuration:c});
 }
 return result;
}

export function validateCrossTableNativeSources(imports,collapses,inputFields){
 need(Array.isArray(imports)&&imports.length>0&&imports.length<=128&&Array.isArray(collapses)&&collapses.length<=128,'source provenance required');
 for(const source of imports)need(typeof source.node_id==='string'&&typeof source.execution_id==='string'
  &&source.configuration?.kind==='text_import'&&source.configuration.source.connection==='Локальное'
  &&source.configuration.source.source_path===source.source?.destination
  &&source.source.bytes_verified===true&&(source.source.upload_completion_verified===true
   ||source.source.provenance==='independent_server_file_download'&&source.source.download_completion_verified===true)
  &&Number.isSafeInteger(source.source.bytes)&&source.source.bytes>=0&&source.source.bytes<=16777216
  &&/^[a-f0-9]{64}$/.test(source.source.sha256),'byte-verified static import required');
 for(const c of collapses){
  const cfg=c.configuration;
  need(typeof c.node_id==='string'&&typeof c.execution_id==='string'&&cfg?.kind==='collapse'
   &&cfg.node?.node_id===c.node_id&&cfg.values_are==='observed_ui_values'&&cfg.mode==='unpivot'
   &&typeof cfg.ignore_empty==='boolean'&&Array.isArray(cfg.information)&&Array.isArray(cfg.transposed)&&cfg.transposed.length>0
   &&cfg.input_mapping?.port===0&&cfg.output_mapping?.port===0,'observed Collapse lineage required');
  need(cfg.input_mapping.fields.every(f=>f.name===f.source_name)
   &&cfg.output_mapping.fields.every(f=>!f.excluded&&f.name===f.source_name),'mapped or excluded ancestor fields are unsupported');
 }
 need(Array.isArray(inputFields)&&inputFields.length>0&&inputFields.length<=128,'bounded complete input schema required');
 return {imports:structuredClone(imports),collapses:structuredClone(collapses),input_schema:schema(inputFields)};
}
