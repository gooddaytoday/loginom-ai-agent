import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readCoarseClassesBrowser,readCoarseClassesContext} from '../lib/coarse-classes-context.mjs';
function fixture(){
 const prefix='MF;TF-1',base=prefix+';WizrdMCF;CoarseClassesWizard-1',elements=[],components={};
 const el=(tid,parent)=>{const e={id:'e'+elements.length,tid,parent,checkVisibility:()=>true,contains:x=>x===e||x?.parent===e,querySelectorAll:()=>elements.filter(x=>x.parent===e)};elements.push(e);return e;};
 const root=el(base),wizard=el(prefix+';WizrdMCF'),w={el:{dom:wizard},[Symbol('LockQueue')]:{IsEmpty:true}};
 const records=['X','Target'].map((name,index)=>({isModel:true,internalId:'row'+index,data:{Index:index,Name:name,DisplayName:name,DataType:5,DataKind:2,ColumnPurpose:0}}));
 for(const r of records)Object.defineProperty(r.data,'Column',{get(){throw Error('Column RPC must never be read');}});
 const store={$className:'Ext.data.Store',getData:()=>({items:records}),getCount:()=>records.length,isLoading:()=>false};
 const gridEl=el(base+';grdColumns',root),viewEl=el(base+';grdColumns;tbl',root);
 const g={el:{dom:gridEl},getStore:()=>store,getSelectionModel:()=>({getSelection:()=>[]})};
 // Native Ext.grid.Panel and Ext.view.Table share this exact store and both
 // expose getSelectionModel. A descendant search counts the inventory twice.
 class CoarseClassesWizard{}
 const controller=Object.assign(new CoarseClassesWizard(),{FColumnsStore:store,FWizardForm:{FView:w}});
 Object.assign(components,{[root.id]:{el:{dom:root},'@@TestCmpController':controller},[wizard.id]:w,[gridEl.id]:g,[viewEl.id]:{...g,el:{dom:viewEl}}});
 const context={Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>elements.filter(e=>e.tid===JSON.parse(q.slice(10,-1)))}};
 return {controller,store,read:()=>JSON.parse(JSON.stringify(vm.runInNewContext('('+readCoarseClassesBrowser.toString()+')('+JSON.stringify(prefix)+')',context)))};
}
test('exact owned coarse grid admits one inventory despite its duplicate Ext table view',()=>{
 const f=fixture(),s=f.read();assert.equal(s.verified,true);assert.deepEqual(s.fields.map(f=>f.name),['X','Target']);
 f.controller.FColumnsStore={};assert.equal(f.read().verified,false);
});
test('coarse classes native read rejects a changed prepared owner',async()=>{
 let n=0;assert.equal((await readCoarseClassesContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF-1'}},async()=>({verified:true,surface:'wizard',node_id:String(++n)}))).reason,'coarse_classes_owner_changed');
});
