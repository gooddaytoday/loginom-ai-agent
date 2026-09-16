import {verifyCalculatorInlineSync} from './calculator-inline-mapping.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
// Native Synchronize rebuilds its local records. Stable source field IDs plus
// names/types identify the same complete inventory; active output IDs persist.
export function verifyJoinOutputSync(before,after){
 const normalize=m=>({...m,source_fields:m.source_fields.map(s=>({...s,record_id:s.field_id})),target_fields:m.target_fields.map(f=>({...f,
  source:f.source?{...f.source,record_id:f.source.field_id}:null,
  exclusion_source:f.exclusion_source?{...f.exclusion_source,record_id:f.exclusion_source.field_id}:null}))});
 const b=normalize(before),a=normalize(after),linked=new Set(b.target_fields.map(f=>(f.source??f.exclusion_source)?.field_id));
 need(JSON.stringify(before.node_context)===JSON.stringify(after.node_context),'Join synchronization changed owner');
 const missing=b.source_fields.filter(s=>!linked.has(s.field_id));need(missing.length>0,'Join synchronization requires missing fields');
 verifyCalculatorInlineSync(b,a,missing);return true;
}
export async function ensureJoinOutputComplete(channel,state){
 const before=state.node_mapping,linked=new Set(before.target_fields.map(f=>(f.source??f.exclusion_source)?.record_id));
 need(!linked.has(undefined)&&linked.size===before.target_fields.length,'Join retained output links are incomplete');
 const missing=before.source_fields.filter(s=>!linked.has(s.record_id));if(!missing.length)return state;
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified&&s.node_mapping.inventory_complete&&s.wizard.root_ref===state.wizard.root_ref;
 await channel.perform({condition:'include new join source fields preserving retained output',initialObservation:state,ready,identity:()=>before,
  resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';DerivedDataSourceOutputSocketWizard;btnSyncThroughColumns'&&e.allowed_actions.includes('click'));need(es.length===1,'Join output synchronize unavailable');return {verb:'click',ref:es[0].ref};}});
 const after=await channel.observe({condition:'join output synchronized',readMappings:true,ready:s=>ready(s)&&s.node_mapping.target_fields.length===before.target_fields.length+missing.length});
 verifyJoinOutputSync(before,after.node_mapping);return after;
}
