import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readLinRegressionBrowser,readLinRegressionContext} from '../lib/linregression-context.mjs';

function partitionFixture(change=()=>{}){
 const base='MF;TF;WizrdMCF;LearnPartitionWizard',elements=new Map(),components={},icons=[{},{}],identity={ids:new WeakMap(),refs:new Map()};
 const add=(tid,value,disabled=false)=>{const e={id:tid,checkVisibility:()=>true,getBoundingClientRect:()=>({x:0,y:0,width:500,height:300})};elements.set(tid,[e]);components[tid]={el:{dom:e},getValue:()=>value,isDisabled:()=>disabled,pressed:false};return e;};
 add(base);for(const [key,value] of [['pedSamplingMethod',1],['ValidationSettings;pedLearnValidationMethod',0]])add(base+';'+key+';ValueControl',value);
 for(const index of [0,1]){
  const suffix=index?'-1':'',root=base+';SizeGridForm;',path=';FloatPropEdit'+suffix+';PropContainer;ValueContainer;ValueControl';
  add(root+'colAbsoluteSize'+path,index?2:16);add(root+'colRelativeSize'+path,index?0:100,true);
  for(const key of ['colAbsoluteSize','colRelativeSize'])add(root+key+';FloatPropEdit'+suffix+';SwitchButton');
  const icon=icons[index];elements.set(root+'colSizeType_'+index,[{querySelectorAll:()=>[icon]},...(index?[{querySelectorAll:()=>[]}]:[])]);
  identity.ids.set(icon,'ui-icon-'+index);identity.refs.set('ui-icon-'+index,{deref:()=>icon});
 }
 const grid=add(base+';SequenceMethodForm;grdSequence'),records=[0,1,2].map(PartitionType=>({isModel:true,data:{PartitionType,SequenceOrder:PartitionType,SizePath:''}}));
 const store={$className:'Ext.data.Store',getData:()=>({items:records}),getCount:()=>records.length,isLoading:()=>false};components[grid.id].getStore=()=>store;
 const document={querySelectorAll:q=>q.startsWith('[data-tid=')?elements.get(JSON.parse(q.slice(10,-1)))??[]:[]};identity.document=document;
 change({components,elements,identity,records,store,base});
 const context=vm.createContext({document,Ext:{getCmp:id=>components[id]},innerWidth:1280,innerHeight:800});context[Symbol.for('loginom-dock.workspace-ui.identity.v1')]=identity;
 return JSON.parse(JSON.stringify(vm.runInContext('('+readLinRegressionBrowser.toString()+')',context)('MF;TF')));
}
test('native partition reads absolute 16/2 rather than stale 100/0 percentages and ignores the summary cell',()=>{
 const state=partitionFixture();assert.equal(state.verified,true);assert.deepEqual(state.sizes.map(s=>[s.unit,s.count]),[['rows',16],['rows',2]]);assert.deepEqual(state.sequence,[0,1,2]);
});
test('partition reader refuses stale icon references, variable binding and incomplete sequence ownership',()=>{
 for(const change of [f=>f.identity.refs.clear(),f=>f.records.pop(),f=>f.store.isLoading=()=>true,f=>f.records[1].data.PartitionType=0,
  f=>f.components[f.base+';SizeGridForm;colAbsoluteSize;FloatPropEdit;SwitchButton'].pressed=true,
  f=>f.components[f.base+';SizeGridForm;colRelativeSize;FloatPropEdit;PropContainer;ValueContainer;ValueControl'].isDisabled=()=>false])assert.equal(partitionFixture(change).verified,false);
});

test('serialized LearnPartition wizard exposes its native sampling picker',async()=>{
 const {Page}=await import('./support/workspace-ui-fixture.mjs');
 const page=new Page(),base='MF;TF-1;WizrdMCF',form=page.add('div',base);
 page.add('div',base+';LearnPartitionWizard;SizeGridForm;grdDataSet','',undefined,form);
 const owner=page.add('div',base+';LearnPartitionWizard;pedSamplingMethod;ValueControl','',undefined,form);
 const picker=page.add('div',owner.getAttribute('data-tid')+';trg_picker','',{x:100,y:100,width:20,height:20},owner);
 const state=await page.observe();assert.equal(state.wizard.stage,'learn_partition');
 const control=state.ui.elements.find(e=>e.tid===picker.getAttribute('data-tid'));assert.ok(control?.allowed_actions.includes('click'));
 assert.equal((await page.act({verb:'click',ref:control.ref},state)).status,'SUCCEEDED');
});

function fixture(count=5) {
 const base='MF;TF;WizrdMCF;TuneDataSourceInputPortWizard;',elements=[],components={};
 const element=(tid,parent)=>{const e={id:'e'+elements.length,tid,parent,checkVisibility:()=>true,contains(x){return x===this||x.parent===this;}};elements.push(e);return e;};
 const root=element(base.slice(0,-1));
 const records=Array.from({length:count},(_,i)=>({isModel:true,internalId:'r'+i,data:{ID:i,Index:i,Name:'F'+i,DisplayName:'Одинаковая метка',DataType:5,DataKind:2,UsageType:0,DefaultUsageType:0,GroupField:"",OriginType:0,Broken:false,ReverseBroken:false}}));
 const proxy={$className:'bg.ext.CollectionProxy',pendingOperations:{}},data={items:records},selection=[];
 const store={$className:'Ext.data.Store',currentPage:1,getProxy:()=>proxy,getData:()=>data,getCount:()=>records.length,getTotalCount:()=>records.length,getRemoteFilter:()=>false,getRemoteSort:()=>false,isLoading:()=>false};
 const gridElement=element(base+'grdTargetColumns',root),grid={el:{dom:gridElement},getStore:()=>store,getSelectionModel:()=>({getSelection:()=>selection})};components[gridElement.id]=grid;
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>q.startsWith('[data-tid=')?elements.filter(e=>e.tid===JSON.parse(q.slice(10,-1))):[]}};
 return {root,element,records,proxy,data,store,selection,grid,read:()=>JSON.parse(JSON.stringify(vm.runInNewContext('('+readLinRegressionBrowser.toString()+')("MF;TF")',context)))};
}


test('regression roles use UsageType and preserve identity of noncompared columns',()=>{
 const f=fixture();f.records[1].data.UsageType=3;f.records[2].data.UsageType=4;f.records[2].data.DefaultUsageType=0;
 const r=f.read();assert.equal(r.verified,true);assert.deepEqual(r.fields.map(f=>f.usage_type),[0,3,4,0,0]);assert.equal(r.fields[2].field_id,'2');assert.equal(r.source_identity_verified,false);assert.equal(r.settings_applied,false);
});
test('regression inventory covers complete wide schemas without relying on visible row count',()=>{
 for(const count of [0,9,128,1000]){const r=fixture(count).read();assert.equal(r.verified,true);assert.equal(r.fields.length,count);}
 assert.equal(fixture(1001).read().verified,false);
});
test('regression reader refuses incomplete, stale or remotely loaded inventories',()=>{
 for(const change of [f=>f.store.getCount=()=>99,f=>f.store.getTotalCount=()=>99,f=>f.store.isLoading=()=>true,
 f=>f.store.isBufferedStore=true,f=>f.store.getRemoteFilter=()=>true,f=>f.store.currentPage=2,
 f=>f.proxy.$className='Ext.data.proxy.Ajax',f=>f.proxy.pendingOperations={request:{}},f=>f.data.getSource=()=>({items:[]}),f=>f.grid.el.dom={}]){
 const f=fixture();change(f);assert.equal(f.read().verified,false);
 }
});
test('regression reader rejects invalid roles, ambiguous identity and open editors',()=>{
 for(const change of [f=>f.records[1].data.UsageType=1,f=>f.records[1].data.ID=0,f=>f.records[1].data.Index=0,
 f=>f.records[1].data.Name='f0',f=>f.records[1].data.Broken=true,f=>f.records[1].data.GroupField='unexpected',
 f=>f.selection.push({}),f=>f.element('EditTuneColumnDefForm')]){const f=fixture();change(f);assert.equal(f.read().verified,false);}
});
test('linregression ownership must remain stable across the complete read',async()=>{
 let i=0;assert.equal((await readLinRegressionContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++i}))).reason,'linregression_node_changed');
 for(const extra of [{input_port:{}},{output_port:{}},{surface:'graph'}])assert.equal((await readLinRegressionContext({}, {},async()=>({verified:true,surface:'wizard',...extra}))).reason,'linregression_node_surface');
});


test('the native Enter method picker is actionable through the serialized workspace observer',async()=>{
 const {Page}=await import('./support/workspace-ui-fixture.mjs');
 const page=new Page(),base='MF;TF-1;WizrdMCF',form=page.add('div',base);
 const method=page.add('div',base+';LinRegressionWizard;pedRegressionMethod','',undefined,form);
 const owner=page.add('div',method.getAttribute('data-tid')+';ValueControl','',undefined,method);
 const picker=page.add('div',owner.getAttribute('data-tid')+';trg_picker','',{x:100,y:100,width:20,height:20},owner);
 const observed=await page.observe();
 assert.equal(observed.wizard.stage,'lin_regression');
 const control=observed.ui.elements.find(e=>e.tid===picker.getAttribute('data-tid'));
 assert.ok(control?.allowed_actions.includes('click'));
 const clicked=await page.act({verb:'click',ref:control.ref},observed);
 assert.equal(clicked.status,'SUCCEEDED',JSON.stringify(clicked.error));
});

test('Forward native selection and numeric controls are included in the serialized wizard observation',async()=>{
 const {Page}=await import('./support/workspace-ui-fixture.mjs');
 const page=new Page(),base='MF;TF-1;WizrdMCF',form=page.add('div',base);
 page.add('div',base+';LinRegressionWizard-1;pedEpsilon','',undefined,form);
 const field=page.add('div',base+';LinRegressionWizard-1;pedRegSelQuality;ValueControl','',undefined,form);
 const picker=page.add('div',field.getAttribute('data-tid')+';trg_picker','',{x:100,y:100,width:20,height:20},field);
 const observation=await page.observe();assert.equal(observation.wizard.stage,'lin_regression_details');
 const observed=observation.ui.elements.find(e=>e.tid===picker.getAttribute('data-tid'));
 assert.ok(observed?.allowed_actions.includes('click'));
});

test('Ridge manual setup picker is exposed by the production wizard observer',async()=>{
 const {Page}=await import('./support/workspace-ui-fixture.mjs');
 const page=new Page(),base='MF;TF-1;WizrdMCF',form=page.add('div',base);
 page.add('div',base+';LinRegressionWizard-1;pedEpsilon','',undefined,form);
 const field=page.add('div',base+';LinRegressionWizard-1;pedRidgeSetupMethod;ValueControl','',undefined,form);
 const picker=page.add('div',field.getAttribute('data-tid')+';trg_picker','',{x:100,y:100,width:20,height:20},field);
 const observation=await page.observe();assert.equal(observation.wizard.stage,'lin_regression_details');
 const control=observation.ui.elements.find(e=>e.tid===picker.getAttribute('data-tid'));
 assert.ok(control?.allowed_actions.includes('click'));
});
test('LASSO manual setup picker is exposed by the production wizard observer',async()=>{
 const {Page}=await import('./support/workspace-ui-fixture.mjs');
 const page=new Page(),base='MF;TF-1;WizrdMCF',form=page.add('div',base);
 page.add('div',base+';LinRegressionWizard-1;pedEpsilon','',undefined,form);
 const field=page.add('div',base+';LinRegressionWizard-1;pedLassoSetupMethod;ValueControl','',undefined,form);
 const picker=page.add('div',field.getAttribute('data-tid')+';trg_picker','',{x:100,y:100,width:20,height:20},field);
 const observation=await page.observe();assert.equal(observation.wizard.stage,'lin_regression_details');
 const control=observation.ui.elements.find(e=>e.tid===picker.getAttribute('data-tid'));
 assert.ok(control?.allowed_actions.includes('click'));
});
