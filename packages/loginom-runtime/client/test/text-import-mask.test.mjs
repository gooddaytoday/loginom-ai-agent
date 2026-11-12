import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {textImportParametersSchema} from '../lib/node-api.mjs';
import {verifyTextImportSource,validateTextImportNodeParameters} from '../lib/text-import-node.mjs';
import {validateTextImportPatch,configureTextImportFields,configureTextImportPatch} from '../lib/text-import-procedure.mjs';

const mask='/own/sales_*.csv';
const paths=['/own/sales_2026-01.csv','/own/sales_2026-02.csv'];
const ref=path=>path.replace(/[^A-Za-z0-9_-]/g,'-');
const proof=destination=>({kind:'storage',verified:true,server_source_ref:ref(destination),destination});
const parameters=()=>({source:{kind:'verified_sources',sources:paths.map(path=>({kind:'storage',server_source_ref:ref(path)}))},
 settings:{source:{source_mask:mask,encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true,file_info:'name'},
 format:{delimiter:';',text_qualifier:'"',null_marker:'\\N',decimal_separator:'.'},
 columns:[{name:'SaleID',label:'SaleID',type:'integer',data_kind:'Дискретный',used:true}]}});
test('mask schema and production preflight retain the mask separately from verified matches',()=>{
 const p=parameters();
 assert.equal(new AjvJsonSchemaValidator().getValidator(textImportParametersSchema)(p).valid,true);
 validateTextImportNodeParameters(p,'delimited',{target:{kind:'new'},finish:'execute',inputs:[],mappings:[],read:{ports:[0]}});
 assert.equal(verifyTextImportSource(p,[],undefined,paths.map(proof)).source.destination,mask);
 assert.deepEqual(verifyTextImportSource(p,[],undefined,paths.map(proof)).source.sources.map(s=>s.destination),paths);
 validateTextImportPatch({source:{source_mask:mask}});
});
test('new month is a new verified match, never a literal or unverified source',()=>{
 const p=parameters(),march='/own/sales_2026-03.csv';
 p.source.sources.push({kind:'storage',server_source_ref:ref(march)});
 assert.equal(verifyTextImportSource(p,[],undefined,[...paths,march].map(proof)).source.sources.length,3);
 for(const bad of ['/other/sales_2026-03.csv','/own/returns_2026-03.csv','/own/sub/sales_2026-03.csv']){
  p.source.sources[2].server_source_ref=ref(bad);
  assert.throws(()=>verifyTextImportSource(p,[],undefined,[...paths,bad].map(proof)),e=>e.nodePhaseRefusal?.effect_possible===false);
 }
 assert.throws(()=>verifyTextImportSource(parameters(),[],undefined,[proof(paths[0])]));
});
test('mask rejects path mixing, directory wildcards, traversal and unsupported glob syntax',()=>{
 for(const source of [{source_mask:mask,source_path:paths[0]},{source_mask:mask,source_paths:paths},
  ...['/own/sales.csv','/o*/sales_*.csv','/own/../sales_*.csv','//own/sales_*.csv','/own/sales_?.csv',
   '/own/sales_[12]*.csv','/own/sales_*.csv｜/own/returns.csv','/own/sales_%*.csv','/own/sales_*.csv\n'].map(source_mask=>({source_mask}))])
  assert.throws(()=>validateTextImportPatch({source}));
 const p=parameters();p.source=p.source.sources[0];
 assert.throws(()=>validateTextImportNodeParameters(p,'delimited',{target:{kind:'existing'},finish:'execute',inputs:[],mappings:[],read:{ports:[0]}}));
});
for(const existing of [false,true])test('production wizard writes the native mask and sequential processing: '+existing,async()=>{
 const p=parameters().settings,owner={status:'observed',node:{tid:'node'},path:[{tid:'scenario',label:'Scenario'}]};
 const fields={source_path:existing?mask:'',connection:'Server',encoding:'UTF-8 (65001)',rows_to_skip:'0',first_line_as_title:true,file_info:'Имя файла',parallel_processing:true};
 let stage='text_import_file';const gestures=[];
 const observed=values=>Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{status:'observed',value,owner_ref:k+'-owner',input_ref:k,display_ref:k,truncated:false}]));
 const state=()=>({wizard:{status:'observed',stage,root_tid:'wizard',root_ref:'root',owner_context:owner,
  import_source:{fields:observed(fields)},settings:{fields:observed(p.format)},
  import_columns:{initial_layout:{status:'rendered_definition_layout'},fields:p.columns.map((c,index)=>({...c,index,status:'observed',cell_refs:{}})),
   page:{status:'complete_definition_page',schema_id:'schema',offset:0,limit:8,returned:1,total_columns:1,next_offset:null}}},
  ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'wizard;btnPrev',ref:'prev',allowed_actions:['wizard_step']}]}});
 const channel={observe:async options=>{const s=structuredClone(state());assert.equal(options.ready(s),true,options.condition);return s;},
  act:async a=>{gestures.push(a);
   if(a.verb==='wizard_step')stage=a.expected_stage;
   else if(a.verb==='fill')fields[a.ref]=a.text;
   else if(a.verb==='press')assert.equal(a.key,'Tab');
   else if(a.verb==='set_checked')fields[a.ref]=a.checked;
   else assert.fail(JSON.stringify(a));
  }};
 channel.perform=async options=>channel.act(options.resolve(options.initialObservation));
 const result=existing?await configureTextImportPatch(channel,{source:{source_mask:mask}},owner,mask)
  :await configureTextImportFields(channel,p,owner);
 assert.equal(result.source.fields.source_path.value,mask);
 assert.equal(result.source.fields.parallel_processing.value,false);
 assert.equal(gestures.filter(a=>a.verb==='fill'&&a.ref==='source_path').length,existing?0:1);
});
