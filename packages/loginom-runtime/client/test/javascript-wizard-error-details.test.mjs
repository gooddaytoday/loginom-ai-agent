import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectJavascriptWizardErrorDetails,javascriptWizardTextClassification} from '../lib/javascript-wizard-error-details.mjs';
import {managedJavascriptErrorDetailsFixture} from './support/javascript-managed-error-details-fixture.mjs';

test('serialized helper captures exact native controller/toggle/owner chains without executing native methods',async()=>{
  const f=await managedJavascriptErrorDetailsFixture(),first=await f.readDetails(),binding=f.held.errorDetailsBinding;
  assert.equal(first.point.tid,'DetailPanel;btnDetais');assert.equal(first.native_owner_verified,true);
  assert.equal(first.expanded,false);assert.equal(binding.controller,f.controller);
  assert.equal(binding.button_native,f.nativeButton);assert.equal(binding.text_native,f.nativeText);
  assert.deepEqual(await f.readDetails(),first);assert.equal(f.held.errorDetailsBinding,binding);
  assert.deepEqual(f.calls,[]);assert.equal(f.nativeButton.pressed,false);assert.equal(f.text.innerText,'');
});

for(const [name,change] of [
  ['foreign message',f=>f.instance.FMessageBox={el:{dom:f.root}}],
  ['controller root',f=>f.controller.FView={el:{dom:f.root}}],
  ['view Controller',f=>f.view.Controller={}],
  ['controller prototype',f=>Object.setPrototypeOf(f.controller,{})],
  ['button scope',f=>f.nativeButton.scope={}],
  ['toggle handler',f=>f.nativeButton.toggleHandler=()=>{}],
  ['enableToggle',f=>f.nativeButton.enableToggle=false],
  ['disabled',f=>f.nativeButton.disabled=true],
  ['button pressed',f=>f.nativeButton.pressed=true],
  ['pressed accessor',f=>Object.defineProperty(f.nativeButton,'pressed',{get(){throw Error('Getter invoked');}})],
  ['foreign owner',f=>f.nativeButton.ownerCt={}],
  ['owner cycle',f=>f.nativeButton.ownerCt=f.nativeButton],
  ['panel owner',f=>f.nativePanel.ownerCt={}],
  ['text owner',f=>f.nativeText.ownerCt={}],
  ['duplicate button',f=>f.elements.push(f.button)],
  ['stale detail text',f=>f.text.innerText='previous failure'],
  ['already visible panel',f=>f.panel.rect.width=100],
  ['covered button',f=>f.context.document.elementFromPoint=()=>f.ok],
  ['foreign modal',f=>f.dialogs.push(f.element('foreign','msgbox-2'))],
  ['expired',f=>f.request.task.deadline=Date.now()-1],
])test('actual serialized details preflight refuses '+name+' without gestures',async()=>{
  const f=await managedJavascriptErrorDetailsFixture();change(f);
  await assert.rejects(f.readDetails(),/changed|required|refused|covered/);
  assert.deepEqual(f.calls,[]);assert.equal(f.held.errorDetailsBinding,undefined);
});

for(const name of ['instance','panel','text'])test('captured details refuses remounted '+name+' without recapture',async()=>{
  const f=await managedJavascriptErrorDetailsFixture();await f.readDetails();const captured=f.held.errorDetailsBinding;
  if(name==='instance')f.context.bg.ext.errormessage.ErrorMsg.FInstance={...f.instance};
  if(name==='panel')f.controls[f.panel.id]={...f.nativePanel};
  if(name==='text')f.controls[f.text.id]={...f.nativeText};
  await assert.rejects(f.readDetails(),/captured identities changed/);
  assert.equal(f.held.errorDetailsBinding,captured);assert.deepEqual(f.calls,[]);
});

test('expanded observation requires retained identities and visible toggled panel; reads lossless bounded UTF8',async()=>{
  const f=await managedJavascriptErrorDetailsFixture();await f.readDetails();f.request.task.mode='expanded';
  assert.equal((await f.readDetails()).expanded,false);
  f.nativeButton.pressed=true;f.panel.rect.width=100;f.text.rect.width=100;f.text.innerText='😀'.repeat(2000);
  const result=await f.readDetails();assert.equal(result.expanded,true);assert.equal(result.utf8_bytes,4096);
  assert.equal(result.text,'😀'.repeat(1024));assert.equal(result.text.isWellFormed(),true);
  assert.equal(result.text_truncated,true);assert.equal(result.native_owner_verified,true);assert.deepEqual(f.calls,[]);
});

test('expanded helper cannot capture a new owner or read empty native text',async()=>{
  const f=await managedJavascriptErrorDetailsFixture();f.request.task.mode='expanded';
  await assert.rejects(f.readDetails(),/captured identities changed/);
  f.request.task.mode='details';await f.readDetails();f.request.task.mode='expanded';
  f.nativeButton.pressed=true;f.panel.rect.width=100;f.text.rect.width=100;
  await assert.rejects(f.readDetails(),/text unavailable/);assert.deepEqual(f.calls,[]);
});

test('shared wizard classification recognizes only unique native classes and canonical positions',()=>{
  assert.deepEqual(javascriptWizardTextClassification('SyntaxError: Syntax error at code (:4:33)'),{
    error_class:{status:'recognized',name:'SyntaxError'},location:{status:'recognized',line:4,column:33}});
  for(const source of ['Причина не определена','Error: wrapper\nTypeError: child', 'stack (backend.js:4:33)'])
    assert.equal(javascriptWizardTextClassification(source).location.status,'unrecognized');
  assert.equal(javascriptWizardTextClassification('TypeError: first (:1:2)\nSyntaxError: second (:3:4)').error_class.status,'unrecognized');
  assert.equal(javascriptWizardTextClassification('Error: zero (:0:0)').location.status,'unrecognized');
});
