import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readDataToVarBrowser,readDataToVarContext} from '../lib/variables-datatovar-context.mjs';

function fixture(){
 const all=[],components={},base='MF;TF;WizrdMCF;DataToVariablesWizard;';
 const element=(tid,parent=null)=>{const e={id:'e'+all.length,tid,parent,checkVisibility:()=>true,contains(x){return x===this||!!x.parent&&this.contains(x.parent);}};all.push(e);return e;};
 const root=element(base.slice(0,-1)),grids=['grdDataFields','grdUsedFields'].map(k=>element(base+k,root));
 const records=['RowID','X','Category'].map((Name,i)=>({isModel:true,internalId:'r'+i,data:{Name,DisplayName:Name,DataType:i===2?5:4,GroupFunctions:i===1?31:0,Order:0,Separator:',',Wrapper:'',UniqueOnly:false,Sort:false,SortDirection:0}}));
 const members=[ [records[0],records[2]], [records[1]] ],selection=[[],[records[1]]];
 const store={$className:'Ext.data.Store',getData:()=>({items:records}),getCount:()=>records.length,isLoading:()=>false};
 const chains=members.map(items=>({$className:'Ext.data.ChainedStore',getSource:()=>store,getData:()=>({items}),isLoading:()=>false}));
 grids.forEach((e,i)=>components[e.id]={el:{dom:e},getStore:()=>chains[i],getSelectionModel:()=>({getSelection:()=>selection[i]})});
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>all.filter(e=>e.tid===JSON.parse(q.slice(10,-1)))}};
 return {root,records,members,selection,store,chains,read:()=>vm.runInNewContext('('+readDataToVarBrowser.toString()+')("MF;TF")',context)};
}

test('DataToVar native reader proves the complete partition and ordered field identities',()=>{
 const r=fixture().read();assert.equal(r.verified,true);assert.equal(r.inventory_complete,true);
 assert.equal(r.fields[0].name,'X');assert.equal(r.fields[0].functions,31);assert.equal(r.fields[0].type,'integer');
 assert.equal(r.input_fields.length,3);assert.equal(r.settings_applied,false);
});

test('DataToVar native reader refuses partial stores, duplicate identities and invalid selections',()=>{
 for(const mutate of [f=>f.root.checkVisibility=()=>false,f=>f.store.getCount=()=>10,f=>f.store.isLoading=()=>true,
  f=>f.chains[1].getSource=()=>({...f.store}),f=>f.records[1].data.Name='rowid',f=>f.records[1].internalId='r0',
  f=>f.records[1].data.GroupFunctions=16384,f=>f.records[1].data.DataType=0,
  f=>f.members[1].push(f.records[0]),f=>f.members[0].splice(0,1),f=>f.selection[1].push({}),
  f=>f.store.getData=()=>({items:f.records,getSource:()=>({items:[f.records[0]]})}),
 ]){const f=fixture();mutate(f);assert.equal(f.read().verified,false);}
});

test('DataToVar native reader refuses changed or port wizard owners',async()=>{
 let n=0;const page={evaluate:async()=>({verified:true})},binding={workflow_ref:{prefix:'MF;TF'}};
 assert.equal((await readDataToVarContext(page,binding,async()=>({verified:true,surface:'wizard',node_id:++n}))).verified,false);
 assert.equal((await readDataToVarContext(page,binding,async()=>({verified:true,surface:'wizard',input_port:{port:0}}))).verified,false);
});
