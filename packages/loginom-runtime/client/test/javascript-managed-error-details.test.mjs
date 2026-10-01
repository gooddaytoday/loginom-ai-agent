import test from 'node:test';
import assert from 'node:assert/strict';
import {captureManagedJavascriptWizardError,makeJavascriptManagedErrorReadCode,makeJavascriptManagedErrorGestureCode} from '../lib/javascript-managed-wizard-error.mjs';
import {managedJavascriptErrorDetailsFixture} from './support/javascript-managed-error-details-fixture.mjs';
import {javascriptWizardDiagnostic} from '../lib/javascript-wizard-recovery.mjs';
import {createRedactor} from '../lib/redact.mjs';

for(const stage of ['code_next','done'])for(const auto of [false,true])test('actual capture required details uses one toggle, fresh OK and verified close '+stage+'/'+auto,async()=>{
  const f=await managedJavascriptErrorDetailsFixture({auto,stage}),primary=f.dialog.innerText;
  const result=await captureManagedJavascriptWizardError({...f.options,require_details:true});
  assert.deepEqual(f.calls,auto?['details','ok']:['button','details','ok']);assert.equal(f.dialogs.length,0);
  assert.equal(result.dialog_text,primary);assert.equal(result.dialog_closed,true);assert.equal(result.source_sha256,f.sha);
  assert.equal(result.technical_details.expanded,true);assert.equal(result.technical_details.truncated,false);
  assert.equal(result.technical_details.text,f.text.innerText);assert.equal(f.lease.errorDetailsAttempted,true);
  assert.equal(f.events.filter(e=>e.phase==='javascript_managed_error_details_prepared').length,1);
  assert.equal(f.events.filter(e=>e.phase==='javascript_managed_error_details_observed').length,1);
});

test('default sufficient primary uses no details gesture or hidden text',async()=>{
  const f=await managedJavascriptErrorDetailsFixture(),result=await captureManagedJavascriptWizardError(f.options);
  assert.deepEqual(f.calls,['ok']);assert.equal(result.technical_details,undefined);
  assert.equal(f.held.errorDetailsBinding,undefined);assert.equal(f.text.innerText,'');
});

for(const reason of ['unrecognized','truncated'])test('auto policy expands actual '+reason+' primary and returns bounded diagnostic',async()=>{
  const f=await managedJavascriptErrorDetailsFixture();
  if(reason==='unrecognized'){f.error.tip='Причина не определена';f.dialog.innerText='Причина не определена\nOK';}
  if(reason==='truncated')f.dialog.innerText='x'.repeat(5000);
  const after={...f.read(),owner:f.task.owner,wizard_error_refusal:true,pending_seen:false};
  const result=await captureManagedJavascriptWizardError({...f.options,after});
  assert.deepEqual(f.calls,['details','ok']);assert.equal(result.technical_details.expanded,true);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=16384);
  assert.equal(javascriptWizardDiagnostic(result,f.task.owner).error_class.name,'SyntaxError');
});

for(const phase of ['javascript_managed_error_details_prepared','javascript_managed_error_details_returned','javascript_managed_error_details_observed'])test('details ACK change at '+phase+' refuses without later OK',async()=>{
  const f=await managedJavascriptErrorDetailsFixture();
  await assert.rejects(captureManagedJavascriptWizardError({...f.options,require_details:true,
    record:async event=>event.phase===phase?{...event,...(phase.endsWith('returned')?{gesture_id:'foreign'}:{source_sha256:'b'.repeat(64)})}:f.options.record(event)}),/ACK differs/);
  assert.deepEqual(f.calls,phase.endsWith('prepared')?[]:['details']);
  assert.equal(f.dialogs.length,1);assert.equal(f.lease.errorOkAttempted,undefined);
});

test('lost details reply retains its one-flight flag and never sends OK or retries toggle',async()=>{
  const f=await managedJavascriptErrorDetailsFixture();
  await assert.rejects(captureManagedJavascriptWizardError({...f.options,require_details:true,
    execute:async code=>{const result=await f.execute(code);if(f.calls.includes('details'))throw Error('lost details reply');return result;}}),/lost details reply/);
  assert.deepEqual(f.calls,['details']);assert.equal(f.lease.errorDetailsAttempted,true);assert.equal(f.lease.errorOkAttempted,undefined);
});

test('serialized details gesture rejects point drift and replay; expanded read needs the attempted lease',async()=>{
  const f=await managedJavascriptErrorDetailsFixture();
  await assert.rejects(f.execute(makeJavascriptManagedErrorReadCode({...f.base,mode:'expanded'})),/lease unavailable/);
  const read=await f.execute(makeJavascriptManagedErrorReadCode({...f.base,mode:'details'}));
  const task={...f.base,mode:'details',dialog:read.dialog,point:read.point,gesture_id:f.task.operation_id+':error-details'};
  assert.equal((await f.execute(makeJavascriptManagedErrorGestureCode({...task,point:{...task.point,x:999}}))).status,'NOT_APPLIED');
  assert.deepEqual(f.calls,[]);
  assert.equal((await f.execute(makeJavascriptManagedErrorGestureCode(task))).status,'SUCCEEDED');
  assert.equal((await f.execute(makeJavascriptManagedErrorGestureCode(task))).status,'NOT_APPLIED');assert.deepEqual(f.calls,['details']);
});

test('details text drift after observed ACK blocks the upcoming OK',async()=>{
  const f=await managedJavascriptErrorDetailsFixture();
  await assert.rejects(captureManagedJavascriptWizardError({...f.options,require_details:true,record:async event=>{
    if(event.phase==='javascript_managed_error_details_observed')f.text.innerText+=' drift';
    return f.options.record(event);
  }}),/expanded diagnostic changed/);assert.deepEqual(f.calls,['details']);assert.equal(f.dialogs.length,1);
});

test('unconfirmed details visibility consumes only the original deadline without toggle replay or OK',async()=>{
  const f=await managedJavascriptErrorDetailsFixture({expand:false});f.task.deadline=Date.now()+120;
  f.lease.identity=JSON.stringify([f.task.owner,f.task.workflow_ref,f.task.targetOrigin,f.task.targetBuild,f.task.deadline]);
  await assert.rejects(captureManagedJavascriptWizardError({...f.options,require_details:true,
    wait:async()=>new Promise(resolve=>setTimeout(resolve,5))}),/deadline expired|lease unavailable|modal changed/);
  assert.deepEqual(f.calls,['details']);assert.equal(f.lease.errorOkAttempted,undefined);
});

test('technical text is UTF8 bounded and redacted before durable observation and result',async()=>{
  const f=await managedJavascriptErrorDetailsFixture({technicalText:'SyntaxError: value (:4:33) password=secret-value\n'+ '😀'.repeat(2000)});
  const result=await captureManagedJavascriptWizardError({...f.options,require_details:true,redactor:createRedactor(['secret-value'])});
  assert.equal(result.technical_details.truncated,true);assert.equal(result.technical_details.text.isWellFormed(),true);
  assert.ok(!JSON.stringify([result,f.events]).includes('secret-value'));
  const diagnostic=javascriptWizardDiagnostic(result,f.task.owner);
  assert.ok(Buffer.byteLength(diagnostic.technical_details.text)<=2048);assert.equal(diagnostic.technical_details.truncated,true);
});

for(const [name,change] of [
 ['source',f=>f.lease.sourceEditorCaptured.doc.getLine=()=> 'foreign'],
 ['point',f=>f.button.rect.x++],['controller',f=>f.view.Controller={}],
 ['foreign modal',f=>f.dialogs.push(f.element('foreign','msgbox-2'))],
])test('fresh pre-gesture inspection after details prepared ACK refuses '+name,async()=>{
 const f=await managedJavascriptErrorDetailsFixture();
 await assert.rejects(captureManagedJavascriptWizardError({...f.options,require_details:true,record:async event=>{
  if(event.phase==='javascript_managed_error_details_prepared')change(f);return f.options.record(event);
 }}),/changed|unconfirmed/);assert.deepEqual(f.calls,[]);assert.equal(f.lease.errorDetailsAttempted,undefined);
});

for(const mode of ['text','dialog'])test('fresh OK inspection after prepared ACK refuses '+mode+' drift without OK',async()=>{
 const f=await managedJavascriptErrorDetailsFixture();
 await assert.rejects(captureManagedJavascriptWizardError({...f.options,require_details:true,record:async event=>{
  if(event.phase==='javascript_managed_error_ok_prepared'){
   if(mode==='text')f.text.innerText+=' changed';if(mode==='dialog')f.dialog.innerText+=' changed';
  }
  return f.options.record(event);
 }}),/changed/);assert.deepEqual(f.calls,['details']);assert.equal(f.lease.errorOkAttempted,undefined);
});
