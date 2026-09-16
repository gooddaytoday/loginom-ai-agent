import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFilterConditions,validateFilterConditions,validateFilterValue} from '../lib/filter-parameters.mjs';
const condition=(operator,type='integer',extra={value:2})=>({field:{kind:'input_field',name:'Id'},operator,type,...extra});
test('equivalent datetime precision has equal bounds and cannot duplicate a list value',()=>{
 const time='2024-01-01T00:00:01';
 validateFilterConditions({groups:[[condition('between','datetime',{lower:time+'.000',upper:time})]]});
 assert.throws(()=>validateFilterConditions({groups:[[condition('in','datetime',{values:[time,time+'.000']})]]}),/Duplicate/);
});
test('resolves distinct OR groups without flattening AND precedence or changing the request',()=>{
 const p={groups:[[condition('>', 'real',{value:1.2345}),condition('<','real',{value:3.4567})],[condition('is_null','real',{})]]};
 const before=structuredClone(p);assert.deepEqual(resolveFilterConditions(p,[{name:'Id',type:'real'}]),p.groups);assert.deepEqual(p,before);
});
test('empty filters and empty OR groups never become pass-through',()=>{
 for(const groups of [[],[[]],[[condition('=')],[]]])assert.throws(()=>validateFilterConditions({groups}),/Nonempty|at least one/);
});
test('rejects unknown fields and actual scalar type mismatches before configuration',()=>{
 assert.throws(()=>resolveFilterConditions({groups:[[condition('=')]]},[{name:'Other',type:'integer'}]),/Unknown/);
 assert.throws(()=>resolveFilterConditions({groups:[[condition('=')]]},[{name:'Id',type:'variant'}]),/type differs/);
});
test('null is a predicate; empty string remains a literal value',()=>{
 validateFilterConditions({groups:[[condition('=', 'string',{value:'',case_sensitive:true})],[condition('is_null','string',{})]]});
 assert.throws(()=>validateFilterConditions({groups:[[condition('=', 'string',{value:null,case_sensitive:true})]]}),/string/);
 assert.throws(()=>validateFilterConditions({groups:[[condition('is_null','integer',{value:0})]]}),/operands/);
});
test('rejects variables, arbitrary Boolean nesting and conflicting operands',()=>{
 for(const c of [{...condition('='),variable:'x'},{...condition('='),groups:[]},{...condition('='),lower:1},{...condition('='),field:{kind:'variable',name:'Id'}}])
  assert.throws(()=>validateFilterConditions({groups:[[c]]}));
});
test('integer precision and nonfinite values cannot be silently rounded',()=>{
 for(const v of [2.5,Number.MAX_SAFE_INTEGER+1,Infinity,NaN,'2'])assert.throws(()=>validateFilterValue(v,'integer'));
 for(const v of [Infinity,-Infinity,NaN,'1.2345'])assert.throws(()=>validateFilterValue(v,'real'));
 assert.equal(validateFilterValue(1.23456789,'real'),1.23456789);
});
test('dates retain seconds and milliseconds, rejecting impossible dates and timezones',()=>{
 for(const v of ['2024-02-29T12:34:56','2024-02-29T12:34:56.789'])assert.equal(validateFilterValue(v,'datetime'),v);
 for(const v of ['2023-02-29T12:34:56','2024-04-31T00:00:00','2024-01-01T24:00:00','2024-01-01T00:00:00Z','2024-01-01T00:00'])assert.throws(()=>validateFilterValue(v,'datetime'));
});
test('lists and intervals require exact complete operands',()=>{
 for(const extra of [{values:[]},{values:[1,1]},{values:[1,null]},{values:[1],value:2}])assert.throws(()=>validateFilterConditions({groups:[[condition('in','integer',extra)]]}));
 assert.throws(()=>validateFilterConditions({groups:[[condition('between','integer',{lower:3,upper:2})]]}),/lower/);
 validateFilterConditions({groups:[[condition('between','integer',{lower:2,upper:2})]]});
});
test('boolean fields use their native predicates, strings require explicit case policy',()=>{
 for(const operator of ['is_true','is_false','is_null','not_null'])validateFilterConditions({groups:[[condition(operator,'boolean',{})]]});
 assert.throws(()=>validateFilterConditions({groups:[[condition('=','boolean',{value:true})]]}),/Boolean comparison/);
 assert.throws(()=>validateFilterConditions({groups:[[condition('contains','integer')]]}),/String operator/);
 assert.throws(()=>validateFilterConditions({groups:[[condition('contains','string',{value:'Ab'})]]}),/case_sensitive/);
});
test('row number is independent of field names and requires an integer',()=>{
 const c={...condition('>'),field:{kind:'row_number'}};assert.deepEqual(resolveFilterConditions({groups:[[c]]},[]),[[c]]);
 assert.throws(()=>validateFilterConditions({groups:[[{...c,type:'real'}]]}),/Row number/);
});
test('bounds count OR separator rows as well as conditions',()=>{
 assert.throws(()=>validateFilterConditions({groups:Array.from({length:64},()=>[condition('='),condition('>')])}),/128/);
});

test('Null string predicates have no case policy editor',()=>{
 for(const operator of ['is_null','not_null']){
  validateFilterConditions({groups:[[condition(operator,'string',{})]]});
  for(const case_sensitive of [true,false])assert.throws(()=>validateFilterConditions({groups:[[condition(operator,'string',{case_sensitive})]]}),/case_sensitive/);
 }
});
