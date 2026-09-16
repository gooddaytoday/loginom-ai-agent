const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const requireValue=(value,message)=>{if(!value)throw Error(message);};
const question='Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел? Да Да, больше не спрашивать Нет';

export function wizardOpenBinding(state) {
 const n=state.prepared_node_context;
 requireValue(n?.verified===true&&n.surface==='graph'&&state.wizard?.status==='absent',
  'A prepared graph node is required to open settings');
 const controls=state.ui.elements.filter(e=>e.tid===n.tid+';Setting'&&e.wizard_open&&e.allowed_actions?.includes('begin_wizard'));
 requireValue(controls.length===1,'One prepared settings control is required');
 return {kind:'deactivation',node:{document_id:n.document_id,workflow_id:n.workflow_id,node_id:n.node_id},
  graph_tid:n.tid,opening:structuredClone(controls[0].wizard_open)};
}

export function wizardDeactivationDialogOwner(state,binding) {
 const n=state.prepared_node_context,ui=state.ui;
 return binding?.kind==='deactivation'&&n?.verified===true&&n.surface==='graph'
  &&n.tid===binding.graph_tid&&['document_id','workflow_id','node_id'].every(k=>n[k]===binding.node?.[k])
  &&state.wizard?.status==='absent'&&state.wizard_pending_owner?.status==='observed'
  &&state.wizard_pending_owner.node?.tid===binding.opening?.workflow_path?.at(-1)?.tid+'>'+binding.opening?.node?.node_label
  &&same(state.wizard_pending_owner.path?.slice(0,-2).map(({tid,label})=>({tid,label})),binding.opening?.workflow_path)
  &&Array.isArray(ui?.dialogs)&&ui.dialogs.length===1&&Array.isArray(ui.masks)
  &&ui.masks.every(m=>m.kind==='modal_background'&&m.target_tid===binding.graph_tid.split(';Graph;')[0]&&m.dialog_ref===null);
}

export function boundWizardDeactivationConfirmation(state,binding,requireControls=true) {
 if(!wizardDeactivationDialogOwner(state,binding))return false;
 const ui=state.ui,d=ui.dialogs[0],title='Loginom '+state.loginom_build;
 if(d.title!==title||d.text!==title+' '+question)return false;
 return !requireControls||Object.entries({yes:'Да',no:'Да, больше не спрашивать',cancel:'Нет'}).every(([name,label])=>
  ui.elements.filter(e=>e.tid==='msgbox;tlb;'+name&&e.label===label&&e.signature?.dialog_ref===d.ref
    &&e.allowed_actions?.includes('click')).length===1);
}

export async function openPreparedWizard(channel) {
 let s=await channel.observe({condition:'prepared node settings available',ready:s=>s.prepared_node_context?.surface==='graph'
  &&s.wizard?.status==='absent'&&s.ui.elements.some(e=>e.tid===s.prepared_node_context.tid+';Setting'&&e.allowed_actions?.includes('begin_wizard'))});
 const binding=wizardOpenBinding(s);
 await channel.perform({condition:'open settings of the prepared node',initialObservation:s,
  ready:s=>same(wizardOpenBinding(s),binding),identity:()=>binding,
  resolve:s=>({verb:'begin_wizard',ref:s.ui.elements.find(e=>e.tid===binding.graph_tid+';Setting').ref})});
 s=await channel.observe({condition:'prepared wizard or exact deactivation question',wizardConfirmation:binding,
  ready:s=>s.wizard?.status==='observed'&&s.prepared_node_context?.surface==='wizard'
    ||boundWizardDeactivationConfirmation(s,binding)});
 const deactivationRequired=s.wizard.status==='absent';
 if(deactivationRequired)await channel.perform({condition:'confirm only this node deactivation',initialObservation:s,
  ready:s=>boundWizardDeactivationConfirmation(s,binding),identity:()=>binding,
  resolve:s=>({verb:'confirm_wizard_deactivation',ref:s.ui.elements.find(e=>e.tid==='msgbox;tlb;yes').ref})});
 const after=await channel.observe({condition:'prepared node wizard opened',ready:s=>s.wizard?.status==='observed'
  &&s.wizard.owner_context?.status==='observed'&&s.prepared_node_context?.surface==='wizard'});
 const owner=after.wizard.owner_context;
 requireValue(owner.node.tid===binding.opening.workflow_path.at(-1)?.tid+'>'+binding.opening.node.node_label
  &&same(owner.path.slice(0,-2).map(({tid,label})=>({tid,label})),binding.opening.workflow_path),
  'Opened wizard owner differs from the prepared node');
 return {verified:true,deactivation_required:deactivationRequired,node_context:after.prepared_node_context,
  owner,settings_applied:false,execution_started:false};
}
