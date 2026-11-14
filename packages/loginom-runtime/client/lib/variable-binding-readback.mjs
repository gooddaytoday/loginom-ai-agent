import {validateFilterValue} from './filter-parameters.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {advanceSortingInputColumns} from './sorting-procedure.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message.startsWith('BINDING_')?message:'Binding readback: '+message);};
// Called inside the owning wizard's synchronous browser read. A hidden literal
// is never the value of an active binding; the selected native record is.
export function readBooleanBindingBrowser(base,root){
 const es=[...document.querySelectorAll('[data-tid='+JSON.stringify(base+';VariableControl')+']')].filter(e=>root.contains(e)&&e.checkVisibility({checkVisibilityCSS:true}));
 const c=es.length===1?globalThis.Ext?.getCmp?.(es[0].id):null,store=c?.getStore?.(),rows=store?.getData?.()?.items;
 if(c?.el?.dom!==es[0]||store?.isLoading?.()||!Array.isArray(rows)||!rows.length||rows.length>1000)return null;
 const selected=rows.filter(r=>r.data?.field1===c.getValue?.());
 if(selected.length!==1)return null;
 const r=selected[0],v=r.get?.(r.getFields?.()[2]?.getName?.());
 if(!v||v.DataType!==1||typeof v.DisplayName!=='string'||!Number.isSafeInteger(v.Index)||typeof v.IsNull!=='boolean')return null;
 return {record_id:String(r.internalId),name:v.DisplayName,index:v.Index,type:'boolean',is_null:v.IsNull,value:v.Value??null};
}
export function booleanBindingInventory(native,mapping,graph,node,sourceProof,type){
 const grouping=type==='transform.group_data',parameter=grouping?'/sort_result':'/compare_with_locale';
 const option=native.options?.[grouping?'pedSortResult':'chkLocaleAware'];
 need(native.verified===true&&native.inventory_complete===true&&['document_id','workflow_id','node_id'].every(k=>native.node_context?.[k]===node[k]),'node owner');
 if(!option?.switch_pressed)return [];
 const v=option.binding;need(v&&v.type==='boolean','BINDING_TYPE_MISMATCH');
 need(mapping?.kind==='control'&&mapping.port===0&&typeof mapping.port_guid==='string','complete owned mapping');
 const fields=mapping.fields.filter(f=>f.name===v.name&&f.index===v.index);need(fields.length===1,'unique mapped name/index');
 const f=fields[0];need(f.type===1&&f.source?.type===1,'BINDING_TYPE_MISMATCH');
 need(Number.isSafeInteger(f.id)&&Number.isSafeInteger(f.source?.id),'connected variable IDs');
 const links=(graph.variable_links??[]).filter(l=>l.target===node.node_id&&l.kind==='control'&&l.input===0);
 need(links.length===1&&links[0].target_port_guid===mapping.port_guid,'source endpoint');
 const sources=graph.nodes.filter(n=>n.ref.node_id===links[0].source);need(sources.length===1,'source owner');
 if(sourceProof){
  need(sourceProof.verified===true&&sourceProof.independent_readback===true&&sourceProof.cleanup_complete===true&&sourceProof.source?.node_id===links[0].source,'independent source');
  const vs=sourceProof.variables.filter(x=>x.id===f.source.id&&x.name===f.source.name);need(vs.length===1,'source variable identity');
  need(vs[0].type==='boolean'&&vs[0].cell?.type==='boolean','BINDING_TYPE_MISMATCH');
  need(vs[0].cell.is_null===false,'BINDING_NULL_UNSUPPORTED');need(typeof vs[0].cell.value==='boolean','BINDING_TYPE_MISMATCH');
 }else need(v.is_null===false&&f.is_null===false,'BINDING_NULL_UNSUPPORTED');
 return [{parameter,mode:'variable',row_id:v.record_id,variable:{kind:'control',input:0,id:f.id,name:f.name,type:'boolean',is_null:false},
  source:{ref:sources[0].ref,type:sources[0].type,output:links[0].output,variable_id:f.source.id},input_port_guid:mapping.port_guid,connected:true,verified:true}];
}
export async function readBooleanBindings(channel,{type,readGraph,sourceProof,node:target}){
 const graph=await readGraph(),grouping=type==='transform.group_data',key=grouping?'node_grouping':'node_sorting',stage=grouping?'grouping':'sorting';
 await openPreparedWizard(channel);
 let native,node;
 try{
  if(!grouping)await advanceSortingInputColumns(channel,{target:{kind:'existing',ref:target}});
  const s=await channel.observe({condition:'independent saved boolean binding',...(grouping?{readGrouping:true}:{readSorting:true}),ready:s=>s.wizard?.stage===stage&&s[key]?.verified===true});
  native=s[key];node=s.prepared_node_context;
 }finally{const close=await closePreparedWizard(channel);need(close.verified===true&&close.cleanup_complete===true,'Cancel');}
 if(!native.options[grouping?'pedSortResult':'chkLocaleAware'].switch_pressed)return [];
 const mapped=await channel.readVariablePortMapping({direction:'input',kind:'control',port:0});
 need(mapped.verified===true&&mapped.cleanup_complete===true&&mapped.independent_readback===true,'independent mapping');
 return booleanBindingInventory(native,mapped.mapping,graph,node,sourceProof,type);
}
export function filterBindingVariables(native,mapping,proof,names){
 need(proof?.verified===true&&proof.independent_readback===true&&Array.isArray(proof.variables),'independent source');
 return native.control_variables.map(v=>{
  if(!names.includes(v.name))return v;
  const fields=mapping?.fields?.filter(f=>f.name===v.name&&f.index===v.index)??[];need(fields.length===1&&fields[0].source,'mapped connected identity');
  const f=fields[0],sources=proof.variables.filter(x=>x.id===f.source.id&&x.name===f.source.name);need(sources.length===1,'source variable identity');
  const source=sources[0],cell=source.cell;need(source.type===v.type&&cell?.type===v.type&&({integer:4,real:3,datetime:2,string:5})[v.type]===f.type,'BINDING_TYPE_MISMATCH: source scalar type');
  need(cell.is_null===false||v.type==='real'&&cell.is_null===true&&cell.value===null&&cell.precision==='exact_null','BINDING_NULL_UNSUPPORTED: NULL is unsupported');
  const value=cell.is_null?null:v.type==='integer'?Number(cell.value):cell.value;
  if(!cell.is_null){
   validateFilterValue(value,v.type);
   need(v.type==='integer'?cell.precision==='exact_integer'&&String(value)===cell.value
    :v.type==='real'?cell.precision==='17_significant_digits'&&cell.representation==='binary64'
    :v.type==='datetime'?cell.precision==='millisecond'&&cell.representation==='local_datetime':typeof value==='string','exact source scalar');
  }
  need(v.is_null===true||v.is_null===false&&v.value===value&&cell.is_null===false,'source/cache race');
  return {...v,value,is_null:cell.is_null};
 });
}
export function filterBindingInventory(native,mapping,graph,node,sourceProof){
 need(native?.verified===true&&native.inventory_complete===true&&mapping?.kind==='control'&&mapping.port===0&&typeof mapping.port_guid==='string','complete owned inventory');
 need(['document_id','workflow_id','node_id'].every(k=>native.node_context?.[k]===node[k]),'node owner');
 const links=(graph.variable_links??[]).filter(l=>l.target===node.node_id&&l.kind==='control'&&l.input===0);
 if(sourceProof)need(links.length===1&&sourceProof.source?.node_id===links[0].source&&['document_id','workflow_id'].every(k=>sourceProof.source[k]===node[k]),'source endpoint');
 const controlVariables=sourceProof?filterBindingVariables(native,mapping,sourceProof,native.rows.flatMap(r=>r.value?.kind==='variable'?[r.value.name]:[])):native.control_variables;
 const inventory=[];let group=0,condition=0;
 for(const row of native.rows){
  if(row.kind==='or'){group++;condition=0;continue;}
  const parameter=`/groups/${group}/${condition++}/value`;
  if(row.variable_mode===0)continue;
  need(row.variable_mode===1&&row.value?.kind==='variable'&&['integer','real','datetime','string'].includes(row.type),'unsupported active binding');
  const variables=controlVariables.filter(v=>v.name===row.value.name),fields=mapping.fields.filter(f=>f.name===row.value.name);
  need(variables.length===1&&fields.length===1,'unique mapped name');
  const v=variables[0],f=fields[0],types={2:'datetime',3:'real',4:'integer',5:'string'};
  need(v.index===f.index&&v.type===row.type&&types[f.type]===v.type,'BINDING_TYPE_MISMATCH: mapped type/index');
  need(v.is_null===false&&(f.is_null===false||sourceProof)||v.type==='real'&&v.is_null===true&&(sourceProof||f.is_null===true),'BINDING_NULL_UNSUPPORTED: NULL is unsupported');
  need(Number.isSafeInteger(f.id)&&f.source&&Number.isSafeInteger(f.source.id)&&f.source.type===f.type&&links.length===1&&links[0].target_port_guid===mapping.port_guid,'connected source identity');
  const sources=graph.nodes.filter(n=>n.ref.node_id===links[0].source);need(sources.length===1,'source owner');
  inventory.push({parameter,mode:'variable',row_id:row.record_id,variable:{kind:'control',input:0,id:f.id,name:f.name,type:v.type,is_null:v.is_null},
   source:{ref:sources[0].ref,type:sources[0].type,output:links[0].output,variable_id:f.source.id},input_port_guid:mapping.port_guid,connected:true,verified:true});
 }
 need(inventory.length<=32,'bounded inventory');return inventory;
}
export async function readFilterBindings(channel,{readGraph,expected,sourceProof}={}){
 const graph=await readGraph();
 let native,node,failure;
 try{
 await openPreparedWizard(channel);
 const s=await channel.observe({condition:'independent saved binding readback',readFilter:true,
  ready:s=>s.wizard?.stage==='row_filter'&&s.node_filter?.verified===true&&s.node_filter.inventory_complete===true&&!s.node_filter.editor&&!s.node_filter.dialogs.length});
 native=s.node_filter;node=s.prepared_node_context;
 if(expected){
  need(native.rows.length===expected.rows.length&&native.rows.every((r,i)=>r.kind===expected.rows[i].kind),'condition identity');
  need(native.rows.every((r,i)=>r.kind==='or'||JSON.stringify([r.field,r.type,r.operator_code,r.value,r.lower,r.upper,r.values,r.case_sensitive])===JSON.stringify([expected.rows[i].field,expected.rows[i].type,expected.rows[i].operator_code,expected.rows[i].value,expected.rows[i].lower,expected.rows[i].upper,expected.rows[i].values,expected.rows[i].case_sensitive])),'saved predicates');
 }
 }catch(error){failure=error;throw error;
 }finally{
  try{
   const close=await closePreparedWizard(channel);need(close.verified===true&&close.cleanup_complete===true,'Cancel');
  }catch(error){if(failure&&error!==failure)error.cause=failure;throw error;}
 }
 if(!native.rows.some(r=>r.variable_mode!==undefined&&r.variable_mode!==0))return [];
 const mapped=await channel.readVariablePortMapping({direction:'input',kind:'control',port:0});
 need(mapped.verified===true&&mapped.cleanup_complete===true&&mapped.independent_readback===true,'independent mapping');
 return filterBindingInventory(native,mapped.mapping,graph,node,sourceProof);
}
