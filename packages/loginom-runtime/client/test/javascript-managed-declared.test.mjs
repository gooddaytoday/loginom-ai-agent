import test from 'node:test';
import assert from 'node:assert/strict';
import {validateJavascriptDeclaredPrimitiveColumns,makeJavascriptManagedDeclaredCode,
  dispatchManagedJavascriptDeclared,runManagedJavascriptDeclaredStep} from '../lib/javascript-managed-declared.mjs';

const columns=[{name:'RowID',label:'Идентификатор',type:'integer',data_kind:'Непрерывный',usage:'Выходное'}];
const task={operation_id:'managed-js-test',owner:{document_id:'document',workflow_id:'workflow',node_id:'node'},
  workflow_ref:{prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1'},targetOrigin:'http://logi-test-plan.bg.local',
  targetBuild:'7.4.2',deadline:Date.now()+60000,
  prepared:{document_id:'document',workflow_ref:{workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'owned',label:'Owned'}]},
    node:{document_id:'document',workflow_id:'workflow',node_id:'node'}},allowDeactivation:true};
const bound={...task,columns,index:0,step:'add',mode:'prepare',gesture_id:'managed-js-test:declared-0-add',usage_value:4};

test('declared primitive scope refuses unsupported fields before browser effects',()=>{
  assert.equal(validateJavascriptDeclaredPrimitiveColumns(columns),columns);
  for(const patch of [{type:'datetime'},{type:'real'},{data_kind:'Дискретный'},
    {name:'bad name'},{label:'bad\nlabel'},{usage:'unknown'},{extra:true}]){
    assert.throws(()=>validateJavascriptDeclaredPrimitiveColumns([{...columns[0],...patch}]));
  }
  assert.throws(()=>validateJavascriptDeclaredPrimitiveColumns([]));
  assert.throws(()=>validateJavascriptDeclaredPrimitiveColumns([...columns,...columns]));
});

test('serialized declared code pins step identity, index, native usage and owner',()=>{
  const code=makeJavascriptManagedDeclaredCode(bound);
  assert.equal(typeof Function('return ('+code+')')(),'function');
  for(const patch of [{index:1},{step:'eval'},{mode:'run'},{gesture_id:'foreign'},
    {usage_value:0},{targetBuild:'other'},{owner:{...task.owner,node_id:null}}]){
    assert.throws(()=>makeJavascriptManagedDeclaredCode({...bound,...patch}));
  }
});

test('missing, replaced or expired declared selection lease refuses before any page read',async()=>{
  let reads=0;
  const page={evaluate(){reads++;}};
  await assert.rejects(runManagedJavascriptDeclaredStep(page,bound),/lease unavailable/);
  page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]=new Map([[task.operation_id,
    {identity:'foreign',settingAttempted:true,wizardCaptured:{}}]]);
  await assert.rejects(runManagedJavascriptDeclaredStep(page,bound),/lease unavailable/);
  assert.equal(reads,0);
});

test('changed durable prepared ACK prevents declared effect dispatch',async()=>{
  const calls=[];
  await assert.rejects(dispatchManagedJavascriptDeclared({task,columns,
    execute:async code=>{calls.push(code);return {status:'prepared'};},
    record:async event=>({...event,gesture_id:'foreign'}),receiptOptions:()=>({})}),/journal ACK differs/);
  assert.equal(calls.length,2); // owned page capture and read-only step preflight
  assert.ok(!calls.some(code=>code.includes('runtime_revision')));
});

test('lost declared effect reply stops the admitted sequence without another dispatch',async()=>{
  let calls=0;const events=[];
  await assert.rejects(dispatchManagedJavascriptDeclared({task,columns,
    execute:async()=>{calls++;if(calls===3)throw Error('lost effect reply');return {status:'prepared'};},
    record:async event=>{events.push(event);return event;},receiptOptions:()=>({})}),/lost effect reply/);
  assert.equal(calls,3);assert.equal(events.length,1);assert.equal(events[0].step,'add');
});

test('foreign declared receipt cannot advance to the next column step',async()=>{
  let calls=0;const events=[];
  await assert.rejects(dispatchManagedJavascriptDeclared({task,columns,
    execute:async()=>{calls++;return calls===3?{status:'SUCCEEDED',operation_id:'foreign'}:{status:'prepared'};},
    record:async event=>{events.push(event);return event;},receiptOptions:()=>({})}),/effect unconfirmed/);
  assert.equal(calls,3);assert.equal(events.length,1);
});
