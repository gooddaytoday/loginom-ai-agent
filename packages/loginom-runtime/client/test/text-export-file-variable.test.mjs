import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {validateTextExportParameters,requireTextExportBindingSource} from '../lib/text-export-parameters.mjs';
import {configureTextExport,exportNext} from '../lib/text-export-procedure.mjs';
import {readTextExportVariableMapping,textExportReadback} from '../lib/text-export-node.mjs';
import {readTextExportBrowser} from '../lib/text-export-context.mjs';
import {EXPORT_FIELDS} from '../lib/text-export-parameters.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';

const directories={inputs:'/u/in',packages:'/u',exports:'/u/out'};
const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const node={document_id:'doc',workflow_id:'wf',node_id:'sink'};
const variable=(name,value,extra={})=>({name,label:name,type:5,value,is_null:false,source:{name},...extra});
const mapping=fields=>({kind:'variables',direction:'input',port:0,fields});
const good=[variable('ReportDate','2026-11-05'),variable('ReportFile','/u/out/report-2026-11-05.csv')];
const request=(extra={})=>({target:{kind:'new',type:'exports.text'},inputs:[{}],variable_inputs:[{kind:'variables',input:0}],mappings:[],read:{ports:[]},finish:'execute',...extra});
const format={encoding:'UTF-8',delimiter:',',header:'names',bom:false,line_ending:'LF',decimal_separator:'.',null_marker:'NULL',text_qualifier:'"'};
// Every negative value of the kit (acceptance/file-variable/expected.json) and
// the path forms the native %Name% substitution or FileStore would reinterpret.
const negative={
 null_value:[variable('ReportFile',null,{is_null:true})],
 empty:[variable('ReportFile','')],
 blank:[variable('ReportFile',' ')],
 integer:[variable('ReportFile',42,{type:1})],
 boolean:[variable('ReportFile',false,{type:0})],
 relative:[variable('ReportFile','relative.csv')],
 dotdot:[variable('ReportFile','/u/out/../escape.csv')],
 sibling:[variable('ReportFile','/u/out-sibling/report.csv')],
 url:[variable('ReportFile','https://example.invalid/a.csv')],
 template:[variable('ReportFile','/u/out/report-%Unknown%.csv')],
 backslash:[variable('ReportFile','/u/out\\report.csv')],
 control:[variable('ReportFile','/u/out/re\nport.csv')],
 inputs_dir:[variable('ReportFile','/u/in/report.csv')],
 not_text:[variable('ReportFile','/u/out/report.xlsx')],
 unconnected:[variable('ReportFile','/u/out/report.csv',{source:null})],
 missing:[variable('ReportDate','2026-11-05')],
 duplicate:[variable('ReportFile','/u/out/a.csv'),variable('ReportFile','/u/out/b.csv')],
};

test('file_name_variable replaces the destination literal only with a variables input',()=>{
 const bound={...format,file_name_variable:{kind:'variable',name:'ReportFile'}};
 validateTextExportParameters(bound,'delimited',request(),directories);
 validateTextExportParameters({file_name_variable:{kind:'variable',name:'ReportFile'}},'delimited',request({target:{kind:'existing',type:'exports.text'},inputs:[],variable_inputs:[]}),directories);
 for(const [name,p,r] of [
  ['literal conflict',{...bound,destination:'/u/out/a.csv'},request()],
  ['no variables input',bound,request({variable_inputs:[]})],
  ['control input',bound,request({variable_inputs:[{kind:'control',input:0}]})],
  ['close',bound,request({finish:'close'})],
  ['replace needs a literal',{...bound,overwrite:'replace'},request()],
  ['kind',{...format,file_name_variable:{kind:'template',name:'ReportFile'}},request()],
  ['extra key',{...format,file_name_variable:{kind:'variable',name:'ReportFile',value:'/u/out/a.csv'}},request()],
  ['caption name',{...format,file_name_variable:{kind:'variable',name:'Report File'}},request()],
 ])assert.throws(()=>validateTextExportParameters(p,'delimited',r,directories),undefined,name);
 assert.throws(()=>validateTextExportParameters(format,'delimited',request(),directories),/destination/);
});

test('bound filename value must be one connected string path inside the export folder',()=>{
 assert.equal(requireTextExportBindingSource('ReportFile',mapping(good),directories),'/u/out/report-2026-11-05.csv');
 for(const [name,fields] of Object.entries(negative))
  assert.throws(()=>requireTextExportBindingSource('ReportFile',mapping(fields),directories),/file_name_variable/,name);
 assert.throws(()=>requireTextExportBindingSource('ReportFile',null,directories),/file_name_variable/);
 assert.throws(()=>requireTextExportBindingSource('ReportFile',{...mapping(good),kind:'control'},directories),/file_name_variable/);
});

function variableFixture({kind='existing',bound=true,links=1,fields=good,complete=true}={}){
 const calls=[];
 const r={target:{kind,type:'exports.text'},variable_inputs:kind==='new'?[{kind:'variables',input:0}]:[],
  parameters:bound?{file_name_variable:{kind:'variable',name:'ReportFile'}}:{}};
 const reply=()=>({verified:true,cleanup_complete:true,independent_readback:true,source_identity_verified:true,mapping:mapping(fields)});
 const channel={mapVariablePort:async m=>{calls.push(['map',m]);return reply();},readVariablePortMapping:async m=>{calls.push(['read',m]);return reply();}};
 const adapter={observe:async()=>{calls.push(['graph']);return {complete,document_id:'doc',workflow_ref:workflow,
  variable_links:Array.from({length:links},()=>({source:'calc',output:0,target:'sink',input:0,kind:'variables'}))};}};
 const ctx={document_id:'doc',workflow_ref:workflow,node,deadline:Date.now()+5000};
 return {calls,run:()=>readTextExportVariableMapping(channel,adapter,r,ctx,directories)};
}

test('existing export reads a retained filename binding read-only and binds only on request',async()=>{
 const retained=variableFixture({bound:false});assert.deepEqual(await retained.run(),mapping(good));
 assert.deepEqual(retained.calls.map(c=>c[0]),['graph','read']);
 const unlinked=variableFixture({bound:false,links:0});assert.equal(await unlinked.run(),null);
 const legacy=variableFixture({bound:false,complete:false});assert.equal(await legacy.run(),null);
 assert.deepEqual(legacy.calls.map(c=>c[0]),['graph']);
 for(const kind of ['new','existing']){
  const f=variableFixture({kind});assert.deepEqual(await f.run(),mapping(good));assert.deepEqual(f.calls.map(c=>c[0]),['graph','map']);
 }
 await assert.rejects(variableFixture({complete:false}).run(),/Complete export variable source graph/);
 await assert.rejects(variableFixture({links:2}).run(),/Unique export variable source/);
});

test('bad bound filename values refuse right after the variables mapping, before the export wizard',async()=>{
 for(const [name,fields] of Object.entries({...negative,no_link:null})){
  const f=variableFixture({kind:'new',fields:fields??good,links:fields?1:0});
  const error=await f.run().then(()=>null,e=>e);
  assert.ok(error,name);assert.match(error.message,/file_name_variable/,name);
  assert.deepEqual(error.nodePhaseRefusal,{phase:'input_mapping',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:false,input_saved:true,verification:'text_export_binding_refused'},name);
 }
});

const paramsValues=bound=>({destination:bound?{value:'/u/out/report-2026-11-05.csv',display:'ReportFile ( /u/out/report-2026-11-05.csv )',tid:'d',variable:true,variable_name:bound}:{value:'/u/out/old.csv',display:'/u/out/old.csv',tid:'d',variable:false},
 text_qualifier:{value:'"',variable:false},decimal_separator:{value:'.',variable:false},date_separator:{value:'',variable:false},time_separator:{value:'',variable:false},
 true_value:{value:'True',variable:false},false_value:{value:'False',variable:false},null_marker:{value:'NULL',variable:false},date_format:{value:'',variable:false},time_format:{value:'',variable:false}});

test('configure refuses a bad bound value before any gesture and discards the draft',async()=>{
 for(const [name,fields] of Object.entries(negative)){
  let gestures=0,closed=0;const events=[];
  const channel={observe:async()=>({wizard:{stage:'text_export_params'},ui:{elements:[]}}),perform:async()=>{gestures++;throw Error('Unexpected gesture');}};
  const options={operation:{id:'bound'},variableMapping:mapping(fields),storageDirectories:directories,targetOrigin:'https://example.test',
   execute:async code=>{if(code.includes('exportNext')){events.push('next');return {status:'SUCCEEDED',cleanup_complete:true,output:{}};}
    return {verified:true,stage:'text_export_params',values:paramsValues(null)};},
   onRecord:async e=>{events.push(e.phase);return e;},receiptOptions:id=>({id}),
   close:async()=>{closed++;return {cleanup_complete:true,draft_discarded:true,settings_applied:false};}};
  const ctx={document_id:'doc',workflow_ref:workflow,node,deadline:Date.now()+5000,finish:'execute',mode:'delimited'};
  const error=await configureTextExport(channel,{file_name_variable:{kind:'variable',name:'ReportFile'}},ctx,options).then(()=>null,e=>e);
  assert.ok(error,name);assert.match(error.message,/file_name_variable/,name);
  assert.equal(error.nodePhaseRefusal.verification,'text_export_unsupported_retained',name);
  assert.equal(gestures,0,name);assert.equal(closed,1,name);assert.ok(!events.includes('next')&&!events.includes('text_export_next_prepared'),name);
 }
});

test('configure binds the filename once, then checks the resolved path with the same reject policy',async()=>{
 let bound=false;const tasks=[];
 const channel={observe:async()=>({wizard:{stage:'text_export_params'},ui:{elements:[]}}),perform:async()=>{tasks.push('perform');throw Error('stop after Next');}};
 const execute=async code=>{
  if(code.includes('exportNext')){
   const binding=code.includes('"change_binding":{"key":"destination","variable":"ReportFile"}');
   tasks.push(binding?'bind':'next:'+code.includes('"destination":"/u/out/report-2026-11-05.csv","overwrite":"reject"'));
   if(binding){bound=true;return {status:'SUCCEEDED',cleanup_complete:true,output:{verified:true}};}
   return {status:'SUCCEEDED',cleanup_complete:true,output:{verified:true,destination:'/u/out/report-2026-11-05.csv',overwrite:'reject',existed:false,decision:null}};
  }
  const next=tasks.some(t=>t.startsWith('next'));
  return {verified:true,stage:next?'text_export_format':'text_export_params',format:'delimited',
   values:next?{delimiter:{value:','},encoding:{value:65001},bom:{value:false},line_ending:{value:0},header:{value:1}}:paramsValues(bound?'ReportFile':null)};
 };
 const options={operation:{id:'bound'},variableMapping:mapping(good),storageDirectories:directories,targetOrigin:'https://example.test',execute,
  onRecord:async e=>e,receiptOptions:id=>({id}),close:async()=>({cleanup_complete:true,draft_discarded:true,settings_applied:false})};
 const ctx={document_id:'doc',workflow_ref:workflow,node,deadline:Date.now()+5000,finish:'execute',mode:'delimited'};
 await assert.rejects(configureTextExport(channel,{file_name_variable:{kind:'variable',name:'ReportFile'}},ctx,options),/stop after Next/);
 assert.deepEqual(tasks,['bind','next:true','perform']);
 // A retained binding with an empty patch is not rebound.
 tasks.length=0;bound=true;
 await assert.rejects(configureTextExport(channel,{},ctx,options),/stop after Next/);
 assert.deepEqual(tasks,['next:true','perform']);
});

function bindingPage({before,after,choice='MF;TF-1;WizrdMCF;ExportTextFileParamsWizard;edtFileName;VariableControl;boundlist;1'}){
 const clicks=[];let reads=0;
 const page={evaluate:async fn=>fn.toString().includes('location.origin')?true:choice,
  locator:selector=>({count:async()=>1,waitFor:async()=>{},elementHandle:async()=>({evaluate:async()=>true,dispose:async()=>{},
   click:async()=>{clicks.push(JSON.parse(selector.slice(10,-1)));}})})};
 return {page,clicks,readContext:async()=>structuredClone(reads++===0?before:after)};
}
const native=bound=>({verified:true,stage:'text_export_params',values:paramsValues(bound)});
const task=(change_binding,before,fields=good)=>({operation_id:'bind',origin:'https://example.test',deadline:Date.now()+5000,before,variableMapping:mapping(fields),change_binding,
 binding:{node:{node_id:'sink'},workflow_ref:{prefix:'MF;TF-1'}}});
const owner=async()=>({verified:true,surface:'wizard',node_id:'sink'});
const tid='MF;TF-1;WizrdMCF;ExportTextFileParamsWizard;edtFileName';

test('Next change_binding switches, picks and reads back only the filename binding',async()=>{
 const before=native(null),p=bindingPage({before,after:native('ReportFile')});
 const r=await exportNext(p.page,task({key:'destination',variable:'ReportFile'},before),owner,p.readContext,()=>{},EXPORT_FIELDS);
 assert.equal(r.status,'SUCCEEDED',JSON.stringify(r));assert.equal(r.output.configuration.values.destination.variable_name,'ReportFile');
 assert.deepEqual(p.clicks,[tid+';SwitchButton',tid+';VariableControl;trg_picker',tid+';VariableControl;boundlist;1']);
 const bound=native('Other'),q=bindingPage({before:bound,after:native('ReportFile')});
 assert.equal((await exportNext(q.page,task({key:'destination',variable:'ReportFile'},bound),owner,q.readContext,()=>{},EXPORT_FIELDS)).status,'SUCCEEDED');
 assert.deepEqual(q.clicks,[tid+';VariableControl;trg_picker',tid+';VariableControl;boundlist;1']);
 const literal=native('ReportFile'),u=bindingPage({before:literal,after:native(null)});
 assert.equal((await exportNext(u.page,task({key:'destination',variable:null},literal),owner,u.readContext,()=>{},EXPORT_FIELDS)).status,'SUCCEEDED');
 assert.deepEqual(u.clicks,[tid+';SwitchButton']);
});

test('Next change_binding refuses unknown variables with no click and never accepts a foreign readback',async()=>{
 const before=native(null);
 for(const fields of [negative.missing,negative.null_value,negative.integer,negative.unconnected]){
  const p=bindingPage({before,after:before});
  const r=await exportNext(p.page,task({key:'destination',variable:'ReportFile'},before,fields),owner,p.readContext,()=>{},EXPORT_FIELDS);
  assert.equal(r.status,'NOT_APPLIED');assert.equal(r.error.code,'EXPORT_BINDING_SCOPE');assert.equal(p.clicks.length,0);
 }
 const scope=bindingPage({before,after:before});
 assert.equal((await exportNext(scope.page,task({key:'null_marker',variable:'ReportFile'},before),owner,scope.readContext,()=>{},EXPORT_FIELDS)).error.code,'EXPORT_BINDING_SCOPE');
 for(const after of [native('Other'),{...native('ReportFile'),values:{...paramsValues('ReportFile'),null_marker:{value:'',variable:false}}}]){
  const p=bindingPage({before,after});
  const r=await exportNext(p.page,task({key:'destination',variable:'ReportFile'},before),owner,p.readContext,()=>{},EXPORT_FIELDS);
  assert.equal(r.status,'AMBIGUOUS');assert.equal(r.effect_possible,true);
 }
});

test('variable-mode filename reads the mapped value, never the hidden literal',()=>{
 const prefix='MF;TF-1',base=prefix+';WizrdMCF;ExportTextFileParamsWizard',elements=new Map(),cmps=new Map();
 const add=(tid,cmp)=>{const e={id:'e'+elements.size,checkVisibility:()=>true};elements.set(tid,e);cmps.set(e.id,{el:{dom:e},...cmp});return e;};
 const root=add(base,{});root.contains=()=>true;
 const rows=[{data:{field1:7,field2:'ReportFile ( /u/out/report-2026-11-05.csv )'}}];
 for(const [key,[card,id]]of Object.entries(EXPORT_FIELDS))if(card==='ExportTextFileParamsWizard'){
  add(base+';'+id+';ValueControl',{getValue:()=>key==='destination'?'/u/out/stale.csv':'x',inputEl:{dom:{value:key==='destination'?'/u/out/stale.csv':'x'}}});
  add(base+';'+id+';SwitchButton',{pressed:key==='destination'});
 }
 add(base+';edtFileName;VariableControl',{getValue:()=>7,getStore:()=>({isLoading:()=>false,getData:()=>({items:rows})})});
 add(base+';edtConnection',{getValue:()=>'Локальное'});
 const saved={document:globalThis.document,Ext:globalThis.Ext};
 globalThis.document={querySelectorAll:selector=>{const tid=JSON.parse(selector.slice(10,-1));return elements.has(tid)?[elements.get(tid)]:[];}};
 globalThis.Ext={getCmp:id=>cmps.get(id)};
 try{
  const ok=readTextExportBrowser({prefix,fields:EXPORT_FIELDS,variableMapping:mapping(good)});
  assert.equal(ok.verified,true,JSON.stringify(ok));
  assert.deepEqual(ok.values.destination,{value:'/u/out/report-2026-11-05.csv',display:'ReportFile ( /u/out/report-2026-11-05.csv )',tid:base+';edtFileName;VariableControl',variable:true,variable_name:'ReportFile'});
  assert.equal(readTextExportBrowser({prefix,fields:EXPORT_FIELDS}).reason,'export_variable_destination');
  assert.equal(readTextExportBrowser({prefix,fields:EXPORT_FIELDS,variableMapping:mapping([variable('ReportFile','/u/out/other.csv')])}).reason,'export_variable_destination');
 }finally{globalThis.document=saved.document;globalThis.Ext=saved.Ext;}
});

test('bound export readback names the variable and validates against the published result schema',()=>{
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema);
 const settings={text_qualifier:'"',decimal_separator:'.',date_separator:'',time_separator:'',true_value:'True',false_value:'False',null_marker:'NULL',date_format:'',time_format:''};
 const formatValues={delimiter:',',encoding:65001,bom:false,line_ending:0,header:1};
 const wrap=o=>Object.fromEntries(Object.entries(o).map(([k,value])=>[k,{value}]));
 const readback=textExportReadback({node,phases:[
  {phase:'input_mapping',receipt_id:'input',value:{source_identity_verified:true,native_mapping:{autosync:true,target_fields:[]}}},
  {phase:'configure',receipt_id:'configure',value:{configuration:{destination:'/u/out/report-2026-11-05.csv',configured:{
   text_export_params:{values:{destination:{value:'/u/out/report-2026-11-05.csv',variable:true,variable_name:'ReportFile'},...wrap(settings)}},
   destination_check:{verified:true,destination:'/u/out/report-2026-11-05.csv',overwrite:'reject',existed:false,decision:null,format_page:{large:true},node_context:{}},
   text_export_format:{format:'delimited',values:wrap(formatValues)}}}}},
  {phase:'finish',receipt_id:'finish',status:'verified'}]});
 assert.deepEqual(readback.file_name_variable,{kind:'variable',name:'ReportFile'});
 assert.deepEqual(readback.destination_check,{destination:'/u/out/report-2026-11-05.csv',overwrite:'reject',existed:false});
 const result={operation_id:'export',status:'SUCCEEDED',effect_possible:true,phases:[],node,execution:{status:'not_requested',execution_id:null},output:{status:'not_refreshed',evidence_ref:null,ports:[]},package_saved:false,cleanup_complete:true,warnings:[],configuration:{status:'applied',readback}};
 const v=validate(result);assert.equal(v.valid,true,v.errorMessage);
});
