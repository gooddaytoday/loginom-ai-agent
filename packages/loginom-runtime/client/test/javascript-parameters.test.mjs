import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateJavascriptParameters} from '../lib/javascript-parameters.mjs';
import {javascriptParametersSchema} from '../lib/node-api.mjs';

const digest=text=>createHash('sha256').update(text).digest('hex');
const column={name:'Result',label:'Результат',type:'integer',data_kind:'Дискретный',usage:'Выходное'};
const request=kind=>({target:{kind,type:'programming.javascript'},inputs:kind==='new'?[{input:0}]:[],mappings:[],finish:'execute',read:{ports:[0]}});

test('new JavaScript admits exact bounded source in both schema modes',()=>{
  const newNode=request('new');
  validateJavascriptParameters({source_text:'import {InputTables} from "builtIn/Data";',schema_mode:'code'},'script',newNode);
  validateJavascriptParameters({source_text:'',schema_mode:'declared',columns:[column]},'script',newNode);
  validateJavascriptParameters({source_text:'// 😀\n',schema_mode:'code'},'script',newNode);
});

test('existing JavaScript preserves omitted source and distinguishes explicit empty replacement',()=>{
  const existing=request('existing');
  validateJavascriptParameters({},'script',existing);
  validateJavascriptParameters({source_text:'',expected_source_sha256:digest('old')},'script',existing);
  for(const parameters of [{source_text:''},{expected_source_sha256:digest('old')},
    {source_text:'',expected_source_sha256:'A'.repeat(64)}])
    assert.throws(()=>validateJavascriptParameters(parameters,'script',existing));
});

test('JavaScript preflight refuses unsupported modules and source bounds before target mutation',()=>{
  const newNode=request('new');
  for(const source_text of ['import x from "fs";','import("builtIn/Data")','require("builtIn/Data")',
    'x'.repeat(32769),'\r','\0','\ud800'])
    assert.throws(()=>validateJavascriptParameters({source_text,schema_mode:'code'},'script',newNode));
});

test('JavaScript declared columns are complete, unique and bound to declared mode',()=>{
  assert.equal(javascriptParametersSchema.properties.columns.maxItems,64);
  const newNode=request('new');
  for(const parameters of [
    {source_text:'',schema_mode:'declared'},
    {source_text:'',schema_mode:'declared',columns:[]},
    {source_text:'',schema_mode:'code',columns:[column]},
    {source_text:'',schema_mode:'declared',columns:[column,{...column,name:'result'}]},
    {source_text:'',schema_mode:'declared',columns:[{...column,name:'Имя'}]},
    {source_text:'',schema_mode:'declared',columns:[{...column,type:'variant'}]},
    {source_text:'',schema_mode:'declared',columns:[{...column,label:'bad\nlabel'}]},
    {source_text:'',schema_mode:'declared',columns:[{...column,extra:true}]},
    {source_text:'',schema_mode:'declared',columns:Array.from({length:65},(_,i)=>({...column,name:'Field'+i}))},
  ])assert.throws(()=>validateJavascriptParameters(parameters,'script',newNode));
});

test('JavaScript limits ports and Close before graph work',()=>{
  const parameters={source_text:'',schema_mode:'code'};
  for(const mutate of [
    value=>value.inputs=[],value=>value.inputs=[{input:1}],value=>value.inputs=[{input:0},{input:0}],
    value=>value.mappings=[{direction:'output',port:1}],value=>value.read.ports=[1],
    value=>{value.finish='close';value.mappings=[{direction:'input',port:0}];},
  ]){const value=request('new');mutate(value);assert.throws(()=>validateJavascriptParameters(parameters,'script',value));}
});
