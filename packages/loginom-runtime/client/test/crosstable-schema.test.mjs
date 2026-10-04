import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCrossTableSchema,retainCrossTableReadPolicy} from '../lib/crosstable-schema.mjs';
import {alignReadSchema,buildNodeReadRequest} from '../lib/node-read-contract.mjs';
const node={document_id:'doc',workflow_id:'wf',node_id:'cross'};
const configuration={kind:'crosstable',category_mode:'sliding',row_keys:[{name:'Region',label:'Region',type:'string'}],
 column:{name:'Category',label:'Category',type:'string'},facts:[{name:'Amount',label:'Amount',type:'real',functions:['sum','min']}],
 options:{separator:'|',unique_names:false,limit:0,min_values:0}};
const fields=(categories)=>[{index:0,name:'Region',label:'Region',type:'string'},...categories.flatMap((c,i)=>[
 {name:`C_${i+1}_Amount_Sum`,label:`${c}|Amount|Сумма`,type:'real'},
 {name:`C_${i+1}_Amount_Min`,label:`${c}|Amount|Минимум`,type:'real'}]).map((f,i)=>({...f,index:i+1}))];
test('sliding identities follow observed category labels, including a same-width replacement',()=>{
 const before=fields(['A','B']),after=fields(['A','D']);
 assert.throws(()=>alignReadSchema(after,before));
 const proof=resolveCrossTableSchema(after,configuration);
 assert.equal(proof.category_fields.find(f=>f.field==='C_2_Amount_Sum').category,'D');
 for(const cats of [[],['A'],['A','C','D'],['<...>','null',' ']])
  assert.equal(resolveCrossTableSchema(fields(cats),configuration).category_fields.length,cats.length*2);
});
test('complete row and fact identities survive ordering while ambiguous/truncated groups refuse',()=>{
 const good=fields(['A','B']);
 for(const mutate of [xs=>xs.pop(),xs=>xs.push({...xs[1],index:5}),xs=>xs[1].label='A|Amount',
  xs=>xs[1].label='|Amount|Сумма',xs=>xs[1].label='A|Wrong|Сумма',xs=>xs[1].type='integer',
  xs=>xs[1].name='C_1_Amount_Min',xs=>xs[0].label='Wrong',xs=>xs[0].type='integer',
  xs=>xs[3].label='A|Amount|Сумма',xs=>xs[1].index=2]){
  const copy=structuredClone(good);mutate(copy);assert.throws(()=>resolveCrossTableSchema(copy,configuration));
 }
 assert.throws(()=>resolveCrossTableSchema(fields(['<Прочее>']),configuration));
});
function source(){
 const phases=['input_mapping','configure','node_finish','output_mapping','finish','execute','read'];
 const readback={...structuredClone(configuration),scope:'observed_before_verified_finish',output_scope:'observed_after_verified_execution',
  values_are:'observed_ui_values',node,receipt_ids:phases.map(p=>'created:'+p),execution_id:'fresh'};
 return {parameters:{contract_revision:'1.0.0',target:{type:'transform.cross_table'},workflow_ref:{workflow_id:'wf'}},
  outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{node,cleanup_complete:true,
   configuration:{status:'applied',readback},execution:{status:'completed',execution_id:'fresh'},
   phases:phases.map(phase=>({phase,receipt_id:'created:'+phase,status:'verified'})),
   output:{ports:[{port:0,port_guid:'port',fresh:true,execution_id:'fresh',schema:fields(['A','B'])}]}}}};
}
test('only a locally verified sliding CrossTable yields an internal reread policy',()=>{
 const s=source();assert.equal(retainCrossTableReadPolicy(s,'created').kind,'crosstable_sliding');
 const args={operation_id:'read',source_operation_id:'created'};
 assert.equal(buildNodeReadRequest(args,s).parameters.cross_table_policy.kind,'crosstable_sliding');
 s.outcome.output.configuration.readback.category_mode='fixed';
 assert.equal(retainCrossTableReadPolicy(s,'created'),null);
 assert.equal(buildNodeReadRequest(args,s).parameters.cross_table_policy,undefined);
});
test('foreign, stale, incomplete or unaudited source receipts cannot grant schema changes',()=>{
 for(const mutate of [s=>s.outcome.output.configuration.readback.node={...node,node_id:'other'},
  s=>s.outcome.output.configuration.readback.receipt_ids.pop(),s=>s.outcome.output.phases[2].status='pending',
  s=>s.outcome.output.output.ports[0].execution_id='old',s=>s.outcome.output.output.ports[0].fresh=false,
  s=>s.outcome.output.configuration.readback.output_scope='before_execution',
  s=>s.outcome.output.configuration.readback.options.separator='.',s=>s.outcome.output.output.ports[0].schema.pop()]){
  const s=source();mutate(s);assert.throws(()=>retainCrossTableReadPolicy(s,'created'));
 }
});
test('every other component retains strict schema validation',()=>{
 const types=['imports.text','transform.calculator','transform.group_data','transform.sort','transform.filter',
  'transform.replacement','transform.date_time','transform.collapse_columns','preprocessing.data_recovery',
  'research.duplicates','transform.join_data','transform.union_data','transform.reform','exports.text'];
 for(const type of types){const s=source();s.parameters.target.type=type;assert.equal(retainCrossTableReadPolicy(s,'created'),null);
  assert.throws(()=>alignReadSchema(fields(['A','D']),fields(['A','B'])));}
});
test('native single result omits redundant fact/function while type identity remains exact',()=>{
 const c={...configuration,facts:[{name:'Amount',label:'Amount',type:'real',functions:['count']}]};
 const xs=[{index:0,name:'Region',label:'Region',type:'string'},
  {index:1,name:'C_1',label:'A',type:'integer'}];
 const p=resolveCrossTableSchema(xs,c).category_fields[0];
 assert.equal(p.function,'count');assert.equal(p.fact,'Amount');assert.equal(p.category,'A');
 for(const patch of [{type:'real'},{name:'C_1_Amount_Sum'},{label:'A|Сумма'}])
  assert.throws(()=>resolveCrossTableSchema([xs[0],{...xs[1],...patch}],c));
});
test('native scalar aggregate result types distinguish counts, DateTime mean and day StdDev',()=>{
 const facts=[{name:'Text',label:'Text',type:'string',functions:['count','first']},
  {name:'When',label:'When',type:'datetime',functions:['avg','stddev']}];
 const c={...configuration,facts};
 const xs=[{index:0,name:'Region',label:'Region',type:'string'},
  {index:1,name:'C_1_Text_Count',label:'A|Text|Количество',type:'integer'},
  {index:2,name:'C_1_Text_First',label:'A|Text|Первый',type:'string'},
  {index:3,name:'C_1_When_Avg',label:'A|When|Среднее',type:'datetime'},
  {index:4,name:'C_1_When_StdDev',label:'A|When|Стандартное откл.',type:'real'}];
 assert.equal(resolveCrossTableSchema(xs,c).category_fields.length,4);
 for(const index of [1,2,3,4]){
  const wrong=structuredClone(xs);wrong[index].type='boolean';assert.throws(()=>resolveCrossTableSchema(wrong,c));
 }
});

test('several ordered dimensions use flat native C_n and retain each category identity',()=>{
 const c={...configuration,columns:[{name:'Category',label:'Category',type:'string'},
  {name:'Channel',label:'Channel',type:'string'}]};
 const xs=[{index:0,name:'Region',label:'Region',type:'string'},
  {index:1,name:'C_1_Amount_Sum',label:'A|<...>|Amount|Сумма',type:'real'},
  {index:2,name:'C_1_Amount_Min',label:'A|<...>|Amount|Минимум',type:'real'}];
 const fields=resolveCrossTableSchema(xs,c).category_fields;
 assert.deepEqual(fields[0].categories,[{dimension:'Category',caption:'A',kind:'value',value:'A'},
  {dimension:'Channel',caption:'<...>',kind:'null',value:null}]);
 const wrong=structuredClone(xs);wrong[1].name='C_1_1_Amount_Sum';
 assert.throws(()=>resolveCrossTableSchema(wrong,c));
});

test('observed configurations without columns or any dimensions retain explicit fact/function labels',()=>{
 const fact={name:'Amount',label:'Amount',type:'real',functions:['sum']};
 for(const row_keys of [configuration.row_keys,[]]){
  const c={...configuration,column:null,columns:[],row_keys,facts:[fact]};
  const xs=[...row_keys.map((f,index)=>({...f,index})),
   {index:row_keys.length,name:'Amount_Sum',label:'Amount|Сумма',type:'real'}];
  const fields=resolveCrossTableSchema(xs,c).category_fields;
  assert.equal(fields[0].function,'sum');assert.deepEqual(fields[0].categories,[]);
  assert.throws(()=>resolveCrossTableSchema([...xs.slice(0,-1),{...xs.at(-1),name:'C_1'}],c));
 }
});
