import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {waitManagedJavascriptDoneSettlement,makeJavascriptManagedDoneOutcomeCode} from '../lib/javascript-managed-done-settlement.mjs';
import {captureManagedJavascriptWizardError,makeJavascriptManagedErrorReadCode} from '../lib/javascript-managed-wizard-error.mjs';
import {inspectManagedJavascriptClosePoint,runManagedJavascriptCloseGesture} from '../lib/javascript-managed-close.mjs';
import {managedJavascriptErrorFixture} from './support/javascript-managed-error-fixture.mjs';

function fixture() {
  const f=managedJavascriptErrorFixture({stage:'done'});
  const options={...f.options,before:{...f.before,owner:f.task.owner,mask_diagnostic:{foreign_count:0}}};
  const outcome=()=>f.execute(makeJavascriptManagedDoneOutcomeCode({...f.task,expected_source_sha256:f.sha}));
  return {...f,options,outcome};
}

test('real Done outcome reads the same hidden full source and two fresh native refusals',async()=>{
  const f=fixture(),after=await waitManagedJavascriptDoneSettlement(f.options);
  assert.equal(after.wizard_error_refusal,true);assert.equal(after.page_tid,f.after.page_tid);
  assert.equal(f.events[0].phase,'javascript_managed_done_refused');assert.deepEqual(f.calls,[]);
  const diagnostic=await captureManagedJavascriptWizardError({...f.options,after});
  assert.equal(diagnostic.error_stage,'done');assert.equal(diagnostic.dialog_closed,true);
  assert.equal(f.held.errorDialogClosedFor,f.after.page_tid);assert.deepEqual(f.calls,['button','ok']);
});

for(const [name,change] of [
  ['Done not dispatched',f=>f.lease.doneAttempted=false],['Close already attempted',f=>f.lease.closeAttempted=true],
  ['draft text',f=>f.lease.sourceEditorCaptured.doc.getLine=()=> 'foreign'],
  ['editor remounted',f=>f.lease.sourceEditorCaptured.cm={}],['Code visible',f=>f.code.rect.width=100],
  ['wrapper visible',f=>f.lease.sourceEditorCaptured.wrapper.rect.width=100],
  ['native Code page',f=>f.context.Ext.getCmp=id=>({})],['account',f=>f.connection.UserName='foreign'],
  ['owner',f=>f.native.ParentNode.FGuid='foreign'],
])test('real Done outcome refuses changed '+name+' without gestures',async()=>{
  const f=fixture();change(f);await assert.rejects(f.outcome,/changed|unavailable/);assert.deepEqual(f.calls,[]);
});

test('Done observes more than sixty owned pending reads without extending the original deadline',async()=>{
  const f=fixture(),symbol=Symbol('owned-mask');let polls=0;
  f.context.bg.ext={AfterElementTextMaskContext:{ElementSymb:symbol}};
  f.model.FView[symbol]={FController:f.model.FView,FElement:f.root,FIsActive:true,FSequence:['Загрузка']};
  const result=await waitManagedJavascriptDoneSettlement({...f.options,execute:async code=>{
    if(++polls<=65)f.masks.push(f.root);else f.masks.length=0;
    return f.execute(code);
  }});
  assert.equal(result.wizard_error_refusal,true);assert.equal(result.pending_seen,true);assert.equal(polls,67);
  assert.equal(f.events[0].deadline,f.task.deadline);assert.deepEqual(f.calls,[]);
});

test('foreign masks/dialogs cannot turn Done into a known recoverable refusal',async()=>{
  for(const foreign of ['mask','dialog']) {
    const f=fixture();if(foreign==='mask')f.masks.push(f.element('foreign',''));
    else f.dialogs.push(f.element('foreign','other-dialog'));
    await assert.rejects(waitManagedJavascriptDoneSettlement(f.options),/owner or mask changed|boundary refused/);
    assert.deepEqual(f.calls,[]);assert.deepEqual(f.events,[]);
  }
});

test('same stale Done error expires under the original deadline without diagnostic or cleanup',async()=>{
  const f=fixture();f.task.deadline=Date.now()+30;
  f.lease.identity=JSON.stringify([f.task.owner,f.task.workflow_ref,f.task.targetOrigin,f.task.targetBuild,f.task.deadline]);
  await assert.rejects(waitManagedJavascriptDoneSettlement({...f.options,before:{...f.after,mask_diagnostic:{foreign_count:0}},
    wait:ms=>new Promise(resolve=>setTimeout(resolve,Math.min(ms,5)))}),/original deadline expired|lease unavailable/);
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.events,[]);
});

test('changed Done refusal ACK leaves the possible effect unresolved',async()=>{
  const f=fixture();await assert.rejects(waitManagedJavascriptDoneSettlement({...f.options,
    record:async event=>{event.owner.node_id='foreign';return event;}}),/ACK differs/);
  assert.deepEqual(f.calls,[]);assert.equal(f.task.owner.node_id,'node');
});

test('Done Close requires the browser-local diagnostic/OK/full hidden draft proof',async()=>{
  const f=fixture(),task={...f.task,error_stage:'done',cleanup_deadline:f.task.deadline};
  const button=f.element('close','MF;TF-1;WizrdMCF;btnClose');button.closest=()=>null;
  f.controls[button.id]={el:{dom:button}};
  const query=f.root.querySelectorAll;
  f.root.querySelectorAll=selector=>selector.includes('btnClose')?[button]:query(selector);
  f.context.read=()=>({ready:true,node_guid:'node',page:{tid:f.after.page_tid,visible_editors:0}});
  const source=await import('../lib/javascript-managed-wizard-error.mjs');
  f.context.draft=vm.runInContext('('+source.inspectManagedJavascriptErrorDraft.toString()+')',f.context);
  f.context.args={held:f.held,task,editor:f.lease.sourceEditorCaptured,expectedSource:f.lease.sourceDraftText};
  const inspect=()=>vm.runInContext('('+inspectManagedJavascriptClosePoint.toString()+')(args,read,draft)',f.context);
  assert.throws(inspect,/owner unavailable/);
  await captureManagedJavascriptWizardError(f.options);f.context.document.elementFromPoint=()=>button;
  const point=inspect();assert.equal(point.page_tid,f.after.page_tid);
  let clicks=0;f.page.mouse.click=async()=>{clicks++;};f.page.evaluate=async()=>inspect();
  const close={...task,point,gesture_id:task.operation_id+':close'};
  assert.equal((await runManagedJavascriptCloseGesture(f.page,close,inspect)).status,'SUCCEEDED');
  assert.equal((await runManagedJavascriptCloseGesture(f.page,close,inspect)).status,'NOT_APPLIED');assert.equal(clicks,1);
  f.lease.sourceEditorCaptured.doc.getLine=()=> 'changed';assert.throws(inspect,/source changed/);
});

test('Code-stage capability cannot be relabelled Done, nor closure admitted without native OK',async()=>{
  const f=fixture();
  assert.throws(()=>makeJavascriptManagedErrorReadCode({...f.base,error_stage:'code_next',mode:'button'}),/Invalid/);
  await assert.rejects(()=>f.execute(makeJavascriptManagedErrorReadCode({...f.base,mode:'closed'})),/lease unavailable/);
});

test('Done graph return reuses native Close identity, lock, mask and rendered type guards',async()=>{
  const f=fixture();f.root.rect.width=0;f.held.binding.document=f.context.document;
  const native={FGuid:'node',FIconCls:'bg-vendor-icon-javascript',FCell:{},FLocked:true};
  const shape=f.element('shape','MF;TF-1;Graph;node'),graphRoot=f.element('graph','MF;TF-1;ModelForm;cmpDiagram');
  graphRoot.contains=e=>e===shape;
  class ModelForm {}
  const model=new ModelForm();model.FDiagram={FNodes:{FCollection:[native]},FmxGraph:{container:graphRoot,
    view:{getState:()=>({shape:{node:shape}})}}};
  f.context.bg.app.ModelForm=ModelForm;f.tab.Controller.Node.data.node=f.binding.workflow;f.tab.Controller.FController=model;
  f.held.node={tid:shape.tid};f.error.rect.width=0;
  const query=f.context.document.querySelectorAll;
  f.context.document.querySelectorAll=selector=>selector.includes('cmpDiagram')?[graphRoot]:query(selector);
  assert.equal((await f.outcome()).state,'waiting');
  f.masks.push(f.element('foreign-mask',''));await assert.rejects(f.outcome,/foreign loading mask/);f.masks.length=0;
  native.FLocked=false;
  assert.equal((await f.outcome()).state,'closed');
  const result=await waitManagedJavascriptDoneSettlement({...f.options,execute:async code=>
    code.includes('readJavascriptExistingGraphType')?{verified:true,node_id:'node',graph_tid:shape.tid}:f.execute(code)});
  assert.equal(result.owned_done_settled,true);assert.deepEqual(f.calls,[]);
  f.masks.push(f.element('foreign-mask',''));await assert.rejects(f.outcome,/foreign loading mask/);
  f.masks.length=0;f.tab.Controller.Node.data.node={};await assert.rejects(f.outcome,/foreign active owner/);
});

test('Done retained source compares every LF line and refuses Unicode byte overflow',async()=>{
 const f=fixture(),doc=f.lease.sourceEditorCaptured.doc;
 doc.lineCount=()=>2;doc.lastLine=()=>1;doc.getLine=index=>index?'var tail=2;':'var first="ё😀";';
 f.lease.sourceDraftText='var first="ё😀";\nvar tail=2;';
 assert.equal((await f.outcome()).state,'wizard');
 doc.getLine=index=>index?'var tail=3;':'var first="ё😀";';await assert.rejects(f.outcome,/source changed/);
 doc.getLine=()=> 'ё'.repeat(16385);await assert.rejects(f.outcome,/byte bound exceeded/);
});
