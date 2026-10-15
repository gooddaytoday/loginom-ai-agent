import test from 'node:test';
import assert from 'node:assert/strict';
import {readJavascriptDeclaredColumns,readObservedJavascriptDeclaredColumns} from '../lib/javascript-declared-schema.mjs';

const columns=[
  {name:'RowID',label:'RowID',type:'integer',data_kind:'Непрерывный',usage:'Не задано'},
  {name:'CustomerKey',label:'CustomerKey',type:'string',data_kind:'Дискретный',usage:'Не задано'},
  {name:'NetCents',label:'NetCents',type:'integer',data_kind:'Непрерывный',usage:'Выходное'},
  {name:'Status',label:'Status',type:'string',data_kind:'Дискретный',usage:'Не задано'}];
// Shapes and numeric enum codes observed in Loginom 7.4.2 declared/usage runs.
const schema={verified:true,inventory_complete:true,form:'JavaScriptColumnsWizard',page_tid:'owned-page',
  generation:{checked:false},grids:[{tid:'owned-page;grdSourceColumns;tbl',count:0,total:0,fields:[]},
  {tid:'owned-page;grdTargetColumns;tbl',count:4,total:4,fields:[
    {record_id:'1324',Index:0,Name:'RowID',DisplayName:'RowID',DataType:4,DataKind:1,UsageType:0,DefaultUsageType:0,Required:false,Broken:false},
    {record_id:'1342',Index:1,Name:'CustomerKey',DisplayName:'CustomerKey',DataType:5,DataKind:2,UsageType:0,DefaultUsageType:0,Required:false,Broken:false},
    {record_id:'1360',Index:2,Name:'NetCents',DisplayName:'NetCents',DataType:4,DataKind:1,UsageType:0,DefaultUsageType:4,Required:false,Broken:false},
    {record_id:'1378',Index:3,Name:'Status',DisplayName:'Status',DataType:5,DataKind:2,UsageType:0,DefaultUsageType:0,Required:false,Broken:false}]}]};

test('declared readback keeps observed default usage separate from actual usage',()=>{
  const result=readJavascriptDeclaredColumns(schema,columns);
  assert.equal(result.length,4);
  assert.deepEqual(result[2],{index:2,...columns[2],usage_type:0,default_usage_type:4,required:false});
  assert.equal(result[0].default_usage_type,0);
});

test('existing declarations are derived from complete native metadata including default roles',()=>{
  assert.deepEqual(readObservedJavascriptDeclaredColumns(schema),readJavascriptDeclaredColumns(schema,columns));
  for(const change of [s=>s.inventory_complete=false,s=>s.grids[1].total=3,
    s=>s.grids[1].fields[0].DataType=99,s=>s.grids[1].fields[0].DataKind=99,
    s=>s.grids[1].fields[0].DefaultUsageType=99,s=>delete s.grids[1].fields[0].DefaultUsageType,
    s=>s.grids[1].fields[0].Required=undefined,s=>s.grids[1].fields.reverse(),
    s=>s.grids[1].fields[1].Name='RowID',s=>s.grids[1].fields=[]]) {
    const value=structuredClone(schema);change(value);
    assert.throws(()=>readObservedJavascriptDeclaredColumns(value));
  }
});

test('declared readback refuses partial, foreign, reordered and mismatched native metadata',()=>{
  for(const change of [
    s=>s.verified=false,s=>s.inventory_complete=false,s=>s.generation.checked=true,
    s=>s.grids.push(structuredClone(s.grids[1])),s=>s.grids[1].tid='foreign',
    s=>s.grids[1].count=3,s=>s.grids[1].total=5,s=>s.grids[1].fields.pop(),
    s=>s.grids[1].fields.reverse(),s=>s.grids[1].fields[2].Index=0,
    s=>s.grids[1].fields[2].Name='Other',s=>s.grids[1].fields[2].DisplayName='Other',
    s=>s.grids[1].fields[2].DataType=3,s=>s.grids[1].fields[2].DataKind=2,
    s=>s.grids[1].fields[2].DefaultUsageType=0,s=>s.grids[1].fields[2].UsageType=undefined,
    s=>s.grids[1].fields[2].Required=undefined,s=>s.grids[1].fields[2].Broken=true,
    s=>s.grids[1].fields[2].record_id='1324',s=>s.grids[1].fields[2].record_id='',
  ]) {
    const value=structuredClone(schema);change(value);
    assert.throws(()=>readJavascriptDeclaredColumns(value,columns));
  }
});

test('actual UsageType cannot substitute for missing or different DefaultUsageType',()=>{
  const value=structuredClone(schema);
  value.grids[1].fields[2].UsageType=4;delete value.grids[1].fields[2].DefaultUsageType;
  assert.throws(()=>readJavascriptDeclaredColumns(value,columns));
  value.grids[1].fields[2].DefaultUsageType=0;
  assert.throws(()=>readJavascriptDeclaredColumns(value,columns));
});

test('declared readback refuses invalid requested shape rather than matching undefined enums',()=>{
  for(const patch of [{type:'unknown'},{data_kind:'unknown'},{usage:'unknown'},{extra:true}]) {
    const expected=structuredClone(columns);Object.assign(expected[2],patch);
    assert.throws(()=>readJavascriptDeclaredColumns(schema,expected));
  }
});
