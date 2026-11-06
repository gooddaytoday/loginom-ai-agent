import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVariablesReplaceParameters,resolveVariablesReplaceParameters} from '../lib/variables-replace-parameters.mjs';
const rule=(type='integer',from=2,to=5)=>({variable:{kind:'input_variable',name:'Count'},type,pairs:[{from,to}],other:'keep',...(type==='string'?{case_sensitive:true}:['real','integer'].includes(type)?{precision:0}:{})});
const request={target:{kind:'new'},inputs:[],variable_inputs:[{kind:'variables',input:0}],mappings:[],read:{ports:[],variable_ports:[0]}};
test('scalar replacement accepts exact typed pairs and typed NULL without coercion',()=>{
 for(const r of [rule(),rule('real',1.25,2.5),rule('string','',null),rule('boolean',true,false),rule('integer',null,null)])
  assert.doesNotThrow(()=>validateVariablesReplaceParameters({rules:[r]},'exact',request));
});
test('replacement rejects duplicate keys, unsafe values, coercion, modes and unsupported controls before UI',()=>{
 for(const r of [rule('integer',true,1),rule('integer',2,2**53),rule('real',Infinity,1),rule('string','x','a\nb'),
  {...rule(),precision:1},{...rule('string','x','y'),case_sensitive:false},{...rule(),result_type:'real'},
  {...rule(),pairs:[{from:2,to:3},{from:2,to:4}]}]) assert.throws(()=>validateVariablesReplaceParameters({rules:[r]},'exact',request));
 assert.throws(()=>validateVariablesReplaceParameters({rules:[rule()]},'regex',request));
 assert.throws(()=>validateVariablesReplaceParameters({rules:[rule()]},'exact',{...request,variable_inputs:[]}));
 assert.throws(()=>validateVariablesReplaceParameters({rules:[rule()]},'exact',{...request,inputs:[{}]}));
 assert.throws(()=>validateVariablesReplaceParameters({rules:[rule(),rule()]},'exact',request));
});
test('resolve uses exact input names/types and patches only complete listed pair tables',()=>{
 const fields=[{name:'Count',label:'Количество',type:'integer'},{name:'Other',label:'Другой',type:'string'}];
 const saved=[rule(),{...rule('string','red','blue'),variable:{kind:'input_variable',name:'Other'}}];
 const changed=resolveVariablesReplaceParameters({rules:[rule('integer',2,8)]},fields,saved);
 assert.deepEqual(changed,[rule('integer',2,8),saved[1]]);assert.equal(saved[0].pairs[0].to,5);
 assert.throws(()=>resolveVariablesReplaceParameters({rules:[{...rule(),variable:{kind:'input_variable',name:'count'}}]},fields,saved));
 assert.throws(()=>resolveVariablesReplaceParameters({rules:[rule('real',2,8)]},fields,saved));
});
