import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReplacementParameters,validateReplacementValue,resolveReplacementParameters} from '../lib/replacement-parameters.mjs';
const value=(value,type='string')=>({type,value});
const params=()=>({output_mode:'add',rules:[{field:{kind:'input_field',name:'Category'},type:'string',case_sensitive:true,pairs:[{from:value(null),to:value('Missing')},{from:value(''),to:value('Empty')},{from:value('null'),to:value('Literal')}],other:{mode:'keep'}}]});
const request={target:{kind:'new'},inputs:[{input:0}],read:{ports:[0]},mappings:[],finish:'execute'};
test('exact replacement distinguishes the input key type from the result type',()=>{
 const p=params();p.rules[0].result_type='integer';p.rules[0].other={mode:'null'};
 p.rules[0].pairs=[{from:value('unknown'),to:value(0,'integer')},{from:value(null),to:value(null,'integer')}];
 assert.doesNotThrow(()=>validateReplacementParameters(p,'exact',request));
 p.rules[0].pairs[0].to=value('0');
 assert.throws(()=>validateReplacementParameters(p,'exact',request),/typed value/);
 p.rules[0].pairs[0].to=value(0,'integer');p.rules[0].pairs[0].from=value(1,'integer');
 assert.throws(()=>validateReplacementParameters(p,'exact',request),/typed value/);
});
test('conversion policies refuse Variant and validate real and datetime result literals',()=>{
 const p=params(),r=p.rules[0];r.result_type='real';r.pairs=[{from:value('1.25'),to:value(1.25,'real')}];
 assert.throws(()=>validateReplacementParameters(p,'exact',request),/produces Variant/);
 r.other={mode:'value',value:value(-5.25,'real')};assert.doesNotThrow(()=>validateReplacementParameters(p,'exact',request));
 r.other.value.value=-5.125;assert.throws(()=>validateReplacementParameters(p,'exact',request),/two decimal/);
 r.result_type='datetime';r.other={mode:'null'};r.pairs=[{from:value('2024-02-29'),to:value('2024-02-29T00:00:00','datetime')}];
 assert.doesNotThrow(()=>validateReplacementParameters(p,'exact',request));
 for(const date of ['2023-02-29T00:00:00','2024-02-29','2024-02-29T00:00:00Z','2024-02-29T00:00:00.123']){r.pairs[0].to.value=date;assert.throws(()=>validateReplacementParameters(p,'exact',request),/datetime|calendar/);}
});
test('Null, empty string and literal null remain three distinct keys',()=>assert.equal(validateReplacementParameters(params(),'exact',request).rules[0].pairs.length,3));
test('regex accepts ordered string constants and inline case flag, refusing unsupported semantics',()=>{
 const p={output_mode:'replace',rules:[{field:{kind:'input_field',name:'Code'},type:'string',pairs:[{from:value('(?i)AB-([0-9]{2})'),to:value('SKU-$1')},{from:value('^AB-00$'),to:value('ZERO')}],other:{mode:'null'}}]};
 assert.equal(validateReplacementParameters(p,'regex',request),p);
 for(const pattern of ['',null,'a*','(?=a)','(a)\\1','[','é','()','^$','(?i)a|b','a{0}']){const bad=structuredClone(p);bad.rules[0].pairs[0].from.value=pattern;assert.throws(()=>validateReplacementParameters(bad,'regex',request),/regex/i);}
 for(const change of [r=>r.case_sensitive=false,r=>r.precision=0,r=>r.type='integer',r=>r.other={mode:'value',value:value('x')},r=>r.pairs[0].to.value=null]){const bad=structuredClone(p);change(bad.rules[0]);assert.throws(()=>validateReplacementParameters(bad,'regex',request),/regex/i);}
});
test('incompatible comparison flags identify the rule and required correction',()=>{
 const p=params();p.rules[0].precision=0;
 assert.throws(()=>validateReplacementParameters(p,'exact',request),/parameters.rules.0: Category \(string\).*forbids precision/);
 p.rules[0]={field:{kind:'input_field',name:'Code'},type:'integer',precision:0,case_sensitive:true,pairs:[],other:{mode:'keep'}};
 assert.throws(()=>validateReplacementParameters(p,'exact',request),/parameters.rules.0: Code \(integer\).*precision=0.*forbids case_sensitive/);
 delete p.rules[0].case_sensitive;
 assert.doesNotThrow(()=>validateReplacementParameters(p,'exact',request));
 assert.throws(()=>validateReplacementValue(value(9223372036854775807,'integer'),'integer'),/use a decimal string/);
});
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
