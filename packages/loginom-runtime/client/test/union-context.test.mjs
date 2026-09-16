import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readUnionBrowser,readUnionContext} from '../lib/union-context.mjs';
function fixture(){
 const all=[],components={},base='MF;TF;WizrdMCF;UnionDataWizard';
 const element=(tid,parent=null)=>{const e={id:'e'+all.length,tid,parent,getAttribute(name){return name==='data-tid'?this.tid:null;},checkVisibility:()=>true,contains(x){return x===this||!!x.parent&&this.contains(x.parent)}};all.push(e);return e;};
 const wizard=element('MF;TF;WizrdMCF'),root=element(base,wizard),form={};
 const add=(key,value)=>{const e=element(base+';'+key,root);components[e.id]={el:{dom:e},...value};return components[e.id];};
 const records=[['A','B'],['Y','X'],['P','Q','Extra']].map((names,port)=>names.map((Name,Index)=>({isModel:true,internalId:port+'-'+Index,data:{Name,DisplayName:'Same label',DataType:5,Index,...(port?{Value:Index,Link:Index<2?1-Index:-1}:{chk1:true,col1:1-Index,chk2:true,col2:1-Index})}})));
 const stores=records.map(items=>({$className:'Ext.data.Store',getProxy:()=>({$className:'bg.ext.CollectionProxy'}),getData:()=>({items}),getCount:()=>items.length,getTotalCount:()=>items.length,getRemoteFilter:()=>false,getRemoteSort:()=>false}));
 for(const key of ['grdUnionData','grdUnionData;grd','grdUnionData;grd-1'])add(key,{getStore:()=>stores[0]});
 const owner={constructor:{name:'UnionDataWizard'},FWizardForm:form,FMainColumnStore:stores[0],FJoinedColumnStores:stores.slice(1),FColumnsPrepared:true,FLinkAssignedProps:['chk1','chk2'],FLinkValueProps:['col1','col2']};
 components[root.id]={el:{dom:root},'@@TestCmpController':owner};components[wizard.id]={el:{dom:wizard},Controller:form};
 add('cntUsePrefixes;cnt;chb',{getValue:()=>false});const properties=[];add('pedUsePrefixes',{Controller:{FLastViewMode:0,FLastValue:false,FInitializing:false}});add('pedUsePrefixes;ValueControl',{getValue:()=>false});
 for(const key of ['pedNamePrefix','pedDisplayNamePrefix']){properties.push(add(key,{Controller:{FLastViewMode:0,FLastValue:'Union',FInitializing:false}}));add(key+';ValueControl',{getValue:()=>'Union'});}
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>all.filter(e=>e.tid===JSON.parse(q.slice(10,-1)))}};
 return {records,stores,owner,properties,components,add,read:()=>vm.runInNewContext('('+readUnionBrowser.toString()+')("MF;TF")',context)};
}
test('union reads three full inputs, reciprocal mappings and unmatched columns with duplicate labels',()=>{const r=fixture().read();assert.equal(r.verified,true);assert.equal(r.input_fields.length,3);assert.deepEqual(JSON.parse(JSON.stringify(r.mappings)),[{port:1,pairs:[{main:'A',source:'X',main_index:0,source_index:1},{main:'B',source:'Y',main_index:1,source_index:0}],unmatched:[]},{port:2,pairs:[{main:'A',source:'Q',main_index:0,source_index:1},{main:'B',source:'P',main_index:1,source_index:0}],unmatched:['Extra']}]);assert.equal(r.settings_applied,false);});
test('union does not invoke any engine or record proxy',()=>{const f=fixture();for(const key of ['FEngine','FLinks'])Object.defineProperty(f.owner,key,{get(){throw Error('RPC');}});for(const rows of f.records)for(const r of rows)Object.defineProperty(r.data,'$self',{get(){throw Error('RPC');}});assert.equal(f.read().verified,true);});
test('union rejects one-sided, duplicate, missing and incompatible mappings',()=>{for(const edit of [f=>f.records[1][0].data.Link=-1,f=>f.records[0][0].data.col1=0,f=>f.records[0][0].data.col1=9,f=>f.records[1][1].data.DataType=4,f=>f.records[2][2].data.Link=0,f=>f.records[0][0].data.chk1=false]){const f=fixture();edit(f);assert.equal(f.read().verified,false);}});
test('union rejects truncated stores, wrong owners, pending settings and variables',()=>{for(const edit of [f=>f.stores[0].getTotalCount=()=>3,f=>f.stores[1].isLoading=()=>true,f=>f.stores[1].getData=()=>({items:f.records[1],getSource:()=>({items:[]})}),f=>f.owner.FColumnsPrepared=false,f=>f.owner.FWizardForm={},f=>f.owner.FLinkValueProps[0]='foreign',f=>f.properties[0].Controller.FLastViewMode=1,f=>f.records[2][2].data.Name='p']){const f=fixture();edit(f);assert.equal(f.read().verified,false);}});
test('union supports a complete empty main schema with separate columns',()=>{const f=fixture();f.records[0].splice(0);f.records.slice(1).flat().forEach(r=>r.data.Link=-1);const r=f.read();assert.equal(r.verified,true);assert.equal(r.mappings[0].unmatched.length,2);});
test('union read is rejected if node ownership changes or a port wizard is open',async()=>{let i=0;assert.equal((await readUnionContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++i}))).verified,false);assert.equal((await readUnionContext({}, {},async()=>({verified:true,surface:'wizard',input_port:{}}))).reason,'union_node_surface');});
test('union uses the full local joined inventory while a dropdown filters visible choices',()=>{const f=fixture(),items=f.records[1];f.stores[1].getData=()=>({items:[items[0]],getSource:()=>({items})});f.stores[1].getCount=()=>1;assert.equal(f.read().verified,true);f.stores[1].getTotalCount=()=>1;assert.equal(f.read().verified,false);});
test('union rejects absent local store arrays without throwing',()=>{const f=fixture();f.stores[0].getData=()=>({});assert.equal(f.read().verified,false);});

test('union rejects a variable or uncommitted native prefix flag',()=>{
 for(const edit of [p=>p.FLastViewMode=1,p=>p.FLastValue=true,p=>p.FInitializing=true]){
  const f=fixture(),p=Object.values(f.components).find(c=>typeof c.Controller?.FLastValue==='boolean').Controller;edit(p);assert.equal(f.read().verified,false);
 }
});

test('Union binds a lazily numbered editor to the actual input, row and source store',()=>{
 const setup=()=>{const f=fixture(),grid=Object.values(f.components).find(c=>c.el.dom.tid.endsWith(';grdUnionData;grd-1'));
 const root=f.add('grdUnionData;grd-1;tbl;celleditor-5',{}),field=f.add('grdUnionData;grd-1;tbl;celleditor-5;cbx',{getStore:()=>f.stores[2]}),picker=f.add('grdUnionData;grd-1;tbl;celleditor-5;cbx;boundlist',{isVisible:()=>true});
 field.picker=picker;grid.editingPlugin={editing:true,context:{field:'col2',column:{dataIndex:'col2'},record:f.records[0][0]},activeEditor:{el:root.el,field,isVisible:()=>true}};return {f,plugin:grid.editingPlugin};};
 const {f}=setup(),r=f.read();assert.equal(r.verified,true);assert.equal(r.editor.port,2);assert.equal(r.editor.main,'A');assert.ok(r.editor.choices_tid.endsWith('celleditor-5;cbx;boundlist'));
 for(const change of [p=>p.context.record={},p=>p.context.column.dataIndex='col1',p=>p.activeEditor.field.getStore=()=>({}),p=>p.activeEditor.isVisible=()=>false,p=>p.activeEditor.field.picker.el.dom.tid='foreign']){const {f,plugin}=setup();change(plugin);assert.equal(f.read().verified,false);}
});
