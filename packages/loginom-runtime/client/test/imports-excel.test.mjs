import test from 'node:test';
import assert from 'node:assert/strict';
import {validateExcelParameters,excelColumns,excelParametersSchema} from '../lib/imports-excel-parameters.mjs';
import {createExcelImportNodeSupport,excelReadback} from '../lib/imports-excel-node.mjs';
import {excelConfigureCapability,makeExcelConfigureCode} from '../lib/imports-excel-procedure.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {nodeApplyInputSchema,validateNodeApplyEnvelope} from '../lib/node-api.mjs';
import {validateUiAction} from '../lib/workspace-ui.mjs';
const request={inputs:[],mappings:[],finish:'execute',read:{ports:[0]}};
const parameters={source:{artifact_id:'book',upload_operation_id:'upload'},excel:{source_path:'/worker/sales.xlsx',header_rows:1,
 columns:[{name:'Id',label:'Id',type:'integer'},{name:'Region',label:'Region',type:'string'},{name:'Amount',label:'Amount',type:'real'}]}};
test('Excel contract and compact request schema register a zero-input XLSX import additively',()=>{
 const handlers=createCandidateNodeSupport({}).nodeApplyHandlers;
 assert.ok(handlers.has('imports.excel'));assert.ok(handlers.has('imports.text'));
 assert.equal(NODE_TYPES['imports.excel'].palette_group,'Импорт');assert.equal(NODE_TYPES['imports.excel'].tabular_inputs,0);
 assert.match(NODE_TYPES['imports.excel'].semantics,/XLSX/);
 assert.equal(handlers.get('imports.excel').parameter_schema,excelParametersSchema);
 assert.ok(nodeApplyInputSchema.properties.target.properties.type.enum.includes('imports.excel'));
 assert.ok(nodeApplyInputSchema.properties.parameters.properties.excel.properties.source_path.description.includes('verified'));
 validateExcelParameters(parameters,'xlsx',request);
 assert.deepEqual(excelColumns(parameters.excel).map(c=>c.data_kind),['Непрерывный','Дискретный','Непрерывный']);
 for(const stage of ['excel_import_file','excel_import_columns'])assert.doesNotThrow(()=>validateUiAction({verb:'wizard_step',ref:'ui-next',expected_stage:stage}));
});
test('Excel rejects unsupported types, missing explicit columns, alternate formats and invalid paths before mutation',()=>{
 for(const patch of [{columns:[]},{source_path:'/worker/sales.xls'},{source_path:'/worker/../sales.xlsx'},{auto_detect:true},{named_range:'Range'},{header_rows:0},{columns:[{name:'X',label:'X',type:'boolean'}]},{columns:[{name:'X',label:'X',type:'string',data_kind:'Непрерывный'}]}])
  assert.throws(()=>validateExcelParameters({...parameters,excel:{...parameters.excel,...patch}},'xlsx',request),/Excel import:/);
 assert.throws(()=>validateExcelParameters(parameters,'delimited',request),/mode xlsx/);
 assert.throws(()=>validateExcelParameters(parameters,'xlsx',{...request,inputs:[{input:0}]}),/no table input/);
 assert.throws(()=>validateExcelParameters(parameters,'xlsx',{...request,mappings:[{direction:'output',port:0}]}),/remapping/);
 validateExcelParameters({...parameters,excel:{...parameters.excel,sheet_name:'Sales',columns:[{name:'When',label:'When',type:'datetime'}]}},'xlsx',request);
});
test('Excel reuses byte-verified delivery and rejects a different source destination',async()=>{
 const sha='a'.repeat(64),proof={status:'SUCCEEDED',bytes_verified:true,upload_completion_verified:true,verification_id:'verify',destination:'/worker/sales.xlsx',bytes:42,sha256:sha};
 const upload={operation_id:'upload',artifact:{artifact_id:'book',bytes:42,sha256:sha},outcome:{status:'SUCCEEDED',cleanup_complete:true,operation_id:'upload',action_key:'artifact.upload',output:{artifact_id:'book',destination:proof.destination,bytes:42,sha256:sha,server_copy_verification:proof}}};
 const support=createExcelImportNodeSupport({}),drivers=support.nodeApplyDriverFactory({operation:{parameters:{target:{type:'imports.excel'}}},verifiedUploads:()=>[upload]});
 assert.equal((await drivers.verifySource(parameters)).source.sha256,sha);
 await assert.rejects(()=>drivers.verifySource({...parameters,excel:{...parameters.excel,source_path:'/worker/other.xlsx'}}),/destination/);
 upload.outcome.output.server_copy_verification.bytes_verified=false;
 await assert.rejects(()=>drivers.verifySource(parameters),/digest|destination/);
});
test('Excel wizard refuses a foreign prepared owner without a gesture',async()=>{
 const t={deadline:Date.now()+10000,document_id:'doc',workflow_ref:{prefix:'MF;TF'},node:{node_id:'node'}};
 const result=await excelConfigureCapability({locator:()=>({})},t,async()=>({verified:false,reason:'node_guid'}));
 assert.equal(result.verified,false);assert.equal(result.effect_possible,false);assert.equal(result.cleanup_complete,true);
 assert.match(result.error,/owned wizard/);assert.doesNotThrow(()=>new Function('return '+makeExcelConfigureCode(t)));
});
test('Excel readback requires verified commit and exact node ownership',()=>{
 const node={document_id:'doc',workflow_id:'workflow',node_id:'excel'};
 const c={verified:true,node_context:node,source:{source_path:'/worker/sales.xlsx'},columns:excelColumns(parameters.excel),auto_detect:'Нет'};
 const value={node,operation_id:'op',phases:[{phase:'configure',status:'verified',receipt_id:'op:configure',value:{configuration:c}},
  {phase:'node_finish',status:'verified',receipt_id:'op:node_finish',value:{settings_applied:true,mode:'done',node_context:node}}]};
 assert.equal(excelReadback(value).kind,'excel_import');
 const foreign=structuredClone(value);foreign.phases[0].value.configuration.node_context={...foreign.node,node_id:'other'};
 assert.throws(()=>excelReadback(foreign),/owner differs/);
 value.phases[1].value.settings_applied=false;assert.throws(()=>excelReadback(value),/not committed/);
});
