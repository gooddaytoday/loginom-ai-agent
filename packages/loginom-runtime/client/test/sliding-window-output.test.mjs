import test from 'node:test';
import assert from 'node:assert/strict';
import {slidingWindowOutputOrigins} from '../lib/sliding-window-output.mjs';
const fields=[{name:'Sales',type:'integer',history:2,horizon:1},{name:'Price',type:'real',history:0,horizon:0}];
const sources=['Sales_H_2','Sales_H_1','Sales','Sales_F_1','Price'].map((name,i)=>({name,record_id:String(i),type:name==='Price'?'real':'integer'}));
test('native sources bind exact field/type/offset without guessing output order',()=>{
 const result=slidingWindowOutputOrigins({fields},sources.toReversed());
 assert.deepEqual(result.map(f=>[f.name,f.source_field,f.offset]),[['Price','Price',0],['Sales_F_1','Sales',1],['Sales','Sales',0],['Sales_H_1','Sales',-1],['Sales_H_2','Sales',-2]]);
 for(const change of [s=>s.pop(),s=>s[0].name='Sales_H_3',s=>s[0].type='real',s=>s[0].name='Sales',s=>s[0].name='Sales_H_01']){
  const copy=structuredClone(sources);change(copy);assert.throws(()=>slidingWindowOutputOrigins({fields},copy));
 }
});
