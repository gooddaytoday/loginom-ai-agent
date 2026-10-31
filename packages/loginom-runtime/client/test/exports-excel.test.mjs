import test from 'node:test';
import assert from 'node:assert/strict';
import {requireExportDestination} from '../lib/storage-policy.mjs';
import {Page} from './support/workspace-ui-fixture.mjs';
import {validateExcelExportParameters,validateNativeExcelExport} from '../lib/exports-excel-parameters.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
import {createUserWorkflowBindings} from '../lib/user-workflow.mjs';
import {makeNativeOutputDownloadCode} from '../lib/executor.mjs';
import {buildNodeReadRequest} from '../lib/node-read-contract.mjs';
import {excelExportNext,configureExcelExport} from '../lib/exports-excel-procedure.mjs';

const directories={packages:'/operator/packages',inputs:'/operator/inputs',exports:'/operator/exports'};
test('XLSX native exports retain the selected directory and extension guards',()=>{
 for(const extension of ['csv','tsv','xlsx']){
  const destination=directories.exports+'/result.'+extension;
  assert.equal(requireExportDestination(destination,directories),destination);
  assert.equal(requireExportDestination('/test-2/result.'+extension),'/test-2/result.'+extension);
 }
 for(const path of ['/operator/inputs/result.xlsx','/operator/exports-other/result.xlsx','/operator/exports/../result.xlsx',
  '/operator/exports/result.xls','/operator/exports/result.xlsm','/operator/exports/result.exe','/operator/exports/result.xlsx?x'])
  assert.throws(()=>requireExportDestination(path,directories),path);
 for(const path of ['/test-1/result.xlsx','/test-2/../result.xlsx','/test-2/result.xls','/test-2/result.xlsm'])
  assert.throws(()=>requireExportDestination(path),path);
});
test('Excel export registers one input and no table output',()=>{
 const handler=createCandidateNodeSupport({}).nodeApplyHandlers.get('exports.excel');
 assert.equal(handler.fileOutput,true);assert.deepEqual(handler.modes,['xlsx']);
 assert.equal(NODE_TYPES['exports.excel'].palette_group,'Экспорт');
 assert.equal(NODE_TYPES['exports.excel'].tabular_outputs,0);
 assert.ok(nodeApplyInputSchema.properties.target.properties.type.enum.includes('exports.excel'));
});
test('compact Excel request defaults to a file sink without a phantom output 0',()=>{
 const b=createUserWorkflowBindings();b.remember({document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',navigation_path:[]}});
 const r=b.expandNode({document_id:'doc',workflow_ref:{workflow_id:'wf'},target:{type:'exports.excel'},finish:'execute'});
 assert.deepEqual(r.read,{ports:[],sample_rows:0,require_exact_numbers:false});
});
test('native XLSX uses the existing bound download primitive and cannot become a table reread',()=>{
 const name='cells.xlsx',directory=directories.exports;
 const code=makeNativeOutputDownloadCode({output_binding:{execution_id:'execution',node_id:'node',session_id:'session',directory,destination:directory+'/'+name},
  artifact:{name},file_ref:'ui-file',expected_bytes:123,storage_directories:directories,
  snapshot:{workflow_ref:{prefix:'MF;TF-1'},file_storage:{directory},ui:{elements:[{ref:'ui-file',allowed_actions:['double_click'],label:name,tid:'MF;TF-1;FileStorageForm;colName_'+name,storage_entry:{bytes:123}}]}}});
 assert.equal(typeof code,'string');
 assert.throws(()=>buildNodeReadRequest({operation_id:'read',source_operation_id:'export'},{parameters:{target:{type:'exports.excel'}},outcome:{status:'SUCCEEDED',cleanup_complete:true,output:{cleanup_complete:true,execution:{status:'completed'},node:{node_id:'sink'}}}}),/completed local table/);
});
test('Excel Next rejects an existing exact destination with one No and never repeats an unknown click',async()=>{
 for(const fault of [false,true]){
  let clicked=false,question=false;const gestures=[];
  const node={verified:true,surface:'wizard',node_id:'sink'},before={verified:true,stage:'excel_export',values:{destination:{value:'/test-2/cells.xlsx'}},node_context:node};
  const task={operation_id:'excel-next',origin:'https://example.test',deadline:Date.now()+5000,overwrite:'reject',destination:'/test-2/cells.xlsx',before,binding:{node:{node_id:'sink'},workflow_ref:{prefix:'MF;TF-1'}}};
  const page={evaluate:async(fn,arg)=>fn.toString().includes('location.origin')?true:{present:question,exact:question},locator:selector=>({count:async()=>1,elementHandle:async()=>({evaluate:async()=>true,dispose:async()=>{},click:async()=>{
   gestures.push(selector);if(fault)throw Error('unknown click');if(clicked)question=false;else{clicked=true;question=true;}
  }})}),waitForTimeout:async()=>{}};
  const r=await excelExportNext(page,task,async()=>node,async()=>structuredClone(before),()=>{},{});
  assert.equal(gestures.length,fault?1:2);assert.equal(r.status,fault?'AMBIGUOUS':'SUCCEEDED');
  if(!fault){assert.equal(r.output.rejected,true);assert.match(gestures[1],/msgbox;tlb;no/);}
 }
});
test('existing Excel patches reject unsupported retained formats without rewriting them',async()=>{
 let gestures=0,closed=0;
 const values=Object.fromEntries(Object.entries({destination:'/test-2/cells.xlsx',sheet_name:'Данные',header:2,file_type:0,number_format:0,divide_thousands:false}).map(([key,value])=>[key,{value,tid:key}]));
 const native={verified:true,stage:'excel_export',values};
 const channel={observe:async()=>({wizard:{stage:'excel_export'},ui:{elements:[]}}),perform:async()=>{gestures++;throw Error('Unrequested format rewrite');}};
 const options={operation:{id:'existing',nodeApply:{request:{target:{kind:'existing'}}}},execute:async()=>structuredClone(native),onRecord:async e=>e,close:async()=>{closed++;return {cleanup_complete:true,draft_discarded:true,settings_applied:false}}};
 const ctx={document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]},node:{document_id:'doc',workflow_id:'wf',node_id:'sink'},deadline:Date.now()+5000,finish:'execute'};
 await assert.rejects(configureExcelExport(channel,{},ctx,options),/Unsupported retained Excel export format/);
 assert.equal(gestures,0);assert.equal(closed,1);assert.equal(values.file_type.value,0);
});
test('Excel export validates new settings and existing patches before mutation',()=>{
 const p={excel_export:{destination:'/test-2/cells.xlsx',sheet_name:'Данные',header:'labels',overwrite:'reject'}};
 const r={target:{kind:'new'},read:{ports:[]},inputs:[{}],mappings:[]};
 assert.doesNotThrow(()=>validateExcelExportParameters(p,'xlsx',r));
 assert.doesNotThrow(()=>validateExcelExportParameters({},'xlsx',{...r,target:{kind:'existing'},inputs:[]}));
 for(const change of [v=>delete v.excel_export.header,v=>v.excel_export.overwrite='replace',v=>v.excel_export.sheet_name='bad/name',v=>v.excel_export.sheet_name="'edge",v=>v.excel_export.destination='/test-2/cells.csv',v=>v.excel_export.extra=true]){
  const v=structuredClone(p);change(v);assert.throws(()=>validateExcelExportParameters(v,'xlsx',r));
 }
 for(const patch of [{read:{ports:[0]}},{read:{ports:[],sample_rows:1}},{inputs:[]},{mappings:[{}]}])assert.throws(()=>validateExcelExportParameters(p,'xlsx',{...r,...patch}));
 const values=Object.fromEntries(Object.entries({destination:p.excel_export.destination,sheet_name:'Данные',header:2,file_type:1,number_format:0,divide_thousands:false}).map(([k,value])=>[k,{value}]));
 assert.doesNotThrow(()=>validateNativeExcelExport(values));
 for(const [key,value]of Object.entries({file_type:0,number_format:1,divide_thousands:true,header:3}))assert.throws(()=>validateNativeExcelExport({...values,[key]:{value}}));
});
test('Excel wizard exposes only owned literal destination/sheet fields and header options',async()=>{
 for(const variable of [false,true]){
  const page=new Page(),root='MF;TF-1;WizrdMCF',wizard=page.add('div',root,'',{x:20,y:60,width:700,height:500}),switches=new Map();
  for(const [index,[key,value]]of [['edtFileName','/test-2/cells.xlsx'],['edtSheetName','Данные'],['cbbFileType','Excel 2007'],['cbbHeadersRow','Метки полей'],['cbbFloatFormat','Общий']].entries()){
   const box={x:150,y:150+index*50,width:250,height:25},base=root+';ExportExcelFilePreviewWizard;'+key;
   const wrapper=page.add('div',base,'',box,wizard),owner=page.add('div',base+';ValueControl','',box,wrapper),input=page.add('input',null,'',box,owner);input.value=value;
   const sw=page.add('div',base+';SwitchButton','',{x:410,y:box.y,width:20,height:25},wizard);sw.id=key;switches.set(key,{pressed:variable});
  }
  page.context.Ext={getCmp:id=>switches.get(id)};
  const s=await page.observe();assert.equal(s.wizard.stage,'excel_export');
  const fields=s.ui.elements.filter(e=>e.allowed_actions.includes('set_wizard_field'));
  assert.deepEqual(fields.map(e=>e.wizard_field.name).sort(),variable?[]:['destination','sheet_name']);
 }
});
