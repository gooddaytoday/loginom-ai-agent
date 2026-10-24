import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {wizardReadiness} from '../lib/javascript-wizard-page.mjs';
import {inspectManagedJavascriptPage, makeJavascriptManagedPageCode, runManagedJavascriptPageRead} from '../lib/javascript-managed-page.mjs';

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


test('managed wizard address reads overflow breadcrumbs but preserves native identity and visible page guards',()=>{
 for(const fault of ['overflow','foreign_node','foreign_control','wrong_text','duplicate','hidden','transparent','visibility']) {
  const document={},cell={},nodeData={},workflow={},node={FGuid:'node',data:nodeData,FCell:cell};
  node.FLabel={parent:node,FCell:{parent:cell},FRawValue:'Развернуть позиции корзин'};
  const tree={FGuid:'node',FModelNode:nodeData,FParentNode:workflow},native={FParentNode:tree},model={FModelNode:nodeData};
  const prefix='MF;TF-1',base=prefix+';cnrNaviMode;b.s_Workflow>Развернуть_позиции_корзин';
  const element=(id,tid,text)=>({id,textContent:text,isConnected:true,getAttribute:key=>key==='data-tid'?tid:null,
   hasAttribute:key=>fault==='hidden'&&key==='hidden',getBoundingClientRect:()=>({x:0,y:0,width:0,height:0})});
  const crumbs=[element('node',base,node.FLabel.FRawValue),element('wizard',base+'>Настройка','Настройка')];
  const controls={node:{el:{dom:crumbs[0]},_node:{data:{node:tree}}},wizard:{el:{dom:crumbs[1]},_node:{data:{node:native}}}};
  if(fault==='foreign_node')tree.FGuid='foreign';
  if(fault==='foreign_control')controls.node._node.data.node={...tree};
  if(fault==='wrong_text')crumbs[0].textContent='Other';
  if(fault==='duplicate')crumbs.unshift(crumbs[0]);
  document.querySelectorAll=q=>q.startsWith('[data-tid^=')?crumbs:[];
  const binding={document,native:node,cell,nodeData,workflow};
  const realm=vm.createContext({document,Ext:{getCmp:id=>controls[id]},getComputedStyle:()=>({display:'none',visibility:fault==='visibility'?'hidden':'visible',opacity:fault==='transparent'?'0':'1'}),
   bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>({Controller:{Node:{data:{node:native}},FController:model}})}}}}}}}});
  const result=vm.runInContext('('+wizardReadiness.toString()+')',realm)({prefix,id:'node',binding,addressEpoch:0,inspect:true});
  assert.equal(result.checks.node_breadcrumb,fault==='overflow',fault);
  assert.equal(result.ready,false,fault); // A native address never substitutes for a visible page/Close.
  assert.equal(result.checks.page_unique,false);assert.equal(result.checks.close_unique,false);
 }
});
