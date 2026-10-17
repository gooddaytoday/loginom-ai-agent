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

test('two ports on the same node match independently, including identical values',()=>{
 const wants=[parse(report([1,2],{output_port:0})),parse(report([1,2],{output_port:1}))];
 const matches=matchExpectedOutputs([actual([1,2],1),actual()],wants);
 assert.deepEqual(matches.map(m=>m.output_port),[0,1]);
 assert.throws(()=>matchExpectedOutputs([actual()],[wants[1]]));
 assert.throws(()=>matchExpectedOutputs([actual([1,2],1)],[parse(report())]));
 assert.throws(()=>matchExpectedOutputs([actual(),actual()],[wants[0],wants[0]]));
 const old=actual();delete old.output_port;
 assert.equal(matchExpectedOutputs([old],[parse(report())]).length,1);
 const legacy=parseExpectedOutputs({package_path:'/own/options.lgp',nodes:[],...report([1,2],{output_port:1})});
 assert.equal(matchExpectedOutputs([actual([1,2],1)],legacy.outputs).length,1);
});

test('absolute, relative and combined tolerances apply only when declared',()=>{
 for(const [tolerance,want,good,bad] of [[{abs:0.125},2,2.125,2.25],
  [{rel:0.125},8,9,10],[{abs:0.25,rel:0.125},2,2.25,2.5]]){
  const output=parse(report([want],{}, {tolerance}));
  assert.equal(matchExpectedOutputs([actual([good])],[output]).length,1);
  assert.throws(()=>matchExpectedOutputs([actual([bad])],[output]));
 }
 assert.throws(()=>matchExpectedOutputs([actual([2.0001])],[parse(report([2]))]));
 assert.throws(()=>matchExpectedOutputs([actual([0.001])],[parse(report([0],{}, {tolerance:{rel:0.1}}))]));
 assert.equal(matchExpectedOutputs([actual([null])],[parse(report([null],{}, {tolerance:{abs:1}}))]).length,1);
 assert.throws(()=>matchExpectedOutputs([actual([0])],[parse(report([null],{}, {tolerance:{abs:1}}))]));
 const native=actual(['2.125']);Object.assign(native.data.sample[0][0],{precision:'exact_native'});
 assert.equal(matchExpectedOutputs([native],[parse(report([2],{}, {tolerance:{abs:0.125}}))]).length,1);
 for(const value of [NaN,Infinity,-Infinity,'2.1'])assert.throws(()=>matchExpectedOutputs([actual([value])],
  [parse(report([2],{}, {tolerance:{abs:1}}))]));
 assert.throws(()=>matchExpectedOutputs([actual([-1e308])],[parse(report([1e308],{}, {tolerance:{rel:1.8}}))]));
 assert.equal(matchExpectedOutputs([actual([-1e308])],[parse(report([1e308],{}, {tolerance:{rel:2}}))]).length,1);
});

test('cold candidate reads distinguish nodes by values and ports without accepting extra nodes',()=>{
 const wants=[parse(report([1],{output_port:0})),parse(report([2],{output_port:1}))];
 const readings=[actual([1],0,'a'),actual([3],1,'a'),actual([4],0,'b'),actual([2],1,'b')];
 const options={allowExtraPortReads:true};
 assert.deepEqual(matchExpectedOutputs(readings,wants,options).map(m=>[m.node.node_id,m.output_port]),[['a',0],['b',1]]);
 assert.throws(()=>matchExpectedOutputs([...readings,actual([5],0,'extra')],wants,options));
 assert.throws(()=>matchExpectedOutputs([actual([1],1,'a'),actual([2],0,'b')],wants,options));
 assert.throws(()=>matchExpectedOutputs(readings,wants));
});

test('unordered tolerance comparison finds a one-to-one match when ranges overlap',()=>{
 const want=parse(report([1,0],{}, {tolerance:{abs:1}}));
 assert.equal(matchExpectedOutputs([actual([0,2])],[want]).length,1);
 assert.throws(()=>matchExpectedOutputs([actual([2,2])],[want]));
});

test('invalid flags, port indexes and tolerances refuse before a run',()=>{
 for(const options of [{ordered:1},{ordered:null},{output_port:-1},{output_port:0.5},
  {output_port:'1'},{output_port:null},{output_port:Number.MAX_SAFE_INTEGER+1},{typo:true}])assert.throws(()=>parse(report([1],options)));
 for(const tolerance of [{},{abs:-1},{rel:-1},{abs:'0.1'},{abs:NaN},{abs:Infinity},null,[],{abs:1,extra:1}])
  assert.throws(()=>parse(report([1],{}, {tolerance})));
 for(const type of ['integer','string','variant','datetime','boolean'])
  assert.throws(()=>parse(report([1],{}, {type,tolerance:{abs:1}})));
 assert.equal(matchExpectedOutputs([actual([1])],[parse(report([1],{}, {tolerance:{abs:0,rel:0}}))]).length,1);
});
