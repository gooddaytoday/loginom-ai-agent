import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {matchVariableInventoryOutput,parseExpectedVariableInventory} from './expected-outputs.mjs';
export function auditVariablesReplaceHistory(events,initial,updated,final){
 const need=(v,m)=>{if(!v)throw Error('VARIABLES_REPLACE_'+m);};
 const wants=[initial,updated,final].map(e=>parseExpectedVariableInventory(e)?.outputs[0]);
 need(wants.every(w=>w?.node.type==='variables.replace'&&w.port===0),'ORACLE');
 const checkpoints=events.flatMap((e,index)=>e.phase==='node_checkpoint'&&e.result?.status==='SUCCEEDED'&&e.result.cleanup_complete===true&&e.result.execution?.status==='completed'
  ?(e.result.output?.variable_ports??[]).map(output=>({index,result:e.result,output})):[]);
 const found=[];
 for(const want of wants){
  const state=checkpoints.find(s=>s.index>(found.at(-1)?.index??-1)&&!found.some(f=>f.output.execution_id===s.output.execution_id)
   &&s.result.execution.execution_id===s.output.execution_id&&(()=>{try{return matchVariableInventoryOutput(s.output,want);}catch{return false;}})());
  need(state,'ORDERED_TYPED_EXECUTION_'+found.length);found.push(state);
 }
 const [a,b,c]=found;
 need(found.every(s=>['document_id','workflow_id','node_id'].every(k=>s.result.node[k]===a.result.node[k])),'SAME_NODE');
 need(found.every(s=>s.output.variables.every((v,i)=>isDeepStrictEqual(v.id,a.output.variables[i].id)&&v.type===a.output.variables[i].type)),'RETAINED_IDS_TYPES');
 const first=a.result.configuration?.readback,patch=b.result.configuration?.readback;
 need(first?.kind==='variables_replace'&&patch?.kind===first.kind,'NATIVE_CONFIGURATION');
 need(first.rules.length===8&&patch.rules.length===8&&isDeepStrictEqual(first.rules.filter(r=>r.variable.name!=='Count'),patch.rules.filter(r=>r.variable.name!=='Count')),'UNLISTED_RULES_CHANGED');
 need(isDeepStrictEqual(patch.rules.find(r=>r.variable.name==='Count')?.pairs,[{from:2,to:8}]),'COUNT_PATCH');
 const requests=events.flatMap((e,index)=>e.phase==='node_apply_prepared'?[{index,...e.request}]:[]);
 const changed=requests.filter(r=>r.index>a.index&&r.index<b.index&&r.target?.type==='variables.replace'&&r.mode==='exact');
 need(changed.length===1&&changed[0].target.kind==='existing'&&changed[0].parameters.rules.length===1&&changed[0].parameters.rules[0].variable.name==='Count','PATCH_ONLY_COUNT');
 need(!requests.some(r=>r.index>b.index&&r.index<=c.index&&r.target?.type==='variables.replace'&&r.mode!=='read_existing_output'&&Object.keys(r.parameters).length),'SOURCE_REFRESH_RECONFIGURED');
 need(requests.some(r=>r.index>b.index&&r.index<c.index&&r.target?.type==='variables.calculator'&&r.target.kind==='existing'
  &&r.parameters.expressions?.length===1&&r.parameters.expressions[0].target.name==='Color'&&r.parameters.expressions[0].formula==='"blue"'),'SOURCE_PATCH');
 return {status:'PASS',node:a.result.node,executions:found.map(s=>s.output.execution_id)};
}
export function auditVariablesReplaceMatch(events,initial,final){
 const wants=[initial,final].map(e=>parseExpectedVariableInventory(e)?.outputs[0]);
 if(wants.some(w=>w?.node.type!=='variables.replace')||wants[0].column_order==='any'||wants[1].column_order!=='any')throw Error('VARIABLES_REPLACE_MATCH_ORACLE');
 const checkpoints=events.filter(e=>e.phase==='node_checkpoint'&&e.result?.status==='SUCCEEDED'&&e.result.cleanup_complete===true
  &&e.result.execution?.status==='completed'&&e.result.output?.variable_ports?.length);
 const first=checkpoints.findIndex(e=>e.result.configuration?.readback?.kind==='variables_replace'&&e.result.configuration.readback.mode==='rules');
 const found=checkpoints[first];
 if(!found)throw Error('VARIABLES_REPLACE_MATCH_TYPED_EXECUTION_MISSING');
 const match=(e,want)=>e.result.output.variable_ports.some(p=>p.execution_id===e.result.execution.execution_id&&matchVariableInventoryOutput(p,want));
 if(!match(found,wants[0]))throw Error('VARIABLES_REPLACE_MATCH_INITIAL_MISSING');
 const rules=found.result.configuration.readback.rules;
 if(!isDeepStrictEqual(rules.map(r=>r.variable.name).sort(),['Amount','Code','Color','Other'])
  ||rules.find(r=>r.variable.name==='Color').case_sensitive!==false
  ||!isDeepStrictEqual(rules.find(r=>r.variable.name==='Code').regex_pairs,[{pattern:'^Ab-[0-9]+$',replacement:'matched'}])
  ||rules.find(r=>r.variable.name==='Amount').precision!==0.1||rules.find(r=>r.variable.name==='Other').other!=='null')
  throw Error('VARIABLES_REPLACE_MATCH_NATIVE_RULES');
 const reopened=checkpoints.slice(first+1).find(e=>e.result.node.node_id===found.result.node.node_id
  &&e.result.execution.execution_id!==found.result.execution.execution_id);
 if(!reopened||!match(reopened,wants[1]))throw Error('VARIABLES_REPLACE_MATCH_REOPENED_MISSING');
 return {status:'PASS',node:found.result.node,executions:[found,reopened].map(e=>e.result.execution.execution_id)};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href&&process.argv[2]==='variables-replace'){
 const read=p=>JSON.parse(readFileSync(p,'utf8'));
 console.log(JSON.stringify(auditVariablesReplaceHistory(read(process.argv[5]),read(process.argv[3]),read(new URL('../../docs/node-development/nodes/variables-replace/acceptance/expected-updated-run.json',import.meta.url)),read(process.argv[4]))));
}

if(process.argv[2]==='variables-replace-match'){
 console.log(JSON.stringify(auditVariablesReplaceMatch(JSON.parse(readFileSync(process.argv[5],'utf8')),JSON.parse(readFileSync(process.argv[3],'utf8')),JSON.parse(readFileSync(process.argv[4],'utf8')))));
}
