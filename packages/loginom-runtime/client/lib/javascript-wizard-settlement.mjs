import {withJavascriptWizardMasks} from './javascript-wizard-masks.mjs';
// Private read-only settlement after one Setting/deactivation gesture. The
// shared wizard procedure still admits every confirmation and cancellation.
export const inspectJavascriptWizardSettlement=withJavascriptWizardMasks(function inspectJavascriptWizardSettlement({binding:b,prepared,allowDeactivation=true,poll=false,targetOrigin="http://logi-test-plan.bg.local",targetBuild="7.4.2"}) {
  const app=globalThis.bg?.app,p=globalThis.__loginomDockPreparationV1;
  const card=app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.();
  const records=[...(p?.receipts?.values()??[])].filter(r=>r.phase==='verified'&&r.workflowId===prepared.workflow_ref.workflow_id);
  if(document!==b.document||p?.document!==document||p.id!==prepared.document_id||location.origin!==targetOrigin||app?.Version!==targetBuild
    ||records.length!==1||records[0].nodeTargetWorkflowNode!==b.workflow||card!==b.tab
    ||b.native.FGuid!==prepared.node.node_id||b.native.data!==b.nodeData||b.native.FCell!==b.cell)
    throw Error('Wizard settlement original native owner changed');
  const exact=tid=>[...document.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
  const visible=e=>!!e?.isConnected&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  const tabs=exact(prepared.workflow_ref.tab_tid);
  if(tabs.length!==1||tabs[0]!==records[0].tab||!tabs[0].classList.contains('x-tab-active'))throw Error('Wizard settlement tab changed');
  const current=card.Controller?.Node?.data?.node,model=card.Controller?.FController;
  const ancestors=new Set();let tree,wizard;
  for(let n=current;n&&ancestors.size<32&&!ancestors.has(n);n=n.ParentNode){
    ancestors.add(n);
    if(app.ModelNodeTreeNode&&n instanceof app.ModelNodeTreeNode)tree=n;
    if(app.WizardTreeNode&&n instanceof app.WizardTreeNode)wizard=n;
  }
  if(!ancestors.has(b.workflow)||!ancestors.has(records[0].packageNode)
    ||tree&&(tree.ParentNode!==b.workflow||tree.FGuid!==b.native.FGuid||tree.FModelNode!==b.nodeData)
    ||wizard&&(wizard.ParentNode!==tree||current!==wizard))throw Error('Wizard settlement current native owner changed');
  const path=prepared.workflow_ref.navigation_path;
  const crumbs=[...document.querySelectorAll('[data-tid^='+JSON.stringify(prepared.workflow_ref.prefix+';cnrNaviMode;b.s_')+']')];
  if(crumbs.length>path.length+2||crumbs.slice(0,path.length).some((e,i)=>e.getAttribute('data-tid')!==path[i].tid||e.textContent.trim()!==path[i].label))
    throw Error('Wizard settlement navigation changed');
  const dialogs=[...document.querySelectorAll('[role="dialog"],.x-message-box')].filter(visible);
  const masks=[...document.querySelectorAll('.x-mask,.bg-mask-message,.x-mask-msg')].filter(visible);
  const roots=exact(prepared.workflow_ref.prefix+';WizrdMCF');
  if(roots.length>1)throw Error('Wizard settlement root ambiguous');
  const graph=model===b.model;
  if(!graph&&model?.constructor?.name!=='WizardModelComponentForm')throw Error('Wizard settlement foreign surface');
  let surface=graph?'graph':'wizard',pendingOwner=false;
  if(graph){
    if(card.Controller!==b.controller||model.FDiagram!==b.diagram||b.diagram.FmxGraph!==b.graph||current!==b.workflow)
      throw Error('Wizard settlement graph changed');
    if(crumbs.length===path.length+2){
      const nodeCrumb=crumbs.at(-2),wizardCrumb=crumbs.at(-1);
      const nc=globalThis.Ext?.getCmp(nodeCrumb.id),wc=globalThis.Ext?.getCmp(wizardCrumb.id);
      const nt=nc?._node?.data?.node,wt=wc?._node?.data?.node;
      if(nc?.el?.dom!==nodeCrumb||wc?.el?.dom!==wizardCrumb||!app.ModelNodeTreeNode||!(nt instanceof app.ModelNodeTreeNode)
        ||!app.WizardTreeNode||!(wt instanceof app.WizardTreeNode)||wt.ParentNode!==nt||nt.ParentNode!==b.workflow
        ||nt.FGuid!==b.native.FGuid||nt.FModelNode!==b.nodeData)throw Error('Wizard settlement pending node changed');
      pendingOwner=true;
    }
  }else{
    if(model.FModelNode&&model.FModelNode!==b.nodeData||roots.length===1&&model.FView?.el?.dom!==roots[0])throw Error('Wizard settlement form changed');
  }
  if(dialogs.length){
    const text=String(dialogs[0].innerText??'').replace(/\s+/g,' ').trim();
    const expected='Loginom 7.4.2 Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел? Да Да, больше не спрашивать Нет';
    if(dialogs.length!==1||!graph||!pendingOwner||text!==expected)throw Error('Wizard settlement foreign dialog');
    surface='deactivation';
  }
  const root=roots.length===1?roots[0]:null,pageBase=prepared.workflow_ref.prefix+';WizrdMCF;';
  const pages=root?[...root.querySelectorAll('[data-tid]')].filter(e=>{
    const tid=e.getAttribute('data-tid');
    return tid.startsWith(pageBase)&&/^[^;]*Wizard$/.test(tid.slice(pageBase.length))&&visible(e);
  }):[];
  const {maskObservations}=classifyJavascriptWizardMasks({prefix:prepared.workflow_ref.prefix,root,model,binding:b,pages,overlays:masks});
  const blockers=maskObservations.filter(m=>!m.disabled_delete_mask);
  const ready=surface==='deactivation'?allowDeactivation:
    surface==='wizard'&&!!wizard&&!!tree&&model.FModelNode===b.nodeData&&roots.length===1&&visible(roots[0])
      &&crumbs.length===path.length+2&&dialogs.length===0&&blockers.length===0;
  const result={ready,surface,native_owner_verified:true,node_id:b.native.FGuid,navigation_count:crumbs.length,
    expected_navigation_count:path.length,dialog_count:dialogs.length,mask_count:masks.length,
    blocker_count:blockers.length,disabled_delete_mask_count:maskObservations.length-blockers.length,
    mask_diagnostics:maskObservations.slice(0,12).map(({element,checks,disabled_delete_mask})=>{
      const r=element.getBoundingClientRect();
      return {tid:element.getAttribute('data-tid')?.slice(0,200)??null,id:String(element.id??'').slice(0,120),
        parent_tid:element.parentElement?.getAttribute('data-tid')?.slice(0,200)??null,
        classes:String(element.className??'').slice(0,120),box:{x:r.x,y:r.y,width:r.width,height:r.height},
        checks,disabled_delete_mask};
    }),mask_diagnostics_truncated:maskObservations.length>12,
    root_visible:roots.length===1&&visible(roots[0]),pending_owner_verified:pendingOwner,execution_started:false};
  return poll?(ready?result:false):result;
});

export async function waitJavascriptWizardSettlement(page,{binding,prepared,deadline,record,allowDeactivation=true,targetOrigin="http://logi-test-plan.bg.local",targetBuild="7.4.2"}) {
  const args={binding,prepared,allowDeactivation,targetOrigin,targetBuild};
  const inspect=()=>page.evaluate(inspectJavascriptWizardSettlement,args);
  try{
    const before=await inspect();await record({phase:'javascript_wizard_settlement_before',...before,deadline});
    const remaining=deadline-Date.now();if(remaining<=0)throw Error('Wizard settlement original deadline expired');
    if(!before.ready){const ready=await page.waitForFunction(inspectJavascriptWizardSettlement,{...args,poll:true},{timeout:remaining,polling:100});await ready.dispose();}
    const after=await inspect();
    if(!after.ready||Date.now()>=deadline)throw Error('Wizard settlement unconfirmed under original deadline');
    await record({phase:'javascript_wizard_settlement_verified',...after,deadline});return after;
  }catch(error){
    const terminal=await inspect().catch(()=>({native_owner_verified:false}));
    await record({phase:'javascript_wizard_settlement_refused',...terminal,deadline,reason:String(error.message).slice(0,300)});throw error;
  }
}


// Resolve current addressing only from the retained native node and reciprocal
// breadcrumb controls. A rename never substitutes the node's identity.
// Source-backed caches: Trees.FParentNode, Unit.parent/FCell, Label.FRawValue,
// NavigationPanel._node and Ext Model.data/Component.el/Element.dom.
export function inspectJavascriptWizardAddress({prefix,id,binding,native,model,crumbs,epoch}) {
  const value=(object,key)=>object&&Object.getOwnPropertyDescriptor(object,key)?.value;
  const dom=control=>value(value(control,'el'),'dom');
  const node=value(binding,'native'),cell=value(binding,'cell'),nodeData=value(binding,'nodeData');
  const tree=value(native,'FParentNode'),labelObject=value(node,'FLabel'),label=value(labelObject,'FRawValue');
  const nodeCrumb=crumbs?.at(-2),wizardCrumb=crumbs?.at(-1);
  const nodeControl=nodeCrumb&&globalThis.Ext?.getCmp?.(nodeCrumb.id),wizardControl=wizardCrumb&&globalThis.Ext?.getCmp?.(wizardCrumb.id);
  const controlNode=control=>value(value(value(control,'_node'),'data'),'node');
  const nodeTid=nodeCrumb?.getAttribute('data-tid'),wizardTid=wizardCrumb?.getAttribute('data-tid');
  const checks={epoch:Number.isSafeInteger(epoch)&&epoch>=0,document:!!binding&&document===value(binding,'document'),
    native_node:!!node&&!!nodeData&&!!cell&&value(node,'FGuid')===id&&value(node,'data')===nodeData&&value(node,'FCell')===cell,
    tree:!!tree&&value(tree,'FGuid')===id&&value(tree,'FModelNode')===nodeData&&value(tree,'FParentNode')===value(binding,'workflow'),
    model:!!model&&value(model,'FModelNode')===nodeData,
    label_cache:!!labelObject&&value(labelObject,'parent')===node&&value(value(labelObject,'FCell'),'parent')===cell
      &&typeof label==='string'&&label.length>0&&label.length<=256,
    count:Array.isArray(crumbs)&&crumbs.length>=2&&crumbs.length<=32,
    unique:Array.isArray(crumbs)&&crumbs.filter(e=>e.getAttribute('data-tid')===nodeTid).length===1
      &&crumbs.filter(e=>e.getAttribute('data-tid')===wizardTid).length===1,
    node_binding:!!nodeCrumb&&dom(nodeControl)===nodeCrumb&&controlNode(nodeControl)===tree,
    wizard_binding:!!wizardCrumb&&dom(wizardControl)===wizardCrumb&&controlNode(wizardControl)===native,
    node_text:typeof label==='string'&&nodeCrumb?.textContent?.trim()===label,
    wizard_text:wizardCrumb?.textContent?.trim()==='Настройка',
    tids:typeof nodeTid==='string'&&nodeTid.length<=1024&&nodeTid.startsWith(prefix+';cnrNaviMode;b.s_')
      &&wizardTid===nodeTid+'>Настройка'};
  const ready=Object.values(checks).every(Boolean);
  const previous=value(binding,'wizardAddress');
  checks.retained_address=!previous||epoch>previous.epoch||epoch===previous.epoch&&previous.wizard===native&&previous.node===node&&previous.tree===tree
    &&previous.label===label&&previous.node_tid===nodeTid&&previous.wizard_tid===wizardTid;
  if(ready&&checks.retained_address&&(!previous||epoch>previous.epoch))binding.wizardAddress={
    epoch,wizard:native,node,tree,label,node_tid:nodeTid,wizard_tid:wizardTid};
  return {ready:ready&&checks.retained_address,checks,epoch,
    label:checks.label_cache?label:null,node_tid:checks.tids?nodeTid:null,wizard_tid:checks.tids?wizardTid:null,
    node_id:checks.native_node?id:null};
}

export function withJavascriptWizardAddress(inspector) {
  return new Function('return function '+inspector.name+'(args){const inspectJavascriptWizardAddress='+inspectJavascriptWizardAddress.toString()+';return ('+inspector.toString()+')(args);}')();
}
