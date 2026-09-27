import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {observeJavascriptColumnEditor,openJavascriptColumnEditor,verifyJavascriptColumnEditor,settleJavascriptColumnEditor,cleanupJavascriptColumnEditor,waitJavascriptColumnEditor,fillJavascriptColumnField,javascriptColumnFieldMatches,recordJavascriptColumnHelperSource} from './javascript-column-editor.mjs';

function fixture({count=0,globalForm=true}={}) {
  const prefix='MF;TF-1',pageTid=prefix+';WizrdMCF;JavaScriptColumnsWizard',nodes=[],controls={};
  const element=(id,tid,parentElement=null)=>{
    const e={id,tid,parentElement,isConnected:true,shown:true,classList:Object.assign(new Set(),{contains(c){return this.has(c);}}),style:{display:'block',visibility:'visible'},
      getBoundingClientRect(){return {x:20,y:20,width:this.shown?200:0,height:this.shown?100:0};},
      getAttribute(key){return key==='data-tid'?this.tid:null;},
      contains(other){for(let p=other;p;p=p.parentElement)if(p===this)return true;return false;},
      querySelectorAll(){return [];},matches(){return false;}};nodes.push(e);return e;
  };
  const root=element('root',prefix+';WizrdMCF'),code=element('page',pageTid,root),grid=element('grid',pageTid+';grdTargetColumns;tbl',code);
  const records=[],data={items:records,getSource:()=>store.source??null};
  const store={$className:'Ext.data.Store',removed:[],loading:false,getData:()=>data,getCount:()=>records.length,getTotalCount:()=>records.length,isLoading:()=>store.loading};
  const makeRecord=id=>({isModel:true,internalId:id,store,data:{Name:id,DisplayName:id,DataType:4,Index:records.length,Required:false,$self:{}}});
  for(let i=0;i<count;i++)records.push(makeRecord('old'+i));
  const pageView=controls.page={el:{dom:code}},view=controls.grid={el:{dom:grid},getStore:()=>store};
  const model={FView:{el:{dom:root}},FModelNode:{}},vendor={FWizardForm:model,FTargetStore:store};
  model.FWizardItems={FItems:[{FPages:[pageView],FWizard:vendor}]};
  const native={},tab={Controller:{Node:{data:{node:native}},FController:model}},binding={tab,nodeData:model.FModelNode};
  const context={root,native,binding,prefix,account:'jsteach',build:'7.4.2'},connection={Connected:true,UserName:'jsteach'};
  const base=globalForm?'EditColumnDefForm':prefix+';WizrdMCF;EditColumnDefForm',editor=element('editor',base);editor.shown=false;
  const form={FAddMode:true,Records:[],FItems:{},ModalResultOk:false},editorControl=controls.editor={el:{dom:editor},Controller:form};form.FView=editorControl;
  for(const key of ['edtName','edtDisplayName','cbxDataType','btnApply','btnCancel']){
    const e=element(key,base+';'+key,editor);e.shown=false;const control={el:{dom:e}};
    if(key==='edtName'||key==='edtDisplayName'){const input=element(key+'Input',base+';'+key+';InputEl',e);input.tagName='INPUT';input.shown=false;control.inputEl={dom:input};}form.FItems[key]=control;controls[key]=control;
  }
  const masks=[],dialogs=[],effects=[],events=[],state={};let added,disposed=0,waits=0,onWait=()=>{};
  const show=()=>{editor.shown=true;for(const field of Object.values(form.FItems)){field.el.dom.shown=true;if(field.inputEl)field.inputEl.dom.shown=true;}};
  const hide=()=>{editor.shown=false;for(const field of Object.values(form.FItems)){field.el.dom.shown=false;if(field.inputEl)field.inputEl.dom.shown=false;}};
  const addRecord=()=>{added=makeRecord('COL1');records.push(added);form.Records=[added];};
  let hit=()=>form.FItems.btnCancel.el.dom;
  const realm=vm.createContext({TextEncoder,innerWidth:1000,innerHeight:800,document:{elementFromPoint:()=>hit(),querySelectorAll:selector=>{
    if(selector.includes('x-mask'))return masks;
    if(selector.includes('role='))return dialogs;
    const match=selector.match(/^\[data-tid=(.*)\]$/);return match?nodes.filter(e=>e.tid===JSON.parse(match[1])):[];
  }},getComputedStyle:e=>e.style,Ext:{getCmp:id=>controls[id]},
    bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:{FServerConnection:connection},Items:{Workspace:{getActiveTab:()=>tab}}}}}}}});
  const invoke=(fn,arg)=>vm.runInContext('('+fn.toString()+')',realm)({...arg,held:arg?.held?.value??arg?.held});
  const page={evaluate:async(fn,arg)=>invoke(fn,arg),evaluateHandle:async(fn,arg)=>({value:invoke(fn,arg),evaluate:async function(fn){return fn(this.value);},dispose:async()=>{disposed++;}}),
    waitForTimeout:async()=>{waits++;await onWait(waits);},locator:selector=>({filter(){return this;},async click(){
      assert.equal(selector,'[data-tid='+JSON.stringify(base+';btnCancel')+']');effects.push('cancel');hide();records.splice(records.indexOf(added),1);
    }})};
  const once=async(id,identity,perform)=>{effects.push(id);await perform();};
  const record=async event=>events.push(event);
  const open=()=>openJavascriptColumnEditor({page,context,index:count,state,once,record,deadline:Date.now()+1000,
    add:async()=>{effects.push('add-click');onWait=n=>{if(n===1)addRecord();if(n===2)show();};}});
  const observe=phase=>page.evaluate(observeJavascriptColumnEditor,{held:state.pending.held,phase});
  return {realm,page,context,state,once,record,open,observe,model,vendor,view,store,records,form,editor,controls,connection,events,effects,masks,dialogs,element,show,hide,addRecord,
    setHit:fn=>{hit=fn;},setWait:fn=>{onWait=fn;},get waits(){return waits;},get disposed(){return disposed;}};
}

test('one Add waits for asynchronous record then global form, with a same-native portal binding',async()=>{
  const f=fixture();const ready=await f.open();assert.equal(ready.status,'ready');assert.equal(ready.base,'EditColumnDefForm');
  assert.deepEqual(f.effects,['schema-add-0','add-click']);assert.equal(f.waits,2);
  assert.equal(f.events.filter(e=>e.phase==='column_editor_changed').length,3);
  assert.equal(f.context.root.contains(f.editor),false);
  await verifyJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
});

test('nested editor and second-column baseline preserve all earlier record identities and cached fields',async()=>{
  const f=fixture({count:1,globalForm:false});await f.open();const old=f.records[0];
  await cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
  assert.equal(f.records.length,1);assert.equal(f.records[0],old);assert.equal(f.state.pending,null);
  assert.equal(f.effects.filter(e=>e==='cancel').length,1);
});

test('changed store, vendor, baseline record/cache/fields and extra record delta refuse before another effect',async()=>{
  for(const corrupt of [f=>f.view.getStore=()=>({...f.store}),f=>f.vendor.FTargetStore={},
    f=>f.records[0]={...f.records[0]},f=>f.records[0].data={...f.records[0].data},f=>f.records[0].data.Name='changed',
    f=>f.records.push({...f.records.at(-1),data:{}})]){
    const f=fixture({count:1});await f.open();corrupt(f);
    await assert.rejects(verifyJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000}));
    assert.equal(f.effects.filter(e=>e==='add-click').length,1);assert.equal(f.effects.includes('cancel'),false);
  }
});

test('foreign same-tid form record, AddMode or reciprocal native view cannot authorize cleanup',async()=>{
  for(const corrupt of [f=>f.form.Records=[{}],f=>f.form.FAddMode=false,f=>f.form.FView={},f=>f.connection.Connected=false]){
    const f=fixture();await f.open();corrupt(f);
    await assert.rejects(cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000}));
    assert.equal(f.effects.includes('cancel'),false);
  }
});

test('quiet Cancel settlement waits for masks and retains baseline before closing the wizard',async()=>{
  const f=fixture({count:1});await f.open();
  const click=f.page.locator;f.page.locator=selector=>{const locator=click(selector),cancel=locator.click;locator.click=async()=>{
    await cancel();const mask=f.element('mask','');f.masks.push(mask);f.setWait(()=>{f.masks.length=0;});};return locator;};
  await cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
  assert.equal(f.state.pending,null);assert.equal(f.records.length,1);assert.ok(f.events.some(e=>e.snapshot?.reason==='ui_busy'));
});

test('lost Add is never repeated; proven late editor is cancelled once during cleanup',async()=>{
  const f=fixture();await assert.rejects(openJavascriptColumnEditor({page:f.page,context:f.context,index:0,state:f.state,once:f.once,record:f.record,
    deadline:Date.now()+1000,add:async()=>{f.addRecord();f.show();throw Error('lost Add');}}),/lost Add/);
  await assert.rejects(f.open(),/do not replay/);
  await cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
  assert.deepEqual(f.effects,['schema-add-0','cancel']);assert.equal(f.records.length,0);
});

test('ApplyDispatched only observes completion and never sends Cancel or repeats Apply',async()=>{
  const f=fixture();await f.open();f.state.pending.applyDispatched=true;
  await assert.rejects(cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()}));
  assert.equal(f.effects.includes('cancel'),false);
  const done=fixture();await done.open();done.state.pending.applyDispatched=true;done.form.ModalResultOk=true;done.hide();
  await cleanupJavascriptColumnEditor({page:done.page,state:done.state,record:done.record,deadline:Date.now()+1000});
  assert.equal(done.state.pending,null);assert.equal(done.records.length,1);assert.equal(done.effects.includes('cancel'),false);
});

test('lost Cancel and journal failure cannot dispatch another Cancel',async()=>{
  for(const fault of ['lost','journal']){
    const f=fixture();await f.open();
    if(fault==='lost')f.page.locator=()=>({filter(){return this;},async click(){f.effects.push('cancel');throw Error('lost Cancel');}});
    const record=async e=>{await f.record(e);if(fault==='journal'&&e.phase==='column_editor_cancel_dispatch')throw Error('journal');};
    const cleanup=()=>cleanupJavascriptColumnEditor({page:f.page,state:f.state,record,deadline:Date.now()+1000});
    await assert.rejects(cleanup());await assert.rejects(cleanup());
    assert.equal(f.effects.filter(e=>e==='cancel').length,fault==='lost'?1:0);
  }
});

test('expired original wait has diagnostics and no effects; native cached data accessors are refused',async()=>{
  const f=fixture();await f.open();const before=f.effects.length;
  await assert.rejects(waitJavascriptColumnEditor({page:f.page,pending:f.state.pending,phase:'editing',deadline:Date.now(),record:f.record}));
  assert.equal(f.effects.length,before);assert.equal(f.events.at(-1).deadline_expired,true);
  let called=0;Object.defineProperty(f.records[0].data,'poison',{get(){called++;throw Error('getter');}});
  assert.notEqual((await f.observe('editing')).status,'ready');assert.equal(called,0);
});

test('normal Apply settlement keeps the exact new record and disposes only after proof',async()=>{
  const f=fixture();await f.open();f.state.pending.applyDispatched=true;f.form.ModalResultOk=true;f.hide();
  await settleJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000,phase:'applied'});
  assert.equal(f.state.pending,null);assert.equal(f.disposed,1);assert.equal(f.records.length,1);
});

test('foreign overlay blocks fill despite visible enabled native input and no dialog',async()=>{
  const f=fixture();await f.open();const input=f.form.FItems.edtName.inputEl.dom;
  f.setHit(()=>input);
  await verifyJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000,target:'edtName',kind:'fill'});
  f.setHit(()=>f.element('foreign-mask',''));let fills=0;
  await assert.rejects(async()=>{await verifyJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000,target:'edtName',kind:'fill'});fills++;});
  assert.equal(fills,0);assert.equal(f.events.at(-1).snapshot.checks.target_hit,false);
  f.setHit(()=>input);input.readOnly=true;
  await assert.rejects(verifyJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000,target:'edtName',kind:'fill'}));
});

test('owned picker option is admitted while it covers other controls; foreign picker is refused',async()=>{
  const f=fixture();await f.open();
  const picker=f.element('picker',''),option=f.element('option','',picker);
  option.classList.add('x-boundlist-item');option.closest=selector=>selector==='.x-boundlist'?picker:null;
  f.form.FItems.cbxDataType.picker={el:{dom:picker}};f.setHit(()=>option);
  const verify=()=>verifyJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000,target:'cbxDataType',kind:'option',option});
  await verify();
  await assert.rejects(verifyJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000,target:'edtName',kind:'fill'}));
  f.form.FItems.cbxDataType.picker={el:{dom:f.element('foreign-picker','')}};
  await assert.rejects(verify());assert.equal(f.events.at(-1).snapshot.checks.option_owner,false);
});

test('dense store inventories refuse holes, accessor slots and filtered source caches before Add',async()=>{
  for(const fault of ['hole','getter','source']){
    const f=fixture({count:1});let calls=0;
    if(fault==='hole')delete f.records[0];
    if(fault==='getter')Object.defineProperty(f.records,'0',{get(){calls++;throw Error('record accessor');}});
    if(fault==='source')f.store.source={items:[{}]};
    await assert.rejects(f.open(),/baseline unconfirmed/);assert.equal(calls,0);assert.deepEqual(f.effects,[]);
  }
});

test('Cancel waits for removed-queue settlement, then accepts baseline with stale proxy total',async()=>{
  const f=fixture({count:1});await f.open();const added=f.records.at(-1);
  f.store.getTotalCount=()=>2;f.hide();f.records.pop();f.store.removed.push(added);
  const pending=await f.observe('cancelled');assert.equal(pending.status,'pending');assert.equal(pending.removed_count,1);
  f.store.removed.length=0;
  const settled=await f.observe('cancelled');assert.equal(settled.status,'settled');
  assert.equal(settled.proxy_total_count,2);assert.equal(settled.loaded_count,1);assert.equal(settled.record_count,1);
  assert.equal(settled.checks.proxy_total_matches,false);assert.equal(settled.checks.baseline,true);
  f.records[0].dirty=true;assert.equal((await f.observe('cancelled')).status,'pending');
  f.records[0].dirty=false;f.records[0].data.Name='changed';assert.equal((await f.observe('cancelled')).status,'refused');
});

test('matching native and DOM field values skip fill entirely and retain exact readback diagnostics',async()=>{
  const f=fixture();await f.open();const field=f.form.FItems.edtName;field.value='ObservedID';field.rawValue='ObservedID';field.inputEl.dom.value='ObservedID';
  let fills=0;
  await fillJavascriptColumnField({page:f.page,state:f.state,record:f.record,once:f.once,deadline:Date.now()+1000,
    id:'name',target:'edtName',expected:'ObservedID',fill:async()=>{fills++;}});
  assert.equal(fills,0);assert.equal(f.effects.includes('name'),false);
  assert.equal(f.events.at(-1).phase,'column_field_fill_skipped');
  assert.equal(f.events.at(-1).snapshot.field_readback.native_value,'ObservedID');
});

test('single fill waits read-only for delayed native field settlement, without another effect',async()=>{
  const f=fixture();await f.open();const field=f.form.FItems.edtName;field.value='COL1';field.rawValue='COL1';field.inputEl.dom.value='COL1';f.setHit(()=>field.inputEl.dom);
  let fills=0;
  await fillJavascriptColumnField({page:f.page,state:f.state,record:f.record,once:f.once,deadline:Date.now()+1000,
    id:'name',target:'edtName',expected:'ObservedID',fill:async text=>{fills++;field.inputEl.dom.value=text;f.setWait(()=>{field.value=text;field.rawValue=text;});}});
  assert.equal(fills,1);assert.equal(f.effects.filter(e=>e==='name').length,1);
  assert.ok(f.events.some(e=>e.phase==='column_field_readback'&&e.snapshot.field_readback.native_value==='COL1'&&e.snapshot.field_readback.input_value==='ObservedID'));
});

test('persistent mismatch and lost fill never authorize a retry',async()=>{
  for(const fault of ['mismatch','lost']){
    const f=fixture();await f.open();const field=f.form.FItems.edtDisplayName;field.value='COL1';field.rawValue='COL1';field.inputEl.dom.value='COL1';f.setHit(()=>field.inputEl.dom);
    let fills=0;
    await assert.rejects(fillJavascriptColumnField({page:f.page,state:f.state,record:f.record,once:f.once,deadline:Date.now()+15,
      id:'label',target:'edtDisplayName',expected:'ObservedID',fill:async()=>{fills++;if(fault==='lost')throw Error('lost fill');}}));
    assert.equal(fills,1);assert.equal(f.effects.filter(e=>e==='label').length,1);
    if(fault==='mismatch')assert.equal(f.events.at(-1).snapshot.field_readback.input_value,'COL1');
  }
});


test('field observation never calls field methods or cached accessors and cannot settle its own mismatch',async()=>{
  const f=fixture();await f.open();const field=f.form.FItems.edtName;
  field.value='COL1';field.rawValue='COL1';field.inputEl.dom.value='ObservedID';
  let methods=0,getters=0;
  field.getValue=field.getRawValue=()=>{methods++;field.value='ObservedID';field.inputEl.dom.value='mutated';throw Error('mutating reader');};
  const read=()=>f.page.evaluate(observeJavascriptColumnEditor,{held:f.state.pending.held,phase:'editing',readField:'edtName'});
  const snapshot=await read();
  assert.equal(snapshot.field_readback.native_value,'COL1');assert.equal(snapshot.field_readback.native_raw_value,'COL1');
  assert.equal(javascriptColumnFieldMatches(snapshot.field_readback,'ObservedID'),false);
  assert.equal(field.value,'COL1');assert.equal(field.rawValue,'COL1');assert.equal(field.inputEl.dom.value,'ObservedID');
  for(const key of ['value','rawValue'])Object.defineProperty(field,key,{configurable:true,get(){getters++;throw Error('cached accessor');}});
  const unknown=await read();assert.equal(unknown.field_readback.native_value_available,false);
  assert.equal(unknown.field_readback.native_raw_value_available,false);
  assert.equal(javascriptColumnFieldMatches(unknown.field_readback,'ObservedID'),false);
  assert.equal(methods,0);assert.equal(getters,0);
});


test('helper source diagnostic never invokes helper, bounds UTF-8 bytes and excludes unsupported/accessor sources',async()=>{
  const f=fixture();await f.open();let calls=0;
  f.realm.bg.ext={AssociateDisplaynameWithName:function sample(){calls++;}};
  const diagnostic=async()=>{await recordJavascriptColumnHelperSource({page:f.page,state:f.state,record:f.record});return f.events.at(-1).diagnostic;};
  const available=await diagnostic();assert.equal(available.status,'available');
  assert.match(available.sha256,/^[a-f0-9]{64}$/);assert.equal(available.bytes,Buffer.byteLength(available.source));
  assert.equal(calls,0);
  f.realm.bg.ext.AssociateDisplaynameWithName=Function('/*'+'ж'.repeat(9000)+'*/');
  const oversized=await diagnostic();assert.equal(oversized.status,'oversized');assert.ok(oversized.bytes>16384);assert.equal(oversized.source,undefined);
  f.realm.bg.ext.AssociateDisplaynameWithName=Math.max;assert.equal((await diagnostic()).status,'unsupported');
  f.realm.bg.ext.AssociateDisplaynameWithName=7;assert.equal((await diagnostic()).status,'unsupported');
  Object.defineProperty(f.realm.bg.ext,'AssociateDisplaynameWithName',{get(){calls++;throw Error('helper getter');}});
  assert.equal((await diagnostic()).status,'unavailable');assert.equal(calls,0);
  f.form.Records=[{}];assert.equal((await diagnostic()).status,'owner_unconfirmed');assert.equal(calls,0);
});
