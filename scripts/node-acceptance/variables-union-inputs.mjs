import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {parseExpectedVariableInventory,matchVariableInventoryOutput} from './expected-outputs.mjs';

export function auditVariablesUnionInputs(events,connected,disconnected){
 const need=(ok,m)=>{if(!ok)throw Error('VARIABLES_UNION_INPUTS_'+m);};
 const wants=[connected,disconnected].map(e=>parseExpectedVariableInventory(e).outputs[0]);
 const checkpoints=events.flatMap((e,index)=>e.phase==='node_checkpoint'&&e.result?.status==='SUCCEEDED'&&e.result.cleanup_complete===true&&e.result.execution?.status==='completed'?[{index,r:e.result}]:[]);
 const matches=(c,w)=>c.r.configuration?.readback?.kind==='variables_column_union'&&c.r.output?.variable_ports?.some(o=>o.execution_id===c.r.execution.execution_id&&(()=>{try{return matchVariableInventoryOutput(o,w);}catch{return false;}})());
 const a=checkpoints.find(c=>matches(c,wants[0])),b=checkpoints.find(c=>c.index>(a?.index??Infinity)&&matches(c,wants[1]));
 need(a&&b,'FULL_ORDERED_CONNECTED_DISCONNECTED_OUTPUTS');
 const ca=a.r.configuration.readback,cb=b.r.configuration.readback;
 need(isDeepStrictEqual(a.r.node,b.r.node)&&a.r.execution.execution_id!==b.r.execution.execution_id,'SAME_NODE_FRESH_EXECUTIONS');
 need(ca.mapping==='automatic'&&cb.mapping==='automatic'&&ca.input_count===3&&cb.input_count===2&&ca.inputs.length===3&&cb.inputs.length===2,'AUTOMATIC_THREE_TO_TWO');
 need(isDeepStrictEqual(ca.inputs.slice(0,2),cb.inputs)&&new Set(ca.inputs.map(i=>i.source.node_id)).size===3,'FIRST_TWO_EXACT_LINKS_RETAINED');
 const initial=checkpoints.find(c=>c.index<a.index&&matches(c,wants[1])&&isDeepStrictEqual(c.r.node,a.r.node));
 need(initial&&initial.r.configuration.readback.input_count===2&&isDeepStrictEqual(initial.r.configuration.readback.inputs,cb.inputs),'TWO_INPUT_BASELINE_SAME_NODE');
 const requests=events.flatMap((e,index)=>e.phase==='node_apply_prepared'?[{index,r:e.request}]:[]);
 const unions=requests.filter(e=>e.r.target?.type==='variables.column_union');
 need(unions.filter(e=>e.r.target.kind==='new').length===1,'ONE_UNION_CREATION');
 need(unions.some(e=>e.index>initial.index&&e.index<a.index&&e.r.target.kind==='existing'&&e.r.variable_inputs?.length===3),'THIRD_ADDED_TO_EXISTING_NODE');
 need(unions.some(e=>e.index>a.index&&e.index<b.index&&e.r.target.kind==='existing'&&e.r.parameters?.column_union?.disconnect_input===2&&e.r.variable_inputs?.length===0),'EXPLICIT_THIRD_DISCONNECTION');
 need(!requests.some(e=>['programming.javascript','transform.calculator'].includes(e.r.target?.type)||e.r.variable_inputs?.some(i=>i.kind==='control')),'NO_SUBSTITUTION_OR_CONTROL');
 const target=events.filter(e=>e.phase==='node_target_checkpoint'&&e.target_state?.completed&&e.target_state.final_graph?.nodes?.some(n=>n.ref.node_id===b.r.node.node_id));
 const last=target.at(-1)?.target_state.final_graph;
 need(last&&last.nodes.find(n=>n.ref.node_id===b.r.node.node_id)?.variable_inputs?.length===3
  &&last.variable_links.filter(e=>e.target===b.r.node.node_id).length===2
  &&last.variable_links.filter(e=>e.target===b.r.node.node_id).every(e=>e.kind==='variables'&&[0,1].includes(e.input)),'THIRD_PORT_RETAINED_LINK_REMOVED');
 return {status:'PASS',node:b.r.node,executions:[initial,a,b].map(c=>c.r.execution.execution_id),inputs:cb.inputs};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const read=p=>JSON.parse(readFileSync(p,'utf8'));
 console.log(JSON.stringify(auditVariablesUnionInputs(read(process.argv[5]),read(process.argv[3]),read(process.argv[4]))));
}
