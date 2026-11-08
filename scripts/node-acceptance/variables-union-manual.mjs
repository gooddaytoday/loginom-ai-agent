import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {parseExpectedVariableInventory,matchVariableInventoryOutput} from './expected-outputs.mjs';

export function auditVariablesUnionManual(events,initial,final){
 const need=(v,m)=>{if(!v)throw Error('VARIABLES_UNION_MANUAL_'+m);};
 const wants=[initial,final].map(e=>parseExpectedVariableInventory(e).outputs[0]);
 const checkpoints=events.flatMap((e,index)=>e.phase==='node_checkpoint'&&e.result?.status==='SUCCEEDED'&&e.result.cleanup_complete===true&&e.result.execution?.status==='completed'?[{index,r:e.result}]:[]);
 const found=[];
 for(const want of wants){
  const next=checkpoints.find(c=>c.index>(found.at(-1)?.index??-1)&&c.r.output?.variable_ports?.some(o=>o.execution_id===c.r.execution.execution_id&&(()=>{try{return matchVariableInventoryOutput(o,want);}catch{return false;}})()));
  need(next,'ORDERED_TYPED_OUTPUT_'+found.length);found.push(next);
 }
 const [a,b]=found,ca=a.r.configuration?.readback,cb=b.r.configuration?.readback;
 need(isDeepStrictEqual(a.r.node,b.r.node)&&a.r.execution.execution_id!==b.r.execution.execution_id,'SAME_NODE_FRESH_EXECUTION');
 need(ca?.kind==='variables_column_union'&&cb?.kind===ca.kind&&ca.mapping==='manual'&&cb.mapping==='manual','NATIVE_MANUAL_MAPPING');
 need(ca.input_count===2&&isDeepStrictEqual(ca.inputs,cb.inputs)&&isDeepStrictEqual(ca.fields,cb.fields)&&isDeepStrictEqual(ca.mapping_fields,cb.mapping_fields),'RETAINED_MAPPING_LINKS');
 const av=a.r.output.variable_ports[0].variables,bv=b.r.output.variable_ports[0].variables;
 need(av.every((v,i)=>isDeepStrictEqual(v.id,bv[i].id)&&v.name===bv[i].name&&v.label===bv[i].label&&v.type===bv[i].type),'RETAINED_VARIABLE_IDENTITIES');
 const requests=events.flatMap((e,index)=>e.phase==='node_apply_prepared'?[{index,...e.request}]:[]);
 const patches=requests.filter(r=>r.index>a.index&&r.index<b.index&&r.target?.type==='variables.calculator');
 need(patches.length===1&&patches[0].target.kind==='existing'&&isDeepStrictEqual(patches[0].target.ref,ca.inputs[1].source)
  &&patches[0].parameters.expressions?.length===1&&patches[0].parameters.expressions[0].target?.kind==='existing'
  &&patches[0].parameters.expressions[0].target.name==='amount'&&patches[0].parameters.expressions[0].formula==='23','PATCH_ONLY_RIGHT_AMOUNT');
 need(!requests.some(r=>r.index>a.index&&r.index<=b.index&&r.target?.type==='variables.column_union'&&(r.target.kind!=='existing'||Object.keys(r.parameters).length||r.variable_inputs?.length||r.mappings?.length)),'UNION_RECONFIGURED_AFTER_PATCH');
 need(!requests.some(r=>['programming.javascript','transform.calculator'].includes(r.target?.type)),'NATIVE_UNION_REQUIRED');
 return {status:'PASS',node:a.r.node,executions:found.map(c=>c.r.execution.execution_id),inputs:cb.inputs};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const read=p=>JSON.parse(readFileSync(p,'utf8'));
 console.log(JSON.stringify(auditVariablesUnionManual(read(process.argv[5]),read(process.argv[3]),read(process.argv[4]))));
}
