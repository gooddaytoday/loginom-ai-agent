import {workspaceUiCapability} from './workspace-ui.mjs';
import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {readOutputContext} from './node-output-context.mjs';

const identity=f=>Object.fromEntries(['index','source_index','name_key','type','record_id'].map(k=>[k,f[k]]));
export function validateTableFormatSelection(snapshot,table,refs,reset){
 const f=snapshot?.table_settings?.format;
 if(typeof reset!=='boolean'||!Array.isArray(refs)||!refs.length||refs.length>8||new Set(refs).size!==refs.length
   ||snapshot.table_settings.status!=='observed'||snapshot.table_settings.kind!=='format'
   ||snapshot.table_settings.view_key!==table.table_tid||f?.selection?.complete!==true||!f.page?.schema_id)
   throw Error('Complete owned Table format selection required');
 const fields=refs.map(ref=>{
  const es=snapshot.ui.elements.filter(e=>e.ref===ref&&e.allowed_actions.includes('click')&&e.interaction?.state==='point_observed');
  const fs=f.fields.filter(v=>v.label_ref===ref&&v.status==='observed'&&['integer','real'].includes(v.type));
  if(es.length!==1||fs.length!==1||es[0].table_field?.view_key!==table.table_tid
    ||es[0].table_field.name_key!==fs[0].name_key||es[0].table_field.source_index!==fs[0].source_index)throw Error('Bound numeric format row required');
  return identity(fs[0]);
 });
 const before=f.selection.fields.map(identity);
 if(!reset&&fields.some(v=>before.some(b=>b.record_id===v.record_id)))throw Error('Format group append would toggle an existing member');
 return {schema_id:f.page.schema_id,fields,before,reset};
}

export function makeTableFormatSelectionCode(binding,{snapshot,table,refs,reset,operation_id,deadline,origin,build}){
 validatePreparedNodeContext(binding);
 const plan=validateTableFormatSelection(snapshot,table,refs,reset);
 if(snapshot.node_table_dialog?.kind!=='format'||JSON.stringify(snapshot.node_table_dialog.table)!==JSON.stringify(table)
  ||snapshot.node_outputs?.verified!==true||snapshot.node_outputs.tables?.filter(t=>t.active&&t.view_guid===table.view_guid&&t.port_guid===table.port_guid&&t.table_tid===table.table_tid).length!==1)
  throw Error('Fresh native Table format owner required');
 if(!Number.isSafeInteger(deadline))throw Error('Original Table selection deadline required');
 const task={snapshot,table,refs,plan,operation_id,deadline,expected_origin:origin,expected_build:build,prepared_node_context:binding};
 return `async page=>(${selectTableFormatPage.toString()})(page,${JSON.stringify(task)},${workspaceUiCapability.toString()},${readPreparedNodeContext.toString()},${readOutputContext.toString()})`;
}

// One fixed, durably prepared page selection; at most eight ordinary mouse
// clicks. No caller recipes, native setters, handlers or RPC. Each click still
// passes the normal context, epoch, hit-point and native-node gates. A partial
// result is never replayed and no gesture starts after the original deadline.
export async function selectTableFormatPage(page,task,capability,readNode,readOutput){
 let snapshot=task.snapshot,effect=false,cleanup=true,inFlight=false;
 const steps=[];let expected=task.plan.reset?[]:[...task.plan.before];
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const ids=fields=>fields.map(f=>f.record_id).sort();
 const owned=s=>s?.table_settings?.status==='observed'&&s.table_settings.kind==='format'
  &&s.table_settings.view_key===task.table.table_tid&&s.table_settings.format?.page?.schema_id===task.plan.schema_id
  &&s.table_settings.format.selection?.complete===true;
 try{
  for(let i=0;i<task.refs.length;i++){
   if(Date.now()>=task.deadline)throw Error('Table format page selection deadline');
   const before=i===0?task.plan.before:expected;
   if(!owned(snapshot)||!same(ids(snapshot.table_settings.format.selection.fields),ids(before)))throw Error('Table format selection changed');
   const target=task.plan.fields[i],rows=snapshot.table_settings.format.fields.filter(f=>f.record_id===target.record_id&&f.label_ref===task.refs[i]);
   if(rows.length!==1||!same(Object.fromEntries(Object.keys(target).map(k=>[k,rows[0][k]])),target))throw Error('Table format row identity changed');
   inFlight=true;
   const r=await capability(page,{mode:'act',operation_id:task.operation_id+':'+i,expected_origin:task.expected_origin,
    expected_build:task.expected_build,prepared_node_context:task.prepared_node_context,snapshot,
    action:{verb:'click',ref:task.refs[i]},table_format_modifier:!task.plan.reset||i>0,table_format_deadline:task.deadline,
    table_format_table:task.table},readNode,undefined,undefined,readOutput);
   inFlight=false;effect ||= r.effect_possible===true;cleanup &&=r.cleanup_complete===true;
   steps.push({operation_id:r.operation_id,status:r.status,effect_possible:r.effect_possible,cleanup_complete:r.cleanup_complete,trace:r.trace,error:r.error});
   if(r.status!=='SUCCEEDED'||!r.cleanup_complete)throw Error('Table format selection click unconfirmed');
   const owner=await readOutput(page,task.prepared_node_context,readNode);
   if(owner?.verified!==true||owner.surface!=='views'||owner.tables?.filter(t=>t.active&&t.view_guid===task.table.view_guid&&t.port_guid===task.table.port_guid&&t.table_tid===task.table.table_tid).length!==1)throw Error('Native Table selection owner changed');
   expected=i===0&&task.plan.reset?[target]:[...expected,target];snapshot=r.output;
   if(Date.now()>=task.deadline||!owned(snapshot)||!same(ids(snapshot.table_settings.format.selection.fields),ids(expected)))throw Error('Table format selection readback changed or late');
  }
  return {status:'SUCCEEDED',verified:true,effect_possible:effect,cleanup_complete:cleanup,selection:expected,node_context:snapshot.prepared_node_context,steps};
 }catch(error){
  // A rejected gesture call supplies no receipt, even if it was the first row.
  // Never translate that uncertainty into a pre-gesture NOT_APPLIED refusal.
  effect ||= inFlight;cleanup &&= !inFlight;
  return {status:effect?'AMBIGUOUS':'NOT_APPLIED',verified:false,effect_possible:effect,cleanup_complete:cleanup,error:String(error.message??error),steps};
 }
}
