// Internal schema policy. User-facing read APIs cannot supply this object.
const need=(v,m)=>{if(!v)throw Error('CrossTable schema: '+m);};
import {CROSSTABLE_FUNCTIONS,CROSSTABLE_TYPE_MASKS,crossTableResultType} from './crosstable-parameters.mjs';
const suffixes={sum:'Sum',count:'Count',min:'Min',max:'Max',avg:'Avg',stddev:'StdDev',sum_squares:'SumSq',unique_count:'UniqueCount',null_count:'NullCount',first:'First',last:'Last'};
export function resolveCrossTableSchema(columns,configuration){
 if(configuration?.output_mapping){
  const m=configuration.output_mapping;
  need(m.verified===true&&m.inventory_complete===true&&m.source_identity_verified===true&&m.node_context?.output_port?.port===0,
   'verified owned output mapping required');
  const own=configuration.node_context??configuration.node;
  need(own&&['document_id','workflow_id','node_id'].every(k=>m.node_context[k]===own[k]),'foreign mapped output owner');
  const sources=m.source_fields,targets=m.target_fields;
  need(Array.isArray(sources)&&sources.every(f=>f.required===true)&&Array.isArray(targets)&&sources.length===targets.length&&columns.length===targets.length,
   'complete required output inventory');
  const ids=new Set();
  for(const [i,t] of targets.entries()){
   need(!t.excluded&&t.source&&sources.filter(s=>s.record_id===t.source.record_id&&s.name===t.source.name&&s.label===t.source.label&&s.type===t.source.type).length===1,
    'output source identity differs');
   need(!ids.has(t.source.record_id),'duplicate required output source');ids.add(t.source.record_id);
   need(columns[i].index===i&&['name','label','type'].every(k=>columns[i][k]===t[k])&&t.type===t.source.type,'mapped output schema changed');
  }
  const canonical=resolveCrossTableSchema(sources.map((f,index)=>({...f,index})),{...configuration,output_mapping:undefined});
  return {columns:columns.map(f=>({...f})),category_fields:canonical.category_fields.map(f=>{
   const t=targets.find(t=>t.source.name===f.field);need(t,'required aggregate missing');return {...f,field:t.name,label:t.label};
  })};
 }
 need(configuration?.kind==='crosstable'&&['fixed','sliding'].includes(configuration.category_mode)
  &&['|','.','->',' '].includes(configuration.options?.separator)&&typeof configuration.options.unique_names==='boolean'
  &&Number.isSafeInteger(configuration.options.limit)&&configuration.options.limit>=0&&Number.isSafeInteger(configuration.options.min_values)&&configuration.options.min_values>=0,'verified supported configuration required');
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
   &&(CROSSTABLE_TYPE_MASKS[f.type]&CROSSTABLE_FUNCTIONS[fn].bit)!==0&&f.label&&!f.label.includes(configuration.options.separator),'unsupported fact/function');
  return {field:f.name,label:f.label,function:fn,type:crossTableResultType(f.type,fn)};
 }));
 need(new Set(expected.map(f=>f.field+':'+f.function)).size===expected.length,'duplicate fact/function');
 const identities=new Set(),multipleFacts=facts.length>1,multipleFunctions=facts.some(f=>f.functions.length>1);
 for(const [index,c] of columns.entries()){
  need(c.index===index&&typeof c.name==='string'&&typeof c.label==='string'&&c.label.length>0,'invalid column identity');
  if(keyNames.has(c.name))continue;
  // Match the known aggregate suffix from the right. A single category can
  // contain the separator, empty text or leading spaces; none is UI padding.
  const separator=configuration.options.separator,candidates=[];
  for(const showFact of [false,true])for(const showFunction of [false,true]){
   if(multipleFacts&&!showFact||multipleFunctions&&!showFunction)continue;
   if(configuration.options.unique_names&&(showFact!==(multipleFacts||multipleFunctions||dimensions.length===0)||showFunction!==(multipleFunctions||multipleFacts||dimensions.length===0)))continue;
   for(const f of expected){
    const tail=[...(showFact?[f.label]:[]),...(showFunction?[CROSSTABLE_FUNCTIONS[f.function].label]:[])].join(separator);
    let prefix;
    if(dimensions.length){if(tail){if(!c.label.endsWith(separator+tail))continue;prefix=c.label.slice(0,-(separator+tail).length);}else prefix=c.label;}
    else {if(c.label!==tail)continue;prefix='';}
    const captions=dimensions.length===1?[prefix]:dimensions.length?prefix.split(separator):[];
    if(captions.length!==dimensions.length)continue;
    const categoryPrefix=dimensions.length?(configuration.options.unique_names?'[A-Za-z_][A-Za-z0-9_]*':'C_[1-9][0-9]*'):'';
    const technical=[categoryPrefix,...(showFact?[f.field]:[]),...(showFunction?[suffixes[f.function]]:[])].filter(Boolean).join('_');
    const collision=configuration.options.unique_names?'(?:_[1-9][0-9]*)?':'';
    const emptyPrefix=configuration.options.unique_names&&dimensions.length===1&&captions[0]===''
     ?'|'+[...(showFact?[f.field]:[]),...(showFunction?[suffixes[f.function]]:[])].join('_'):'';
    if(f.type===c.type&&new RegExp('^(?:'+technical+emptyPrefix+')'+collision+'$').test(c.name))candidates.push({f,captions});
   }
  }
  need(candidates.length===1,'ambiguous category/fact/function/type or technical identity: '+c.label);
  const {f,captions}=candidates[0];
  const kinds=captions.map(category=>category==='<...>'?'null':category==='<Прочее>'?'other':'value');
  need(kinds.every(kind=>kind!=='other'||configuration.category_mode==='fixed'&&configuration.options.include_other===true),'unexpected Other category');
  need(kinds.every(kind=>kind!=='null'||configuration.category_mode==='sliding'||configuration.options.include_null===true),'unexpected NULL category');
  const categoryValues=captions.map((v,i)=>kinds[i]==='null'?null:v),group=JSON.stringify(categoryValues);
  const identity=JSON.stringify([categoryValues,f.field,f.function]);need(!identities.has(identity),'duplicate category/fact/function');identities.add(identity);
  const categoryPairs=categories.get(group)??[];categoryPairs.push(f.field+':'+f.function);categories.set(group,categoryPairs);
  const special=dimensions.length===1?kinds[0]:kinds.includes('other')?'other':kinds.includes('null')?'null':'value';
  pairs.push({...(configuration.options.min_values>0?{reserved_possible:true,category_identity_source:'observed_caption'}:{}),category:dimensions.length===1?categoryValues[0]:captions.join(configuration.options.separator),category_kind:special,fact:f.field,function:f.function,field:c.name,label:c.label,type:c.type,
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
