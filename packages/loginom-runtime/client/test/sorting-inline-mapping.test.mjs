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
