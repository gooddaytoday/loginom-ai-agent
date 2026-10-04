import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readCrossTableBrowser,readCrossTableContext} from '../lib/crosstable-context.mjs';
import {crossTableRoleRemovalOrder} from '../lib/crosstable-procedure.mjs';
function fixture(){
 const base='MF;TF-1;WizrdMCF;CrossTabWizard;',elements=new Map(),components=new Map();
 const root={checkVisibility:()=>true,contains:()=>true};elements.set(base.slice(0,-1),[root]);
 const records=['Region','Category','Amount'].map((label,index)=>({isModel:true,internalId:'r'+index,data:{
  DataType:index===2?3:5,DataKind:index===2?1:2,Disposition:0,Order:0,Index:index,GroupFunctions:0,
  AvailableAggregationTypes:index===2?2047:1934,IsCountCase:false,DisplayName:label,NullGroup:false,OtherGroup:false,SlidingUniqueValuesMinCount:0}}));
 const store={$className:'Ext.data.Store',getData:()=>({items:records}),getCount:()=>records.length};
 const add=(tid,c)=>{const e={id:tid};elements.set(tid,[e]);components.set(e.id,{el:{dom:e},...c});return e;};
 for(const name of ['grdDataFields','grdUsedFields'])add(base+name,{getStore:()=>({$className:'Ext.data.ChainedStore',getSource:()=>store}),getSelectionModel:()=>({getSelection:()=>[]})});
 for(const [key,value] of [['pedDisplayNameSeparator','|'],['pedSlidingUniqueValues',false],['pedSlidingUniqueValuesLimit',0],['pedUniqueValueNames',false]]){
  add(base+key+';ValueControl',{getValue:()=>value,isVisible:()=>true,isDisabled:()=>false});
  add(base+key+';VariableControl',{getValue:()=>null});add(base+key+';SwitchButton',{pressed:false});
 }
 const document={querySelectorAll:selector=>elements.get(JSON.parse(selector.slice('[data-tid='.length,-1)))??[]};
 const evaluate=()=>runInNewContext('('+readCrossTableBrowser.toString()+')("MF;TF-1")',{document,Ext:{getCmp:id=>components.get(id)}});
 return {base,records,store,elements,components,evaluate};
}
test('cached CrossTable roles retain ordinals and never invent technical names',()=>{
 const f=fixture(),r=f.evaluate();assert.equal(r.verified,true);assert.equal(r.input_fields.length,3);
 assert.equal(r.input_fields[1].index,1);assert.equal(r.input_fields[1].name,undefined);
 assert.equal(r.input_fields[2].type,'real');assert.equal(r.options.pedSlidingUniqueValues.value,false);
});
test('native Variant fact retains undefined data kind without granting dimension semantics',()=>{
 const f=fixture();Object.assign(f.records[2].data,{DataType:6,DataKind:0,AvailableAggregationTypes:1934});
 const r=f.evaluate();assert.equal(r.verified,true);assert.equal(r.input_fields[2].type,'variant');assert.equal(r.input_fields[2].data_kind,'Неопределенное');
 f.records[2].data.DataKind=3;assert.equal(f.evaluate().verified,false);
});
test('foreign grid, filtered store, duplicate ordinal/label and variable state refuse',()=>{
 for(const mutate of [f=>f.components.get(f.base+'grdDataFields').el.dom={},f=>f.store.isBufferedStore=true,
  f=>f.store.getData=()=>({items:f.records,getSource:()=>({items:[]})}),f=>f.records[1].data.Index=0,
  f=>f.records[1].data.DisplayName='Region',f=>f.components.get(f.base+'pedSlidingUniqueValues;SwitchButton').pressed=true,
  f=>f.components.get(f.base+'pedSlidingUniqueValues;VariableControl').getValue=()=> 'Var',
  f=>f.records[2].data.GroupFunctions=99999]){
  const f=fixture();mutate(f);assert.equal(f.evaluate().verified,false);
 }
});
test('node context is checked on both sides of the native observation',async()=>{
 const binding={workflow_ref:{prefix:'MF;TF-1'}},node={verified:true,surface:'wizard',node_id:'own'};let n=0;
 const page={evaluate:async()=>({verified:true})};
 assert.equal((await readCrossTableContext(page,binding,async()=>node,()=>{})).verified,true);
 assert.equal((await readCrossTableContext(page,binding,async()=>++n===1?node:{...node,node_id:'other'},()=>{})).verified,false);
});
test('complete replacement keeps native role orders dense when deletion retains other ordinals',()=>{
 const f=fixture();
 const extra=structuredClone(f.records[2]);extra.internalId='r3';extra.data.Index=3;extra.data.DisplayName='Quantity';f.records.push(extra);
 f.records[0].data.Disposition=2;f.records[1].data.Disposition=1;
 f.records[2].data.Disposition=3;f.records[2].data.Order=0;
 f.records[3].data.Disposition=3;f.records[3].data.Order=1;
 const baseline=f.evaluate();assert.equal(baseline.verified,true);
 // Removing the first fact leaves the remaining fact at Order=1.
 f.records[2].data.Disposition=0;assert.equal(f.evaluate().reason,'crosstable_role_order');f.records[2].data.Disposition=3;
 for(const old of crossTableRoleRemovalOrder(baseline.input_fields)){
  f.records.find(r=>r.internalId===old.record_id).data.Disposition=0;
  assert.equal(f.evaluate().verified,true);
 }
 assert.ok(f.evaluate().input_fields.every(field=>field.disposition===0));
});
test('native removed role sentinel is accepted only for an unused record',()=>{
 const f=fixture();f.records[2].data.Order=-1;f.records[2].data.GroupFunctions=1;
 const removed=f.evaluate();assert.equal(removed.verified,true);
 assert.equal(removed.input_fields[2].disposition,0);assert.equal(removed.input_fields[2].order,-1);
 for(const role of [1,2,3]){f.records[2].data.Disposition=role;assert.equal(f.evaluate().verified,false);}
 f.records[2].data.Disposition=0;f.records[2].data.Order=-2;assert.equal(f.evaluate().verified,false);
});
