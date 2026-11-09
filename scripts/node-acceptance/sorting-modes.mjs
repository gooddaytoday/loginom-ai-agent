import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';
const need=(v,m)=>{if(!v)throw Error('SORTING_MODES_'+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function* receipts(value){
 if(!value||typeof value!=='object')return;
 if(value.status==='SUCCEEDED'&&value.configuration?.readback?.kind==='sorting')yield value;
 for(const child of Object.values(value))if(child&&typeof child==='object')yield* receipts(child);
}
function settings(c,mode,stage){
 const keys=c.keys,options=c.options;
 return c.mode==='keys'&&same(keys?.map(k=>[k.name,k.type,k.direction]),[['Word','string','ASC'],['RowID','integer','ASC']])
  &&keys[0].case_sensitive===(mode==='case'&&stage===0)
  &&options?.chkLocaleAware?.value===true&&options.chkLocaleAware.switch_pressed===false
  &&(mode==='case'||options.cbxMaxThreadCount?.value===(mode==='threads'?[1,2][stage]:[2,0][stage])&&options.cbxMaxThreadCount.switch_pressed===false);
}
export function checkSortingModes(expected,replies){
 const mode=expected.sorting_mode,stages=expected.sorting_stages;
 need(['case','threads','auto'].includes(mode)&&stages?.length===2,'CONTRACT');
 const rounds=new Map();
 for(const r of receipts(replies)){
  const id=r.execution?.execution_id,c=r.configuration.readback,port=r.output?.ports?.find(p=>p.port===0);
  if(r.execution?.status!=='completed'||!port)continue;
  need(id&&r.cleanup_complete===true&&port.fresh===true&&port.freshness_basis==='completed_execution_port_source'
   &&port.execution_id===id&&port.sample_complete===true&&port.precision?.numbers_verified===true,'FRESH_COMPLETE_TYPED_OUTPUT');
  rounds.set(id,{node:r.node,c,port});
 }
 const values=[...rounds.values()];
 for(const [i,a] of values.entries()){
  if(!settings(a.c,mode,0)||!matchesExpectedOutput(a.port,stages[0]))continue;
  const b=values.slice(i+1).find(b=>settings(b.c,mode,1)&&matchesExpectedOutput(b.port,stages[1])&&same(b.node,a.node)
   &&same(b.c.options.chkBufferWhole,a.c.options.chkBufferWhole)
   &&(mode!=='case'||same(b.c.options.cbxMaxThreadCount,a.c.options.cbxMaxThreadCount)));
  if(b)return {node:a.node,mode,stages_verified:2,execution_ids:[a.port.execution_id,b.port.execution_id]};
 }
 throw Error('SORTING_MODES_SAME_NODE_TWO_STAGES');
}
export async function observeSortingSaved({load,channel,mode}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const {advanceSortingInputColumns}=await load('client/lib/sorting-procedure.mjs');
 const selected=await channel.observe({condition:'cold sorting selection',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,selected,'cold select sorting',{refreshReplacedBody:true});
 await openPreparedWizard(channel);
 try{
  await advanceSortingInputColumns(channel,{target:{kind:'existing',ref:selected.prepared_node_context}});
  const state=await channel.observe({condition:'cold saved sorting literal settings',readSorting:true,ready:s=>s.wizard?.stage==='sorting'&&s.node_sorting?.verified===true});
  need(settings({...state.node_sorting,mode:'keys'},mode,1),'SAVED_SETTINGS');
  return {keys:state.node_sorting.keys,options:state.node_sorting.options,settings_applied:false};
 }finally{
  const closed=await closePreparedWizard(channel);
  need(closed.verified&&closed.cleanup_complete&&closed.settings_applied===false,'CANCEL');
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const proof=checkSortingModes(JSON.parse(await readFile(process.argv[2],'utf8')),JSON.parse(await readFile(process.argv[3],'utf8')));
 await writeFile(process.argv[4],JSON.stringify(proof,null,2)+'\n');
 console.log('PASS: same Sorting node, both independent ordered typed stages and literal options');
}
