import test from 'node:test';
import assert from 'node:assert/strict';
import {configureSortingInlineMapping,validateSortingInlineSources} from '../lib/sorting-inline-mapping.mjs';
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

// Saved q3 Sorting: the source was narrowed to OrderPosition + Debt while
// OrderPosition remained deliberately excluded from the retained output.
function retainedFixture(){
 const configuration={input_fields:[{name:'OrderPosition',label:'OrderPosition',type:'integer'},
  {name:'Debt',label:'Debt',type:'real'}]};
 const source_fields=configuration.input_fields.map((f,i)=>({...f,record_id:'s'+i,field_id:String(i),index:i,required:false}));
 const target_fields=['OrderID','Customer','OrderAmount','PaidAmount','Debt','OrderPosition'].map((name,index)=>({
  record_id:'t'+index,field_id:String(index),index,group_index:index===5?0:index,name,label:name,
  type:index===5?'integer':index<2?'string':'real',required:false,inherited:false,excluded:index===5,
  source:index===4?structuredClone(source_fields[1]):null,exclusion_source:index===5?structuredClone(source_fields[0]):null,
 }));
 const native={verified:true,inventory_complete:true,source_identity_verified:true,
  mapping_wizard:'DerivedDataSourceMappingEngineOutputPortWizard',node_context:{node_id:'sorting'},
  autosync:false,source_fields,target_fields};
 return {configuration,native};
}
test('retained excluded Sorting key is bound to its exact current source, never obsolete',()=>{
 const {configuration,native}=retainedFixture(),original=structuredClone(native);
 assert.deepEqual(validateSortingInlineSources(configuration,native),native.target_fields.slice(0,4));
 assert.deepEqual(native,original);
});
test('retained Sorting exclusions still refuse unproven links and unsupported fields',()=>{
 for(const mutate of [
  f=>f.exclusion_source=null,f=>f.exclusion_source.record_id='foreign',
  f=>f.exclusion_source.field_id='foreign',f=>f.exclusion_source.type='real',
  f=>f.exclusion_source.name='Foreign',f=>f.exclusion_source.index=9,
  f=>f.source={...f.exclusion_source},f=>f.required=true,f=>f.inherited=true,
 ]){
  const {configuration,native}=retainedFixture();mutate(native.target_fields[5]);
  assert.throws(()=>validateSortingInlineSources(configuration,native),/Unsupported retained sorting output/);
 }
});
function retainedChannel(native){
 let mapping=structuredClone(native),selected=null;const gestures=[];
 const state=()=>{
  const fields=mapping.target_fields.map(f=>({...f,status:'observed',name_ref:f.record_id,selected:f.record_id===selected}));
  return {node_mapping:structuredClone(mapping),wizard:{stage:'output_mapping',root_ref:'root',root_tid:'W',
   output_columns:{fields,page:{status:'complete_definition_page',schema_id:'schema-'+fields.length,
    offset:0,limit:8,total_columns:fields.length,returned:fields.length,next_offset:null}}},
   ui:{elements:[...fields.map(f=>({ref:f.name_ref,allowed_actions:['click']})),
    {ref:'next',tid:'W;btnNext',allowed_actions:['wizard_step']},
    {ref:'sync',tid:'W;DerivedDataSourceMappingEngineOutputPortWizard;btnSyncThroughColumns',allowed_actions:['click']}]}};
 };
 return {gestures,async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},
  async perform(o){const s=state();assert.ok(o.ready(s),o.condition);const g=o.resolve(s);gestures.push(g);
   if(g.verb==='click'){
    assert.ok(mapping.target_fields.some(f=>f.record_id===g.ref),'must not synchronize an already covered excluded key');selected=g.ref;
   }else if(g.verb==='press'){
    assert.equal(g.key,'Delete');assert.equal(g.ref,selected);
    const field=mapping.target_fields.find(f=>f.record_id===g.ref);assert.equal(field.excluded,false);assert.equal(field.source,null);
    const groups=new Map();mapping.target_fields=mapping.target_fields.filter(f=>f!==field).map((f,index)=>{
     const group_index=groups.get(f.excluded)??0;groups.set(f.excluded,group_index+1);return {...f,index,group_index};});
   }else assert.deepEqual(g,{verb:'wizard_step',ref:'next',expected_stage:'done'});
  }};
}
test('conditional Sorting removes only four obsolete fields and preserves the excluded key through Next',async()=>{
 const {configuration,native}=retainedFixture(),channel=retainedChannel(native);
 const result=await configureSortingInlineMapping(channel,configuration);
 assert.equal(result.verified,true);assert.deepEqual(result.removed.map(r=>r.field.name),['OrderID','Customer','OrderAmount','PaidAmount']);
 assert.deepEqual(result.added_sources,[]);assert.equal(result.after.autosync,false);
 assert.deepEqual(result.after.target_fields,[{...native.target_fields[4],index:0,group_index:0},
  {...native.target_fields[5],index:1,group_index:0}]);
 assert.deepEqual(channel.gestures.filter(g=>g.verb==='press').map(g=>g.ref),['t0','t1','t2','t3']);
 assert.equal(channel.gestures.length,9);
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
