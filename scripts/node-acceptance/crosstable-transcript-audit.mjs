import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const need=(v,m)=>{if(!v)throw Error('CrossTable transcript: '+m);};
function output(value){
 if(typeof value==='string'){try{return JSON.parse(value);}catch{return null;}}
 return value&&typeof value==='object'?value:null;
}
export function auditCrossTableTranscript(events){
 need(Array.isArray(events)&&events.length>0,'events required');const calls=[],replies=new Map(),seen=new Map();
 for(const [index,event] of events.entries()){
  if(event.type!=='tool_use')continue;const part=event.part;
  need(part&&typeof part.tool==='string'&&typeof part.id==='string'&&part.state,'malformed tool event');
  if(part.state.status!=='completed')continue;
  const prior=seen.get(part.id);if(prior){need(JSON.stringify(prior)===JSON.stringify(part),'changed duplicate tool event');continue;}seen.set(part.id,part);
  const input=part.state.input,result=output(part.state.output);
  need(input&&typeof input==='object','missing tool input');calls.push({index,tool:part.tool,input,result});
  if(result?.operation_id&&result.state==='settled'){
   const existing=replies.get(result.operation_id);
   if(existing)need(JSON.stringify(existing.result)===JSON.stringify(result),'conflicting operation results');
   else replies.set(result.operation_id,{index,result});
  }
 }
 const settled=call=>replies.get(call.input.operation_id)??(call.result?.state==='settled'?{index:call.index,result:call.result}:null);
 const succeeded=reply=>reply?.result.status==='SUCCEEDED'&&reply.result.cleanup_complete===true;
 for(const c of calls.filter(c=>c.tool==='loginom_dock_node_read'))need(Object.keys(c.input).every(k=>['operation_id','source_operation_id','read','budget_ms'].includes(k)),'reread input contains configuration');
 const applies=calls.filter(c=>c.tool==='loginom_dock_node_apply'),cross=applies.filter(c=>c.input.target?.type==='transform.cross_table');
 const created=cross.filter(c=>c.input.target.kind==='new'&&succeeded(settled(c)));
 need(created.length===2,'exactly two successful new CrossTables required');
 const nodes=created.map(c=>{const r=settled(c).result;need(r.node&&r.execution?.status==='completed','initial owned execution missing');return r.node;});
 need(new Set(nodes.map(n=>n.node_id)).size===2,'CrossTable GUID reused');
 need(nodes.every(n=>n.document_id===nodes[0].document_id&&n.workflow_id===nodes[0].workflow_id),'foreign report workflow');
 const sources=created.map(c=>{need(c.input.inputs?.length===1&&c.input.inputs[0].input===0,'initial source edge missing');return c.input.inputs[0].source;});
 need(sources.every(s=>['document_id','workflow_id','node_id'].every(k=>s[k]===sources[0][k])),'reports have different imports');
 const signature=input=>input.source?JSON.stringify(input.source):typeof input.settings?.source?.source_path==='string'?input.settings.source.source_path:null;
 const updates=applies.filter(c=>c.input.target?.type==='imports.text'&&c.input.target.kind==='existing'
  &&c.input.target.ref?.node_id===sources[0].node_id&&signature(c.input)&&succeeded(settled(c)));
 need(updates.length>0,'successful input source replacement missing');
 const update=updates.at(-1),boundary=settled(update).index;
 const originalImport=applies.find(c=>c.input.target?.type==='imports.text'&&succeeded(settled(c))&&settled(c).result.node?.node_id===sources[0].node_id);
 need(originalImport&&signature(originalImport.input)!==signature(update.input),'source replacement is unchanged');
 need(created.every(c=>settled(c).index<update.index),'reports must exist before source replacement');
 need(!cross.some(c=>c.index>=update.index),'CrossTable apply after source replacement is forbidden');
 need(!cross.some(c=>c.input.target.kind==='new'&&settled(c)?.result.effect_possible===true&&!created.includes(c)),'possible report recreation');
 const complete=r=>r.output?.ports?.length===1&&r.output.ports[0].port===0&&r.output.ports[0].fresh===true
  &&r.output.ports[0].execution_id===r.execution?.execution_id&&r.output.ports[0].sample_complete===true
  &&r.output.ports[0].sample_rows===r.output.ports[0].row_count&&Array.isArray(r.output.ports[0].schema);
 const reports=[];
 for(const [i,creation] of created.entries()){
  const original=settled(creation).result;need(complete(original),'complete initial report read missing');
  const reads=calls.filter(c=>c.tool==='loginom_dock_node_read'&&c.input.source_operation_id===creation.input.operation_id
   &&c.index>boundary&&succeeded(settled(c)));
  need(reads.length>0,'reread with original source_operation_id missing');
  const result=settled(reads.at(-1)).result;
  need(['document_id','workflow_id','node_id'].every(k=>result.node?.[k]===nodes[i][k]),'reread report GUID changed');
  need(result.configuration?.status==='not_requested'&&result.execution?.status==='completed'
   &&result.execution.execution_id!==original.execution.execution_id&&complete(result),'fresh complete unconfigured reread missing');
  need(result.output.ports[0].port_guid===original.output.ports[0].port_guid,'reread output port changed');
  reports.push({source_operation_id:creation.input.operation_id,read_operation_id:reads.at(-1).input.operation_id,node:nodes[i],execution_id:result.execution.execution_id});
 }
 return {status:'PASS',phase:'cross_table_no_reconfiguration_audit',source_update_operation_id:update.input.operation_id,reports};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [eventsPath,out]=process.argv.slice(2);need(eventsPath&&out,'events.jsonl and result path required');
 const events=(await readFile(eventsPath,'utf8')).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
 const result=auditCrossTableTranscript(events);await writeFile(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}
