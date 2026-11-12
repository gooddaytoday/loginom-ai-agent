import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

for(const button of ['available','missing'])test('server preview reads native format recognition before returning: '+button,()=>{
 const result=spawnSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',`
import assert from 'node:assert/strict';
import {mock} from 'node:test';
const lib=${JSON.stringify(new URL('../lib/',import.meta.url).href)},href=name=>new URL(name,lib).href;
const real=async name=>({...await import(href(name)+'?native-preview-real')});
const owner={status:'observed',node:{tid:'N'},path:[{tid:'wf',label:'Scenario'}]};
const path='/test/source.csv',button=process.argv[1],actions=[];
let stage='graph',detected=false,header=false;
const field=value=>({status:'observed',truncated:false,value,input_ref:'input',display_ref:'display',owner_ref:'owner'});
const state=options=>{
 const columns=(detected?[['Id','integer'],['EventAt','datetime']]:[['Id_EventAt','string']])
  .map(([name,type],index)=>({index,name,label:name,type,data_kind:'Дискретный',used:true,status:'observed',cell_refs:{}}));
 return {dom_epoch:{document:'doc',revision:detected?2:1},
  prepared_node_context:{verified:true,surface:stage==='graph'?'graph':'wizard',tid:'N'},
  wizard:stage==='graph'?{status:'absent'}:{status:'observed',stage,root_tid:'W',root_ref:'W',owner_context:owner,
   import_source:{fields:Object.fromEntries(Object.entries({source_path:path,connection:'Local',encoding:'UTF-8 (65001)',
    rows_to_skip:'0',first_line_as_title:header}).map(([k,v])=>[k,field(v)]))},
   settings:{fields:Object.fromEntries(Object.entries({delimiter:detected?'Точка с запятой':'Запятая',text_qualifier:'"',
    null_marker:'?',decimal_separator:detected?'Запятая (,)':'Точка (.)',date_format:detected?'dd/mm/yyyy':'Не задано (dd/mm/yyyy)',
    date_separator:'Точка (.)',auto_detect_columns:'Нет',analysis_rows:'25'}).map(([k,v])=>[k,field(v)]))},
   import_columns:{...(options?.importColumnPage?{initial_layout:{status:'rendered_definition_layout'}}:{}),fields:columns,
    page:{status:'complete_definition_page',schema_id:detected?'native':'defaults',offset:0,limit:8,returned:columns.length,total_columns:columns.length,next_offset:null}}},
  ui:{elements:[{tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'W;btnPrev',ref:'prev',allowed_actions:['wizard_step']},
   ...(button==='available'?[{tid:'W;ImportTextFileParamsWizard;btnSuggestFormat',ref:'detect',allowed_actions:['click']}]:[])]}};
};
const channel={observe:async options=>{const s=state(options);assert.ok(options.ready(s),options.condition);return s;},
 perform:async options=>{
  const s=state();assert.ok(options.ready(s),options.condition);
  const action=options.resolve(s);actions.push(action);
  if(action.verb==='wizard_step'){stage=action.expected_stage;return;}
  assert.equal(action.verb,'click');assert.equal(action.ref,'detect');
  detected=true;header=true;
 },act:async()=>assert.fail('unexpected direct mutation')};
mock.module(href('node-procedure.mjs'),{exports:{...await real('node-procedure.mjs'),createNodeProcedure:()=>channel}});
mock.module(href('node-graph-selection.mjs'),{exports:{...await real('node-graph-selection.mjs'),selectPreparedGraphNode:async()=>{}}});
mock.module(href('node-wizard-open.mjs'),{exports:{...await real('node-wizard-open.mjs'),openPreparedWizard:async()=>{stage='text_import_file';}}});
const {createTextImportNodeSupport}=await import(href('text-import-node.mjs'));
const p={preview_only:true,source:{kind:'storage',server_source_ref:'source-one'},settings:{source:{source_path:path}}};
const request={target:{kind:'existing'},parameters:p,finish:'close',inputs:[],mappings:[],read:{ports:[]}};
const operation={id:'preview',parameters:request,nodeApply:{request},nodeTargetAdapter:{observe:async()=>({})}};
const driver=createTextImportNodeSupport({}).nodeApplyDriverFactory({operation,onRecord:()=>{},now:Date.now,receiptOptions:()=>({}),
 execute:async()=>({rows:[['12','23.04.2026']],requested_records:25,rendered_only:true}),
 resolveStorageSource:async()=>({verified:true,kind:'storage',server_source_ref:'source-one',destination:path})});
const ctx={signal:new AbortController().signal,deadline:Date.now()+60000,document_id:'d',workflow_ref:{workflow_id:'w'},node:{node_id:'n'}};
await driver.verifySource(p);await driver.openWizard(ctx);
if(button==='missing'){
 await assert.rejects(driver.configureTextImport(ctx,p),/native import format detection available/);
 assert.ok(!actions.some(a=>a.ref==='detect'));
}else{
 const configured=await driver.configureTextImport(ctx,p),profile=configured.server_profile;
 assert.equal(actions.filter(a=>a.ref==='detect').length,1);
 assert.equal(profile.dialect.delimiter,'Точка с запятой');
 assert.equal(profile.dialect.date_format,'dd/mm/yyyy');
 assert.deepEqual(profile.columns.map(c=>c.type),['integer','datetime']);
 assert.equal(configured.source.fields.first_line_as_title.value,true);
}
`,button],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
