import {variableBindingsSchema,validateVariableBindings} from './variable-binding-parameters.mjs';
import {validateFilterConditions,filterGroupsFromNative,resolveFilterConditions} from './filter-parameters.mjs';
import {configureVariableBinding} from './variable-binding-procedure.mjs';
import {filterConditionMatches} from './filter-procedure.mjs';
const need=(ok,code,p)=>{if(!ok)throw Error(code+': '+p);};
export const filterBindingSchema=structuredClone(variableBindingsSchema);
filterBindingSchema.description='Scalar input-field integer/string comparisons only: /groups/i/j/value; kind control, input 0; exact mapped type, non-NULL, no conversion. Omit value at that condition. Existing omitted groups address saved rows; [] preserves bindings.';
filterBindingSchema.items.properties.parameter.pattern='^/groups/([0-9]|[1-5][0-9]|6[0-3])/([0-9]|[1-9][0-9]|1[01][0-9]|12[0-7])/value$';
filterBindingSchema.items.properties.variable.properties.kind={const:'control'};
filterBindingSchema.items.properties.variable.properties.input={const:0};
export function resolveFilterBindings(parameters,bindings,saved){
 validateVariableBindings(bindings,'transform.filter_data');
 if(!bindings?.length)return parameters;
 const result=structuredClone(parameters.groups===undefined?saved:parameters);
 for(const b of bindings){
  const [, ,g,c]=b.parameter.split('/'),condition=result?.groups?.[Number(g)]?.[Number(c)];
  need(condition&&condition.field?.kind==='input_field'&&['integer','string'].includes(condition.type)&&['<','<=','>','>=','=','<>'].includes(condition.operator),'BINDING_PARAMETER_UNSUPPORTED',b.parameter);
  need(parameters.groups===undefined||!Object.hasOwn(condition,'value'),'BINDING_CONFLICT',b.parameter);
  condition.value={kind:'variable',name:b.variable.name};
 }
 validateFilterConditions(result);return result;
}
export function preserveFilterBindings(native,parameters,bindings){
 if(!bindings?.length||parameters.groups===undefined)return;
 const rows=parameters.groups.flatMap((g,i)=>[...(i?[null]:[]),...g]);let group=0,condition=0;
 for(const [index,row] of native.rows.entries()){
  if(row.kind==='or'){group++;condition=0;continue;}
  const parameter=`/groups/${group}/${condition++}/value`,bound=bindings.some(b=>b.parameter===parameter);
  if(!row.variable_mode)continue;
  const wanted=bound&&rows[index]?{...rows[index],value:row.value}:rows[index];
  need(rows.length===native.rows.length&&wanted&&filterConditionMatches(row,wanted),'BINDING_CONFLICT','saved row '+row.record_id);
 }
}
export async function configureSavedFilterBindings(channel,parameters,bindings,baseline,{controlVariables}={}){
 const variables=controlVariables??baseline.control_variables;
 const resolved=resolveFilterBindings(parameters,bindings,{groups:filterGroupsFromNative({...baseline,control_variables:variables})});
 const groups=resolveFilterConditions(resolved,baseline.input_fields,variables);
 const ready=s=>s.wizard?.stage==='row_filter'&&s.node_filter?.verified===true;
 const observe=(condition,predicate=()=>true)=>channel.observe({condition,readFilter:true,ready:s=>ready(s)&&predicate(s)});
 let s=await observe('saved binding baseline');
 need(JSON.stringify(s.node_filter.rows)===JSON.stringify(baseline.rows),'BINDING_CONFLICT','saved rows changed');
 for(const b of bindings){
  const [,,g,c]=b.parameter.split('/');
  const flat=baseline.rows.filter(r=>r.kind==='condition'),offset=groups.slice(0,Number(g)).reduce((n,a)=>n+a.length,0)+Number(c),row=flat[offset];
  const wanted=groups[Number(g)][Number(c)];
  if(filterConditionMatches(row,wanted))continue;
  const id=row.record_id,identity=()=>({record_id:id});
  await channel.perform({condition:'open exact saved bound operand',initialObservation:s,ready,identity,resolve:s=>{
   const es=s.ui.elements.filter(e=>e.tid===row.cells?.value&&e.allowed_actions.includes('click'));
   need(es.length===1,'BINDING_PARAMETER_UNSUPPORTED',b.parameter);return {verb:'click',ref:es[0].ref};
  }});
  s=await observe('saved operand editor ready',s=>s.node_filter.editor?.record_id===id&&s.node_filter.editor.field==='CompareValue');
  s=await configureVariableBinding({channel,observe,ready,state:s,base:s.wizard.root_tid+';FilterDataWizard;FilterDataPanel;VariantPropEdit',identity,
   option:e=>e.filter_cell?.record_id===id&&e.filter_cell.part==='variable_option'&&e.filter_cell.variable_name===b.variable.name,
   committed:s=>filterConditionMatches(s.node_filter.rows.find(r=>r.record_id===id),wanted)});
 }
 need(JSON.stringify(s.node_filter.rows.map(r=>r.record_id))===JSON.stringify(baseline.rows.map(r=>r.record_id)),'BINDING_CONFLICT','row identity changed');
 return {verified:true,cleanup_complete:true,effect_possible:true,baseline,configuration:s.node_filter,groups};
}

export function validateFilterBindingValues(parameters,bindings,native,variables=native.control_variables){
 const groups=[[]];for(const row of native.rows){if(row.kind==='or')groups.push([]);else groups.at(-1).push(row);}
 for(const b of bindings){
  const [,,g,c]=b.parameter.split('/'),condition=parameters.groups?.[Number(g)]?.[Number(c)]??groups[Number(g)]?.[Number(c)];
  need(condition,'BINDING_PARAMETER_UNSUPPORTED',b.parameter);
  const matches=variables.filter(v=>v.name===b.variable.name);need(matches.length===1,'BINDING_VARIABLE_MISSING',b.parameter);
  const v=matches[0];need(v.type===condition.type,'BINDING_TYPE_MISMATCH',b.parameter);
  need(v.is_null===false,'BINDING_NULL_UNSUPPORTED',b.parameter);
  need(v.type==='integer'?Number.isSafeInteger(v.value):v.type==='string'&&typeof v.value==='string','BINDING_TYPE_MISMATCH',b.parameter);
 }
}
