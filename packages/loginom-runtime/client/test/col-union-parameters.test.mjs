import test from 'node:test';
import assert from 'node:assert/strict';
import {validateColUnionParameters,resolveColUnionParameters} from '../lib/col-union-parameters.mjs';

const request=()=>({target:{kind:'new'},inputs:[0,1].map(input=>({input})),mappings:[],finish:'execute',read:{ports:[0]}});
test('positional union accepts every row rule and padding, preserving exact logical ports',()=>{
 for(const row_count of ['minimum','maximum','input'])for(const padding of ['null','repeat','last']){
  const col_union={row_count,padding,...(row_count==='input'?{determining_input:'attached'}:{})};
  assert.doesNotThrow(()=>validateColUnionParameters({col_union},'positional',request()));
  assert.deepEqual(resolveColUnionParameters({col_union},null),col_union);
 }
});
test('existing positional union patches preserve saved settings and remove an unused selector',()=>{
 const saved={row_count:'input',padding:'repeat',determining_input:'attached'},r=request();r.target.kind='existing';r.inputs=[];
 assert.doesNotThrow(()=>validateColUnionParameters({},'positional',r));
 assert.deepEqual(resolveColUnionParameters({},saved),saved);
 assert.deepEqual(resolveColUnionParameters({col_union:{padding:'last'}},saved),{...saved,padding:'last'});
 assert.deepEqual(resolveColUnionParameters({col_union:{row_count:'minimum'}},saved),{row_count:'minimum',padding:'repeat'});
 assert.throws(()=>resolveColUnionParameters({col_union:{determining_input:'main'}},{row_count:'maximum',padding:'null'}));
});
test('positional union refuses incomplete new settings, extra tables, variables and unsupported mappings before UI',()=>{
 const valid={col_union:{row_count:'maximum',padding:'null'}};
 for(const p of [{},{col_union:{}},{col_union:{row_count:'input',padding:'last'}},{col_union:{row_count:'maximum',padding:'null',determining_input:'main'}},{col_union:{row_count:'maximum',padding:'zero'}},{col_union:{row_count:'maximum',padding:'null',variable:'x'}}])assert.throws(()=>validateColUnionParameters(p,'positional',request()));
 for(const mutate of [r=>r.inputs.pop(),r=>r.inputs.push({input:2}),r=>r.read.ports=[1],r=>r.mappings=[{direction:'input',port:2}],r=>r.mappings=[{direction:'output',port:0,fields:[{source:{kind:'configured_field',name:'Code'},excluded:true}]}]]){
  const r=request();mutate(r);assert.throws(()=>validateColUnionParameters(valid,'positional',r));
 }
});
