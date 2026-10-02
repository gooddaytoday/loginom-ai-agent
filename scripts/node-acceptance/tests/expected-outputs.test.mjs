import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExpectedOutputs,matchExpectedOutputs} from '../expected-outputs.mjs';
const columns=[{name:'Region',label:'Region',type:'string'},{name:'Amount',label:'A|Amount|Сумма',type:'real'}];
const report=value=>({output_node_type:'transform.cross_table',columns,rows:[{Region:'North',Amount:value}]});
const actual=(id,value)=>({node:{node_id:id},type:'transform.cross_table',execution:{execution_id:id},data:{schema:columns,row_count:1,sample_complete:true,precision:{numbers_verified:true},sample:[[{type:'string',is_null:false,value:'North'},{type:'real',is_null:false,value}]]}});
test('legacy and outputs[] parse while mixed, empty and duplicate schemas refuse',()=>{
 const base={package_path:'/own/package.lgp',nodes:[]};
 assert.equal(parseExpectedOutputs({...base,...report(10)}).multiple,false);
 assert.equal(parseExpectedOutputs({...base,outputs:[report(10),report(20)]}).outputs.length,2);
 for(const patch of [{outputs:[]},{outputs:[report(10)],...report(10)},{outputs:[{...report(10),columns:[columns[0],columns[0]]}]},
  {outputs:[{...report(10),rows:[{Region:'North'}]}]}])assert.throws(()=>parseExpectedOutputs({...base,...patch}));
});
test('two outputs match by complete schema and values, regardless of labels or node order',()=>{
 const matches=matchExpectedOutputs([actual('dynamic',20),actual('fixed',10)],[report(10),report(20)]);
 assert.deepEqual(matches.map(m=>m.node.node_id),['fixed','dynamic']);
});
test('ambiguous, reused, extra and numerically substituted reports fail',()=>{
 for(const [actuals,wants] of [[[actual('a',10),actual('b',10)],[report(10),report(10)]],
  [[actual('a',10),actual('b',20),actual('extra',30)],[report(10),report(20)]],
  [[actual('a',10),actual('b',19)],[report(10),report(20)]]])assert.throws(()=>matchExpectedOutputs(actuals,wants));
 for(const mutate of [a=>a.data.schema=[columns[0],{...columns[1],label:'B|Amount|Сумма'}],
  a=>a.data.sample_complete=false,a=>a.data.precision.numbers_verified=false,a=>a.data.row_count=2]){
  const a=actual('a',10);mutate(a);assert.throws(()=>matchExpectedOutputs([a],[report(10)]));
 }
});
