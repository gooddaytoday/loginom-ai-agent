import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readMissingValuesBrowser,readMissingValuesContext} from '../lib/missing-values-context.mjs';
function fixture(){
 const all=[],components={},base='MF;TF;WizrdMCF;DataRecoveryWizard;';
 const element=(tid,parent=null)=>{const e={id:'e'+all.length,tid,parent,checkVisibility:()=>true,contains(x){return x===this||!!x.parent&&this.contains(x.parent)}};all.push(e);return e;};
 const root=element(base.slice(0,-1)),gridEl=element(base+'grdColumnsSettings',root);
 const records=['Amount','Note','Untouched'].map((Name,i)=>({isModel:true,internalId:'r'+i,data:{Name,Index:i,DisplayName:'Same',DataType:i?5:3,DataKind:i?2:1,Usable:i<2,ActionNull:i?6:3,NullStrValue:'replacement'}}));
 for(const r of records)for(const key of ['$self','$inside'])Object.defineProperty(r.data,key,{get(){throw Error('Forbidden engine access')}});
 const store={$className:'Ext.data.Store',getProxy:()=>({$className:'bg.ext.CollectionProxy'}),getData:()=>({items:records}),getCount:()=>records.length,isLoading:()=>false};
 const grid={el:{dom:gridEl},getStore:()=>store,editingPlugin:{editing:false}};components[gridEl.id]=grid;
 const options={pedOrderedSample:false,pedMaxNullsPercent:41,pedUseQuality:false,'RandSeedEdit;edtRandSeed':'1234'};
 for(const key of Object.keys(options))for(const part of ['ValueControl','SwitchButton']){const e=element(base+key+';'+part,root);components[e.id]={el:{dom:e},getValue:()=>options[key],pressed:false};}
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>q.startsWith('[data-tid=')?all.filter(e=>e.tid===JSON.parse(q.slice(10,-1))):[]}};
 return {root,records,store,grid,options,components,read:()=>vm.runInNewContext('('+readMissingValuesBrowser.toString()+')("MF;TF")',context)};
}
test('missing values reads all fields including disabled and exact primitive method values without engine access',()=>{
 const f=fixture(),r=f.read();assert.equal(r.verified,true);assert.equal(r.fields.length,3);assert.equal(r.fields[2].used,false);assert.equal(r.fields[0].method,'mean');assert.equal(r.fields[1].value,'replacement');assert.equal(r.max_nulls_percent,41);assert.equal(r.settings_applied,false);
});
test('missing values rejects incomplete stores, duplicate identities, mismatched schemas and malformed options',()=>{
 for(const change of [f=>f.store.getCount=()=>99,f=>f.store.isLoading=()=>true,f=>f.store.isBufferedStore=true,f=>f.store.getData=()=>({items:f.records,getSource:()=>({items:[]})}),f=>f.records[1].internalId='r0',f=>f.records[1].data.Name='AMOUNT',f=>f.records[1].data.Index=99,f=>f.records[0].data.DataType=0,f=>f.records[0].data.DataKind=0,f=>f.records[0].data.Usable=1,f=>f.options.pedMaxNullsPercent=null,f=>f.options.pedMaxNullsPercent=101,f=>f.root.checkVisibility=()=>false]){
  const f=fixture();change(f);assert.equal(f.read().verified,false);
 }
});
test('missing values binds the editing field by cached record identity and rejects foreign editors',()=>{
 const f=fixture();f.grid.editingPlugin={editing:true,context:{grid:f.grid,record:f.records[1],field:'ActionNull'}};
 assert.equal(f.read().editor.field_name,'Note');f.grid.editingPlugin.context.record={...f.records[1]};assert.equal(f.read().verified,false);
});
test('missing values context refuses owner changes and separate mapping surfaces',async()=>{
 let i=0;assert.equal((await readMissingValuesContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF'}},async()=>({verified:true,surface:'wizard',node_id:++i}))).verified,false);
 assert.equal((await readMissingValuesContext({}, {},async()=>({verified:true,surface:'wizard',output_port:{}}))).reason,'missing_values_node_surface');
});
test('constant prompt retains method context without claiming an active cell editor',()=>{
 const f=fixture();f.grid.editingPlugin={editing:false,context:{grid:f.grid,record:f.records[1],field:'ActionNull'}};
 assert.equal(f.read().editor,null);assert.equal(f.read().method_context.field_name,'Note');
 f.grid.editingPlugin.context.grid={};assert.equal(f.read().verified,false);
});
