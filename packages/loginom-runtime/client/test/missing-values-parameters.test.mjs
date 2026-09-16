import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMissingValuesParameters as validate,resolveMissingValuesParameters as resolve} from '../lib/missing-values-parameters.mjs';
const field=name=>({kind:'input_field',name});
const request={target:{kind:'new'},inputs:[{input:0}],read:{ports:[0]},mappings:[],finish:'execute'};
const parameters=()=>({ordered:false,max_nulls_percent:100,fields:[{field:field('Amount'),method:'mean'},{field:field('Note'),method:'constant',value:'MISSING'}]});
const schema=[{name:'Amount',label:'Одинаковая метка',type:'real',data_kind:'Непрерывный'},{name:'Note',label:'Одинаковая метка',type:'string',data_kind:'Дискретный'},{name:'Keep',type:'integer',data_kind:'Дискретный'}];
test('missing values resolves by name despite identical labels and leaves unrequested fields out',()=>{
 const p=parameters();validate(p,'impute',request);assert.deepEqual(resolve(p,schema).map(f=>f.name),['Amount','Note']);
 assert.deepEqual(resolve(p,[...schema].reverse()).map(f=>f.name),['Amount','Note']);
 assert.deepEqual(schema.map(f=>f.data_kind),['Непрерывный','Дискретный','Дискретный']);
});
test('missing values requires full settings and rejects unsupported methods before configuration',()=>{
 for(const mutate of [p=>delete p.ordered,p=>p.ordered=true,p=>delete p.max_nulls_percent,p=>p.max_nulls_percent=-1,p=>p.max_nulls_percent=101,p=>p.max_nulls_percent=0.5,p=>p.fields=[],p=>p.fields.push(p.fields[0]),p=>p.fields[0].method='median',p=>p.fields[0].value=0,p=>p.fields[1].value=42,p=>delete p.fields[1].value,p=>p.fields[0].field.kind='label',p=>p.extra=true]){
  const p=parameters();mutate(p);assert.throws(()=>validate(p,'impute',request));
 }
 for(const value of ['', 'null', '0', '—', '"quoted"']){const p=parameters();p.fields[1].value=value;assert.doesNotThrow(()=>validate(p,'impute',request));}
});
test('missing values rejects kind/type substitutions without silently converting the source',()=>{
 for(const [type,data_kind] of [['integer','Дискретный'],['real','Дискретный'],['variant','Непрерывный'],['datetime','Непрерывный'],['string','Непрерывный']])
  assert.throws(()=>resolve(parameters(),[{...schema[0],type,data_kind},schema[1]]),/incompatible/);
 for(const [type,data_kind] of [['string','Непрерывный'],['integer','Дискретный'],['variant','Дискретный']])
  assert.throws(()=>resolve(parameters(),[schema[0],{...schema[1],type,data_kind}]),/incompatible/);
 assert.throws(()=>resolve(parameters(),[schema[0]]),/missing/);
 assert.throws(()=>resolve(parameters(),[...schema,{...schema[0],name:'amount'}]),/unique/);
});
test('preserved reexecution is existing-only; close cannot mutate input mapping',()=>{
 assert.throws(()=>validate({},'impute',request));
 assert.doesNotThrow(()=>validate({},'impute',{...request,target:{kind:'existing'},inputs:[]}));
 assert.throws(()=>validate(parameters(),'impute',{...request,inputs:[]}));
 assert.throws(()=>validate(parameters(),'impute',{...request,finish:'close',mappings:[{direction:'input',port:0}]}));
});
