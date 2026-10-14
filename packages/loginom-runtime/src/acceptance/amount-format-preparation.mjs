import {openPreparedWizard} from '../../client/lib/node-wizard-open.mjs';
import {isTextImportSourceReady} from '../../client/lib/text-import-procedure.mjs';
const refuse=missing=>{throw new Error('LOGINOM_AMOUNT_FORMAT_PREPARATION_UNAVAILABLE',{cause:{missing_provider:missing,phase:'format_preparation',mutation_authority:false}})};
function sameNode(state,owner){
 const n=state?.prepared_node_context;
 if(n?.verified!==true||['document_id','workflow_id','node_id'].some(k=>n[k]!==owner[k])||!['graph','wizard'].includes(n.surface))refuse('original_native_node');
 if(state.pending||state.running||state.unknown_effect||state.ui_read_failure)refuse('fresh_unsettled_work_gate');
 return n;
}
// Private fixed route: existing original node only. No node selection, source
// edits, upload/import, Apply, Finish or retry of an uncertain transition.
export async function prepareAmountFormat({channel,owner,current,readGraph,record}){
 current();let state=await channel.observe({condition:'original Amount preparation surface',ready:s=>{sameNode(s,owner);return true}});current();
 if(state.prepared_node_context.surface==='graph'){
  const graph=await readGraph();current();const nodes=graph?.nodes?.filter(n=>['document_id','workflow_id','node_id'].every(k=>n.ref?.[k]===owner[k]));
  if(graph?.complete!==true||graph.document_id!==owner.document_id||graph.workflow_ref?.workflow_id!==owner.workflow_id||nodes?.length!==1||nodes[0].type!=='imports.text'||nodes[0].locked!==false)refuse('original_unlocked_TextImport_graph_node');
  await record({event:'amount_format_preparation',phase:'before_wizard',owner,native_node:nodes[0]});current();
  await openPreparedWizard(channel);current();
  state=await channel.observe({condition:'original TextImport wizard stage',ready:s=>{sameNode(s,owner);return s.wizard?.status==='observed'}});current();
 }
 if(state.wizard?.stage==='text_import_format')return state;
 if(state.wizard?.stage!=='text_import_file'||!isTextImportSourceReady(state)||!state.wizard.import_source.fields.source_path.value)refuse('original_complete_TextImport_source');
 const sourceBytes=JSON.stringify(state.wizard.import_source),root=state.wizard.root_tid;
 const next=s=>s.ui?.elements?.filter(e=>e.tid===root+';btnNext'&&e.allowed_actions?.includes('wizard_step'))??[];
 if(next(state).length!==1)refuse('original_unique_Next_control');
 await record({event:'amount_format_preparation',phase:'before_next',owner,source:state.wizard.import_source});current();
 await channel.perform({condition:'original TextImport file to format',initialObservation:state,
  ready:s=>{sameNode(s,owner);return s.wizard?.stage==='text_import_file'&&s.wizard.root_tid===root&&JSON.stringify(s.wizard.import_source)===sourceBytes&&next(s).length===1},
  identity:s=>({node:s.prepared_node_context,root,source:s.wizard.import_source}),resolve:s=>({verb:'wizard_step',ref:next(s)[0].ref,expected_stage:'text_import_format'})});current();
 const after=await channel.observe({condition:'original TextImport format ready',ready:s=>{sameNode(s,owner);return s.wizard?.status==='observed'&&s.wizard.stage==='text_import_format'}});current();
 if(after.wizard.root_tid!==root)refuse('original_wizard_root_after_Next');
 return after;
}
