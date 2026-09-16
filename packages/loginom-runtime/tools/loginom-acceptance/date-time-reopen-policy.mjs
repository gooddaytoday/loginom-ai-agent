// Independent diagnostic guard: navigation may inspect a draft; it cannot edit it.
export function assertReadOnlyWizardAction(state,action,{allowUnchangedFinish=false}={}) {
 if(!state||!action)throw Error('Diagnostic action has no observation');
 if(['open_input_port','open_output_port'].includes(action.verb)&&state.prepared_node_context?.verified===true
   &&state.prepared_node_context.surface==='graph'&&Number.isInteger(action.port)&&action.port>=0&&action.port<2)return;
 const element=state.ui?.elements?.find(e=>e.ref===action.ref),tid=element?.tid;
 if(!element)throw Error('Diagnostic action has no observed control');
 const wizard=state.wizard,verb=action.verb;
 if(wizard?.status==='observed') {
  const root=wizard.root_tid;
  if(verb==='wizard_step'&&[root+';btnNext',root+';btnPrev'].includes(tid))return;
  if(verb==='click'&&tid===root+';btnClose')return;
  if(verb==='confirm_wizard_close'&&tid==='msgbox;tlb;yes')return;
  if(verb==='click'&&wizard.stage==='output_mapping'&&state.prepared_node_context?.verified===true
    &&['rbLinks;DisplayEl','rbTable;DisplayEl','btnGetSourceColumns'].some(key=>tid===root+';DerivedDataSourceOutputSocketWizard;'+key))return;
  const cell=element.date_time_cell,date=state.node_date_time;
  if(verb==='click'&&wizard.stage==='date_time'&&date?.verified===true&&cell?.role==='field'
    &&cell.wizard_root_ref===wizard.root_ref&&date.fields.some(f=>f.name===cell.field_key&&f.record_id===cell.record_id))return;
  if(['scroll','scroll_horizontal'].includes(verb))return;
  if(allowUnchangedFinish&&verb==='finish_wizard'&&tid===root+';btnDone')return;
  throw Error('Saved wizard mutation forbidden: '+verb+' '+tid);
 }
 if(['set_wizard_field','select_wizard_option','finish_wizard','execute_wizard','set_checked','fill'].includes(verb)) {
  // Display formats belong to a separately bound result table, never a node wizard.
  if(state.prepared_node_context?.surface==='views'&&state.node_outputs?.verified===true&&['format','filter'].includes(state.node_table_dialog?.kind))return;
  throw Error('Saved settings mutation outside wizard forbidden');
 }
}
