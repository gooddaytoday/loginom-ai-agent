import {openImportColumnEditor} from '../../client/lib/text-import-procedure.mjs';
const refuse=field=>{const error=new Error('LOGINOM_AMOUNT_EDITOR_PREPARATION_UNAVAILABLE',{cause:{missing_provider:field,phase:'editor_preparation',mutation_authority:false}});error.missingProvider=field;throw error;};
function original(state,owner){
 const n=state?.prepared_node_context,w=state?.wizard;
 if(n?.verified!==true||n.surface!=='wizard'||['document_id','workflow_id','node_id'].some(k=>n[k]!==owner[k]))refuse('same_page_prepared_native_node');
 if(state.pending||state.running||state.unknown_effect||state.ui_read_failure)refuse('fresh_unsettled_work_gate');
 if(w?.status!=='observed'||w.stage!=='text_import_format'||w.owner_context?.status!=='observed'||n.tid!==w.root_tid)refuse('original_text_import_format_provider');
 const fields=w.import_columns?.fields;
 if(!Array.isArray(fields)||fields.filter(f=>f.name==='Amount').length!==1)refuse('unique_original_Amount_column');
 const field=fields.find(f=>f.name==='Amount');
 if(field.index!==1||field.status!=='observed'||!field.cell_refs?.type)refuse('original_Amount_index1_type_cell');
 const e=w.import_column_editor;
 if(e!=null&&(e.status!=='observed'||e.name!=='Amount'||e.index!==1||e.property!=='type'||e.settings_applied!==false))refuse('original_Amount_editor');
 return {field,wizard:w,node:n};
}
// Fixed private preparation, no graph selection/import/configure/Apply and no
// repeated opening. The normal procedure owns gesture receipts and UNKNOWN.
export async function prepareAmountEditor({channel,observe,owner,current,record}){
 current();const initial=await observe();current();const bound=original(initial,owner),fieldBytes=JSON.stringify(bound.field);
 const pageIdentity=state=>JSON.stringify([state.origin,state.loginom_build,state.dom_epoch?.document,state.workflow_ref]);
 const pageBytes=pageIdentity(initial);
 if(!bound.wizard.import_column_editor){
  // The private scan is a guard, not a procedure snapshot. Reobserve through
  // the actual channel, whose native/context checks and durable journal own
  // the snapshot. Never import an externally supplied snapshot into it.
  const prepared=await channel.observe({condition:'original Amount editor cell bound to procedure',
    importColumnPage:{offset:0,limit:8},ready:state=>{
      const checked=original(state,owner);
      if(pageIdentity(state)!==pageBytes)refuse('same_original_Page_before_gesture');
      if(JSON.stringify(checked.field)!==fieldBytes||checked.wizard.import_column_editor)refuse('unchanged_original_Amount_column');
      return true;
    }});current();
  const checked=original(prepared,owner);
  if(JSON.stringify(checked.field)!==fieldBytes)refuse('unchanged_original_Amount_column');
  await record({event:'amount_editor_preparation',phase:'before_gesture',owner,field:checked.field,node:checked.node});current();
  await openImportColumnEditor(channel,prepared,1,'type');current();
 }
 const after=await observe();current();const checked=original(after,owner);
 if(JSON.stringify(checked.field)!==fieldBytes)refuse('unchanged_original_Amount_column');
 if(!checked.wizard.import_column_editor)refuse('confirmed_original_editor_after_gesture');
 return after;
}
