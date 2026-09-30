import {test} from 'node:test';
import assert from 'node:assert/strict';
import {javascriptStageFixture} from '../../client/test/support/javascript-stage-fixture.mjs';
import {readJavascriptStage,recordJavascriptStageChange,closeJavascriptPreviewOnce,javascriptStageTerminal,requireJavascriptStageAdmission,waitJavascriptStageObservation} from './javascript-stage-observer.mjs';


test('serialized observer binds portal Preview through owned code wizard and reciprocal form view',()=>{
  const f=javascriptStageFixture(),result=f.read();
  assert.notEqual(f.controller.FView,f.codeView);assert.notEqual(f.codeView.Controller,f.controller);
  assert.equal(f.root.contains(f.preview),false);assert.equal(f.previewView.ownerCt,undefined);
  assert.equal(result.preview_owned,true);assert.equal(result.preview_settled,true);
  assert.equal(result.preview_diagnostic.code_owned,true);assert.equal(result.preview_diagnostic.roots[0].native_reciprocal,true);
});

test('same tid, DOM containment or Ext owner chain cannot substitute native form ownership',()=>{
  for(const change of [f=>f.controller.FWizardForm={},f=>f.item.FPages=[],f=>f.controller.FPreviewController={},
    f=>f.form.FView={el:{dom:f.preview}},f=>f.previewView.Controller={},f=>f.tab.Controller.FController.FModelNode={},
    f=>f.previews.push(f.element('duplicate',f.preview.tid))]){
    const f=javascriptStageFixture();f.previewView.ownerCt=f.model.FView;change(f);
    assert.equal(f.read().preview_owned,false);assert.equal(f.read().preview_settled,false);
  }
});

test('hidden, offscreen, stale ancestor and native hidden Preview fail ownership admission',()=>{
  for(const change of [f=>f.preview.style.display='none',f=>f.preview.style.visibility='hidden',
    f=>f.preview.rect.x=1100,f=>f.previewView.hidden=true,f=>f.preview.isConnected=false,
    f=>{f.preview.parentElement=f.element('hidden','');f.preview.parentElement.style.display='none';},
    f=>{f.preview.parentElement=f.preview;}]){
    const f=javascriptStageFixture();change(f);assert.equal(f.read().preview_owned,false);
  }
});

test('local UI accessors and server proxy fields are never invoked',()=>{
  const f=javascriptStageFixture();let calls=0;
  const poison={get(){calls++;throw Error('getter invoked');}};
  for(const field of ['FEngine','FPreview','View','WizardForm'])Object.defineProperty(f.controller,field,poison);
  Object.defineProperty(f.form,'Preview',poison);Object.defineProperty(f.previewView,'isVisible',poison);
  assert.equal(f.read().preview_owned,true);
  Object.defineProperty(f.controller,'FPreviewController',poison);
  assert.equal(f.read().preview_owned,false);assert.equal(calls,0);
});

test('owned preview includes only its current visible messages; loading remains unsettled',()=>{
  const f=javascriptStageFixture(),message=f.element('message',f.preview.tid+';colMessage_0');message.textContent='sentinel';
  f.preview.querySelectorAll=()=>[message];f.form.FLoaded=false;
  const loading=f.read();assert.equal(loading.preview_owned,true);assert.equal(loading.preview_settled,false);
  assert.equal(loading.messages[0].text,'sentinel');
  f.form.FLoaded=true;assert.equal(f.read().preview_settled,true);
  f.previewView.Controller={};assert.equal(f.read().messages.length,0);
});

test('diagnostic inventories have fixed bounds and no foreign text payload',()=>{
  const f=javascriptStageFixture();for(let i=0;i<20;i++)f.previews.push(f.element('other'+i,f.preview.tid));
  const result=f.read();assert.equal(result.preview_diagnostic.exact_count,21);
  assert.equal(result.preview_diagnostic.roots.length,3);assert.equal(result.preview_owned,false);
  assert.equal(JSON.stringify(result.preview_diagnostic).includes('textContent'),false);
});

test('changed-state journal suppresses unchanged polls and stops at sixteen records',async()=>{
  const f=javascriptStageFixture(),state={count:0},records=[],identity={effect_id:'original'};
  const record=async value=>records.push(value);
  for(let i=0;i<200;i++)await recordJavascriptStageChange({state,identity,snapshot:f.read(),record});
  assert.equal(records.length,1);
  for(let i=0;i<40;i++){f.preview.rect.x=i;await recordJavascriptStageChange({state,identity,snapshot:f.read(),record});}
  assert.equal(records.length,16);assert.equal(records.at(-1).last_diagnostic_slot,true);
  assert.ok(records.every(e=>e.identity===identity));
});

test('cleanup closes proven settled Preview once and refuses owner/loading/mask changes',async()=>{
  for(const fault of ['none','foreign','loading','mask','lost','journal']){
    const f=javascriptStageFixture(),state={},events=[];
    if(fault==='foreign')f.controller.FWizardForm={};if(fault==='loading')f.form.FLoaded=false;
    if(fault==='mask')f.masks.push(f.element('mask',''));
    const run=()=>closeJavascriptPreviewOnce({read:f.read,state,record:async()=>{events.push('record');if(fault==='journal')throw Error('journal');},
      close:async()=>{events.push('close');if(fault==='lost')throw Error('lost');},waitHidden:async()=>events.push('hidden')});
    if(fault==='none'){await run();assert.deepEqual(events,['record','close','hidden']);}
    else await assert.rejects(run());
    if(['none','lost','journal'].includes(fault)){await assert.rejects(run(),/do not replay/);assert.equal(events.filter(e=>e==='close').length,fault==='journal'?0:1);}
    else assert.deepEqual(events,[]);
  }
});

test('Preview waits for local completion even when a fresh sentinel arrives during loading',()=>{
  const before={messages:[]},after={owner_verified:true,preview_owned:true,pending:false,preview_visible:true,preview_settled:false,messages:[{id:'fresh'}]};
  assert.equal(javascriptStageTerminal({stage:'preview',before,after}),false);
  after.preview_settled=true;assert.equal(javascriptStageTerminal({stage:'preview',before,after}),true);
  after.owner_verified=false;assert.equal(javascriptStageTerminal({stage:'preview',before,after}),false);
  after.owner_verified=true;after.preview_settled=false;after.preview_visible=false;
  assert.equal(javascriptStageTerminal({stage:'preview',before,after}),false);
  after.pending=true;assert.equal(javascriptStageTerminal({stage:'preview',before,after}),false);
});

test('wizard collection admission requires unique dense bounded local item/page arrays',()=>{
  for(const change of [f=>f.model.FWizardItems.FItems.push(f.item),
    f=>f.model.FWizardItems.FItems.push({...f.item}),f=>f.item.FPages.push(f.codeView),
    f=>f.item.FPages=Array(1),f=>f.model.FWizardItems.FItems=Array(33).fill(f.item),
    f=>f.item.FPages=Array(33).fill(f.codeView),f=>f.item.FPages={},f=>f.item.FWizard={}]){
    const f=javascriptStageFixture();change(f);const snapshot=f.read();assert.equal(snapshot.preview_diagnostic.code_owned,false);
    assert.equal(snapshot.preview_owned,false);assert.ok(Object.values(snapshot.preview_diagnostic.code_checks).includes(false));
  }
  const f=javascriptStageFixture();let getterCalls=0;
  Object.defineProperty(f.item.FPages,'0',{get(){getterCalls++;throw Error('array accessor');}});
  assert.equal(f.read().preview_diagnostic.code_checks.pages_data_unique_bounded,false);assert.equal(getterCalls,0);
});

test('connection loss invalidates stale native owner and causes immediate read-only wait refusal',async()=>{
  const f=javascriptStageFixture(),before=f.read(),records=[];f.connection.Connected=false;
  let reads=0,waits=0;
  const after=await waitJavascriptStageObservation({read:async()=>{reads++;return f.read();},wait:async()=>{waits++;},
    deadline:Date.now()+5000,stage:'preview',before,identity:{effect_id:'once'},record:async e=>records.push(e)});
  assert.equal(after.native_owner_verified,true);assert.equal(after.owner_verified,false);
  assert.equal(after.boundary_refusal,'connection_unavailable');assert.equal(after.messages.length,0);
  assert.equal(reads,1);assert.equal(waits,0);assert.equal(records[0].diagnostic.connection_diagnostic.connected,false);
  for(const stage of ['preview','next','done'])assert.equal(javascriptStageTerminal({stage,before,after}),false);
  const effects=[];await assert.rejects(closeJavascriptPreviewOnce({read:f.read,state:{},record:async()=>effects.push('record'),
    close:async()=>effects.push('close'),waitHidden:async()=>effects.push('wait')}),/connection_unavailable/);
  assert.deepEqual(effects,[]);
});

test('foreign session dialogs refuse while exact owned wizard and Preview dialogs remain admitted',()=>{
  const f=javascriptStageFixture();f.dialogs.push(f.root,f.preview);assert.equal(f.read().owner_verified,true);
  const foreign=f.element('session','msgbox');Object.defineProperty(foreign,'textContent',{get(){throw Error('foreign payload');}});
  f.dialogs.push(foreign);const snapshot=f.read();assert.equal(snapshot.boundary_refusal,'foreign_dialog');
  assert.equal(snapshot.owner_verified,false);assert.equal(snapshot.preview_owned,false);
  assert.equal(snapshot.dialog_diagnostic.foreign_count,1);assert.equal(snapshot.dialog_diagnostic.roots[0].tid,'msgbox');
  f.dialogs.length=0;f.connection.UserName='other';assert.equal(f.read().boundary_refusal,'account_changed');
  f.connection.UserName='jsteach';f.context.bg.app.Version='other';assert.equal(f.read().boundary_refusal,'build_changed');
});

test('Preview preflight refuses unbound code before effects but permits lazily absent Preview controller',async()=>{
  const f=javascriptStageFixture();delete f.controller.FPreviewController;f.previews.length=0;
  const records=[],identity={effect_id:'original'};
  const admit=()=>requireJavascriptStageAdmission({stage:'preview',before:f.read(),identity,record:async e=>records.push(e)});
  await admit();assert.equal(records.length,0);
  f.item.FPages=[];let dispatches=0;
  await assert.rejects(async()=>{await admit();dispatches++;},/code_owner_unconfirmed/);
  assert.equal(dispatches,0);assert.equal(records[0].effect_dispatched,false);
  assert.equal(records[0].before.preview_diagnostic.code_checks.item_unique,false);
  f.connection.Connected=false;await assert.rejects(admit(),/connection_unavailable/);
});

test('wait returns immediate connection refusal even after changed-state diagnostic cap is exhausted',async()=>{
  const f=javascriptStageFixture(),before=f.read(),records=[];let reads=0;
  f.form.FLoaded=false;
  const after=await waitJavascriptStageObservation({read:async()=>{
    reads++;f.preview.rect.x=reads;if(reads===20)f.connection.Connected=false;return f.read();},wait:async()=>{},
    deadline:Date.now()+5000,stage:'preview',before,identity:{effect_id:'once'},record:async e=>records.push(e)});
  assert.equal(reads,20);assert.equal(records.length,16);assert.equal(after.boundary_refusal,'connection_unavailable');
  assert.equal(javascriptStageTerminal({stage:'preview',before,after}),false);
});

test('fresh quiet wizard error ends original Next wait after mask settles without replay',async()=>{
  const f=javascriptStageFixture(),before=f.read(),records=[];let polls=0;
  const after=await waitJavascriptStageObservation({read:async()=>{
    polls++;if(polls===1)f.masks.push(f.element('mask',''));
    if(polls===2){f.masks.length=0;f.error.rect.width=30;}
    return f.read();},wait:async()=>{},deadline:Date.now()+5000,stage:'next',before,
    identity:{effect_id:'once'},record:async event=>records.push(event)});
  assert.equal(polls,3);assert.equal(after.wizard_error_refusal,true);
  assert.equal(after.wizard_error.tooltip,'SyntaxError: Syntax error at code (:4:33)');
  assert.equal(after.page_tid,before.page_tid);assert.equal(after.pending,false);
  assert.ok(records.some(event=>event.diagnostic?.wizard_error?.visible===true));
});

test('fresh wizard error takes precedence over a new generic message',async()=>{
  const f=javascriptStageFixture(),before=f.read();f.error.rect.width=30;
  let polls=0;
  const after=await waitJavascriptStageObservation({read:async()=>{
    polls++;return {...f.read(),messages:[{id:'fresh',key:'error',text:'generic failure'}]};
  },wait:async()=>{},deadline:Date.now()+5000,stage:'next',before,
  identity:{effect_id:'once'},record:async()=>{}});
  assert.equal(polls,2);
  assert.equal(after.wizard_error_refusal,true);
  assert.equal(after.wizard_error.tooltip,'SyntaxError: Syntax error at code (:4:33)');
});

test('stale error button before a corrected transition does not end Next wait',async()=>{
  const f=javascriptStageFixture();f.error.rect.width=30;
  const before=f.read();let polls=0;
  const after=await waitJavascriptStageObservation({read:async()=>{
    polls++;if(polls===2)f.code.tid='MF;TF-1;WizrdMCF;DoneWizard';return f.read();},
    wait:async()=>{},deadline:Date.now()+5000,stage:'next',before,identity:{effect_id:'once'},record:async()=>{}});
  assert.equal(polls,2);assert.equal(after.wizard_error_refusal,undefined);
  assert.equal(javascriptStageTerminal({stage:'next',before,after}),true);
});

test('self-opened native dialog is attributable only with a fresh owned error button',async()=>{
  const f=javascriptStageFixture(),before=f.read();f.error.rect.width=30;
  f.dialogs.push(f.element('dialog','msgbox-1'));
  const after=await waitJavascriptStageObservation({read:async()=>f.read(),wait:async()=>{},
    deadline:Date.now()+5000,stage:'next',before,identity:{effect_id:'once'},record:async()=>{}});
  assert.equal(after.boundary_refusal,'foreign_dialog');assert.equal(after.wizard_error_refusal,true);
  const other=javascriptStageFixture(),prior=other.read();other.dialogs.push(other.element('dialog','msgbox-1'));
  const foreign=await waitJavascriptStageObservation({read:async()=>other.read(),wait:async()=>{},
    deadline:Date.now()+5000,stage:'next',before:prior,identity:{effect_id:'once'},record:async()=>{}});
  assert.equal(foreign.boundary_refusal,'foreign_dialog');assert.equal(foreign.wizard_error_refusal,undefined);
});
