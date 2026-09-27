import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readJavascriptStage,recordJavascriptStageChange,closeJavascriptPreviewOnce,javascriptStageTerminal,requireJavascriptStageAdmission,waitJavascriptStageObservation} from './javascript-stage-observer.mjs';

function fixture() {
  const prefix='MF;TF-1',base=prefix+';WizrdMCF';
  const element=(id,tid)=>({id,tid,isConnected:true,parentElement:null,style:{display:'block',visibility:'visible'},
    rect:{x:20,y:20,width:300,height:200},getBoundingClientRect(){return this.rect;},getAttribute(key){return key==='data-tid'?this.tid:null;},
    contains(other){return this===other;},querySelectorAll(){return [];}});
  const root=element('wizard',base),code=element('code',base+';JavaScriptCodeWizard'),preview=element('preview',base+';JavaScriptOutputPreviewForm');
  root.contains=e=>e===root||e===code;code.parentElement=root;
  root.querySelectorAll=selector=>selector.includes('bg-error')?[]:[code];
  const model={FView:{el:{dom:root}},FModelNode:{}},codeView={el:{dom:code}},previewView={el:{dom:preview},hidden:false};
  const form={FView:previewView,FLoaded:true},controller={FWizardForm:model,FView:{el:{dom:{}}},FPreviewController:{FPreviewForm:form}};
  const item={FWizard:controller,FPages:[codeView]};model.FWizardItems={FItems:[item]};
  codeView.Controller={};previewView.Controller=form;
  const native={},tab={Controller:{Node:{data:{node:native}},FController:model}},binding={tab,nodeData:model.FModelNode};
  const connection={Connected:true,UserName:'jsteach'},dialogs=[];
  const previews=[preview],masks=[],controls={wizard:model.FView,code:codeView,preview:previewView};
  const context=vm.createContext({innerWidth:1000,innerHeight:800,getComputedStyle:e=>e.style,
    document:{querySelectorAll:selector=>selector.includes('bg-mask')?masks:selector.includes('role=')?dialogs:previews},Ext:{getCmp:id=>controls[id]},
    bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:connection},Items:{Workspace:{getActiveTab:()=>tab}}}}}}}});
  const read=()=>vm.runInContext('('+readJavascriptStage.toString()+')',context)({root,native,binding,prefix,account:'jsteach',build:'7.4.2'});
  return {read,context,connection,dialogs,item,root,code,preview,model,codeView,previewView,form,controller,tab,previews,masks,element};
}

test('serialized observer binds portal Preview through owned code wizard and reciprocal form view',()=>{
  const f=fixture(),result=f.read();
  assert.notEqual(f.controller.FView,f.codeView);assert.notEqual(f.codeView.Controller,f.controller);
  assert.equal(f.root.contains(f.preview),false);assert.equal(f.previewView.ownerCt,undefined);
  assert.equal(result.preview_owned,true);assert.equal(result.preview_settled,true);
  assert.equal(result.preview_diagnostic.code_owned,true);assert.equal(result.preview_diagnostic.roots[0].native_reciprocal,true);
});

test('same tid, DOM containment or Ext owner chain cannot substitute native form ownership',()=>{
  for(const change of [f=>f.controller.FWizardForm={},f=>f.item.FPages=[],f=>f.controller.FPreviewController={},
    f=>f.form.FView={el:{dom:f.preview}},f=>f.previewView.Controller={},f=>f.tab.Controller.FController.FModelNode={},
    f=>f.previews.push(f.element('duplicate',f.preview.tid))]){
    const f=fixture();f.previewView.ownerCt=f.model.FView;change(f);
    assert.equal(f.read().preview_owned,false);assert.equal(f.read().preview_settled,false);
  }
});

test('hidden, offscreen, stale ancestor and native hidden Preview fail ownership admission',()=>{
  for(const change of [f=>f.preview.style.display='none',f=>f.preview.style.visibility='hidden',
    f=>f.preview.rect.x=1100,f=>f.previewView.hidden=true,f=>f.preview.isConnected=false,
    f=>{f.preview.parentElement=f.element('hidden','');f.preview.parentElement.style.display='none';},
    f=>{f.preview.parentElement=f.preview;}]){
    const f=fixture();change(f);assert.equal(f.read().preview_owned,false);
  }
});

test('local UI accessors and server proxy fields are never invoked',()=>{
  const f=fixture();let calls=0;
  const poison={get(){calls++;throw Error('getter invoked');}};
  for(const field of ['FEngine','FPreview','View','WizardForm'])Object.defineProperty(f.controller,field,poison);
  Object.defineProperty(f.form,'Preview',poison);Object.defineProperty(f.previewView,'isVisible',poison);
  assert.equal(f.read().preview_owned,true);
  Object.defineProperty(f.controller,'FPreviewController',poison);
  assert.equal(f.read().preview_owned,false);assert.equal(calls,0);
});

test('owned preview includes only its current visible messages; loading remains unsettled',()=>{
  const f=fixture(),message=f.element('message',f.preview.tid+';colMessage_0');message.textContent='sentinel';
  f.preview.querySelectorAll=()=>[message];f.form.FLoaded=false;
  const loading=f.read();assert.equal(loading.preview_owned,true);assert.equal(loading.preview_settled,false);
  assert.equal(loading.messages[0].text,'sentinel');
  f.form.FLoaded=true;assert.equal(f.read().preview_settled,true);
  f.previewView.Controller={};assert.equal(f.read().messages.length,0);
});

test('diagnostic inventories have fixed bounds and no foreign text payload',()=>{
  const f=fixture();for(let i=0;i<20;i++)f.previews.push(f.element('other'+i,f.preview.tid));
  const result=f.read();assert.equal(result.preview_diagnostic.exact_count,21);
  assert.equal(result.preview_diagnostic.roots.length,3);assert.equal(result.preview_owned,false);
  assert.equal(JSON.stringify(result.preview_diagnostic).includes('textContent'),false);
});

test('changed-state journal suppresses unchanged polls and stops at sixteen records',async()=>{
  const f=fixture(),state={count:0},records=[],identity={effect_id:'original'};
  const record=async value=>records.push(value);
  for(let i=0;i<200;i++)await recordJavascriptStageChange({state,identity,snapshot:f.read(),record});
  assert.equal(records.length,1);
  for(let i=0;i<40;i++){f.preview.rect.x=i;await recordJavascriptStageChange({state,identity,snapshot:f.read(),record});}
  assert.equal(records.length,16);assert.equal(records.at(-1).last_diagnostic_slot,true);
  assert.ok(records.every(e=>e.identity===identity));
});

test('cleanup closes proven settled Preview once and refuses owner/loading/mask changes',async()=>{
  for(const fault of ['none','foreign','loading','mask','lost','journal']){
    const f=fixture(),state={},events=[];
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
    const f=fixture();change(f);const snapshot=f.read();assert.equal(snapshot.preview_diagnostic.code_owned,false);
    assert.equal(snapshot.preview_owned,false);assert.ok(Object.values(snapshot.preview_diagnostic.code_checks).includes(false));
  }
  const f=fixture();let getterCalls=0;
  Object.defineProperty(f.item.FPages,'0',{get(){getterCalls++;throw Error('array accessor');}});
  assert.equal(f.read().preview_diagnostic.code_checks.pages_data_unique_bounded,false);assert.equal(getterCalls,0);
});

test('connection loss invalidates stale native owner and causes immediate read-only wait refusal',async()=>{
  const f=fixture(),before=f.read(),records=[];f.connection.Connected=false;
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
  const f=fixture();f.dialogs.push(f.root,f.preview);assert.equal(f.read().owner_verified,true);
  const foreign=f.element('session','msgbox');Object.defineProperty(foreign,'textContent',{get(){throw Error('foreign payload');}});
  f.dialogs.push(foreign);const snapshot=f.read();assert.equal(snapshot.boundary_refusal,'foreign_dialog');
  assert.equal(snapshot.owner_verified,false);assert.equal(snapshot.preview_owned,false);
  assert.equal(snapshot.dialog_diagnostic.foreign_count,1);assert.equal(snapshot.dialog_diagnostic.roots[0].tid,'msgbox');
  f.dialogs.length=0;f.connection.UserName='other';assert.equal(f.read().boundary_refusal,'account_changed');
  f.connection.UserName='jsteach';f.context.bg.app.Version='other';assert.equal(f.read().boundary_refusal,'build_changed');
});

test('Preview preflight refuses unbound code before effects but permits lazily absent Preview controller',async()=>{
  const f=fixture();delete f.controller.FPreviewController;f.previews.length=0;
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
  const f=fixture(),before=f.read(),records=[];let reads=0;
  f.form.FLoaded=false;
  const after=await waitJavascriptStageObservation({read:async()=>{
    reads++;f.preview.rect.x=reads;if(reads===20)f.connection.Connected=false;return f.read();},wait:async()=>{},
    deadline:Date.now()+5000,stage:'preview',before,identity:{effect_id:'once'},record:async e=>records.push(e)});
  assert.equal(reads,20);assert.equal(records.length,16);assert.equal(after.boundary_refusal,'connection_unavailable');
  assert.equal(javascriptStageTerminal({stage:'preview',before,after}),false);
});
