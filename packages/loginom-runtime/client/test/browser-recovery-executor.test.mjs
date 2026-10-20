import test from 'node:test';
import assert from 'node:assert/strict';
import {NodeReleaseBlocked} from '../lib/node-pending-release.mjs';
import {fixture,request,stop} from './support/stopped-node-fixture.mjs';
import {proved} from './support/stopped-node-fixture.mjs';
import {browserRecoveryStepKey} from '../lib/browser-recovery-basis.mjs';
import {actions,Page,runtime} from './support/executor-fixture.mjs';
import {storageTidSuffix} from '../lib/storage-policy.mjs';
import {createActionRuntime,parseCapabilityResult} from '../lib/executor.mjs';
import {buildNodeReadRequest} from '../lib/node-read-contract.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';

const full={remaining:()=>({calls_remaining:30,ms_remaining:600000})};
const refuse=()=>{throw new NodeReleaseBlocked('A Loginom wizard of another node is open','Ask the user to close it with Cancel.');};

test('phase_stop stops after a verified finish and counts down',async()=>{
  const f=fixture({release:proved(),acceptanceFault:[{kind:'phase_stop',node_type:'imports.text',phase:'finish',code:'UI_SCAN_LIMIT',times:1}]});
  f.runtime.startNodeApply(request());
  const first=await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
  assert.equal(first.outcome.status,'AMBIGUOUS');
  assert.equal(first.outcome.output.pending_phase,'finish');
  assert.equal(first.outcome.error.cause.code,'UI_SCAN_LIMIT');
  assert.equal(f.calls.filter(call=>call==='finish').length,1);
  assert.deepEqual(f.events.filter(event=>event.phase==='acceptance_fault_injected').map(event=>({kind:event.kind,node_type:event.node_type,phase:event.target_phase,code:event.code,remaining:event.remaining})),
    [{kind:'phase_stop',node_type:'imports.text',phase:'finish',code:'UI_SCAN_LIMIT',remaining:0}]);
  await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  f.runtime.startNodeApply({...request(),operation_id:'again',target:{kind:'existing',type:'imports.text',ref:{document_id:'doc',workflow_id:'wf',node_id:'new'}}});
  const second=await f.runtime.waitNodeApply('again',{timeoutMs:1000});
  assert.equal(second.outcome.status,'SUCCEEDED');
  assert.equal(f.events.filter(event=>event.phase==='acceptance_fault_injected').length,1);
});

test('release_refusal blocks one native release and counts down',async()=>{
  const f=fixture({release:proved(),acceptanceFault:[{kind:'release_refusal',node_type:'imports.text',times:1}]});
  await stop(f,'finish');
  const first=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  assert.equal(first.error.code,'NODE_RELEASE_REFUSED');
  assert.equal(f.calls.filter(call=>call==='release:finish').length,0);
  assert.deepEqual(f.events.filter(event=>event.phase==='acceptance_fault_injected').map(event=>({kind:event.kind,node_type:event.node_type,remaining:event.remaining})),
    [{kind:'release_refusal',node_type:'imports.text',remaining:0}]);
  const second=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-2'});
  assert.equal(second.status,'SUCCEEDED');
  assert.equal(f.calls.filter(call=>call==='release:finish').length,1);
});
const saveWithReceipt=({receipt,now=Date.now,deadlineAt,onRecord,status='AMBIGUOUS',savedState,reconcile}={})=>{
  const key='package.save_checkpoint',revision=actions.get(key).revision;
  const outcome={status,action_key:key,action_revision:revision,operation_id:'save',
    phase:'applied',effect_possible:true,cleanup_complete:true,error:null,trace:[],output:{}};
  const engine=runtime(new Page(),{now,onRecord,browserRecovery:full,getStorageBinding:()=>({session_id:'session',document_id:'doc',loginom_account:'user',origin:'http://example.test',loginom_build:'7.4.2'}),execute:async (code,options)=>{
    if(code.includes('action_key:"browser.recovery.transport"'))return typedBoundaryResult(code,typeof savedState==='function'?await savedState(options):savedState);
    if(savedState&&code.includes('\"mode\":\"reconcile\"'))return reconcile?reconcile(outcome):outcome;
    const other=code.includes('"operation_id":"other"');
    if(code.includes('"receipt_read":true'))return {status:'SUCCEEDED',action_key:'operation.inspect',
      action_revision:'1',operation_id:'save',phase:'observed',effect_possible:false,error:null,trace:[],
      output:typeof receipt==='function'?receipt(outcome):receipt};
    if(code.includes('"receipt_namespace":'))return other?{...outcome,operation_id:'other',status:'AMBIGUOUS'}:outcome;
    return {...outcome,operation_id:other?'other':'save',status:'NOT_APPLIED',phase:'prepared',effect_possible:false,
      checkpoint:{document_id:'doc',workflow_ref:{workflow_id:'wf'}}};
  }});
  return engine.run(key,{path:'/user/a.lgp',conflict_policy:'replace'},
    {operationId:'save',...(deadlineAt===undefined?{}:{deadlineAt})}).then(()=>engine);
};

test('handoff waits for a running browser call without aborting it',async()=>{
  const key='package.save_checkpoint',revision=actions.get(key).revision;
  let release,entered;
  const controller=new AbortController();
  const dispatched=new Promise(resolve=>{entered=resolve;});
  const completed={status:'AMBIGUOUS',action_key:key,action_revision:revision,operation_id:'save',
    phase:'applied',effect_possible:true,cleanup_complete:true,error:null,trace:[],output:{}};
  const engine=runtime(new Page(),{now:Date.now,getStorageBinding:()=>({document_id:'doc'}),
    execute:async code=>{
      if(code.includes('"receipt_read":true'))return {status:'SUCCEEDED',action_key:'operation.inspect',
        action_revision:'1',operation_id:'save',phase:'observed',effect_possible:false,error:null,trace:[],
        output:{state:'completed',receipt:completed}};
      if(code.includes('"receipt_namespace":')){entered();await new Promise(resolve=>{release=resolve;});return completed;}
      return {...completed,status:'NOT_APPLIED',phase:'prepared',effect_possible:false,
        checkpoint:{document_id:'doc',workflow_ref:{workflow_id:'wf'}}};
    }});
  const running=engine.run(key,{path:'/user/a.lgp',conflict_policy:'replace'},
    {operationId:'save',signal:controller.signal});
  await dispatched;
  const handoff=engine.browserRecoveryHandoff('save',{pollMs:10});
  assert.equal(await Promise.race([handoff.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),30))]),false);
  release();await running;
  const proof=await handoff;
  assert.equal(proof.verified,true);
  assert.equal(controller.signal.aborted,false);
});

test('handoff waits for a running receipt to confirm browser cleanup',async()=>{
  let reads=0;
  const engine=await saveWithReceipt({receipt:outcome=>++reads===1?{state:'running'}:
    {state:'completed',receipt:outcome},deadlineAt:Date.now()+100});
  const proof=await engine.browserRecoveryHandoff('save',{pollMs:10});
  assert.equal(proof.verified,true);
  assert.equal(reads,2);
});

test('handoff rejects a browser receipt with a different identity',async()=>{
  const engine=await saveWithReceipt({receipt:{state:'identity_mismatch'}});
  assert.deepEqual(await engine.browserRecoveryHandoff('save',{pollMs:10}),
    {verified:false,reason:'RECEIPT_IDENTITY_MISMATCH'});
});

test('handoff of a released node does not cross a newer pending node',async()=>{
  const f=fixture({release:proved(),browserRecovery:full});
  await stop(f,'finish');
  await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  await stop(f,'finish',{operationId:'again',target:{kind:'existing',type:'imports.text',
    ref:{document_id:'doc',workflow_id:'wf',node_id:'new'}}});
  const before=f.runtime.nodeApplyStatus('again');
  assert.deepEqual(await f.runtime.browserRecoveryHandoff('apply',{pollMs:10}),
    {verified:false,reason:'UNRELATED_UNSETTLED_WORK'});
  assert.deepEqual(f.runtime.nodeApplyStatus('again'),before);
  assert.equal(f.runtime.hasUnsettledWork(),true);
});

test('handoff records its verified result',async()=>{
  const events=[];
  const engine=await saveWithReceipt({receipt:outcome=>({state:'completed',receipt:outcome}),
    onRecord:async event=>events.push(event)});
  const proof=await engine.browserRecoveryHandoff('save');
  assert.equal(proof.verified,true);
  assert.deepEqual(events.find(event=>event.phase==='browser_recovery_handoff')?.result,proof);
});

test('handoff reports journal failure without losing confirmed browser proof',async()=>{
  const engine=await saveWithReceipt({receipt:outcome=>({state:'completed',receipt:outcome}),
    onRecord:async event=>{if(event.phase==='browser_recovery_handoff')throw Error('Journal unavailable');}});
  const unsettled=engine.hasUnsettledWork();
  const proof=await engine.browserRecoveryHandoff('save');
  assert.equal(proof.verified,true);
  assert.equal(proof.receipt_id,'save');
  assert.match(proof.journal_error,/Journal unavailable/);
  assert.equal(engine.hasUnsettledWork(),unsettled);
});

test('handoff reports refusal journal failure after a newer operation becomes pending',async()=>{
  let engine,handoffs=0;
  engine=await saveWithReceipt({status:'NOT_APPLIED',receipt:outcome=>({state:'completed',receipt:outcome}),
    onRecord:async event=>{
      if(event.phase!=='browser_recovery_handoff')return;
      if(++handoffs===1){
        await engine.run('package.save_checkpoint',{path:'/user/b.lgp',conflict_policy:'replace'},{operationId:'other'});
        return;
      }
      throw Error('Refusal journal unavailable');
    }});
  const proof=await engine.browserRecoveryHandoff('save');
  assert.equal(proof.verified,false);
  assert.equal(proof.reason,'UNRELATED_UNSETTLED_WORK');
  assert.match(proof.journal_error,/Refusal journal unavailable/);
  assert.equal(engine.hasUnsettledWork(),true);
});

test('handoff bounds receipt polling by the original deadline and one minute',async()=>{
  let clock=0,reads=0;
  const engine=await saveWithReceipt({now:()=>clock,deadlineAt:600000,receipt:()=>{
    reads++;clock+=20000;return {state:'running'};
  }});
  assert.deepEqual(await engine.browserRecoveryHandoff('save',{pollMs:1}),
    {verified:false,reason:'RECEIPT_UNSETTLED'});
  assert.equal(reads,3);
  assert.equal(clock,60000);
});

test('handoff does not accept a completed receipt outside the original deadline',async()=>{
  let clock=0,reads=0;
  const expired=await saveWithReceipt({now:()=>clock,deadlineAt:100,receipt:outcome=>{
    reads++;return {state:'completed',receipt:outcome};
  }});
  clock=101;
  assert.deepEqual(await expired.browserRecoveryHandoff('save'),
    {verified:false,reason:'RECEIPT_UNSETTLED'});
  assert.equal(reads,0);

  clock=0;
  const late=await saveWithReceipt({now:()=>clock,deadlineAt:100,receipt:outcome=>{
    reads++;clock=101;return {state:'completed',receipt:outcome};
  }});
  assert.deepEqual(await late.browserRecoveryHandoff('save'),
    {verified:false,reason:'RECEIPT_UNSETTLED'});

  clock=0;
  const journalLate=await saveWithReceipt({now:()=>clock,deadlineAt:100,
    receipt:outcome=>({state:'completed',receipt:outcome}),
    onRecord:async event=>{if(event.phase==='browser_recovery_handoff')clock=101;}});
  assert.deepEqual(await journalLate.browserRecoveryHandoff('save'),
    {verified:false,reason:'RECEIPT_UNSETTLED'});
});

test('handoff refuses a missing receipt or incomplete browser cleanup',async()=>{
  const f=fixture({browserRecovery:full});await stop(f,'finish');
  assert.deepEqual(await f.runtime.browserRecoveryHandoff('apply'),
    {verified:false,reason:'RECEIPT_MISSING'});
  const engine=await saveWithReceipt({receipt:outcome=>({state:'completed',receipt:{...outcome,cleanup_complete:false}})});
  assert.deepEqual(await engine.browserRecoveryHandoff('save'),
    {verified:false,reason:'RECEIPT_UNSETTLED'});
});

test('handoff waits for a running node even when it has no browser receipt yet',async()=>{
  const f=fixture({browserRecovery:full});
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;});
  f.drivers.finish=async()=>{entered();await new Promise(resolve=>{release=resolve;});
    return {verified:true,cleanup_complete:true,effect_possible:true,execution_id:'exec',execution_started:true};};
  f.runtime.startNodeApply(request());await started;
  const handoff=f.runtime.browserRecoveryHandoff('apply',{pollMs:10});
  assert.equal(await Promise.race([handoff.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),30))]),false);
  release();await f.runtime.waitNodeApply('apply',{timeoutMs:1000});
  assert.deepEqual(await handoff,{verified:false,reason:'RECEIPT_MISSING'});
});

test('cancelling the handoff wait does not cancel the browser operation',async()=>{
  const controller=new AbortController();
  const engine=await saveWithReceipt({deadlineAt:Date.now()+100,receipt:()=>{
    setTimeout(()=>controller.abort(Error('Handoff cancelled')),5);
    return {state:'running'};
  }});
  await assert.rejects(engine.browserRecoveryHandoff('save',{signal:controller.signal,pollMs:10}),
    /Handoff cancelled/);
  assert.equal(engine.hasUnsettledWork(),true);
});

test('refused release offers browser recovery instead of a user action when enabled',async()=>{
  const f=fixture({release:refuse,browserRecovery:full});await stop(f,'finish');
  const refused=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  assert.equal(refused.error.code,'NODE_RELEASE_REFUSED');
  assert.equal(refused.output.user_action,undefined);
  assert.deepEqual(refused.output.browser_recovery.next_step.arguments,{action:'start',operation_id:'apply'});
  assert.equal(refused.output.browser_recovery.next_step.trigger,'T1');
  assert.deepEqual(refused.output.browser_recovery.basis.input.used_recovery,['abandon_operation']);
  assert.equal(f.events.filter(e=>e.phase==='browser_recovery_basis').length,1);
});

test('without the option the refusal still names the user action',async()=>{
  const f=fixture({release:refuse});await stop(f,'finish');
  const refused=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  assert.equal(refused.output.user_action,'Ask the user to close it with Cancel.');
  assert.equal(refused.output.browser_recovery,undefined);
  assert.equal(f.events.some(e=>e.phase==='browser_recovery_basis'),false);
});

test('inspect of a stopped phase without a release driver offers T2',async()=>{
  const f=fixture({browserRecovery:full});await stop(f,'finish');
  const view=(await f.runtime.inspect({operationId:'apply'})).output;
  assert.deepEqual(view.recovery_options,[]);
  assert.equal(view.browser_recovery.next_step.trigger,'T2');
  assert.deepEqual(f.runtime.browserRecoveryBasis('apply').step,view.browser_recovery.basis.step);
});

test('direct node apply outcome carries its recovery step',async()=>{
  const f=fixture({browserRecovery:full});
  f.drivers.finish=async()=>{throw Error('Local node cancellation requested');};
  const outcome=await f.runtime.runNodeApply(request());
  assert.equal(outcome.output.browser_recovery.next_step.trigger,'T2');
});

test('basis journal failure preserves the stopped node outcome',async()=>{
  const f=fixture({browserRecovery:full,basisRecordError:Error('Basis journal unavailable')});
  f.drivers.finish=async()=>{throw Error('Local node cancellation requested');};
  const outcome=await f.runtime.runNodeApply(request());
  assert.equal(outcome.status,'AMBIGUOUS');
  assert.equal(outcome.output.browser_recovery.next_step.trigger,'T2');
  assert.match(outcome.output.browser_recovery.journal_error,/Basis journal unavailable/);
});

test('recovery input omits a request above the byte limit',async()=>{
  const f=fixture({browserRecovery:full});
  f.drivers.finish=async()=>{throw Error('Local node cancellation requested');};
  const outcome=await f.runtime.runNodeApply({...request(),parameters:{payload:'x'.repeat(17000)}});
  const input=outcome.output.browser_recovery.basis.input;
  assert.equal(input.request,undefined);
  assert.equal(input.request_omitted,true);
});

test('basis is unavailable while a retry of the release is executing',async()=>{
  let release=refuse;
  const f=fixture({browserRecovery:full,release:state=>release(state)});
  await stop(f,'finish');
  await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  let enter,finish;
  const entered=new Promise(resolve=>{enter=resolve;});
  release=async state=>{enter();await new Promise(resolve=>{finish=resolve;});return proved()(state);};
  const running=f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-2'});
  await entered;
  const activeBasis=f.runtime.browserRecoveryBasis('apply');
  finish();
  const outcome=await running;
  assert.equal(activeBasis,null);
  assert.equal(outcome.output.original_outcome.output.browser_recovery.next_step.trigger,'T4');
});

test('the same phase failing with the same cause on the existing node offers T3',async()=>{
  const f=fixture({release:proved(),browserRecovery:full});
  await stop(f,'finish',{cause:'UI_SCAN_LIMIT'});
  await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  const again=await stop(f,'finish',{cause:'UI_SCAN_LIMIT',operationId:'again',
    target:{kind:'existing',type:'imports.text',ref:{document_id:'doc',workflow_id:'wf',node_id:'new'}}});
  const offer=again.outcome.output.browser_recovery;
  assert.equal(offer.next_step.trigger,'T3');
  assert.equal(browserRecoveryStepKey(offer.basis.step),
    browserRecoveryStepKey({kind:'node',document_id:'doc',workflow_id:'wf',node_id:'new',phase:'finish'}));
});

test('a release from a launch phase offers T4 for the unknown execution',async()=>{
  const f=fixture({release:proved(),browserRecovery:full});await stop(f,'finish');
  const released=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  assert.equal(released.output.original_outcome.output.execution.status,'unknown');
  assert.equal(released.output.original_outcome.output.browser_recovery.next_step.effect,'execution');
});

test('a successful release supersedes an earlier refusal on the same phase',async()=>{
  let release=refuse;
  const f=fixture({release:state=>release(state),browserRecovery:full});await stop(f,'finish');
  const refused=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  const refusedKey=browserRecoveryStepKey(refused.output.browser_recovery.basis.step);
  release=proved();
  const released=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-2'});
  const offer=released.output.original_outcome.output.browser_recovery;
  assert.equal(offer.next_step.trigger,'T4');
  assert.equal(offer.basis.step.phase,'finish');
  assert.equal(browserRecoveryStepKey(offer.basis.step),refusedKey);
  assert.equal(f.runtime.browserRecoveryBasis('apply').trigger,'T4');
});

test('a pending second node removes historical recovery offers from every reply',async()=>{
  const f=fixture({release:proved(),browserRecovery:full});
  await stop(f,'finish');
  await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
  await stop(f,'finish',{operationId:'again',target:{kind:'existing',type:'imports.text',
    ref:{document_id:'doc',workflow_id:'wf',node_id:'new'}}});
  assert.equal(f.runtime.browserRecoveryBasis('apply'),null);
  const status=f.runtime.nodeApplyStatus('apply');
  const waited=await f.runtime.waitNodeApply('apply',{timeoutMs:0});
  const inspected=(await f.runtime.inspect({operationId:'apply'})).output;
  assert.equal(status.outcome.output.browser_recovery,undefined);
  assert.equal(waited.outcome.output.browser_recovery,undefined);
  assert.equal(inspected.outcome.output.browser_recovery,undefined);
  assert.notEqual(compactNodeResult(status).next_step?.tool,'dock_browser_recovery');
});

test('an exhausted step budget leaves an instruction without a tool',async()=>{
  const f=fixture({browserRecovery:{remaining:()=>({calls_remaining:0,ms_remaining:120000})}});
  await stop(f,'finish');
  const next=(await f.runtime.inspect({operationId:'apply'})).output.browser_recovery.next_step;
  assert.equal(next.tool,undefined);
  assert.match(next.instruction,/Бюджет/);
});

test('an ambiguous Save gains T4 only after inspect and keeps it for start',async()=>{
  const key='package.save_checkpoint',revision=actions.get(key).revision;
  let calls=0;
  const engine=runtime(new Page(),{browserRecovery:full,getStorageBinding:()=>({document_id:'doc'}),
    execute:async()=>{
      const phase=++calls===1?'prepared':calls===2?'applied':'reconciled';
      return {status:phase==='prepared'?'NOT_APPLIED':'AMBIGUOUS',action_key:key,action_revision:revision,
        operation_id:'save',phase,effect_possible:phase!=='prepared',cleanup_complete:true,error:null,trace:[],
        output:{},...(phase==='prepared'?{checkpoint:{document_id:'doc',workflow_ref:{workflow_id:'wf'}}}:{})};
    }});
  await engine.run(key,{path:'/user/a.lgp',conflict_policy:'replace'},{operationId:'save'});
  assert.equal(engine.browserRecoveryBasis('save'),null);
  const inspected=(await engine.inspect({operationId:'save'})).output.browser_recovery;
  assert.equal(inspected.next_step.effect,'save');
  assert.deepEqual(engine.browserRecoveryBasis('save').step,inspected.basis.step);
  assert.equal(calls,3);
});

test('Save loses its basis during a second reconcile and regains it after completion',async()=>{
  const key='package.save_checkpoint',revision=actions.get(key).revision;
  let calls=0,entered,finish;
  const browserEntered=new Promise(resolve=>{entered=resolve;});
  const engine=runtime(new Page(),{browserRecovery:full,getStorageBinding:()=>({document_id:'doc'}),
    execute:async()=>{
      const call=++calls;
      if(call===4){entered();await new Promise(resolve=>{finish=resolve;});}
      return {status:call===1?'NOT_APPLIED':'AMBIGUOUS',action_key:key,action_revision:revision,
        operation_id:'save',phase:call===1?'prepared':'reconciled',effect_possible:call!==1,
        cleanup_complete:true,error:null,trace:[],output:{},
        ...(call===1?{checkpoint:{document_id:'doc',workflow_ref:{workflow_id:'wf'}}}:{})};
    }});
  await engine.run(key,{path:'/user/a.lgp',conflict_policy:'replace'},{operationId:'save'});
  await engine.inspect({operationId:'save'});
  assert.equal(engine.browserRecoveryBasis('save').trigger,'T4');
  const inspecting=engine.inspect({operationId:'save'});
  await browserEntered;
  const during=engine.browserRecoveryBasis('save');
  finish();
  const after=await inspecting;
  assert.equal(during,null);
  assert.equal(after.output.browser_recovery.next_step.effect,'save');
  assert.equal(engine.browserRecoveryBasis('save').trigger,'T4');
  assert.equal(calls,4);
});

async function typedBoundaryResult(code,value) {
 const start=code.indexOf('output:{value:await ('),suffix=code.lastIndexOf(')(page)}};');
 assert.ok(start>=0&&suffix>start,'fixed readers must use the typed transport');
 const wrapped=code.slice(0,start)+'output:{value:await (async()=>value'+code.slice(suffix);
 const response=await new Function('value','return ('+wrapped+')(null)')(value);
 return parseCapabilityResult({content:[{type:'text',text:JSON.stringify(response)}]});
}

// Transport-boundary fixture: the real channel, console and Preview procedures
// consume the same observations as their focused procedure tests.
async function verificationFixture({onRecord,nodeType,shortVerificationClock=false,receiptExpired=false,lostDownload=false,lostPreview=false,previewRefused=false,busy=false,changedAfterPreview=false,released=false,exportFile=false,exportCheck={verified:true,destination:'/user/result.csv',existed:false}}={}) {
 const node={document_id:'doc',workflow_id:'wf',node_id:'new'},workflow=request().workflow_ref;
 const context={...node,verified:true,surface:'graph',locked:false,tid:'graph-node'};
 const calls=[],events=[],gestures=[],receipts=new Map();
 let opened=false,selected=false,shown=false,preview=false,operation,files=false,exportBinding,closedPreview=false;
 const retained=[],downloads=[],timeouts=[];let clockOffset=0;
 const started=Date.now();
 const el=(tid,allowed_actions=['click'])=>({tid,ref:'ui-'+Buffer.from(tid).toString('hex'),allowed_actions,signature:{tid}});
 const port={index:0,port_guid:'port-0',tid:'MF;TF-1;Graph;Source;Output_Data-0',active:true};
 const state=()=>({origin:'http://example.test',loginom_build:'7.4.2',workflow_ref:files?{workflow_id:'files',prefix:'MF;TF-2',tab_tid:'files-tab'}:workflow,authenticated:true,
  file_storage:files?{status:'observed',directory:'/user'}:undefined,
  dom_epoch:{document:'doc',revision:1},scan:{complete:true},prepared_node_context:context,
  wizard:{status:'absent'},nodes:[{node_ref:{workflow_ref:workflow,node_label:'Source'},bounding_box:{x:0,y:0,width:10,height:10},ports:[{tid:port.tid,ui_ref:el(port.tid).ref}]}],navigation_context:{status:'observed'},ui:{masks:[],dialogs:busy?[{ref:'ui-foreign',identity:{anchor_tid:'foreign'}}]:[],
   truncated:{elements:false,masks:false,dialogs:false},elements:[el('MF;TF-1;ModelForm;cmpDiagram'),el('MF;cntMain;tlbMainToolbar'),
    el('MF;cntMain;tlbMainToolbar;btnFilestorage'),el('MF;cntMain;cntWorkspace;Workspace;t.br'),el(workflow.tab_tid),el('files-tab'),
    el('MF;TF-2;NavigationBar;NavigationPanel'),el('MF;TF-2;FileStorageForm;btnRefresh'),
    el('MF;TF-2;FileStorageForm;pnlFileStorage;tbl'),
    {...el('MF;TF-2;FileStorageForm;colName_'+storageTidSuffix('result.csv'),['click','double_click']),label:'result.csv',storage_entry:{bytes:57}},
    el('MF;TF-1;NavigationBar;NavigationPanel'),el('MF;cntMain;tlbMainToolbar;btnProgress'),{...el(port.tid,['click','press']),kind:'port'},
    ...(opened?[el('ConsoleForm'),el('ConsoleForm;ProgressForm;trpProgress;grd;tbl',['right_click']),
     el('ConsoleForm;btnClose'),el('child-row',['right_click'])]:[]),
    ...(selected?[el('mnContextMenu;mniShowNodeToProcess',['show_process_node'])]:[]),
    ...(preview?[el('MF;TF-1;ModelForm;PreviewWindow'),el('MF;TF-1;ModelForm;PreviewWindow;p.h;close')]:[])]}});
 const outcome=(output,operation_id='read',action_key='workspace.observe')=>({status:'SUCCEEDED',action_key,
  action_revision:'1',operation_id,phase:'observed',effect_possible:false,cleanup_complete:true,error:null,trace:[],output});
 const execute=async (code,options)=>{
  if(shortVerificationClock&&clockOffset)timeouts.push(options?.timeout);
  if(code.includes('"receipt_read":true')){
   if(receiptExpired)clockOffset=240001;
   const id=JSON.parse(code.match(/"receipt_id":("[^"]+")/)[1]);
   return parseCapabilityResult({content:[{type:'text',text:JSON.stringify(outcome(receipts.has(id)?{state:'completed',receipt:receipts.get(id)}:{state:'running'}))}]});
  }
  const start=code.indexOf('output:{value:await (');
  assert.ok(start>=0,'fixed readers must use the typed transport');
  let value;
  const action=code.match(/"action":(\{"verb":[^}]+\})/);
  if(code.includes('async function browserArtifactDownload')){
   const id=JSON.parse(code.match(/\"receipt_id\":(\"[^\"]+\")/)[1]);
   downloads.push(id);if(lostDownload)throw Error('Download response lost');
   value=outcome({destination:'/user/result.csv',artifact_id:'artifact',download_completed:true,output_binding:exportBinding,suggested_name:'result.csv'},id,'artifact.download');
   receipts.set(id,value);
  }else if(action){
   const a=JSON.parse(action[1]);a.ref=Buffer.from(a.ref.slice(3),'hex').toString();gestures.push(a);
   if(a.ref==='MF;cntMain;tlbMainToolbar;btnFilestorage')files=true;
   if(a.ref===workflow.tab_tid)files=false;
   if(a.ref==='MF;cntMain;tlbMainToolbar;btnProgress')opened=true;
   if(a.ref==='ConsoleForm;btnClose')opened=false;
   if(a.ref==='child-row')selected=true;
   if(a.verb==='show_process_node')shown=true;
   if(a.key==='F3'){preview=true;if(lostPreview)throw Error('Preview transport lost');}
   if(a.ref.endsWith(';p.h;close')){preview=false;closedPreview=true;}
   const id=JSON.parse(code.match(/"receipt_id":("[^"]+")/)[1]);
   value=outcome(state(),id,'ui.act');
   if(a.key==='F3'&&previewRefused){preview=false;value={...value,status:'NOT_APPLIED',error:{code:'PREVIEW_NOT_OPEN',message:'Preview did not open'}};}
   receipts.set(id,value);
  }else if(code.includes('function readNodeProcesses('))value={verified:true,inventory_complete:true,show_completed:true,
   root_id:'root',node_context:context,processes:[
    {process_id:'1',record_id:'group',parent_id:null,state:'completed',error:false,children_loaded:true,expanded:true,rendered:true},
    {process_id:'1.1',record_id:'child',parent_id:'1',state:'completed',error:false,rendered:true,selected,process_tid:'child-row'}]};
  else if(code.includes('function readOutputContext('))value={verified:true,node_selected:shown,ports:[port]};
  else if(code.includes('function readNodePreviewSchema('))value={verified:preview,inventory_complete:true,port:0,
   port_guid:port.port_guid,node_id:node.node_id,root_tid:'MF;TF-1;ModelForm;PreviewWindow',fields:[{index:0,record_id:'field',name:'value',label:'Value',type:'integer'}]};
  else if(code.includes('output:{value:await (async page=>(async function readPreparedNodeContext'))value=files?{verified:false}:context;
  else value=outcome(state());
  return typedBoundaryResult(code,value);
 };
 const ok=name=>async()=>{calls.push(name);return {verified:true,cleanup_complete:true,effect_possible:false};};
 const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref:node,type:'imports.text',label:'Source',position:{x:320,y:280},inputs:[],outputs:[0]}],links:[],foreign_links:[]};
 const engine=createActionRuntime({pinned:{actions,selectors:new Map(),pins:{}},allowCandidate:true,browserRecovery:full,now:()=>(shortVerificationClock?started:Date.now())+clockOffset,
  getStorageBinding:()=>({directories:{packages:'/user',inputs:'/user',exports:'/user'}}),
  artifactStore:{outputSessionId:'session',stageOutput:async binding=>{exportBinding=binding;return {artifact_id:'artifact',path:'/private/result.csv',
   verify:async(name,bytes)=>{assert.equal(name,'result.csv');assert.equal(bytes,57);return {artifact_id:'artifact',bytes,sha256:'abc'};},
   retain:async()=>retained.push(binding),release:async()=>{}};}},
  execute,targetOrigin:'http://example.test',targetBuild:'7.4.2',onRecord:async e=>{
   if(shortVerificationClock&&e.phase==='node_step_prepared')clockOffset=239900;
   events.push(e);return onRecord?onRecord(e):e;},
  nodeTargetAdapterFactory:()=>({observe:async()=>{if(changedAfterPreview&&closedPreview)throw Error('Final graph changed');return structuredClone(graph);},preflight:async()=>{}}),
  nodeApplyHandlers:new Map([[nodeType??(exportFile?'exports.text':'imports.text'),{revision:'1',modes:['delimited'],validate:()=>{},
   configure:exportFile?async()=>({verified:true,cleanup_complete:true,configuration:{configured:{destination_check:exportCheck}}}):ok('configure')}]]),
  nodeApplyDriverFactory:options=>{operation=options.operation;return {verifySource:ok('source'),mapPorts:ok('mapping'),openWizard:ok('open'),
   finishGraph:async()=>{calls.push('read-execute');return {verified:true,cleanup_complete:true,mode:'execute',execution_id:'fresh-read',settings_applied:false};},
   waitExecution:async()=>({verified:true,cleanup_complete:true,status:'completed',execution_id:'fresh-read'}),
   readOutput:async read=>({verified:true,cleanup_complete:true,status:'complete',execution_id:'fresh-read',evidence_ref:'fresh-read:output',
    ports:read.ports.map(port=>({port,fresh:true,schema:[{index:0,name:'value',label:'Value',type:'integer'}],sample:[],sample_complete:true}))}),
   verifyContinuation:async()=>true,...(released?{releasePending:async()=>proved()()}:{}),
   finish:async()=>{calls.push('finish');operation.nodeApply.execution_baseline={root_id:'root',node,roots:[]};throw Error('Local node cancellation requested');}};}});
 graph.nodes[0].type=nodeType??(exportFile?'exports.text':'imports.text');
 engine.startNodeApply({...request(),target:{kind:'existing',type:nodeType??(exportFile?'exports.text':'imports.text'),ref:node},
  ...(exportFile?{parameters:{destination:'/user/result.csv',overwrite:exportCheck?.overwrite??'reject'}}:{})});
 await engine.waitNodeApply('apply',{timeoutMs:1000});
 if(released)await engine.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'released'});
 return {runtime:engine,calls,events,gestures,operation,retained,receipts,downloads,timeouts};
}

test('an executed step is completed only with its verified schema',async()=>{
 const f=await verificationFixture();
 const before=[...f.calls];
 const result=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-1',sequence:1});
 assert.deepEqual([result.facts.execution?.verified,result.facts.output_schema?.verified,result.decision.result],
  [true,true,'completed'],JSON.stringify(result));
 assert.deepEqual(f.calls,before);
 assert.equal(result.verification_id,'br-1:v1');
});

test('a released T4 keeps the pending gate after an unconfirmed verification gesture',async()=>{
 const f=await verificationFixture({lostPreview:true,released:true});
 assert.equal(f.runtime.hasUnsettledWork(),false);
 const result=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-1',sequence:1});
 assert.equal(result.unconfirmed,true);
 assert.equal(f.runtime.hasUnsettledWork(),true);
 const count=f.gestures.length;
 await assert.rejects(f.runtime.recover(result.verification_id,{strategy:'abandon_operation',recoveryOperationId:'verify-release'}),/durable receipt/);
 await assert.rejects(f.runtime.uiAct({verb:'click',ref:'ui-unused'},{operationId:'repair',recoveryOperationId:result.verification_id}),/durable receipt/);
 await f.runtime.run('package.save_checkpoint',{path:'/user/a.lgp',conflict_policy:'replace'},{operationId:'new-save'});
 await assert.rejects(f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'again'}));
 await f.runtime.inspect();
 assert.equal(f.runtime.hasUnsettledWork(),true);
 assert.equal(f.gestures.length,count);
 await assert.rejects(f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-1',sequence:2}));
});

test('Save verifies the bound package through typed transport and MCP parsing without gestures',async()=>{
 const savedState={version:1,session_id:'session',document_id:'doc',account:'user',package_path:'/user/a.lgp',
  modified:false,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
 const engine=await saveWithReceipt({savedState,receipt:outcome=>({state:'completed',receipt:outcome})});
 await engine.inspect({operationId:'save'});
 const result=await engine.verifyBrowserRecovery('save',{attemptId:'br-save',sequence:1});
 assert.deepEqual([result.facts.saved_package.verified,result.unconfirmed,result.decision.result],[true,false,'completed']);
 assert.equal(engine.hasUnsettledWork(),true);
 assert.throws(()=>parseCapabilityResult({content:[{type:'text',text:JSON.stringify(savedState)}]}),/no typed result/);
});

test('export verifies the file with this pass execution and fresh deadline through typed transport',async()=>{
 const f=await verificationFixture({exportFile:true});
 f.operation.deadline=Date.now()-1;
 const result=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-export',sequence:1});
 assert.equal(result.facts.execution.verified,true,JSON.stringify(result.facts));
 assert.equal(result.facts.export_file?.verified,true,JSON.stringify(result.facts));
 assert.equal(result.decision.result,'completed');
 assert.equal(result.unconfirmed,false);
 assert.equal(f.retained[0].execution_id,result.facts.execution.execution_id);
 assert.equal(result.facts.export_file.verification_id,'br-export:v1:export-download');
});

test('an executed step whose Preview did not open stays unresolved',async()=>{
 const f=await verificationFixture({previewRefused:true});
 const result=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-1',sequence:1});
 assert.deepEqual([result.facts.execution.verified,result.facts.output_schema.verified,result.decision.result,result.unconfirmed],
  [true,false,'unresolved',false]);
 assert.equal(f.gestures.filter(a=>a.key==='F3').length,1);
});

test('an older execution group never completes a step',async()=>{
 const f=await verificationFixture();
 f.operation.nodeApply.execution_baseline.roots=[{process_id:'1',record_id:'group',completed:true}];
 const result=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-old',sequence:1});
 assert.deepEqual([result.facts.execution.reason,result.decision.result],['NO_NEW_EXECUTION','continuable']);
 assert.equal(f.gestures.some(a=>a.key==='F3'),false);
});

test('a busy workspace does no verification gestures and remains unresolved',async()=>{
 const f=await verificationFixture({busy:true});
 const result=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-busy',sequence:1});
 assert.deepEqual([result.facts.workspace.verified,result.unconfirmed,result.decision.result],[false,false,'unresolved']);
 assert.equal(result.facts.workspace.user_action,undefined);
 assert.deepEqual(f.gestures,[]);
 assert.equal(f.runtime.hasUnsettledWork(),true);
});

for(const released of [false,true])test('repeated finish replaces only its confirmed verification without replaying failed drivers: '+released,async()=>{
 const f=await verificationFixture({released});
 const before=[...f.calls];
 const first=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-repeat',sequence:1});
 assert.equal(f.runtime.hasUnsettledWork(),true);
 await assert.rejects(f.runtime.verifyBrowserRecovery('apply',{attemptId:'another',sequence:2}));
 await assert.rejects(f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-repeat',sequence:1}));
 const second=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-repeat',sequence:2});
 assert.deepEqual([first.verification_id,second.verification_id],['br-repeat:v1','br-repeat:v2']);
 assert.deepEqual([first.decision.result,second.decision.result],['completed','completed']);
 assert.deepEqual(f.calls,before);
 assert.ok([...f.receipts.keys()].some(id=>id.startsWith('br-repeat:v1:')));
 assert.ok([...f.receipts.keys()].some(id=>id.startsWith('br-repeat:v2:')));
 await f.runtime.inspect();
 assert.equal(f.runtime.hasUnsettledWork(),true);
});

for(const [name,exportCheck,result] of [
 ['existing reject',{verified:true,destination:'/user/result.csv',existed:true,overwrite:'reject'},'unresolved'],
 ['missing reject',null,'unresolved'],['missing replace',{overwrite:'replace'},'continuable'],
])test('unproved export destination is not fresh: '+name,async()=>{
 const f=await verificationFixture({exportFile:true,exportCheck});
 const checked=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-export',sequence:1});
 assert.deepEqual([checked.facts.export_file.verified,checked.decision.result],[false,result]);
 assert.equal(f.gestures.some(a=>a.ref.endsWith('btnFilestorage')),false);
 assert.deepEqual(f.retained,[]);
});

test('a missing baseline permits no execution or Preview gestures',async()=>{
 const f=await verificationFixture();
 delete f.operation.nodeApply.execution_baseline;
 const result=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-empty',sequence:1});
 assert.deepEqual([result.facts.execution.reason,result.decision.result],['NO_BASELINE','continuable']);
 assert.deepEqual(f.gestures,[]);
});

test('the final workspace proof overrides the quiet graph before the passes',async()=>{
 const f=await verificationFixture({changedAfterPreview:true});
 const result=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-changed',sequence:1});
 assert.deepEqual([result.facts.execution.verified,result.facts.output_schema.verified,result.facts.workspace.verified,result.decision.result],
  [true,true,false,'unresolved']);
});

test('every requested output port must have a verified schema',async()=>{
 const f=await verificationFixture();
 f.operation.nodeApply.request.read.ports=[0,1];
 const result=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-ports',sequence:1});
 assert.deepEqual([result.facts.execution.verified,result.facts.output_schema.verified,result.decision.result],[true,false,'unresolved']);
 assert.match(result.facts.output_schema.reason,/Active exact output required/);
});

for(const mutation of [{modified:true},{package_path:'/user/other.lgp'}])test('Save cannot complete with '+JSON.stringify(mutation),async()=>{
 const savedState={version:1,session_id:'session',document_id:'doc',account:'user',package_path:'/user/a.lgp',
  modified:false,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false,...mutation};
 const engine=await saveWithReceipt({savedState,receipt:outcome=>({state:'completed',receipt:outcome})});
 await engine.inspect({operationId:'save'});
 const result=await engine.verifyBrowserRecovery('save',{attemptId:'br-save',sequence:1});
 assert.deepEqual([result.facts.saved_package.verified,result.unconfirmed,result.decision.result],[false,false,'unresolved']);
});

test('verification never crosses a newer pending operation',async()=>{
 const f=fixture({release:proved(),browserRecovery:full});
 await stop(f,'finish');
 await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'release-1'});
 await stop(f,'finish',{operationId:'other',target:{kind:'existing',type:'imports.text',ref:{document_id:'doc',workflow_id:'wf',node_id:'new'}}});
 const before=f.runtime.nodeApplyStatus('other');
 await assert.rejects(f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-1',sequence:1}),/basis unavailable/);
 assert.deepEqual(f.runtime.nodeApplyStatus('other'),before);
});

test('a receipt arriving after the verification deadline cannot confirm its gesture',async()=>{
 const f=await verificationFixture({receiptExpired:true,released:true});
 const result=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-late',sequence:1});
 assert.equal(result.unconfirmed,true);
 assert.equal(f.runtime.hasUnsettledWork(),true);
});

test('concurrent Save inspectors cannot release verification with a late old success',async()=>{
 const saved={version:1,session_id:'session',document_id:'doc',account:'user',package_path:'/user/a.lgp',
  modified:false,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
 const replies=[];let releaseReader,readerEntered;
 const reading=new Promise(resolve=>{readerEntered=resolve;});
 const engine=await saveWithReceipt({savedState:async()=>{readerEntered();return new Promise(resolve=>{releaseReader=()=>resolve(saved);});},
  reconcile:outcome=>new Promise(resolve=>{replies.push(status=>resolve({...outcome,status,...(status==='SUCCEEDED'?{output:{
   package_ref:{kind:'package',path:'/user/a.lgp',active_identity:'/user/a.lgp'},reopened:false,workflow_preserved:true,
   save_completed:true,persisted_content_verified:false}}:{})}));})});
 const first=engine.inspect({operationId:'save'}),second=engine.inspect({operationId:'save'});
 replies[0]('AMBIGUOUS');await first;
 const verification=engine.verifyBrowserRecovery('save',{attemptId:'br-overlap',sequence:1});
 await reading;
 replies[1]?.('SUCCEEDED');await second;
 releaseReader();const result=await verification;
 assert.equal(result.decision.result,'completed');
 assert.equal(engine.hasUnsettledWork(),true,'late original reconcile must not clear the verification gate');
 assert.equal(replies.length,1,'a concurrent inspect returns the current snapshot without another browser call');
});

test('an unknown export download retains its receipt and forbids replacement',async()=>{
 const f=await verificationFixture({exportFile:true,lostDownload:true,
  exportCheck:{verified:true,destination:'/user/result.csv',existed:false,overwrite:'replace'}});
 const first=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-lost-export',sequence:1});
 assert.equal(first.unconfirmed,true,JSON.stringify({unconfirmed:first.unconfirmed,decision:first.decision.result,
  returned:f.gestures.some(a=>a.ref===request().workflow_ref.tab_tid),downloads:f.downloads}));
 assert.equal(f.runtime.hasUnsettledWork(),true);
 await assert.rejects(f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-lost-export',sequence:2}),/remains unsettled/);
 assert.deepEqual(f.downloads,['br-lost-export:v1:export-download']);
 assert.equal(f.gestures.some(a=>a.ref===request().workflow_ref.tab_tid),false,'unknown download cannot authorize cleanup navigation');
});

test('a late Save reader stays unverified without inventing an unknown gesture',async()=>{
 let clock=0;
 const engine=await saveWithReceipt({now:()=>clock,savedState:async()=>{
  clock=240001;
  return {version:1,session_id:'session',document_id:'doc',account:'user',package_path:'/user/a.lgp',modified:false,
   observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
 }});
 await engine.inspect({operationId:'save'});
 const result=await engine.verifyBrowserRecovery('save',{attemptId:'br-late-save',sequence:1});
 assert.deepEqual([result.facts.saved_package.verified,result.decision.result,result.unconfirmed],[false,'unresolved',false]);
 assert.equal(engine.hasUnsettledWork(),true);
});

test('short verification budget refuses a prepared gesture without inventing an unknown receipt',async()=>{
 const f=await verificationFixture({shortVerificationClock:true});
 const result=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-short',sequence:1});
 assert.ok(f.events.some(e=>e.phase==='node_step_prepared'));
 assert.deepEqual(f.timeouts,[],'no browser call may use the last 100 ms for a node observation');
 assert.deepEqual(f.gestures,[],'the prepared gesture must not reach the browser');
 assert.deepEqual([result.facts.execution.verified,result.decision.result,result.unconfirmed],[false,'unresolved',false]);
 assert.equal(f.runtime.hasUnsettledWork(),true);
});


test('the recovery receipt is journaled before the original operation is released',async()=>{
 let f,observed=false;
 f=await verificationFixture({onRecord:async event=>{
  if(event.phase==='browser_recovery_verified'){
   observed=true;
   assert.equal(f.runtime.hasUnsettledWork(),true);
   assert.equal(f.operation.nodeApply.pending.phase,'finish');
  }
  return structuredClone(event);
 }});
 delete f.operation.nodeApply.execution_baseline;
 const checked=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-1',sequence:1});
 assert.equal(checked.decision.result,'continuable');
 const originalError=structuredClone(f.operation.outcome.error),stoppedError=structuredClone(f.operation.stoppedError),phases=structuredClone(f.operation.nodeApply.phases);
 const settled=await f.runtime.settleBrowserRecovery('apply',{attemptId:'br-1',...checked,attested:{settings:['Configured in browser']}});
 assert.equal(observed,true);
 assert.equal(settled.receipt_id,'br-1:receipt');
 assert.equal(settled.result,'continuable');
 assert.equal(f.runtime.hasUnsettledWork(),false);
 const original=f.operation.outcome;
 assert.equal(original.status,'FAILED');
 assert.equal(original.output.checkpoint_kind,'local_node_released');
 assert.equal(original.output.released_phase,'finish');
 assert.equal(original.output.released_by,'browser_recovery');
 assert.equal(original.output.recovery_receipt_id,'br-1:receipt');
 assert.equal(original.output.error.code,'NODE_OPERATION_RELEASED');
 assert.deepEqual(f.operation.stoppedError,stoppedError);
 assert.deepEqual(original.error,originalError);
 assert.deepEqual(f.operation.nodeApply.phases,phases);
 assert.match(settled.next_step.instruction,/existing/);
});

test('an unresolved decision writes no receipt and keeps the lock',async()=>{
 const f=await verificationFixture({previewRefused:true});
 const checked=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-unresolved',sequence:1});
 const before=structuredClone(f.operation.outcome);
 const settled=await f.runtime.settleBrowserRecovery('apply',{attemptId:'br-unresolved',...checked,attested:{settings:['Claimed correct']}});
 assert.equal(settled.result,'unresolved');assert.equal(settled.receipt_id,undefined);
 assert.equal(f.runtime.hasUnsettledWork(),true);assert.deepEqual(f.operation.outcome,before);
 assert.equal(f.events.some(e=>e.operation_id==='br-unresolved:receipt'),false);
 await assert.rejects(f.runtime.startNodeRead({operation_id:'read',source_operation_id:'br-unresolved:receipt'}),/source_operation_id/);
});

test('a failed receipt write keeps even a released T4 locked until a matching ACK',async()=>{
 let reject=true,f;
 f=await verificationFixture({released:true,onRecord:async event=>{
  if(event.phase==='browser_recovery_verified'){
   assert.equal(f.runtime.hasUnsettledWork(),true);
   if(reject)throw Error('Journal unavailable');
  }
  return structuredClone(event);
 }});
 const original=structuredClone(f.operation.outcome);
 const checked=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-ack',sequence:1});
 const settle=()=>f.runtime.settleBrowserRecovery('apply',{attemptId:'br-ack',...checked,attested:{settings:[]}});
 const refused=await settle();
 assert.deepEqual([refused.result,refused.error.code],['unresolved','RECOVERY_RECEIPT_UNCONFIRMED']);
 assert.deepEqual(f.operation.outcome,original);assert.equal(f.runtime.hasUnsettledWork(),true);
 const before=f.gestures.length;
 const blocked=await f.runtime.run('package.save_checkpoint',{path:'/user/a.lgp',conflict_policy:'replace'},{operationId:'blocked'});
 assert.equal(blocked.status,'AMBIGUOUS');assert.equal(f.gestures.length,before);
 reject=false;
 assert.equal((await settle()).receipt_id,'br-ack:receipt');
 assert.equal(f.runtime.hasUnsettledWork(),false);
 assert.deepEqual(f.operation.outcome,{...original,output:{...original.output,recovery_receipt_id:'br-ack:receipt'}});
 await f.runtime.runNodeApply({...request(),operation_id:'next',target:{kind:'existing',type:'imports.text',ref:f.operation.nodeApply.node}});
 assert.equal(f.calls.filter(c=>c==='finish').length,2);
});


test('a completed Calculator receipt supplies the actual next read identity and verified schema',async()=>{
 const f=await verificationFixture({nodeType:'transform.calculator'});
 const checked=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-calc',sequence:1});
 const settled=await f.runtime.settleBrowserRecovery('apply',{attemptId:'br-calc',...checked,attested:{settings:['Expression']}});
 assert.equal(settled.next_step.tool,'dock_node_read');
 assert.equal(settled.next_step.arguments.source_operation_id,'br-calc:receipt');
 const event=f.events.find(e=>e.phase==='browser_recovery_verified');
 const read=buildNodeReadRequest({operation_id:'calc-read',...settled.next_step.arguments},
  {parameters:event.parameters,outcome:{status:'SUCCEEDED',cleanup_complete:true,output:event.result}});
 assert.deepEqual(read.parameters.schemas,[{port:0,schema:[{index:0,name:'value',label:'Value',type:'integer'}]}]);
 validateNodeApplyRequest(read,new Map([['transform.calculator',{revision:'1'}]]));
 const admitted=await f.runtime.startNodeRead({operation_id:'calc-read',...settled.next_step.arguments});
 assert.equal(admitted.operation_id,'calc-read');
 const completed=await f.runtime.waitNodeApply('calc-read',{timeoutMs:1000});
 assert.equal(completed.outcome.status,'SUCCEEDED',JSON.stringify(completed));
 assert.equal(completed.outcome.output.execution.execution_id,'fresh-read');
 assert.equal(f.calls.filter(c=>c==='read-execute').length,1);
});

test('a completed export points to its verified file rather than a node read',async()=>{
 const f=await verificationFixture({exportFile:true});
 const checked=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-file',sequence:1});
 const result=await f.runtime.settleBrowserRecovery('apply',{attemptId:'br-file',...checked,attested:{settings:[]}});
 assert.equal(result.result,'completed');assert.equal(result.next_step.tool,undefined);
 assert.match(result.next_step.instruction,/result.csv/);
 await assert.rejects(f.runtime.startNodeRead({operation_id:'file-read',source_operation_id:result.receipt_id}),/source_operation_id/);
});

test('verified Save settlement links its receipt without rewriting the original Save outcome',async()=>{
 const savedState={version:1,session_id:'session',document_id:'doc',account:'user',package_path:'/user/a.lgp',
  modified:false,observation:'after_confirmed_save',read_only:true,persisted_content_verified:false};
 const events=[];
 const engine=await saveWithReceipt({savedState,receipt:outcome=>({state:'completed',receipt:outcome}),onRecord:async e=>{events.push(e);return e;}});
 await engine.inspect({operationId:'save'});
 const checked=await engine.verifyBrowserRecovery('save',{attemptId:'br-save',sequence:1});
 const result=await engine.settleBrowserRecovery('save',{attemptId:'br-save',...checked,attested:{actions:['Save']}});
 assert.equal(result.result,'completed');assert.equal(engine.hasUnsettledWork(),false);
 assert.match(result.next_step.instruction,/Save.*Dock/);
 const retry=await engine.run('package.save_checkpoint',{path:'/user/a.lgp',conflict_policy:'replace'},{operationId:'save'});
 assert.equal(retry.status,'AMBIGUOUS');
 assert.deepEqual(retry.output.browser_recovery,{receipt_id:'br-save:receipt',result:'completed'});
 assert.equal(events.filter(e=>e.phase==='browser_recovery_verified').length,1);
});

test('a stopped attempt is never offered again and its release refusal names no user action',async()=>{
 const f=fixture({release:refuse,browserRecovery:full});await stop(f,'finish');
 f.runtime.markBrowserRecoveryStopped('apply','br-stopped');
 assert.equal(f.runtime.browserRecoveryBasis('apply'),null);
 const next=f.runtime.browserRecoverySafeCompletion('apply');
 assert.equal(next.tool,'dock_operation_recover');
 const refused=await f.runtime.recover(next.arguments.operation_id,{strategy:next.arguments.strategy,recoveryOperationId:'release-stopped'});
 assert.equal(refused.output.user_action,undefined);assert.equal(refused.output.browser_recovery,undefined);
 assert.match(refused.output.instruction,/apply.*phase.*finish/);
 assert.match(refused.output.instruction,/another node/);
 assert.equal(f.runtime.hasUnsettledWork(),true);
});

test('stopping and safe completion stay callable while the original node job is busy',async()=>{
 const f=fixture({release:proved(),browserRecovery:full});
 let entered,release;
 const started=new Promise(resolve=>{entered=resolve;});
 f.drivers.finish=async()=>{entered();await new Promise(resolve=>{release=resolve;});throw Error('Local node cancellation requested');};
 f.runtime.startNodeApply(request());await started;
 try{
  const calls=[...f.calls];
  f.runtime.markBrowserRecoveryStopped('apply','br-busy');
  const next=f.runtime.browserRecoverySafeCompletion('apply');
  assert.equal(next.tool,undefined);assert.match(next.instruction,/apply/);
  assert.deepEqual(f.calls,calls);assert.equal(f.runtime.browserRecoveryBasis('apply'),null);
 }finally{release();await f.runtime.waitNodeApply('apply',{timeoutMs:1000});}
});


test('exact retry returns the released original and its receipt without rerunning the stopped phase',async()=>{
 const f=await verificationFixture();
 const originalRequest=structuredClone(f.operation.nodeApply.request),originalError=structuredClone(f.operation.outcome.error);
 const checked=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-retry',sequence:1});
 await f.runtime.settleBrowserRecovery('apply',{attemptId:'br-retry',...checked,attested:{settings:[]}});
 const job=f.runtime.startNodeApply(originalRequest);
 const waited=await f.runtime.waitNodeApply('apply',{timeoutMs:0});
 assert.deepEqual(job,waited);assert.equal(job.outcome.status,'FAILED');
 assert.deepEqual(job.outcome.error,originalError);
 assert.equal(job.outcome.output.recovery_receipt_id,'br-retry:receipt');
 assert.equal(compactNodeResult(job).output.recovery_receipt_id,'br-retry:receipt');
 assert.equal(f.calls.filter(c=>c==='finish').length,1);
 const inspected=await f.runtime.inspect({operationId:'apply'});
 assert.equal(f.runtime.hasUnsettledWork(),false);
 assert.equal(f.operation.outcome.status,'FAILED');assert.deepEqual(f.operation.outcome.error,originalError);
 assert.ok(inspected);
});

test('stopped confirmed verification releases only after the existing native proof and release ACK',async()=>{
 let reject=true,f;
 f=await verificationFixture({previewRefused:true,onRecord:async event=>{
  if(event.phase==='node_operation_released'){
   assert.equal(f.runtime.hasUnsettledWork(),true);
   if(reject)throw Error('Release journal unavailable');
  }
  return event;
 }});
 const originalError=structuredClone(f.operation.outcome.error);
 const checked=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-stop',sequence:1});
 f.operation.nodeApplyDrivers.releasePending=async()=>proved()();
 const settlement=await f.runtime.settleBrowserRecovery('apply',{attemptId:'br-stop',...checked,attested:{}});
 assert.equal(settlement.result,'unresolved');
 await assert.rejects(f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'unstopped'}));
 f.runtime.markBrowserRecoveryStopped('apply','other-attempt');
 assert.equal(f.runtime.browserRecoverySafeCompletion('apply').tool,undefined);
 await assert.rejects(f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'wrong-attempt'}));
 f.runtime.markBrowserRecoveryStopped('apply','br-stop');
 const step=f.runtime.browserRecoverySafeCompletion('apply');
 assert.equal(step.tool,'dock_operation_recover');
 const refused=await f.runtime.recover('apply',{strategy:step.arguments.strategy,recoveryOperationId:'refused-ack'});
 assert.equal(refused.error.code,'NODE_RELEASE_REFUSED');assert.equal(f.runtime.hasUnsettledWork(),true);
 assert.equal(refused.output.user_action,undefined);
 reject=false;
 const released=await f.runtime.recover('apply',{strategy:step.arguments.strategy,recoveryOperationId:'safe-release'});
 assert.equal(released.output.goal_verified,false);assert.equal(f.runtime.hasUnsettledWork(),false);
 assert.equal(f.operation.outcome.status,'FAILED');assert.deepEqual(f.operation.outcome.error,originalError);
 assert.equal(f.operation.outcome.output.recovery_receipt_id,undefined);
 assert.equal(f.events.some(e=>e.phase==='browser_recovery_verified'),false);
});

test('the same stopped phase after browser recovery release offers T3 without touching other work',async()=>{
 const f=await verificationFixture();
 delete f.operation.nodeApply.execution_baseline;
 const checked=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-repeat-phase',sequence:1});
 await f.runtime.settleBrowserRecovery('apply',{attemptId:'br-repeat-phase',...checked,attested:{}});
 const original=structuredClone(f.operation.outcome);
 f.runtime.startNodeApply({...f.operation.nodeApply.request,operation_id:'again'});
 const again=await f.runtime.waitNodeApply('again',{timeoutMs:1000});
 assert.equal(again.outcome.output.browser_recovery.next_step.trigger,'T3');
 await assert.rejects(f.runtime.settleBrowserRecovery('apply',{attemptId:'br-repeat-phase',...checked,attested:{}}),/owned/);
 assert.deepEqual(f.runtime.nodeApplyStatus('again'),again);
 assert.deepEqual((await f.runtime.inspect({operationId:'apply'})).output.outcome,original);
 assert.equal(f.runtime.hasUnsettledWork(),true);
});

test('unknown verification and stopped released T4 offer no stale release',async()=>{
 for(const lostPreview of [false,true]){
  const f=await verificationFixture({released:true,lostPreview});
  const checked=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-stop-t4',sequence:1});
  if(lostPreview)await assert.rejects(f.runtime.settleBrowserRecovery('apply',{attemptId:'br-stop-t4',...checked,attested:{}}),/confirmed|Confirmed/);
  const before=f.gestures.length;
  f.runtime.markBrowserRecoveryStopped('apply','br-stop-t4');
  const step=f.runtime.browserRecoverySafeCompletion('apply');
  assert.equal(step.tool,undefined);assert.match(step.instruction,/factual state/);
  await assert.rejects(f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'unsafe-release'}));
  assert.equal(f.runtime.hasUnsettledWork(),true);assert.equal(f.gestures.length,before);
 }
});

test('a completed JavaScript recovery requires a new existing operation instead of receipt reading',async()=>{
 const f=await verificationFixture({nodeType:'programming.javascript'});
 const checked=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-js',sequence:1});
 const settled=await f.runtime.settleBrowserRecovery('apply',{attemptId:'br-js',...checked,attested:{settings:['Script']}});
 assert.equal(settled.result,'completed');assert.equal(settled.next_step.tool,'dock_node_apply');
 assert.match(settled.next_step.instruction,/NEW operation_id.*existing.*complete intended settings/);
 await assert.rejects(f.runtime.startNodeRead({operation_id:'js-read',source_operation_id:settled.receipt_id}),/source_operation_id/);
});

test('a mismatched receipt ACK or attempt cannot release the original and concurrent mutation is refused',async()=>{
 let f;
 f=await verificationFixture({onRecord:async event=>{
  if(event.phase!=='browser_recovery_verified')return event;
  assert.equal(f.runtime.hasUnsettledWork(),true);
  const mutation=await f.runtime.run('package.save_checkpoint',{path:'/user/a.lgp',conflict_policy:'replace'},{operationId:'during-ack'});
  assert.notEqual(mutation.status,'SUCCEEDED');
  return {...event,result:{...event.result,result:'unresolved'}};
 }});
 const checked=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-mismatch',sequence:1});
 const original=structuredClone(f.operation.outcome),gestures=f.gestures.length;
 await assert.rejects(f.runtime.settleBrowserRecovery('apply',{attemptId:'other',...checked,attested:{}}),/owned/);
 const settled=await f.runtime.settleBrowserRecovery('apply',{attemptId:'br-mismatch',...checked,attested:{}});
 assert.equal(settled.error.code,'RECOVERY_RECEIPT_UNCONFIRMED');assert.equal(settled.receipt_id,undefined);
 assert.equal(f.runtime.hasUnsettledWork(),true);assert.deepEqual(f.operation.outcome,original);
 assert.equal(f.gestures.length,gestures);
 await assert.rejects(f.runtime.startNodeRead({operation_id:'no-receipt',source_operation_id:'br-mismatch:receipt'}),/source_operation_id/);
});

test('a recovery receipt cannot reuse another node job identity',async()=>{
 const f=await verificationFixture();
 f.runtime.startNodeApply({...f.operation.nodeApply.request,operation_id:'br-collision:receipt'});
 const other=await f.runtime.waitNodeApply('br-collision:receipt',{timeoutMs:1000});
 const checked=await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-collision',sequence:1});
 await assert.rejects(f.runtime.settleBrowserRecovery('apply',{attemptId:'br-collision',...checked,attested:{}}),/identity.*used/);
 assert.deepEqual(f.runtime.nodeApplyStatus('br-collision:receipt'),other);
 assert.equal(f.runtime.hasUnsettledWork(),true);
 assert.equal(f.events.some(e=>e.phase==='browser_recovery_verified'),false);
});

for(const phase of ['operation_abandoned','recovery_completed'])test('safe release survives auxiliary journal failure after its native ACK: '+phase,async()=>{
 const f=await verificationFixture({onRecord:async event=>{
  if(event.phase===phase)throw Error('Auxiliary journal unavailable: '+phase);
  return event;
 }});
 await f.runtime.verifyBrowserRecovery('apply',{attemptId:'br-aux',sequence:1});
 f.operation.nodeApplyDrivers.releasePending=async()=>proved()();
 f.runtime.markBrowserRecoveryStopped('apply','br-aux');
 const result=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'aux-release'});
 assert.equal(result.status,'SUCCEEDED');assert.equal(result.output.goal_verified,false);
 assert.match(result.output.journal_error,/Auxiliary journal unavailable/);
 assert.equal(f.runtime.hasUnsettledWork(),false);
 assert.equal(f.runtime.nodeApplyStatus('apply').outcome.status,'FAILED');
 const retry=await f.runtime.recover('apply',{strategy:'abandon_operation',recoveryOperationId:'aux-release'});
 assert.deepEqual(retry,result);
 assert.equal(f.events.filter(e=>e.phase==='node_operation_released').length,1);
});
