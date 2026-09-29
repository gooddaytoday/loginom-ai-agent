import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {dispatchManagedJavascriptDeactivation,inspectManagedJavascriptDeactivationPoint,
  makeJavascriptManagedDeactivationCode,makeJavascriptManagedDeactivationPointCode,
  runManagedJavascriptDeactivation} from '../lib/javascript-managed-deactivation.mjs';

const task={operation_id:'owned-js',owner:{document_id:'doc',workflow_id:'flow',node_id:'node'},
  workflow_ref:{tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1'},
  targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',deadline:Date.now()+10000,
  prepared:{document_id:'doc',node:{document_id:'doc',workflow_id:'flow',node_id:'node'},
    workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',
      navigation_path:[{tid:'nav',label:''}]}},allowDeactivation:true};
const point={x:30,y:40,tid:'msgbox;tlb;yes',node_id:'node'};

test('managed deactivation point requires the exact owned dialog and uncovered Yes',()=>{
  const button={id:'yes',isConnected:true,textContent:'Да',getAttribute:()=>null,closest:()=>null,
    getBoundingClientRect:()=>({x:10,y:20,width:40,height:40}),contains:()=>false};
  const dialog={isConnected:true,innerText:'Loginom 7.4.2 Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел? Да Да, больше не спрашивать Нет',
    getBoundingClientRect:()=>({width:100,height:100}),querySelectorAll:()=>[button]};
  const context={args:{held:{},task},read:()=>({ready:true,surface:'deactivation',native_owner_verified:true,
    pending_owner_verified:true,dialog_count:1,root_visible:false}),
    document:{querySelectorAll:()=>[dialog],elementFromPoint:()=>button},
    Ext:{getCmp:()=>({el:{dom:button},disabled:false})},innerWidth:100,innerHeight:100,
    getComputedStyle:()=>({visibility:'visible'})};
  const inspect=()=>vm.runInNewContext('('+inspectManagedJavascriptDeactivationPoint.toString()+')(args,read)',context);
  assert.deepEqual({...inspect()},point);
  context.document.elementFromPoint=()=>null;
  assert.throws(inspect,/covered/);
  context.document.elementFromPoint=()=>button;dialog.innerText='foreign';
  assert.throws(inspect,/dialog changed/);
});

test('managed deactivation dispatches only one click and never replays changed point',async()=>{
  const lease={identity:JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]),
    settingAttempted:true,handle:{}};
  let clicks=0,current=point;
  const page={
    [Symbol.for('loginom-dock.javascript-owned-selection-v1')]:new Map([[task.operation_id,lease]]),
    evaluate:async()=>current,
    mouse:{click:async(x,y)=>{assert.equal(x,point.x);assert.equal(y,point.y);clicks++;}},
  };
  const gesture={...task,gesture_id:task.operation_id+':deactivation',point};
  assert.equal(typeof vm.runInNewContext('('+makeJavascriptManagedDeactivationPointCode(task)+')'),'function');
  assert.equal(typeof vm.runInNewContext('('+makeJavascriptManagedDeactivationCode(gesture)+')'),'function');
  assert.equal((await runManagedJavascriptDeactivation(page,gesture,()=>{})).status,'SUCCEEDED');
  assert.equal(clicks,1);
  assert.equal((await runManagedJavascriptDeactivation(page,gesture,()=>{})).status,'NOT_APPLIED');
  lease.deactivationAttempted=false;current={...point,x:31};
  assert.equal((await runManagedJavascriptDeactivation(page,gesture,()=>{})).status,'NOT_APPLIED');
  assert.equal(clicks,1);
});

test('managed deactivation requires exact journal ACK before the gesture',async()=>{
  let calls=0;
  const execute=async()=>{calls++;return calls===1?point:{status:'SUCCEEDED',
    action_key:'javascript.wizard.deactivation',operation_id:task.operation_id+':deactivation',
    output:{deactivation_gesture_returned:true}};};
  const receiptOptions=(id,key,signature)=>({receipt_namespace:'private-test',receipt_id:id,receipt_signature:signature});
  await assert.rejects(dispatchManagedJavascriptDeactivation({task,execute,record:async event=>({...event,phase:'wrong'}),receiptOptions}),/journal ACK differs/);
  assert.equal(calls,1);
  calls=0;
  const result=await dispatchManagedJavascriptDeactivation({task,execute,record:async event=>event,receiptOptions});
  assert.equal(result.status,'SUCCEEDED');assert.equal(calls,2);
});
