import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const need=(v,m)=>{if(!v)throw Error('COL_UNION_'+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const settingsMatch=(actual,wanted)=>actual&&Object.keys(actual).length===Object.keys(wanted).length
 &&Object.entries(wanted).every(([k,v])=>actual[k]===v);

function* readbacks(value){
 if(!value||typeof value!=='object')return;
 if(value.status==='SUCCEEDED'&&value.configuration?.readback?.kind==='col_union')yield value;
 for(const child of Object.values(value))if(child&&typeof child==='object')yield* readbacks(child);
}

export function checkColUnionSettings(expected,replies){
 const values=[...readbacks(replies)],last=values.at(-1),c=last?.configuration.readback;
 need(c&&last.cleanup_complete===true&&c.values_are==='observed_ui_values'
  &&c.scope==='observed_before_verified_finish'&&c.mode==='positional','READBACK_REQUIRED');
 need(settingsMatch(c.settings,expected.col_union_settings),'SETTINGS_DIFFER');
 need(c.receipt_ids?.length===5&&new Set(c.receipt_ids).size===5
  &&c.input_mappings?.length===3&&c.input_mappings.every((p,i)=>p.port===i)
  &&same(c.node,last.node)&&values.every(r=>same(r.node,last.node)),'SAME_NODE_THREE_INPUTS');
 return {node:last.node,settings:c.settings,receipt_ids:c.receipt_ids,settings_verified:true};
}

export async function observeColUnionSavedSettings({load,channel,expected}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs');
 const {closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const selected=await channel.observe({condition:'cold positional union selection',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,selected,'cold select positional union',{refreshReplacedBody:true});
 await openPreparedWizard(channel);
 try{
  const s=await channel.observe({condition:'cold saved positional union settings',readColUnion:true,
   ready:s=>s.wizard?.stage==='col_union'&&s.node_col_union?.verified===true});
  const c=s.node_col_union,n=selected.prepared_node_context;
  need(c.inventory_complete===true&&c.binding_ready===true&&c.sources?.length===3
   &&c.node_context?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c.node_context[k]===n[k]),'SAVED_OWNER');
  need(settingsMatch(c.settings,expected.col_union_settings),'SAVED_SETTINGS_DIFFER');
  return {settings:c.settings,sources:c.sources,settings_applied:false};
 }finally{
  const closed=await closePreparedWizard(channel);
  need(closed.verified&&closed.cleanup_complete&&closed.settings_applied===false,'CANCEL');
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const expected=JSON.parse(await readFile(process.argv[2],'utf8')),replies=JSON.parse(await readFile(process.argv[3],'utf8'));
 await writeFile(process.argv[4],JSON.stringify(checkColUnionSettings(expected,replies),null,2));
 console.log('PASS: same-node third determining settings readback');
}
