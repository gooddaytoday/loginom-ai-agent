import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {textImportParametersSchema} from '../lib/node-api.mjs';
import {verifyTextImportSource,validateTextImportNodeParameters,textImportOutputFields} from '../lib/text-import-node.mjs';
import {configureTextImportFields,configureTextImportPatch,validateTextImportFieldsRequest,validateTextImportPatch} from '../lib/text-import-procedure.mjs';
import {textImportConfigurationReadback} from '../lib/text-import-readback.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';

const paths=['/test/feb.csv','/test/jan.csv'];
const refs=paths.map((_,i)=>({kind:'storage',server_source_ref:'source-'+i}));
const proofs=paths.map((destination,i)=>({verified:true,kind:'storage',destination,server_source_ref:'source-'+i}));
const parameters=()=>({source:{kind:'verified_sources',sources:structuredClone(refs)},settings:{
 source:{source_paths:[paths[0],'',paths[1]],encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true,file_info:'name'},
 format:{delimiter:';',text_qualifier:'"',null_marker:'\\N',decimal_separator:'.'},
 columns:[{name:'SaleID',label:'SaleID',type:'integer',data_kind:'Дискретный',used:true}]}});
test('list schema and production preflight accept individually verified ordered paths',()=>{
 const p=parameters();
 assert.equal(new AjvJsonSchemaValidator().getValidator(textImportParametersSchema)(p).valid,true);
 validateTextImportFieldsRequest(p.settings);
 validateTextImportNodeParameters(p,'delimited',{target:{kind:'new'},finish:'execute',inputs:[],mappings:[],read:{ports:[0]}});
 const receipt=verifyTextImportSource(p,[],undefined,proofs);
 assert.equal(receipt.source.kind,'verified_sources');
 assert.equal(receipt.source.destination,paths.join('｜'));
 assert.deepEqual(receipt.source.sources.map(s=>s.destination),paths);
 assert.equal(receipt.source.sha256,undefined);
});
test('list authority never comes from only its first source',()=>{
 for(const proof of [[proofs[0]], [...proofs].reverse(),[proofs[0],{...proofs[1],verified:false}]])
  assert.throws(()=>verifyTextImportSource(parameters(),[],undefined,proof),e=>e.nodePhaseRefusal?.effect_possible===false);
});
test('each delivery in a mixed list retains its own bytes and digest witness',()=>{
 const p=parameters(),digest='a'.repeat(64),destination=paths[1];
 p.source.sources[1]={kind:'verified_delivery',artifact_id:'artifact',upload_operation_id:'upload',bytes:15,sha256:digest};
 const upload={operation_id:'upload',artifact:{artifact_id:'artifact',bytes:15,sha256:digest},
  outcome:{operation_id:'upload',action_key:'artifact.upload',status:'SUCCEEDED',cleanup_complete:true,
   output:{artifact_id:'artifact',destination,bytes:15,sha256:digest,server_copy_verification:{verification_id:'verified',status:'SUCCEEDED',
    bytes_verified:true,upload_completion_verified:true,destination,bytes:15,sha256:digest}}}};
 assert.equal(verifyTextImportSource(p,[upload],undefined,[proofs[0]]).source.sources[1].sha256,digest);
 delete p.settings.source.source_paths;
 assert.equal(verifyTextImportSource(p,[upload],undefined,[proofs[0]]).source.destination,paths.join('｜'));
 p.source.sources[1].sha256='b'.repeat(64);
 assert.throws(()=>verifyTextImportSource(p,[upload],undefined,[proofs[0]]),e=>e.nodePhaseRefusal?.effect_possible===false);
});
test('invalid lists and service options refuse in production preflight',()=>{
 for(const source of [{source_paths:[]},{source_paths:['','']},{source_paths:['/x.csv｜/y.csv']},
  {source_paths:['/x*.csv']},{source_paths:['/../x.csv']},{source_paths:['https://x/a.csv']},
  {source_paths:paths,source_path:paths[0]},{source_paths:paths,file_info:'absolute'},
  {source_paths:paths,file_info:'name',parallel_processing:true}])
  assert.throws(()=>validateTextImportPatch({source}));
 for(const sources of [[refs[0]], [...refs].reverse(),[refs[0],{kind:'verified_sources',sources:refs}]]){
  const p=parameters();p.source.sources=sources;
  assert.throws(()=>verifyTextImportSource(p,[],undefined,proofs));
 }
});
test('existing list patch and file_info-only patch need no replacement settings',()=>{
 validateTextImportPatch({source:{source_paths:paths,file_info:'none'}});
 validateTextImportPatch({source:{file_info:'name'}});
  const p=parameters();p.settings={source:{file_info:'none'}};
  assert.equal(verifyTextImportSource(p,[],undefined,proofs).source.destination,paths.join('｜'));
});
for(const existing of [false,true])test('production wizard writes the whole list and filename option, existing: '+existing,async()=>{
 const p=parameters().settings,owner={status:'observed',node:{tid:'node'},path:[{tid:'scenario',label:'Scenario'}]};
 const fields={source_path:existing?paths.join('｜'):'/test/old.csv',connection:'Server',encoding:'UTF-8 (65001)',rows_to_skip:'0',first_line_as_title:true,file_info:'Нет',parallel_processing:true};
 let stage='text_import_file',open=false;const gestures=[];
 const observed=values=>Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{status:'observed',value,owner_ref:k+'-owner',input_ref:k,display_ref:k,truncated:false}]));
 const state=()=>({wizard:{status:'observed',stage,root_tid:'wizard',root_ref:'root',owner_context:owner,
  import_source:{fields:observed(fields)},settings:{fields:observed(p.format)},
  import_columns:{initial_layout:{status:'rendered_definition_layout'},fields:p.columns.map((c,index)=>({...c,index,status:'observed',cell_refs:{}})),
   page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,returned:1,total_columns:1,next_offset:null}}},
  ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'wizard;btnPrev',ref:'prev',allowed_actions:['wizard_step']},
   {ref:'picker',wizard_combo:{kind:'picker',field:{name:'file_info',scope:'import_source',root_ref:'root',owner_ref:'file_info-owner'}}},
   ...(open?[{ref:'option',wizard_combo:{kind:'option',label:'Имя файла',field:{name:'file_info',scope:'import_source',root_ref:'root',owner_ref:'file_info-owner'}}}]:[])]}});
 const channel={observe:async options=>{const s=structuredClone(state());assert.equal(options.ready(s),true,options.condition);return s;},
  act:async a=>{gestures.push(a);
   if(a.verb==='wizard_step')stage=a.expected_stage;
   else if(a.verb==='fill')fields[a.ref]=a.text;
   else if(a.verb==='press')assert.equal(a.key,'Tab');
   else if(a.verb==='set_checked')fields[a.ref]=a.checked;
   else if(a.verb==='click'&&a.ref==='picker')open=true;
   else if(a.verb==='select_wizard_option'&&a.ref==='option'){fields.file_info='Имя файла';open=false;}
   else assert.fail(JSON.stringify(a));
  }};
 channel.perform=async options=>channel.act(options.resolve(options.initialObservation));
 const result=existing?await configureTextImportPatch(channel,{source:{source_paths:paths,file_info:'name'}},owner,paths.join('｜'))
  :await configureTextImportFields(channel,p,owner);
 assert.equal(result.source.fields.source_path.value,paths.join('｜'));
 assert.equal(result.source.fields.file_info.value,'Имя файла');
 assert.equal(result.source.fields.parallel_processing.value,false);
 assert.equal(result.columns.length,1);
 assert.equal(gestures.filter(a=>a.verb==='select_wizard_option').length,1);
});
test('readback includes observed filename column and rejects a fabricated extra field',()=>{
 const f=JSON.parse(fs.readFileSync(new URL('./fixtures/text-import-readback.json',import.meta.url),'utf8'));
 const c=f.phases.find(p=>p.phase==='configure').value,m=f.phases.find(p=>p.phase==='output_mapping').value.native_mapping;
 c.source.fields.source_path.value=paths.join('｜');
 c.source.fields.file_info={status:'observed',value:'Имя файла'};
 c.source.fields.parallel_processing={status:'observed',value:false};
 const service={...structuredClone(m.source_fields[0]),name:'FileName',label:'Имя файла',type:'string',data_kind:'Дискретный',record_id:'filename'};
 m.source_fields.push(service);
 m.target_fields.push({...service,index:m.target_fields.length,record_id:'out-filename',source:structuredClone(service)});
 const r=textImportConfigurationReadback(f);
 assert.equal(r.source.file_info,'Имя файла');
 assert.equal(r.output_mapping.fields.at(-1).source_name,'FileName');
 assert.equal(new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration)({status:'applied',readback:r}).valid,true);
 m.source_fields.at(-1).name='Fake';m.target_fields.at(-1).source.name='Fake';
 assert.throws(()=>textImportConfigurationReadback(f));
});
test('service mapping uses the observed native metadata outside the CSV definitions',()=>{
 const configured={columns:parameters().settings.columns,source:{fields:{file_info:{status:'observed',value:'Имя файла'}}}};
 const service={name:'FileName',label:'Имя файла',type:'string',data_kind:'Неопределенное',record_id:'native'};
 assert.deepEqual(textImportOutputFields(configured,{source_fields:[service]}).map(c=>c.name),['SaleID','FileName']);
 assert.equal(textImportOutputFields(configured,{source_fields:[service]})[1].data_kind,'Неопределенное');
 assert.equal(configured.columns.length,1);
 assert.throws(()=>textImportOutputFields(configured,{source_fields:[]}));
 assert.throws(()=>textImportOutputFields(configured,{source_fields:[{...service,type:'integer'}]}));
});
