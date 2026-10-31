import test from 'node:test';
import assert from 'node:assert/strict';
import {requireExportDestination} from '../lib/storage-policy.mjs';
import {Page} from './support/workspace-ui-fixture.mjs';
import {validateExcelExportParameters,validateNativeExcelExport} from '../lib/exports-excel-parameters.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
import {createUserWorkflowBindings} from '../lib/user-workflow.mjs';

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
