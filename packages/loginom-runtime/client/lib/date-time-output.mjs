import {DATE_TIME_OPERATIONS} from './date-time-parameters.mjs';
import {expandOutputChanges} from './output-mapping-changes.mjs';
import {ensureGroupingOutputSources} from './grouping-output-sources.mjs';
import {configureOutputFields,configureOutputAutosync,reorderOutputFields} from './port-mapping-procedure.mjs';
import {ensureDateTimeRequestedOutputs} from './date-time-output-additions.mjs';
import {removeDateTimeOrphans} from './date-time-removal.mjs';
const need=(v,m)=>{if(!v)throw Error('Date/time output: '+m);};
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function resolveDateTimeGeneratedSource(c,field,t,sources){
 const input=c.input_fields.find(i=>i.name===field.field.name),op=DATE_TIME_OPERATIONS[t.operation];need(input&&op,'configured input required');
 const label=input.label+' ('+op.label+(op.type==='datetime'&&op.func!==16?', '+(op.flag==='DoDateTimeFirst'?'Первый день':'Последний день'):'')+')';
 const pattern=new RegExp('^'+escape(input.name+'_'+op.suffix)+'_[0-9]+$');
 const matches=sources.filter(source=>source.required&&source.type===op.type&&source.label===label&&pattern.test(source.name));
 need(matches.length===1,'ambiguous generated source: '+field.field.name+' '+t.operation);return matches[0];
}
export function resolveDateTimeOutput(c,p,native,mapping={}){
 need(native?.verified&&native.inventory_complete&&native.source_identity_verified,'complete linked output required');
 const pairs=native.target_fields.map(f=>{const source=f.source??f.exclusion_source;need(source&&native.source_fields.some(s=>s.record_id===source.record_id),'output source missing');return {current:f,source,name:f.name,label:f.label,excluded:f.excluded};});
 need(new Set(pairs.map(p=>p.source.record_id)).size===native.source_fields.length&&pairs.length===native.source_fields.length,'output source bijection required');
 const assigned=new Set();
 for(const field of p.fields??[])for(const t of field.transformations){
  const source=resolveDateTimeGeneratedSource(c,field,t,native.source_fields);
  const matches=pairs.filter(p=>p.source.record_id===source.record_id);
  need(matches.length===1&&!assigned.has(matches[0].source.record_id),'ambiguous generated field: '+field.field.name+' '+t.operation);
  assigned.add(matches[0].source.record_id);Object.assign(matches[0],{name:t.name,label:t.label});
 }
 let ordered=pairs;
 mapping=expandOutputChanges(mapping,pairs.map(p=>({source:{kind:'configured_field',name:p.name},name:p.name,label:p.label,excluded:p.excluded})));
 if(mapping.fields){need(mapping.fields.length===pairs.length,'explicit output mapping must account for all fields');const seen=new Set();ordered=mapping.fields.map(f=>{
  const candidates=pairs.filter(p=>p.name===f.source?.name);need(f.source?.kind==='configured_field'&&candidates.length===1&&!seen.has(candidates[0]),'unique configured output reference required');const p=candidates[0];seen.add(p);
  const excluded=f.excluded??p.excluded;need(!excluded||!p.source.required,'generated date fields cannot be excluded');
  need(!excluded||((f.name??p.name)===p.source.name&&(f.label===undefined||f.label===p.source.label)),'excluded source cannot be renamed');
  return {...p,name:f.name??p.name,label:f.label??p.label,excluded};
 });}
 need(new Set(ordered.map(f=>f.name.toLowerCase())).size===ordered.length,'duplicate output names');return ordered;
}
export async function configureDateTimeOutput(channel,c,p,mapping={},options={}){
 const ready=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true;
 let initial=await channel.observe({condition:'date/time output mapping',readMappings:true,ready});initial=await ensureGroupingOutputSources(channel,initial);
 const originalAutosync=initial.node_mapping.autosync;
 const removal=await removeDateTimeOrphans(channel,initial,options.removed??[]);initial=removal.state;
 const addition=await ensureDateTimeRequestedOutputs(channel,initial,c,p,resolveDateTimeGeneratedSource);initial=addition.state;
 const planned=resolveDateTimeOutput(c,p,initial.node_mapping,mapping),changes=[];
 if(p.fields!==undefined||mapping.fields||mapping.changes){
  changes.push(await configureOutputFields(channel,{direction:'output',port:0,fields:planned.map(f=>({source:{kind:'configured_field',name:f.source.name},name:f.name,label:f.excluded?f.source.label:f.label,excluded:f.excluded}))},initial.node_mapping.source_fields.map(f=>({...f,used:true}))));
  const edited=(await channel.observe({condition:'date/time mapped source identities',readMappings:true,ready})).node_mapping;
  const ids=planned.map(f=>{const matches=edited.target_fields.filter(t=>(t.source??t.exclusion_source)?.record_id===f.source.record_id);need(matches.length===1,'mapped source changed');return matches[0].record_id;});
  changes.push(await reorderOutputFields(channel,ids));
 }
 // Native autosync appends passthrough fields after generated fields on the
 // next node validation. An explicit layout must therefore disable it.
 if(mapping.fields||mapping.changes||mapping.autosync!==undefined)changes.push(await configureOutputAutosync(channel,mapping.autosync??false));
 else if(removal.receipts.length)changes.push(await configureOutputAutosync(channel,originalAutosync));
 const final=(await channel.observe({condition:'date/time final output mapping',readMappings:true,ready})).node_mapping;
 // Excluded records are service records, not output columns. Loginom gives
 // them the source name as label; compare the retained source label instead.
 const project=f=>({name:f.name,label:f.excluded?f.source.label:f.label,type:f.source.type,excluded:f.excluded,source:f.source.name});
 const actual=final.target_fields.map(f=>({...f,source:f.source??f.exclusion_source}));
 need(JSON.stringify(actual.map(project))===JSON.stringify([...planned.filter(f=>!f.excluded),...planned.filter(f=>f.excluded)].map(project)),'final output differs');
 return {verified:true,cleanup_complete:true,effect_possible:changes.length>0||removal.receipts.length>0||addition.receipts.length>0,native_mapping:final,changes,added:addition.receipts,removed:removal.receipts};
}
