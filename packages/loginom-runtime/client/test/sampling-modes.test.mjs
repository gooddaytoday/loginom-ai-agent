import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSamplingParameters} from '../lib/sampling-parameters.mjs';
import {validateDataPartitionParameters} from '../lib/data-partition-parameters.mjs';
const request=(type,kind='new')=>({target:{type,kind},inputs:[{input:0}],mappings:[],read:{ports:type==='preprocessing.sampling'?[0]:[0,1,2]}});
test('v0.3.9 admits random only; stratified and biased fail before UI',()=>{
 for(const [type,validate,sizes] of [
  ['preprocessing.sampling',validateSamplingParameters,{count:8}],
  ['preprocessing.data_partition',validateDataPartitionParameters,{train_count:8,test_count:4}],
 ]){
  const r=request(type),field={kind:'input_field',name:'Class'};
  validate({...sizes,seed:42},'random',r);
  assert.throws(()=>validate({...sizes,seed:42,strata_fields:[field]},'stratified',r),/unsupported sampling mode/);
  assert.throws(()=>validate({...sizes,seed:42,bias_field:field,bias_factors:[{value:'A',factor:0.4},{value:'B',factor:1}]},'biased',r),/unsupported sampling mode/);
  validate({},'random',request(type,'existing'));
  for(const p of [{...sizes},{...sizes,seed:-1},{...sizes,seed:1.5},{...sizes,seed:42,position:'first'},{...sizes,seed:42,strata_fields:[field]}])assert.throws(()=>validate(p,'random',r));
  for(const fields of [[],[field,field],[{kind:'input_field',name:'Missing;Field'}]])assert.throws(()=>validate({...sizes,seed:42,strata_fields:fields},'stratified',r));
  for(const factors of [[],[{value:'A',factor:2}],[{value:'A',factor:0},{value:'A',factor:1}],[{value:null,factor:1}]])assert.throws(()=>validate({...sizes,seed:42,bias_field:field,bias_factors:factors},'biased',r));
  assert.throws(()=>validate({...sizes,seed:42},'random_uniform',r));
 }
});
