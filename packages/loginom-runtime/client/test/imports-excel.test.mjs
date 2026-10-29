import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {validateExcelParameters,excelColumns,excelParametersSchema} from '../lib/imports-excel-parameters.mjs';
import {createExcelImportNodeSupport,excelReadback,excelSchemaSnapshot,verifyExcelFullCount} from '../lib/imports-excel-node.mjs';
import {excelConfigureCapability,makeExcelConfigureCode} from '../lib/imports-excel-procedure.mjs';
import {verifyImportSchema} from '../lib/text-import-node.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {nodeApplyInputSchema,validateNodeApplyEnvelope} from '../lib/node-api.mjs';
import {validateUiAction} from '../lib/workspace-ui.mjs';
import {buildNodeReadRequest,alignReadSchema} from '../lib/node-read-contract.mjs';
const request={inputs:[],mappings:[],finish:'execute',read:{ports:[0]}};
const parameters={source:{artifact_id:'book',upload_operation_id:'upload'},excel:{source_path:'/worker/sales.xlsx',header_rows:1,
 columns:[{name:'Id',label:'Id',type:'integer'},{name:'Region',label:'Region',type:'string'},{name:'Amount',label:'Amount',type:'real'}]}};
test('existing Excel source switch admits only file/sheet and backend scan/save IDs',()=>{
 const p={source:parameters.source,excel:{source_path:'/worker/full.xlsx',sheet_name:'Sales'},source_switch:{profile_id:'profile',save_operation_id:'save'}};
 const r={...request,target:{kind:'existing'}};
 assert.doesNotThrow(()=>validateExcelParameters(p,'xlsx',r));
 for(const change of [v=>v.excel.columns=parameters.excel.columns,v=>v.excel.header_rows=1,v=>v.source_switch.expected_records=500000]){
  const v=structuredClone(p);change(v);assert.throws(()=>validateExcelParameters(v,'xlsx',r));
 }
 assert.throws(()=>validateExcelParameters(p,'xlsx',{...r,target:{kind:'new'}}));
});
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
for(const fault of ['covered','offscreen','disabled','persistent','owner','unknown_fill'])test('Excel waits for the source field hit point before its sole fill: '+fault,async()=>{
 let reads=0,fills=0,tabs=0,waits=0;
 const t={deadline:Date.now()+10000,document_id:'doc',workflow_ref:{prefix:'MF;TF'},node:{node_id:'excel'},excel:parameters.excel,origin:'https://test'};
 const element={getBoundingClientRect:()=>({x:fault==='offscreen'&&reads===1?-200:10,y:10,width:100,height:20}),
  contains:()=>false,closest:()=>fault==='disabled'&&reads===1?{}:null};
 const input={count:async()=>1,inputValue:async()=>'',
  evaluate:async fn=>{reads++;return runInNewContext('('+fn.toString()+')(element)',{element,document:{elementFromPoint:()=>fault==='persistent'||(reads===1&&fault!=='disabled')?null:element}});},
  fill:async()=>{fills++;if(fault==='unknown_fill')throw Error('Lost fill acknowledgement');},
  press:async()=>{tabs++;throw Error('Reached next step');}};
 const page={locator:selector=>selector.startsWith('.x-mask')?{count:async()=>0}:{isVisible:async()=>true,locator:()=>input},
  evaluate:async()=>true,waitForTimeout:async()=>{waits++;if(fault==='persistent')t.deadline=0;}};
 const result=await excelConfigureCapability(page,t,async()=>({verified:fault!=='owner'||waits===0,surface:'wizard',node_id:'excel'}));
 assert.equal(result.verified,false);
 assert.ok(waits>=1,'a failed hit test must wait before dispatch');
 if(['persistent','owner'].includes(fault)){
  assert.equal(fills,0);assert.equal(tabs,0);assert.equal(result.effect_possible,false);assert.equal(result.cleanup_complete,true);
 }else{
  assert.equal(fills,1);assert.equal(tabs,fault==='unknown_fill'?0:1);assert.equal(result.effect_possible,true);assert.equal(result.cleanup_complete,false);
  assert.match(result.error,fault==='unknown_fill'?/Lost fill acknowledgement/:/Reached next step/);
 }
});
function excelReadbackFixture(){
 const node={document_id:'doc',workflow_id:'workflow',node_id:'excel'};
 const owner={...node,verified:true},c={verified:true,node_context:owner,source:{source_path:'/worker/sales.xlsx'},columns:excelColumns(parameters.excel),auto_detect:'Нет'};
 const fields=c.columns.map((f,index)=>({...f,index,record_id:'source-'+index}));
 const mapping={verified:true,inventory_complete:true,source_identity_verified:true,autosync:true,mapping_wizard:'DataSetOutputSocketWizard',
  node_context:{...owner,output_port:{direction:'output',port:0}},source_fields:fields,
  target_fields:fields.map((f,index)=>({...f,record_id:'target-'+index,excluded:false,inherited:false,source:structuredClone(f)}))};
 const values={configure:{configuration:c},node_finish:{settings_applied:true,mode:'done',node_context:owner},
  output_mapping:{native_mapping:mapping,source_identity_verified:true,finish:{verified:true,cleanup_complete:true,settings_applied:true,mode:'done',node_context:owner}},
  finish:{settings_applied:true,mode:'execute',node_context:owner}};
 return {node,operation_id:'op',phases:Object.entries(values).map(([phase,value])=>({phase,status:'verified',receipt_id:'op:'+phase,value:{verified:true,cleanup_complete:true,...value}}))};
}
test('Excel readback requires verified commit and exact node ownership',()=>{
 const value=excelReadbackFixture();
 assert.equal(excelReadback(value).kind,'excel_import');
 const foreign=structuredClone(value);foreign.phases[0].value.configuration.node_context={...foreign.node,node_id:'other'};
 assert.throws(()=>excelReadback(foreign),/owner differs/);
 value.phases[1].value.settings_applied=false;assert.throws(()=>excelReadback(value),/not committed/);
});

test('D61 successful Excel apply retains its actual output mapping for a further read',()=>{
 const value=excelReadbackFixture(),before=structuredClone(value),readback=excelReadback(value);
 const source={parameters:{contract_revision:'1.0.0',target:{type:'imports.excel'},workflow_ref:{workflow_id:'workflow'}},outcome:{status:'SUCCEEDED',cleanup_complete:true,
  output:{node:value.node,cleanup_complete:true,execution:{status:'completed'},phases:value.phases.map(({value,...p})=>p),configuration:{status:'applied',readback},
   output:{ports:[{port:0,schema:excelColumns(parameters.excel).map((f,index)=>({index,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind}))}]}}}};
 for(const preview of [true,false]){
  const s=structuredClone(source);if(!preview)s.outcome.output.output.ports=[];
  const request=buildNodeReadRequest({operation_id:'read-again',source_operation_id:'op',read:{ports:[0],sample_rows:100,require_exact_numbers:true}},s);
  assert.deepEqual(request.parameters.schemas[0].schema,source.outcome.output.output.ports[0].schema);
  assert.equal(request.target.kind,'existing');assert.equal(request.mode,'read_existing_output');
  assert.throws(()=>alignReadSchema(request.parameters.schemas[0].schema.map(f=>({...f,type:'boolean'})),request.parameters.schemas[0].schema),/identity changed/);
 }
 assert.deepEqual(value,before);
});

for(const [fault,mutate] of Object.entries({
 missingMapping:v=>v.phases.splice(2,1),missingFinish:v=>v.phases.pop(),duplicate:v=>v.phases.push(structuredClone(v.phases[2])),
 receipt:v=>v.phases[2].receipt_id='foreign:output_mapping',unverified:v=>v.phases[2].status='pending',
 cleanup:v=>v.phases[2].value.cleanup_complete=false,owner:v=>v.phases[2].value.native_mapping.node_context.node_id='foreign',
 document:v=>v.phases[2].value.native_mapping.node_context.document_id='foreign',workflow:v=>v.phases[2].value.native_mapping.node_context.workflow_id='foreign',
 port:v=>v.phases[2].value.native_mapping.node_context.output_port.port=1,inventory:v=>v.phases[2].value.native_mapping.inventory_complete=false,
 source:v=>v.phases[2].value.native_mapping.target_fields[0].source.record_id='foreign',duplicateSource:v=>v.phases[2].value.native_mapping.target_fields[1].source=structuredClone(v.phases[2].value.native_mapping.source_fields[0]),
 fieldOrder:v=>v.phases[2].value.native_mapping.target_fields.reverse(),fieldType:v=>v.phases[2].value.native_mapping.target_fields[0].type='string',
 excluded:v=>v.phases[2].value.native_mapping.target_fields[0].excluded=true,
 mappingFinish:v=>v.phases[2].value.finish.settings_applied=false,foreignFinish:v=>v.phases[3].value.node_context.node_id='foreign',
}))test('D61 Excel output readback rejects '+fault,()=>{
 const value=excelReadbackFixture();mutate(value);assert.throws(()=>excelReadback(value));
});

for(const expires of [false,true])test('Excel waits for the sheet field after setting the source, preserving earlier effects: '+expires,async()=>{
 let sheetReads=0,sourceFills=0,sheetFills=0,waits=0;
 const t={deadline:Date.now()+10000,document_id:'doc',workflow_ref:{prefix:'MF;TF'},node:{node_id:'excel'},excel:parameters.excel,origin:'https://test'};
 const field=kind=>({count:async()=>1,isVisible:async()=>true,locator:()=>field(kind),
  inputValue:async()=>kind.includes('cbbTableNamingMethod')?'По номеру':sourceFills?parameters.excel.source_path:'',
  evaluate:async fn=>{
   const sheet=kind.includes('cbbTableName;');if(sheet)sheetReads++;
   const element={getBoundingClientRect:()=>({x:10,y:10,width:100,height:20}),contains:()=>false,closest:()=>null};
   return runInNewContext('('+fn.toString()+')(element)',{element,document:{elementFromPoint:()=>sheet&&sheetReads===1?null:element}});
  },fill:async()=>{if(kind.includes('edtFileName'))sourceFills++;else sheetFills++;},
  press:async()=>{if(!kind.includes('edtFileName'))throw Error('Sheet configured');}});
 const page={locator:s=>s.startsWith('.x-mask')?{count:async()=>0}:field(s),evaluate:async()=>true,
  waitForTimeout:async()=>{waits++;if(expires)t.deadline=0;}};
 const result=await excelConfigureCapability(page,t,async()=>({verified:true,surface:'wizard',node_id:'excel'}));
 assert.equal(sourceFills,1);assert.equal(waits,1);assert.equal(sheetFills,expires?0:1);
 assert.equal(result.effect_possible,true);assert.equal(result.cleanup_complete,false);
 assert.match(result.error,expires?/deadline/:/Sheet configured/);
});

test('native type choice auto-commits and closes its editor without another Enter',async()=>{
 const root='MF;TF;WizrdMCF',file=root+';ImportExcelFilePreviewWizard;',defs=root+';ImportExcelColumnDefsWizard;',grid=defs+'ColumnDefsTuning;grdSettings;grd-1';
 let stage=0,editor=false,target=null;const pressed=[];
 const columns=[{name:'Id',label:'Id',type:'Целый',data_kind:'Непрерывный',used:true},{name:'Region',label:'Region',type:'Строковый',data_kind:'Дискретный',used:true},{name:'Amount',label:'Amount',type:'Целый',data_kind:'Непрерывный',used:true}];
 const source={source_path:parameters.excel.source_path,sheet_method:'По номеру',sheet:'1',header_rows:1,whole_sheet:true,blank_rows:'Импортировать'};
 const values=new Map([[file+'edtFileName;ValueControl',source.source_path],[file+'cbbTableNamingMethod;ValueControl','По номеру'],[file+'cbbTableName;ValueContainer;cbx','1'],[file+'cbbActionBlankRow;ValueControl','Импортировать'],[file+'edtTitleRowCount;ValueControl','1'],[defs+'cbbAutoDetectColumnsMode;ValueControl','Нет']]);
 const locator=(tid,visibleEditor=false)=>({
  count:async()=>tid==='masks'?0:visibleEditor?(editor?1:0):1,
  locator:()=>locator(tid,visibleEditor),getByRole:(_,{name})=>locator('option:'+name),
  inputValue:async()=>tid.includes('celleditor')?columns[2].type:values.get(tid),
  fill:async value=>{values.set(tid,value);},press:async key=>{pressed.push(key);if(key==='Enter'&&!editor)throw Error('Native combo editor is already closed');},
  evaluate:async fn=>{if(fn.toString().includes('getBoundingClientRect')){target=tid;return{x:1,y:1};}return true;},
  getAttribute:async()=>grid+';tbl;celleditor;cbx',
  isVisible:async()=>tid===root+';btnError'?false:tid===file+'edtFileName;ValueControl'?stage===0:tid===grid?stage===1:tid.includes('ColumnsMappingEngineOutputPortWizard')?stage===2:tid===root+';DoneWizard'?stage===3:true,
 });
 const page={
  locator:selector=>selector.startsWith('.x-mask')?locator('masks'):selector.startsWith('[data-tid^=')?locator(grid+';tbl;celleditor;cbx',true):locator(JSON.parse(selector.slice('[data-tid='.length,-1))),
  mouse:{click:async()=>{if(target===root+';btnNext')stage++;if(target==='option:Вещественный'){columns[2].type='Вещественный';editor=false;}},dblclick:async()=>{editor=true;}},
  evaluate:async(fn,arg)=>arg?.grid?structuredClone(columns):arg?.file?source:arg?.origin?true:stage,
  waitForTimeout:async()=>{throw Error('Unexpected unready observation');},
 };
 const result=await excelConfigureCapability(page,{deadline:Date.now()+10000,document_id:'doc',workflow_ref:{prefix:'MF;TF'},node:{node_id:'excel'},excel:parameters.excel,origin:'https://test'},async()=>({verified:true,surface:'wizard',node_id:'excel'}));
 assert.equal(result.verified,true,result.error);assert.equal(result.configuration.columns[2].type,'real');assert.equal(pressed.includes('Enter'),false);
});

// Exercise the same browser capability used by the installed Excel driver.
for(const inspect of [false,true])test('Excel source switch never edits/recreates definitions: inspect='+inspect,async()=>{
 const root='MF;TF;WizrdMCF',file=root+';ImportExcelFilePreviewWizard;',defs=root+';ImportExcelColumnDefsWizard;',grid=defs+'ColumnDefsTuning;grdSettings;grd-1';
 let stage=0,target,sourcePath='/worker/sample.xlsx';const edits=[];
 const columns=[{name:'Region',label:'Регион',type:'Строковый',data_kind:'Дискретный',used:true},{name:'Total',label:'Продажи',type:'Вещественный',data_kind:'Непрерывный',used:true}];
 const values=new Map([[file+'cbbTableNamingMethod;ValueControl','По имени'],[file+'cbbTableName;ValueContainer;cbx','Sales'],[file+'cbbActionBlankRow;ValueControl','Импортировать'],[file+'edtTitleRowCount;ValueControl','1'],[defs+'cbbAutoDetectColumnsMode;ValueControl','Нет']]);
 const locator=tid=>({count:async()=>tid==='masks'?0:1,locator:()=>locator(tid),inputValue:async()=>tid===file+'edtFileName;ValueControl'?sourcePath:values.get(tid),
  fill:async value=>{edits.push(tid);assert.equal(tid,file+'edtFileName;ValueControl');sourcePath=value;},press:async()=>{},
  evaluate:async fn=>{if(fn.toString().includes('getBoundingClientRect')){target=tid;return{x:1,y:1};}return true;},
  isVisible:async()=>tid===root+';btnError'?false:tid===file+'edtFileName;ValueControl'?stage===0:tid===grid?stage===1:tid.includes('ColumnsMappingEngineOutputPortWizard')?stage===2:tid===root+';DoneWizard'?stage===3:true,
 });
 const page={locator:s=>s.startsWith('.x-mask')?locator('masks'):locator(JSON.parse(s.slice('[data-tid='.length,-1))),
  mouse:{click:async()=>{assert.equal(target,root+';btnNext');stage++;}},
  evaluate:async(fn,arg)=>arg?.grid?structuredClone(columns):arg?.file?{source_path:sourcePath,sheet_method:'По имени',sheet:'Sales',header_rows:1,whole_sheet:true,blank_rows:'Импортировать'}:arg?.origin?true:stage,
  waitForTimeout:async()=>{throw Error('Unexpected wait');},
 };
 const result=await excelConfigureCapability(page,{deadline:Date.now()+10000,document_id:'doc',workflow_ref:{prefix:'MF;TF'},node:{node_id:'excel'},excel:{source_path:'/worker/full.xlsx'},origin:'https://test',inspect,preserve:!inspect},async()=>({verified:true,surface:'wizard',node_id:'excel'}));
 assert.equal(result.verified,true,result.error);assert.equal(sourcePath,inspect?'/worker/sample.xlsx':'/worker/full.xlsx');
 assert.equal(edits.length,inspect?0:1);assert.equal(result.configuration.columns[1].label,'Продажи');
});

for(const fault of ['name','label','type','data_kind','used','order','field_id','mapping'])test('Excel schema comparison refuses '+fault,()=>{
 const fixture=excelReadbackFixture(),c=fixture.phases[0].value.configuration,m=fixture.phases[2].value.native_mapping;
 const before=excelSchemaSnapshot(c,m),after=structuredClone(before);
 if(fault==='order')after.columns.reverse();
 else if(fault==='mapping')after.mapping.target_fields[0].source.name='foreign';
 else if(fault==='field_id')after.mapping.source_fields[0].field_id='recreated';
 else after.columns[0][fault]=fault==='used'?false:'changed';
 assert.throws(()=>verifyImportSchema(before,after),/LOGINOM_IMPORT_SCHEMA_CHANGED/);
 assert.equal(verifyImportSchema(before,excelSchemaSnapshot(c,m)),true);
});
test('Excel full N uses exact scan and completed port metadata with matching worksheet policy',()=>{
 const source={sha256:'a'.repeat(64),bytes:42},receipt={basis:'backend_exact_scan',profile_id:'p',...source,records:500000,
  identity:{canonical_path:'/local/book.xlsx',size:42,file_id:'inode'},xlsx:{sheet_name:'Sales',sheet_index:2,header_rows:1,blank_rows:'import'}};
 const c={source:{sheet_method:'По имени',sheet:'Sales',header_rows:1,whole_sheet:true,blank_rows:'Импортировать'}};
 const execution={verified:true,owner_verified:true,status:'completed',execution_id:'exec'};
 const output={port:0,row_count:500000,fresh:true,execution_id:'exec',freshness_basis:'completed_execution_port_source'};
 const verify=(r=receipt,o=output)=>verifyExcelFullCount('p',r,source,c,o,execution);
 assert.equal(verify().status,'verified');
 assert.throws(()=>verify(receipt,{...output,row_count:499999}),/LOGINOM_ROW_COUNT_MISMATCH/);
 for(const freshness_basis of ['grid','BufferedStore','group_count'])assert.throws(()=>verify(receipt,{...output,freshness_basis}),/LOGINOM_ROW_COUNT_UNAVAILABLE/);
 for(const patch of [{sheet_name:'Other'},{header_rows:2},{blank_rows:'skip'}])assert.equal(verify({...receipt,xlsx:{...receipt.xlsx,...patch}}).status,'not_verified');
 assert.equal(verifyExcelFullCount('p',null,source,c,output,execution).status,'not_verified');
 assert.equal(verify({...receipt,sha256:'b'.repeat(64)}).status,'not_verified');
 c.source.sheet_method='По номеру';c.source.sheet='2';assert.equal(verify().status,'verified');
});
