import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTextImportPatch,mergeImportColumnPatch,reconcileImportColumnPatch,bindImportSourceColumns} from '../lib/text-import-procedure.mjs';
import {validateTextImportNodeParameters} from '../lib/text-import-node.mjs';
const fields=[{name:'Id',label:'Identifier',type:'integer',data_kind:'Дискретный',used:true},
 {name:'Title',label:'Title',type:'string',data_kind:'Дискретный',used:true},
 {name:'Amount',label:'Amount',type:'real',data_kind:'Непрерывный',used:true}];
test('new import settings bind by source identity and retain native file order',()=>{
 const observed=fields.map((c,index)=>({...c,index,status:'observed'}));
 const requested=[fields[2],{...fields[0],source_name:'Id',name:'RecordId'},fields[1]];
 const original=structuredClone(requested),actual=bindImportSourceColumns(requested,observed);
 assert.deepEqual(actual,[requested[1],requested[2],requested[0]]);assert.deepEqual(requested,original);
 for(const invalid of [[fields[0],fields[0],fields[2]],[...fields.slice(0,2),{...fields[2],source_name:'Missing'}],fields.slice(0,2)])
  assert.throws(()=>bindImportSourceColumns(invalid,observed));
 assert.throws(()=>bindImportSourceColumns(requested,observed.map(c=>({...c,status:'unknown'}))));
});
test('Russian source labels bind to observed technical names before editing fields',()=>{
 const observed=[{...fields[0],name:'Kod_tovara',label:'Код товара',index:0,status:'observed'},
  {...fields[2],name:'Vyruchka_za_god_rub',label:'Выручка за год руб',index:1,status:'observed'}];
 const requested=[{...fields[2],source_name:'Выручка за год руб',name:'Revenue'},
  {...fields[0],source_name:'Код товара',name:'ProductId'}];
 assert.deepEqual(bindImportSourceColumns(requested,observed),[
  {...requested[1],source_name:'Kod_tovara'},{...requested[0],source_name:'Vyruchka_za_god_rub'}]);
 assert.equal(requested[0].source_name,'Выручка за год руб');
});
test('source labels never guess between duplicates or consume one field twice',()=>{
 const observed=fields.slice(0,2).map((c,index)=>({...c,label:'Повтор',index,status:'observed'}));
 assert.throws(()=>bindImportSourceColumns([{...fields[0],source_name:'Повтор'},fields[1]],observed));
 assert.throws(()=>bindImportSourceColumns([{...fields[0],source_name:'Identifier'},fields[0]],
  fields.slice(0,2).map((c,index)=>({...c,index,status:'observed'}))));
 assert.throws(()=>bindImportSourceColumns([{...fields[0],source_name:'Id'},fields[1]],
  [{...observed[0],label:'Other'},{...observed[1],label:'Id'}]));
});
test('partial column updates preserve order, other fields and unspecified properties',()=>{
 const baseline=structuredClone(fields),patch=[{source_name:'Id',name:'RecordId'},{name:'Amount',label:'Сумма'}];
 const result=mergeImportColumnPatch(baseline,patch);
 assert.deepEqual(result,[{...fields[0],name:'RecordId',source_name:'Id'},fields[1],{...fields[2],label:'Сумма'}]);
 assert.deepEqual(baseline,fields);assert.equal(patch[0].label,undefined);
});
test('existing import patches accept unique Russian labels without requiring a rename',()=>{
 const source=fields.map(c=>({...c,label:c.name==='Id'?'Код товара':c.label}));
 assert.deepEqual(mergeImportColumnPatch(source,[{source_name:'Код товара',used:false}]),
  [{...source[0],used:false},...source.slice(1)]);
 assert.deepEqual(reconcileImportColumnPatch(source,source,[{source_name:'Код товара',name:'ProductId'}]),
  [{...source[0],name:'ProductId',source_name:'Id'},...source.slice(1)]);
});
test('unknown fields, duplicate identities and name collisions cannot silently rewrite a schema',()=>{
 for(const patch of [[{name:'Missing',used:false}],[{name:'Id',used:false},{name:'Id',label:'Other'}],[{source_name:'Id',name:'Title'}]])
  assert.throws(()=>mergeImportColumnPatch(fields,patch));
});
test('patch format omission differs from explicit empty Null or qualifier settings',()=>{
 validateTextImportPatch({});validateTextImportPatch({format:{null_marker:'',text_qualifier:''}});
 for(const patch of [{source:undefined},{format:undefined},{columns:undefined},{source:{rows_to_skip:undefined}},{source:{connection:'Other'}},{format:{decimal_separator:'auto'}},
  {columns:[{name:'Id',used:'false'}]},{columns:[{name:'Id',unknown:true}]},{source:{encoding:'auto'}}])assert.throws(()=>validateTextImportPatch(patch));
});
test('partial requests are admitted only for an existing node with a verified source',()=>{
 const parameters={settings:{columns:[{name:'Amount',label:'Сумма'}]},source:{artifact_id:'a',upload_operation_id:'u',bytes:12,sha256:'a'.repeat(64)}};
 const request={target:{kind:'existing'},finish:'done',read:{ports:[]},mappings:[],inputs:[]};
 validateTextImportNodeParameters(parameters,'delimited',request);
 assert.throws(()=>validateTextImportNodeParameters(parameters,'delimited',{...request,target:{kind:'new'}}));
});

test('replacement schema preserves matching settings by name after reordering',()=>{
 const extra={name:'Extra',label:'Extra',type:'integer',data_kind:'Дискретный',used:true};
 const parsed=[fields[1],fields[2],{...fields[0],label:'Id',data_kind:'Непрерывный'}, {...extra,type:'real'}];
 const result=reconcileImportColumnPatch(fields,parsed,[extra],{schemaChangeRequested:true});
 assert.deepEqual(result,[fields[1],fields[2],fields[0],extra]);
 assert.throws(()=>reconcileImportColumnPatch(fields,parsed,[extra]),/without requested parsing changes/);
});
test('new parsed fields require complete explicit semantics; removed fields cannot be patched',()=>{
 const parsed=[fields[1],{name:'Extra',label:'Extra',type:'real',data_kind:'Непрерывный',used:true}];
 for(const changes of [[],[{name:'Extra',type:'integer'}],[{name:'Id',used:false}]])
  assert.throws(()=>reconcileImportColumnPatch(fields,parsed,changes,{schemaChangeRequested:true}));
 const extra={name:'Extra',label:'Count',type:'integer',data_kind:'Дискретный',used:true};
 assert.deepEqual(reconcileImportColumnPatch(fields,parsed,[extra],{schemaChangeRequested:true}),[fields[1],extra]);
});
