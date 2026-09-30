import test from 'node:test';
import assert from 'node:assert/strict';
import {makeJavascriptManagedStageCode} from '../lib/javascript-managed-stage.mjs';
import {captureManagedJavascriptWizardError,makeJavascriptManagedErrorReadCode,makeJavascriptManagedErrorGestureCode,
  journalManagedJavascriptError} from '../lib/javascript-managed-wizard-error.mjs';
import {managedJavascriptStageFixture} from './support/javascript-managed-stage-fixture.mjs';
import {createRedactor} from '../lib/redact.mjs';

function fixture({auto=false,close=true}={}) {
  const f=managedJavascriptStageFixture(),tid='msgbox-1',events=[],calls=[],sha='a'.repeat(64);
  f.previews.length=0;f.lease.codeNextAttempted=true;f.lease.sourceDraftSha256=sha;
  const input=f.element('input','input'),wrapper=f.element('cm','wrapper');
  wrapper.contains=e=>e===input;const doc={lineCount:()=>1,firstLine:()=>0,lastLine:()=>0,getLine:()=> 'const value=object?.field;'};
  const cm={getDoc:()=>doc,getInputField:()=>input,getWrapperElement:()=>wrapper,getOption:()=>false};wrapper.CodeMirror=cm;
  const rootQuery=f.root.querySelectorAll,rootContains=f.root.contains;
  f.root.querySelectorAll=selector=>selector==='.CodeMirror'?[wrapper]:rootQuery(selector);
  f.root.contains=e=>e===wrapper||rootContains(e);f.code.contains=e=>e===wrapper;
  f.lease.sourceEditorCaptured={document:f.context.document,tab:f.tab,native:f.native,model:f.model,root:f.root,
    page:f.code,wrapper,cm,doc,input};f.lease.sourceDraftText='const value=object?.field;';
  const before=f.read();f.error.rect.width=100;f.error.closest=()=>null;
  const ok=f.element('ok',tid+';tlb;ok');ok.innerText='OK';ok.closest=()=>null;
  const dialog=f.element('dialog',tid);dialog.innerText='Loginom 7.4.2\nSyntaxError: Syntax error at code (:4:33)\nТехнические подробности\nOK';
  dialog.querySelectorAll=()=>[ok];dialog.contains=e=>e===ok;
  const get=f.context.Ext.getCmp,query=f.context.document.querySelectorAll;
  const controls={[f.error.id]:{el:{dom:f.error}},[dialog.id]:{el:{dom:dialog}},[ok.id]:{el:{dom:ok}}};
  f.context.Ext.getCmp=id=>controls[id]??get(id);
  f.context.document.querySelectorAll=selector=>selector.includes('.x-message-box')?f.dialogs
    :selector.includes(';tlb;ok')?(f.dialogs.length?[ok]:[]):query(selector);
  f.context.document.elementFromPoint=()=>f.dialogs.length?ok:f.error;
  if(auto)f.dialogs.push(dialog);
  f.page.mouse={click:async()=>{
    if(f.dialogs.length){calls.push('ok');if(close)f.dialogs.length=0;return;}
    calls.push('button');f.dialogs.push(dialog);
  }};
  const execute=async code=>Function('return ('+code+')')()(f.page);
  const after={...f.read(),owner:f.task.owner,wizard_error_refusal:true,pending_seen:false};
  const base={...f.task,page_tid:after.page_tid,tooltip:after.wizard_error.tooltip,
    tooltip_truncated:false,expected_source_sha256:sha};
  const receiptOptions=(id,key,signature)=>({receipt_namespace:'error-test',receipt_id:id,receipt_signature:signature});
  const options={task:f.task,before,after,expected_source_sha256:sha,execute,
    record:async event=>{events.push(structuredClone(event));return event;},receiptOptions,wait:async()=>{}};
  return {...f,sha,dialog,ok,controls,events,calls,execute,base,before,after,options};
}

for(const auto of [false,true])test('real generated browser bodies capture '+(auto?'automatic':'quiet')+' native error and verify dialog close',async()=>{
  const f=fixture({auto}),result=await captureManagedJavascriptWizardError(f.options);
  assert.deepEqual(f.calls,auto?['ok']:['button','ok']);assert.equal(f.dialogs.length,0);
  assert.equal(result.dialog_text,f.dialog.innerText);assert.equal(result.dialog_closed,true);
  assert.equal(result.source_sha256,f.sha);assert.equal(result.explicit_execute_requested,false);
  assert.ok(f.events.some(event=>event.phase==='javascript_managed_error_observed'));
  assert.equal(f.held.errorDialogRoot,f.dialog);
});

test('real gesture bodies refuse replay and point drift without a second mouse action',async()=>{
  const f=fixture(),task={...f.base,mode:'button'},point=await f.execute(makeJavascriptManagedErrorReadCode(task));
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
  const f=fixture();change(f);
  await assert.rejects(()=>f.execute(makeJavascriptManagedErrorReadCode({...f.base,mode:'button'})),/unavailable|changed|blocked|covered/);
  assert.deepEqual(f.calls,[]);
});

test('automatic dialog requires native Ext identity and exact captured root for OK',async()=>{
  const f=fixture({auto:true});f.controls[f.dialog.id]={};
  await assert.rejects(()=>f.execute(makeJavascriptManagedErrorReadCode({...f.base,mode:'dialog'})),/dialog changed/);
  assert.deepEqual(f.calls,[]);
});

test('OK cannot dismiss a dialog without the prior native capture',async()=>{
  const f=fixture({auto:true}),request={...f.base,mode:'ok',gesture_id:f.task.operation_id+':error-ok',
    point:{x:170,y:120,tid:f.ok.tid,node_id:f.task.owner.node_id,page_tid:f.after.page_tid},
    dialog:{present:true,tid:f.dialog.tid,text:f.dialog.innerText,text_truncated:false,ok_tid:f.ok.tid}};
  await assert.rejects(()=>f.execute(makeJavascriptManagedErrorGestureCode(request)),/dialog changed/);
  assert.deepEqual(f.calls,[]);
});

test('durable intent ACK changes and in-place mutation refuse the first error gesture',async()=>{
  for(const mutate of [event=>({...event,source_sha256:'b'.repeat(64)}),event=>{event.phase='changed';return event;}]) {
    const f=fixture();await assert.rejects(captureManagedJavascriptWizardError({...f.options,record:async event=>mutate(event)}),/ACK differs/);
    assert.deepEqual(f.calls,[]);
  }
});

test('lost error-button reply and returned ACK mutation never continue to OK or cleanup proof',async()=>{
  for(const lost of [true,false]) {
    const f=fixture();
    await assert.rejects(captureManagedJavascriptWizardError({...f.options,
      execute:async code=>{const result=await f.execute(code);if(lost&&f.calls.length)throw Error('lost reply');return result;},
      record:async event=>event.phase==='javascript_managed_error_button_returned'?{...event,gesture_id:'foreign'}:event}),/lost reply|ACK differs/);
    assert.deepEqual(f.calls,['button']);assert.equal(f.dialogs.length,1);
    assert.ok(!f.events.some(event=>event.phase==='javascript_managed_error_observed'));
  }
});

test('stale button before Next does not authorize a diagnostic gesture',async()=>{
  const f=fixture();await assert.rejects(captureManagedJavascriptWizardError({...f.options,before:f.after}),/current refusal unavailable/);
  assert.deepEqual(f.calls,[]);
});

test('unclosed dialog retains uncertainty under the original deadline after one OK',async()=>{
  const f=fixture({close:false});f.task.deadline=Date.now()+80;
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
  const f=fixture({auto:true});f.dialog.innerText='SyntaxError: '+ 'Ё'.repeat(5000);
  const observed=await f.execute(makeJavascriptManagedErrorReadCode({...f.base,mode:'dialog'}));
  assert.equal(observed.dialog.text,f.dialog.innerText.slice(0,4096));assert.equal(observed.dialog.text_truncated,true);
});

test('native diagnostic applies the existing redactor before the durable journal and returned result',async()=>{
  const f=fixture();f.error.tip+=' password=super-private';f.dialog.innerText+='\nprivate-custom-value';
  const after={...f.read(),owner:f.task.owner,wizard_error_refusal:true,pending_seen:false};
  const result=await captureManagedJavascriptWizardError({...f.options,after,redactor:createRedactor(['private-custom-value'])});
  const text=JSON.stringify([result,f.events]);assert.ok(!text.includes('super-private'));assert.ok(!text.includes('private-custom-value'));
  assert.ok(text.includes('[redacted]'));
});
