import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readJoinBrowser,readJoinContext} from '../lib/join-context.mjs';
function fixture(){
 const all=[],components={},base='MF;TF;WizrdMCF;JoinDataWizard';
 const element=(tid,parent=null)=>{const e={id:'e'+all.length,tid,parent,checkVisibility:()=>true,contains(x){return x===this||!!x.parent&&this.contains(x.parent)}};all.push(e);return e;};
 const wizard=element('MF;TF;WizrdMCF'),root=element(base,wizard),form={};
 const add=(key,value)=>{const e=element(base+';'+key,root);components[e.id]={el:{dom:e},...value};return components[e.id];};
 const records=[['Key','Part','LeftValue'],['Id','Section','RightValue']].map((names,side)=>names.map((Name,i)=>({isModel:true,internalId:'r'+side+i,data:{ID:i,Name,DisplayName:Name,DataType:i===1?4:5,Broken:false,GroupField:'',ConnectedRecord:null}})));
 for(const i of [0,1]){records[0][i].data.ConnectedRecord=records[1][i];records[1][i].data.ConnectedRecord=records[0][i];}
 const stores=records.map(items=>({$className:'Ext.data.Store',getProxy:()=>({$className:'bg.ext.CollectionProxy'}),getData:()=>({items}),getCount:()=>items.length,getTotalCount:()=>items.length}));
 const grids=stores.map((s,i)=>add(i?'grdTargetColumns':'grdSourceColumns',{getStore:()=>s}));
 const owner={constructor:{name:'JoinDataWizard'},FWizardForm:form,FSourceStore:stores[0],FTargetStore:stores[1],FMissingLinks:false,FRelationRefreshMode:false,FLinksUpdateMode:false};
 components[root.id]={el:{dom:root},'@@TestCmpController':owner};components[wizard.id]={el:{dom:wizard},Controller:form};
 add('LinkGrid',{LeftGrid:grids[0],RightGrid:grids[1]});const filters=[add('SourceFilter',{getValue:()=>''}),add('TargetFilter',{getValue:()=>''})];
 const properties=[];for(const [key,value] of [['pedJoinType',0],['chbCaseSensitive',true],['chbIncludeJoinedKeyFields',false]]){properties.push(add(key,{Controller:{FLastViewMode:0,FLastValue:value,FInitializing:false}}));add(key+';ValueControl',{getValue:()=>value});}
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>q.startsWith('[data-tid=')?all.filter(e=>e.tid===JSON.parse(q.slice(10,-1))):[]}};
 return {records,stores,owner,filters,properties,read:()=>vm.runInNewContext('('+readJoinBrowser.toString()+')("MF;TF")',context)};
}
test('join reads both complete schemas and reciprocal composite keys',()=>{const r=fixture().read();assert.equal(r.verified,true);assert.equal(r.mode,'inner');assert.deepEqual(JSON.parse(JSON.stringify(r.keys.map(k=>[k.left,k.right,k.type]))),[['Key','Id','string'],['Part','Section','integer']]);assert.equal(r.settings_applied,false);});
test('join never dereferences engine proxies',()=>{const f=fixture();for(const k of ['FLinks','FJoinedColumns','FJoinDataEngine'])Object.defineProperty(f.owner,k,{get(){throw Error('RPC access');}});assert.equal(f.read().verified,true);});
test('join rejects one-sided, foreign, duplicate and incompatible key links',()=>{for(const change of [f=>f.records[1][0].data.ConnectedRecord=null,f=>f.records[0][0].data.ConnectedRecord={data:{}},f=>f.records[0][2].data.ConnectedRecord=f.records[1][0],f=>f.records[1][0].data.DataType=4,f=>f.records[1][2].data.ConnectedRecord=f.records[0][2]]){const f=fixture();change(f);assert.equal(f.read().verified,false);}});
test('join rejects partial inventories, filters and pending/variable settings',()=>{for(const change of [f=>f.stores[0].getTotalCount=()=>4,f=>f.stores[1].isLoading=()=>true,f=>f.stores[0].getData=()=>({items:f.records[0],getSource:()=>({items:[]})}),f=>f.filters[0].getValue=()=>'Key',f=>f.owner.FMissingLinks=true,f=>f.owner.FLinksUpdateMode=true,f=>f.owner.FSourceStore={},f=>f.properties[0].Controller.FLastViewMode=1,f=>f.properties[1].Controller.FLastValue=false,f=>f.records[0][2].data.Name='KEY']){const f=fixture();change(f);assert.equal(f.read().verified,false);}});
test('join accepts empty schemas but never claims a join key exists',()=>{const f=fixture();f.records.forEach(rs=>rs.splice(0));const r=f.read();assert.equal(r.verified,true);assert.equal(r.keys.length,0);});
test('join rejects changing node ownership and separate port settings',async()=>{let i=0;assert.equal((await readJoinContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++i}))).verified,false);assert.equal((await readJoinContext({}, {},async()=>({verified:true,surface:'wizard',input_port:{}}))).reason,'join_node_surface');});
