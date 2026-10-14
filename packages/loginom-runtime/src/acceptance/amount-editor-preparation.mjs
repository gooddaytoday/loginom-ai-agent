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
 if(!bound.wizard.import_column_editor){
  await record({event:'amount_editor_preparation',phase:'before_gesture',owner,field:bound.field,node:bound.node});current();
  await openImportColumnEditor(channel,initial,1,'type');current();
 }
 const after=await observe();current();const checked=original(after,owner);
 if(JSON.stringify(checked.field)!==fieldBytes)refuse('unchanged_original_Amount_column');
 if(!checked.wizard.import_column_editor)refuse('confirmed_original_editor_after_gesture');
 return after;
}
