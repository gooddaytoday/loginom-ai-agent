import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readCoarseClassesBrowser,readCoarseClassesContext} from '../lib/coarse-classes-context.mjs';
function fixture({savedEvent=false,manualModel=false,offscreenModel=false,inputBounds}={}){
 const prefix='MF;TF-1',base=prefix+';WizrdMCF;CoarseClassesWizard-1',elements=[],components={};
 const el=(tid,parent)=>{const e={id:'e'+elements.length,tid,parent,getAttribute:()=>tid,getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:100,width:100,height:100}),checkVisibility:()=>true,contains:x=>x===e||x?.parent===e,querySelectorAll:()=>elements.filter(x=>x.parent===e)};elements.push(e);return e;};
 const root=el(base),wizard=el(prefix+';WizrdMCF'),w={el:{dom:wizard},[Symbol('LockQueue')]:{IsEmpty:true}};
 const records=['X','Target'].map((name,index)=>({isModel:true,internalId:'row'+index,data:{Index:index,Name:name,DisplayName:name,DataType:5,DataKind:2,ColumnPurpose:0}}));
 for(const r of records)Object.defineProperty(r.data,'Column',{get(){throw Error('Column RPC must never be read');}});
 const store={$className:'Ext.data.Store',getData:()=>({items:records}),getCount:()=>records.length,isLoading:()=>false};
 const gridEl=el(base+';grdColumns',root),viewEl=el(base+';grdColumns;tbl',root);
 const selection=savedEvent?[records[1]]:[];if(savedEvent)records[1].data.ColumnPurpose=4;
 const g={el:{dom:gridEl},getStore:()=>store,getSelectionModel:()=>({getSelection:()=>selection})};
 // Native Ext.grid.Panel and Ext.view.Table share this exact store and both
 // expose getSelectionModel. A descendant search counts the inventory twice.
 class CoarseClassesWizard{}
 const controller=Object.assign(new CoarseClassesWizard(),{FColumnsStore:store,FWizardForm:{FView:w}});
 Object.assign(components,{[root.id]:{el:{dom:root},'@@TestCmpController':controller},[wizard.id]:w,[gridEl.id]:g,[viewEl.id]:{...g,el:{dom:viewEl}}});
 const modelRows=[{data:{Index:0,LowBorder:-Infinity,HighBorder:7}},{data:{Index:1,LowBorder:7,HighBorder:Infinity}}];
 if(manualModel){
  root.checkVisibility=()=>offscreenModel;const editor=el(prefix+';WizrdMCF;CoarseClassesWizard-2;CoarseClassesEditor',wizard);
  if(offscreenModel)editor.getBoundingClientRect=()=>({left:-10000,top:-10000,right:-9900,bottom:-9900,width:100,height:100});
  for(const [name,items] of [['grdUsedColumns',[{data:{Name:'X',Count:2,IsLocked:true,IsEdited:true}}]],['grdBinning',modelRows]]){
   const element=el(editor.tid+';'+name,editor),store={$className:'Ext.data.Store',getCount:()=>items.length,getData:()=>({items}),isLoading:()=>false};
   components[element.id]={el:{dom:element},getStore:()=>store};
  }
 }
 if(savedEvent){
  const role=el(base+';CoarseClassesSettingsFrame;cbxColumnPurpose',root),event=el(base+';CoarseClassesSettingsFrame;cbxEventValue;ValueContainer;cbx',root);
  components[role.id]={el:{dom:role},getValue:()=>4};
  components[event.id]={el:{dom:event},getValue:()=>0,getRawValue:()=>'yes'};
 }
 if(typeof inputBounds==='boolean'){
  records[0].data.ColumnPurpose=3;selection.splice(0,selection.length,records[0]);
  for(const [path,value] of [['cbxColumnPurpose',3],['chkIncludeHighBounds;ValueControl',inputBounds]]){
   const e=el(base+';CoarseClassesSettingsFrame;'+path,root);
   components[e.id]={el:{dom:e},getValue:()=>value};
  }
 }
 const context={innerWidth:1280,innerHeight:800,Ext:{getCmp:id=>components[id]},document:{querySelectorAll:q=>elements.filter(e=>e.tid===JSON.parse(q.slice(10,-1)))}};
 return {controller,store,records,modelRows,read:()=>JSON.parse(JSON.stringify(vm.runInNewContext('('+readCoarseClassesBrowser.toString()+')('+JSON.stringify(prefix)+')',context)))};
}
test('input interval membership reads its selected native checkbox independently of port flags',()=>{
 for(const checked of [false,true]){
  const s=fixture({inputBounds:checked}).read();assert.equal(s.verified,true);
  assert.equal(s.selected.name,'X');assert.equal(s.settings.include_upper_input,checked);
 }
});
test('manual editor reads owned cached bounds and rejects untyped or reordered class rows',()=>{
 const f=fixture({manualModel:true});const s=f.read();assert.equal(s.verified,true);
 assert.deepEqual(s.model,{input_field:'X',locked:true,edited:true,classes:[{number:0,lower:null,upper:7},{number:1,lower:7,upper:null}]});
 f.modelRows[1].data.LowBorder='7';assert.equal(f.read().verified,false);
 f.modelRows[1].data.LowBorder=7;f.modelRows.reverse();assert.equal(f.read().verified,false);
});
test('a retained offscreen editor cannot replace the active roles page',()=>{
 const s=fixture({manualModel:true,offscreenModel:true}).read();assert.equal(s.verified,true);assert.equal(s.model,undefined);assert.equal(s.fields.length,2);
});
test('saved manual predictor role 3 is an input with a frozen partition',()=>{
 const f=fixture();Object.assign(f.records[0].data,{DataType:4,DataKind:1,ColumnPurpose:3});
 const s=f.read();assert.equal(s.verified,true);assert.equal(s.fields[0].role,'input');assert.equal(s.fields[0].frozen,true);
});
test('exact owned coarse grid admits one inventory despite its duplicate Ext table view',()=>{
 const f=fixture(),s=f.read();assert.equal(s.verified,true);assert.deepEqual(s.fields.map(f=>f.name),['X','Target']);
 f.controller.FColumnsStore={};assert.equal(f.read().verified,false);
});
test('coarse classes native read rejects a changed prepared owner',async()=>{
 let n=0;assert.equal((await readCoarseClassesContext({evaluate:async()=>({verified:true})},{workflow_ref:{prefix:'MF;TF-1'}},async()=>({verified:true,surface:'wizard',node_id:String(++n)}))).reason,'coarse_classes_owner_changed');
});

test('saved target event comes from the rendered ComboBox label after training',()=>{
 const s=fixture({savedEvent:true}).read();assert.equal(s.verified,true);assert.equal(s.settings.event_value,'yes');
 assert.equal(s.settings.event_control,'cbxEventValue;ValueContainer;cbx');
});
