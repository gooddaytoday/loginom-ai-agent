import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateVariablesCalculatorParameters,resolveVariablesCalculatorPatch} from '../lib/variables-calculator-parameters.mjs';
const fixture=JSON.parse(readFileSync(new URL('../../../../docs/node-development/nodes/variables-calculator/fixtures/expressions.json',import.meta.url)));
const parameters={expressions:fixture.expressions.map(e=>({target:{kind:'new'},...e}))};
const request={target:{kind:'new'},inputs:[],mappings:[],read:{ports:[]}};
const expression=(e,index)=>({...e,index,record_id:'r'+index,expression_id:String(index),description:'',intermediate:false,selected:index===0});
const observed=expressions=>({verified:true,inventory_complete:true,mode:'expression',expressions:expressions.map(expression)});
const blank=()=>observed([{name:'Expr1',label:'Выражение1',type:'real',formula:''}]);
test('stage-0 ordered fixture creates eight typed expressions without a table input',()=>{
 validateVariablesCalculatorParameters(parameters,'expression',request);
 const plan=resolveVariablesCalculatorPatch(parameters,blank(),{newNode:true});
 assert.deepEqual(plan.expressions.map(({name,label,type,formula})=>({name,label,type,formula})),fixture.expressions);
 assert.equal(plan.changes[0].before.record_id,'r0');
 assert.equal(plan.expressions[0].record_id,'r0');
 assert.equal(plan.expressions[6].formula,'""');assert.equal(plan.expressions[7].formula,'NULL');
});
test('one saved formula patch preserves identities, types, descriptions and ordered remainder',()=>{
 const before=observed(fixture.expressions);before.expressions[1].description='Keep me';
 const p={expressions:[{target:{kind:'existing',name:'limit'},formula:fixture.update.limit}]};
 validateVariablesCalculatorParameters(p,'expression',{...request,target:{kind:'existing'}});
 const plan=resolveVariablesCalculatorPatch(p,before);
 assert.equal(plan.expressions[0].formula,'120');assert.deepEqual(plan.expressions.slice(1),before.expressions.slice(1));
 assert.equal(before.expressions[0].formula,'100');
});
test('unsupported controls and malformed values refuse before mutation',()=>{
 const e=parameters.expressions[0];
 for(const p of [{expressions:[]},{...parameters,order:['limit']},{expressions:[{...e,type:'datetime'}]},
  {expressions:[{...e,intermediate:true}]},{expressions:[{...e,replace:false}]},{expressions:[{...e,cached:true}]},
  {expressions:[{...e,target:{kind:'new',name:'limit'}}]},{expressions:[{...e,formula:''}]},
  {expressions:[{...e,formula:'1\r2'}]},{expressions:[{...e,name:'имя'}]},
  {expressions:[{...e,description:'x'.repeat(513)}]},{expressions:[e,{...e,name:'LIMIT'}]}])
  assert.throws(()=>validateVariablesCalculatorParameters(p,'expression',request));
 assert.throws(()=>validateVariablesCalculatorParameters(parameters,'javascript',request));
 assert.throws(()=>validateVariablesCalculatorParameters(parameters,'expression',{...request,inputs:[{input:0}]}));
 assert.throws(()=>validateVariablesCalculatorParameters(parameters,'expression',{...request,mappings:[{port:0}]}));
 assert.throws(()=>validateVariablesCalculatorParameters(parameters,'expression',{...request,read:{ports:[0]}}));
});
test('resolve all targets and collision constraints before writing the first expression',()=>{
 const before=observed(fixture.expressions);
 for(const expressions of [
  [{target:{kind:'existing',name:'limit'},name:'skip'}],
  [{target:{kind:'existing',name:'LIMIT'},formula:'2'}],
  [{target:{kind:'existing',name:'limit'},formula:'120'},{target:{kind:'existing',name:'absent'},formula:'3'}],
  [{target:{kind:'new'},name:'skip',label:'new',type:'integer',formula:'2'}],
 ])assert.throws(()=>resolveVariablesCalculatorPatch({expressions},before));
 const changed=blank();changed.expressions[0].formula='100';
 assert.throws(()=>resolveVariablesCalculatorPatch(parameters,changed,{newNode:true}),/default/);
 assert.throws(()=>resolveVariablesCalculatorPatch(parameters,{...blank(),inventory_complete:false},{newNode:true}),/Complete/);
});

test('published parameter schema agrees on new expressions and saved patches',async()=>{
 const {variablesCalculatorParametersSchema}=await import('../lib/variables-calculator-schema.mjs');
 const {AjvJsonSchemaValidator}=await import('@modelcontextprotocol/sdk/validation/ajv');
 const check=new AjvJsonSchemaValidator().getValidator(variablesCalculatorParametersSchema);
 for(const p of [parameters,{expressions:[{target:{kind:'existing',name:'limit'},formula:'120'}]}])assert.equal(check(p).valid,true);
 const added=parameters.expressions[0],missing={...added};delete missing.formula;
 for(const p of [{expressions:[missing]},{expressions:[{...added,target:{kind:'new',name:'limit'}}]},
  {expressions:[{target:{kind:'existing'},formula:'120'}]},{expressions:[{...added,type:'datetime'}]},
  {expressions:[{...added,formula:'1\r2'}]},{expressions:[{...added,formula:' '}]},{expressions:[]}])assert.equal(check(p).valid,false);
});
