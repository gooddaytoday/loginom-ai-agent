import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';
const need=(v,m)=>{if(!v)throw Error('REFORM_CACHE_'+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function* receipts(value){
 if(!value||typeof value!=='object')return;
 if(value.status==='SUCCEEDED'&&value.configuration?.readback?.kind==='field_parameters')yield value;
 for(const child of Object.values(value))if(child&&typeof child==='object')yield* receipts(child);
}
export function verifyReformCache(configuration,settings){
 need(same(configuration.caching,settings.caching),'SAVED_NODE_SETTINGS');
 need(same(configuration.fields.map(f=>({name:f.name,caching_method:f.caching_method})),settings.fields),'SAVED_FIELD_SETTINGS');
}
export function checkReformCache(expected,replies){
 const settings=expected.reform_cache,rounds=new Map();
 for(const reply of receipts(replies)){
  if(reply.execution?.status!=='completed')continue;
  const c=reply.configuration.readback,output=reply.output?.ports?.find(p=>p.port===0),id=reply.execution.execution_id;
  need(reply.cleanup_complete===true&&c.preservation?.caching===true,'CLEAN_CONFIGURATION');
  need(output?.fresh===true&&output.freshness_basis==='completed_execution_port_source'&&output.execution_id===id
   &&output.sample_complete===true&&output.precision?.numbers_verified===true&&matchesExpectedOutput(output,expected.outputs[0]),'COMPLETE_TYPED_OUTPUT');
  rounds.set(id,{node:reply.node,configuration:c});
 }
 const values=[...rounds.values()];let previous=-1;
 for(const wanted of settings.sequence){
  const index=values.findIndex((r,i)=>i>previous&&same(r.configuration.caching,wanted));
  need(index>previous,'ORDERED_FOUR_EXECUTIONS');previous=index;
 }
 need(values.length>=4&&values.every(r=>same(r.node,values[0].node)),'SAME_NODE');
 verifyReformCache(values[previous].configuration,settings);
 verifyReformCache(values.at(-1).configuration,settings);
 return {node:values[0].node,execution_ids:[...rounds.keys()],settings};
}
export async function observeReformCacheSaved({load,channel,target,expected}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const {advanceReformInputColumns}=await load('client/lib/reform-procedure.mjs');
 await channel.revealGraphNode({target:'body'});
 const s=await channel.observe({condition:'cold reform selection',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,s,'cold select reform cache',{refreshReplacedBody:true});
 await openPreparedWizard(channel);
 try{
  await advanceReformInputColumns(channel,{target:{kind:'existing',ref:target.ref}});
  const observed=await channel.observe({condition:'cold saved reform caching',readReform:true,ready:s=>s.node_reform?.verified===true&&s.node_reform.inventory_complete===true});
  const c=observed.node_reform;
  need(['document_id','workflow_id','node_id'].every(k=>c.node_context[k]===target.ref[k]),'COLD_OWNER');
  verifyReformCache(c,expected.reform_cache);
  return {caching:c.caching,fields:c.fields,settings_applied:false};
 }finally{
  const closed=await closePreparedWizard(channel);
  need(closed.verified&&closed.cleanup_complete&&closed.settings_applied===false,'COLD_CANCEL');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const expected=JSON.parse(await readFile(process.argv[2],'utf8')),replies=JSON.parse(await readFile(process.argv[3],'utf8'));
 await writeFile(process.argv[4],JSON.stringify(checkReformCache(expected,replies),null,2));
 console.log('PASS: four same-node cache executions, complete typed outputs and final cache settings');
}
