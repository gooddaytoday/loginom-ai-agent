import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateTextImportFieldsRequest,validateTextImportPatch,validateInitialExistingImportSettings,textImportFormatChoice} from '../lib/text-import-procedure.mjs';
import {textImportConfigurationReadback} from '../lib/text-import-readback.mjs';
const settings=()=>({source:{source_path:'/input.txt',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},format:{delimiter:'|',text_qualifier:'"',null_marker:'?',decimal_separator:'.',multiple_delimiters:false,date_format:'yyyy/mm/dd',date_separator:'-'},columns:[{name:'Id',label:'Идентификатор',type:'string',data_kind:'Дискретный',used:true}]});
const choice=()=>({wizard:{status:'observed',stage:'text_import_format',root_ref:'root',settings:{fields:{date_separator:{status:'observed',value:'Не задано (.)',native_max_length_utf16:1,owner_ref:'owner',input_ref:'input'}}}},ui:{elements:[{ref:'option',wizard_combo:{kind:'option',label:'Дефис (-)',field:{name:'date_separator',owner_ref:'owner',input_ref:'input',root_ref:'root'}}}]}});
test('date separator chooses an exact observed option despite maxlength=1',()=>{
 const state=choice();assert.equal(textImportFormatChoice(state,'date_separator','option','Дефис (-)').ref,'option');
 assert.equal(state.wizard.settings.fields.date_separator.native_max_length_utf16,1);
});
for(const key of ['root_ref','owner_ref','input_ref','name','scope'])test('date separator refuses foreign option '+key,()=>{
 const state=choice();state.ui.elements[0].wizard_combo.field[key]='foreign';assert.throws(()=>textImportFormatChoice(state,'date_separator','option','Дефис (-)'),/unavailable or ambiguous/);
});
test('date separator refuses ambiguous, missing, differently labelled or out-of-stage choices',()=>{
 for(const mutation of ['duplicate','missing','label','stage','unobserved']){
  const state=choice();
  if(mutation==='duplicate')state.ui.elements.push(structuredClone(state.ui.elements[0]));
  if(mutation==='missing')state.ui.elements=[];
  if(mutation==='label')state.ui.elements[0].wizard_combo.label='Дефис';
  if(mutation==='stage')state.wizard.stage='text_import_file';
  if(mutation==='unobserved')state.wizard.settings.fields.date_separator.status='unobserved';
  assert.throws(()=>textImportFormatChoice(state,'date_separator','option','Дефис (-)'));
 }
});
test('new explicit format settings and same-node partial corrections are admitted without defaults replacing omitted settings',()=>{
 const input=settings(),original=structuredClone(input);validateTextImportFieldsRequest(input);validateTextImportPatch({format:{multiple_delimiters:true}});validateTextImportPatch({format:{date_format:'dd/mm/yyyy',date_separator:'.'}});assert.deepEqual(input,original);
 const legacy=settings();for(const k of ['multiple_delimiters','date_format','date_separator'])delete legacy.format[k];validateTextImportFieldsRequest(legacy);
 assert.throws(()=>validateInitialExistingImportSettings({format:{multiple_delimiters:false}},'/input.txt'),/Source parameters are incomplete|Unexpected text import parameters/);
});
for(const [key,value] of [['multiple_delimiters','false'],['multiple_delimiters',1],['date_format','auto'],['date_format','yyyy-mm-dd'],['date_separator',''],['date_separator','\n'],['unknown',false]])test('invalid format '+key+'='+JSON.stringify(value)+' is refused before a wizard',()=>{
 const input=settings();input.format[key]=value;assert.throws(()=>validateTextImportFieldsRequest(input));assert.throws(()=>validateTextImportPatch({format:{[key]:value}}));
});
test('format readback preserves observed false and exact native date displays, rejecting wrong types and unobserved extras',()=>{
 const input=JSON.parse(fs.readFileSync(new URL('./fixtures/text-import-readback.json',import.meta.url),'utf8'));
 const fields=input.phases[0].value.format.fields;Object.assign(fields,{multiple_delimiters:{status:'observed',value:false},date_format:{status:'observed',value:'yyyy/mm/dd'},date_separator:{status:'observed',value:'Дефис (-)'}});
 const actual=textImportConfigurationReadback(input);assert.equal(actual.format.multiple_delimiters,false);assert.equal(actual.format.date_separator,'Дефис (-)');
 fields.multiple_delimiters.value='false';assert.throws(()=>textImportConfigurationReadback(input));fields.multiple_delimiters.value=false;fields.date_format.status='unobserved';assert.throws(()=>textImportConfigurationReadback(input));
});
