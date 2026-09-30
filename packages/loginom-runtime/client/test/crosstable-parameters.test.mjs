import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveCrossTableParameters,validateCrossTableParameters} from '../lib/crosstable-parameters.mjs';

const ref=name=>({kind:'input_field',name});
const request=parameters=>({target:{kind:'new'},inputs:[{input:0}],read:{ports:[0]},mappings:[],parameters});
const parameters={rows:[ref('Region')],column:ref('Category'),facts:[
 {field:ref('Amount'),functions:['sum','avg','min','max']},
 {field:ref('Quantity'),functions:['sum']},
],columns:{mode:'sliding',min_values:0}};
const fields=[
 {name:'Region',type:'string',data_kind:'Дискретный'},
 {name:'Category',type:'string',data_kind:'Дискретный'},
 {name:'Amount',type:'integer',data_kind:'Непрерывный'},
 {name:'Quantity',type:'integer',data_kind:'Непрерывный'},
];

test('CrossTable resolves distinct roles and aggregation mask from the input schema',()=>{
 assert.equal(validateCrossTableParameters(parameters,'pivot',request(parameters)),parameters);
 const resolved=resolveCrossTableParameters(parameters,fields);
 assert.deepEqual(resolved.rows.map(field=>field.name),['Region']);
 assert.equal(resolved.column.name,'Category');
 assert.deepEqual(resolved.facts.map(f=>f.mask),[29,1]);
 assert.equal(resolveCrossTableParameters(parameters,fields.map(({name,type})=>({name,type}))).column.name,'Category');
});

test('CrossTable rejects ambiguous roles and silent sliding truncation before mutation',()=>{
 assert.throws(()=>validateCrossTableParameters({...parameters,column:ref('Region')},'pivot',request(parameters)),/distinct input fields/);
 assert.throws(()=>validateCrossTableParameters({...parameters,columns:{mode:'sliding',min_values:3}},'pivot',request(parameters)),/unbounded observed categories/);
 assert.throws(()=>resolveCrossTableParameters(parameters,fields.map(field=>field.name==='Category'?{...field,data_kind:'Непрерывный'}:field)),/must be discrete/);
});

test('CrossTable fixed uses every source category and rejects an explicit subset',()=>{
 const fixed={...parameters,columns:{mode:'fixed',include_null:true,include_other:true}};
 assert.equal(validateCrossTableParameters(fixed,'pivot',request(fixed)),fixed);
 assert.throws(()=>validateCrossTableParameters({...fixed,columns:{...fixed.columns,categories:['A','B']}},'pivot',request(fixed)),/columns.categories is unsupported/);
});
