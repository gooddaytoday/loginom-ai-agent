import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReplacementParameters,validateReplacementValue,resolveReplacementParameters} from '../lib/replacement-parameters.mjs';
const value=(value,type='string')=>({type,value});
const params=()=>({output_mode:'add',rules:[{field:{kind:'input_field',name:'Category'},type:'string',case_sensitive:true,pairs:[{from:value(null),to:value('Missing')},{from:value(''),to:value('Empty')},{from:value('null'),to:value('Literal')}],other:{mode:'keep'}}]});
const request={target:{kind:'new'},inputs:[{input:0}],read:{ports:[0]},mappings:[],finish:'execute'};
test('Null, empty string and literal null remain three distinct keys',()=>assert.equal(validateReplacementParameters(params(),'exact',request).rules[0].pairs.length,3));
test('case folding rejects conflicting keys before mutation',()=>{const p=params();p.rules[0].case_sensitive=false;p.rules[0].pairs=[{from:value('North'),to:value('A')},{from:value('north'),to:value('B')}];assert.throws(()=>validateReplacementParameters(p,'exact',request),/Duplicate replacement key/);p.rules[0].case_sensitive=true;assert.doesNotThrow(()=>validateReplacementParameters(p,'exact',request));});
test('integers retain Int64 boundaries and reject rounded JS numbers',()=>{for(const n of ['9223372036854775807','-9223372036854775808'])assert.doesNotThrow(()=>validateReplacementValue(value(n,'integer'),'integer'));for(const n of [9223372036854775807,'9223372036854775808','-9223372036854775809'])assert.throws(()=>validateReplacementValue(value(n,'integer'),'integer'));});
test('generated names cannot collide with retained source fields',()=>{const p=params(),f=[{name:'Category',type:'string'},{name:'Category_Replace',type:'string'}];assert.throws(()=>resolveReplacementParameters(p,f),/collision/);p.output_mode='replace';assert.doesNotThrow(()=>resolveReplacementParameters(p,f));});
test('unknown fields and incompatible types fail source preflight',()=>{assert.throws(()=>resolveReplacementParameters(params(),[{name:'Other',type:'string'}]),/missing/);assert.throws(()=>resolveReplacementParameters(params(),[{name:'Category',type:'integer'}]),/type mismatch/);});
test('unsupported modes and nonzero precision are refused',()=>{assert.throws(()=>validateReplacementParameters(params(),'regex',request));const p=params();p.rules[0]={field:{kind:'input_field',name:'Amount'},type:'real',precision:0.001,pairs:[],other:{mode:'keep'}};assert.throws(()=>validateReplacementParameters(p,'exact',request),/precision zero/);});

test('remaining real values that Loginom would round are rejected before mutation',()=>{const p=params();p.rules=[{field:{kind:'input_field',name:'Amount'},type:'real',precision:0,pairs:[],other:{mode:'value',value:value(-5.125,'real')}}];assert.throws(()=>validateReplacementParameters(p,'exact',request),/two decimal/);p.rules[0].other.value.value=-5.25;assert.doesNotThrow(()=>validateReplacementParameters(p,'exact',request));});

test('partial replacement validates saved rules with the effective output mode',async()=>{
 const {resolveEffectiveReplacementParameters:resolve}=await import('../lib/replacement-parameters.mjs');
 const rule=name=>({...params().rules[0],field:{kind:'input_field',name}});
 const fields=['A','A_Replace','B','C'].map(name=>({name,type:'string'}));
 assert.throws(()=>resolve({output_mode:'add'},fields,[rule('A')],'replace'),/collision: A_Replace/);
 assert.throws(()=>resolve({rules:[rule('A')]},fields,[rule('B')],'add'),/collision: A_Replace/);
 assert.throws(()=>resolve({rules:[rule('A')]},fields,[rule('B')],undefined),/Observed replacement output mode/);
 assert.deepEqual(resolve({rules:[rule('C')]},fields,[rule('B')],'add').rules.map(r=>r.field.name),['B','C']);
 for(const mode of ['replace','add'])assert.deepEqual(resolve({output_mode:mode},fields,[rule('B'),rule('C')],'replace').rules.map(r=>r.field.name),['B','C']);
 assert.doesNotThrow(()=>resolve({rules:[rule('A')]},fields,[rule('B')],'replace'));
});
