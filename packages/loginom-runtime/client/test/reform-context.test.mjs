import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readReformBrowser,readReformContext} from '../lib/reform-context.mjs';

function fixture(count=5) {
 const base='MF;TF;WizrdMCF;ReformColumnsWizard;',elements=[],components={};
 const element=(tid,parent)=>{const e={id:'e'+elements.length,tid,parent,checkVisibility:()=>true,contains(x){return x===this||x.parent===this;}};elements.push(e);return e;};
 const root=element(base.slice(0,-1));
 const records=Array.from({length:count},(_,i)=>({isModel:true,internalId:'r'+i,data:{ID:i,Index:i,Name:'F'+i,DisplayName:'Одинаковая метка',DataType:5,DataKind:2,DefaultUsageType:0,CachingMethod:0,Excluded:false,Broken:false,ReverseBroken:false}}));
 const proxy={$className:'bg.ext.CollectionProxy',pendingOperations:{}},data={items:records},selection=[];
 const store={$className:'Ext.data.Store',currentPage:1,getProxy:()=>proxy,getData:()=>data,getCount:()=>records.length,getTotalCount:()=>records.length,getRemoteFilter:()=>false,getRemoteSort:()=>false,isLoading:()=>false};
 const gridElement=element(base+'grdTargetColumns',root),grid={el:{dom:gridElement},getStore:()=>store,getSelectionModel:()=>({getSelection:()=>selection})};components[gridElement.id]=grid;
 const cacheElement=element(base+'pedDataSourceCachingMethod;ValueControl',root),cache={el:{dom:cacheElement},getValue:()=>0,getRawValue:()=>'Отключено'};components[cacheElement.id]=cache;
 const switchElement=element(base+'pedDataSourceCachingMethod;SwitchButton',root),switcher={el:{dom:switchElement},pressed:false};components[switchElement.id]=switcher;
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>q.startsWith('[data-tid=')?elements.filter(e=>e.tid===JSON.parse(q.slice(10,-1))):[]}};
 return {root,element,records,proxy,data,store,selection,grid,cache,switcher,read:()=>JSON.parse(JSON.stringify(vm.runInNewContext('('+readReformBrowser.toString()+')("MF;TF")',context)))};
}

test('reform inventory preserves distinct identities with identical labels, exclusions and cache',()=>{
 const f=fixture();f.records[3].data.Name='Renamed';f.records[3].data.DataType=3;f.records[4].data.Excluded=true;f.records[2].data.CachingMethod=2;f.selection.push(f.records[3]);
 const r=f.read();assert.equal(r.verified,true);assert.equal(r.fields[3].record_id,'r3');assert.equal(r.fields[3].field_id,'3');assert.equal(r.fields[3].name,'Renamed');assert.equal(r.fields[3].selected,true);
 assert.equal(r.fields[4].excluded,true);assert.equal(r.fields[2].caching_method,2);assert.equal(r.settings_applied,false);assert.equal(r.source_identity_verified,false);
});
test('reform accepts empty and wide local inventory without claiming rendered rows or source mapping',()=>{
 for(const count of [0,9,128,1000]){const r=fixture(count).read();assert.equal(r.verified,true);assert.equal(r.fields.length,count);assert.equal(r.inventory_complete,true);assert.equal(r.source_identity_verified,false);}
 assert.equal(fixture(1001).read().verified,false);
});
test('reform rejects filtered, loading, remote, pending and stale collections',()=>{
 for(const change of [f=>f.store.getCount=()=>99,f=>f.store.getTotalCount=()=>99,f=>f.store.isLoading=()=>true,f=>f.store.isBufferedStore=true,
  f=>f.store.getRemoteFilter=()=>true,f=>f.store.getRemoteSort=()=>true,f=>f.store.currentPage=2,f=>f.proxy.$className='Ext.data.proxy.Ajax',
  f=>f.proxy.pendingOperations={request:{}},f=>f.data.getSource=()=>({items:[]}),f=>f.grid.el.dom={},f=>f.root.checkVisibility=()=>false]){
  const f=fixture();change(f);assert.equal(f.read().verified,false);
 }
});
test('reform rejects ambiguous record identities and malformed settings instead of accepting partial schema',()=>{
 for(const change of [f=>f.records[1].internalId='r0',f=>f.records[1].data.ID=0,f=>f.records[1].data.Index=0,f=>f.records[1].data.Name='f0',
  f=>f.records[1].data.DataType=0,f=>f.records[1].data.DataKind=3,f=>f.records[1].data.DefaultUsageType=5,
  f=>f.records[1].data.CachingMethod=3,f=>f.records[1].data.Excluded=1,f=>f.records[1].data.Broken=true,f=>f.records[1].data.ReverseBroken=true,
  f=>f.records[1].data.DisplayName='x'.repeat(257),f=>f.selection.push({}),f=>f.cache.getValue=()=>4,f=>f.switcher.pressed=null]){
  const f=fixture();change(f);assert.equal(f.read().verified,false);
 }
});
test('reform refuses a still-open editor and records variable-driven caching without changing it',()=>{
 const f=fixture();f.switcher.pressed=true;assert.equal(f.read().caching.variable,true);
 f.element('EditReformColumnDefForm');assert.equal(f.read().reason,'reform_editor');
});
test('reform context checks node ownership before and after reading',async()=>{
 let i=0;assert.equal((await readReformContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++i}))).reason,'reform_node_changed');
 for(const extra of [{input_port:{}},{output_port:{}},{surface:'graph'}])assert.equal((await readReformContext({}, {},async()=>({verified:true,surface:'wizard',...extra}))).reason,'reform_node_surface');
});
