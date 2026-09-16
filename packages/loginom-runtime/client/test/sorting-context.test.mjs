import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readSortingBrowser,readSortingContext} from '../lib/sorting-context.mjs';
function fixture(){
 const all=[],components={},base='MF;TF;WizrdMCF;SortingWizard;SortingColumnCollection;';
 const element=(tid,parent=null)=>{const e={id:'e'+all.length,tid,parent,checkVisibility:()=>true,contains(x){return x===this||!!x.parent&&this.contains(x.parent)}};all.push(e);return e;};
 const root=element(base.slice(0,-1)),available=element(base+'grdFields',root),used=element(base+'grdSorting',root);
 const records=['Key','Amount','Other'].map((Name,i)=>({isModel:true,internalId:'r'+i,data:{Name,DisplayName:'Same',DataType:i?3:5}}));
 const keys=[{isModel:true,internalId:'k1',data:{...records[1].data,Index:0,SortDirection:1,CaseSensitive:true}},{isModel:true,internalId:'k0',data:{...records[0].data,Index:0,SortDirection:0,CaseSensitive:false}}];
 const store=items=>({$className:'Ext.data.Store',getProxy:()=>({$className:'bg.ext.CollectionProxy'}),getData:()=>({items}),getCount:()=>items.length,isLoading:()=>false,getTotalCount:()=>0});
 const source=store(records),sort=store(keys),chain={$className:'Ext.data.ChainedStore',getSource:()=>source,getData:()=>({items:records.filter(r=>!keys.some(k=>k.data.Name===r.data.Name))})};
 const selections=[[records[0]],[keys[0]]];
 for(const [i,e] of [available,used].entries())components[e.id]={el:{dom:e},getStore:()=>i?sort:chain,getSelectionModel:()=>({getSelection:()=>selections[i]})};
 for(const k of ['chkLocaleAware','chkBufferWhole','cbxMaxThreadCount'])for(const part of ['ValueControl','SwitchButton']){const e=element(base+k+';'+part,root);components[e.id]={el:{dom:e},getValue:()=>k==='cbxMaxThreadCount'?0:k==='chkLocaleAware',pressed:false};}
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>q.startsWith('[data-tid=')?all.filter(e=>e.tid===JSON.parse(q.slice(10,-1))):[]}};
 return {root,records,keys,source,sort,chain,selections,components,read:()=>vm.runInNewContext('('+readSortingBrowser.toString()+')("MF;TF")',context)};
}
test('sorting uses item priority, not stale Index or totalCount, and exact input names',()=>{const r=fixture().read();assert.equal(r.verified,true);assert.equal(r.keys[0].name,'Amount');assert.equal(r.keys[1].order,1);assert.equal(r.keys[0].direction,'DESC');assert.equal(r.comparison.locale_verified,false);assert.equal(r.settings_applied,false);});
test('sorting accepts a source selection retained after moving that field',()=>{const f=fixture();assert.equal(f.read().verified,true);f.selections[0]=[{}];assert.equal(f.read().verified,false);});
function renamedInputFixture(){
 const f=fixture();f.records[1].data.Name='RevenueAlias';f.records[1].data.DisplayName='Выручка alias';
 Object.assign(f.keys[0].data,{Name:'total_revenue',DisplayName:'total_revenue',DataType:0});return f;
}
test('sorting exposes the native missing-input key after an input alias changes, retaining its deletion identity',()=>{
 const f=renamedInputFixture(),r=f.read();assert.equal(r.verified,true);
 assert.deepEqual(JSON.parse(JSON.stringify(r.keys[0])),{record_id:'k1',name:'total_revenue',label:'total_revenue',type:null,missing_input:true,order:0,direction:'DESC',case_sensitive:true});
 assert.equal(r.input_fields.find(field=>field.name==='RevenueAlias').type,'real');
 assert.equal(r.keys[1].name,'Key');assert.equal(r.inventory_complete,true);assert.equal(r.settings_applied,false);
});
test('sorting rejects unknown typed keys and malformed missing-input placeholders',()=>{
 for(const change of [f=>f.keys[0].data.DataType=3,f=>f.keys[0].data.DisplayName='Unverified label',f=>f.keys[0].data.Name='',f=>f.keys[0].data.Name='RevenueAlias']){
  const f=renamedInputFixture();change(f);assert.equal(f.read().verified,false);
 }
});
test('sorting rejects duplicate selected record IDs and keys, including missing-input placeholders',()=>{
 for(const change of [f=>f.keys[1].internalId=f.keys[0].internalId,f=>f.keys[1].data={...f.keys[0].data}]){
  for(const create of [fixture,renamedInputFixture]){const f=create();change(f);assert.equal(f.read().verified,false);}
 }
});
test('sorting rejects incomplete inventory, stale bindings, duplicate keys and wrong field types',()=>{
 for(const change of [f=>f.source.getCount=()=>99,f=>f.sort.isLoading=()=>true,f=>f.keys.push(f.keys[0]),f=>f.keys[0].data.Name='missing',f=>f.keys[0].data.DataType=5,f=>f.keys[0].data.SortDirection=2,f=>f.keys[0].data.CaseSensitive='false',f=>f.records[2].data.Name='KEY',f=>f.chain.getData=()=>({items:f.records}),f=>f.source.getData=()=>({items:f.records,getSource:()=>({items:[]})}),f=>f.root.checkVisibility=()=>false]){
 const f=fixture();change(f);assert.equal(f.read().verified,false);
 }
});
test('sorting context rejects changed owner and separate port wizards',async()=>{let i=0;assert.equal((await readSortingContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++i}))).verified,false);assert.equal((await readSortingContext({}, {},async()=>({verified:true,surface:'wizard',input_port:{}}))).reason,'sorting_node_surface');});
test('sorting reports the documented limit of binary case folding',()=>{
 const f=fixture();assert.equal(f.read().comparison.case_insensitivity,'locale_dependent');
 const locale=Object.values(f.components).find(c=>c.el.dom.tid.endsWith("chkLocaleAware;ValueControl"));
 locale.getValue=()=>false;assert.equal(f.read().comparison.case_insensitivity,"latin_only");assert.equal(f.read().comparison.mode,"binary");
});
