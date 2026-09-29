import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
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
