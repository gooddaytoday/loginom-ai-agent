import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSortingInlineSources} from '../lib/sorting-inline-mapping.mjs';
import {verifyGroupingStaleRemoval,verifyGroupingAutosyncRestore} from '../lib/grouping-inline-mapping.mjs';

function fixture(){
 const configuration={input_fields:[{name:'product',label:'Товар',type:'string'},{name:'RevenueAlias',label:'Выручка alias',type:'real'}]};
 const source_fields=configuration.input_fields.map((f,i)=>({...f,record_id:'s'+i}));
 const target_fields=[{record_id:'t0',field_id:'0',name:'CustomProduct',label:'Товар',type:'string',source:source_fields[0]},
  {record_id:'t1',field_id:'1',name:'total_revenue',label:'Выручка',type:'real',source:null}]
  .map((f,i)=>({...f,index:i,group_index:i,excluded:false,inherited:false,required:false}));
 const native={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceMappingEngineOutputPortWizard',
  node_context:{node_id:'sorting'},autosync:false,source_fields,target_fields};
 return {configuration,native};
}
test('sorting conditional mapping removes only the stale output after an input rename',()=>{
 const {configuration,native}=fixture();
 assert.deepEqual(validateSortingInlineSources(configuration,native),[native.target_fields[1]]);
 const after={...structuredClone(native),target_fields:[structuredClone(native.target_fields[0])]};
 assert.equal(verifyGroupingStaleRemoval(native,after,native.target_fields[1]),true);
 assert.deepEqual(validateSortingInlineSources(configuration,after),[]);
 const restored={...structuredClone(after),autosync:true};
 assert.equal(verifyGroupingAutosyncRestore(after,restored,true),true);
});
test('sorting conditional mapping refuses foreign source schema and any unsupported deletion',()=>{
 for(const mutate of [
  n=>n.source_fields[1].type='integer',n=>n.source_fields[1].label='Other',n=>n.source_fields.pop(),
  n=>n.source_fields.push(n.source_fields[0]),n=>n.source_identity_verified=false,
  n=>n.mapping_wizard='ForeignWizard',n=>n.target_fields[1].required=true,
  n=>n.target_fields[1].excluded=true,n=>n.target_fields[1].inherited=true,
  n=>n.target_fields[1].name='RevenueAlias',
 ]){const {configuration,native}=fixture();mutate(native);assert.throws(()=>validateSortingInlineSources(configuration,native));}
});
test('sorting conditional mapping retains an excluded source-bound OrderSeq while pruning an obsolete field',()=>{
 const {configuration,native}=fixture();
 const source={name:'OrderSeq',label:'OrderSeq',type:'integer',record_id:'s2'};
 configuration.input_fields.push({name:source.name,label:source.label,type:source.type});
 native.source_fields.push(source);
 const excluded={record_id:'t2',field_id:'2',name:'OrderSeq',label:'OrderSeq',type:'integer',index:2,group_index:0,
  excluded:true,inherited:false,required:false,source:null,exclusion_source:source};
 native.target_fields.push(excluded);
 assert.deepEqual(validateSortingInlineSources(configuration,native),[native.target_fields[1]]);
 const after=structuredClone(native);after.target_fields.splice(1,1);after.target_fields[1].index=1;
 assert.equal(verifyGroupingStaleRemoval(native,after,native.target_fields[1]),true);
 assert.deepEqual(validateSortingInlineSources(configuration,after),[]);
 assert.deepEqual(after.target_fields[1],{...excluded,index:1});
 assert.equal(verifyGroupingAutosyncRestore(after,{...structuredClone(after),autosync:true},true),true);
 assert.throws(()=>verifyGroupingStaleRemoval(native,after,excluded));
 const changed=structuredClone(after);changed.target_fields[1].excluded=false;
 assert.throws(()=>verifyGroupingStaleRemoval(native,changed,native.target_fields[1]));
});
test('sorting conditional mapping refuses an excluded field without its exact current source',()=>{
 for(const mutate of [
  f=>f.exclusion_source=null,f=>f.exclusion_source.record_id='foreign',
  f=>f.exclusion_source.type='integer',f=>f.exclusion_source.label='Other',
  f=>f.source=f.exclusion_source,f=>f.inherited=true,f=>f.required=true,
 ]){
  const {configuration,native}=fixture();
  const field={...native.target_fields[0],excluded:true,source:null,exclusion_source:structuredClone(native.source_fields[0])};
  native.target_fields[0]=field;mutate(field);
  assert.throws(()=>validateSortingInlineSources(configuration,native));
 }
});
