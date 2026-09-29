import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveCrossTableOutputSchema} from '../lib/crosstable-output.mjs';

const configuration={input_fields:[
 {name:'Region',label:'Region',type:'string',source_index:0},
 {name:'Category',label:'Category',type:'string',source_index:1},
 {name:'Amount',label:'Amount',type:'integer',source_index:2},
 {name:'Quantity',label:'Quantity',type:'integer',source_index:3},
]};
const parameters={rows:[{name:'Region'}],facts:[
 {field:{name:'Amount'},functions:['sum','min','max','avg']},
 {field:{name:'Quantity'},functions:['sum']},
],columns:{mode:'fixed',include_null:false,include_other:true}};
const columns=[
 {name:'Region',label:'Region',type:'string'},
 ...['A','B','<Прочее>'].flatMap((category,index)=>[
  {name:`C_${index+1}_Amount_Sum`,label:`${category}|Amount|Сумма`,type:'real'},
  {name:`C_${index+1}_Amount_Min`,label:`${category}|Amount|Минимум`,type:'real'},
  {name:`C_${index+1}_Amount_Max`,label:`${category}|Amount|Максимум`,type:'real'},
  {name:`C_${index+1}_Amount_Avg`,label:`${category}|Amount|Среднее`,type:'real'},
  {name:`C_${index+1}_Quantity_Sum`,label:`${category}|Quantity|Сумма`,type:'real'},
 ]),
];

test('CrossTable binds every generated output field to category, fact and function',()=>{
 const resolved=resolveCrossTableOutputSchema(configuration,parameters,columns);
 assert.deepEqual(resolved.categories,['A','B','<Прочее>']);
 assert.equal(resolved.category_mapping[2].facts.find(f=>f.field==='Amount'&&f.function==='min').name,'C_3_Amount_Min');
});

test('CrossTable refuses a category label drift and missing generated field',()=>{
 assert.throws(()=>resolveCrossTableOutputSchema(configuration,parameters,columns.slice(0,-1)),/generated width differs/);
 assert.throws(()=>resolveCrossTableOutputSchema(configuration,parameters,
  columns.map(column=>column.name==='C_2_Amount_Sum'?{...column,label:'D|Amount|Сумма'}:column)),/category and fact labels disagree/);
});

import {resolveReadOutputSchema} from '../lib/node-read-driver.mjs';
import {buildNodeReadRequest} from '../lib/node-read-contract.mjs';
const sliding={...parameters,columns:{mode:'sliding',include_null:false,include_other:false}};
const indexed=columns.filter(c=>!c.label.startsWith('<Прочее>')).map((c,index)=>({...c,index}));
const retained={schema:indexed,port_guid:'port',dynamic_schema:{kind:'crosstable_sliding',configuration,parameters:sliding}};
test('Sliding reread resolves width changes and categories with reused technical IDs',()=>{
 assert.deepEqual(resolveReadOutputSchema(indexed.slice(0,6),retained,'transform.cross_table').categories,['A']);
 const replaced=indexed.map(c=>({...c,label:c.label.replace(/^B\|/,'D|')}));
 const result=resolveReadOutputSchema(replaced,retained,'transform.cross_table');
 assert.deepEqual(result.categories,['A','D']);
 assert.equal(result.category_mapping[1].category,'D');
 assert.equal(result.category_mapping[1].facts[0].name,'C_2_Amount_Sum');
 assert.deepEqual(result.fields,replaced.map(({index,...c})=>c));
});
test('Sliding retains row, fact type, index, uniqueness and category binding guards',()=>{
 for(const actual of [
  indexed.map((c,i)=>i===0?{...c,label:'Other'}:c),
  indexed.map((c,i)=>i===1?{...c,type:'integer'}:c),
  indexed.map((c,i)=>i===1?{...c,index:0}:c),
  indexed.map((c,i)=>i===1?{...c,name:'C_2_Amount_Sum'}:c),
  indexed.map((c,i)=>i===1?{...c,label:'Wrong|Amount|Сумма'}:c),
 ])assert.throws(()=>resolveReadOutputSchema(actual,retained,'transform.cross_table'));
 assert.throws(()=>resolveReadOutputSchema(indexed,retained,'transform.calculator'));
 assert.throws(()=>resolveReadOutputSchema(indexed,{...retained,dynamic_schema:{...retained.dynamic_schema,parameters}},'transform.cross_table'));
 assert.throws(()=>resolveReadOutputSchema(indexed.slice(0,6),{schema:indexed},'transform.cross_table'));
});
test('dynamic policy comes only from completed Sliding CrossTable output; Fixed stays static',()=>{
 const source={parameters:{contract_revision:'1.0.0',target:{type:'transform.cross_table'},parameters:sliding,workflow_ref:{}},outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{cleanup_complete:true,node:{},execution:{status:'completed'},output:{ports:[{port:0,...retained}]}}}};
 const args={operation_id:'r',source_operation_id:'s'};
 assert.deepEqual(buildNodeReadRequest(args,source).parameters.schemas[0].dynamic_schema,retained.dynamic_schema);
 source.parameters.parameters=parameters;
 assert.equal(buildNodeReadRequest(args,source).parameters.schemas[0].dynamic_schema,undefined);
 source.parameters.parameters=sliding;source.parameters.target.type='transform.calculator';
 assert.equal(buildNodeReadRequest(args,source).parameters.schemas[0].dynamic_schema,undefined);
});
