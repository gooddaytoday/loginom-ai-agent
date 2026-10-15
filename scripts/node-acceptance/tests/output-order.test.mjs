import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExpectedOutputs,matchExpectedOutputs} from '../expected-outputs.mjs';

const report=(rows=[1,2],options={},column={})=>({output_node_type:'transforms.filter',
 columns:[{name:'Value',type:'real',...column}],rows:rows.map(Value=>({Value})),...options});
const parse=output=>parseExpectedOutputs({package_path:'/own/options.lgp',nodes:[],outputs:[output]}).outputs[0];
const actual=(rows=[1,2],port=0,id='filter')=>({node:{node_id:id},type:'transforms.filter',output_port:port,
 execution:{execution_id:id},data:{schema:[{name:'Value',label:'Value',type:'real'}],row_count:rows.length,
 sample_complete:true,precision:{numbers_verified:true},sample:rows.map(value=>[{type:'real',value,is_null:value===null}])}});

test('ordered rows compare positions; legacy and ordered false retain multiset semantics',()=>{
 const a=actual([2,1]);
 assert.throws(()=>matchExpectedOutputs([a],[parse(report([1,2],{ordered:true}))]));
 assert.equal(matchExpectedOutputs([actual()],[parse(report([1,2],{ordered:true}))]).length,1);
 for(const options of [{},{ordered:false}])assert.equal(matchExpectedOutputs([a],[parse(report([1,2],options))]).length,1);
 assert.throws(()=>matchExpectedOutputs([actual([1,2])],[parse(report([1,1]))]));
 const legacy={package_path:'/own/options.lgp',nodes:[],...report([1,2],{ordered:true})};
 assert.throws(()=>matchExpectedOutputs([a],parseExpectedOutputs(legacy).outputs));
});


