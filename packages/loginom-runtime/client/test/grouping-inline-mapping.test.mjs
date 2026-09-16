import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGroupingInlineSources,verifyGroupingStaleRemoval,verifyGroupingAutosyncRestore} from '../lib/grouping-inline-mapping.mjs';
import * as groupingInline from '../lib/grouping-inline-mapping.mjs';
import {verifyCalculatorInlineSync} from '../lib/calculator-inline-mapping.mjs';
const configuration={keys:[{name:'Group',label:'Группа',type:'string'}],measures:[{name:'Amount',label:'Сумма',type:'real',functions:4}]};
function fixture(){
 const sources=[{record_id:'s0',name:'Group',label:'Группа',type:'string'},{record_id:'s1',name:'Amount',label:'Сумма|Минимум',type:'real'}];
 const fields=[...sources.map((s,i)=>({record_id:'t'+i,field_id:String(i),name:'Custom'+i,label:'Same',type:s.type,source:s,inherited:false,excluded:false,required:false})),{record_id:'old',field_id:'9',name:'PreviousMax',label:'Same',type:'real',source:null,inherited:false,excluded:false,required:false}].map((f,i)=>({...f,index:i,group_index:i}));
 const before={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceMappingEngineOutputPortWizard',node_context:{node_id:'owned'},autosync:false,source_fields:sources,target_fields:fields};
 const after={...structuredClone(before),target_fields:structuredClone(fields.slice(0,2))};return {before,after,field:fields[2]};
}
test('replacement identifies only the obsolete unbound output',()=>{
 const {before,after,field}=fixture();assert.deepEqual(validateGroupingInlineSources(configuration,before),[field]);assert.equal(verifyGroupingStaleRemoval(before,after,field),true);
});
test('removal refuses foreign ownership, changed surviving fields, replaced sources and wrong row',()=>{
 for(const mutate of [f=>{f.after.node_context.node_id='foreign';},f=>{f.after.target_fields[0].name='Changed';},f=>f.after.source_fields.pop(),f=>f.after.target_fields.reverse(),f=>{f.field.source=f.before.source_fields[1];},f=>{f.field.required=true;}]){
  const f=fixture();mutate(f);assert.throws(()=>verifyGroupingStaleRemoval(f.before,f.after,f.field));
 }
});
test('conditional mapping cannot conceal incompatible source types or excluded fields',()=>{
 const f=fixture();f.before.source_fields[1].type='integer';assert.throws(()=>validateGroupingInlineSources(configuration,f.before));
 const g=fixture();g.before.target_fields[0].excluded=true;assert.throws(()=>validateGroupingInlineSources(configuration,g.before));
});


test('autosync restoration permits regenerated record IDs but preserves each field ID and link',()=>{
 const {after}=fixture();const restored=structuredClone(after);restored.autosync=true;
 restored.target_fields.forEach((f,i)=>{f.record_id='fresh'+i;});
 assert.equal(verifyGroupingAutosyncRestore(after,restored,true),true);
 restored.target_fields[0].field_id='foreign';assert.throws(()=>verifyGroupingAutosyncRestore(after,restored,true));
});

function singleAggregateSync(){
 const configuration={keys:[{name:'Group',label:'Group',type:'string'}],measures:[{name:'Other',label:'Other',type:'integer',functions:1}]};
 const key={record_id:'s0',field_id:'0',index:0,name:'Group',label:'Group',type:'string',required:false};
 const sum={record_id:'s1',field_id:'1',index:1,name:'Other_Sum',label:'Other|Сумма',type:'real',required:true};
 const target={record_id:'old',field_id:'0',index:0,group_index:0,name:'CustomGroup',label:'Custom',type:'string',source:key,excluded:false,inherited:false,required:false};
 const before={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceMappingEngineOutputPortWizard',node_context:{node_id:'owned'},autosync:false,source_fields:[key,sum],target_fields:[target]};
 const after={...structuredClone(before),target_fields:[{...structuredClone(target),record_id:'refreshed'},{record_id:'new',field_id:'1',index:1,group_index:1,name:'Other',label:sum.label,type:sum.type,source:structuredClone(sum),excluded:false,inherited:false,required:false}]};
 return {configuration,before,after,missing:[sum]};
}
test('grouping sync binds the native single-aggregate target name to its suffixed source',()=>{
 for(const name of ['Other','Other_Sum']){
  const f=singleAggregateSync();f.after.target_fields[1].name=name;
  const original=structuredClone(f);
  assert.equal(groupingInline.verifyGroupingInlineSync(f.configuration,f.before,f.after,f.missing),true);
  assert.deepEqual(f,original);
 }
 const f=singleAggregateSync();
 assert.throws(()=>verifyCalculatorInlineSync(f.before,f.after,f.missing));
});
test('grouping sync rejects invented names, links, source definitions and changed retained fields',()=>{
 for(const change of [
  f=>f.after.target_fields[1].name='Invented',
  f=>f.after.target_fields[1].label='Other|Среднее',
  f=>f.after.target_fields[1].type='integer',
  f=>f.after.target_fields[1].source=f.after.source_fields[0],
  f=>f.after.target_fields[1].source.field_id='foreign',
  f=>f.after.target_fields[1].excluded=true,
  f=>f.after.target_fields[0].name='Changed',
  f=>f.after.target_fields[0].field_id='foreign',
  f=>f.after.source_fields[1].name='Foreign_Sum',
  f=>f.after.target_fields.push(structuredClone(f.after.target_fields[1])),
  f=>f.after.autosync=true,
  f=>f.after.node_context.node_id='foreign',
  f=>f.configuration.measures[0].functions=17,
 ]){
  const f=singleAggregateSync();change(f);
  assert.throws(()=>groupingInline.verifyGroupingInlineSync(f.configuration,f.before,f.after,f.missing));
 }
});

test('multiple aggregates require their distinct generated names and exact source links',()=>{
 const f=singleAggregateSync();f.configuration.measures[0].functions=3;
 const count={...f.before.source_fields[1],record_id:'s2',field_id:'2',index:2,
  name:'Other_Count',label:'Other|Количество',type:'integer'};
 f.before.source_fields.push(count);f.after.source_fields.push(structuredClone(count));
 f.after.target_fields[1].name='Other_Sum';
 f.after.target_fields.push({...structuredClone(f.after.target_fields[1]),record_id:'count',field_id:'2',index:2,group_index:2,
  name:count.name,label:count.label,type:count.type,source:structuredClone(count)});
 f.missing.push(count);
 assert.equal(groupingInline.verifyGroupingInlineSync(f.configuration,f.before,f.after,f.missing),true);
 f.after.target_fields[1].name='Other';
 assert.throws(()=>groupingInline.verifyGroupingInlineSync(f.configuration,f.before,f.after,f.missing));
});
