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
export function auditVariablesUnionRefusal(events){
 const need=(v,m)=>{if(!v)throw Error('VARIABLES_UNION_REFUSAL_'+m);};
 const attempts=events.filter(e=>e.phase==='node_apply_prepared'&&e.request?.target?.type==='variables.column_union');
 need(attempts.length===1,'ONE_NATIVE_REQUEST');
 const request=attempts[0].request,id=request.operation_id,fields=request.parameters?.column_union?.fields;
 need(request.target.kind==='new'&&request.parameters.column_union.mapping==='manual'
  &&fields?.some(f=>f.input===0&&f.source==='amount'&&f.type==='string'),'INTEGER_STRING_REQUEST');
 const own=events.filter(e=>e.operation_id===id),proofs=own.filter(e=>e.phase==='node_variables_union_preflight');
 need(proofs.length===1,'READ_ONLY_PREFLIGHT');const p=proofs[0];
 const domain=g=>({...g,nodes:g.nodes.map(({dom_epoch,...n})=>n)});
 need(p.settings_changed===false&&p.graph_before.complete===true&&isDeepStrictEqual(domain(p.graph_before),domain(p.graph_after)),'UNCHANGED_GRAPH');
 need(p.graph_before.nodes.filter(n=>n.type==='variables.calculator').length===2
  &&p.graph_before.nodes.every(n=>['variables.calculator','variables.user'].includes(n.type))
  &&p.graph_before.links.length===0&&(p.graph_before.variable_links??[]).length===0,'SOURCES_ONLY');
 need(p.outputs.length===2&&p.outputs.every((o,input)=>o.complete===true&&o.count===2&&o.variables.length===2
  &&o.variables[0].name==='amount'&&o.variables[0].label==='amount'&&o.variables[0].type==='integer'
  &&o.variables[0].cell.type==='integer'&&o.variables[0].cell.is_null===false&&o.variables[0].cell.precision==='exact_integer'&&o.variables[0].cell.value===String(input?19:7)
  &&o.variables[1].name===(input?'enabled':'empty')&&o.variables[1].label===o.variables[1].name&&o.variables[1].type===(input?'boolean':'string')
  &&o.variables[1].cell.type===o.variables[1].type&&o.variables[1].cell.is_null===false&&o.variables[1].cell.value===(input?false:'')),'RETAINED_TYPED_INPUTS');
 need(own.some(e=>e.phase==='node_phase_refused'&&e.receipt?.phase==='target'&&e.receipt.status==='NOT_APPLIED'
  &&e.receipt.effect_possible===false&&e.receipt.cleanup_complete===true),'PRE_MUTATION_REFUSAL');
 need(!own.some(e=>e.phase==='node_target_effect_prepared'||e.phase==='node_variables_union_materialized'
  ||e.action&&['execute_graph_node','deactivate_graph_node','begin_wizard','finish_wizard','execute_wizard','confirm_wizard_deactivation'].includes(e.action.verb)),'NO_ENGINE_MUTATION');
 const start=events.indexOf(attempts[0]);
 need(!events.slice(start+1).some(e=>e.phase==='node_apply_prepared'),'NO_WORKAROUND_OR_SOURCE_PATCH');
 return {status:'PASS',operation_id:id,graph_unchanged:true,sources_unchanged:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const read=p=>JSON.parse(readFileSync(p,'utf8'));
 console.log(JSON.stringify(process.argv[2]==='refusal'?auditVariablesUnionRefusal(read(process.argv[3])):auditVariablesUnionManual(read(process.argv[5]),read(process.argv[3]),read(process.argv[4]))));
}
