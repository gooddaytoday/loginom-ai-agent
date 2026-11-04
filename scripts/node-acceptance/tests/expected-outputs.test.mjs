import {parseExpectedVariableInventory,matchVariableInventoryOutput,matchVariableInventoryLinks} from '../expected-outputs.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseExpectedOutputs,matchExpectedOutputs} from '../expected-outputs.mjs';
const columns=[{name:'Region',label:'Region',type:'string'},{name:'Amount',label:'A|Amount|Сумма',type:'real'}];
const report=value=>({output_node_type:'transform.cross_table',columns,rows:[{Region:'North',Amount:value}]});
const actual=(id,value)=>({node:{node_id:id},type:'transform.cross_table',execution:{execution_id:id},data:{schema:columns,row_count:1,sample_complete:true,precision:{numbers_verified:true},sample:[[{type:'string',is_null:false,value:'North'},{type:'real',is_null:false,value}]]}});
test('registered Union automatic fixture passes the stock cold output parser',()=>{
 const expected=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/union/acceptance/union-auto-match/expected.json',import.meta.url)));
 expected.package_path='/test/union-auto-match.lgp';
 const parsed=parseExpectedOutputs(expected);
 assert.equal(parsed.outputs[0].output_node_type,'transform.union_data');assert.equal(parsed.outputs[0].output_port,0);
 assert.equal(parsed.outputs[0].rows.length,6);
});
test('native binary64 decimal preserves signed zero across the browser JSON boundary',()=>{
 const a=actual('zero',0),cell=a.data.sample[0][1];
 Object.assign(cell,{representation:'binary64',precision:'17_significant_digits'});
 for(const decimal of ['-0','-0E+00','-0.000E-300']){
  cell.decimal=decimal;
  assert.equal(matchExpectedOutputs([JSON.parse(JSON.stringify(a))],[report(-0)]).length,1);
 }
 for(const value of [1,-1,1e-300]){const bad=structuredClone(a);bad.data.sample[0][1].value=value;
  assert.throws(()=>matchExpectedOutputs([bad],[report(-0)]));}
 for(const decimal of ['0','0E+00','0.000E-300']){
  cell.decimal=decimal;assert.throws(()=>matchExpectedOutputs([a],[report(-0)]));
 }
});
test('binary64 cold accepts equivalent exponential decimals from LAB-616 and tiny finite values',()=>{
 for(const [value,decimal] of [[6052718753.75986,'6.05271875375986E+09'],
  [6046466566.2198925,'6.0464665662198925E+09'],[6042546632.779791,'6.042546632779791E+09'],
  [6050861492.43988,'6.05086149243988E+09'],[1e-300,'1E-300'],[-1e-300,'-1E-300']]){
  const a=actual('exponential',value);
  Object.assign(a.data.sample[0][1],{representation:'binary64',precision:'17_significant_digits',decimal});
  assert.equal(matchExpectedOutputs([a],[report(value)]).length,1);
 }
});
test('binary64 cold still rejects contradictory or non-finite decimal evidence',()=>{
 const a=actual('contradiction',6052718753.75986),cell=a.data.sample[0][1];
 Object.assign(cell,{representation:'binary64',precision:'17_significant_digits'});
 for(const decimal of ['6.05271875375987E+09','1E-300','NaN','Infinity','1E+309',null,6052718753.75986]){
  cell.decimal=decimal;assert.throws(()=>matchExpectedOutputs([a],[report(cell.value)]));
 }
 cell.decimal='6.05271875375986E+09';
 for(const value of [Infinity,NaN,'6052718753.75986']){
  cell.value=value;assert.throws(()=>matchExpectedOutputs([a],[report(value)]));
 }
});
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

test('cold preserves expected negative zero including exact native decimal strings',()=>{
 for(const native of [false,true]){
  const a=actual('zero',native?'-0':-0);
  if(native)a.data.sample[0][1].precision='exact_native';
  assert.equal(matchExpectedOutputs([a],[report(-0)]).length,1);
  a.data.sample[0][1].value=native?'0':0;
  assert.throws(()=>matchExpectedOutputs([a],[report(-0)]));
 }
});

test('explicit factor_signs permits only a shared factor sign across scores/loadings',()=>{
 const columns=[{name:'Factor1',type:'real',label_any:true,tolerance:{abs:1e-8,rel:1e-10}}];
 const outputs=[0,1].map(output_port=>({output_node_type:'research.factor_analysis',output_port,ordered:true,column_order:'exact',columns,rows:[{Factor1:1},{Factor1:-2}]}));
 const rows=[0,1].map(output_port=>({node:{node_id:'factor'},type:'research.factor_analysis',output_port,data:{schema:columns,row_count:2,sample_complete:true,precision:{numbers_verified:true},sample:[[{type:'real',is_null:false,value:-1}],[{type:'real',is_null:false,value:2}]]}}));
 const factorSigns={columns:['Factor1'],ports:[0,1]};
 assert.equal(matchExpectedOutputs(rows,outputs,{factorSigns}).length,2);
 assert.throws(()=>matchExpectedOutputs(rows,outputs));
 const bad=structuredClone(rows);bad[0].data.sample[1][0].value=-2;
 assert.throws(()=>matchExpectedOutputs(bad,outputs,{factorSigns}));
 bad[0].data.sample[1][0].value=2;bad[1].data.sample[0][0].value=1;
 assert.throws(()=>matchExpectedOutputs(bad,outputs,{factorSigns}));
});

const variableExpected={package_path:'/own/v.lgp',nodes:[{type:'variables.user'}],outputs:[],variable_inventory:{outputs:[{node:{type:'variables.user'},port:4,variables:[{name:'enabled',type:'boolean',value:false},{name:'empty',type:'string',value:''},{name:'n',type:'integer',value:null}]}]}};
const variableActual=()=>({kind:'variables',port:4,source:'snapshot',native_source:'VariablesEditValuesWizard',package_modified:false,read_id:'read-new',execution_id:null,fresh:true,complete:true,count:3,
 completeness:{count:3,store_count:3,unique_ids:3,loaded:true},variables:variableExpected.variable_inventory.outputs[0].variables.map((v,index)=>({id:index,index,name:v.name,label:v.name,type:v.type,cell:{type:v.type,is_null:v.value===null,value:v.value}}))});
test('W1 cold variable-only fixture needs explicit typed inventory and preserves the old table parser',()=>{
 assert.deepEqual(parseExpectedOutputs(variableExpected),{multiple:true,outputs:[]});assert.ok(parseExpectedVariableInventory(variableExpected));
 assert.throws(()=>parseExpectedOutputs({...variableExpected,variable_inventory:undefined}),/EXPECTED_OUTPUTS_INVALID/);
 assert.equal(matchVariableInventoryOutput(variableActual(),variableExpected.variable_inventory.outputs[0]),true);
});
for(const fault of ['missing','null-false','duplicate','partial','fake-execution','wrong-source','package-modified'])test('W1 cold variable matcher refuses '+fault,()=>{
 const a=variableActual();if(fault==='missing')a.variables.pop();if(fault==='null-false')a.variables[0].cell.is_null=true;
 if(fault==='duplicate')a.variables[1].id=0;if(fault==='partial')a.completeness.store_count=2;
 if(fault==='fake-execution')a.execution_id='fake';if(fault==='wrong-source')a.native_source='VariablesForm';if(fault==='package-modified')a.package_modified=true;
 assert.throws(()=>matchVariableInventoryOutput(a,variableExpected.variable_inventory.outputs[0]));
});
test('W1 cold variable/control links match exact typed namespaces and reject an ambiguous node',()=>{
 const graph={nodes:[{ref:{node_id:'s'},type:'variables.user'},{ref:{node_id:'t'},type:'transform.calculator'}],variable_links:[{source:'s',output:4,target:'t',input:0,kind:'control',source_port_guid:'s4',target_port_guid:'c'}]};
 const inventory={links:[{source:{type:'variables.user'},output:4,target:{type:'transform.calculator'},input:0,kind:'control'}]};
 assert.equal(matchVariableInventoryLinks(graph,inventory).length,1);graph.variable_links[0].kind='variables';assert.throws(()=>matchVariableInventoryLinks(graph,inventory));
 graph.variable_links[0].kind='control';graph.nodes.push({ref:{node_id:'other'},type:'transform.calculator'});assert.throws(()=>matchVariableInventoryLinks(graph,inventory));
});
