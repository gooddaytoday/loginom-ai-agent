import test from 'node:test';
import assert from 'node:assert/strict';
import {validateActionParameters} from '../lib/action-catalog.mjs';
import {javascriptParametersSchema} from '../lib/node-api.mjs';
import {validateJavascriptParameters} from '../lib/javascript-parameters.mjs';
import {validateJavascriptDeclaredPrimitiveColumns} from '../lib/javascript-managed-declared.mjs';
import {compactNodeRequestFailure} from '../lib/user-results.mjs';

const source='import {InputTable, OutputTable} from "builtIn/Data";\nOutputTable.AssignColumns([]);';
const column={name:'ObservedID',label:'Идентификатор',type:'integer',data_kind:'Непрерывный',usage:'Выходное'};
const request=(kind='new')=>({target:{kind},inputs:kind==='new'?[{input:0}]:[],mappings:[],
  finish:'execute',read:{ports:[0]}});
const checked=(parameters,kind='new')=>{
  validateActionParameters(javascriptParametersSchema,parameters);
  return validateJavascriptParameters(parameters,'script',request(kind));
};

test('new code and declared requests pass the same published and local parameter boundaries',()=>{
  for(const parameters of [{source_text:source,schema_mode:'code'},
    {source_text:source,schema_mode:'declared',columns:[column]}])
    assert.equal(checked(parameters),parameters);
  assert.equal(checked({source_text:'',schema_mode:'code'}).source_text,'');
});

test('published schema, local preflight and actual writer agree on every scalar kind and 64-column bound',()=>{
  for(const [type,kind] of [['integer','Непрерывный'],['real','Непрерывный'],['datetime','Непрерывный'],
    ['string','Дискретный'],['boolean','Дискретный']]){
    const columns=[{...column,type,data_kind:kind}];
    assert.doesNotThrow(()=>checked({source_text:source,schema_mode:'declared',columns}));
    assert.doesNotThrow(()=>validateJavascriptDeclaredPrimitiveColumns(columns));
    for(const data_kind of ['Неопределенное','Непрерывный','Дискретный'].filter(value=>value!==kind)){
      const parameters={source_text:source,schema_mode:'declared',columns:[{...column,type,data_kind}]};
      for(const validate of [()=>validateActionParameters(javascriptParametersSchema,parameters),
        ()=>validateJavascriptParameters(parameters,'script',request())]){
        assert.throws(validate,error=>{
          assert.match(error.message,/Invalid parameters.columns\[0\].data_kind:/);
          assert.ok(error.message.includes(kind));
          const reply=compactNodeRequestFailure({status:'NOT_APPLIED',effect_possible:false,error:{message:error.message}},
            {operation_id:'rejected'});
          assert.equal(reply.error.parameter_path,'columns[0].data_kind');
          assert.equal(reply.effect_possible,false);
          return true;
        });
      }
      assert.throws(()=>validateJavascriptDeclaredPrimitiveColumns(parameters.columns));
    }
  }
  for(const count of [64,65]){
    const columns=Array.from({length:count},(_,index)=>({...column,name:'F'+index}));
    for(const validate of [()=>validateActionParameters(javascriptParametersSchema,{columns}),
      ()=>validateJavascriptParameters({source_text:source,schema_mode:'declared',columns},'script',request()),
      ()=>validateJavascriptDeclaredPrimitiveColumns(columns)]){
      if(count===64)assert.doesNotThrow(validate);
      if(count===65)assert.throws(validate);
    }
  }
});

test('existing empty patch preserves source and explicit replacement requires its full-read digest',()=>{
  assert.deepEqual(checked({},'existing'),{});
  assert.equal(checked({source_text:'',expected_source_sha256:'a'.repeat(64)},'existing').source_text,'');
  for(const parameters of [{source_text:source},{expected_source_sha256:'a'.repeat(64)},
    {source_text:source,expected_source_sha256:'A'.repeat(64)}])
    assert.throws(()=>validateJavascriptParameters(parameters,'script',request('existing')),/Invalid parameters.expected_source_sha256/);
});

test('source policy, UTF-8 bytes, LF count and CR are checked before a browser effect',()=>{
  for(const source_text of ['import "builtIn/FS";','require("builtIn/FS")','import("builtIn/Data")',
    '😀'.repeat(8193),'\n'.repeat(1024),'const x=1;\r\n'])
    assert.throws(()=>validateJavascriptParameters({source_text,schema_mode:'code'},'script',request()),/Invalid parameters.source_text/);
  assert.equal(checked({source_text:'\n'.repeat(1023),schema_mode:'code'}).source_text.length,1023);
});

test('declared columns require exact ordered scalar metadata and case-insensitive unique names',()=>{
  for(const columns of [[],[column,{...column,name:'observedid'}],[{...column,name:'Сумма'}],
    [{...column,type:'variant'}],[{...column,usage:'Неизвестно'}],[{...column,label:'bad\nlabel'}],
    [{...column,unknown:true}],[{name:'Value',label:'Value',type:'integer',data_kind:'Дискретный'}],
    Array.from({length:1001},(_,index)=>({...column,name:'F'+index}))])
    assert.throws(()=>validateJavascriptParameters({source_text:source,schema_mode:'declared',columns},'script',request()),/Invalid parameters.columns/);
  assert.equal(checked({source_text:source,schema_mode:'declared',columns:[column,{...column,name:'Value',label:'Value'}]}).columns.length,2);
});

test('mode, source and port invariants refuse unsupported request shapes',()=>{
  for(const parameters of [{source_text:source,schema_mode:'code',columns:[column]},
    {source_text:source,schema_mode:'declared'},{source_text:source},
    {source_text:source,schema_mode:'code',source:{artifact_id:'csv'}}])
    assert.throws(()=>validateJavascriptParameters(parameters,'script',request()),/Invalid parameters/);
  assert.throws(()=>validateJavascriptParameters({source_text:source,schema_mode:'code'},'expression',request()),/Invalid parameters.mode/);
  assert.throws(()=>validateJavascriptParameters({source_text:source,schema_mode:'code'},'script',
    {...request(),inputs:[]}),/Invalid parameters.inputs/);
  assert.throws(()=>validateJavascriptParameters({source_text:source,schema_mode:'code'},'script',
    {...request(),inputs:[{input:1}]}),/Invalid parameters.inputs/);
});

test('JavaScript core refuses foreign mapping/read ports and effectful Close before target mutation',()=>{
  const parameters={source_text:source,schema_mode:'code'};
  for(const mappings of [[{direction:'input',port:1}],[{direction:'output',port:1}],
    [{direction:'input',port:0},{direction:'input',port:0}]])
    assert.throws(()=>validateJavascriptParameters(parameters,'script',{...request(),mappings}),/Invalid parameters.mappings/);
  assert.throws(()=>validateJavascriptParameters(parameters,'script',
    {...request(),read:{ports:[1]}}),/Invalid parameters.read.ports/);
  assert.throws(()=>validateJavascriptParameters(parameters,'script',
    {...request(),finish:'close'}),/Invalid parameters.finish/);
  assert.throws(()=>validateJavascriptParameters({},'script',
    {...request('existing'),mappings:[{direction:'output',port:0}],finish:'close',read:{ports:[]}}),/Invalid parameters.finish/);
  assert.deepEqual(validateJavascriptParameters({},'script',
    {...request('existing'),finish:'close',read:{ports:[]}}),{});
  assert.equal(validateJavascriptParameters(parameters,'script',{...request(),mappings:[
    {direction:'input',port:0},{direction:'output',port:0}]}),parameters);
});
