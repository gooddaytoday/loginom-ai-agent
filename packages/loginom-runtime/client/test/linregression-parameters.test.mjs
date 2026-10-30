import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateLinRegressionParameters,resolveLinRegressionRoles} from '../lib/linregression-parameters.mjs';

test('apply preserves an existing connected model and cannot create or reconnect one',()=>{
 const p={input_fields:['X'],target_field:'Y'},request={target:{kind:'existing'},inputs:[],mappings:[],read:{ports:[0,1]},finish:'execute'};
 assert.doesNotThrow(()=>validateLinRegressionParameters(p,'apply',request));
 for(const change of [{target:{kind:'new'}},{inputs:[{input:0}]},{finish:'done'}])
  assert.throws(()=>validateLinRegressionParameters(p,'apply',{...request,...change}),/apply/);
});
const fields=[{name:'RowID',type:'integer',data_kind:'Непрерывный',usage_type:3},{name:'X',type:'real',data_kind:'Непрерывный',usage_type:0},{name:'Y',type:'real',data_kind:'Непрерывный',usage_type:0},{name:'IsTest',type:'boolean',data_kind:'Дискретный',usage_type:4}];
const p={input_fields:['X'],target_field:'Y'};
test('the response has a separate role and unlisted columns are retained but ignored',()=>{
 const result=resolveLinRegressionRoles(p,fields);
 assert.deepEqual(result.map(f=>[f.name,f.usage_type]),[['RowID',0],['X',3],['Y',4],['IsTest',0]]);
 assert.equal(fields[0].usage_type,3);
 assert.deepEqual(result.map(({usage_type,...f})=>f),fields.map(({usage_type,...f})=>f));
});
test('a misspelled, discrete or nonnumeric response cannot become a training target',()=>{
 for(const target_field of ['Missing','IsTest'])assert.throws(()=>resolveLinRegressionRoles({...p,target_field},fields),/observed continuous numeric/);
 assert.throws(()=>resolveLinRegressionRoles(p,fields.map(f=>f.name==='Y'?{...f,data_kind:'Дискретный'}:f)),/observed continuous numeric/);
});
test('overlap, ambiguous names and later-stage model options refuse before browser work',()=>{
 assert.throws(()=>validateLinRegressionParameters({...p,target_field:'x'},'enter'),/distinct/);
 assert.throws(()=>resolveLinRegressionRoles(p,[...fields,{...fields[1],name:'x'}]),/unique/);
 assert.throws(()=>validateLinRegressionParameters({...p,holdout:'holdout.csv'},'enter'),/use input_fields/);
 assert.throws(()=>validateLinRegressionParameters(p,'ridge'),/only Enter/);
 const request={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0,1]}};
 validateLinRegressionParameters(p,'enter',request);
 assert.throws(()=>validateLinRegressionParameters(p,'enter',{...request,read:{ports:[2]}}),/output 1/);
});
