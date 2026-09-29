import {selectJavascriptForSettings} from './javascript-owned-selection.mjs';
import {waitJavascriptWizardSettlement} from './javascript-wizard-settlement.mjs';
import {boundWizardDeactivationConfirmation} from './node-wizard-open.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';

// The public observer may describe a Setting while generic JS actions stay denied.
// Its owner metadata is evidence, never permission to call begin_wizard.
export function javascriptWizardBinding(state,node) {
  const n=state.prepared_node_context;
  const controls=state.ui?.elements?.filter(e=>e.tid===n?.tid+';Setting'&&e.wizard_open?.node?.part==='settings')??[];
  if(n?.verified!==true||n.surface!=='graph'||state.wizard?.status!=='absent'||controls.length!==1
    ||!['document_id','workflow_id','node_id'].every(k=>n[k]===node[k]))throw Error('Private wizard opening owner unavailable');
  const opening=controls[0].wizard_open;
  if(!Array.isArray(opening.workflow_path)||!opening.workflow_path.length||typeof opening.node.node_label!=='string')throw Error('Private wizard navigation unavailable');
  return {kind:'deactivation',node:{document_id:n.document_id,workflow_id:n.workflow_id,node_id:n.node_id},graph_tid:n.tid,opening:structuredClone(opening)};
}

export async function openJavascriptWizard(page,{binding,node,icon,reference,prepared,deadline,record,channel,lifecycle={},targetOrigin="http://logi-test-plan.bg.local",targetBuild="7.4.2"}) {
  await selectJavascriptForSettings(page,{binding,node,icon,deadline,record:async event=>{
    const saved=await record(event);
    // Reserved conservatively before dispatch: uncertain opening is never replayed.
    if(event.phase==='javascript_private_open_dispatch')lifecycle.openingDispatched=true;
    return saved;
  },openSettings:true,targetOrigin,targetBuild,beforeOpen:async()=>{
    const state=await channel.observe({condition:'private JavaScript Setting owner',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
    lifecycle.confirmation=javascriptWizardBinding(state,reference);
    if(lifecycle.confirmation.graph_tid!==node.tid)throw Error('Private wizard graph identity changed');
  }});
  return finishJavascriptWizardOpening(page,{binding,node,reference,prepared,deadline,record,channel,lifecycle,targetOrigin,targetBuild});
}

export async function finishJavascriptWizardOpening(page,{binding,node,reference,prepared,deadline,record,channel,lifecycle,targetOrigin="http://logi-test-plan.bg.local",targetBuild="7.4.2"}) {
  if(!lifecycle.openingDispatched||!lifecycle.confirmation)throw Error('No owned Setting opening to settle');
  const confirmation=lifecycle.confirmation;
  await waitJavascriptWizardSettlement(page,{binding,prepared,deadline,record,allowDeactivation:!lifecycle.deactivationDispatched,targetOrigin,targetBuild});
  const state=await channel.observe({condition:'private JavaScript wizard or bound deactivation',wizardConfirmation:confirmation,
    ready:s=>s.wizard?.status==='observed'&&s.prepared_node_context?.surface==='wizard'
      ||!lifecycle.deactivationDispatched&&boundWizardDeactivationConfirmation(s,confirmation)});
  const deactivationRequired=state.wizard.status==='absent';
  if(deactivationRequired){
    lifecycle.deactivationDispatched=true;
    await channel.perform({condition:'confirm only privately opened JavaScript node deactivation',initialObservation:state,
      ready:s=>boundWizardDeactivationConfirmation(s,confirmation),identity:()=>confirmation,
      resolve:s=>({verb:'confirm_wizard_deactivation',ref:s.ui.elements.find(e=>e.tid==='msgbox;tlb;yes').ref})});
    await waitJavascriptWizardSettlement(page,{binding,prepared,deadline,record,allowDeactivation:false,targetOrigin,targetBuild});
  }
  const after=await channel.observe({condition:'private JavaScript wizard native owner',ready:s=>s.wizard?.status==='observed'
    &&s.wizard.owner_context?.status==='observed'&&s.prepared_node_context?.surface==='wizard'});
  const valid=await page.evaluate(({binding,node,targetOrigin,targetBuild})=>{
    const app=globalThis.bg?.app,tab=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
    const wizard=tab?.Controller?.Node?.data?.node,tree=wizard?.ParentNode,form=tab?.Controller?.FController;
    return document===binding.document&&location.origin===targetOrigin&&app?.Version===targetBuild&&tab===binding.tab
      &&app.WizardTreeNode&&wizard instanceof app.WizardTreeNode&&app.ModelNodeTreeNode&&tree instanceof app.ModelNodeTreeNode
      &&tree.ParentNode===binding.workflow&&tree.FGuid===node.id&&tree.FModelNode===binding.nodeData&&form?.FModelNode===binding.nodeData;
  },{binding,node,targetOrigin,targetBuild});
  if(!valid||Date.now()>=deadline||after.prepared_node_context?.verified!==true
    ||!['document_id','workflow_id','node_id'].every(k=>after.prepared_node_context[k]===reference[k]))throw Error('Private reopened wizard owner changed');
  return {verified:true,deactivation_required:deactivationRequired||lifecycle.deactivationDispatched===true,node_context:after.prepared_node_context,
    owner:after.wizard.owner_context,settings_applied:false,execution_started:false};
}

// A failed opening remains owned by the runtime until cleanup or handoff. This
// memoized cleanup cannot repeat Setting, deactivation, Close or confirmation.
export function cleanupJavascriptWizardOpening(page,options) {
  const lifecycle=options.lifecycle;
  lifecycle.cleanup??=(async()=>{
    await finishJavascriptWizardOpening(page,options);
    if(lifecycle.closeDispatched)throw Error('Wizard close already attempted; no replay');
    lifecycle.closeDispatched=true;
    const closed=await closePreparedWizard(options.channel);
    await options.record({phase:'javascript_pending_wizard_cleanup_verified',closed});
    return closed;
  })();
  return lifecycle.cleanup;
}
