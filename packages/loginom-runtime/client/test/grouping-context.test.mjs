import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readGroupingBrowser,readGroupingContext} from '../lib/grouping-context.mjs';
function fixture(){
 const all=[],components={},base='MF;TF;WizrdMCF;GroupDataWizard;';
 const element=(tid,parent=null)=>{const e={id:'e'+all.length,tid,parent,checkVisibility:()=>true,contains(x){return x===this||!!x.parent&&this.contains(x.parent)}};all.push(e);return e;};
 const root=element(base.slice(0,-1)),available=element(base+'grdDataFields',root),used=element(base+'grdUsedFields',root);
 const records=['Key','Amount','Other'].map((Name,i)=>({isModel:true,internalId:'r'+i,data:{Name,DisplayName:'Same',DataType:i?3:5,Disposition:i===0?6:i===1?7:0,Order:0,GroupFunctions:i===1?18:0,Separator:',',Wrapper:'',UniqueOnly:true,Sort:false,SortDirection:0}}));
 const store={$className:'Ext.data.Store',getData:()=>({items:records}),getCount:()=>records.length,isLoading:()=>false};
 const chains=[0,1].map(i=>({$className:'Ext.data.ChainedStore',getSource:()=>store,getData:()=>({items:records.filter(r=>i?r.data.Disposition!==0:r.data.Disposition===0)})})),selected=[];
 for(const [i,e] of [available,used].entries())components[e.id]={el:{dom:e},getStore:()=>chains[i],getSelectionModel:()=>({getSelection:()=>selected})};
 for(const k of ['pedDimCache','pedSortResult'])for(const part of ['ValueControl','SwitchButton']){const e=element(base+k+';'+part,root);components[e.id]={el:{dom:e},getValue:()=>true,pressed:false};}
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>q.startsWith('[data-tid=')?all.filter(e=>e.tid===JSON.parse(q.slice(10,-1))):[]}};
 return {root,records,store,chains,components,selected,read:()=>vm.runInNewContext('('+readGroupingBrowser.toString()+')("MF;TF")',context)};
}
test('grouping reads complete source identities even when labels coincide',()=>{const r=fixture().read();assert.equal(r.verified,true);assert.equal(r.keys[0].name,'Key');assert.equal(r.measures[0].name,'Amount');assert.equal(r.measures[0].functions,18);assert.equal(r.settings_applied,false);});
test('grouping accepts observed removal sentinel and only exact empty-section placeholder',()=>{const f=fixture();f.records[0].data.Disposition=0;f.records[0].data.Order=-1;const empty={isModel:true,internalId:'placeholder',data:{DataType:0,DisplayName:'',Disposition:6,Order:0,Index:0,GroupFunctions:0,Separator:'',Wrapper:'',UniqueOnly:false,Sort:false,SortDirection:0}};f.records.push(empty);f.selected.push(empty);assert.equal(f.read().verified,true);assert.equal(f.read().input_fields.length,3);f.records[0].data.Disposition=6;f.records[0].data.Order=0;assert.equal(f.read().verified,false);});
test('grouping refuses filtered inventories, identity drift and malformed records',()=>{
 const mutations=[f=>f.store.getCount=()=>100,f=>f.chains[1].getSource=()=>({...f.store}),f=>f.store.isLoading=()=>true,
 f=>f.store.getData=()=>({items:f.records,getSource:()=>({items:[f.records[0]]})}),f=>f.records[1].data.Name='key',f=>f.records[1].internalId='r0',
 f=>f.records[0].data.Order=-1,f=>f.records[1].data.GroupFunctions=16384,f=>f.records[1].data.DataType=0,f=>f.selected.push({}),f=>f.root.checkVisibility=()=>false];
 for(const change of mutations){const f=fixture();change(f);assert.equal(f.read().verified,false);}
});
test('grouping guards node ownership and refuses a port wizard',async()=>{let i=0;assert.equal((await readGroupingContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++i}))).verified,false);assert.equal((await readGroupingContext({}, {},async()=>({verified:true,surface:'wizard',input_port:{}}))).reason,'grouping_node_surface');});
