import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDuplicatesParameters,resolveDuplicatesParameters} from '../lib/duplicates-parameters.mjs';
const schema=[{name:'Id',label:'Id',type:'integer'},{name:'Key',label:'Key',type:'string'},{name:'Value',label:'Value',type:'real'}];
test('duplicates replaces all roles and supports key-only analysis',()=>{
 assert.deepEqual(resolveDuplicatesParameters({input_fields:['Key'],output_fields:['Value']},schema).map(f=>f.usage_type),[0,3,4]);
 const previous=schema.map(f=>({...f,usage_type:4}));
 assert.deepEqual(resolveDuplicatesParameters({input_fields:['Key'],output_fields:[]},previous).map(f=>f.usage_type),[0,3,0]);
});
test('duplicates refuses empty, ambiguous and unknown field declarations',()=>{
 for(const p of [{input_fields:[],output_fields:[]},{input_fields:['Key','Key'],output_fields:[]},{input_fields:['Key'],output_fields:['key']},{input_fields:['Missing'],output_fields:[]},{input_fields:['Key']},{input_fields:['Key'],output_fields:[],extra:true}])assert.throws(()=>resolveDuplicatesParameters(p,schema));
});
test('duplicates refuses service collisions and unsupported types before edits',()=>{
 for(const field of [{name:'duplicate',label:'x',type:'integer'},{name:'x',label:'Группа дубликата',type:'integer'},{name:'x',label:'x',type:'variant'}])assert.throws(()=>resolveDuplicatesParameters({input_fields:['Key'],output_fields:[]},[...schema,field]));
});
test('duplicates refuses row-dropping mappings and wrong ports',()=>{
 const p={input_fields:['Key'],output_fields:[]},r={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0]}};
 validateDuplicatesParameters(p,'mark',r);
 assert.throws(()=>validateDuplicatesParameters(p,'mark',{...r,mappings:[{direction:'output',port:0,fields:[]}]}));
 assert.throws(()=>validateDuplicatesParameters(p,'mark',{...r,read:{ports:[1]}}));
 assert.throws(()=>validateDuplicatesParameters(p,'remove',r));
});
