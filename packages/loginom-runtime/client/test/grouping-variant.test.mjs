import test from 'node:test';
import assert from 'node:assert/strict';
import {GROUPING_FUNCTIONS,resolveGroupingParameters,supportedGroupingMeasure} from '../lib/grouping-parameters.mjs';
import {groupingOutputDefinitions,resolveGroupingOutput} from '../lib/grouping-output.mjs';

// LAB-1581 Q1/Q6: native Variant mask; counts are integer, other measures Variant.
const field=name=>({kind:'input_field',name});
const keys=[{name:'RowID',label:'RowID',type:'integer'}];
const value={name:'Values',label:'Values',type:'variant'};
const functions=['count','min','max','mode','unique_count','null_count','first','last','only'];
const parameters=fns=>({group_by:[field('RowID')],measures:fns.map(fn=>({field:field('Values'),function:fn,name:'Values'+GROUPING_FUNCTIONS[fn].suffix,label:fn}))});

test('Variant aggregates resolve the observed mask and retain Variant/count source types',()=>{
 const p=parameters(functions);
 assert.deepEqual(resolveGroupingParameters(p,[...keys,value]).functions,[{name:'Values',mask:8014}]);
 const configuration={keys,measures:[{...value,functions:8014}]};
 assert.equal(supportedGroupingMeasure(configuration.measures[0]),true);
 const sources=[['RowID','RowID','integer'],...functions.map(fn=>['Values_'+GROUPING_FUNCTIONS[fn].suffix,'Values|'+GROUPING_FUNCTIONS[fn].label,
  ['count','unique_count','null_count'].includes(fn)?'integer':'variant'])]
  .map(([name,label,type],i)=>({record_id:'s'+i,name,label,type}));
 const native={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',
  source_fields:sources,target_fields:sources.map((s,i)=>({...s,record_id:'t'+i,source:{...s},inherited:false,excluded:false}))};
 assert.deepEqual(groupingOutputDefinitions(configuration).map(f=>[f.name,f.type]),sources.map(f=>[f.name,f.type]));
 assert.deepEqual(resolveGroupingOutput(configuration,p,native).fields.map(f=>[f.name,f.current.type]),
  [['RowID','integer'],...p.measures.map((m,i)=>[m.name,sources[i+1].type])]);
 const changed=structuredClone(native);changed.source_fields[2].type='string';
 assert.throws(()=>resolveGroupingOutput(configuration,p,changed),/source differs/);
});

test('Variant refuses disabled functions in requests and saved native masks',()=>{
 for(const fn of ['sum','avg','median','stddev','concat']){
  assert.throws(()=>resolveGroupingParameters(parameters([fn]),[...keys,value]),/incompatible/);
  const measure={...value,functions:GROUPING_FUNCTIONS[fn].bit|GROUPING_FUNCTIONS.count.bit};
  assert.equal(supportedGroupingMeasure(measure),false);
  assert.throws(()=>groupingOutputDefinitions({keys,measures:[measure]}),/Unsupported grouping functions/);
 }
});
