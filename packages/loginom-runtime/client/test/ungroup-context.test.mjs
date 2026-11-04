import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readUngroupBrowser,readUngroupContext} from '../lib/ungroup-context.mjs';
function fixture(){
 const all=[],components={},base='MF;TF;WizrdMCF;UngroupDataWizard';
 const element=(tid,parent=null)=>{const e={id:'e'+all.length,tid,parent,checkVisibility:()=>true,contains(x){return x===this||!!x.parent&&this.contains(x.parent)}};all.push(e);return e;};
 const wizard=element('MF;TF;WizrdMCF'),root=element(base,wizard),form={};
 const add=(key,value)=>{const e=element(base+';'+key,root);components[e.id]={el:{dom:e},...value};return components[e.id];};
 const records=[['Group','Total'],['Group','Item','Share']].map((names,port)=>names.map((Name,i)=>({isModel:true,internalId:'r'+port+i,data:{Name,DisplayName:Name,DataType:['Total','Share'].includes(Name)?3:5,UsageType:port?[6,4,9][i]:[6,7][i],Index:i,LinkIndex:i===0?0:-1,LinkName:'',GroupField:''}})));
 const stores=records.map(items=>({$className:'Ext.data.Store',getProxy:()=>({$className:'bg.ext.CollectionProxy'}),getData:()=>({items}),getCount:()=>items.length,getTotalCount:()=>items.length}));
 for(const [i,k] of ['grdUngroupColumns','grdSupportColumns'].entries())add(k,{getStore:()=>stores[i],getSelectionModel:()=>({getSelection:()=>[]})});
 const owner={constructor:{name:'UngroupDataWizard'},FWizardForm:form,FColumnsStore:stores[0],FSupportColumnsStore:stores[1],FMissingLinks:false};
 components[root.id]={el:{dom:root},'@@TestCmpController':owner};components[wizard.id]={el:{dom:wizard},Controller:form};
 const filters=['txtUngroupFilterField','txtSupportFilterField'].map(k=>add(k,{getValue:()=>''}));
 const props=[];for(const k of ['pedUngroupMethod','pedRoundFormat','pedRoundParam','pedBalanceMethod']){props.push(add(k,{Controller:{FLastViewMode:0,FLastValue:0,FLastVariable:null,FInitializing:false}}));add(k+';ValueControl',{getValue:()=>0});}
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>all.filter(e=>e.tid===JSON.parse(q.slice(10,-1)))}};
 return {records,stores,owner,filters,props,read:()=>vm.runInNewContext('('+readUngroupBrowser.toString()+')("MF;TF")',context)};
}
test('ungroup reads two owned complete schemas, reciprocal links, roles and policies',()=>{
 const c=fixture().read();assert.equal(c.verified,true);assert.equal(c.method,'shares');
 assert.deepEqual(JSON.parse(JSON.stringify(c.ungroup)),{keys:[{total:'Group',support:'Group'}],value_fields:['Total'],item_fields:['Item'],share_fields:['Share'],rounding:{format:'none'},balance:'none'});
 assert.equal(c.settings_applied,false);
});
test('ungroup never dereferences engine or native link proxies',()=>{const f=fixture();for(const k of ['FEngine','FLinks','FTimeAxisLink'])Object.defineProperty(f.owner,k,{get(){throw Error('RPC getter forbidden');}});assert.equal(f.read().verified,true);});
test('ungroup refuses partial/foreign/filtered inventories and invalid reciprocal links',()=>{
 for(const mutate of [f=>f.owner.FColumnsStore={},f=>f.stores[0].getTotalCount=()=>3,f=>f.stores[1].isLoading=()=>true,f=>f.filters[0].getValue=()=>'G',f=>f.records[0][0].data.LinkIndex=9,f=>f.records[1][0].data.LinkIndex=-1,f=>f.records[1][0].data.DataType=4,f=>f.records[1][1].data.Name='GROUP',f=>f.records[1][0].data.UsageType=0,f=>f.records[1][2].data.GroupField='G']){
  const f=fixture();mutate(f);assert.equal(f.read().verified,false);
 }
});
test('ungroup refuses pending and variable-bound properties',()=>{for(const mutate of [f=>f.owner.FMissingLinks=true,f=>f.props[0].Controller.FLastViewMode=1,f=>f.props[2].Controller.FInitializing=true,f=>f.props[1].Controller.FLastValue=2,f=>f.props[3].Controller.FLastVariable='V']){const f=fixture();mutate(f);assert.equal(f.read().verified,false);}});
test('ungroup context refuses owner changes and separate port forms',async()=>{
 let i=0;assert.equal((await readUngroupContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++i}))).verified,false);
 assert.equal((await readUngroupContext({}, {},async()=>({verified:true,surface:'wizard',output_port:{}}))).reason,'ungroup_node_surface');
});
