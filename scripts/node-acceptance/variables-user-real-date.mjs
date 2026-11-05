import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {parseExpectedVariableInventory,matchVariableInventoryOutput,matchesExpectedOutput} from './expected-outputs.mjs';

// Scenario-specific history assertions use the stock typed table and variable matchers.
export function auditUserRealDate(events,initial,final){
 const need=(ok,message)=>{if(!ok)throw Error('USER_REAL_DATE_'+message);};
 const before=parseExpectedVariableInventory(initial).outputs[0],after=parseExpectedVariableInventory(final).outputs[0];
 const checkpoints=events.flatMap((e,index)=>e.phase==='node_checkpoint'&&e.result?.status==='SUCCEEDED'&&e.result.cleanup_complete===true?[{index,result:e.result}]:[]);
 const snapshotMatches=(r,want)=>{try{return matchVariableInventoryOutput(r.output?.variable_ports?.[0],want);}catch{return false;}};
 const variables=r=>r.output?.variable_ports?.[0]?.variables??r.configuration?.readback?.variables;
 const matches=(r,want)=>{
  if(snapshotMatches(r,want))return true;
  const b=r.configuration?.readback,v=b?.variables;
  if(b?.kind!=='user_variables'||b.mode!=='values'||b.scope!=='observed_after_verified_finish'||b.values_are!=='independent_owned_user_variables'
   ||!Array.isArray(v)||v.length!==want.variables.length||new Set(v.map(x=>JSON.stringify(x.id))).size!==v.length||!v.every((x,i)=>x.index===i))return false;
  // Comparison projection only: these are independently reopened configuration cells,
  // not an invented port/snapshot receipt. Reuse the stock scalar precision matcher.
  return matchesExpectedOutput({row_count:1,sample_complete:true,precision:{numbers_verified:v.every(x=>x.cell?.precision!=='unverified')},
   schema:v.map(x=>({name:x.name,label:x.label,type:x.type})),sample:[v.map(x=>x.cell)]},
   {ordered:true,column_order:'exact',columns:want.variables.map(x=>({name:x.name,type:x.type,...(x.label===undefined?{label_any:true}:{label:x.label})})),rows:[Object.fromEntries(want.variables.map(x=>[x.name,x.value]))]});
 };
 const sameNode=(a,b)=>a.result.node?.document_id===b.result.node?.document_id&&a.result.node?.node_id===b.result.node?.node_id
  &&(a.result.node.workflow_id===b.result.node.workflow_id||events.slice(a.index+1,b.index).some(e=>e.phase==='completed'&&e.action_key==='package.save_as'
   &&e.outcome?.status==='SUCCEEDED'&&e.outcome.cleanup_complete===true&&e.outcome.output?.reopened===true&&e.outcome.output.package_ref?.path===final.package_path));
 const first=checkpoints.find(c=>matches(c.result,before));need(first,'INITIAL_VARIABLES');
 const patch=events.findIndex((e,i)=>i>first.index&&e.phase==='node_apply_prepared'&&e.request?.target?.type==='variables.user'
  &&e.request.mode==='values'&&e.request.finish==='done'&&Array.isArray(e.request.parameters?.variables)&&e.request.parameters.variables.some(v=>v.name==='threshold'&&v.value===0.2));need(patch>first.index,'PATCH');
 const request=events[patch].request;
 need(request.target.kind==='existing'&&isDeepStrictEqual(request.target.ref,first.result.node),'PATCH_OWNER');
 need(request.parameters.variables.length===2&&request.parameters.variables.every(v=>after.variables.some(x=>x.name===v.name&&x.type===v.type
  &&(x.type==='datetime'?v.value.slice(0,19)+'.000'===x.value:Object.is(x.value,v.value)))),'PATCH_ONLY_TWO');
 const updated=checkpoints.find(c=>c.index>patch&&matches(c.result,after));need(updated,'UPDATED_VARIABLES');
 need(sameNode(first,updated),'VARIABLE_OWNER');
 const reread=checkpoints.find(c=>c.index>=updated.index&&snapshotMatches(c.result,after));need(reread&&sameNode(first,reread),'FINAL_SNAPSHOT');
 need(first.result.operation_id!==reread.result.operation_id,'FRESH_READ');
 const retained=v=>[v.id,v.index,v.name,v.label,v.type];
 for(const c of [updated,reread]){
  need(isDeepStrictEqual(variables(first.result).map(retained),variables(c.result).map(retained)),'IDENTITY_LABEL_ORDER');
  for(const v of variables(c.result).filter(v=>!['threshold','report_date'].includes(v.name)))
   need(isDeepStrictEqual(v,variables(first.result).find(x=>x.name===v.name)),'UNREQUESTED_VARIABLE');
 }
 const configured=checkpoints.find(c=>c.result.operation_id===events[patch].operation_id);
 need(configured?.result.configuration?.readback?.values_are==='independent_owned_user_variables','PATCH_READBACK');
 for(const [i,want] of initial.outputs.entries()){
  const owns=c=>c.result.execution?.status==='completed'&&(c.result.output?.ports??[]).some(p=>p.port===0&&p.fresh===true&&p.execution_id===c.result.execution.execution_id&&matchesExpectedOutput(p,want));
  const a=checkpoints.find(c=>c.index<patch&&owns(c));need(a,'INITIAL_BUSINESS_'+i);
  const b=checkpoints.find(c=>c.index>patch&&sameNode(a,c)&&c.result.execution?.execution_id!==a.result.execution.execution_id
   &&(c.result.output?.ports??[]).some(p=>p.port===0&&p.fresh===true&&p.execution_id===c.result.execution.execution_id&&matchesExpectedOutput(p,final.outputs[i])));
  need(b,'UPDATED_BUSINESS_'+i);
 }
 for(const e of events.slice(patch+1).filter(e=>e.phase==='node_apply_prepared'&&['transform.calculator','transform.filter_data'].includes(e.request?.target?.type))){
  const r=e.request,noOp=Object.keys(r.parameters).length===0||r.target.type==='transform.calculator'&&Object.keys(r.parameters).join(',')==='expressions'&&Array.isArray(r.parameters.expressions)&&r.parameters.expressions.length===0;
  need(r.target.kind==='existing'&&noOp&&!r.inputs.length&&!r.mappings.length&&!(r.variable_inputs?.length),'CONSUMER_RECONFIGURED');
 }
 return {status:'PASS',initial_evidence_id:first.result.output?.variable_ports?.[0]?.read_id??first.result.configuration.readback.receipt_ids[0],final_read_id:reread.result.output.variable_ports[0].read_id};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [initial,final,events]=process.argv.slice(2).map(p=>JSON.parse(readFileSync(p,'utf8')));
 console.log(JSON.stringify(auditUserRealDate(events,initial,final)));
}
