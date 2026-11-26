import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionRuntime} from '../lib/executor.mjs';
import {dispatchNodeApi} from '../lib/node-api.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {compactNodeRequestFailure} from '../lib/user-results.mjs';

const workflow={workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',
 navigation_path:[{tid:'path',label:'Scenario'}]};
const ref=node_id=>({document_id:'doc',workflow_id:workflow.workflow_id,node_id});
const input={source:ref('table'),input:0,output:0};
const variable=(kind='variables',port=0)=>({source:ref('vars'),input:port,output:0,kind});
const mapping=(kind='variables',port=0)=>({direction:'input',kind,port});
const field=name=>({kind:'input_field',name});
const request=(type,mode,parameters,extra={})=>({
 operation_id:'apply',contract_revision:'1.0.0',document_id:'doc',workflow_ref:workflow,
 target:{kind:'new',type,position:{x:320,y:280}},inputs:[input],mode,parameters,mappings:[],finish:'done',
 read:{ports:[],sample_rows:0,require_exact_numbers:false},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000},...extra,
});
const calculator=extra=>request('transform.calculator','expression',{
 expressions:[{target:{kind:'new'},name:'Result',label:'Result',type:'real',formula:'1',replace:false}],
},extra);

function fixture(){
 const calls=[];
 const {nodeApplyHandlers}=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 const admitted=Error('Reached driver factory');
 const runtime=createActionRuntime({allowCandidate:true,pinned:{actions:new Map(),selectors:new Map(),pins:{}},nodeApplyHandlers,
  execute:async()=>{calls.push('transport');throw Error('Unexpected browser transport');},
  nodeTargetAdapterFactory:()=>{calls.push('target_adapter');return {};},
  nodeApplyDriverFactory:()=>{calls.push('drivers');throw admitted;},
  onRecord:async event=>{calls.push(event.phase);return event;}});
 return {runtime,calls,admitted};
}

for(const [name,args,path,hint] of [
 ['unsupported link',request('transform.sorting','keys',{keys:[{field:field('Id'),direction:'ASC',case_sensitive:false}]},
  {variable_inputs:[variable()]}),'variable_inputs',/control input 0/],
 ['variable input on a table-only node',request('transform.reform_columns','scalar',{changes:[]},
  {variable_inputs:[variable()]}),'variable_inputs',/accepts no variable inputs/],
 ['database import with a variable input',request('imports.database','table',{},
  {inputs:[],variable_inputs:[variable()]}),'variable_inputs',/accepts no variable inputs/],
 ['unsupported mapping port',calculator({mappings:[mapping('variables',1)]}),'mappings',/variables input 0/],
 ['new mapping without its connection',calculator({mappings:[mapping()]}),'mappings',/Add.*variable_inputs.*variables input 0/],
 ['handler refusal for typed mapping',request('variables.replace','exact',{},{
  target:{kind:'existing',type:'variables.replace',ref:ref('saved')},inputs:[],mappings:[mapping()]}),'mappings',/Remove or correct the variable mapping/],
]){
 test('fresh node admission rejects '+name+' before claiming the ID',async()=>{
  const {runtime,calls}=fixture();
  await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',args),error=>{
   const raw=runtime.requestFailure(new Error(error.message,{cause:error}));
   assert.equal(raw.status,'NOT_APPLIED');
   const result=compactNodeRequestFailure(raw,args);
   assert.equal(result.status,'NOT_APPLIED');
   assert.equal(result.error.code,'REQUEST_REJECTED');
   assert.equal(result.error.parameter_path,path);
   assert.equal(result.effect_possible,false);
   assert.equal(result.cleanup_complete,true);
   assert.equal(result.next_step.tool,'dock_node_apply');
   assert.match(result.next_step.instruction,hint);
   if(name==='handler refusal for typed mapping')assert.match(result.error.message,/no table inputs or explicit mappings/);
   return true;
  });
  assert.throws(()=>runtime.nodeApplyStatus(args.operation_id),/Unknown node operation/);
  await assert.rejects(runtime.runNodeApply(args),/Invalid parameters/);
  assert.deepEqual(calls,[]);
 });
}

test('typed text export mapping refusal preserves the table mapping repair hint',async()=>{
 const {runtime,calls}=fixture();
 const args=request('exports.text','delimited',{},{
  target:{kind:'existing',type:'exports.text',ref:ref('saved-export')},inputs:[],
 });
 const refusal=async mappings=>{
  let outcome;
  await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',{...args,mappings}),error=>{
   outcome=runtime.requestFailure(new Error(error.message,{cause:error}));
   return true;
  });
  return compactNodeRequestFailure(outcome,{...args,mappings});
 };
 const table=await refusal([{direction:'input',port:0}]);
 assert.match(table.next_step.instruction,/transform.reform_columns/);
 assert.match(table.next_step.instruction,/SAME existing export/);
 assert.deepEqual(await refusal([mapping()]),table);
 assert.deepEqual(calls,[]);
});

const pathBinding={parameter:'/settings/source/source_path',variable:{kind:'variables',input:0,name:'Path'}};
const boundText=request('imports.text','delimited',{
 source:{kind:'verified_delivery',artifact_id:'artifact',upload_operation_id:'up'},
 settings:{source:{encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
  format:{delimiter:';',decimal_separator:'.',null_marker:'?',text_qualifier:'"'},
  columns:[{name:'Id',label:'Id',type:'integer',data_kind:'Непрерывный',used:true}]},
},{inputs:[],bindings:[pathBinding],variable_inputs:[variable()]});

for(const [name,args] of [
 ['Calculator with table and variable mappings',calculator({variable_inputs:[variable()],mappings:[
  {direction:'input',port:0},{direction:'output',port:0},mapping()]})],
 ['JavaScript variable connection',request('programming.javascript','script',{
  schema_mode:'code',source_text:'import {OutputTable} from "builtIn/Data";\n',
 },{variable_inputs:[variable()]})],
 ['variables Calculator mapping on control input',request('variables.calculator','expression',{
  expressions:[{target:{kind:'new'},name:'Count',label:'Count',type:'integer',formula:'1'}],
 },{inputs:[],variable_inputs:[variable('control')],mappings:[mapping('control')]})],
 ['Calculator mapping on an existing connection',calculator({target:{kind:'existing',type:'transform.calculator',ref:ref('saved')},
  parameters:{expressions:[]},inputs:[],mappings:[mapping()]})],
 ['REST variable header',request('integration.rest_request','request',{
  connection:{name:'Echo',base_url:'https://httpbin.org/anything'},query_parameters:[],headers:[{name:'X-Case',value:{variable:'Header'}}],
 },{finish:'execute',variable_inputs:[variable()],mappings:[mapping()]})],
 ['text import path binding',boundText],
 ['Excel import path binding',request('imports.excel','xlsx',{
  source:{kind:'storage',server_source_ref:'workbook'},
  excel:{header_rows:1,columns:[{name:'Id',label:'Id',type:'integer'}]},
 },{inputs:[],bindings:[{...pathBinding,parameter:'/excel/source_path'}],variable_inputs:[variable()]})],
 ['LGD import path binding',request('imports.lgd','native',{
  source:{kind:'storage',server_source_ref:'lgd-file'},
  lgd_import:{checksum:'verify',bindings:{source_path:{variable:'Path'}}},
 },{inputs:[],variable_inputs:[variable()]})],
 ['text export filename binding',request('exports.text','delimited',{
  file_name_variable:{kind:'variable',name:'Path'},encoding:'UTF-8',delimiter:';',header:'names',
  bom:false,line_ending:'LF',decimal_separator:'.',null_marker:'',text_qualifier:'"',
 },{variable_inputs:[variable()]})],
 ['Excel export workbook and sheet bindings',request('exports.excel','xlsx',{
  excel_export:{header:'names',overwrite:'reject',bindings:{destination:{variable:'Path'},sheet_name:{variable:'Sheet'}}},
 },{variable_inputs:[variable()]})],
 ['LGD export destination binding',request('exports.lgd','native',{
  lgd_export:{compression:'lz4',checksum:'none',overwrite:'reject',bindings:{destination:{variable:'Path'}}},
 },{variable_inputs:[variable()]})],
 ['filter control port',request('transform.filter_data','conditions',{
  groups:[[{field:field('Id'),operator:'>',type:'integer',value:{kind:'variable',name:'Limit'}}]],
 },{variable_inputs:[variable('control')],mappings:[mapping('control')]})],
 ['sorting control port alongside both table mappings',request('transform.sorting','keys',{
  keys:[{field:field('Id'),direction:'ASC',case_sensitive:false}],
 },{variable_inputs:[variable('control')],mappings:[{direction:'input',port:0},{direction:'output',port:0},mapping('control')]})],
 ['grouping control port alongside both table mappings',request('transform.group_data','aggregate',{
  group_by:[field('Id')],measures:[],
 },{variable_inputs:[variable('control')],mappings:[{direction:'input',port:0},{direction:'output',port:0},mapping('control')]})],
]){
 test('fresh node admission accepts '+name,async()=>{
  const {runtime,calls,admitted}=fixture();
  await assert.rejects(runtime.runNodeApply(args),error=>error===admitted);
  assert.deepEqual(calls,['target_adapter','drivers']);
 });
}
