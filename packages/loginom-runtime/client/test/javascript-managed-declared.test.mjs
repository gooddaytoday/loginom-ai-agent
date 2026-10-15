import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateJavascriptDeclaredPrimitiveColumns,makeJavascriptManagedDeclaredCode,
  dispatchManagedJavascriptDeclared,runManagedJavascriptDeclaredStep,
  inspectManagedJavascriptDeclaredContext} from '../lib/javascript-managed-declared.mjs';

const columns=[{name:'RowID',label:'Идентификатор',type:'integer',data_kind:'Непрерывный',usage:'Выходное'}];
const task={operation_id:'managed-js-test',owner:{document_id:'document',workflow_id:'workflow',node_id:'node'},
  workflow_ref:{prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1'},targetOrigin:'http://logi-test-plan.bg.local',
  targetBuild:'7.4.2',deadline:Date.now()+60000,
  prepared:{document_id:'document',workflow_ref:{workflow_id:'workflow',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'owned',label:'Owned'}]},
    node:{document_id:'document',workflow_id:'workflow',node_id:'node'}},allowDeactivation:true};
const bound={...task,columns,index:0,step:'add',mode:'prepare',gesture_id:'managed-js-test:declared-0-add',usage_value:4};

test('ordinary declared context validation returns serializable proof; native objects require handle capture',()=>{
  const document={},root={isConnected:true};document.root=root;root.document=document;
  const workflow={},node={FGuid:'node'},wizard={ParentNode:node};
  const tab={Controller:{Node:{data:{node:wizard}},FController:{FView:{el:{dom:root}}}}};
  const receipt={phase:'verified',workflowId:'workflow',nodeTargetWorkflowNode:workflow};
  const preparation={document,id:'document',receipts:new Map([['owned',receipt]])};
  const held={preparation,receipt,account:'jsteach',binding:{workflow,tab},wizard,wizardRoot:root,wizardBinding:{tab}};
  const environment={document,__loginomDockPreparationV1:preparation,
    bg:{app:{Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:{UserName:'jsteach'}},
      Items:{Workspace:{getActiveTab:()=>tab}}}}}}},args:{held,task}};
  const source='('+inspectManagedJavascriptDeclaredContext.toString()+')(args)';
  assert.equal(JSON.stringify(runInNewContext(source,environment)),JSON.stringify({verified:true}));
  environment.args.capture=true;
  const captured=runInNewContext(source,environment);
  assert.equal(captured.root,root);assert.equal(captured.native,wizard);
  assert.throws(()=>JSON.stringify(captured),/circular/);
  environment.args.capture=false;held.account='foreign';
  assert.throws(()=>runInNewContext(source,environment),/context changed/);
});

test('declared primitive scope refuses unsupported fields before browser effects',()=>{
  assert.equal(validateJavascriptDeclaredPrimitiveColumns(columns),columns);
  for(const patch of [{type:'variant'},{type:'__proto__'},{data_kind:'Дискретный'},
    {name:'bad name'},{label:'bad\nlabel'},{usage:'unknown'},{extra:true}]){
    assert.throws(()=>validateJavascriptDeclaredPrimitiveColumns([{...columns[0],...patch}]));
  }
  assert.throws(()=>validateJavascriptDeclaredPrimitiveColumns([]));
  assert.throws(()=>validateJavascriptDeclaredPrimitiveColumns([...columns,...columns]));
});

test('all five primitive types reach serialized owned picker admission with default kinds',()=>{
  for(const [type,kind,value,label] of [
    ['boolean','Дискретный',1,'Логический'],['datetime','Непрерывный',2,'Дата/Время'],
    ['real','Непрерывный',3,'Вещественный'],['integer','Непрерывный',4,'Целый'],
    ['string','Дискретный',5,'Строковый']]){
    const declared=[{...columns[0],type,data_kind:kind}];
    assert.equal(validateJavascriptDeclaredPrimitiveColumns(declared),declared);
    const code=makeJavascriptManagedDeclaredCode({...bound,columns:declared});
    assert.equal(typeof Function('return ('+code+')')(),'function');
    assert.ok(code.includes(JSON.stringify({value,label,kind})));
    assert.throws(()=>makeJavascriptManagedDeclaredCode({...bound,
      columns:[{...declared[0],data_kind:kind==='Непрерывный'?'Дискретный':'Непрерывный'}]}));
  }
});

test('serialized primitive type steps observe exact picker value and label before effects',async()=>{
  for(const [type,kind,value,label] of [
    ['boolean','Дискретный',1,'Логический'],['datetime','Непрерывный',2,'Дата/Время'],
    ['real','Непрерывный',3,'Вещественный'],['integer','Непрерывный',4,'Целый'],
    ['string','Дискретный',5,'Строковый']]){
    const declared=[{...columns[0],type,data_kind:kind}];
    const step={...bound,columns:declared,step:'type_open',gesture_id:'managed-js-test:declared-0-type_open'};
    const observations=[];
    const lease={identity:JSON.stringify([step.owner,step.workflow_ref,step.targetOrigin,step.targetBuild,step.deadline]),
      settingAttempted:true,wizardCaptured:{},handle:{},declared:{columns:JSON.stringify(declared),
        index:0,step:3,pending:{held:{}},attempted:new Set()}};
    const page={evaluate:async(fn,args)=>{
      if(!Object.hasOwn(args,'expectedType'))return {verified:true};
      observations.push(args);return {status:'ready',native_type:args.expectedType,label:args.expectedLabel};
    }};
    page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]=new Map([[step.operation_id,lease]]);
    const execute=Function('return ('+makeJavascriptManagedDeclaredCode(step)+')')();
    assert.deepEqual(await execute(page),{status:'ready',native_type:value,label});
    assert.equal(observations.length,1);
    assert.equal(observations[0].expectedType,value);assert.equal(observations[0].expectedLabel,label);
    delete lease.declared.prepared;
    page.evaluate=async(fn,args)=>Object.hasOwn(args,'expectedType')?{status:'refused'}:{verified:true};
    await assert.rejects(execute(page),/preflight refused/);
    assert.equal(lease.declared.attempted.size,0);
  }
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

test('declared transport covers a generated Apply settling after forty seconds without replay',async()=>{
  const started=Date.now(),owned={...task,deadline:started+180000};
  const declared=[{name:'Value',label:'Value',type:'integer',data_kind:'Непрерывный',usage:'Не задано'}];
  const expected={status:'ready',base:'editor'},gesture_id=owned.operation_id+':declared-0-apply';
  let elapsed=0,clicks=0,timeout;
  const lease={identity:JSON.stringify([owned.owner,owned.workflow_ref,owned.targetOrigin,owned.targetBuild,owned.deadline]),
    settingAttempted:true,wizardCaptured:{},handle:{},declared:{columns:JSON.stringify(declared),index:0,step:5,
      pending:{held:{dispose:async()=>{}}},context:{dispose:async()=>{}},attempted:new Set(),
      prepared:{gesture_id,observed:expected}}};
  const page={evaluate:async(fn,args)=>args?.phase==='applied'
    ?{status:elapsed<40000?'pending':'settled',reason:'ui_busy'}:args?.phase==='editing'?expected:{verified:true},
    waitForTimeout:async ms=>{elapsed+=ms;},locator:()=>({filter:()=>({click:async()=>{clicks++;}})})};
  page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]=new Map([[owned.operation_id,lease]]);
  const code=makeJavascriptManagedDeclaredCode({...owned,columns:declared,index:0,step:'apply',mode:'effect',
    expected,gesture_id,usage_value:0});
  const run=runInNewContext('('+code+')',{Date:{now:()=>started+elapsed},Symbol,Set,Map,JSON,TextEncoder});
  assert.equal((await run(page)).status,'SUCCEEDED');
  assert.equal(elapsed,40000);assert.equal(clicks,1);assert.equal(lease.declared.complete,true);
  await assert.rejects(run(page),/order or parameters changed/);assert.equal(clicks,1);
  await assert.rejects(dispatchManagedJavascriptDeclared({task:owned,columns:declared,
    execute:async(code,options)=>{if(options){timeout=options.timeout;throw Error('stop after admission');}
      return {status:'prepared'};},record:async event=>event,receiptOptions:()=>({})}),/stop after admission/);
  assert.ok(timeout>=180000&&timeout<=185000,`transport timeout ${timeout} must cover the original deadline`);
});
