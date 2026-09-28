import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectJavascriptModulePolicy,JAVASCRIPT_MODULE_POLICY} from '../lib/javascript-module-policy.mjs';

const allowed=[
 '', '/* import("secret-module"); require("hidden"); */', '// require("hidden")\nconst value="import(\\"hidden\\")";',
 'import "builtIn/Data";', 'import Data from "builtIn/Data";', 'import * as Data from "builtIn/Data";',
 'import {InputTable as Input} from "builtIn/Data";', String.raw`import "builtIn/\u0044ata";`,
 'export * from "builtIn/Data";', 'export * as Data from "builtIn/Data";', 'export {Data} from "builtIn/Data";',
 'const x=1; export {x};', 'export default function f(){}', 'const t=`import("hidden") require("hidden")`;',
 'const object={require(){}}; object.require("other");', 'const f=require; f("other");', '(0,require)("other");',
 'require.call(null,"other");', 'const object={require}; object?.require?.("other");', 'new require("other");',
 'const {require: alias}=object;', 'const pattern=/import\("other"\)/;', 'throw new Error("PRIVATE_SENTINEL");',
 'await Promise.resolve(1);', 'const o={x:1}; const a=o?.x ?? 2;', 'class C { #value=1; static { const x=1; } }',
 'const text=`hello ${1 + 2}`;', 'const bigint=10n;', 'const meta=import.meta;', '#! /usr/bin/env node\nconst x=1;',
 'import Data from "builtIn/Data" with {type:"json"};'
];
for(const [index,source] of allowed.entries())test('module policy admitted syntax '+index,()=>{
 const result=inspectJavascriptModulePolicy(source);assert.equal(result.status,'ADMITTED');assert.equal(result.source_sha256,createHash('sha256').update(source).digest('hex'));
 assert.equal(result.source_utf8_bytes,Buffer.byteLength(source));assert.equal(result.source_lf_lines,source.split('\n').length);assert.equal(result.policy,JAVASCRIPT_MODULE_POLICY);assert.deepEqual(result.parser,{name:'acorn',version:'8.15.0',ecma_version:2025,source_type:'module'});assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.parser));assert.ok(!('ast' in result));
});
const forbidden=[
 ['import "BuiltIn/Data"','module_specifier'],['import "builtIn/Data/"','module_specifier'],['import "./builtIn/Data"','module_specifier'],
 ['import "builtIn/Data\u0001"','module_specifier'],['export * from "other"','module_specifier'],['export {x} from "other"','module_specifier'],
 ['export * as x from "other"','module_specifier'],[String.raw`import "builtIn/\u0064ata"`,'module_specifier'],
 ['import("builtIn/Data")','dynamic_import'],['import(`builtIn/Data`)','dynamic_import'],['import(x,{with:{type:"json"}})','dynamic_import'],
 ['require("builtIn/Data")','direct_require'],['(require)("builtIn/Data")','direct_require'],['((require))?.("x")','direct_require'],
 [String.raw`requ\u0069re("x")`,'direct_require'],['function f(require){return require("x")}','direct_require'],
 ['const f=(require)=>require?.("x")','direct_require']
];
for(const [index,[source,reason]] of forbidden.entries())test('module policy forbidden AST '+index,()=>{const result=inspectJavascriptModulePolicy(source);assert.equal(result.status,'REFUSED');assert.equal(result.reason,reason);assert.ok(result.location);assert.ok(JSON.stringify(result).length<400);assert.ok(!('source' in result));});
for(const [form,expression] of [['template','`text ${EXPR}`'],['computed','({[EXPR]:1})'],['default','function f(x=EXPR){}'],['nested','function f(){return ()=>EXPR}'],['class','class C {x=EXPR;}'],['array','[1,EXPR]'],['optional','object?.[EXPR]'],['destructure','const {x=EXPR}={};']])for(const [code,reason] of [['import("private")','dynamic_import'],['require("private")','direct_require']])test('module policy visits '+form+' '+reason,()=>{assert.equal(inspectJavascriptModulePolicy(expression.replace('EXPR',code)).reason,reason);});
for(const source of ['return 1;','if(true){import "builtIn/Data";}','const x=;', 'export {missing};','const x="PRIVATE_SENTINEL', 'let private = 1;', 'with(x){}'])test('module policy syntax refusal without parser text '+source.slice(0,16),()=>{const result=inspectJavascriptModulePolicy(source);assert.equal(result.reason,'syntax');assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));assert.deepEqual(Object.keys(result),['status','policy','parser','reason','location']);});
for(const source of [null,{},'\0','\r','\ud800','x'.repeat(32769),'\n'.repeat(1024)])test('module policy source bounds '+String(source).slice(0,8),()=>assert.equal(inspectJavascriptModulePolicy(source).reason,'source_bounds'));
test('module policy exact maximum UTF8/LF source and deep parser refusal',()=>{
 const source='/*'+'😀'.repeat(8191)+'*/';assert.equal(Buffer.byteLength(source),32768);assert.equal(inspectJavascriptModulePolicy(source).status,'ADMITTED');
 assert.equal(inspectJavascriptModulePolicy('\n'.repeat(1023)).status,'ADMITTED');
 const many='0;'.repeat(16384);assert.equal(inspectJavascriptModulePolicy(many).status,'ADMITTED');
 const result=inspectJavascriptModulePolicy('('.repeat(8000)+'0'+')'.repeat(8000));assert.equal(result.status,'REFUSED');assert.equal(result.reason,'unclassifiable');assert.equal(result.location,null);
});
test('module policy reports bounded exact UTF16 location, not forbidden specifier',()=>{const source='//😀\nimport "PRIVATE_SENTINEL";';const result=inspectJavascriptModulePolicy(source);assert.deepEqual(result.location,{offset_utf16:12,line:2,column_utf16:7});assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));});
