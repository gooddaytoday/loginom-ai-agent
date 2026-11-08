import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {matchesExpectedOutput} from './expected-outputs.mjs';

// Same converter node: rows (initial) -> source edit -> rows (changed) -> columns (changed).
// Typed Variant cells are matched by the production port matcher; CSV cannot prove them.
export function auditVariablesToTableSwitch(phases,events){
 const need=(v,m)=>{if(!v)throw Error('VARIABLES_TOTABLE_SWITCH_'+m);};
 const checkpoints=events.flatMap((e,index)=>{
  const r=e.phase==='node_checkpoint'?e.result:null;
  return r?.status==='SUCCEEDED'&&r.cleanup_complete===true&&r.execution?.status==='completed'&&r.configuration?.readback?.kind==='variables_to_table'
   ?[{index,r,port:r.output?.ports?.find(p=>p.port===0)}]:[];
 });
 const found=[];
 for(const [name,mode] of [['switch_rows','rows'],['changed_rows','rows'],['switch_back_columns','columns']]){
  const hit=checkpoints.find(s=>s.index>(found.at(-1)?.index??-1)&&s.r.configuration.readback.mode===mode
   &&!found.some(f=>f.r.execution.execution_id===s.r.execution.execution_id)
   &&s.port?.fresh===true&&s.port.execution_id===s.r.execution.execution_id&&(()=>{try{return matchesExpectedOutput(s.port,phases[name]);}catch{return false;}})());
  need(hit,'TYPED_'+name.toUpperCase());found.push(hit);
 }
 const [a,b,c]=found,key=['document_id','workflow_id','node_id'];
 need(found.every(s=>key.every(k=>s.r.node[k]===a.r.node[k])),'SAME_NODE');
 const link=s=>s.r.configuration.readback.variable_input;
 need(found.every(s=>isDeepStrictEqual(link(s),link(a))&&link(s).source_port_guid&&link(s).target_port_guid),'LINK_RETAINED');
 const requests=events.flatMap((e,index)=>e.phase==='node_apply_prepared'?[{index,...e.request}]:[]);
 need(requests.every(r=>['variables.user','variables.to_table'].includes(r.target?.type)),'NATIVE_GRAPH');
 const converter=requests.filter(r=>r.target.type==='variables.to_table');
 need(converter.filter(r=>r.target.kind==='new').length===1,'ONE_CONVERTER');
 const later=converter.filter(r=>r.target.kind==='existing');
 need(later.every(r=>r.target.ref?.node_id===a.r.node.node_id&&Object.keys(r.parameters??{}).length===0&&!(r.mappings?.length)),'EXISTING_SAME_NODE_NO_PARAMETERS');
 need(later.some(r=>r.index<=a.index&&r.mode==='rows')&&later.some(r=>r.index<=c.index&&r.index>b.index&&r.mode==='columns'),'MODE_SWITCH_REQUESTS');
 need(requests.some(r=>r.index>a.index&&r.index<b.index&&r.target.type==='variables.user'&&r.target.kind==='existing'),'SOURCE_EDIT_BETWEEN_ROWS');
 need(c.r.execution.execution_id!==b.r.execution.execution_id&&b.r.execution.execution_id!==a.r.execution.execution_id,'FRESH_EXECUTIONS');
 return {status:'PASS',node:a.r.node,executions:found.map(s=>s.r.execution.execution_id)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 // run-check: <audit-name> <phases> <final expected> <events>
 const read=p=>readFile(p,'utf8').then(JSON.parse),phases=await read(process.argv[3]),final=await read(process.argv[4]);
 if(!isDeepStrictEqual(final.outputs?.[0],phases.switch_back_columns))throw Error('VARIABLES_TOTABLE_SWITCH_FINAL_ORACLE');
 console.log(JSON.stringify(auditVariablesToTableSwitch(phases,await read(process.argv[5]))));
}
