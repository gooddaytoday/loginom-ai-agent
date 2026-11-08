import test from 'node:test';
import assert from 'node:assert/strict';
import {configureTextImportFields,configureTextImportPatch,reconcileImportColumnPatch,validateTextImportFieldsRequest,validateTextImportPatch,autoDetectLabels} from '../lib/text-import-procedure.mjs';
import {validateTextImportNodeParameters} from '../lib/text-import-node.mjs';
import {textImportStepBudget} from '../lib/text-import-limits.mjs';

const col=(name,type,extra={})=>({name,label:name,type,data_kind:'Дискретный',used:true,...extra});
const native=()=>[col('Id','integer'),col('Amount','real'),col('Active','boolean'),col('EventAt','datetime'),col('Note','string'),col('Extra','integer')];
const source={source_path:'/test/typed.csv',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true};
const format={delimiter:';',text_qualifier:'"',null_marker:'NULL',decimal_separator:'.'};

// Minimal native wizard: «Автоопределение столбцов» combo, rows field and both refresh buttons.
function fixture({existing=true,retained=native().slice(0,5)}={}) {
 const owner={status:'observed',node:{tid:'node'},path:[{tid:'path',label:'Scenario'}]};
 let stage='text_import_file',mode='Нет',rows='25',opened=false,columns=existing?structuredClone(retained):native();
 const gestures=[],initial=structuredClone(columns);
 const field=(value,extra={})=>({status:'observed',truncated:false,value,...extra});
 const state=(offset=0)=>({wizard:{status:'observed',stage,root_tid:'wizard',root_ref:'wizard-ref',owner_context:owner,
  import_source:{fields:Object.fromEntries(Object.entries({source_path:'/test/typed.csv',connection:'Server',encoding:'UTF-8 (65001)',rows_to_skip:'0',first_line_as_title:true}).map(([k,v])=>[k,field(v,{input_ref:k,display_ref:k})]))},
  settings:{fields:{...Object.fromEntries(Object.entries(format).map(([k,v])=>[k,field(v,{input_ref:k})])),
   auto_detect_columns:field(mode,{owner_ref:'auto-owner',input_ref:'auto-input',enabled:true,read_only:true}),
   analysis_rows:field(rows,{owner_ref:'rows-owner',input_ref:'rows-input',enabled:mode!=='Нет',read_only:false})}},
  import_columns:{initial_layout:{status:'rendered_definition_layout'},fields:columns.slice(offset,offset+8).map((c,i)=>({...c,index:i+offset,status:'observed',cell_refs:{}})),
   page:{status:'complete_definition_page',schema_id:columns.map(c=>c.name+c.type).join(','),offset,limit:8,returned:columns.length,total_columns:columns.length,next_offset:null}}},
  ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'wizard;btnPrev',ref:'prev',allowed_actions:['wizard_step']},
   {tid:'wizard;ImportTextFileParamsWizard;ColumnDefsTuning;btnRefreshAll',ref:'refresh-all',allowed_actions:['click']},
   {tid:'wizard;ImportTextFileParamsWizard;ColumnDefsTuning;btnRefreshData',ref:'refresh-data',allowed_actions:['click']},
   {ref:'auto-picker',allowed_actions:['click'],wizard_combo:{kind:'picker',field:{scope:'import_format',name:'auto_detect_columns',owner_ref:'auto-owner',input_ref:'auto-input',root_ref:'wizard-ref'}}},
   ...(opened?Object.values(autoDetectLabels).map(label=>({ref:'option-'+label,allowed_actions:['select_wizard_option'],wizard_combo:{kind:'option',label,field:{scope:'import_format',name:'auto_detect_columns',owner_ref:'auto-owner',input_ref:'auto-input',root_ref:'wizard-ref'}}})):[]),
   {tid:'rows-input',ref:'rows-input',allowed_actions:['set_wizard_field'],wizard_field:{scope:'import_format',name:'analysis_rows',owner_ref:'rows-owner',root_ref:'wizard-ref'}}]}});
 const channel={observe:async options=>{const s=structuredClone(state(options.importColumnPage?.offset??0));if(!options.ready(s))throw Error('Observation refused: '+options.condition);return s;},
  act:async action=>{
   gestures.push(action);
   if(action.verb==='wizard_step'){stage=action.expected_stage;return;}
   if(action.verb==='click'&&action.ref==='auto-picker'){opened=true;return;}
   if(action.verb==='select_wizard_option'){mode=action.ref.slice('option-'.length);opened=false;return;}
   if(action.verb==='set_wizard_field'&&action.ref==='rows-input'){assert.notEqual(mode,'Нет','rows field is disabled without detection');rows=action.text;return;}
   if(action.verb==='click'&&['refresh-all','refresh-data'].includes(action.ref)){
    assert.notEqual(rows,'25','analysis rows must be set before refresh when requested');
    columns=action.ref==='refresh-all'?native():columns.map(c=>({...c,type:native().find(n=>n.name===c.name)?.type??c.type}));return;
   }
   assert.fail('Unexpected gesture '+JSON.stringify(action));
  }};
 channel.perform=async ({initialObservation,resolve})=>channel.act(resolve(initialObservation));
 return {owner,channel,gestures,initial,get mode(){return mode;},get rows(){return rows;}};
}
const brief=cs=>cs.map(({name,type})=>name+':'+type).join(',');

test('auto type settings are validated and stay optional',()=>{
 const base={source,format:{...format}};
 validateTextImportFieldsRequest({...base,columns:[col('Id','integer')]});
 validateTextImportFieldsRequest({source,format:{...format,auto_detect_columns:'all'},analysis:{rows:2,refresh:'all'}});
 validateTextImportFieldsRequest({source,format:{...format,auto_detect_columns:'new'},columns:[col('Amount','string')]});
 validateTextImportPatch({format:{auto_detect_columns:'none'},analysis:{rows:1000000,refresh:'types'}});
 assert.throws(()=>validateTextImportFieldsRequest(base),/Unexpected text import parameters/);
 assert.throws(()=>validateTextImportFieldsRequest({source,format:{...format,auto_detect_columns:'all'},columns:[col('Id','integer')]}),/auto_detect_columns=all/);
 assert.throws(()=>validateTextImportPatch({format:{auto_detect_columns:'all'},columns:[{name:'Amount',type:'string'}]}),/auto_detect_columns=all/);
 for(const bad of [{auto_detect_columns:'Все'},{auto_detect_columns:true}])assert.throws(()=>validateTextImportPatch({format:bad}));
 for(const bad of [{},{rows:0},{rows:1.5},{rows:1000001},{refresh:'rows'},{rows:2,extra:1}])assert.throws(()=>validateTextImportPatch({analysis:bad}),/analysis/);
});

test('new import without columns is admitted only for native type detection',()=>{
 const request={target:{kind:'new'},finish:'done',inputs:[],mappings:[],read:{ports:[]}};
 const p=settings=>({source:{kind:'storage',server_source_ref:'ref'},settings});
 const ok=settings=>validateTextImportNodeParameters(p(settings),'delimited',request);
 ok({source,format:{...format,auto_detect_columns:'all'},analysis:{rows:2,refresh:'all'}});
 ok({source,format:{...format,auto_detect_columns:'new'}});
 assert.throws(()=>ok({source,format:{...format,auto_detect_columns:'none'}}),/settings.columns/);
 assert.throws(()=>ok({source,format}),/settings.columns/);
 assert.equal(textImportStepBudget({target:{kind:'new'},parameters:{settings:{source,format,analysis:{refresh:'all'}}},mappings:[]})>0,true);
});

test('native detection adds new fields while retained manual types win by name',()=>{
 const before=native().slice(0,5).map(c=>c.name==='Amount'?{...c,type:'string'}:c);
 const parsed=native();
 assert.throws(()=>reconcileImportColumnPatch(before,parsed,[],{schemaChangeRequested:true}),/New source field requires explicit/);
 const merged=reconcileImportColumnPatch(before,parsed,[],{schemaChangeRequested:true,acceptNewFields:true});
 assert.equal(brief(merged),'Id:integer,Amount:string,Active:boolean,EventAt:datetime,Note:string,Extra:integer');
});

test('all with analysis selects the mode, sets rows, then refreshes before taking native types',async()=>{
 const f=fixture();
 const result=await configureTextImportPatch(f.channel,{format:{auto_detect_columns:'all'},analysis:{rows:2,refresh:'all'}},f.owner,'/test/typed.csv');
 assert.equal(f.mode,'Все');assert.equal(f.rows,'2');
 const order=f.gestures.map(g=>g.ref);
 assert.deepEqual(order.filter(r=>['auto-picker','option-Все','rows-input','refresh-all'].includes(r)),['auto-picker','option-Все','rows-input','refresh-all']);
 assert.equal(brief(result.columns),brief(native()));
 assert.equal(result.format.fields.auto_detect_columns.value,'Все');
});

test('explicit types refresh in none keeps the structure and takes native types for every field',async()=>{
 const f=fixture();
 f.gestures.length=0;
 const first=f.channel.act;
 const result=await configureTextImportPatch(f.channel,{format:{auto_detect_columns:'new'},analysis:{rows:2,refresh:'types'}},f.owner,'/test/typed.csv');
 assert.equal(f.gestures.filter(g=>g.ref==='refresh-data').length,1);
 assert.equal(f.gestures.filter(g=>g.ref==='refresh-all').length,0);
 assert.equal(brief(result.columns),'Id:integer,Amount:real,Active:boolean,EventAt:datetime,Note:string');
 assert.equal(first,f.channel.act);
});

test('new import takes all fields from the observed native schema without declared columns',async()=>{
 const f=fixture({existing:false});
 const result=await configureTextImportFields(f.channel,{source,format:{...format,auto_detect_columns:'all'},analysis:{rows:2,refresh:'all'}},f.owner);
 assert.equal(brief(result.columns),brief(native()));
 assert.equal(f.gestures.filter(g=>g.ref==='refresh-all').length,1);
 assert.equal(f.mode,'Все');
});

test('a request without detection settings gives no mode, rows or refresh gesture',async()=>{
 const f=fixture();
 await configureTextImportPatch(f.channel,{},f.owner,'/test/typed.csv');
 assert.deepEqual(f.gestures.map(g=>g.verb),['wizard_step']);
 assert.equal(f.mode,'Нет');
});

test('a native output mapping timeout names the observed reason and stays a readiness timeout',async()=>{
 const {readNativeImportMapping}=await import('../lib/text-import-node.mjs');
 const {NodeReadinessTimeout}=await import('../lib/node-procedure.mjs');
 const calls=[];
 const channel={observe:async options=>{
  calls.push(options.condition);
  if(options.condition==='mapping')throw new NodeReadinessTimeout('mapping');
  return {node_mapping:{verified:false,reason:'mapping_source_pending',source_identity_verified:false}};
 }};
 await assert.rejects(readNativeImportMapping(channel,'mapping',()=>false),error=>
  error instanceof NodeReadinessTimeout&&/mapping \(mapping_source_pending, source_identity_verified=false\)/.test(error.message));
 assert.deepEqual(calls,['mapping','mapping state']);
 const ok=await readNativeImportMapping({observe:async()=>({node_mapping:{verified:true}})},'mapping',()=>true);
 assert.equal(ok.node_mapping.verified,true);
 await assert.rejects(readNativeImportMapping({observe:async()=>{throw new Error('transport');}},'mapping',()=>true),/transport/);
});

test('an empty native mapping is deferred to execution only for auto-detect all with configured fields',async()=>{
 const {deferredImportOutput}=await import('../lib/text-import-node.mjs');
 const {textImportConfigurationReadback}=await import('../lib/text-import-readback.mjs');
 const configured=mode=>({format:{fields:{auto_detect_columns:{status:'observed',value:mode}}},columns:[col('Id','integer'),col('Amount','real',{used:false}),col('Note','string')]});
 const empty={verified:true,source_fields:[],target_fields:[]};
 assert.deepEqual(deferredImportOutput(configured('Все'),empty,[]).map(c=>c.name),['Id','Note']);
 assert.equal(deferredImportOutput(configured('Нет'),empty,[]),null);
 assert.equal(deferredImportOutput(configured('Только новые'),empty,[]),null);
 assert.equal(deferredImportOutput(configured('Все'),{...empty,target_fields:[{name:'Old'}]},[]).length,2);
 assert.equal(deferredImportOutput(configured('Все'),{...empty,source_fields:[{name:'A'}]},[]),null);
 assert.equal(deferredImportOutput(configured('Все'),{...empty,verified:false},[]),null);
 assert.throws(()=>deferredImportOutput(configured('Все'),empty,[{direction:'output',port:0}]),/auto_detect_columns=all/);
 const phase=(name,value)=>({phase:name,status:'verified',receipt_id:'op:'+name,value:{verified:true,cleanup_complete:true,...value}});
 const fields=(o)=>({fields:Object.fromEntries(Object.entries(o).map(([k,v])=>[k,{status:'observed',value:v}]))});
 const input={node:{document_id:'d',workflow_id:'w',node_id:'n'},operation_id:'op',phases:[
  phase('configure',{source:fields({source_path:'/a.csv',connection:'Server',encoding:'UTF-8',rows_to_skip:'0',first_line_as_title:true}),
   format:fields({delimiter:';',text_qualifier:'"',null_marker:'',decimal_separator:'.',auto_detect_columns:'Все',analysis_rows:'1000'}),
   columns:[{...col('Id','integer'),status:'observed',index:0},{...col('Note','string'),status:'observed',index:1}]}),
  phase('output_mapping',{source_identity_verified:true,deferred_output:true,native_mapping:{verified:true,source_identity_verified:true,inventory_complete:true,autosync:true,source_fields:[],target_fields:[]}}),
  phase('finish',{settings_applied:true,mode:'execute'})]};
 const readback=textImportConfigurationReadback(input);
 assert.deepEqual(readback.output_mapping.fields,[]);
 input.phases[1].value.native_mapping.target_fields=[{name:'Old',source:null}];
 assert.deepEqual(textImportConfigurationReadback(input).output_mapping.fields,[]);
 input.phases[1].value.deferred_output=false;
 assert.throws(()=>textImportConfigurationReadback(input));
});
