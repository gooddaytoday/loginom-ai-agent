import test from 'node:test';
import assert from 'node:assert/strict';
import {makeJavascriptManagedStageCode} from '../lib/javascript-managed-stage.mjs';
import {managedJavascriptStageFixture} from './support/javascript-managed-stage-fixture.mjs';
test('actual serialized managed stage reader retains native wizard lease and exposes bounded quiet error snapshot',async()=>{
 const f=managedJavascriptStageFixture();f.error.rect.width=30;
 const result=await f.run();assert.equal(result.native_owner_verified,true);assert.equal(result.owner_verified,true);
 assert.equal(result.wizard_error.visible,true);assert.equal(result.wizard_error.tooltip,'SyntaxError: Syntax error at code (:4:33)');
 assert.equal(result.page_tid,'MF;TF-1;WizrdMCF;JavaScriptCodeWizard');assert.deepEqual(result.owner,f.task.owner);
 assert.ok(Buffer.byteLength(JSON.stringify(result))<=16384);
});
for(const change of [f=>f.ledger.clear(),f=>f.lease.identity='foreign',f=>f.lease.settingAttempted=false,
 f=>f.lease.wizardCaptured=null,f=>f.held.preparation={},f=>f.held.receipt.phase='foreign',
 f=>f.native.ParentNode.FGuid='foreign',f=>f.native.ParentNode.FModelNode={},f=>f.native.ParentNode.ParentNode={},
 f=>f.binding.workflow.ParentNode={},f=>f.context.bg.app.Application.FInstance.FMainForm.FMapTree.PackageNodes.Count=2,
 f=>f.tab.Controller.Node.data.node={},f=>f.connection.UserName='foreign',
 f=>f.connection.Connected=false,f=>f.context.bg.app.Version='other',f=>f.context.location.origin='https://foreign.invalid',
 f=>f.task.deadline=Date.now()-1,f=>f.held.wizardRoot={getAttribute:()=> 'foreign'}])
 test('actual managed stage rejects retained identity/connection drift '+change.toString(),async()=>{
  const f=managedJavascriptStageFixture();change(f);await assert.rejects(f.run,/changed|unavailable/);
 });
test('actual managed stage rejects an oversized native message inventory before returning a response',async()=>{
 const f=managedJavascriptStageFixture(),query=f.root.querySelectorAll;
 f.root.querySelectorAll=selector=>selector.includes('bg-error')?Array.from({length:64},(_,index)=>({...f.element('message'+index,'error'+index),textContent:'Ё'.repeat(1000)})):query(selector);
 await assert.rejects(f.run,/response bound/);
});

test('serialized stage keeps ordinary plain masks pending, independently of loading messages',async()=>{
 const f=managedJavascriptStageFixture();f.previews.length=0;f.plainMasks.push(f.element('mask',''));
 const result=await f.run();assert.equal(result.pending,true);assert.equal(result.mask_diagnostic.modal_count,0);
 assert.equal(result.mask_diagnostic.visible_count,1);
});
