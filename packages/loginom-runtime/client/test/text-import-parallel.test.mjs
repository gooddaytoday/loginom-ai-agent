import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {textImportParametersSchema} from '../lib/node-api.mjs';
import {validateTextImportPatch,validateTextImportFieldsRequest,configureTextImportPatch} from '../lib/text-import-procedure.mjs';
import {textImportConfigurationReadback} from '../lib/text-import-readback.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';

test('parallel settings admit native choices and refuse unsupported values before UI',()=>{
 const validate=new AjvJsonSchemaValidator().getValidator(textImportParametersSchema);
 for(const max_threads of ['auto',2,4,8,16,32]){
  const settings={source:{parallel_processing:true,max_threads}};
  assert.equal(validate({settings}).valid,true);
  validateTextImportPatch(settings);
 }
 validateTextImportPatch({source:{parallel_processing:false}});
 validateTextImportPatch({source:{max_threads:2}});
 for(const source of [{parallel_processing:'true'},{max_threads:0},{max_threads:1},{max_threads:3},
  {max_threads:'2'},{max_threads:null},{max_threads:true}]){
  assert.equal(validate({settings:{source}}).valid,false);
  assert.throws(()=>validateTextImportPatch({source}));
 }
});

test('incompatible thread settings refuse before any UI effect in full settings and patches',async()=>{
 const columns=[{name:'A',label:'A',type:'integer',data_kind:'Дискретный',used:true}];
 for(const source of [{source_paths:['/test/a.csv'],max_threads:2},{source_mask:'/test/*.csv',max_threads:2},
  {parallel_processing:false,max_threads:2}]){
  assert.throws(()=>validateTextImportPatch({source}),/max_threads requires parallel_processing:true/);
  assert.throws(()=>validateTextImportFieldsRequest({source:{encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true,
   ...(!source.source_paths&&!source.source_mask?{source_path:'/test/a.csv'}:{}),...source},
   format:{delimiter:';',text_qualifier:'"',null_marker:'NULL',decimal_separator:'.'},columns}),/max_threads requires parallel_processing:true/);
  await assert.rejects(configureTextImportPatch({observe:()=>assert.fail('preflight reached UI')},{source},{}),/max_threads requires parallel_processing:true/);
 }
});

test('existing list switches sequential to two threads using native picker and preserves source/schema',async t=>{
 const owner={status:'observed',node:{tid:'node'},path:[{tid:'scenario',label:'Scenario'}]};
 const fields={source_path:'/test/jan.csv｜/test/feb.csv',connection:'Server',encoding:'UTF-8 (65001)',
  rows_to_skip:'0',first_line_as_title:true,file_info:'Имя файла',parallel_processing:false,max_threads:'Автоопределение'};
 const columns=[{index:0,status:'observed',name:'SaleID',label:'SaleID',type:'integer',data_kind:'Дискретный',used:true,cell_refs:{}}];
 let stage='text_import_file',open=false,desired='2';const gestures=[];
 const observed=values=>Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{status:'observed',value,owner_ref:k+'-owner',input_ref:k,display_ref:k,truncated:false,enabled:k!=='max_threads'||fields.parallel_processing}]));
 const combo={name:'max_threads',scope:'import_source',root_ref:'root',owner_ref:'max_threads-owner'};
 const state=()=>({wizard:{status:'observed',stage,root_tid:'wizard',root_ref:'root',owner_context:owner,
  import_source:{fields:observed(fields)},settings:{fields:observed({delimiter:';',text_qualifier:'"',null_marker:'\\N',decimal_separator:'.'})},
  import_columns:{initial_layout:{status:'rendered_definition_layout'},fields:columns,
   page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,returned:1,total_columns:1,next_offset:null}}},
  ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'wizard;btnPrev',ref:'prev',allowed_actions:['wizard_step']},
   ...(fields.parallel_processing?[{ref:'picker',wizard_combo:{kind:'picker',field:combo}}]:[]),
   ...(open?[{ref:'option',wizard_combo:{kind:'option',label:desired,field:combo}}]:[])]}});
 const channel={observe:async options=>{const s=structuredClone(state());assert.equal(options.ready(s),true,options.condition);return s;},
  act:async a=>{gestures.push(a);
   if(a.verb==='wizard_step')stage=a.expected_stage;
   else if(a.verb==='set_checked')fields[a.ref]=a.checked;
   else if(a.verb==='click'&&a.ref==='picker')open=true;
   else if(a.verb==='select_wizard_option'&&a.ref==='option'){fields.max_threads=desired;open=false;}
   else if(a.verb==='fill')fields[a.ref]=a.text;
   else if(a.verb==='press')assert.equal(a.key,'Tab');
   else assert.fail(JSON.stringify(a));
  }};
 channel.perform=async options=>channel.act(options.resolve(options.initialObservation));
 for(const source of [{source_paths:['/test/jan.csv','/test/feb.csv'],parallel_processing:true,max_threads:2},
  {max_threads:4},{parallel_processing:false},{}]){
  stage='text_import_file';desired=String(source.max_threads??4);
  const result=await configureTextImportPatch(channel,{source},owner,fields.source_path);
  assert.equal(result.source.fields.parallel_processing.value,source.parallel_processing??Object.hasOwn(source,'max_threads'));
  assert.equal(result.source.fields.max_threads.value,source.max_threads===2?'2':'4');
  assert.equal(result.source.fields.source_path.value,'/test/jan.csv｜/test/feb.csv');
  assert.equal(result.columns[0].name,'SaleID');
 }
 assert.equal(gestures.filter(a=>a.verb==='select_wizard_option').length,2);
 for(const source of [{max_threads:2},{rows_to_skip:1,max_threads:2}])await t.test(JSON.stringify(source),async()=>{
  stage='text_import_file';gestures.length=0;
  await assert.rejects(configureTextImportPatch(channel,{source},owner,fields.source_path),/max_threads requires parallel_processing:true/);
  assert.deepEqual(gestures,[]);
 });
});

test('thread count comes from the observed UI receipt, including disabled saved controls',()=>{
 const f=JSON.parse(fs.readFileSync(new URL('./fixtures/text-import-readback.json',import.meta.url),'utf8'));
 const source=f.phases.find(p=>p.phase==='configure').value.source;
 source.fields.file_info={status:'observed',value:'Нет'};
 source.fields.parallel_processing={status:'observed',value:false};
 source.fields.max_threads={status:'observed',value:'2',enabled:false};
 const readback=textImportConfigurationReadback(f);
 assert.equal(readback.source.max_threads,'2');
 assert.equal(new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration)({status:'applied',readback}).valid,true);
});
