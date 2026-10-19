import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {inspectManagedJavascriptPage, makeJavascriptManagedPageCode, runManagedJavascriptPageRead} from '../lib/javascript-managed-page.mjs';
import {wizardReadiness} from '../lib/javascript-wizard-page.mjs';

const task = {operation_id:'managed-page',owner:{document_id:'doc',workflow_id:'flow',node_id:'node'},
  workflow_ref:{tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1'},
  targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',deadline:Date.now()+10000,
  prepared:{document_id:'doc',node:{document_id:'doc',workflow_id:'flow',node_id:'node'},
    workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',
      navigation_path:[{tid:'nav',label:''}]}},allowDeactivation:true};

test('managed page inspector binds the retained preparation and wizard objects',()=>{
  const document={},workflow={},packageNode={},receipt={phase:'verified',workflowId:'flow',nodeTargetWorkflowNode:workflow,packageNode};
  const preparation={document,id:'doc',receipts:new Map([['owner',receipt]])};
  const held={preparation,receipt,account:'jsteach',binding:{workflow,tab:{}},retained:{native:{}},wizard:{},wizardRoot:{}};
  const context={document,__loginomDockPreparationV1:preparation,
    bg:{app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'jsteach'}}}}}}},
    inspect:args=>args,args:{held,task}};
  const result=vm.runInNewContext('('+inspectManagedJavascriptPage.toString()+')(args,inspect)',context);
  assert.equal(result.owned,packageNode);
  assert.equal(result.expectedWizard,held.wizard);
  assert.equal(result.expectedRoot,held.wizardRoot);
  assert.equal(result.binding.native,held.retained.native);
  receipt.phase='retired';
  assert.throws(()=>vm.runInNewContext('('+inspectManagedJavascriptPage.toString()+')(args,inspect)',context),/preparation changed/);
});

test('managed page reader brackets capture and refuses page drift',async()=>{
  const wizard={ParentNode:{FGuid:'node'}};
  const root={getAttribute:()=>task.workflow_ref.prefix+';WizrdMCF'};
  const tab={Controller:{Node:{data:{node:wizard}},FController:{FView:{el:{dom:root}}}}};
  const lease={identity:JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]),
    settingAttempted:true,handle:{binding:{tab}}};
  const pageState={ready:true,page:{tid:'MF;TF-1;WizrdMCF;JavaScriptColumnsWizard',visible_editors:0}};
  let reads=0,disposed=0;
  const page={
    [Symbol.for('loginom-dock.javascript-owned-selection-v1')]:new Map([[task.operation_id,lease]]),
    evaluate:async (fn,args)=>fn.name==='inspect'
      ? {...pageState,page:{...pageState.page,tid:++reads%2===0&&pageState.drift?'foreign':pageState.page.tid}}
      : fn(args),
    evaluateHandle:async (fn,args)=>({
      ...vm.runInNewContext('('+fn.toString()+')(args)',{args,bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>tab}}}}}}}}),
      dispose:async()=>{disposed++;}}),
  };
  const inspect=function inspect(){};
  assert.equal((await runManagedJavascriptPageRead(page,task,inspect)).ready,true);
  assert.equal(reads,2);
  assert.ok(lease.wizardCaptured);
  assert.equal(lease.handle.wizard,wizard);
  assert.equal(lease.handle.wizardRoot,root);
  pageState.drift=true;
  await assert.rejects(runManagedJavascriptPageRead(page,task,inspect),/changed during capture/);
  assert.equal(disposed,0);
  lease.settingAttempted=false;
  await assert.rejects(runManagedJavascriptPageRead(page,task,inspect),/lease unavailable/);
});

test('managed page code validates the exact prepared owner and serializes the shared inspector',()=>{
  const code=makeJavascriptManagedPageCode(task);
  assert.equal(typeof vm.runInNewContext('('+code+')'),'function');
  assert.ok(code.includes('wizardReadiness'));
  assert.throws(()=>makeJavascriptManagedPageCode({...task,prepared:{...task.prepared,node:{...task.owner,node_id:'other'}}}));
});

test('managed page retains only its exact native Settings breadcrumb in toolbar overflow',()=>{
 for(const mode of ['valid','foreign_control','foreign_wizard','getter_binding','getter_element','wrong_caption','wrong_tid','hidden_attribute','transparent','hidden_visibility','not_overflow','hidden_node','duplicate']){
  const prefix='MF;TF-1',base=prefix+';WizrdMCF',elements=[],controls={};
  const el=(id,tid,text='')=>{const e={id,textContent:text,isConnected:true,hidden:false,
   style:{display:'block',visibility:'visible',opacity:'1'},rect:{x:10,y:10,width:100,height:24},
   getAttribute:k=>k==='data-tid'?tid:null,hasAttribute:k=>k==='hidden'&&e.hidden,
   getBoundingClientRect:()=>e.rect,querySelectorAll:()=>[],closest:()=>null,contains:o=>o===e};elements.push(e);return e;};
  const root=el('root',base),page=el('page',base+';JavaScriptColumnsWizard'),title=el('title',base+';cardWizardPanel;p.h;p.t','Столбцы'),close=el('close',base+';btnClose');
  root.contains=e=>[root,page,title,close].includes(e);root.querySelectorAll=s=>s==='[data-tid]'?[page]:[];
  class ModelNodeTreeNode{} class WizardTreeNode{} class WizardModelComponentForm{}
  const owned={},workflow={ParentNode:owned},nodeData={},cell={},node={FGuid:'node',data:nodeData,FCell:cell};
  node.FLabel={parent:node,FCell:{parent:cell},FRawValue:'Parser'};
  const tree=Object.assign(new ModelNodeTreeNode(),{FGuid:'node',FModelNode:nodeData,FParentNode:workflow,ParentNode:workflow});
  const native=Object.assign(new WizardTreeNode(),{FParentNode:tree,ParentNode:tree});
  const model=Object.assign(new WizardModelComponentForm(),{FModelNode:nodeData,FView:{el:{dom:root}}});
  const tab={Controller:{Node:{data:{node:native}},FController:model}};
  const document={querySelectorAll:s=>{
   if(s.startsWith('[data-tid^='))return crumbs;
   if(s.startsWith('[data-tid=')){const tid=JSON.parse(s.slice(10,-1));return elements.filter(e=>e.getAttribute('data-tid')===tid);}
   return [];
  }};
  const binding={document,native:node,nodeData,cell,workflow,tab};
  const nodeTid=prefix+';cnrNaviMode;b.s_Сервер>Пакеты>Long_package>Модуль1>Сценарий>Parser';
  const nc=el('node',nodeTid,'Parser'),wc=el('settings',mode==='wrong_tid'?nodeTid+'>Other':nodeTid+'>Настройка',mode==='wrong_caption'?'Other':'Настройка');
  const crumbs=[nc,wc];wc.style.display='none';wc.rect={x:0,y:0,width:0,height:0};
  controls.node={el:{dom:nc},_node:{data:{node:tree}}};controls.settings={el:{dom:wc},_node:{data:{node:native}}};
  controls.page={el:{dom:page},ownerCt:{el:{dom:root}}};
  if(mode==='foreign_control')controls.settings.el.dom={};
  if(mode==='foreign_wizard')controls.settings._node.data.node={};
  if(mode==='getter_binding')Object.defineProperty(controls.settings,'_node',{get(){throw Error('unexpected getter');}});
  if(mode==='getter_element')Object.defineProperty(controls.settings,'el',{get(){throw Error('unexpected getter');}});
  if(mode==='hidden_attribute')wc.hidden=true;
  if(mode==='transparent')wc.style.opacity='0';
  if(mode==='hidden_visibility')wc.style.visibility='hidden';
  if(mode==='not_overflow')wc.style.display='block';
  if(mode==='hidden_node')nc.rect={x:0,y:0,width:0,height:0};
  if(mode==='duplicate')crumbs.push(wc);
  const form={FMapTree:{FServerConnection:{UserName:'own'},PackageNodes:{Count:1,Items:()=>owned}},
   Items:{Workspace:{getActiveTab:()=>tab}}};
  const context={document,Ext:{getCmp:id=>controls[id]},getComputedStyle:e=>e.style,
   bg:{app:{ModelNodeTreeNode,WizardTreeNode,Application:{FInstance:{FMainForm:form}}}}};
  const inspect=vm.runInNewContext('('+wizardReadiness.toString()+')',context);
  const result=inspect({prefix,owned,account:'own',id:'node',binding,addressEpoch:0,expectedWizard:native,expectedRoot:root,inspect:true,inputOnly:false});
  assert.equal(result.ready,mode==='valid',mode+': '+result.failed.join(','));
 }
});
