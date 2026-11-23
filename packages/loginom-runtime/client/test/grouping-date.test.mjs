import test from 'node:test';
import assert from 'node:assert/strict';
import {GROUPING_FUNCTIONS,resolveGroupingParameters,supportedGroupingMeasure} from '../lib/grouping-parameters.mjs';
import {groupingOutputDefinitions,resolveGroupingOutput} from '../lib/grouping-output.mjs';

// LAB-1581 Q1/Q8: observed DateTime mask; date measures retain their type.
const field=name=>({kind:'input_field',name});
const keys=[{name:'Region',label:'Region',type:'string'}];
const day={name:'Day',label:'Day',type:'datetime'};
const functions=['count','min','max','mode','unique_count','null_count','first','last','only'];

test('DateTime aggregates resolve the native mask and preserve date/count output types',()=>{
 const p={group_by:[field('Region')],measures:functions.map(fn=>({field:field('Day'),function:fn,name:'Day'+GROUPING_FUNCTIONS[fn].suffix,label:fn}))};
 assert.deepEqual(resolveGroupingParameters(p,[...keys,day]).functions,[{name:'Day',mask:8014}]);
 const configuration={keys,measures:[{...day,functions:8014}]};
 assert.equal(supportedGroupingMeasure(configuration.measures[0]),true);
 const sources=[['Region','Region','string'],...functions.map(fn=>['Day_'+GROUPING_FUNCTIONS[fn].suffix,'Day|'+GROUPING_FUNCTIONS[fn].label,
  ['count','unique_count','null_count'].includes(fn)?'integer':'datetime'])]
  .map(([name,label,type],i)=>({record_id:'s'+i,name,label,type}));
 const native={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',
  source_fields:sources,target_fields:sources.map((s,i)=>({...s,record_id:'t'+i,source:{...s},inherited:false,excluded:false}))};
 assert.deepEqual(groupingOutputDefinitions(configuration).map(f=>[f.name,f.type]),sources.map(f=>[f.name,f.type]));
 assert.deepEqual(resolveGroupingOutput(configuration,p,native).fields.map(f=>[f.name,f.current.type]),
  [['Region','string'],...p.measures.map((m,i)=>[m.name,sources[i+1].type])]);
 const changed=structuredClone(native);changed.source_fields[2].type='string';
 assert.throws(()=>resolveGroupingOutput(configuration,p,changed),/source differs/);
});
