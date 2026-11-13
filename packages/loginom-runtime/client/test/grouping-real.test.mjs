import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveGroupingParameters} from '../lib/grouping-parameters.mjs';
import {groupingOutputDefinitions,resolveGroupingOutput} from '../lib/grouping-output.mjs';

// LAB-1581: native FactorEditDialog mask 224 and output source inventory,
// observed on types.csv before extending the production input types.
test('Real median, mode and stddev bind the native sources without changing types',()=>{
 const field=name=>({kind:'input_field',name});
 const p={group_by:[field('Region')],measures:[['median','PriceMedian'],['mode','PriceMode'],['stddev','PriceStd']]
  .map(([fn,name])=>({field:field('Price'),function:fn,name,label:name}))};
 const fields=[{name:'Region',label:'Region',type:'string'},{name:'Price',label:'Price',type:'real'}];
 const plan=resolveGroupingParameters(p,fields);
 assert.deepEqual(plan.functions,[{name:'Price',mask:224}]);
 const configuration={keys:[fields[0]],measures:[{...fields[1],functions:224}]};
 const sources=[['Region','Region','string'],['Price_Median','Price|Медиана','real'],
  ['Price_Mode','Price|Мода','real'],['Price_Std','Price|Стандартное откл.','real']]
  .map(([name,label,type],i)=>({record_id:'s'+i,name,label,type}));
 const native={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',
  source_fields:sources,target_fields:sources.map((s,i)=>({...s,record_id:'t'+i,source:{...s},inherited:false,excluded:false}))};
 assert.deepEqual(groupingOutputDefinitions(configuration).map(f=>[f.name,f.type]),
  [['Region','string'],['Price_Median','real'],['Price_Mode','real'],['Price_Std','real']]);
 assert.deepEqual(resolveGroupingOutput(configuration,p,native).fields.map(f=>[f.source.name,f.name,f.current.type]),
  [['Region','Region','string'],['Price_Median','PriceMedian','real'],['Price_Mode','PriceMode','real'],['Price_Std','PriceStd','real']]);
 const changed=structuredClone(native);changed.source_fields[3].type='integer';
 assert.throws(()=>resolveGroupingOutput(configuration,p,changed),/source differs/);
});
