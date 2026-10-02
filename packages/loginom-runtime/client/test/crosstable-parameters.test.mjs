import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCrossTableParameters,resolveCrossTableParameters} from '../lib/crosstable-parameters.mjs';
import {bindCrossTableInput} from '../lib/crosstable-procedure.mjs';
const field=name=>({kind:'input_field',name});
const p={row_keys:[field('Region')],column:field('Category'),facts:[{field:field('Amount'),functions:['sum','min','max','avg']}],category_mode:'fixed',include_null:true,include_other:true};
const r={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0]}};
const fields=[['Region','string','Дискретный'],['Category','string','Дискретный'],['Amount','real','Непрерывный']].map(([name,type,data_kind],index)=>({index,name,label:name,type,data_kind}));
test('numeric pivot supports both modes and rejects unimplemented features before drivers',()=>{
 assert.equal(validateCrossTableParameters(p,'pivot',r),p);assert.equal(resolveCrossTableParameters(p,fields).column.name,'Category');
 const sliding={...p,category_mode:'sliding'};delete sliding.include_null;delete sliding.include_other;
 assert.equal(validateCrossTableParameters(sliding,'pivot',r),sliding);
 for(const patch of [{limit:1},{min_values:1},{unique_names:true},{separator:'.'},{categories:['A']},{variables:{}},
  {row_keys:[field('Region'),field('Region')]},{category_mode:'sliding'},
  {facts:[{field:field('Amount'),functions:['count']}]},{facts:[{field:field('Amount'),functions:['sum','sum']}]}])
  assert.throws(()=>validateCrossTableParameters({...p,...patch},'pivot',r));
 for(const request of [{...r,inputs:[]},{...r,mappings:[{direction:'output',port:0}]},{...r,read:{ports:[1]}}])
  assert.throws(()=>validateCrossTableParameters(p,'pivot',request));
});
test('upstream name, kind, type and label are verified rather than inferred',()=>{
 for(const mutate of [xs=>xs[1].data_kind='Непрерывный',xs=>xs[2].type='string',xs=>xs[0].data_kind='Непрерывный',
  xs=>xs[1].name='Other',xs=>xs[2].label='A|B',xs=>xs[1].label=xs[0].label]){
  const xs=structuredClone(fields);mutate(xs);assert.throws(()=>resolveCrossTableParameters(p,xs));
 }
});
test('native Index binds to the verified input mapping, never to a display name guess',()=>{
 const context={verified:true,document_id:'doc',workflow_id:'wf',node_id:'node'};
 const native={verified:true,inventory_complete:true,node_context:context,input_fields:fields.map(({name,...f})=>({...f,record_id:'r'+f.index}))};
 const mapping={verified:true,inventory_complete:true,node_context:{...context,input_port:{port:0}},target_fields:fields};
 assert.deepEqual(bindCrossTableInput(native,mapping).map(f=>f.name),fields.map(f=>f.name));
 for(const mutate of [m=>m.node_context.node_id='other',m=>m.target_fields.reverse(),m=>m.target_fields[0].label='different',
  m=>m.target_fields[0].excluded=true,m=>m.target_fields[0].type='integer',m=>m.target_fields[0].data_kind='Непрерывный']){
  const m=structuredClone(mapping);mutate(m);assert.throws(()=>bindCrossTableInput(native,m));
 }
});
