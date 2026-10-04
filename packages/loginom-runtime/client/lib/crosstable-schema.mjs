// Internal schema policy. User-facing read APIs cannot supply this object.
const need=(v,m)=>{if(!v)throw Error('CrossTable schema: '+m);};
import {CROSSTABLE_FUNCTIONS,CROSSTABLE_TYPE_MASKS,crossTableResultType} from './crosstable-parameters.mjs';
const suffixes={sum:'Sum',count:'Count',min:'Min',max:'Max',avg:'Avg',stddev:'StdDev',sum_squares:'SumSq',unique_count:'UniqueCount',null_count:'NullCount',first:'First',last:'Last'};
export function resolveCrossTableSchema(columns,configuration){
 need(configuration?.kind==='crosstable'&&['fixed','sliding'].includes(configuration.category_mode)
  &&configuration.options?.separator==='|'&&configuration.options.unique_names===false
  &&configuration.options.limit===0&&configuration.options.min_values===0,'verified supported configuration required');
 const keys=configuration.row_keys,facts=configuration.facts,dimensions=configuration.columns??(configuration.column?[configuration.column]:[]);
 need(Array.isArray(keys)&&Array.isArray(facts)&&facts.length>0&&Array.isArray(dimensions),'complete roles required');
 need(columns.length>=keys.length&&columns.length<=1000&&new Set(columns.map(f=>f.name)).size===columns.length,'complete unique columns required');
 const keyNames=new Set(keys.map(f=>f.name)),pairs=[],categories=new Map();
 need(keyNames.size===keys.length,'duplicate row key');
 for(const key of keys){
  const fields=columns.filter(f=>f.name===key.name);
  need(fields.length===1&&fields[0].label===key.label&&fields[0].type===key.type,'row key changed: '+key.name);
 }
 const expected=facts.flatMap(f=>f.functions.map(fn=>{
  need(CROSSTABLE_FUNCTIONS[fn]&&CROSSTABLE_TYPE_MASKS[f.type]
   &&(CROSSTABLE_TYPE_MASKS[f.type]&CROSSTABLE_FUNCTIONS[fn].bit)!==0&&f.label&&!f.label.includes('|'),'unsupported fact/function');
  return {field:f.name,label:f.label,function:fn,type:crossTableResultType(f.type,fn)};
 }));
 need(new Set(expected.map(f=>f.field+':'+f.function)).size===expected.length,'duplicate fact/function');
 const identities=new Set(),multipleFacts=facts.length>1,multipleFunctions=facts.some(f=>f.functions.length>1);
 for(const [index,c] of columns.entries()){
  need(c.index===index&&typeof c.name==='string'&&typeof c.label==='string'&&c.label.length>0,'invalid column identity');
  if(keyNames.has(c.name))continue;
  const parts=c.label.split('|');
  const labelParts=parts.length-dimensions.length,showFact=multipleFacts||labelParts===2,showFunction=multipleFunctions||labelParts===2;
  need(labelParts===(showFact?1:0)+(showFunction?1:0),'missing or redundant fact/function identity');
  need(parts.length===dimensions.length+labelParts&&parts.every(p=>p.length>0),'empty or ambiguous category label');
  const captions=parts.slice(0,dimensions.length),factLabel=showFact?parts[dimensions.length]:facts[0].label,
   functionLabel=showFunction?parts.at(-1):null;
  const matches=expected.filter(f=>f.label===factLabel&&(!showFunction||CROSSTABLE_FUNCTIONS[f.function].label===functionLabel)&&f.type===c.type);
  need(matches.length===1,'fact/function/type changed: '+c.label);const f=matches[0];
  const categoryPrefix=dimensions.length?'C_[1-9][0-9]*':'';
  const technical=[categoryPrefix,...(showFact?[f.field]:[]),...(showFunction?[suffixes[f.function]]:[])].filter(Boolean).join('_');
  need(new RegExp('^'+technical+'$').test(c.name),'unconfirmed technical field: '+c.name);
  const kinds=captions.map(category=>category==='<...>'?'null':category==='<Прочее>'?'other':'value');
  need(kinds.every(kind=>kind!=='other'||configuration.category_mode==='fixed'&&configuration.options.include_other===true),'unexpected Other category');
  need(kinds.every(kind=>kind!=='null'||configuration.category_mode==='sliding'||configuration.options.include_null===true),'unexpected NULL category');
  const categoryValues=captions.map((v,i)=>kinds[i]==='null'?null:v),group=JSON.stringify(categoryValues);
  const identity=JSON.stringify([categoryValues,f.field,f.function]);need(!identities.has(identity),'duplicate category/fact/function');identities.add(identity);
  const categoryPairs=categories.get(group)??[];categoryPairs.push(f.field+':'+f.function);categories.set(group,categoryPairs);
  const special=dimensions.length===1?kinds[0]:kinds.includes('other')?'other':kinds.includes('null')?'null':'value';
  pairs.push({category:dimensions.length===1?categoryValues[0]:captions.join('|'),category_kind:special,fact:f.field,function:f.function,field:c.name,label:c.label,type:c.type,
   ...(dimensions.length!==1?{categories:dimensions.map((d,i)=>({dimension:d.name,caption:captions[i],kind:kinds[i],value:categoryValues[i]}))}:{})});
 }
 const full=expected.map(f=>f.field+':'+f.function).sort();
 for(const list of categories.values())need(JSON.stringify(list.sort())===JSON.stringify(full),'incomplete category group');
 return {columns:columns.map(f=>({...f})),category_fields:pairs};
}

export function retainCrossTableReadPolicy(source,sourceId){
 if(source.parameters?.target?.type!=='transform.cross_table')return null;
 const result=source.outcome?.output,r=result?.configuration?.readback;
 need(result?.configuration?.status==='applied'&&r?.kind==='crosstable'
  &&r.scope==='observed_before_verified_finish'&&r.output_scope==='observed_after_verified_execution'
  &&r.values_are==='observed_ui_values','unverified configuration readback');
 need(['document_id','workflow_id','node_id'].every(k=>r.node?.[k]===result.node?.[k]),'foreign configuration node');
 const phases=['input_mapping','configure','node_finish','output_mapping','finish','execute','read'];
 need(Array.isArray(r.receipt_ids)&&r.receipt_ids.length===phases.length
  &&phases.every(phase=>r.receipt_ids.includes(sourceId+':'+phase)
   &&result.phases?.filter(p=>p.phase===phase&&p.receipt_id===sourceId+':'+phase&&p.status==='verified').length===1),'configuration receipts differ');
 need(result.execution?.status==='completed'&&typeof result.execution.execution_id==='string'
  &&r.execution_id===result.execution.execution_id,'source execution differs');
 const ports=result.output?.ports;
 need(ports?.length===1&&ports[0].port===0&&ports[0].fresh===true
  &&ports[0].execution_id===result.execution.execution_id&&typeof ports[0].port_guid==='string','foreign or stale output port');
 resolveCrossTableSchema(ports[0].schema,r);
 return r.category_mode==='sliding'?{kind:'crosstable_sliding',node:structuredClone(result.node),
  port_guid:ports[0].port_guid,source_execution_id:result.execution.execution_id,configuration:structuredClone(r)}:null;
}
