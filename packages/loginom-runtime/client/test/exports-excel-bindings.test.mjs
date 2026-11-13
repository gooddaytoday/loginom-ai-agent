import test from 'node:test';
import assert from 'node:assert/strict';
import {configureExcelExport,excelExportNext} from '../lib/exports-excel-procedure.mjs';
import {readExcelVariableMapping} from '../lib/exports-excel-node.mjs';

const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]};
const node={document_id:'doc',workflow_id:'wf',node_id:'sink'};
const variable=(name,value,extra={})=>({name,label:name,type:5,value,is_null:false,source:{name},...extra});
const good=[variable('ExcelPath','/test-2/b.xlsx'),variable('SheetName','Февраль')];
const bindings={destination:{variable:'ExcelPath'},sheet_name:{variable:'SheetName'}};
// Each invalid connected layout names the binding it breaks.
const invalid={
 null_value:[variable('ExcelPath','/test-2/b.xlsx'),variable('SheetName','Февраль',{is_null:true})],
 wrong_type:[variable('ExcelPath','/test-2/b.xlsx'),variable('SheetName','Февраль',{type:1})],
 duplicate_name:[variable('ExcelPath','/test-2/b.xlsx'),variable('SheetName','Январь'),variable('SheetName','Февраль')],
 unconnected:[variable('ExcelPath','/test-2/b.xlsx'),variable('SheetName','Февраль',{source:null})],
 missing:[variable('ExcelPath','/test-2/b.xlsx')],
};
const mapping=fields=>({kind:'variables',direction:'input',port:0,fields});

test('Excel configure refuses invalid bound variables before any setting gesture or Next',async()=>{
 for(const [name,fields] of Object.entries(invalid)){
  let gestures=0,closed=0,reads=0;const events=[];
  const values=Object.fromEntries(Object.entries({destination:'/test-2/a.xlsx',sheet_name:'Данные',header:1,file_type:1,number_format:0,decimal_count:2,divide_thousands:false}).map(([key,value])=>[key,{value,tid:key,variable:false}]));
  const channel={observe:async()=>({wizard:{stage:'excel_export'},ui:{elements:[]}}),perform:async()=>{gestures++;throw Error('Unexpected gesture');}};
  const options={operation:{id:'bound',nodeApply:{request:{target:{kind:'new'},mode:'xlsx'}}},variableMapping:mapping(fields),
   execute:async code=>{if(!code.includes('excelExportNext')){reads++;return {verified:true,stage:'excel_export',values:structuredClone(values)};}
    events.push('next');return {status:'SUCCEEDED',cleanup_complete:true,output:{verified:true}};},
   onRecord:async e=>{events.push(e.phase);return e;},receiptOptions:id=>({id}),
   close:async()=>{closed++;return {cleanup_complete:true,draft_discarded:true,settings_applied:false};}};
  const ctx={document_id:'doc',workflow_ref:workflow,node,deadline:Date.now()+5000,finish:'execute'};
  const error=await configureExcelExport(channel,{header:'names',overwrite:'reject',bindings},ctx,options).then(()=>null,e=>e);
  assert.ok(error,name);assert.match(error.message,/sheet_name/,name);
  assert.deepEqual(error.nodePhaseRefusal,{phase:'configure',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,verification:'text_export_unsupported_retained'},name);
  assert.equal(gestures,0,name);assert.equal(closed,1,name);assert.equal(reads,1,name);
  assert.ok(!events.includes('excel_export_next_prepared')&&!events.includes('next'),name);
 }
});

function variableFixture({kind='existing',bindings:requested,links=1,fields=good}={}){
 const calls=[];
 const request={target:{kind,type:'exports.excel'},variable_inputs:kind==='new'?[{kind:'variables',input:0}]:[],parameters:{excel_export:requested?{bindings:requested}:{}}};
 const reply=()=>({verified:true,cleanup_complete:true,independent_readback:true,source_identity_verified:true,mapping:mapping(fields)});
 const channel={mapVariablePort:async m=>{calls.push(['map',m]);return reply();},readVariablePortMapping:async m=>{calls.push(['read',m]);return reply();}};
 const adapter={observe:async()=>{calls.push(['graph']);return {complete:true,document_id:'doc',workflow_ref:workflow,
  variable_links:Array.from({length:links},()=>({source:'calc',output:4,target:'sink',input:0,kind:'variables'}))};}};
 const ctx={document_id:'doc',workflow_ref:workflow,node,deadline:Date.now()+5000};
 return {calls,run:()=>readExcelVariableMapping(channel,adapter,request,ctx,null)};
}

test('existing Excel export without requested bindings reads its variables input without saving it',async()=>{
 const f=variableFixture();const result=await f.run();
 assert.deepEqual(f.calls.map(c=>c[0]),['graph','read']);assert.deepEqual(result,mapping(good));
 const unbound=variableFixture({links:0});assert.equal(await unbound.run(),null);assert.deepEqual(unbound.calls.map(c=>c[0]),['graph']);
 for(const kind of ['new','existing']){
  const bound=variableFixture({kind,bindings});assert.deepEqual(await bound.run(),mapping(good));assert.deepEqual(bound.calls.map(c=>c[0]),['graph','map']);
 }
});

test('invalid Excel bindings refuse right after the variables mapping, before the export wizard',async()=>{
 for(const kind of ['new','existing'])for(const [name,fields] of Object.entries({...invalid,no_link:null})){
  const f=variableFixture({kind,bindings,fields:fields??good,links:fields?1:0});
  const error=await f.run().then(()=>null,e=>e);
  assert.ok(error,kind+' '+name);assert.match(error.message,/sheet_name|destination/,name);
  assert.deepEqual(error.nodePhaseRefusal,{phase:'input_mapping',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,verification:'excel_export_binding_refused'},name);
  assert.deepEqual(f.calls.map(c=>c[0]),fields?['graph','map']:['graph'],name);
 }
});

function bindingPage({before,after,choice='MF;TF-1;WizrdMCF;ExportExcelFilePreviewWizard;edtFileName;VariableControl;boundlist;1'}){
 const clicks=[];let reads=0;
 const page={evaluate:async fn=>fn.toString().includes('location.origin')?true:choice,
  locator:selector=>({count:async()=>1,waitFor:async()=>{},elementHandle:async()=>({evaluate:async()=>true,dispose:async()=>{},
   click:async()=>{clicks.push(JSON.parse(selector.slice(10,-1)));}})})};
 return {page,clicks,readContext:async()=>structuredClone(reads++===0?before:after)};
}
const nativeValues=(destination,sheet)=>({verified:true,stage:'excel_export',values:{
 destination:destination?{value:'/test-2/b.xlsx',variable:true,variable_name:destination}:{value:'/test-2/a.xlsx',variable:false},
 sheet_name:sheet?{value:'Февраль',variable:true,variable_name:sheet}:{value:'Данные',variable:false},header:{value:1,variable:false}}});
const bindingTask=(change_binding,before,fields=good)=>({operation_id:'bind',origin:'https://example.test',deadline:Date.now()+5000,before,variableMapping:mapping(fields),change_binding,
 binding:{node:{node_id:'sink'},workflow_ref:{prefix:'MF;TF-1'}}});
const owner=async()=>({verified:true,surface:'wizard',node_id:'sink'});
const tid='MF;TF-1;WizrdMCF;ExportExcelFilePreviewWizard;edtFileName';

test('Excel Next change_binding switches, picks and reads back only the requested binding',async()=>{
 const before=nativeValues(null,null),p=bindingPage({before,after:nativeValues('ExcelPath',null)});
 const r=await excelExportNext(p.page,bindingTask({key:'destination',variable:'ExcelPath'},before),owner,p.readContext,()=>{},{});
 assert.equal(r.status,'SUCCEEDED');assert.equal(r.cleanup_complete,true);assert.equal(r.output.configuration.values.destination.variable_name,'ExcelPath');
 assert.deepEqual(p.clicks,[tid+';SwitchButton',tid+';VariableControl;trg_picker',tid+';VariableControl;boundlist;1']);
 // Rebinding an already variable-bound field keeps the switch and only picks.
 const bound=nativeValues('Other',null),q=bindingPage({before:bound,after:nativeValues('ExcelPath',null)});
 assert.equal((await excelExportNext(q.page,bindingTask({key:'destination',variable:'ExcelPath'},bound),owner,q.readContext,()=>{},{})).status,'SUCCEEDED');
 assert.deepEqual(q.clicks,[tid+';VariableControl;trg_picker',tid+';VariableControl;boundlist;1']);
 // Returning to a literal only toggles the switch.
 const literal=nativeValues('ExcelPath',null),u=bindingPage({before:literal,after:nativeValues(null,null)});
 assert.equal((await excelExportNext(u.page,bindingTask({key:'destination',variable:null},literal),owner,u.readContext,()=>{},{})).status,'SUCCEEDED');
 assert.deepEqual(u.clicks,[tid+';SwitchButton']);
});

test('Excel Next change_binding refuses invalid variables with no click and never accepts a foreign readback',async()=>{
 const before=nativeValues(null,null);
 for(const [name,fields] of Object.entries(invalid)){
  const p=bindingPage({before,after:before});
  const r=await excelExportNext(p.page,bindingTask({key:'sheet_name',variable:'SheetName'},before,fields),owner,p.readContext,()=>{},{});
  // Duplicate names pass the scope check and stop before the picker choice.
  if(name==='duplicate_name'){assert.equal(r.status,'AMBIGUOUS',name);assert.equal(p.clicks.length,1,name);}
  else{assert.equal(r.status,'NOT_APPLIED',name);assert.equal(r.error.code,'EXPORT_BINDING_SCOPE',name);assert.equal(p.clicks.length,0,name);}
 }
 const scope=bindingPage({before,after:before});
 assert.equal((await excelExportNext(scope.page,bindingTask({key:'header',variable:'SheetName'},before),owner,scope.readContext,()=>{},{})).error.code,'EXPORT_BINDING_SCOPE');
 assert.equal(scope.clicks.length,0);
 for(const after of [nativeValues('Other',null),nativeValues('ExcelPath','SheetName')]){
  const p=bindingPage({before,after});
  const r=await excelExportNext(p.page,bindingTask({key:'destination',variable:'ExcelPath'},before),owner,p.readContext,()=>{},{});
  assert.equal(r.status,'AMBIGUOUS');assert.equal(r.effect_possible,true);assert.equal(r.cleanup_complete,false);
 }
});
