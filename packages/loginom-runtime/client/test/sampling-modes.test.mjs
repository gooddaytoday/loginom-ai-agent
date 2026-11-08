import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSamplingParameters} from '../lib/sampling-parameters.mjs';
import {validateDataPartitionParameters} from '../lib/data-partition-parameters.mjs';
const request=(type,kind='new')=>({target:{type,kind},inputs:[{input:0}],mappings:[],read:{ports:type==='preprocessing.sampling'?[0]:[0,1,2]}});
test('uniform requires distinct group row sizes and validates priority before UI',()=>{
 const s=request('preprocessing.sampling'),p=request('preprocessing.data_partition');
 validateSamplingParameters({count:6,seed:42,group_size_rows:1},'uniform',s);
 validateDataPartitionParameters({train_count:6,test_count:4,seed:42,train_group_size_rows:1,test_group_size_rows:1,test_priority:true,test_priority_position:'beginning'},'uniform',p);
 validateDataPartitionParameters({train_count:6,test_count:4,seed:42,train_group_size_rows:1,test_group_size_rows:1},'uniform',p);
 validateSamplingParameters({},'uniform',request('preprocessing.sampling','existing'));
 for(const group_size_rows of [0,-1,1.5,NaN,2147483648])assert.throws(()=>validateSamplingParameters({count:6,seed:42,group_size_rows},'uniform',s));
 assert.throws(()=>validateSamplingParameters({count:6,seed:42},'uniform',s));
 for(const extra of [{test_priority:'yes'},{test_priority_position:'algorithm'},{group_size_rows:1}])assert.throws(()=>validateDataPartitionParameters({train_count:6,test_count:4,seed:42,train_group_size_rows:1,test_group_size_rows:1,...extra},'uniform',p));
 assert.throws(()=>validateDataPartitionParameters({train_count:6,test_count:4,seed:42,train_group_size_rows:1,test_group_size_rows:1,test_priority:true},'uniform',p));
 const existing=request('preprocessing.data_partition','existing');
 validateDataPartitionParameters({test_priority:true,test_priority_position:'end'},'uniform',existing);
 for(const priority of [{},{test_priority:false}]){
  assert.throws(()=>validateDataPartitionParameters({...priority,test_priority_position:'end'},'uniform',existing),/test_priority_position requires test_priority:true/);
  assert.throws(()=>validateDataPartitionParameters({train_count:6,test_count:4,seed:42,train_group_size_rows:1,test_group_size_rows:1,...priority,test_priority_position:'beginning'},'uniform',p),/test_priority_position requires test_priority:true/);
 }
});
test('random modes validate explicit seed, strata and complete category factors before UI',()=>{
 for(const [type,validate,sizes] of [
  ['preprocessing.sampling',validateSamplingParameters,{count:8}],
  ['preprocessing.data_partition',validateDataPartitionParameters,{train_count:8,test_count:4}],
 ]){
  const r=request(type),field={kind:'input_field',name:'Class'};
  validate({...sizes,seed:42},'random',r);
  validate({...sizes,seed:42,strata_fields:[field]},'stratified',r);
  validate({...sizes,seed:42,bias_field:field,bias_factors:[{value:'A',factor:0.4},{value:'B',factor:1}]},'biased',r);
  validate({},'random',request(type,'existing'));
  for(const p of [{...sizes},{...sizes,seed:-1},{...sizes,seed:1.5},{...sizes,seed:42,position:'first'},{...sizes,seed:42,strata_fields:[field]}])assert.throws(()=>validate(p,'random',r));
  for(const fields of [[],[field,field],[{kind:'input_field',name:'Missing;Field'}]])assert.throws(()=>validate({...sizes,seed:42,strata_fields:fields},'stratified',r));
  for(const factors of [[],[{value:'A',factor:2}],[{value:'A',factor:0},{value:'A',factor:1}],[{value:null,factor:1}]])assert.throws(()=>validate({...sizes,seed:42,bias_field:field,bias_factors:factors},'biased',r));
  assert.throws(()=>validate({...sizes,seed:42},'random_uniform',r));
 }
});
