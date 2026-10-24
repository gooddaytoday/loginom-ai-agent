import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {dispatchManagedJavascriptNext,inspectManagedJavascriptNextPoint,
  makeJavascriptManagedNextCode,makeJavascriptManagedNextPointCode,
  runManagedJavascriptNext} from '../lib/javascript-managed-next.mjs';

const task={operation_id:'owned-js',owner:{document_id:'doc',workflow_id:'flow',node_id:'node'},
  workflow_ref:{tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1'},
  targetOrigin:'http://logi-test-plan.bg.local',targetBuild:'7.4.2',deadline:Date.now()+10000,
  prepared:{document_id:'doc',node:{document_id:'doc',workflow_id:'flow',node_id:'node'},
    workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',
      navigation_path:[{tid:'nav',label:''}]}},allowDeactivation:true};
const from={tid:'MF;TF-1;WizrdMCF;JavaScriptColumnsWizard',index:0,indicator_count:4,visible_editors:0,title:'Столбцы'};
const before={ready:true,node_guid:'node',page:from};
const point={x:30,y:40,tid:'MF;TF-1;WizrdMCF;btnNext',from_index:0,from_tid:from.tid};

for(const [form,index,count] of [['JavaScriptColumnsWizard',0,4],['TuneDataSourceInputPortWizard',0,5],['JavaScriptColumnsWizard',1,5]])
test('managed Next point binds the owned wizard and uncovered native button '+form+count,()=>{
  const from={tid:task.workflow_ref.prefix+';WizrdMCF;'+form,index,indicator_count:count,visible_editors:0};
  const before={ready:true,node_guid:'node',page:from};
  const point={x:30,y:40,tid:task.workflow_ref.prefix+';WizrdMCF;btnNext',from_index:index,from_tid:from.tid};
  const button={id:'btn',isConnected:true,getBoundingClientRect:()=>({x:10,y:20,width:40,height:40}),
    getAttribute:key=>key==='data-tid'?point.tid:null,closest:()=>null,contains:()=>false};
  const root={isConnected:true,getAttribute:()=>task.workflow_ref.prefix+';WizrdMCF',
    querySelectorAll:()=>[button]};
  const wizard={},tab={Controller:{Node:{data:{node:wizard}},FController:{FView:{el:{dom:root}}}}};
  const held={binding:{tab},wizard,wizardRoot:root};
  const context={args:{held,task,expected:{page:from}},read:()=>before,
    bg:{app:{Application:{FInstance:{FMainForm:{Items:{Workspace:{getActiveTab:()=>tab}}}}}}},
    Ext:{getCmp:()=>({el:{dom:button},disabled:false})},
    document:{elementFromPoint:()=>button},innerWidth:100,innerHeight:100,
    getComputedStyle:()=>({visibility:'visible'})};
  const inspect=()=>vm.runInNewContext('('+inspectManagedJavascriptNextPoint.toString()+')(args,read)',context);
  assert.deepEqual({...inspect()},point);
  context.document.elementFromPoint=()=>null;
  assert.throws(inspect,/covered/);
  context.document.elementFromPoint=()=>button;
  context.args.expected.page={...from,index:3};
  assert.throws(inspect,/source page changed/);
});

test('managed Next dispatches one click and refuses replay or changed point',async()=>{
  const lease={identity:JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]),
    settingAttempted:true,wizardCaptured:{},handle:{}};
  let clicks=0,current=point;
  const page={
    [Symbol.for('loginom-dock.javascript-owned-selection-v1')]:new Map([[task.operation_id,lease]]),
    evaluate:async()=>current,
    mouse:{click:async(x,y)=>{assert.equal(x,point.x);assert.equal(y,point.y);clicks++;}},
  };
  const gesture={...task,gesture_id:task.operation_id+':next-columns-code',expected:before,point};
  const code=makeJavascriptManagedNextCode(gesture);
  assert.equal(typeof vm.runInNewContext('('+code+')'),'function');
  assert.equal(typeof vm.runInNewContext('('+makeJavascriptManagedNextPointCode(task,before)+')'),'function');
  const result=await runManagedJavascriptNext(page,gesture,()=>{});
  assert.equal(result.status,'SUCCEEDED');assert.equal(clicks,1);
  assert.equal((await runManagedJavascriptNext(page,gesture,()=>{})).status,'NOT_APPLIED');
  lease.nextAttempted=false;current={...point,x:31};
  assert.equal((await runManagedJavascriptNext(page,gesture,()=>{})).status,'NOT_APPLIED');
  assert.equal(clicks,1);
});

test('managed Next requires exact journal ACK before browser gesture',async()=>{
  let calls=0;
  const execute=async code=>{calls++;return calls===1?before:calls===2?point:{status:'SUCCEEDED',
    action_key:'javascript.wizard.next',operation_id:task.operation_id+':next-columns-code'};};
  const receiptOptions=(id,key,signature)=>({receipt_namespace:'private-test',receipt_id:id,
    receipt_signature:signature});
  const refused=await assert.rejects(dispatchManagedJavascriptNext({task,execute,
    record:async event=>({...event,phase:'wrong'}),receiptOptions}),/journal ACK differs/);
  assert.equal(refused,undefined);assert.equal(calls,2);
  calls=0;
  const result=await dispatchManagedJavascriptNext({task,execute,record:async event=>event,receiptOptions});
  assert.equal(result.status,'SUCCEEDED');assert.equal(calls,3);
});

for(const [form,index,count] of [['TuneDataSourceInputPortWizard',0,5],['JavaScriptColumnsWizard',1,5]])
test('existing JS five-page route admits exactly one Next from '+form,async()=>{
 const source={...before,page:{...from,tid:task.workflow_ref.prefix+';WizrdMCF;'+form,index,indicator_count:count}};
 const input=form==='TuneDataSourceInputPortWizard',suffix=input?':next-input-columns':':next-columns-code';
 const target={...point,from_tid:source.page.tid,from_index:index};
 const gesture={...task,gesture_id:task.operation_id+suffix,expected:source,point:target};
 const code=makeJavascriptManagedNextCode(gesture);
 assert.equal(typeof vm.runInNewContext('('+code+')'),'function');
 const lease={identity:JSON.stringify([task.owner,task.workflow_ref,task.targetOrigin,task.targetBuild,task.deadline]),
   settingAttempted:true,wizardCaptured:{},handle:{}};
 let clicks=0;
 const page={[Symbol.for('loginom-dock.javascript-owned-selection-v1')]:new Map([[task.operation_id,lease]]),
   evaluate:async()=>target,mouse:{click:async()=>{clicks++}}};
 assert.equal((await runManagedJavascriptNext(page,gesture,()=>{})).status,'SUCCEEDED');
 assert.equal((await runManagedJavascriptNext(page,gesture,()=>{})).status,'NOT_APPLIED');
 assert.equal(clicks,1);
 assert.equal(lease.nextAttempted,input?undefined:true);
 assert.throws(()=>makeJavascriptManagedNextCode({...gesture,expected:{...source,page:{...source.page,index:3}}}),/source page/);
 assert.throws(()=>makeJavascriptManagedNextCode({...gesture,gesture_id:task.operation_id+':wrong'}),/gesture/);
});
