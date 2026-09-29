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
