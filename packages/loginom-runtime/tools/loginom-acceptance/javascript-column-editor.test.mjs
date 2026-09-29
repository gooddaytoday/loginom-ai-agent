import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {configureJavascriptSchema} from './javascript-schema-probe.mjs';
import {verifyJavascriptDeclaredEmpty} from './javascript-native-zero.mjs';
import {observeJavascriptColumnEditor,openJavascriptColumnEditor,verifyJavascriptColumnEditor,settleJavascriptColumnEditor,cleanupJavascriptColumnEditor,waitJavascriptColumnEditor,fillJavascriptColumnField,javascriptColumnFieldMatches,recordJavascriptColumnHelperSource,openJavascriptColumnTypePicker,selectJavascriptColumnTypeOption,closeJavascriptColumnTypePicker,openJavascriptColumnUsagePicker,selectJavascriptColumnUsageOption} from './javascript-column-editor.mjs';

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
  const invoke=(fn,arg)=>vm.runInContext('('+fn.toString()+')',realm)({...arg,held:arg?.held?.value??arg?.held,option:arg?.option?.value??arg?.option});
  const elementHandle=node=>({value:node,asElement(){return node?this:null;},async click(options){await node.onClick(options);},async dispose(){}});
  const page={evaluate:async(fn,arg)=>invoke(fn,arg),evaluateHandle:async(fn,arg)=>({value:invoke(fn,arg),evaluate:async function(fn){return fn(this.value);},evaluateHandle:async function(fn){return elementHandle(fn(this.value));},dispose:async()=>{disposed++;}}),
    waitForTimeout:async()=>{waits++;await onWait(waits);},locator:selector=>({filter(){return this;},async click(){
      assert.equal(selector,'[data-tid='+JSON.stringify(base+';btnCancel')+']');effects.push('cancel');hide();records.splice(records.indexOf(added),1);
    }})};
  const once=async(id,identity,perform)=>{effects.push(id);await perform();};
  const record=async event=>events.push(event);
  const open=()=>openJavascriptColumnEditor({page,context,index:count,state,once,record,deadline:Date.now()+1000,
    add:async()=>{effects.push('add-click');onWait=n=>{if(n===1)addRecord();if(n===2)show();};}});
  const observe=phase=>page.evaluate(observeJavascriptColumnEditor,{held:state.pending.held,phase});
  return {realm,page,context,state,once,record,open,observe,model,vendor,view,store,records,form,editor,controls,connection,events,effects,masks,dialogs,element,show,hide,addRecord,nodes,
    setHit:fn=>{hit=fn;},setWait:fn=>{onWait=fn;},get waits(){return waits;},get disposed(){return disposed;}};
}

function typeFixture(f,{expanded=true,type=4,label='Целый'}={}) {
  const combo=f.form.FItems.cbxDataType,base=combo.el.dom.tid;
  const wrap=f.element('triggerWrap','',combo.el.dom),triggerDom=f.element('typeTrigger',base+';trg_picker',wrap);
  const trigger={id:'picker',field:combo,el:{dom:triggerDom},rendered:true};
  combo.orderedTriggers=[trigger];combo.triggerWrap={dom:wrap};combo.isExpanded=expanded;
  combo.valueField='Value';combo.displayField='DisplayText';
  const pickerDom=f.element('typePicker',base+';boundlist'),option=f.element('typeOption',base+';boundlist;'+label,pickerDom);
  pickerDom.shown=expanded;option.shown=expanded;option.textContent=label;option.classList.add('x-boundlist-item');
  option.closest=selector=>selector==='.x-boundlist'?pickerDom:null;
  option.getAttribute=key=>key==='data-recordId'?'type4':key==='data-boundView'?pickerDom.id:key==='data-tid'?option.tid:null;
  const records=[{isModel:true,internalId:'type4',data:{Value:type,DisplayText:label}}];
  const store={getData:()=>({items:records}),isLoading:()=>false};combo.store=store;
  const picker={el:{dom:pickerDom},pickerField:combo,store,dataSource:store};combo.picker=picker;f.controls.typePicker=picker;
  pickerDom.querySelectorAll=selector=>selector==='.x-boundlist-item'?[option]:[];
  return {combo,wrap,triggerDom,trigger,pickerDom,picker,option,records,store,
    expand(){combo.isExpanded=true;pickerDom.shown=true;option.shown=true;}};
}

function usageFixture(f,{expanded=false,lazy=false}={}) {
  for(const [name,values] of [['cbxDataKind',[[1,'Непрерывный'],[2,'Дискретный']]],
    ['cbxUsageType',[[0,'Не задано'],[3,'Активное'],[4,'Выходное'],[6,'Группа'],[7,'Показатель'],[8,'Транзакция'],[9,'Элемент']]]]){
    const element=f.element(name,'EditColumnDefForm;'+name,f.editor);
    const records=values.map(([Value,DisplayText])=>({isModel:true,internalId:'usage'+Value,data:{Value,DisplayText}}));
    const store={getData:()=>({items:records}),isLoading:()=>false};
    const combo={el:{dom:element},value:name==='cbxUsageType'?0:2,store,disabled:false};
    f.form.FItems[name]=combo;f.controls[name]=combo;
  }
  const combo=f.form.FItems.cbxUsageType,wrap=f.element('usageWrap','',combo.el.dom);
  const triggerDom=f.element('usageTrigger','EditColumnDefForm;cbxUsageType;trg_picker',wrap);
  combo.triggerWrap={dom:wrap};combo.orderedTriggers=[{id:'picker',field:combo,el:{dom:triggerDom},rendered:true}];combo.isExpanded=expanded;
  const pickerDom=f.element('usagePicker','EditColumnDefForm;cbxUsageType;boundlist');pickerDom.shown=expanded;
  const options=combo.store.getData().items.map(record=>{
    const option=f.element('option'+record.data.Value,'usage-option-'+record.data.Value,pickerDom);
    option.shown=expanded;option.textContent=record.data.DisplayText;option.classList.add('x-boundlist-item');
    option.getAttribute=key=>key==='data-recordId'?record.internalId:key==='data-boundView'?pickerDom.id:key==='data-tid'?option.tid:null;
    return option;
  });
  pickerDom.querySelectorAll=selector=>selector==='.x-boundlist-item'?options:[];
  const picker={el:{dom:lazy&&!expanded?null:pickerDom},pickerField:combo,store:combo.store,dataSource:combo.store};
  combo.picker=picker;f.controls.usagePicker=picker;
  const setExpanded=value=>{combo.isExpanded=value;if(value)picker.el.dom=pickerDom;pickerDom.shown=value;for(const option of options)option.shown=value;};
  return {combo,triggerDom,pickerDom,picker,options,setExpanded};
}

test('owned usage picker opens once, binds all seven options and closes before Cancel',async()=>{
  const f=fixture();await f.open();const usage=usageFixture(f);f.setHit(()=>usage.triggerDom);
  const original=f.page.locator;let closes=0;
  f.page.locator=selector=>selector==='[data-tid="EditColumnDefForm;cbxUsageType;trg_picker"]'
    ?{filter(){return this;},async click(){closes++;usage.setExpanded(false);f.setHit(()=>f.form.FItems.btnCancel.el.dom);}}:original(selector);
  const opened=await openJavascriptColumnUsagePicker({page:f.page,state:f.state,record:f.record,once:f.once,
    deadline:Date.now()+1000,id:'usage-open',click:async()=>usage.setExpanded(true)});
  assert.equal(opened.usage_picker.expected_match_count,1);
  assert.equal(opened.usage_picker.verified_option_count,7);
  const cancelled=await cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
  assert.equal(closes,1);assert.equal(cancelled.status,'settled');assert.equal(f.records.length,0);
  assert.equal(f.effects.filter(effect=>effect==='usage-open').length,1);
});

test('lazy unrendered usage picker requires full DOM owner after one opening click',async()=>{
  const f=fixture();await f.open();const usage=usageFixture(f,{lazy:true});f.setHit(()=>usage.triggerDom);
  const preflight=await f.page.evaluate(observeJavascriptColumnEditor,
    {held:f.state.pending.held,phase:'editing',readUsagePicker:'state',usageAction:'open'});
  assert.equal(preflight.status,'ready');assert.equal(preflight.usage_picker.owner,false);
  assert.equal(preflight.usage_picker.lazy_owner,true);
  const opened=await openJavascriptColumnUsagePicker({page:f.page,state:f.state,record:f.record,once:f.once,
    deadline:Date.now()+1000,id:'usage-open',click:async()=>usage.setExpanded(true)});
  assert.equal(opened.usage_picker.owner,true);
  assert.equal(opened.usage_picker.verified_option_count,7);
});

test('owned usage option selects value four once, reads back and cancels without Apply',async()=>{
  const f=fixture();await f.open();const usage=usageFixture(f,{lazy:true});f.setHit(()=>usage.triggerDom);
  await openJavascriptColumnUsagePicker({page:f.page,state:f.state,record:f.record,once:f.once,
    deadline:Date.now()+1000,id:'usage-open',click:async()=>usage.setExpanded(true)});
  const target=usage.options[2];let clicks=0;f.setHit(()=>target);
  target.onClick=()=>{clicks++;usage.combo.value=4;usage.setExpanded(false);f.setHit(()=>f.form.FItems.btnCancel.el.dom);};
  const selected=await selectJavascriptColumnUsageOption({page:f.page,state:f.state,record:f.record,once:f.once,
    deadline:Date.now()+1000,id:'usage-select'});
  assert.equal(selected.usage_picker.cached_value,4);assert.equal(clicks,1);
  const cancelled=await cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
  assert.equal(cancelled.status,'settled');assert.equal(f.effects.includes('usage-select'),true);
  assert.equal(f.effects.includes('cancel'),true);assert.equal(f.effects.includes('apply'),false);
});

test('foreign usage option refuses selection before click',async()=>{
  const f=fixture();await f.open();const usage=usageFixture(f,{lazy:true});f.setHit(()=>usage.triggerDom);
  await openJavascriptColumnUsagePicker({page:f.page,state:f.state,record:f.record,once:f.once,
    deadline:Date.now()+1000,id:'usage-open',click:async()=>usage.setExpanded(true)});
  let clicks=0;usage.options[2].onClick=()=>{clicks++;};f.setHit(()=>usage.options[2]);
  usage.picker.pickerField={};
  await assert.rejects(selectJavascriptColumnUsageOption({page:f.page,state:f.state,record:f.record,once:f.once,
    deadline:Date.now()+1000,id:'usage-select'}),/usage_picker_owner_changed/);
  assert.equal(clicks,0);assert.equal(f.effects.includes('usage-select'),false);
});

test('lost usage option click is never replayed and observed selection can be cancelled',async()=>{
  const f=fixture();await f.open();const usage=usageFixture(f,{lazy:true});f.setHit(()=>usage.triggerDom);
  await openJavascriptColumnUsagePicker({page:f.page,state:f.state,record:f.record,once:f.once,
    deadline:Date.now()+1000,id:'usage-open',click:async()=>usage.setExpanded(true)});
  const target=usage.options[2];let clicks=0;f.setHit(()=>target);
  target.onClick=()=>{clicks++;usage.combo.value=4;usage.setExpanded(false);
    f.setHit(()=>f.form.FItems.btnCancel.el.dom);throw Error('lost usage click response');};
  const select=()=>selectJavascriptColumnUsageOption({page:f.page,state:f.state,record:f.record,once:f.once,
    deadline:Date.now()+1000,id:'usage-select'});
  await assert.rejects(select(),/lost usage click response/);
  await assert.rejects(select(),/do not replay/);
  const cancelled=await cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
  assert.equal(clicks,1);assert.equal(cancelled.status,'settled');
});

test('foreign usage picker refuses before opening gesture',async()=>{
  const f=fixture();await f.open();const usage=usageFixture(f);usage.picker.pickerField={};f.setHit(()=>usage.triggerDom);
  let clicks=0;
  await assert.rejects(openJavascriptColumnUsagePicker({page:f.page,state:f.state,record:f.record,once:f.once,
    deadline:Date.now()+1000,id:'usage-open',click:async()=>{clicks++;}}));
  assert.equal(clicks,0);assert.equal(f.effects.includes('usage-open'),false);
  assert.equal(f.events.at(-1).phase,'column_usage_preflight_refused');
  assert.equal(f.events.at(-1).snapshot.reason,'usage_picker_owner_changed');
  assert.equal(f.events.at(-1).snapshot.owner_checks.field_matches,false);
});

test('lost usage trigger response closes the observed popup once without replay',async()=>{
  const f=fixture();await f.open();const usage=usageFixture(f);f.setHit(()=>usage.triggerDom);
  const original=f.page.locator;let closes=0,opens=0;
  f.page.locator=selector=>selector==='[data-tid="EditColumnDefForm;cbxUsageType;trg_picker"]'
    ?{filter(){return this;},async click(){closes++;usage.setExpanded(false);f.setHit(()=>f.form.FItems.btnCancel.el.dom);}}:original(selector);
  const open=()=>openJavascriptColumnUsagePicker({page:f.page,state:f.state,record:f.record,once:f.once,
    deadline:Date.now()+1000,id:'usage-open',click:async()=>{opens++;usage.setExpanded(true);throw Error('lost response');}});
  await assert.rejects(open(),/lost response/);
  await assert.rejects(open(),/do not replay/);
  const cancelled=await cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
  assert.equal(opens,1);assert.equal(closes,1);assert.equal(cancelled.status,'settled');
});

test('one Add waits for asynchronous record then global form, with a same-native portal binding',async()=>{
  const f=fixture();const ready=await f.open();assert.equal(ready.status,'ready');assert.equal(ready.base,'EditColumnDefForm');
  assert.deepEqual(f.effects,['schema-add-0','add-click']);assert.equal(f.waits,2);
  assert.equal(f.events.filter(e=>e.phase==='column_editor_changed').length,3);
  assert.equal(f.context.root.contains(f.editor),false);
  await verifyJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
});

test('owned declared editor inventories DataKind and default usage caches without invoking proxy getters',async()=>{
  const f=fixture();
  for(const [name,selected,options] of [
    ['cbxDataKind',1,[{Value:1,DisplayText:'Непрерывный'},{Value:2,DisplayText:'Дискретный'}]],
    ['cbxUsageType',0,[{Value:0,DisplayText:'Не задано'},{Value:4,DisplayText:'Выходное'}]]]){
    const element=f.element(name,'EditColumnDefForm;'+name,f.editor);
    const records=options.map(data=>({isModel:true,data}));
    const control={el:{dom:element},value:selected,store:{getData:()=>({items:records}),isLoading:()=>false}};
    Object.defineProperty(control,'FullType',{get(){throw Error('remote getter');}});
    f.form.FItems[name]=control;f.controls[name]=control;
    if(name==='cbxUsageType'){
      const wrap=f.element('usageWrap','',element),triggerDom=f.element('usageTrigger','EditColumnDefForm;cbxUsageType;trg_picker',wrap);
      control.triggerWrap={dom:wrap};control.orderedTriggers=[{id:'picker',field:control,el:{dom:triggerDom},rendered:true}];
    }
  }
  await f.open();
  const result=await f.page.evaluate(observeJavascriptColumnEditor,{held:f.state.pending.held,phase:'editing',readDeclaredControls:true});
  assert.equal(result.status,'ready');
  assert.deepEqual(JSON.parse(JSON.stringify(result.declared_controls.cbxDataKind.options)),
    [{Value:1,DisplayText:'Непрерывный'},{Value:2,DisplayText:'Дискретный'}]);
  assert.equal(result.declared_controls.cbxUsageType.cached_value,0);
  assert.equal(result.declared_controls.cbxUsageType.trigger.bound,true);
  assert.equal(result.declared_controls.cbxUsageType.trigger.visible,true);
  const cancelled=await cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
  assert.equal(cancelled.status,'settled');
  assert.equal(cancelled.checks.baseline,true);
  assert.equal(f.effects.filter(effect=>effect==='cancel').length,1);
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

test('owned typed picker option is admitted while it covers other controls; foreign picker is refused',async()=>{
  const f=fixture();await f.open();const t=typeFixture(f);f.setHit(()=>t.option);
  const verify=()=>verifyJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000,
    target:'cbxDataType',kind:'option',option:t.option,expectedType:4,expectedLabel:'Целый'});
  await verify();
  await assert.rejects(verifyJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000,target:'edtName',kind:'fill'}));
  t.combo.picker={...t.picker,pickerField:{}};
  await assert.rejects(verify());assert.equal(f.events.at(-1).snapshot.reason,'type_picker_owner_changed');
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


test('type opening clicks the exact native trigger once and waits for its late owned typed option',async()=>{
  const f=fixture();await f.open();const t=typeFixture(f,{expanded:false});f.setHit(()=>t.triggerDom);
  let clicks=0,methodCalls=0;t.combo.getPicker=t.combo.expand=t.combo.onTriggerClick=()=>{methodCalls++;throw Error('mutating method');};
  await openJavascriptColumnTypePicker({page:f.page,state:f.state,record:f.record,once:f.once,deadline:Date.now()+1000,
    id:'type-open',expectedType:4,expectedLabel:'Целый',click:async(tid,timeout)=>{
      clicks++;assert.equal(tid,t.triggerDom.tid);assert.ok(timeout<=1000);f.setWait(()=>t.expand());
    }});
  assert.equal(clicks,1);assert.equal(methodCalls,0);assert.equal(f.effects.filter(e=>e==='type-open').length,1);
  assert.equal(f.events.at(-1).snapshot.picker.typed_option_count,1);
});

test('type trigger refuses a body hit, foreign native trigger, readOnly or repeated-click trigger before dispatch',async()=>{
  for(const corrupt of [(f,t)=>f.setHit(()=>t.combo.el.dom),(f,t)=>t.trigger.field={},(f,t)=>t.combo.readOnly=true,(f,t)=>t.trigger.repeatClick=true]){
    const f=fixture();await f.open();const t=typeFixture(f,{expanded:false});f.setHit(()=>t.triggerDom);corrupt(f,t);let clicks=0;
    await assert.rejects(openJavascriptColumnTypePicker({page:f.page,state:f.state,record:f.record,once:f.once,deadline:Date.now()+1000,
      id:'type-open',expectedType:4,expectedLabel:'Целый',click:async()=>{clicks++;}}));
    assert.equal(clicks,0);assert.equal(f.effects.includes('type-open'),false);
  }
});

test('closed type picker and lost trigger click are bounded and never authorize replay',async()=>{
  for(const lost of [false,true]){
    const f=fixture();await f.open();const t=typeFixture(f,{expanded:false});f.setHit(()=>t.triggerDom);let clicks=0;
    const open=()=>openJavascriptColumnTypePicker({page:f.page,state:f.state,record:f.record,once:f.once,deadline:Date.now()+(lost?1800000:15),
      id:'type-open',expectedType:4,expectedLabel:'Целый',click:async(tid,timeout)=>{assert.ok(timeout<=5000);clicks++;if(lost)throw Error('lost click');}});
    await assert.rejects(open());await assert.rejects(open(),/do not replay/);assert.equal(clicks,1);
    if(!lost){assert.equal(f.events.at(-1).phase,'column_type_opening_refused');assert.equal(f.events.at(-1).snapshot.picker.expanded,false);}
  }
});

test('typed option rejects matching text with wrong type, bound view or changed native record',async()=>{
  for(const corrupt of [t=>t.records[0].data.Value=5,t=>t.option.getAttribute=()=>null,t=>t.records[0]={...t.records[0]}]){
    const f=fixture();await f.open();const t=typeFixture(f);f.setHit(()=>t.option);
    const verify=()=>verifyJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000,
      target:'cbxDataType',kind:'option',option:t.option,expectedType:4,expectedLabel:'Целый'});
    await verify();corrupt(t);await assert.rejects(verify());
  }
});


test('type config reads bounded inherited data descriptors but refuses accessors without invoking them',async()=>{
  for(const accessor of [false,true]){
    const f=fixture();await f.open();const t=typeFixture(f);f.setHit(()=>t.option);let calls=0;
    delete t.combo.valueField;delete t.combo.displayField;
    const prototype={valueField:'Value',displayField:'DisplayText'};
    if(accessor)Object.defineProperty(prototype,'displayField',{get(){calls++;throw Error('config getter');}});
    Object.setPrototypeOf(t.combo,prototype);
    const verify=()=>verifyJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000,
      target:'cbxDataType',kind:'option',option:t.option,expectedType:4,expectedLabel:'Целый'});
    if(accessor){await assert.rejects(verify());assert.equal(f.events.at(-1).snapshot.picker.display_config.status,'accessor');}
    else {const ready=await verify();assert.equal(ready.picker.display_config.depth,1);assert.equal(ready.picker.value_config.depth,1);}
    assert.equal(calls,0);
  }
});


test('type opening tolerates a lazy or not-yet-rendered owned picker without calling getPicker',async()=>{
  for(const lazy of [false,true]){
    const f=fixture();await f.open();const t=typeFixture(f,{expanded:false});f.setHit(()=>t.triggerDom);
    if(lazy)delete t.combo.picker;else delete t.picker.el;
    let clicks=0;
    await openJavascriptColumnTypePicker({page:f.page,state:f.state,record:f.record,once:f.once,deadline:Date.now()+1000,
      id:'type-open',expectedType:4,expectedLabel:'Целый',click:async()=>{
        clicks++;f.setWait(()=>{t.combo.picker=t.picker;t.picker.el={dom:t.pickerDom};t.expand();});
      }});
    assert.equal(clicks,1);assert.equal(f.events.at(-1).snapshot.picker.picker_owned,true);
  }
});


test('selection clicks only the proven item handle, with whitespace and no global text locator',async()=>{
  const f=fixture();await f.open();const t=typeFixture(f);t.option.textContent=' \nЦелый \n';f.setHit(()=>t.option);
  await f.page.evaluate(observeJavascriptColumnEditor,{held:f.state.pending.held,phase:'editing',readPicker:true,expectedType:4,expectedLabel:'Целый'});
  f.page.locator=()=>{throw Error('global locator forbidden');};let clicks=0;
  t.option.onClick=async({timeout})=>{clicks++;assert.ok(timeout<=5000);};
  await selectJavascriptColumnTypeOption({page:f.page,state:f.state,record:f.record,once:f.once,deadline:Date.now()+1000,
    id:'type-select',expectedType:4,expectedLabel:'Целый'});
  assert.equal(clicks,1);assert.equal(f.effects.filter(e=>e==='type-select').length,1);
});

test('selection refuses replaced native record before gesture and never repeats a lost handle click',async()=>{
  for(const lost of [false,true]){
    const f=fixture();await f.open();const t=typeFixture(f);f.setHit(()=>t.option);let clicks=0;
    await f.page.evaluate(observeJavascriptColumnEditor,{held:f.state.pending.held,phase:'editing',readPicker:true,expectedType:4,expectedLabel:'Целый'});
    t.option.onClick=async()=>{clicks++;throw Error('lost option click');};
    const once=async(id,identity,perform)=>{if(!lost)t.records[0]={...t.records[0]};await f.once(id,identity,perform);};
    const select=()=>selectJavascriptColumnTypeOption({page:f.page,state:f.state,record:f.record,once,deadline:Date.now()+1000,
      id:'type-select',expectedType:4,expectedLabel:'Целый'});
    await assert.rejects(select());await assert.rejects(select(),/do not replay/);assert.equal(clicks,lost?1:0);
  }
});

function enableTypeCleanup(f,t,{lostOpening=false}={}) {
  Object.assign(f.state.pending,{typeOpening:true,typeOpeningDispatched:true,typeOpeningResponseObserved:!lostOpening,typeOpeningObserved:!lostOpening});
  f.setHit(()=>t.triggerDom);
}

test('cleanup closes only owned expanded picker once, waits collapse, then freshly dispatches Cancel',async()=>{
  const f=fixture();await f.open();const t=typeFixture(f);enableTypeCleanup(f,t);
  const locate=f.page.locator;let closes=0;
  f.page.locator=selector=>selector.includes(';trg_picker')?{filter(){return this;},async click(){closes++;f.setWait(()=>{
    t.combo.isExpanded=false;t.pickerDom.shown=false;t.option.shown=false;f.setHit(()=>f.form.FItems.btnCancel.el.dom);
  });}}:locate(selector);
  await cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
  assert.equal(closes,1);assert.equal(f.effects.filter(e=>e==='cancel').length,1);assert.equal(f.state.pending,null);
  const collapsed=f.events.findIndex(e=>e.phase==='column_type_close_observed'&&e.stage==='collapsed'&&e.snapshot.status==='ready');
  assert.ok(collapsed>=0&&collapsed<f.events.findIndex(e=>e.phase==='column_editor_cancel_dispatch'));
});

test('unknown or foreign picker and lost collapse never permit Cancel or another close gesture',async()=>{
  for(const fault of ['foreign','lost','journal','lost-opening']){
    const f=fixture();await f.open();const t=typeFixture(f,{expanded:fault!=='lost-opening'});enableTypeCleanup(f,t,{lostOpening:fault==='lost-opening'});
    if(fault==='foreign')t.picker.pickerField={};let clicks=0;
    f.page.locator=()=>({filter(){return this;},async click(){clicks++;throw Error('lost collapse');}});
    const record=async e=>{await f.record(e);if(fault==='journal'&&e.phase==='column_type_close_dispatch')throw Error('journal');};
    const cleanup=()=>cleanupJavascriptColumnEditor({page:f.page,state:f.state,record,deadline:Date.now()+15});
    await assert.rejects(cleanup());await assert.rejects(cleanup());
    assert.equal(clicks,fault==='lost'?1:0);assert.equal(f.state.pending.cancelDispatched,false);
    assert.equal(f.events.some(e=>e.phase==='column_editor_cancel_dispatch'),false);
  }
});

test('lost opening may close only after proving its late owned expanded picker; Apply never closes it',async()=>{
  const f=fixture();await f.open();const t=typeFixture(f);enableTypeCleanup(f,t,{lostOpening:true});let closes=0;
  f.page.locator=()=>({filter(){return this;},async click(){closes++;t.combo.isExpanded=false;t.pickerDom.shown=false;t.option.shown=false;}});
  await closeJavascriptColumnTypePicker({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
  assert.equal(closes,1);
  const a=fixture();await a.open();const at=typeFixture(a);enableTypeCleanup(a,at);a.state.pending.applyDispatched=true;
  a.page.locator=()=>{throw Error('UI effect forbidden');};
  await assert.rejects(cleanupJavascriptColumnEditor({page:a.page,state:a.state,record:a.record,deadline:Date.now()+15}));
  assert.equal(a.events.some(e=>e.phase==='column_type_close_dispatch'||e.phase==='column_editor_cancel_dispatch'),false);
});


test('proven option rejects replaced picker store even with the same records and text',async()=>{
  const f=fixture();await f.open();const t=typeFixture(f);f.setHit(()=>t.option);let clicks=0;
  await f.page.evaluate(observeJavascriptColumnEditor,{held:f.state.pending.held,phase:'editing',readPicker:true,expectedType:4,expectedLabel:'Целый'});
  const replacement={...t.store};t.combo.store=t.picker.store=t.picker.dataSource=replacement;
  t.option.onClick=async()=>{clicks++;};
  await assert.rejects(selectJavascriptColumnTypeOption({page:f.page,state:f.state,record:f.record,once:f.once,deadline:Date.now()+1000,
    id:'type-select',expectedType:4,expectedLabel:'Целый'}));
  assert.equal(clicks,0);assert.equal(f.events.at(-1).snapshot.reason,'type_picker_owner_changed');
});


test('acknowledged opening with an already collapsed picker needs no close gesture before Cancel',async()=>{
  const f=fixture();await f.open();const t=typeFixture(f,{expanded:false});enableTypeCleanup(f,t);
  f.setHit(()=>f.form.FItems.btnCancel.el.dom);
  await cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
  assert.equal(f.effects.filter(e=>e==='cancel').length,1);
  assert.equal(f.events.some(e=>e.phase==='column_type_close_dispatch'),false);
});


test('Apply waits for own sync and clean cached records even after editor closes and ModalResultOk',async()=>{
  for(const pendingFlag of ['isSyncing','needsSync','dirty','phantom','dropped','removed']){
    const f=fixture();await f.open();f.state.pending.applyDispatched=true;f.form.ModalResultOk=true;f.hide();
    const object=['isSyncing','needsSync','removed'].includes(pendingFlag)?f.store:f.records[0];
    if(pendingFlag==='removed')object.removed.push({});else object[pendingFlag]=true;
    const pending=await f.observe('applied');assert.equal(pending.status,'pending');assert.equal(pending.checks.writes_clean,false);
    f.setWait(()=>{if(pendingFlag==='removed')object.removed.length=0;else object[pendingFlag]=false;});
    await settleJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000,phase:'applied'});
    assert.equal(f.state.pending,null);assert.equal(f.effects.includes('cancel'),false);
  }
});

test('cleanup reports the settled Apply receipt without Cancel',async()=>{
  const f=fixture();await f.open();f.state.pending.applyDispatched=true;f.form.ModalResultOk=true;f.hide();
  f.records[0].data.DefaultUsageType=4;
  const applied=await cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+1000});
  assert.equal(applied.status,'settled');assert.equal(applied.reason,'apply_settlement');
  assert.equal(applied.checks.applied,true);assert.equal(f.records[0].data.DefaultUsageType,4);
  assert.equal(f.effects.includes('cancel'),false);assert.equal(f.state.pending,null);
});

test('failed Apply write keeps pending binding and cannot authorize Cancel or replay',async()=>{
  const f=fixture();await f.open();f.state.pending.applyDispatched=true;f.form.ModalResultOk=true;f.hide();
  f.store.isSyncing=false;f.records[0].dirty=true;
  const cleanup=()=>cleanupJavascriptColumnEditor({page:f.page,state:f.state,record:f.record,deadline:Date.now()+15});
  await assert.rejects(cleanup());await assert.rejects(cleanup());
  assert.ok(f.state.pending);assert.equal(f.disposed,0);assert.equal(f.effects.includes('cancel'),false);
  assert.equal(f.events.at(-1).snapshot.write_state.dirty_count,1);
});

test('capture, pre-Add recheck and Cancel share clean-write boundaries without invoking accessors',async()=>{
  for(const fault of ['sync','dirty','removed','getter']){
    const f=fixture({count:1});let calls=0;
    if(fault==='sync')f.store.isSyncing=true;
    if(fault==='dirty')f.records[0].dirty=true;
    if(fault==='removed')f.store.removed.push({});
    if(fault==='getter')Object.defineProperty(f.store,'isSyncing',{get(){calls++;throw Error('sync getter');}});
    await assert.rejects(f.open());assert.equal(calls,0);assert.deepEqual(f.effects,[]);
  }
  const f=fixture();let added=0;
  await assert.rejects(openJavascriptColumnEditor({page:f.page,context:f.context,index:0,state:f.state,once:f.once,
    record:async e=>{await f.record(e);if(e.phase==='column_editor_prepared')f.store.isSyncing=true;},deadline:Date.now()+1000,add:async()=>{added++;}}));
  assert.equal(added,0);
  const c=fixture();await c.open();c.hide();c.records.pop();c.store.isSyncing=true;
  assert.equal((await c.observe('cancelled')).status,'pending');c.store.isSyncing=false;assert.equal((await c.observe('cancelled')).status,'settled');
});

test('Apply refuses unknown record flags and replacement data cache without calling getters',async()=>{
  for(const fault of ['getter','cache']){
    const f=fixture();await f.open();f.form.ModalResultOk=true;f.hide();let calls=0;
    if(fault==='getter')Object.defineProperty(f.records[0],'dirty',{get(){calls++;throw Error('dirty getter');}});
    else f.records[0].data={...f.records[0].data};
    assert.notEqual((await f.observe('applied')).status,'settled');assert.equal(calls,0);
  }
});


// Run the production configurator and serialized observers against the same
// native/DOM editor fixture; UI gestures update its native cached records.
for(const mode of ['empty','sales','usage','business','code','wrong-ack','wrong-phase','wrong-type','wrong-label','apply-lost'])test('production schema configuration preserves '+mode,async()=>{
  const f=fixture(),root=f.context.root,page=f.controls.page.el.dom,base=page.tid;
  const generation=f.element('generation',base+';BooleanPropEdit;ValueControl',page),input=f.element('generationInput',generation.tid+';InputEl',generation),display=f.element('generationDisplay',generation.tid+';DisplayEl',generation);
  generation.classList.add('x-form-cb-checked');
  const control=f.controls.generation={el:{dom:generation},inputEl:{dom:input},checked:true};
  const add=f.element('add',base+';btnAddMappingColumn',page);f.controls.add={el:{dom:add}};
  root.querySelectorAll=selector=>f.nodes.filter(e=>root.contains(e)&&e!==root&&(selector==='[data-tid]'||selector.includes(';tbl')&&e.tid.endsWith(';tbl')));
  page.querySelectorAll=()=>[f.controls.grid.el.dom];
  let picker,usage;
  const evaluate=f.page.evaluate;
  f.page.evaluate=async(fn,arg)=>{
    if(arg?.target){const target=arg.target==='cbxDataType'?(arg.kind==='option'?picker.option:picker.triggerDom):f.form.FItems[arg.target]?.inputEl?.dom??f.form.FItems[arg.target]?.el?.dom;f.setHit(()=>target);}
    if(arg?.usageAction==='open')f.setHit(()=>usage.triggerDom);
    if(arg?.usageAction==='select')f.setHit(()=>usage.options[2]);
    return evaluate(fn,arg);
  };
  f.page.locator=selector=>{
    const tid=JSON.parse(selector.slice(10,-1)),element=f.nodes.find(e=>e.tid===tid);
    return {filter(){return this;},locator(){return this;},async fill(value){
      const key=tid.split(';').at(-1),field=f.form.FItems[key];field.value=value;field.rawValue=value;field.inputEl.dom.value=value;
      f.records.at(-1).data[key==='edtName'?'Name':'DisplayName']=value;
    },async click(){
      if(element===display){control.checked=false;generation.classList.delete('x-form-cb-checked');return;}
      if(element===add){
        f.addRecord();f.records.at(-1).internalId='declared-'+f.records.length;f.form.ModalResultOk=false;f.show();
        if(mode==='usage')f.records.at(-1).data.DefaultUsageType=0;
        for(const key of ['edtName','edtDisplayName']){const field=f.form.FItems[key];field.value=field.rawValue=field.inputEl.dom.value='COL1';}
        if(picker)for(let i=f.nodes.length-1;i>=0;i--)if(picker.wrap.contains(f.nodes[i])||picker.pickerDom.contains(f.nodes[i]))f.nodes.splice(i,1);
        const type=mode==='business'?[4,5,4,5][f.records.length-1]:f.records.length===1?4:5;
        picker=typeFixture(f,{expanded:false,type,label:type===4?'Целый':'Строковый'});
        if(mode==='usage'&&f.records.length===1){
          usage=usageFixture(f,{lazy:true});
          usage.options[2].onClick=()=>{usage.combo.value=4;usage.setExpanded(false);};
        }
        picker.option.onClick=async()=>{f.records.at(-1).data.DataType=mode==='wrong-type'?3:picker.records[0].data.Value;picker.combo.isExpanded=false;picker.pickerDom.shown=false;picker.option.shown=false;};return;
      }
      if(element===picker.triggerDom){picker.expand();return;}
      if(element===usage?.triggerDom){usage.setExpanded(true);return;}
      if(element===f.form.FItems.btnApply.el.dom){f.form.ModalResultOk=true;f.hide();if(mode==='usage'&&f.records.length===1)f.records.at(-1).data.DefaultUsageType=usage.combo.value;if(mode==='wrong-label')f.records.at(-1).data.DisplayName='Other';if(mode==='apply-lost')throw Error('lost Apply');return;}
      assert.fail('unexpected gesture '+tid);
    }};
  };
  const run=()=>configureJavascriptSchema({page:f.page,context:f.context,mode:mode==='code'?'code':'declared',fixedCase:mode==='business'?'business-output':mode==='usage'?'usage-output':mode==='sales'||mode==='code'?undefined:'cardinality-empty',columnState:f.state,once:f.once,deadline:Date.now()+1000,
    record:async event=>{f.events.push(event);return event.phase==='javascript_declared_empty_verified'?(mode==='wrong-ack'?{}:mode==='wrong-phase'?{...event,phase:'wrong'}:event):event;}});
  if(['wrong-ack','wrong-phase','wrong-type','wrong-label','apply-lost'].includes(mode)){await assert.rejects(run);assert.equal(f.events.some(e=>e.phase==='javascript_declared_empty_verified'),['wrong-ack','wrong-phase'].includes(mode));return;}
  const result=await run();assert.equal(result.verified,true);
  if(mode==='empty'){verifyJavascriptDeclaredEmpty(result.declaration,result.declaration_sha256);assert.deepEqual(f.records.map(r=>[r.data.Name,r.data.DisplayName,r.data.DataType]),[['Value','Value',4]]);assert.equal(f.state.pending,null);assert.equal(f.effects.filter(e=>e==='schema-apply-0').length,1);}
  if(mode==='sales')assert.deepEqual(f.records.map(r=>[r.data.Name,r.data.DataType]),[['ObservedID',4],['PhaseMarker',5]]);
  if(mode==='business')assert.deepEqual(f.records.map(r=>[r.data.Name,r.data.DataType]),[['RowID',4],['CustomerKey',5],['NetCents',4],['Status',5]]);
  if(mode==='usage'){assert.deepEqual(f.records.map(r=>[r.data.Name,r.data.DataType,r.data.DefaultUsageType]),[['ObservedID',4,4],['PhaseMarker',5,0]]);assert.equal(f.effects.filter(e=>e==='schema-usage-select').length,1);}
  if(mode==='code'){assert.equal(result.generation.checked,true);assert.equal(f.records.length,0);assert.equal(f.effects.length,0);}
});
