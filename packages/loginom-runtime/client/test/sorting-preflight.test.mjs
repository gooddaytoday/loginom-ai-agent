import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightSortingSource} from '../lib/sorting-preflight.mjs';

function fixture({kind='existing',parameters={keys:[{field:{kind:'input_field',name:'RevenueAlias'},direction:'DESC'}]},inputs=[]}={}){
 const calls=[];
 const unexpected=name=>()=>{calls.push(name);throw Error('Unexpected '+name);};
 const options={operation:{id:'sorting-preflight',parameters:{target:{kind},parameters,inputs,mappings:[]}},
  execute:unexpected('browser call'),onRecord:unexpected('journal write'),receiptOptions:unexpected('mutation receipt')};
 return {calls,run:()=>preflightSortingSource(options,{signal:new AbortController().signal},{})};
}

test('existing sorting defers upstream key validation to its input mapping without browser calls',async()=>{
 for(const inputs of [[],[{input:0,output:0,source:{name:'upstream'}}]]){
  const f=fixture({inputs});
  assert.deepEqual(await f.run(),{verified:true,not_applicable:true,validation_deferred:'input_mapping'});
  assert.deepEqual(f.calls,[]);
 }
});
test('sorting preflight preserves the no-op for existing empty parameters',async()=>{
 const f=fixture({parameters:{}});
 assert.deepEqual(await f.run(),{verified:true,not_applicable:true});assert.deepEqual(f.calls,[]);
});
test('new sorting still rejects missing explicit input before any browser call',async()=>{
 const f=fixture({kind:'new'});
 await assert.rejects(f.run(),/requires an explicit input/);assert.deepEqual(f.calls,[]);
});
