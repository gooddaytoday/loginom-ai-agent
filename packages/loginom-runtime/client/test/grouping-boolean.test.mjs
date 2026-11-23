import test from 'node:test';
import assert from 'node:assert/strict';
import {GROUPING_FUNCTIONS,resolveGroupingParameters,supportedGroupingMeasure} from '../lib/grouping-parameters.mjs';
import {groupingOutputDefinitions,resolveGroupingOutput} from '../lib/grouping-output.mjs';

// LAB-1581 Q1/Q5: native Boolean functions and type-preserving sources.
const field=name=>({kind:'input_field',name});
const keys=[{name:'Region',label:'Region',type:'string'}];
const flag={name:'Flag',label:'Flag',type:'boolean'};
const functions=['count','min','max','mode','unique_count','null_count','first','last','only'];
const parameters=fns=>({group_by:[field('Region')],measures:fns.map(fn=>({field:field('Flag'),function:fn,name:'Flag'+GROUPING_FUNCTIONS[fn].suffix,label:fn}))});

test('Boolean aggregates resolve the observed mask and retain exact output types and identities',()=>{
 const p=parameters(functions);
 assert.deepEqual(resolveGroupingParameters(p,[...keys,flag]).functions,[{name:'Flag',mask:8014}]);
 const configuration={keys,measures:[{...flag,functions:8014}]};
 assert.equal(supportedGroupingMeasure(configuration.measures[0]),true);
 const sources=[['Region','Region','string'],...functions.map(fn=>['Flag_'+GROUPING_FUNCTIONS[fn].suffix,'Flag|'+GROUPING_FUNCTIONS[fn].label,
  ['count','unique_count','null_count'].includes(fn)?'integer':'boolean'])]
  .map(([name,label,type],i)=>({record_id:'s'+i,name,label,type}));
 const native={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'DerivedDataSourceOutputSocketWizard',
  source_fields:sources,target_fields:sources.map((s,i)=>({...s,record_id:'t'+i,source:{...s},inherited:false,excluded:false}))};
 assert.deepEqual(groupingOutputDefinitions(configuration).map(f=>[f.name,f.type]),sources.map(f=>[f.name,f.type]));
 assert.deepEqual(resolveGroupingOutput(configuration,p,native).fields.map(f=>[f.name,f.current.type]),
  [['Region','string'],...p.measures.map((m,i)=>[m.name,sources[i+1].type])]);
 const changed=structuredClone(native);changed.source_fields[2].type='integer';
 assert.throws(()=>resolveGroupingOutput(configuration,p,changed),/source differs/);
});

for(const type of ['datetime','boolean','variant']){
 test(type+' rejects every native-disabled function in requested and preserved configurations',()=>{
  for(const fn of ['sum','avg','median','stddev','concat']){
   const input={...flag,type};
   assert.throws(()=>resolveGroupingParameters(parameters([fn]),[...keys,input]),/incompatible/);
   for(const mask of [GROUPING_FUNCTIONS[fn].bit,GROUPING_FUNCTIONS[fn].bit|GROUPING_FUNCTIONS.count.bit]){
    const measure={...input,functions:mask};
    assert.equal(supportedGroupingMeasure(measure),false,fn+'/'+mask);
    assert.throws(()=>groupingOutputDefinitions({keys,measures:[measure]}),/Unsupported grouping functions/);
   }
  }
 });
}
