import {verifyCalculatorInlineSync} from './calculator-inline-mapping.mjs';
import {verifyGroupingSourceFetch} from './grouping-output-sources.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Fetching Join sources with native autosync can append previously implicit
// through columns. Native record IDs are rebuilt; retained field IDs persist.
// Only this measured transition is admitted, against the configured schema.
export function verifyJoinSourceFetch(before,after,configured){
 if(before?.target_fields?.length===after?.target_fields?.length)return verifyGroupingSourceFetch(before,after);
 const owner=before?.node_context,port=owner?.output_port;
 need(owner?.verified===true&&owner.surface==='wizard'
  &&['document_id','workflow_id','node_id','tid'].every(k=>typeof owner[k]==='string'&&owner[k].length>0)
  &&port?.direction==='output'&&port.port===0&&Number.isInteger(port.native_index)&&port.native_index>=0
  &&typeof port.port_guid==='string'&&port.port_guid.length>0
  &&typeof port.opening_operation_id==='string'&&port.opening_operation_id.length>0
  &&same(owner,after?.node_context),'Join source fetch changed owner');
 need(before.verified===true&&before.inventory_complete===true&&before.source_fields.length===0
  &&before.mapping_wizard==='DerivedDataSourceOutputSocketWizard'&&after.mapping_wizard===before.mapping_wizard
  &&before.autosync===true&&after.autosync===true&&after.verified===true
  &&after.inventory_complete===true&&after.source_identity_verified===true,'Join source fetch requires complete autosync inventory');
 const sources=after.source_fields,targets=after.target_fields,retained=before.target_fields;
 need(Array.isArray(configured)&&configured.length>0&&new Set(configured.map(s=>s.name)).size===configured.length
  &&sources.length===configured.length&&sources.every((s,i)=>s.index===i&&configured.some(c=>c.name===s.name&&c.label===s.label&&c.type===s.type))
  &&['record_id','field_id','name'].every(k=>sources.every(s=>typeof s[k]==='string'&&s[k].length>0)&&new Set(sources.map(s=>s[k])).size===sources.length),
  'Join fetched source schema differs');
 need(targets.length===sources.length&&retained.length<=targets.length
  &&['record_id','field_id','name'].every(k=>targets.every(t=>typeof t[k]==='string'&&t[k].length>0)&&new Set(targets.map(t=>t[k])).size===targets.length),
  'Join fetched targets are incomplete or ambiguous');
 const definition=f=>{const {record_id,source,exclusion_source,...rest}=f;return rest;};
 need(retained.every((f,i)=>f.index===i&&f.excluded===false&&f.source===null&&f.exclusion_source===null
  &&same(definition(f),definition(targets[i]))),'Join source fetch changed retained definition or order');
 const linked=new Set();
 for(const [i,t] of targets.entries()){
  const matches=sources.filter(s=>same(s,t.source));
  need(matches.length===1&&!linked.has(matches[0].record_id)&&t.index===i&&t.excluded===false&&t.exclusion_source===null
   &&t.name===matches[0].name&&t.label===matches[0].label&&t.type===matches[0].type,
   'Join fetched target source binding is incomplete or ambiguous');
  linked.add(matches[0].record_id);
 }
 const missing=sources.filter(s=>!retained.some(t=>t.name===s.name));
 need(targets.slice(retained.length).every((t,i)=>t.source.name===missing[i]?.name&&t.inherited===false
  &&t.required===false&&t.group_index===retained.length+i&&typeof t.data_kind==='string'&&t.data_kind.length>0),
  'Join source fetch changed appended through columns');
 return true;
}
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
