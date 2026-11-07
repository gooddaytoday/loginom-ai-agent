import {openPreparedWizard} from './node-wizard-open.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
const need=(ok,message)=>{if(!ok)throw Error('Binding readback: '+message);};
export function filterBindingInventory(native,mapping,graph,node){
 need(native?.verified===true&&native.inventory_complete===true&&mapping?.kind==='control'&&mapping.port===0&&typeof mapping.port_guid==='string','complete owned inventory');
 need(['document_id','workflow_id','node_id'].every(k=>native.node_context?.[k]===node[k]),'node owner');
 const links=graph.links.filter(l=>l.target===node.node_id&&l.kind==='control'&&l.input===0);
 const inventory=[];let group=0,condition=0;
 for(const row of native.rows){
  if(row.kind==='or'){group++;condition=0;continue;}
  const parameter=`/groups/${group}/${condition++}/value`;
  if(row.variable_mode===0)continue;
  need(row.variable_mode===1&&row.value?.kind==='variable'&&['integer','string'].includes(row.type),'unsupported active binding');
  const variables=native.control_variables.filter(v=>v.name===row.value.name),fields=mapping.fields.filter(f=>f.name===row.value.name);
  need(variables.length===1&&fields.length===1,'unique mapped name');
  const v=variables[0],f=fields[0],types={4:'integer',5:'string'};
  need(v.index===f.index&&v.type===row.type&&types[f.type]===v.type,'mapped type/index');
  need(v.is_null===false&&f.is_null===false,'NULL is unsupported');
  need(Number.isSafeInteger(f.id)&&f.source&&Number.isSafeInteger(f.source.id)&&f.source.type===f.type&&links.length===1,'connected source identity');
  const sources=graph.nodes.filter(n=>n.ref.node_id===links[0].source);need(sources.length===1,'source owner');
  inventory.push({parameter,mode:'variable',row_id:row.record_id,variable:{kind:'control',input:0,id:f.id,name:f.name,type:v.type,is_null:false},
   source:{ref:sources[0].ref,type:sources[0].type,output:links[0].output,variable_id:f.source.id},input_port_guid:mapping.port_guid,connected:true,verified:true});
 }
 need(inventory.length<=32,'bounded inventory');return inventory;
}
export async function readFilterBindings(channel,{readGraph,expected}={}){
 const graph=await readGraph();
 await openPreparedWizard(channel);
 const s=await channel.observe({condition:'independent saved binding readback',readFilter:true,
  ready:s=>s.wizard?.stage==='row_filter'&&s.node_filter?.verified===true&&s.node_filter.inventory_complete===true&&!s.node_filter.editor&&!s.node_filter.dialogs.length});
 const native=s.node_filter,node=s.prepared_node_context;
 if(expected){
  need(native.rows.length===expected.rows.length&&native.rows.every((r,i)=>r.kind===expected.rows[i].kind),'condition identity');
  need(native.rows.every((r,i)=>r.kind==='or'||JSON.stringify([r.field,r.type,r.operator_code,r.value,r.lower,r.upper,r.values,r.case_sensitive])===JSON.stringify([expected.rows[i].field,expected.rows[i].type,expected.rows[i].operator_code,expected.rows[i].value,expected.rows[i].lower,expected.rows[i].upper,expected.rows[i].values,expected.rows[i].case_sensitive])),'saved predicates');
 }
 const close=await closePreparedWizard(channel);need(close.verified===true&&close.cleanup_complete===true,'Cancel');
 if(!native.rows.some(r=>r.variable_mode!==undefined&&r.variable_mode!==0))return [];
 const mapped=await channel.readVariablePortMapping({direction:'input',kind:'control',port:0});
 need(mapped.verified===true&&mapped.cleanup_complete===true&&mapped.independent_readback===true,'independent mapping');
 return filterBindingInventory(native,mapped.mapping,graph,node);
}
