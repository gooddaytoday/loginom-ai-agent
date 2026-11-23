import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {textImportParametersSchema} from '../lib/node-api.mjs';
import {validateTextImportPatch,configureTextImportPatch} from '../lib/text-import-procedure.mjs';
import {textImportOutputFields} from '../lib/text-import-node.mjs';
import {textImportConfigurationReadback} from '../lib/text-import-readback.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';

// Observed cbbFileInfoColumnsType options and native mapping (multi-file.md).
const modes={none:'Нет',name:'Имя файла',relative_path:'Относительный путь',absolute_path:'Абсолютный путь',
 name_time:'Имя файла, Время модификации',relative_path_time:'Относительный путь, Время модификации',
 absolute_path_time:'Абсолютный путь, Время модификации'};
const fields=mode=>mode==='none'?[]:[{name:'FileName',type:'string'},
 ...(mode.endsWith('_time')?[{name:'FileTime',type:'datetime'}]:[])];
const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/text-import-readback.json',import.meta.url),'utf8'));
const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration);

for(const [mode,label] of Object.entries(modes))test('native file info schema, mapping and observed readback: '+mode,()=>{
 const settings={source:{file_info:mode}};
 assert.equal(new AjvJsonSchemaValidator().getValidator(textImportParametersSchema)({settings}).valid,true);
 validateTextImportPatch(settings);
 const f=fixture(),configured=f.phases[0].value,native=f.phases[1].value.native_mapping;
 configured.source.fields.file_info={status:'observed',value:label};
 for(const field of fields(mode)){
  const source={...native.source_fields[0],...field,label:field.name,record_id:field.name};
  native.source_fields.push(source);
  native.target_fields.push({...source,data_kind:'Дискретный',index:native.target_fields.length,record_id:'out-'+field.name,source:structuredClone(source)});
 }
 const output=textImportOutputFields(configured,native);
 assert.deepEqual(output.map(f=>[f.name,f.type]),[...configured.columns.filter(f=>f.used),...fields(mode)].map(f=>[f.name,f.type]));
 const readback=textImportConfigurationReadback(f);
 assert.equal(readback.source.file_info,label);
 assert.equal(validate({status:'applied',readback}).valid,true);
 for(const field of fields(mode)){
  const bad=structuredClone(native);bad.source_fields=bad.source_fields.filter(f=>f.name!==field.name);
  assert.throws(()=>textImportOutputFields(configured,bad));
  const collision=structuredClone(configured);collision.columns.push({...field,used:true});
  assert.throws(()=>textImportOutputFields(collision,native));
  const invalid=structuredClone(f),mapping=invalid.phases[1].value.native_mapping;
  mapping.source_fields.find(f=>f.name===field.name).type='integer';
  mapping.target_fields.find(f=>f.source.name===field.name).source.type='integer';
  mapping.target_fields.find(f=>f.source.name===field.name).type='integer';
  assert.throws(()=>textImportConfigurationReadback(invalid));
 }
});

for(const source of [{file_info:'Нет'},{parallel_processing:false},{file_info:'Нет',max_threads:'2'},
 {parallel_processing:false,max_threads:'2'}])test('file info and parallel readback are independently optional: '+JSON.stringify(source),()=>{
 const f=fixture();
 for(const [key,value] of Object.entries(source))f.phases[0].value.source.fields[key]={status:'observed',value};
 const readback=textImportConfigurationReadback(f);
 assert.equal(validate({status:'applied',readback}).valid,true);
 const key=Object.keys(source)[0];readback.source[key]=typeof source[key]==='boolean'?'false':false;
 assert.equal(validate({status:'applied',readback}).valid,false);
});

test('same Import switches absolute+time to relative+time through the native picker only',async()=>{
 const f=fixture(),owner={status:'observed',node:{tid:'node'},path:[{tid:'scenario',label:'Scenario'}]};
 const configured=f.phases[0].value,source=configured.source.fields;
 source.file_info={status:'observed',value:modes.absolute_path_time,owner_ref:'info'};
 let stage='text_import_file',open=false;const gestures=[];
 const combo={name:'file_info',scope:'import_source',root_ref:'root',owner_ref:'info'};
 const state=()=>({wizard:{status:'observed',stage,root_tid:'wizard',root_ref:'root',owner_context:owner,
  import_source:configured.source,settings:configured.format,
  import_columns:{initial_layout:{status:'rendered_definition_layout'},fields:configured.columns,
   page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,returned:configured.columns.length,total_columns:configured.columns.length,next_offset:null}}},
  ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'wizard;btnPrev',ref:'prev',allowed_actions:['wizard_step']},
   {ref:'picker',wizard_combo:{kind:'picker',field:combo}},
   ...(open?[{ref:'option',wizard_combo:{kind:'option',field:combo,label:modes.relative_path_time}}]:[])]}});
 const channel={observe:async options=>{const s=structuredClone(state());assert.equal(options.ready(s),true,options.condition);return s;},
  act:async action=>{gestures.push(action);
   if(action.verb==='wizard_step')stage=action.expected_stage;
   else if(action.verb==='click')open=true;
   else if(action.verb==='select_wizard_option'){source.file_info.value=modes.relative_path_time;open=false;}
   else assert.fail(JSON.stringify(action));
  }};
 channel.perform=async options=>channel.act(options.resolve(options.initialObservation));
 const result=await configureTextImportPatch(channel,{source:{file_info:'relative_path_time'}},owner,source.source_path.value);
 assert.equal(result.source.fields.file_info.value,modes.relative_path_time);
 assert.deepEqual(result.columns,configured.columns);
 assert.equal(gestures.filter(a=>a.verb==='select_wizard_option').length,1);
});
