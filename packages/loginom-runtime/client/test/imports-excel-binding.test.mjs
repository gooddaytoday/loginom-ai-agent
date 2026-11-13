import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVariableBindings} from '../lib/variable-binding-parameters.mjs';
import {validateExcelParameters} from '../lib/imports-excel-parameters.mjs';
import {excelConfigureCapability} from '../lib/imports-excel-procedure.mjs';
import {isUnchangedTextImportExecution} from '../lib/node-read-contract.mjs';
import {isUnchangedExcelImportExecution} from '../lib/imports-excel-parameters.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';

const binding={parameter:'/excel/source_path',variable:{kind:'variables',input:0,name:'ExcelPath'}};
const excel={sheet_name:'Data',header_rows:1,columns:[{name:'Id',label:'Id',type:'integer'},{name:'Amount',label:'Amount',type:'integer'}]};
const p={source:{kind:'storage',server_source_ref:'ref'},excel};
const request={target:{kind:'new',type:'imports.excel'},inputs:[],mappings:[],finish:'execute',read:{ports:[0]},
 variable_inputs:[{kind:'variables',input:0,output:4,source:{node_id:'vars'}}],bindings:[binding]};

test('Excel registers only its workbook path on variables input zero',()=>{
 assert.doesNotThrow(()=>validateVariableBindings([binding],'imports.excel'));
 for(const [b,type] of [[binding,'imports.text'],[{...binding,parameter:'/settings/source/source_path'},'imports.excel'],[{...binding,parameter:'/excel/sheet_name'},'imports.excel'],
  [{...binding,variable:{...binding.variable,kind:'control'}},'imports.excel']])assert.throws(()=>validateVariableBindings([b],type),/BINDING_/);
 const handler=createCandidateNodeSupport({}).nodeApplyHandlers.get('imports.excel');
 assert.deepEqual(handler.binding_schema.items.properties.parameter,{const:'/excel/source_path'});
 assert.equal(handler.binding_schema.maxItems,1);
});
test('a bound workbook replaces the literal path, keeps explicit columns and refuses ambiguity before mutation',()=>{
 assert.doesNotThrow(()=>validateExcelParameters(p,'xlsx',request));
 assert.doesNotThrow(()=>validateExcelParameters(p,'xlsx',{...request,target:{kind:'existing',type:'imports.excel'},variable_inputs:[]}));
 assert.throws(()=>validateExcelParameters(p,'xlsx',{...request,bindings:[]}),/XLSX storage path/);
 assert.throws(()=>validateExcelParameters({...p,excel:{...excel,source_path:'/own/inputs/a.xlsx'}},'xlsx',request),/BINDING_CONFLICT/);
 assert.throws(()=>validateExcelParameters(p,'xlsx',{...request,variable_inputs:[]}),/BINDING_PORT_MISMATCH/);
 assert.throws(()=>validateExcelParameters(p,'xlsx',{...request,finish:'close'}),/BINDING_PARAMETER_UNSUPPORTED/);
 assert.throws(()=>validateExcelParameters({...p,source:{kind:'verified_delivery',artifact_id:'a',upload_operation_id:'u'}},'xlsx',request),/dock_storage_source/);
 assert.throws(()=>validateExcelParameters(p,'xlsx',{...request,variable_inputs:[{kind:'control',input:0,output:0,source:{node_id:'vars'}}]}),/variables input 0/);
 assert.throws(()=>validateExcelParameters({...p,excel:{...excel,columns:[]}},'xlsx',request),/columns/);
});
test('SAME Excel node re-executes unchanged with excel:{} and no reconfiguration',()=>{
 const r={target:{kind:'existing',type:'imports.excel',ref:{node_id:'excel'}},mode:'xlsx',parameters:{excel:{}},inputs:[],mappings:[],variable_inputs:[],finish:'execute',read:{ports:[0]}};
 for(const bindings of [undefined,[]])assert.equal(isUnchangedExcelImportExecution({...r,bindings}),true);assert.equal(isUnchangedTextImportExecution(r),false);
 for(const patch of [{bindings:[binding]},{parameters:{excel:{header_rows:1}}},{parameters:{excel:{},source:p.source}},{mode:'delimited'},{finish:'done'},{target:{kind:'new',type:'imports.excel'}}])
  assert.equal(isUnchangedExcelImportExecution({...r,...patch}),false);
 assert.doesNotThrow(()=>validateExcelParameters(r.parameters,r.mode,r));
 // LAB-1446 run A: source beside the empty patch got a misleading path refusal.
 const extra={...r,parameters:{excel:{},source:p.source}};
 assert.throws(()=>validateExcelParameters(extra.parameters,extra.mode,extra),/exactly \{excel:\{\}\} \(no source\)/);
});

function wizard({initial=null,observed,literalHidden=false}={}){
 const root='MF;TF;WizrdMCF',file=root+';ImportExcelFilePreviewWizard;',defs=root+';ImportExcelColumnDefsWizard;',grid=defs+'ColumnDefsTuning;grdSettings;grd-1';
 const value='/own/inputs/a.xlsx',option=file+'edtFileName;VariableControl;boundlist;row-7';
 let stage=0,target,caption=initial;const clicks=[],fills=[];
 const values=new Map([[file+'cbbTableNamingMethod;ValueControl','По имени'],[file+'cbbTableName;ValueContainer;cbx','Data'],[file+'cbbActionBlankRow;ValueControl','Импортировать'],
  [file+'edtTitleRowCount;ValueControl','1'],[defs+'cbbAutoDetectColumnsMode;ValueControl','Нет']]);
 const columns=['Id','Amount'].map(name=>({name,label:name,type:'Целый',data_kind:'Непрерывный',used:true}));
 const locator=tid=>({count:async()=>tid==='masks'?0:1,locator:()=>locator(tid),inputValue:async()=>values.get(tid)??'',
  fill:async v=>{fills.push(tid);values.set(tid,String(v));},press:async()=>{},
  evaluate:async fn=>{if(fn.toString().includes('getBoundingClientRect')){target=tid;return{x:1,y:1};}return true;},
  isVisible:async()=>tid===root+';btnError'?false:tid===file+'edtFileName;ValueControl'?stage===0&&!literalHidden:tid===file+'edtFileName;VariableControl'?stage===0&&caption!==null:tid===grid?stage===1:tid.includes('ColumnsMappingEngineOutputPortWizard')?stage===2:tid===root+';DoneWizard'?stage===3:true});
 const source=()=>({source_path:caption?.slice('ExcelPath ( '.length,-2)??'',binding_field:{status:'observed',variable_mode:true,variable_caption:observed??caption,row_id:'7',value,value_length_utf16:value.length,truncated:false},
  sheet_method:'По имени',sheet:values.get(file+'cbbTableName;ValueContainer;cbx'),header_rows:Number(values.get(file+'edtTitleRowCount;ValueControl')),whole_sheet:true,blank_rows:'Импортировать'});
 const page={locator:s=>s.startsWith('.x-mask')?locator('masks'):locator(JSON.parse(s.slice('[data-tid='.length,-1))),
  mouse:{click:async()=>{clicks.push(target);if(target===root+';btnNext')stage++;if(target===file+'edtFileName;SwitchButton')caption='';if(target===option)caption='ExcelPath ( '+value+' )';}},
  evaluate:async(fn,arg)=>arg?.grid?structuredClone(columns):arg?.label?(arg.label==='ExcelPath'?option:null):arg?.name?caption:arg?.file?source():arg?.origin?true:stage,
  waitForTimeout:async()=>{throw Error('Unexpected wait');}};
 const t={deadline:Date.now()+10000,document_id:'doc',workflow_ref:{prefix:'MF;TF'},node:{document_id:'doc',workflow_id:'wf',node_id:'excel'},
  excel:{...excel,source_path:value},binding:{label:'ExcelPath',value},origin:'https://test'};
 return {page,t,clicks,fills,file,value,run:()=>excelConfigureCapability(page,t,async()=>({verified:true,surface:'wizard',node_id:'excel'}))};
}
test('Excel W1 switches the filename to the mapped variable without a literal path fill',async()=>{
 const w=wizard(),result=await w.run();
 assert.equal(result.verified,true,result.error);
 assert.deepEqual(w.clicks.slice(0,3),[w.file+'edtFileName;SwitchButton',w.file+'edtFileName;VariableControl;trg_picker',w.file+'edtFileName;VariableControl;boundlist;row-7']);
 assert.ok(!w.fills.includes(w.file+'edtFileName;ValueControl'));
 assert.equal(result.configuration.source.source_path,w.value);
 assert.equal(result.configuration.source.binding_field.variable_caption,'ExcelPath ( '+w.value+' )');
});
test('a saved bound W1 with the literal path hidden is ready through its variable control',async()=>{
 const w=wizard({initial:'ExcelPath ( /own/inputs/a.xlsx )',literalHidden:true});
 w.page.waitForTimeout=async()=>{w.t.deadline=0;};
 const result=await w.run();assert.equal(result.verified,true,result.error);assert.ok(!w.clicks.some(c=>c.includes('edtFileName')));
});
test('an already selected variable is retained; a different observed selection refuses before Next',async()=>{
 const kept=wizard({initial:'ExcelPath ( /own/inputs/a.xlsx )'}),ok=await kept.run();
 assert.equal(ok.verified,true,ok.error);assert.ok(!kept.clicks.some(c=>c.includes('edtFileName')));
 const other=wizard({initial:'ExcelPath ( /own/inputs/a.xlsx )',observed:'Other ( /own/inputs/b.xlsx )'}),refused=await other.run();
 assert.equal(refused.verified,false);assert.match(refused.error,/BINDING_SOURCE_UNVERIFIED/);
 assert.ok(!other.clicks.some(c=>c.endsWith(';btnNext')));
});

function savedExcel(kind='bound'){
 const node={document_id:'doc',workflow_id:'wf',node_id:'excel'},source={...node,node_id:'vars'},path='/own/inputs/b.xlsx';
 const workflow={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'flow',label:'Scenario'}]};
 const r={document_id:'doc',workflow_ref:workflow,target:{kind:'existing',type:'imports.excel',ref:node},mode:'xlsx',
  parameters:{excel:{}},bindings:[],inputs:[],variable_inputs:[],mappings:[],finish:'execute',read:{ports:[0]}};
 const operation={id:'saved',action:{action_key:'node.apply',revision:'1'},parameters:r};
 const graph={complete:true,document_id:'doc',workflow_ref:workflow,nodes:[{ref:source,type:'variables.user',variable_outputs:[{kind:'variables',port:4,port_guid:'source-port'}]}],
  variable_links:kind==='no-variables'?[]:[{source:'vars',target:'excel',kind:'variables',input:0,output:4,target_port_guid:'input'}]};
 const mapping={kind:'variables',port:0,port_guid:'input',fields:[{name:'ExcelPath',label:'ExcelPath',id:7,type:5,source:{name:'ExcelPath',id:7,type:5}}]};
 const variables=[{id:7,name:'ExcelPath',type:'string',cell:{type:'string',is_null:false,value:path}}];
 const field=kind==='literal'?{status:'observed',variable_mode:false}:{status:'observed',variable_mode:true,variable_caption:'ExcelPath ( '+path+' )',value:path,truncated:false,row_id:'7'};
 const actions=[];let opened=false,pending,witnesses=0;
 const state=()=>({origin:'https://app.loginom.ai',loginom_build:'7.4.2',workflow_ref:workflow,scan:{complete:true},dom_epoch:{document:'dom',revision:1},
  prepared_node_context:{...node,verified:true,tid:'N',surface:opened?'wizard':'graph',locked:false},
  wizard:opened?{status:'observed',stage:'excel_import_file',root_ref:'ui-W',root_tid:'W',owner_context:{status:'observed',node:{tid:'flow>Excel',label:'Excel'},
   path:[...workflow.navigation_path,{tid:'node',label:'Excel'},{tid:'settings',label:'Settings'}]}}:{status:'absent'},
  ui:{dialogs:[],masks:[],truncated:{masks:false,dialogs:false},elements:opened?[{ref:'ui-cancel',tid:'W;btnClose',allowed_actions:['click']}]:[
   {ref:'ui-settings',tid:'N;Setting',allowed_actions:['begin_wizard'],wizard_open:{node:{node_label:'Excel'},workflow_path:workflow.navigation_path}}]}});
 operation.nodeTargetAdapter={observe:async()=>structuredClone(graph)};
 const options={operation,now:Date.now,receiptOptions:()=>({}),isBoundFileInput:p=>p.startsWith('/own/inputs/'),
  resolveBoundFileSource:async p=>{witnesses++;return {kind:'storage',verified:true,destination:p};},
  onRecord:async event=>{if(event.phase==='node_step_prepared')pending=event;return structuredClone(event);},
  execute:async()=>{
   if(!pending)return {status:'SUCCEEDED',output:state()};
   const step=pending;pending=null;const action=step.action;actions.push(action.verb);
   const reply=(key,output)=>({status:'SUCCEEDED',operation_id:step.internal_operation_id,action_key:key,cleanup_complete:true,effect_possible:false,output});
   if(action.verb==='excel_source_read'){assert.equal(opened,true);
    return reply('node.crosstable.excel_source_read.internal',{verified:true,cleanup_complete:true,effect_possible:false,status:'SUCCEEDED',node_context:node,configuration:{node_context:node,source:{...(field.variable_mode?{binding_field:field}:{})}}});}
   if(action.verb.startsWith('user_')||action.verb==='variable_mapping_read')return reply('node.variables.'+action.verb+'.internal',{verified:true,cleanup_complete:true,effect_possible:false,independent_readback:true,
    node_context:action.verb==='variable_mapping_read'?node:source,...(action.verb==='variable_mapping_read'?{mapping}:{source_active:true,variables:structuredClone(variables)})});
   if(action.verb==='begin_wizard')opened=true;else if(action.verb==='click'&&action.ref==='ui-cancel')opened=false;else assert.fail('Unexpected mutation '+JSON.stringify(action));
   return {status:'SUCCEEDED',operation_id:step.internal_operation_id,action_key:'ui.act',cleanup_complete:true,effect_possible:true,error:null,trace:[]};
  }};
 const ctx={document_id:'doc',workflow_ref:workflow,node,deadline:Date.now()+60000};
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 return {operation,actions,ctx,path,driver:()=>support.nodeApplyDriverFactory(options),witnesses:()=>witnesses};
}
test('saved bound Excel re-execution proves the current file and reports its binding before Execute',async()=>{
 const f=savedExcel(),driver=f.driver();
 assert.equal(typeof driver.beforeTarget,'function');
 await driver.beforeTarget(f.ctx);
 assert.equal(f.witnesses(),1);assert.ok(f.actions.includes('excel_source_read'));
 const [b]=f.operation.importBindingInventory;
 assert.equal(b.parameter,'/excel/source_path');assert.equal(b.mode,'variable');assert.equal(b.variable.name,'ExcelPath');
 assert.equal(b.source.type,'variables.user');assert.equal(b.source.output,4);assert.equal(b.verified,true);
});
for(const kind of ['no-variables','literal'])test('saved '+kind+' Excel keeps plain Execute without a file witness',async()=>{
 const f=savedExcel(kind);await f.driver().beforeTarget(f.ctx);
 assert.equal(f.witnesses(),0);assert.equal(f.operation.importBindingInventory,undefined);
 if(kind==='no-variables')assert.deepEqual(f.actions,[]);
});

test('bound and unchanged Excel requests pass the public schema and node.apply validation',async()=>{
 const {nodeApplyInputSchema}=await import('../lib/node-api.mjs'),{validateActionParameters}=await import('../lib/action-catalog.mjs'),{validateNodeApplyRequest}=await import('../lib/node-apply.mjs');
 const handlers=createCandidateNodeSupport({}).nodeApplyHandlers,ref={document_id:'doc',workflow_id:'flow',node_id:'excel'};
 const base={operation_id:'excel',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},
  inputs:[],mode:'xlsx',mappings:[],finish:'execute',read:{ports:[0],sample_rows:10,require_exact_numbers:true},budgets:{configure_ms:300000,execute_ms:300000,total_ms:300000}};
 const bound={...base,target:{kind:'new',type:'imports.excel'},parameters:p,bindings:[binding],
  variable_inputs:[{kind:'variables',input:0,output:4,source:{document_id:'doc',workflow_id:'flow',node_id:'vars'}}]};
 const unchanged={...base,target:{kind:'existing',type:'imports.excel',ref},parameters:{excel:{}},bindings:[]};
 for(const r of [bound,unchanged]){
  assert.doesNotThrow(()=>validateActionParameters(nodeApplyInputSchema,r));
  const {handler}=validateNodeApplyRequest(r,handlers);assert.equal(handler.unchangedExecution(r),r===unchanged);
 }
});
