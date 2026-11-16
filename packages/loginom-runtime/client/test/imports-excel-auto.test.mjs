import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExcelParameters} from '../lib/imports-excel-parameters.mjs';
import {excelReadback,verifyExcelDetectedSchema,excelSchemaSnapshot} from '../lib/imports-excel-node.mjs';

const columns=['A','B'].map(name=>({name,label:name,type:'integer',data_kind:'Непрерывный',used:true}));
const source={kind:'storage',server_source_ref:'verified-book'};
const request={target:{kind:'new',type:'imports.excel'},finish:'execute',read:{ports:[0]},inputs:[],mappings:[]};
test('native policies are additive; initial explicit columns and existing path-only patches remain distinct',()=>{
 for(const auto_detect of ['none','new','all']){
  const excel={source_path:'/own/source.xlsx',header_rows:1,auto_detect,...(auto_detect==='none'?{columns:columns.map(({used,...f})=>f)}:{})};
  assert.doesNotThrow(()=>validateExcelParameters({source,excel},'xlsx',request));
  assert.doesNotThrow(()=>validateExcelParameters({source,excel:{source_path:'/own/changed.xlsx',auto_detect}},'xlsx',
   {...request,target:{kind:'existing',type:'imports.excel'}}));
 }
 assert.doesNotThrow(()=>validateExcelParameters({source,excel:{source_path:'/own/source.xlsx',header_rows:1,columns:columns.map(({used,...f})=>f)}},'xlsx',request));
 for(const excel of [{source_path:'/own/source.xlsx',header_rows:1},{source_path:'/own/source.xlsx',auto_detect:'none'},
  {source_path:'/own/source.xlsx',header_rows:1,auto_detect:'all',columns},
  {source_path:'/own/source.xlsx',header_rows:1,auto_detect:'guess'},
  {source_path:'/own/source.xlsx',header_rows:1,auto_detect:'new',parallel_processing:true}])
  assert.throws(()=>validateExcelParameters({source,excel},'xlsx',request));
 for(const r of [{...request,finish:'done'},{...request,read:{ports:[]}},{...request,mappings:[{direction:'output',port:0}]}])
  assert.throws(()=>validateExcelParameters({source,excel:{source_path:'/own/source.xlsx',header_rows:1,auto_detect:'all'}},'xlsx',r));
});
const schema=fields=>fields.map(({used,...f},index)=>({...f,index}));
test('new keeps existing positions/types while all follows the newly observed schema; static switch stays exact',()=>{
 const c={auto_detect:'Только новые',columns};
 const added=schema([...columns,{name:'D',label:'D',type:'string',used:true}]);
 assert.equal(verifyExcelDetectedSchema(c,added),true);
 for(const bad of [added.slice(1),added.map((f,i)=>i===0?{...f,type:'string'}:f),added.map((f,i)=>({...f,name:'same'}))])
  assert.throws(()=>verifyExcelDetectedSchema(c,bad),/LOGINOM_IMPORT_SCHEMA_CHANGED/);
 const current=['B','C'].map(name=>({name,label:name,type:'integer',used:true}));
 assert.equal(verifyExcelDetectedSchema({auto_detect:'Все',columns:current},schema(current)),true);
 assert.throws(()=>verifyExcelDetectedSchema({auto_detect:'Все',columns:current},schema(columns)));
 assert.throws(()=>verifyExcelDetectedSchema({auto_detect:'Нет',columns},schema(columns)));
 assert.throws(()=>excelSchemaSnapshot({verified:true,auto_detect:'Все',columns},{}),/LOGINOM_IMPORT_SCHEMA_CHANGED/);
});
function fixture(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'excel'},operation_id='auto';
 const output={port:0,fresh:true,execution_id:'fresh',schema:schema([...columns,{name:'D',label:'D',type:'string',used:true}])};
 const values={configure:{configuration:{verified:true,node_context:{...node,verified:true},source:{source_path:'/own/source.xlsx'},auto_detect:'Только новые',columns}},
  node_finish:{mode:'done',settings_applied:true,node_context:node},output_mapping:{deferred_schema:true,settings_applied:false,node_context:{...node,verified:true}},
  finish:{mode:'execute',settings_applied:true,node_context:{...node,verified:true}},execute:{owner_verified:true,execution_id:'fresh'},
  read:{execution_id:'fresh',ports:[output]}};
 return {node,operation_id,phases:Object.entries(values).map(([phase,value])=>({phase,receipt_id:operation_id+':'+phase,status:'verified',value:{verified:true,cleanup_complete:true,...value}}))};
}
test('dynamic readback binds separately observed definitions to the same fresh executed output',()=>{
 const result=excelReadback(fixture());
 assert.equal(result.auto_detect,'Только новые');assert.equal(result.columns.length,2);
 assert.equal(result.dynamic_schema.fields.length,3);assert.equal(result.dynamic_schema.execution_id,'fresh');
 assert.equal(result.dynamic_schema.fields[2].data_kind,undefined,'unobserved kind is never invented');
});
for(const [name,change] of Object.entries({stale:f=>f.phases.at(-1).value.ports[0].fresh=false,
 execution:f=>f.phases.at(-1).value.ports[0].execution_id='old',owner:f=>f.phases[2].value.node_context.node_id='foreign',
 cleanup:f=>f.phases.at(-1).value.cleanup_complete=false,manual:f=>f.phases[2].value.settings_applied=true,
 type:f=>f.phases.at(-1).value.ports[0].schema[0].type='string'}))
 test('dynamic Excel readback refuses '+name,()=>{const f=fixture();change(f);assert.throws(()=>excelReadback(f));});
