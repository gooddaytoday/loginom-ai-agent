import test from 'node:test';
import assert from 'node:assert/strict';
import {predictNewCalculatorOutput,preflightCalculatorSource} from '../lib/calculator-preflight.mjs';
const input=[{name:'amount',label:'Amount',type:'real'},{name:'category',label:'Category',type:'string'}];
const parameters={expressions:[{target:{kind:'new'},name:'tax',label:'Tax',type:'real',formula:'amount*0.2',replace:false}]};
const layout=names=>[{direction:'output',port:0,fields:names.map(name=>({source:{kind:'configured_field',name}}))}];
test('new calculator predicts all inherited and calculated output fields',()=>{
 assert.deepEqual(predictNewCalculatorOutput(parameters,input).map(f=>f.name),['tax','amount','category']);
 assert.equal(predictNewCalculatorOutput(parameters,input,layout(['category','tax','amount'])).length,3);
});
test('incomplete, extra, repeated and conflicting output fields fail before target mutation',()=>{
 for(const names of [['tax'],['tax','amount','unknown'],['tax','tax','category'],['tax','amount','category','extra']])
  assert.throws(()=>predictNewCalculatorOutput(parameters,input,layout(names)),/Invalid mappings.fields/);
 const mapping=layout(['tax','amount','category']);mapping[0].fields[0].name='category';
 assert.throws(()=>predictNewCalculatorOutput(parameters,input,mapping),/conflicting output name/);
 mapping[0].fields[0].name='tax';mapping[0].fields[0].excluded=true;
 assert.throws(()=>predictNewCalculatorOutput(parameters,input,mapping),/calculated output/);
 mapping[0].fields[0].excluded=false;mapping[0].fields[1].excluded=true;
 assert.equal(predictNewCalculatorOutput(parameters,input,mapping).length,3);
});
test('replacement and expression ordering are checked against the live input schema',()=>{
 assert.throws(()=>predictNewCalculatorOutput({expressions:[{...parameters.expressions[0],name:'amount'}]},input),/collides/);
 assert.throws(()=>predictNewCalculatorOutput({expressions:[{...parameters.expressions[0],replace:true}]},input),/missing/);
 assert.throws(()=>predictNewCalculatorOutput({...parameters,order:['absent']},input),/every resulting expression/);
 assert.deepEqual(predictNewCalculatorOutput({expressions:[{...parameters.expressions[0],name:'amount',replace:true}]},input).map(f=>f.name),['amount','category']);
});
test('existing calculator retains its native schema path; new calculator requires explicit input',async()=>{
 const options={operation:{parameters:{target:{kind:'existing'},parameters,inputs:[],mappings:[]}},execute:()=>{throw Error('No browser call expected');}};
 assert.equal((await preflightCalculatorSource(options,{},{})).validation_deferred,'input_mapping');
 options.operation.parameters.target.kind='new';
 await assert.rejects(()=>preflightCalculatorSource(options,{},{}),error=>{
  assert.match(error.message,/requires an explicit input/);
  assert.deepEqual(error.nodePhaseRefusal,{phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true});return true;
 });
});
