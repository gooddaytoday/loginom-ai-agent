import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {matchVariableInventoryOutput,parseExpectedVariableInventory} from './expected-outputs.mjs';
export function auditVariablesCalculatorHistory(events,initial,final) {
 const need=(ok,message)=>{if(!ok)throw Error('VARIABLES_CALCULATOR_'+message);};
 const before=parseExpectedVariableInventory(initial)?.outputs[0],after=parseExpectedVariableInventory(final)?.outputs[0];
 need(before?.node.type==='variables.calculator'&&after?.node.type===before.node.type,'ORACLE');
 const checkpoints=events.flatMap((e,index)=>{
  const r=e.result;
  return e.phase==='node_checkpoint'&&r?.status==='SUCCEEDED'&&r.cleanup_complete===true&&r.execution?.status==='completed'
   ?(r.output?.variable_ports??[]).map(output=>({index,result:r,output})):[];
 });
 const matches=(s,want)=>{try{return s.result.execution.execution_id===s.output.execution_id&&matchVariableInventoryOutput(s.output,want);}catch{return false;}};
 const first=checkpoints.find(s=>matches(s,before));need(first,'INITIAL_READ');
 const changed=checkpoints.find(s=>s.index>first.index&&matches(s,after)&&s.result.execution.execution_id!==first.result.execution.execution_id);need(changed,'UPDATED_EXECUTION');
 need(['document_id','workflow_id','node_id'].every(k=>first.result.node[k]===changed.result.node[k]),'SAME_NODE');
 need(changed.output.variables.every(v=>{const old=first.output.variables.find(x=>x.name===v.name);return old&&isDeepStrictEqual(old.id,v.id)&&old.type===v.type;}),'RETAINED_IDS_TYPES');
 const a=first.result.configuration?.readback,b=changed.result.configuration?.readback;
 need(a?.kind==='variables_calculator'&&b?.kind===a.kind&&a.syntax_validation==='accepted_by_loginom_next'&&b.syntax_validation===a.syntax_validation,'CONFIGURATION_READBACK');
 need(a.expressions.length===before.variables.length&&b.expressions.length===a.expressions.length
  &&isDeepStrictEqual(a.expressions.map(e=>e.name),before.variables.map(e=>e.name))&&isDeepStrictEqual(b.expressions.map(e=>e.name),after.variables.map(e=>e.name)),'EXPRESSION_ORDER');
 need(isDeepStrictEqual(a.expressions.filter(e=>e.name!=='limit'),b.expressions.filter(e=>e.name!=='limit')),'UNREQUESTED_EXPRESSION_CHANGED');
 return {status:'PASS',node:first.result.node,initial_execution:first.output.execution_id,updated_execution:changed.output.execution_id};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href&&process.argv[2]==='variables-calculator') {
 console.log(JSON.stringify(auditVariablesCalculatorHistory(JSON.parse(readFileSync(process.argv[5],'utf8')),JSON.parse(readFileSync(process.argv[3],'utf8')),JSON.parse(readFileSync(process.argv[4],'utf8')))));
}
