import test from 'node:test';
import assert from 'node:assert/strict';
import {parseExpectedOutputs,matchExpectedOutputs} from '../expected-outputs.mjs';
const columns=[{name:'Region',label:'Region',type:'string'},{name:'Amount',label:'A|Amount|Сумма',type:'real'}];
const report=value=>({output_node_type:'transform.cross_table',columns,rows:[{Region:'North',Amount:value}]});
const actual=(id,value)=>({node:{node_id:id},type:'transform.cross_table',execution:{execution_id:id},data:{schema:columns,row_count:1,sample_complete:true,precision:{numbers_verified:true},sample:[[{type:'string',is_null:false,value:'North'},{type:'real',is_null:false,value}]]}});
test('label_any skips only the opted-in column label with either column order policy',()=>{
 for(const column_order of ['any','exact']){
  const want=structuredClone({...report(10),column_order});want.columns[1].label_any=true;
  for(const label of ['Amount','Произвольная метка','']){
   const a=structuredClone(actual('a',10));a.data.schema[1].label=label;
   assert.equal(matchExpectedOutputs([a],[want]).length,1);
   for(const change of [b=>b.data.schema[1].name='Other',b=>b.data.schema[1].type='integer',
    b=>b.data.schema[0].label='Other',b=>b.data.sample[0][1].value=11]){
    const bad=structuredClone(a);change(bad);assert.throws(()=>matchExpectedOutputs([bad],[want]));
   }
   for(const label_any of [undefined,false]){
    const strict=structuredClone(want);delete strict.columns[1].label_any;
    if(label_any!==undefined)strict.columns[1].label_any=label_any;
    assert.throws(()=>matchExpectedOutputs([a],[strict]));
   }
  }
  const fallback=structuredClone(want);delete fallback.columns[0].label;
  assert.equal(matchExpectedOutputs([actual('a',10)],[fallback]).length,1);
 }
});
test('label_any validates boolean values in legacy and outputs forms',()=>{
 for(const multiple of [false,true])for(const label_any of [true,false,'true',null,1,[],{}]){
  const output=structuredClone(report(10));output.columns[1].label_any=label_any;
  const expected={package_path:'/own/labels.lgp',nodes:[],...(multiple?{outputs:[output]}:output)};
  if(typeof label_any==='boolean')assert.equal(parseExpectedOutputs(expected).outputs[0].columns[1].label_any,label_any);
  else assert.throws(()=>parseExpectedOutputs(expected),/EXPECTED_COLUMNS_INVALID/);
 }
});
test('StdDev and other scalar values require exact independently derived binary64 values',()=>{
 const c=[{name:'Units_StdDev',label:'Units|Стандартное откл.',type:'real'}];
 const expected={output_node_type:'transform.cross_table',columns:c,rows:[{Units_StdDev:Math.sqrt((35/3-9)*3/2)}]};
 const a={node:{node_id:'sd'},type:'transform.cross_table',data:{schema:c,row_count:1,sample_complete:true,precision:{numbers_verified:true},sample:[[{type:'real',is_null:false,precision:'exact_native',value:'1.9999999999999998'}]]}};
 assert.equal(matchExpectedOutputs([a],[expected]).length,1);
 for(const value of ['2','1.999999','NaN','Infinity','0']){const bad=structuredClone(a);bad.data.sample[0][0].value=value;assert.throws(()=>matchExpectedOutputs([bad],[expected]));}
 const exact=actual('sum',1.9999999999999998);assert.throws(()=>matchExpectedOutputs([exact],[report(2)]));
});
test('legacy and outputs[] parse while mixed, empty and duplicate schemas refuse',()=>{
 const base={package_path:'/own/package.lgp',nodes:[]};
 assert.equal(parseExpectedOutputs({...base,...report(10)}).multiple,false);
 assert.equal(parseExpectedOutputs({...base,outputs:[report(10),report(20)]}).outputs.length,2);
 for(const patch of [{outputs:[]},{outputs:[report(10)],...report(10)},{outputs:[{...report(10),columns:[columns[0],columns[0]]}]},
  {outputs:[{...report(10),rows:[{Region:'North'}]}]}])assert.throws(()=>parseExpectedOutputs({...base,...patch}));
});
test('Variant oracle requires subtype and exact native proof, including NULL and DateTime bytes',()=>{
 const columns=[{name:'Value',label:'Value',type:'variant'}];
 const date={cell_type:'datetime',bytes_le:'00000000c079e640'};
 const expected={output_node_type:'transform.cross_table',columns,rows:[{Value:date},{Value:null}]};
 const data={schema:columns,row_count:2,sample_complete:true,precision:{numbers_verified:true},sample:[
  [{type:'variant',cell_type:'datetime',is_null:false,value:date.bytes_le,precision:'exact_native',native:{tag:7,bytes_le:date.bytes_le,temporal_profile:'loginom-7.4.2-native-oadate',semantic_scope:'native_serial_only'}}],
  [{type:'variant',cell_type:'null',is_null:true,value:null,precision:'exact_native',native:{tag:1}}]]};
 const a={node:{node_id:'variant'},type:'transform.cross_table',data};
 assert.equal(matchExpectedOutputs([a],[expected]).length,1);
 for(const mutate of [d=>delete d.sample[0][0].cell_type,d=>delete d.sample[0][0].native,
  d=>d.sample[0][0].native.bytes_le='0000000000000000',d=>d.sample[0][0].native.tag=8,
  d=>d.sample[0][0].precision='display_only',d=>delete d.sample[1][0].native]){
  const changed=structuredClone(a);mutate(changed.data);assert.throws(()=>matchExpectedOutputs([changed],[expected]));
 }
 assert.throws(()=>parseExpectedOutputs({package_path:'/own/p.lgp',nodes:[],outputs:[{...expected,rows:[{Value:'2026-01-01'}]}]}));
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

test('column permutations match by name unless exact column order is requested',()=>{
 const a=structuredClone(actual('ordered',10));a.data.schema.reverse();a.data.sample[0].reverse();
 for(const options of [{},{column_order:'any'}])assert.equal(matchExpectedOutputs([a],[{...report(10),...options}]).length,1);
 assert.throws(()=>matchExpectedOutputs([a],[{...report(10),column_order:'exact'}]));
 assert.equal(matchExpectedOutputs([actual('ordered',10)],[{...report(10),column_order:'exact'}]).length,1);
});
test('name-based column matching still rejects extra, missing, duplicate, renamed or mistyped columns',()=>{
 for(const change of [a=>a.data.schema.pop(),a=>a.data.schema.push({name:'Extra',label:'Extra',type:'string'}),
  a=>a.data.schema[1]={...a.data.schema[0]},a=>a.data.schema[0].name='Other',
  a=>a.data.schema[0].label='Other',a=>a.data.schema[1].type='integer',
  a=>a.data.sample[0].reverse()]){
  const a=structuredClone(actual('changed',10));change(a);
  assert.throws(()=>matchExpectedOutputs([a],[report(10)]));
 }
});
test('column_order accepts exact or any in both expected forms and rejects other values',()=>{
 const base={package_path:'/own/order.lgp',nodes:[]};
 for(const column_order of ['exact','any'])for(const multiple of [true,false]){
  const output={...report(10),column_order};
  assert.equal(parseExpectedOutputs({...base,...(multiple?{outputs:[output]}:output)}).outputs[0].column_order,column_order);
 }
 for(const column_order of ['EXACT','',null,true,1,[],{}])for(const multiple of [true,false]){
  const output={...report(10),column_order};
  assert.throws(()=>parseExpectedOutputs({...base,...(multiple?{outputs:[output]}:output)}));
 }
});
test('stage-three labels disambiguate identical outputs only after exact schema and value verification',()=>{
 const first={...actual('a',10),label:'First'},second={...actual('b',10),label:'Second'};
 const wants=[{...report(10),output_node_label:'First'},{...report(10),output_node_label:'Second'}];
 assert.deepEqual(matchExpectedOutputs([second,first],wants).map(m=>m.node.node_id),['a','b']);
 second.data.sample[0][1].value=20;assert.throws(()=>matchExpectedOutputs([first,second],wants));
 assert.equal(parseExpectedOutputs({package_path:'/own/p.lgp',nodes:[],outputs:Array.from({length:32},()=>report(10))}).outputs.length,32);
 assert.throws(()=>parseExpectedOutputs({package_path:'/own/p.lgp',nodes:[],outputs:Array.from({length:33},()=>report(10))}));
});

test('scalar civil DateTime requires exact milliseconds and calendar representation; Variant stays native',()=>{
 const columns=[{name:'When',label:'When',type:'datetime'}];
 const want={output_node_type:'transform.cross_table',columns,rows:[{When:'2026-01-03T00:00:00.000'}]};
 const a={node:{node_id:'date'},type:'transform.cross_table',data:{schema:columns,row_count:1,sample_complete:true,precision:{numbers_verified:true},sample:[[{type:'datetime',is_null:false,value:want.rows[0].When,precision:'millisecond',representation:'local_datetime',timezone:'unspecified'}]]}};
 assert.equal(matchExpectedOutputs([a],[want]).length,1);
 for(const change of [{value:'2026-01-03T00:00:00.001'},{value:'2026-01-02T00:00:00.000'},{precision:'display_only'},{timezone:'UTC'},{representation:'native_serial'},{type:'string'},{is_null:true}]){
  const bad=structuredClone(a);Object.assign(bad.data.sample[0][0],change);assert.throws(()=>matchExpectedOutputs([bad],[want]));
 }
 const nativeWant=structuredClone(want);nativeWant.rows[0].When={cell_type:'datetime',bytes_le:'000000002079e640'};
 assert.throws(()=>matchExpectedOutputs([a],[nativeWant]));
});
