import {configureOutputAutosync} from './port-mapping-procedure.mjs';
import {showMissingValuesMappingTable} from './missing-values-output.mjs';
const need=(v,m)=>{if(!v)throw Error('CrossTable autosync: '+m);};
const owner=(a,b)=>['document_id','workflow_id','node_id'].every(k=>a?.[k]===b?.[k]);
const fields=fs=>fs.map(f=>({name:f.name,label:f.label,type:f.type}));
const targets=fs=>fs.map(f=>({...fields([f])[0],index:f.index,excluded:f.excluded,source:fields([f.source])[0]}));

// Private executor history only: never cross a failed, unfinished, foreign or
// unexecuted change to use an older generated output definition.
export function completedCrossTableOutput(history,ctx){
 need(Array.isArray(history)&&history.length<=1024,'bounded private history required');
 const item=[...history].reverse().find(i=>owner(i.outcome?.output?.node??i.request?.target?.ref,ctx.node));
 const r=item?.request,o=item?.outcome?.output,c=o?.configuration?.readback,p=o?.output?.ports?.find(p=>p.port===0);
 need(r?.target?.type==='transform.cross_table'&&item.cleanup_confirmed===true&&item.outcome?.status==='SUCCEEDED'
  &&o.status==='SUCCEEDED'&&o.cleanup_complete===true&&o.execution?.status==='completed'
  &&Number.isSafeInteger(item.sequence),'latest owned completed CrossTable required');
 need(c?.kind==='crosstable'&&c.values_are==='observed_ui_values'&&owner(c.node,ctx.node)
  &&c.output_scope==='observed_after_verified_execution'&&c.execution_id===o.execution.execution_id
  &&typeof o.execution.execution_id==='string'&&o.execution.execution_id.startsWith(ctx.document_id+':')
  &&c.receipt_ids?.length===7&&c.receipt_ids.every(id=>o.phases?.some(p=>p.receipt_id===id&&p.status==='verified')),
 'complete configuration and execution receipts required');
 const m=c.output_mapping;
 need(p?.fresh===true&&p.execution_id===o.execution.execution_id&&typeof p.port_guid==='string'
  &&Array.isArray(p.schema)&&m?.verified===true&&m.inventory_complete===true&&m.source_identity_verified===true
  &&owner(m.node_context,ctx.node)&&m.node_context.output_port?.port===0
  &&m.source_fields.length>0&&m.source_fields.length<=128&&m.source_fields.every(f=>f.required===true)
  &&m.target_fields.length===m.source_fields.length&&m.target_fields.every(f=>f.excluded===false&&f.source)
  &&JSON.stringify(fields(p.schema))===JSON.stringify(fields(m.target_fields)),'complete generated output provenance required');
 return {port_guid:p.port_guid,mapping:m,execution_id:o.execution.execution_id};
}
export function verifyCrossTableRetainedOutput(proof,native,ctx){
 need(native?.verified===true&&native.inventory_complete===true&&native.source_identity_verified===true
  &&owner(native.node_context,ctx.node)&&native.node_context.output_port?.port===0
  &&native.source_fields.every(f=>f.required===true)
  &&JSON.stringify(fields(native.source_fields))===JSON.stringify(fields(proof.mapping.source_fields))
  &&JSON.stringify(targets(native.target_fields))===JSON.stringify(targets(proof.mapping.target_fields))
  &&native.autosync===proof.mapping.autosync,'retained own output differs from completed execution');
 return true;
}

// Inline CrossTable Next cannot validate a saved autosync=false mapping when
// regenerated Required fields are not yet materialized. Enable an explicitly
// requested option through the separate, already materialized own port first.
// The ordinary input/base/output lifecycle and fresh final execution follow.
export async function prepareCrossTableAutosync(options,ctx,{channel,finishWizard}){
 const request=options.operation.nodeApply.request;
 if(request.target.kind!=='existing'||request.finish!=='execute'
  ||!request.mappings.some(m=>m.direction==='output'&&m.port===0&&m.autosync===true))return;
 const proof=completedCrossTableOutput(options.nodeHistory?.(),ctx);
 if(proof.mapping.autosync===true)return;
 const opened=await channel.openOutputPort(0);
 need(opened.output.port_guid===proof.port_guid,'own generated port changed');
 await showMissingValuesMappingTable(channel);
 const state=await channel.observe({condition:'retained materialized CrossTable output before autosync',readMappings:true,
  ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
 verifyCrossTableRetainedOutput(proof,state.node_mapping,ctx);
 const changed=await configureOutputAutosync(channel,true);
 const after=await channel.observe({condition:'retained CrossTable output autosync enabled',readMappings:true,
  ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
 verifyCrossTableRetainedOutput({...proof,mapping:{...proof.mapping,autosync:true}},after.node_mapping,ctx);
 const finish=await finishWizard('done',true,changed.definition);
 need(finish.verified===true&&finish.settings_applied===true&&finish.execution_started===false
  &&owner(finish.node_context,ctx.node),'owned output settings commit required');
 return {verified:true,prior_execution_id:proof.execution_id,autosync:changed,finish};
}
