import test from 'node:test';
import assert from 'node:assert/strict';
import {managedJavascriptErrorFixture} from '../../client/test/support/javascript-managed-error-fixture.mjs';
import {makeJavascriptManagedErrorReadCode} from '../../client/lib/javascript-managed-wizard-error.mjs';
import {readJavascriptNativeDetailsInventory,captureJavascriptNativeDetailsInventory,javascriptImportRefusalSource,javascriptNaturalRegexRefusalSource,observeJavascriptNaturalDetailsPolicy} from './javascript-native-details-discovery.mjs';
import {inspectJavascriptModulePolicy} from '../../client/lib/javascript-module-policy.mjs';
import {javascriptDiscoveryProbe} from './javascript-discovery-probes.mjs';

async function fixture() {
  const f=managedJavascriptErrorFixture({auto:true});
  await f.execute(makeJavascriptManagedErrorReadCode({...f.base,mode:'dialog'}));
  f.context.bg.ext={errormessage:{ErrorMsg:{FInstance:{FMessageBox:f.dialogComponent,FDetails:{FItems:{}}}}}};
  const request={held:f.held,owner:f.task.owner,source_sha256:f.sha,ok_tid:f.ok.tid};
  return {...f,request,event:{phase:'javascript_managed_error_ok_prepared',operation_id:f.task.operation_id,
    owner:f.task.owner,source_sha256:f.sha,deadline:f.task.deadline,point:{tid:f.ok.tid}}};
}

test('serialized discovery reads the exact captured native modal without gestures or hidden exception getters',async()=>{
  const f=await fixture();
  Object.defineProperty(f.context.bg.ext.errormessage.ErrorMsg.FInstance.FDetails,'Items',{get(){throw Error('getter called');}});
  const result=await f.page.evaluate(readJavascriptNativeDetailsInventory,f.request);
  assert.equal(result.native_details_owner_verified,true);assert.equal(result.read_only,true);
  assert.equal(result.source_sha256,f.sha);assert.equal(result.dialog_tid,f.dialog.tid);
  assert.deepEqual(f.calls,[]);assert.equal(f.dialogs.length,1);
  assert.equal(result.controls[0].tid,f.ok.tid);assert.equal(result.controls[0].native_el,true);
  assert.equal(result.controls[0].text,'OK');assert.equal(result.text_truncated,false);
});

test('host discovery uses the original owned lease and returns the actual read-only inventory',async()=>{
  const f=await fixture(),result=await captureJavascriptNativeDetailsInventory(f.page,f.event);
  assert.equal(result.native_details_owner_verified,true);assert.equal(result.source_sha256,f.sha);
  assert.equal(result.controls[0].tid,f.event.point.tid);assert.deepEqual(f.calls,[]);
  assert.equal(f.lease.errorOkAttempted,undefined);
});

for(const [name,change] of [
  ['foreign modal',f=>f.held.errorDialogRoot=f.element('foreign','foreign')],
  ['second modal',f=>f.dialogs.push(f.element('foreign','foreign'))],
  ['stale OK',f=>f.request.ok_tid='foreign;tlb;ok'],
  ['control bound',f=>f.dialog.querySelectorAll=()=>Array(257).fill(f.ok)],
])test('serialized read-only discovery refuses '+name+' without any action',async()=>{
  const f=await fixture();change(f);
  await assert.rejects(f.page.evaluate(readJavascriptNativeDetailsInventory,f.request),/modal changed|control bound/);
  assert.deepEqual(f.calls,[]);
});

for(const [name,change] of [
  ['wrong phase',f=>f.event.phase='javascript_managed_error_button_prepared'],
  ['wrong source',f=>f.event.source_sha256='b'.repeat(64)],
  ['Next missing',f=>f.lease.codeNextAttempted=false],
  ['OK attempted',f=>f.lease.errorOkAttempted=true],
  ['expired',f=>f.event.deadline=Date.now()-1],
])test('host discovery refuses '+name+' before evaluating the page',async()=>{
  const f=await fixture();let reads=0;f.page.evaluate=async()=>{reads++;};change(f);
  await assert.rejects(captureJavascriptNativeDetailsInventory(f.page,f.event),/prepared owned OK|lease unavailable/);
  assert.equal(reads,0);assert.deepEqual(f.calls,[]);
});

test('fixed long missing export stays within source bounds and is admitted only as supported module syntax',()=>{
  const baseline=javascriptDiscoveryProbe('p1-business-code-base').source;
  const source=javascriptImportRefusalSource(baseline),result=inspectJavascriptModulePolicy(source);
  assert.equal(result.status,'ADMITTED');assert.equal(source.split('\n').length,18);
  assert.equal(source.startsWith(baseline+'\nimport { E_JS_UNKNOWN_EXPORT_'),true);
  assert.equal(source.endsWith('Z'.repeat(4500)+' } from "builtIn/Data";\n'),true);
  assert.equal(result.source_utf8_bytes,Buffer.byteLength(source));assert.ok(result.source_utf8_bytes<32768);
});


test('natural regex diagnostic source is fixed, bounded, admitted and has no extra API or forced-details switch',()=>{
  const original='import {GetInputTable} from "builtIn/Data";\nconst input = GetInputTable();';
  const source=javascriptNaturalRegexRefusalSource(original);
  assert.equal(source,original+'\nconst diagnosticRegex = /(?<=Error: )x/;\n');
  assert.equal(inspectJavascriptModulePolicy(source).status,'ADMITTED');
  assert.equal(source.split('const diagnosticRegex = ').length,2);
  assert.ok(Buffer.byteLength(source)<32768);assert.equal(source.split('\n').length,4);
});


test('natural details policy separates sufficient, insufficient and no wizard observations without inventing acceptance',()=>{
  const native={kind:'javascript_wizard',tooltip:'SyntaxError: Syntax error at code (:17:26)',
    dialog_text:'SyntaxError: Syntax error at code (:17:26)',tooltip_truncated:false,dialog_text_truncated:false};
  assert.equal(observeJavascriptNaturalDetailsPolicy(native).status,'sufficient_primary');
  assert.equal(observeJavascriptNaturalDetailsPolicy(null).status,'no_wizard_refusal_observed');
  for(const patch of [{tooltip_truncated:true},{dialog_text_truncated:true},{tooltip:'Error: unknown',dialog_text:'unknown'},
    {tooltip:'unknown',dialog_text:'unknown'}]){
    const insufficient={...native,...patch};assert.throws(()=>observeJavascriptNaturalDetailsPolicy(insufficient),/policy differs/);
    const result=observeJavascriptNaturalDetailsPolicy({...insufficient,technical_details:{expanded:true}});
    assert.equal(result.status,'insufficient_primary');assert.equal(result.insufficient_primary_verified,true);
    assert.equal(result.require_details,false);
  }
  assert.throws(()=>observeJavascriptNaturalDetailsPolicy({...native,technical_details:{expanded:true}}),/policy differs/);
  assert.throws(()=>observeJavascriptNaturalDetailsPolicy({...native,tooltip_truncated:undefined}),/provenance/);
});
