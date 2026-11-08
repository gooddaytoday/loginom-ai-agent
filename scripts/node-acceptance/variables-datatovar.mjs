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

// LAB-1111 cycle 1: one configured node, one exact typed result. The field
// order and per-field native functions are the task's configuration criterion.
export const DATATOVAR_RESULT_CASES=Object.freeze({
 'variables-from-table-aggregates':{source:'imports.text',fields:[
  ['N',['median','mode','standard_deviation','unique_count','null_count','first','last','only','concat']],['K',['only']]]},
 'variables-from-table-scalars':{source:'programming.javascript',fields:[
  ['S',['count','min','max','mode','unique_count','null_count','first','last','only','concat']],
  ['B',['count','min','max','mode','unique_count','null_count','first','last','only']],
  ['D',['count','min','max','mode','unique_count','null_count','first','last','only']]]},
});
export function auditDataToVarResult(name,events,final){
 const spec=DATATOVAR_RESULT_CASES[name],want=parseExpectedVariableInventory(final)?.outputs;
 need(spec&&want?.length===1&&want[0].node.type==='variables.from_table','DATATOVAR_EXPECTED_INVALID');
 const requests=events.filter(e=>e.phase==='node_apply_prepared');
 // The provided JavaScript source may be read, never reconfigured or replaced.
 need(requests.every(e=>e.request?.target?.type==='variables.from_table'||e.request?.target?.type===spec.source
  &&(spec.source==='imports.text'||e.request.target.kind==='existing'&&Object.keys(e.request.parameters??{}).length===0)),'DATATOVAR_UNEXPECTED_NODE');
 const checkpoints=events.flatMap((e,index)=>{
  const r=e.result;
  return e.phase==='node_checkpoint'&&r?.status==='SUCCEEDED'&&r.cleanup_complete===true&&r.node&&r.execution?.status==='completed'
   ?(r.output?.variable_ports??[]).filter(output=>output.execution_id===r.execution.execution_id).map(output=>({index,result:r,output})):[];
 });
 const matches=s=>{try{return matchVariableInventoryOutput(s.output,want[0]);}catch{return false;}};
 const configured=checkpoints.find(s=>s.result.configuration?.readback?.kind==='variables_from_table'&&matches(s));
 need(configured,'DATATOVAR_RESULT_MISSING');
 const readback=configured.result.configuration.readback;
 need(readback.mode==='aggregate'&&JSON.stringify(readback.fields?.map(f=>[f.name,f.aggregations]))===JSON.stringify(spec.fields),'DATATOVAR_AGGREGATES_DIFFER');
 return {status:'PASS',node:configured.result.node,read_id:configured.output.read_id,fields:readback.fields.map(f=>f.name)};
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const {readFileSync}=await import('node:fs'),json=i=>JSON.parse(readFileSync(process.argv[i],'utf8'));
 console.log(JSON.stringify(Object.hasOwn(DATATOVAR_RESULT_CASES,process.argv[2])?auditDataToVarResult(process.argv[2],json(5),json(4))
  :auditDataToVarHistory(json(5),json(3),json(4))));
}
