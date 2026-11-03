import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readBinningBrowser,readBinningContext} from '../lib/binning-context.mjs';
function fixture(){
 const prefix='MF;TF-1',base=prefix+';WizrdMCF;MethodSettingsWizard-1',elements=[],components={};
 const element=(tid,parent)=>{const e={id:'e'+elements.length,tid,parent,checkVisibility:()=>true,contains(x){return x===this||x?.parent===this;}};elements.push(e);return e;};
 const root=element(base),view={el:{dom:root}},wizard=element(prefix+';WizrdMCF'),w={el:{dom:wizard},[Symbol('LockQueue')]:{IsEmpty:true}};
 const records=[{isModel:true,internalId:'row0',data:{Index:0,DisplayName:'RowID',DataType:4,MethodType:0,BinsCount:0,AlwaysDefaultSettings:false}},
  {isModel:true,internalId:'row1',data:{Index:1,DisplayName:'X',DataType:3,MethodType:3,BinsCount:2,AlwaysDefaultSettings:false}}];
 for(const r of records)Object.defineProperty(r.data,'Column',{get(){throw Error('RPC column must never be read');}});
 const selection=[records[1]],store={$className:'Ext.data.Store',getData:()=>({items:records}),getCount:()=>records.length,isLoading:()=>false};
 const gridElement=element(base+';grdColumns',root),grid={el:{dom:gridElement},getStore:()=>store,getSelectionModel:()=>({getSelection:()=>selection}),editingPlugin:{editing:false}};
 const bins=[0,1].map(i=>({isModel:true,data:{ColIndex:1,BinIndex:i,BinNumber:i,BinLabel:i?'(10..20]':'[0..10]',BoundModes:i?2:3,LowerBoundValue:i*10,UpperBoundValue:(i+1)*10,InvalidMode:0,LowerBoundInvalid:false,UpperBoundInvalid:false,BoundModeInvalid:false}}));
 const binStore={$className:'Ext.data.Store',getData:()=>({items:bins}),getCount:()=>bins.length,isLoading:()=>false};
 const binElement=element(base+';grdBins',root),binGrid={el:{dom:binElement},getStore:()=>binStore};
 class MethodSettingsWizard{};
 const controller=Object.assign(new MethodSettingsWizard(),{FView:{},FGrdColumns:grid,FInputColumnStore:store,FBinItemsStore:binStore,FBinsReloading:false,FWizardForm:{FView:w},FViewedColumnRecord:records[1],FMethodSettingFrames:{}});
 view['@@TestCmpController']=controller;Object.assign(components,{[root.id]:view,[wizard.id]:w,[gridElement.id]:grid,[binElement.id]:binGrid});
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>elements.filter(e=>e.tid===JSON.parse(q.slice(10,-1)))}};
 return {controller,store,binStore,records,bins,selection,grid,w,read:()=>JSON.parse(JSON.stringify(vm.runInNewContext('('+readBinningBrowser.toString()+')('+JSON.stringify(prefix)+')',context)))};
}
test('bound binning UI inventory survives detached vendor FView and never calls column RPC',()=>{
 const f=fixture(),r=f.read();assert.equal(r.verified,true);assert.deepEqual(r.fields.map(f=>[f.index,f.label,f.method_code]),[[0,'RowID',0],[1,'X',3]]);
 assert.equal(r.state,'materialized');assert.deepEqual(r.intervals.map(b=>[b.lower,b.upper,b.lower_included,b.upper_included]),[[0,10,true,true],[10,20,false,true]]);
 assert.equal(r.settings_applied,false);
});
test('incomplete input/bins, pending selection, foreign owners and invalid intervals refuse',()=>{
 for(const change of [f=>f.store.isLoading=()=>true,f=>f.store.getCount=()=>99,f=>f.controller.FGrdColumns={},f=>f.controller.FInputColumnStore={},
  f=>f.controller.FWizardForm.FView={},f=>f.controller.FViewedColumnRecord=f.records[0],f=>f.controller.FBinsReloading=true,
  f=>f.records[1].data.Index=0,f=>f.records[1].data.DataType=5,f=>f.binStore.isLoading=()=>true,f=>f.bins[1].data.ColIndex=9,
  f=>f.bins[1].data.LowerBoundInvalid=true,f=>f.bins.pop(),f=>f.bins[1].data.UpperBoundValue=Infinity]){
  const f=fixture();change(f);assert.equal(f.read().verified,false);
 }
});
test('settings-only field is distinguished from a materialized saved model',()=>{
 const f=fixture();f.records[1].data.BinsCount=0;f.bins.splice(0);const r=f.read();assert.equal(r.verified,true);assert.equal(r.state,'settings');assert.deepEqual(r.intervals,[]);
});
test('an empty numeric store after reopening is not a ready Binning inventory',()=>{
 const f=fixture();f.records.splice(0);f.selection.splice(0);f.bins.splice(0);f.controller.FViewedColumnRecord=null;
 assert.equal(f.read().verified,false);
});
test('prepared owner must stay identical around the native read',async()=>{
 let i=0;const r=await readBinningContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF-1'}},async()=>({verified:true,surface:'wizard',node_id:++i}));
 assert.equal(r.reason,'binning_owner_changed');
 assert.equal((await readBinningContext({}, {},async()=>({verified:true,surface:'graph'}))).reason,'binning_surface');
});
test('serialized workspace observer recognizes both Binning-specific wizard pages',async()=>{
 const {Page}=await import('./support/workspace-ui-fixture.mjs');
 for(const [marker,stage] of [['MethodSettingsWizard-1;grdColumns','binning'],['DerivedDataSourceMappingEngineOutputPortWizard-1;btnAddMappingColumn','binning_ranges_mapping']]){
  const page=new Page(),root=page.add('div','MF;TF-1;WizrdMCF');page.add('div','MF;TF-1;WizrdMCF;'+marker,'',undefined,root);
  const r=await page.observe();assert.equal(r.wizard.stage,stage);
 }
});
test('Binning field and method cells are actionable only on their own wizard page',async()=>{
 const {Page}=await import('./support/workspace-ui-fixture.mjs');
 for(const own of [true,false]){
  const page=new Page(),base='MF;TF-1;WizrdMCF',root=page.add('div',base,'',{x:0,y:70,width:900,height:600});
  page.add('div',base+(own?';MethodSettingsWizard-1;grdColumns':';CalcDataWizard;btnAddExpression'),'',{x:0,y:75,width:400,height:300},root);
  for(const [i,name] of ['colDisplayName_1','colMethodType_1'].entries())page.add('td',base+';MethodSettingsWizard-1;'+name,'X',{x:50+i*150,y:120,width:100,height:25},root);
  const r=await page.observe(),cells=r.ui.elements.filter(e=>/;col(?:DisplayName|MethodType)_1$/.test(e.tid??''));
  assert.equal(cells.length,own?2:0);for(const cell of cells)assert.ok(cell.allowed_actions.includes('double_click'));
 }
});
