import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {closeManagedJavascriptWizard,inspectManagedJavascriptClosePoint,
  makeJavascriptManagedClosePointCode,makeJavascriptManagedCloseDecisionCode,
  makeJavascriptManagedCloseGestureCode,makeJavascriptManagedCloseConfirmationCode,
  runManagedJavascriptCloseGesture,runManagedJavascriptCloseConfirmation} from '../lib/javascript-managed-close.mjs';

const task={operation_id:'owned-js',owner:{document_id:'doc',workflow_id:'flow',node_id:'node'},
  workflow_ref:{tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1'},
  targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',deadline:Date.now()+10000,
  prepared:{document_id:'doc',node:{document_id:'doc',workflow_id:'flow',node_id:'node'},
    workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',
      navigation_path:[{tid:'nav',label:''}]}},allowDeactivation:true,cleanup_deadline:Date.now()+10000};
const point={x:30,y:40,tid:'MF;TF-1;WizrdMCF;btnClose',
  page_tid:'MF;TF-1;WizrdMCF;JavaScriptCodeWizard',node_id:'node'};
const confirmPoint={x:50,y:60,tid:'msgbox;tlb;yes'};

test('managed Close point requires the exact owned code page and uncovered button',()=>{
  const button={id:'close',isConnected:true,getAttribute:()=>null,closest:()=>null,
    getBoundingClientRect:()=>({x:10,y:20,width:40,height:40}),contains:()=>false};
  const root={querySelectorAll:()=>[button]},wizard={};
  const tab={Controller:{Node:{data:{node:wizard}},FController:{FView:{el:{dom:root}}}}};
  const held={binding:{tab},wizard,wizardRoot:root};
  const context={args:{held,task},read:()=>({ready:true,node_guid:'node',
    page:{tid:point.page_tid,visible_editors:1}}),
    bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>tab}}}}}}},
    Ext:{getCmp:()=>({el:{dom:button},disabled:false})},document:{elementFromPoint:()=>button},
    getComputedStyle:()=>({visibility:'visible'}),innerWidth:100,innerHeight:100};
  const inspect=()=>vm.runInNewContext('('+inspectManagedJavascriptClosePoint.toString()+')(args,read)',context);
  assert.deepEqual({...inspect()},point);
  context.document.elementFromPoint=()=>null;
  assert.throws(inspect,/covered/);
});

test('managed Close and confirmation each dispatch at most once',async()=>{
  const lease={identity:JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]),
    settingAttempted:true,wizardCaptured:{},handle:{}};
  let clicks=0,current=point;
  const page={
    [Symbol.for('loginom-dock.javascript-owned-selection-v1')]:new Map([[task.operation_id,lease]]),
    evaluate:async()=>current,mouse:{click:async()=>{clicks++;}},
  };
  assert.equal(typeof vm.runInNewContext('('+makeJavascriptManagedClosePointCode(task)+')'),'function');
  assert.equal(typeof vm.runInNewContext('('+makeJavascriptManagedCloseDecisionCode(task)+')'),'function');
  const close={...task,gesture_id:'owned-js:close',point};
  assert.equal(typeof vm.runInNewContext('('+makeJavascriptManagedCloseGestureCode(close)+')'),'function');
  assert.equal((await runManagedJavascriptCloseGesture(page,close,()=>{})).status,'SUCCEEDED');
  assert.equal((await runManagedJavascriptCloseGesture(page,close,()=>{})).status,'NOT_APPLIED');
  current={state:'confirm',point:confirmPoint};
  const confirm={...task,gesture_id:'owned-js:close-confirm',point:confirmPoint};
  assert.equal(typeof vm.runInNewContext('('+makeJavascriptManagedCloseConfirmationCode(confirm)+')'),'function');
  assert.equal((await runManagedJavascriptCloseConfirmation(page,confirm,()=>{})).status,'SUCCEEDED');
  assert.equal((await runManagedJavascriptCloseConfirmation(page,confirm,()=>{})).status,'NOT_APPLIED');
  assert.equal(clicks,2);
});

test('managed Close journals before each gesture and waits for owned graph',async()=>{
  const events=[];let stage=0;
  const execute=async code=>{
    if(code.includes('runManagedJavascriptCloseGesture'))return {status:'SUCCEEDED',action_key:'javascript.wizard.close',operation_id:'owned-js:close'};
    if(code.includes('runManagedJavascriptCloseConfirmation'))return {status:'SUCCEEDED',action_key:'javascript.wizard.close.confirm',operation_id:'owned-js:close-confirm'};
    if(code.includes('inspectManagedJavascriptClosePoint'))return point;
    return stage++===0?{state:'confirm',point:confirmPoint}:{state:'closed',node_id:'node'};
  };
  const receiptOptions=(id,key,signature)=>({receipt_namespace:'private-test',receipt_id:id,receipt_signature:signature});
  const result=await closeManagedJavascriptWizard({task,execute,record:async event=>{events.push(event);return event;},receiptOptions});
  assert.equal(result.closed,true);assert.equal(result.confirmation_required,true);
  assert.deepEqual(events.map(event=>event.phase),['javascript_managed_close_prepared',
    'javascript_managed_close_confirm_prepared','javascript_managed_close_verified']);
});
