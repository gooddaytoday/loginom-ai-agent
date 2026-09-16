import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTextImportEncoding} from '../lib/text-import-encoding.mjs';
import {validateTextImportFieldsRequest,isTextImportSourceReady} from '../lib/text-import-procedure.mjs';
for(const [aliases,code,label] of [[['UTF-8','65001'],'65001','UTF-8 (65001)'],[['Windows-1251','CP1251','1251'],'1251','Кириллическая (1251)'],
 [['Windows-1252','CP1252','1252'],'1252','Западноевропейская (1252)'],[['UTF-16 LE','UTF-16LE','1200'],'1200','UTF-16 LE (1200)'],
 [['UTF-16 BE','UTF-16BE','1201'],'1201','UTF-16 BE (1201)']])test('encoding aliases select the same native value '+code,()=>{
 for(const alias of [...aliases,label])assert.deepEqual(resolveTextImportEncoding(alias),{code,label});
});
test('unknown and implicit encodings are not substituted',()=>{
 for(const value of ['auto','CP999','utf8',undefined,1251])assert.throws(()=>resolveTextImportEncoding(value));
});
test('unsupported encoding is refused before the field procedure starts',()=>{
 const p={source:{source_path:'/test.csv',encoding:'auto',rows_to_skip:0,first_line_as_title:true},format:{delimiter:';',decimal_separator:'.',null_marker:'NULL',text_qualifier:'"'},columns:[{name:'Id',label:'Id',type:'integer',data_kind:'Дискретный',used:true}]};
 assert.throws(()=>validateTextImportFieldsRequest(p),/encoding/);
});
test('source baseline waits for initialized fields, while permitting an empty new-node path',()=>{
 const values={source_path:'',connection:'Локальное',encoding:'UTF-8 (65001)',rows_to_skip:'0',first_line_as_title:false};
 const state={wizard:{stage:'text_import_file',import_source:{fields:Object.fromEntries(Object.entries(values).map(([name,value])=>[name,{status:'observed',value}]))}}};
 assert.equal(isTextImportSourceReady(state),true);
 for(const name of ['connection','encoding','rows_to_skip']) {
  const s=structuredClone(state);s.wizard.import_source.fields[name].value='';assert.equal(isTextImportSourceReady(s),false);
 }
 const missing=structuredClone(state);delete missing.wizard.import_source.fields.first_line_as_title;assert.equal(isTextImportSourceReady(missing),false);
});
