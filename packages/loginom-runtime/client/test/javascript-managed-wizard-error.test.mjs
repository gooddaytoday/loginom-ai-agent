import test from 'node:test';
import assert from 'node:assert/strict';
import {makeJavascriptManagedStageCode} from '../lib/javascript-managed-stage.mjs';
import {captureManagedJavascriptWizardError,makeJavascriptManagedErrorReadCode,makeJavascriptManagedErrorGestureCode,
  journalManagedJavascriptError} from '../lib/javascript-managed-wizard-error.mjs';
import {managedJavascriptErrorFixture} from './support/javascript-managed-error-fixture.mjs';
import {createRedactor} from '../lib/redact.mjs';


for(const auto of [false,true])test('real generated browser bodies capture '+(auto?'automatic':'quiet')+' native error and verify dialog close',async()=>{
  const f=managedJavascriptErrorFixture({auto}),result=await captureManagedJavascriptWizardError(f.options);
  assert.deepEqual(f.calls,auto?['ok']:['button','ok']);assert.equal(f.dialogs.length,0);
  assert.equal(result.dialog_text,f.dialog.innerText);assert.equal(result.dialog_closed,true);
  assert.equal(result.source_sha256,f.sha);assert.equal(result.explicit_execute_requested,false);
  assert.ok(f.events.some(event=>event.phase==='javascript_managed_error_observed'));
  assert.equal(f.held.errorDialogRoot,f.dialog);
});

test('real gesture bodies refuse replay and point drift without a second mouse action',async()=>{
  const f=managedJavascriptErrorFixture(),task={...f.base,mode:'button'},point=await f.execute(makeJavascriptManagedErrorReadCode(task));
  const request={...task,point:point.point,gesture_id:task.operation_id+':error-button'};
  assert.equal((await f.execute(makeJavascriptManagedErrorGestureCode({...request,point:{...point.point,x:999}}))).status,'NOT_APPLIED');
  assert.deepEqual(f.calls,[]);
  assert.equal((await f.execute(makeJavascriptManagedErrorGestureCode(request))).status,'SUCCEEDED');
  assert.equal((await f.execute(makeJavascriptManagedErrorGestureCode(request))).status,'NOT_APPLIED');
  assert.deepEqual(f.calls,['button']);
});

for(const [name,change] of [
  ['code Next not dispatched',f=>f.lease.codeNextAttempted=false],['draft digest',f=>f.lease.sourceDraftSha256='b'.repeat(64)],
  ['Done already dispatched',f=>f.lease.doneAttempted=true],['native button',f=>f.controls[f.error.id]={}],
  ['disabled',f=>f.controls[f.error.id].disabled=true],['covered',f=>f.context.document.elementFromPoint=()=>null],
  ['native owner',f=>f.native.ParentNode.FGuid='foreign'],['origin',f=>f.context.location.origin='https://foreign.invalid'],
  ['account',f=>f.connection.UserName='foreign'],['busy',f=>f.masks.push(f.element('mask',''))],
  ['editor remount',f=>f.lease.sourceEditorCaptured.cm={}],['source after Next',f=>f.lease.sourceEditorCaptured.doc.getLine=()=> 'changed'],
  ['page',f=>f.code.tid='MF;TF-1;WizrdMCF;DoneWizard'],['tooltip',f=>f.error.tip='foreign'],
  ['foreign dialog',f=>f.dialogs.push(f.element('foreign','foreign'))],
])test('actual error button refuses '+name+' before mutation',async()=>{
  const f=managedJavascriptErrorFixture();change(f);
  await assert.rejects(()=>f.execute(makeJavascriptManagedErrorReadCode({...f.base,mode:'button'})),/unavailable|changed|blocked|covered/);
  assert.deepEqual(f.calls,[]);
});

test('automatic dialog requires native Ext identity and exact captured root for OK',async()=>{
  const f=managedJavascriptErrorFixture({auto:true});f.controls[f.dialog.id]={};
  await assert.rejects(()=>f.execute(makeJavascriptManagedErrorReadCode({...f.base,mode:'dialog'})),/dialog changed|wizard changed/);
  assert.deepEqual(f.calls,[]);
});

for(const [name,change] of [
  ['front window',f=>f.dialogComponent.zIndexManager.front={}],
  ['mask native identity',f=>f.dialogComponent.zIndexManager.mask.dom=f.element('other-mask','')],
  ['mask target',f=>f.dialogComponent.zIndexManager.mask.maskTarget={}],
  ['modal flag',f=>f.dialogComponent.modal=false],
  ['hidden native dialog',f=>f.dialogComponent.hidden=true],
  ['unknown float parent',f=>f.dialogComponent.floatParent={}],
  ['additional mask',f=>f.plainMasks.push(f.element('foreign-mask',''))],
])test('native modal mask exemption refuses changed '+name+' before any OK',async()=>{
  const f=managedJavascriptErrorFixture({auto:true});change(f);
  await assert.rejects(()=>f.execute(makeJavascriptManagedErrorReadCode({...f.base,mode:'dialog'})),/wizard changed/);
  assert.deepEqual(f.calls,[]);
});

test('after one error button, owned loading settles read-only before capturing the native modal',async()=>{
  const f=managedJavascriptErrorFixture(),click=f.page.mouse.click,maskSymbol=Symbol('MaskWithText');let waits=0;
  f.context.bg.ext={AfterElementTextMaskContext:{ElementSymb:maskSymbol}};
  f.model.FView[maskSymbol]={FController:f.model.FView,FElement:f.root,FIsActive:true,FSequence:['Загрузка']};
  f.page.mouse.click=async()=>{await click();if(f.calls.length===1)f.masks.push(f.root);};
  const result=await captureManagedJavascriptWizardError({...f.options,wait:async()=>{waits++;f.masks.length=0;}});
  assert.equal(waits,1);assert.equal(result.dialog_closed,true);assert.deepEqual(f.calls,['button','ok']);
});

for(const plain of [false,true])test('after button a foreign '+(plain?'plain':'loading')+' mask stops without OK',async()=>{
  const f=managedJavascriptErrorFixture(),click=f.page.mouse.click;
  f.page.mouse.click=async()=>{await click();(plain?f.plainMasks:f.masks).push(f.element('foreign-mask',''));};
  await assert.rejects(captureManagedJavascriptWizardError(f.options),/opening foreign mask/);
  assert.deepEqual(f.calls,['button']);
});

test('error opening refuses an additional foreign dialog without replaying button or sending OK',async()=>{
  const f=managedJavascriptErrorFixture(),click=f.page.mouse.click;
  f.page.mouse.click=async()=>{await click();f.dialogs.push(f.element('foreign-dialog','foreign'));};
  await assert.rejects(captureManagedJavascriptWizardError(f.options),/opening foreign dialog|opening foreign mask/);
  assert.deepEqual(f.calls,['button']);
});

test('OK cannot dismiss a dialog without the prior native capture',async()=>{
  const f=managedJavascriptErrorFixture({auto:true}),request={...f.base,mode:'ok',gesture_id:f.task.operation_id+':error-ok',
    point:{x:170,y:120,tid:f.ok.tid,node_id:f.task.owner.node_id,page_tid:f.after.page_tid},
    dialog:{present:true,tid:f.dialog.tid,text:f.dialog.innerText,text_truncated:false,ok_tid:f.ok.tid}};
  await assert.rejects(()=>f.execute(makeJavascriptManagedErrorGestureCode(request)),/dialog changed/);
  assert.deepEqual(f.calls,[]);
});

test('durable intent ACK changes and in-place mutation refuse the first error gesture',async()=>{
  for(const mutate of [event=>({...event,source_sha256:'b'.repeat(64)}),event=>{event.phase='changed';return event;}]) {
    const f=managedJavascriptErrorFixture();await assert.rejects(captureManagedJavascriptWizardError({...f.options,record:async event=>mutate(event)}),/ACK differs/);
    assert.deepEqual(f.calls,[]);
  }
});

test('lost error-button reply and returned ACK mutation never continue to OK or cleanup proof',async()=>{
  for(const lost of [true,false]) {
    const f=managedJavascriptErrorFixture();
    await assert.rejects(captureManagedJavascriptWizardError({...f.options,
      execute:async code=>{const result=await f.execute(code);if(lost&&f.calls.length)throw Error('lost reply');return result;},
      record:async event=>event.phase==='javascript_managed_error_button_returned'?{...event,gesture_id:'foreign'}:event}),/lost reply|ACK differs/);
    assert.deepEqual(f.calls,['button']);assert.equal(f.dialogs.length,1);
    assert.ok(!f.events.some(event=>event.phase==='javascript_managed_error_observed'));
  }
});

test('stale button before Next does not authorize a diagnostic gesture',async()=>{
  const f=managedJavascriptErrorFixture();await assert.rejects(captureManagedJavascriptWizardError({...f.options,before:f.after}),/current refusal unavailable/);
  assert.deepEqual(f.calls,[]);
});

test('unclosed dialog retains uncertainty under the original deadline after one OK',async()=>{
  const f=managedJavascriptErrorFixture({close:false});f.task.deadline=Date.now()+80;
  f.lease.identity=JSON.stringify([f.task.owner,f.task.workflow_ref,f.task.targetOrigin,f.task.targetBuild,f.task.deadline]);
  await assert.rejects(captureManagedJavascriptWizardError({...f.options,wait:async()=>new Promise(resolve=>setTimeout(resolve,5))}),/closure original deadline expired|lease unavailable/);
  assert.deepEqual(f.calls,['button','ok']);assert.equal(f.dialogs.length,1);
  assert.ok(!f.events.some(event=>event.phase==='javascript_managed_error_observed'));
});

test('hung journal is bounded by the original deadline',async()=>{
  await assert.rejects(journalManagedJavascriptError({record:()=>new Promise(()=>{}),deadline:Date.now()+25},
    {phase:'error-test'}),/journal deadline/);
});

test('bounded native dialog preserves exact prefix and reports truncation',async()=>{
  const f=managedJavascriptErrorFixture({auto:true});f.dialog.innerText='SyntaxError: '+ 'Ё'.repeat(5000);
  const observed=await f.execute(makeJavascriptManagedErrorReadCode({...f.base,mode:'dialog'}));
  assert.equal(observed.dialog.text,f.dialog.innerText.slice(0,4096));assert.equal(observed.dialog.text_truncated,true);
});

test('native diagnostic applies the existing redactor before the durable journal and returned result',async()=>{
  const f=managedJavascriptErrorFixture();f.error.tip+=' password=super-private';f.dialog.innerText+='\nprivate-custom-value';
  const after={...f.read(),owner:f.task.owner,wizard_error_refusal:true,pending_seen:false};
  const result=await captureManagedJavascriptWizardError({...f.options,after,redactor:createRedactor(['private-custom-value'])});
  const text=JSON.stringify([result,f.events]);assert.ok(!text.includes('super-private'));assert.ok(!text.includes('private-custom-value'));
  assert.ok(text.includes('[redacted]'));
});
