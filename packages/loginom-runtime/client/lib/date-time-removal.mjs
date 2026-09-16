import {DATE_TIME_OPERATIONS} from './date-time-parameters.mjs';
import {ensureGroupingOutputSources,verifyGroupingSourceFetch} from './grouping-output-sources.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {readOutputDefinitionPages,observeOutputDefinitionPage} from './import-definition-pages.mjs';

const need=(v,m)=>{if(!v)throw Error('Date/time removal: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const identity=f=>Object.fromEntries(['field_id','name','label','type','data_kind','excluded','required'].map(k=>[k,f[k]]));

// A freshly opened Date/time port can materialize additional passthrough
// fields on Get source columns. Only an unchanged prefix and exact new source
// copies are admitted, and only when native autosync was already enabled.
export function verifyDateTimeSourceFetch(before,after){
 if(after.target_fields.length<=before.target_fields.length)return verifyGroupingSourceFetch(before,after);
 need(before.mapping_wizard==='DerivedDataSourceOutputSocketWizard'&&after.mapping_wizard===before.mapping_wizard
  &&before.autosync===true&&after.autosync===true,'source retrieval extended a fixed output');
 verifyGroupingSourceFetch(before,{...after,target_fields:after.target_fields.slice(0,before.target_fields.length)});
 for(const target of after.target_fields.slice(before.target_fields.length)){
  const source=target.source;
  need(source&&source.required===false&&after.source_fields.some(s=>same(s,source))&&target.required===false
   &&target.excluded===false&&target.inherited===false&&target.exclusion_source===null
   &&['name','label','type'].every(k=>target[k]===source[k]),'source retrieval added a non-passthrough output');
 }
 return true;
}

// Existing output names may be arbitrary. Read their actual source bindings
// before the native date editor can orphan them; Close commits no port settings.
export async function readDateTimeRemovalBaseline(channel,request){
 if(request.target.kind!=='existing'||request.finish==='close'||!request.parameters.fields?.length)return;
 await channel.openOutputPort(0);
 let state=await channel.observe({condition:'date/time retained output before field replacement',readMappings:true,
  ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
 let sourceFetch;
 state=await ensureGroupingOutputSources(channel,state,{verify:(before,after)=>{
  verifyDateTimeSourceFetch(before,after);sourceFetch={before,after};
 }});
 const native=state.node_mapping,linked=new Set();
 need(native.mapping_wizard==='DerivedDataSourceOutputSocketWizard'&&native.inventory_complete&&native.source_identity_verified,'complete original output required');
 for(const target of native.target_fields){const source=target.source??target.exclusion_source;
  need(source&&native.source_fields.some(s=>same(s,source))&&!linked.has(source.record_id),'original output must have one binding per field');linked.add(source.record_id);
 }
 need(linked.size===native.source_fields.length,'original output source coverage');
 const close=await closePreparedWizard(channel);
 need(close.draft_discarded&&close.settings_applied===false,'original output must close without applying');
 return {native_mapping:native,close,...(sourceFetch?{source_fetch:sourceFetch}:{})};
}

export function planDateTimeRemovals(original,parameters,baseline){
 const removed=[];
 for(const field of parameters.fields??[]){
  const matrix=original.field_matrices.find(f=>f.name===field.field.name)?.matrix,input=original.input_fields.find(f=>f.name===field.field.name);
  need(matrix&&input,'original date field required');
  const wanted=field.transformations.map(t=>DATE_TIME_OPERATIONS[t.operation]);
  for(const row of matrix)for(const [flag,key] of Object.entries({DoDateTimeFirst:'first',DoDateTimeLast:'last',DoNumber:'number',DoString:'string'})){
   if(!row[key]||!row.iso&&wanted.some(o=>o.func===row.func&&o.flag===flag))continue;
   const op=Object.values(DATE_TIME_OPERATIONS).find(o=>!row.iso&&o.func===row.func&&o.flag===flag);
   need(op,'removing ISO/string/unsupported transformations is not supported');
   need(baseline,'original output bindings required before removing a transformation');
   const label=input.label+' ('+op.label+(op.type==='datetime'&&op.func!==16?', '+(flag==='DoDateTimeFirst'?'Первый день':'Последний день'):'')+')';
   const pattern=new RegExp('^'+escape(input.name+'_'+op.suffix)+'_[0-9]+$');
   const sources=baseline.source_fields.filter(s=>s.required&&s.type===op.type&&s.label===label&&pattern.test(s.name));
   need(sources.length===1,'unique original transformation source required');
   const targets=baseline.target_fields.filter(t=>t.source?.record_id===sources[0].record_id);
   need(targets.length===1&&targets[0].excluded===false&&targets[0].required===false,'removable original output required');
   removed.push({field:input.name,operation:op.operation,source:sources[0],target:targets[0]});
  }
 }
 need(new Set(removed.map(r=>r.target.field_id)).size===removed.length,'unique removed outputs required');
 return removed;
}

export async function removeDateTimeOrphans(channel,state,removed){
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true;
 let current=state;const receipts=[];
 const orphan=f=>!f.source&&!f.exclusion_source;
 for(let attempt=0;attempt<=removed.length;attempt++){
  const native=current.node_mapping,orphans=native.target_fields.filter(orphan);
  if(!orphans.length)return {state:current,receipts};
  need(native.mapping_wizard==='DerivedDataSourceMappingEngineOutputPortWizard','orphans require the native conditional output page');
  need(orphans.every(f=>removed.filter(r=>same(identity(f),identity(r.target))).length===1),'unowned output has lost its source');
  need(attempt<removed.length,'orphan removal budget exceeded');
  const target=orphans[0],origin=removed.find(r=>same(identity(target),identity(r.target)));
  const definition=await readOutputDefinitionPages(channel,{expectedCount:native.target_fields.length});
  const offset=Math.floor(target.index/8)*8;
  await observeOutputDefinitionPage(channel,{offset,schemaId:definition.schema_id,total:definition.total_columns,field:target});
  const page=await channel.observe({condition:'current date orphan and its complete bindings',readMappings:true,outputColumnPage:{offset,limit:8},
   ready:s=>ready(s)&&s.wizard.output_columns?.page?.schema_id===definition.schema_id});
  const withoutWindow=({rendered_indices,...rest})=>rest;
  need(same(withoutWindow(page.node_mapping),withoutWindow(native)),'output bindings changed before orphan deletion');
  await channel.perform({condition:'remove only the output of a removed date transformation',initialObservation:page,ready,
   identity:()=>({target,origin}),resolve:s=>{
    const es=s.ui.elements.filter(e=>e.date_time_cell?.role==='output_delete'&&e.date_time_cell.record_id===target.record_id
     &&e.date_time_cell.field_key===target.name&&e.allowed_actions.includes('click'));
    need(es.length===1,'bound orphan delete control unavailable');return {verb:'click',ref:es[0].ref};
   }});
  current=await channel.observe({condition:'only the bound date orphan was removed',readMappings:true,ready});
  const groups=new Map();
  // Native deletion disables autosync; the output procedure restores the
  // original preference after verifying the exact remaining field bindings.
  const expected={...native,autosync:false,target_fields:native.target_fields.filter(f=>f.record_id!==target.record_id).map((f,index)=>{
   const group_index=groups.get(f.excluded)??0;groups.set(f.excluded,group_index+1);return {...f,index,group_index};
  })};
  const semantic=({rendered_indices,...rest})=>rest;
  need(same(semantic(current.node_mapping),semantic(expected)),'deletion changed another output or source');
  receipts.push({target,origin,after:current.node_mapping});
 }
 throw Error('Date/time orphan removal did not finish');
}
