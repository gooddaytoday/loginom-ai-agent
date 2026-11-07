import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExcelExportParameters,validateNativeExcelExport} from '../lib/exports-excel-parameters.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
import {requireExportDestination} from '../lib/storage-policy.mjs';
const request={target:{kind:'new'},inputs:[{}],mappings:[],read:{ports:[]}};
const settings={destination:'/test-2/numeric.xls',sheet_name:'Данные',header:'names',overwrite:'replace',number_format:'numeric',decimal_count:2,divide_thousands:true};
test('XLS numeric style and explicit whole-workbook replace pass production preflight',()=>{
 assert.doesNotThrow(()=>validateExcelExportParameters({excel_export:settings},'xls',request));
 assert.equal(requireExportDestination(settings.destination),settings.destination);
 const modes=createCandidateNodeSupport({}).nodeApplyHandlers.get('exports.excel').modes;
 assert.deepEqual(modes,['xlsx','xls']);assert.deepEqual(NODE_TYPES['exports.excel'].modes,modes);
 assert.ok(nodeApplyInputSchema.properties.mode.enum.includes('xls'));
 for(const change of [{destination:'/test-2/bad.xlsx'},{decimal_count:-1},{decimal_count:31},{decimal_count:1.5},{divide_thousands:'yes'},{number_format:'text'},{overwrite:'append'}])
  assert.throws(()=>validateExcelExportParameters({excel_export:{...settings,...change}},'xls',request));
});
test('retained XLS numeric settings are supported without changing stored precision',()=>{
 const values=Object.fromEntries(Object.entries({destination:settings.destination,sheet_name:'Данные',header:1,file_type:0,number_format:1,decimal_count:2,divide_thousands:true}).map(([k,value])=>[k,{value}]));
 assert.doesNotThrow(()=>validateNativeExcelExport(values,null,'xls'));
 assert.throws(()=>validateNativeExcelExport({...values,file_type:{value:1}},null,'xls'));
 for(const value of [-1,31,1.5])assert.throws(()=>validateNativeExcelExport({...values,decimal_count:{value}},null,'xls'));
});

test('whole-workbook replace answers only the exact destination question once',async()=>{
 const {excelExportNext}=await import('../lib/exports-excel-procedure.mjs');
 for(const exact of [true,false]){
  let question=false,done=false;const gestures=[];
  const node={verified:true,surface:'wizard',node_id:'sink'},before={verified:true,stage:'excel_export',values:{destination:{value:'/test-2/existing.xls'}},node_context:node};
  const page={evaluate:async fn=>fn.toString().includes('location.origin')?true:{present:question,exact},locator:selector=>({count:async()=>1,elementHandle:async()=>({evaluate:async()=>true,dispose:async()=>{},click:async()=>{gestures.push(selector);if(question){question=false;done=true;}else question=true;}})}),waitForTimeout:async()=>{}};
  const task={operation_id:'replace',origin:'https://example.test',deadline:Date.now()+5000,overwrite:'replace',destination:'/test-2/existing.xls',before,binding:{node:{node_id:'sink'},workflow_ref:{prefix:'MF;TF-1'}}};
  const r=await excelExportNext(page,task,async()=>node,async()=>done?{verified:true,stage:'done',node_context:node}:structuredClone(before),()=>{},{});
  assert.equal(r.status,exact?'SUCCEEDED':'AMBIGUOUS');assert.equal(gestures.length,exact?2:1);
  if(exact){assert.match(gestures[1],/msgbox;tlb;yes/);assert.equal(r.output.decision,'replace');}
 }
});

test('Excel numeric decimal field is exposed only as a literal owned text editor',async()=>{
 const {Page}=await import('./support/workspace-ui-fixture.mjs');
 for(const variable of [false,true]){
  const page=new Page(),root='MF;TF-1;WizrdMCF',wizard=page.add('div',root,'',{x:20,y:60,width:700,height:500});
  const tid=root+';ExportExcelFilePreviewWizard;pedDecimalCount';
  const box={x:150,y:200,width:250,height:25},owner=page.add('div',tid+';ValueControl','',box,wizard),input=page.add('input',null,'',box,owner);input.value='2';
  const sw=page.add('div',tid+';SwitchButton','',{x:410,y:200,width:20,height:25},wizard);sw.id='decimal-switch';
  page.add('div',root+';ExportExcelFilePreviewWizard;edtFileName','',{x:150,y:150,width:250,height:25},wizard);
  page.context.Ext={getCmp:id=>id===sw.id?{pressed:variable}:null};
  const s=await page.observe(),fields=s.ui.elements.filter(e=>e.wizard_field?.name==='decimal_count'&&e.allowed_actions.includes('set_wizard_field'));
  assert.equal(fields.length,variable?0:1);
 }
});

test('XLS file artifacts use the same bound download identity as XLSX',async()=>{
 const {makeNativeOutputDownloadCode}=await import('../lib/executor.mjs');
 const name='numeric.xls',directory='/operator/exports',directories={inputs:'/operator/inputs',packages:'/operator/packages',exports:directory};
 const code=makeNativeOutputDownloadCode({output_binding:{execution_id:'execution',node_id:'node',session_id:'session',directory,destination:directory+'/'+name},artifact:{name},file_ref:'ui-file',expected_bytes:5632,storage_directories:directories,
  snapshot:{workflow_ref:{prefix:'MF;TF-1'},file_storage:{directory},ui:{elements:[{ref:'ui-file',allowed_actions:['double_click'],label:name,tid:'MF;TF-1;FileStorageForm;colName_'+name,storage_entry:{bytes:5632}}]}}});
 assert.equal(typeof code,'string');
});

test('independent XLS replacement seeds can use native uploaded-copy verification',async()=>{
 const {makeArtifactDownloadCode}=await import('../lib/executor.mjs');
 const name='existing.xls',artifact={name,upload:{destination:'/operator/exports/'+name}},file_ref='ui-seed';
 assert.equal(typeof makeArtifactDownloadCode({artifact,file_ref,snapshot:{workflow_ref:{prefix:'MF;TF-1'},ui:{elements:[{ref:file_ref,label:name,allowed_actions:['double_click'],tid:'MF;TF-1;FileStorageForm;colName_'+name}]}}}),'string');
});

test('a zero-byte native Excel download cannot be reported as a workbook',async()=>{
 const {validateExcelWorkbookArtifact}=await import('../lib/exports-excel-parameters.mjs');
 assert.throws(()=>validateExcelWorkbookArtifact({bytes:0,destination:'/test-2/empty.xls'}),/empty workbook/);
 const artifact={bytes:5632,destination:'/test-2/book.xls'};
 assert.equal(validateExcelWorkbookArtifact(artifact),artifact);
});
