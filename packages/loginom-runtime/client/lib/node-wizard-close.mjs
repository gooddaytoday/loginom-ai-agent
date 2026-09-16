const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const requireValue=(value,message)=>{if(!value)throw Error(message);};

export function wizardCloseBinding(state) {
 const w=state.wizard,n=state.prepared_node_context;
 const input=n?.input_port?.direction==='input'&&Number.isInteger(n.input_port.port)&&n.input_port.port>=0&&n.input_port.port<100&&Number.isInteger(n.input_port.native_index)&&n.input_port.native_index>=0
  &&typeof n.input_port.port_guid==='string'&&n.input_port.port_guid.length>0&&typeof n.input_port.opening_operation_id==='string'&&n.input_port.opening_operation_id.length>0&&w?.stage==='input_mapping';
 const output=n?.output_port?.direction==='output'&&Number.isInteger(n.output_port.port)&&n.output_port.port>=0&&n.output_port.port<100&&Number.isInteger(n.output_port.native_index)&&n.output_port.native_index>=0
  &&typeof n.output_port.port_guid==='string'&&n.output_port.port_guid.length>0&&typeof n.output_port.opening_operation_id==='string'&&n.output_port.opening_operation_id.length>0
  &&w?.stage==='output_mapping'&&w.port_context?.status==='observed'&&w.port_context.kind==='output_data'&&w.port_context.node?.ref&&w.port_context.port?.ref;
 requireValue(w?.status==='observed' && (w.owner_context?.status==='observed'||input||output)
  && n?.verified===true && n.surface==='wizard','A prepared wizard is required for cancellation');
 return {kind:'close',root_ref:w.root_ref,root_tid:w.root_tid,stage:w.stage,
  owner:structuredClone(input?{input_port:n.input_port}:output?{output_port:n.output_port,port_context:w.port_context}:w.owner_context),node:{document_id:n.document_id,workflow_id:n.workflow_id,node_id:n.node_id}};
}

export function wizardCloseDialogOwner(state,binding) {
 if(binding?.kind!=='close')return false;
 const w=state.wizard,n=state.prepared_node_context,ui=state.ui;
 if(w?.status!=='observed'||w.root_ref!==binding.root_ref||w.root_tid!==binding.root_tid
  ||w.stage!==binding.stage||!same(binding.owner?.input_port?{input_port:n?.input_port}:binding.owner?.output_port?{output_port:n?.output_port,port_context:w.port_context}:w.owner_context,binding.owner)||n?.verified!==true
  ||!['document_id','workflow_id','node_id'].every(k=>n[k]===binding.node?.[k]))return false;
 if(!Array.isArray(ui?.dialogs)||ui.dialogs.length!==1||!Array.isArray(ui.masks)
  ||ui.masks.some(m=>m.kind!=='modal_background'||m.ref!==binding.root_ref))return false;
 return true;
}

export function boundWizardCloseConfirmation(state,binding,requireControls=true) {
 if(!wizardCloseDialogOwner(state,binding))return false;
 const ui=state.ui,dialog=ui.dialogs[0];
 if(dialog.title!=='Подтвердить'||dialog.text!=='Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет')return false;
 if(!requireControls)return true;
 return ['yes','no'].every(name=>ui.elements.filter(e=>e.tid==='msgbox;tlb;'+name
  &&e.signature?.dialog_ref===dialog.ref&&e.label===(name==='yes'?'Да':'Нет')
  &&e.allowed_actions?.includes('click')).length===1);
}

export function cancelledWizardReady(state,binding) {
 const node=state.prepared_node_context;
 return state.wizard?.status==='absent' && node?.verified===true && node.surface==='graph'
  && node.locked===false && ['document_id','workflow_id','node_id'].every(k=>node[k]===binding.node[k])
  && state.ui?.dialogs?.length===0 && state.ui?.masks?.length===0;
}

export async function closePreparedWizard(channel) {
 let s=await channel.observe({condition:'prepared wizard can be cancelled',ready:s=>s.wizard?.status==='observed'
  &&s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnClose'&&e.allowed_actions.includes('click')).length===1});
 const binding=wizardCloseBinding(s);
 await channel.perform({condition:'close the prepared wizard draft',initialObservation:s,
  ready:s=>same(wizardCloseBinding(s),binding),identity:()=>binding,
  resolve:s=>({verb:'click',ref:s.ui.elements.find(e=>e.tid===binding.root_tid+';btnClose').ref})});
 s=await channel.observe({condition:'wizard close confirmation or closed graph',wizardConfirmation:binding,
  ready:s=>s.wizard?.status==='absent'&&s.prepared_node_context?.surface==='graph'||boundWizardCloseConfirmation(s,binding)});
 const confirmationRequired=s.wizard.status!=='absent';
 if(confirmationRequired) {
  await channel.perform({condition:'confirm cancellation of this wizard draft',initialObservation:s,
   ready:s=>boundWizardCloseConfirmation(s,binding),identity:()=>binding,
   resolve:s=>({verb:'confirm_wizard_close',ref:s.ui.elements.find(e=>e.tid==='msgbox;tlb;yes').ref})});
 }
 const after=await channel.observe({condition:'cancelled wizard returned to the same unlocked node',
  ready:s=>cancelledWizardReady(s,binding)});
 return {verified:true,cleanup_complete:true,effect_possible:true,mode:'close',execution_started:false,
  settings_applied:false,draft_discarded:true,confirmation_required:confirmationRequired,
  node_context:after.prepared_node_context,package_saved:false,reopen_performed:false};
}
