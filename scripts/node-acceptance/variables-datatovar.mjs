import {parseExpectedVariableInventory,matchVariableInventoryOutput} from './expected-outputs.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};

// Uses the shared W1 typed-output matcher. This audit adds only the node's
// scenario requirement: the same saved DataToVar after replacing its input.
export function auditDataToVarHistory(events,initial,final){
 const before=parseExpectedVariableInventory(initial)?.outputs,after=parseExpectedVariableInventory(final)?.outputs;
 need(before?.length===1&&after?.length===1&&before[0].node.type==='variables.from_table'&&after[0].node.type==='variables.from_table','DATATOVAR_EXPECTED_INVALID');
 const allowed=new Set(['imports.text','variables.from_table',...(final.nodes??[]).filter(n=>n.type==='transform.filter_data').map(n=>n.type)]);
 const requests=events.flatMap((e,index)=>e.phase==='node_apply_prepared'?[{index,...e}]:[]);
 need(requests.every(e=>allowed.has(e.request?.target?.type)),'DATATOVAR_UNEXPECTED_NODE');
 const checkpoints=events.flatMap((e,index)=>{
  const r=e.result;
  return e.phase==='node_checkpoint'&&r?.status==='SUCCEEDED'&&r.cleanup_complete===true&&r.node&&r.execution?.status==='completed'
   ?(r.output?.variable_ports??[]).filter(output=>output.execution_id===r.execution.execution_id).map(output=>({index,result:r,output})):[];
 });
 const matches=(s,want)=>{try{return matchVariableInventoryOutput(s.output,want);}catch{return false;}};
 const first=checkpoints.find(s=>matches(s,before[0])&&s.result.configuration?.readback?.kind==='variables_from_table');
 need(first,'DATATOVAR_INITIAL_OUTPUT_MISSING');
 const configured=first.result.configuration.readback;
 need(configured.mode==='aggregate'&&configured.fields?.length===1&&configured.fields[0].name==='X'
  &&JSON.stringify(configured.fields[0].aggregations)==='["sum","count","min","max","avg"]','DATATOVAR_AGGREGATES_DIFFER');
 const sameOwner=s=>['document_id','workflow_id','node_id'].every(k=>s.result.node[k]===first.result.node[k]);
 const update=JSON.stringify(before[0].variables)!==JSON.stringify(after[0].variables);
 const last=update?checkpoints.find(s=>s.index>first.index&&sameOwner(s)&&matches(s,after[0])):first;
 need(last&&sameOwner(last)&&last.output.port_guid===first.output.port_guid,'DATATOVAR_UPDATED_SAME_NODE_MISSING');
 if(update)need(last.result.execution.execution_id!==first.result.execution.execution_id&&last.output.read_id!==first.output.read_id,'DATATOVAR_STALE_UPDATED_OUTPUT');
 for(const e of requests.filter(e=>e.index>first.index&&e.index<=last.index&&e.request.target.type==='variables.from_table')){
  need(e.request.target.kind==='existing'&&e.request.target.ref?.node_id===first.result.node.node_id
   &&(e.request.mode==='read_existing_output'||e.request.mode==='aggregate'&&Object.keys(e.request.parameters??{}).length===0),'DATATOVAR_RECONFIGURED_AFTER_INITIAL');
 }
 return {status:'PASS',node:first.result.node,updated:update,initial_read_id:first.output.read_id,final_read_id:last.output.read_id};
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const {readFileSync}=await import('node:fs');
 console.log(JSON.stringify(auditDataToVarHistory(JSON.parse(readFileSync(process.argv[5],'utf8')),JSON.parse(readFileSync(process.argv[3],'utf8')),JSON.parse(readFileSync(process.argv[4],'utf8')))));
}
