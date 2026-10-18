import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readLinRegressionBrowser,readLinRegressionContext} from '../lib/linregression-context.mjs';

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
