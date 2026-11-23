import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVariableBindings} from '../lib/variable-binding-parameters.mjs';
import {validateTextImportNodeParameters} from '../lib/text-import-node.mjs';
import {resolveImportBindingValue,importBindingInventory,readImportBindingField,readImportBindings,configureImportBinding,resolveImportBindingSourceReadback} from '../lib/import-bindings.mjs';
import {isUnchangedTextImportExecution} from '../lib/node-read-contract.mjs';

const binding={parameter:'/settings/source/source_path',variable:{kind:'variables',input:0,name:'CsvPath'}};
const settings={source:{encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},format:{delimiter:',',decimal_separator:'.',null_marker:'?',text_qualifier:'"'},columns:[{name:'RowID',label:'RowID',type:'integer',data_kind:'Непрерывный',used:true}]};
const p={source:{kind:'verified_delivery',artifact_id:'artifact',upload_operation_id:'upload'},settings};
const request={target:{kind:'new'},inputs:[],variable_inputs:[{kind:'variables',input:0,output:4,source:{node_id:'vars'}}],bindings:[binding],finish:'execute',read:{ports:[0]},mappings:[]};
test('Import Text registers only the file pointer on variables input zero',()=>{
 assert.doesNotThrow(()=>validateVariableBindings([binding],'imports.text'));
 for(const b of [{...binding,parameter:'/settings/source/encoding'},{...binding,variable:{...binding.variable,kind:'control'}},{...binding,variable:{...binding.variable,input:1}}])assert.throws(()=>validateVariableBindings([b],'imports.text'),/BINDING_/);
});
test('the file binding satisfies the missing literal without weakening ordinary imports',()=>{
 assert.doesNotThrow(()=>validateTextImportNodeParameters(p,'delimited',request));
 assert.throws(()=>validateTextImportNodeParameters(p,'delimited',{...request,bindings:[]}));
 assert.throws(()=>validateTextImportNodeParameters({...p,settings:{...settings,source:{...settings.source,source_path:'/own/a.csv'}}},'delimited',request),/BINDING_CONFLICT/);
 assert.throws(()=>validateTextImportNodeParameters(p,'delimited',{...request,variable_inputs:[]}),/BINDING_PORT_MISMATCH/);
});
test('empty bindings and omission use identical saved execution; a nonempty binding configures its slot',()=>{
 const r={...request,target:{kind:'existing',type:'imports.text'},variable_inputs:[],parameters:{settings:{}},mode:'delimited'};
 for(const bindings of [undefined,[]])assert.equal(isUnchangedTextImportExecution({...r,bindings}),true);
 assert.equal(isUnchangedTextImportExecution({...r,bindings:[binding]}),false);
 assert.doesNotThrow(()=>validateTextImportNodeParameters(r.parameters,r.mode,{...r,bindings:[binding]}));
 for(const finish of ['close'])assert.throws(()=>validateTextImportNodeParameters(r.parameters,r.mode,{...r,bindings:[binding],finish}),/BINDING_PARAMETER_UNSUPPORTED/);
});
function fixture(){
 const node={document_id:'doc',workflow_id:'wf',node_id:'import'},source={type:'variables.user',ref:{...node,node_id:'vars'}};
 const proof={verified:true,cleanup_complete:true,independent_readback:true,variables:[{id:7,name:'CsvPath',type:'string',cell:{type:'string',is_null:false,value:'/own/a.csv'}}]};
 const mapping={kind:'variables',port:0,port_guid:'input',fields:[{id:9,index:0,name:'CsvPath',label:'CsvPath',type:5,source:{id:7,name:'CsvPath',type:5}}]};
 const graph={variable_links:[{source:'vars',target:'import',kind:'variables',input:0,output:4,target_port_guid:'input'}]};
 const field={status:'observed',variable_mode:true,truncated:false,variable_caption:'CsvPath ( /own/a.csv )',value:'/own/a.csv',row_id:'row'};
 return {proof,node,source,mapping,graph,field};
}
test('fresh source values reject typed NULL, empty, URL, unsafe paths and another mapped ID',()=>{
 const f=fixture();assert.equal(resolveImportBindingValue(f.proof,'CsvPath',f.mapping).value,'/own/a.csv');
 assert.throws(()=>resolveImportBindingValue(f.proof,'CsvPath',f.mapping,'/own/b.csv'),/BINDING_SOURCE_UNVERIFIED/);
 for(const value of ['',null,'https://example.test/a.csv','/own/../a.csv','/own/*.csv']){
  const proof=structuredClone(f.proof);proof.variables[0].cell.value=value;proof.variables[0].cell.is_null=value===null;
  assert.throws(()=>resolveImportBindingValue(proof,'CsvPath',f.mapping),/BINDING_/);
 }
 const bad=structuredClone(f.proof);bad.variables[0].id=8;assert.throws(()=>resolveImportBindingValue(bad,'CsvPath',f.mapping),/BINDING_SOURCE_UNVERIFIED/);
});
test('independent filename inventory proves the selected caption, mapped IDs, source and input GUID',()=>{
 const f=fixture(),prepared={...resolveImportBindingValue(f.proof,'CsvPath',f.mapping),...f,link:f.graph.variable_links[0]};
 assert.equal(importBindingInventory(f.field,prepared,f.node)[0].source.variable_id,7);
 for(const field of [{...f.field,variable_mode:false},{...f.field,variable_caption:'Sentinel ( /own/a.csv )'},{...f.field,value:'/own/b.csv'}])assert.throws(()=>importBindingInventory(field,prepared,f.node),/BINDING_/);
 const bad=structuredClone(f.mapping);bad.port_guid='foreign';assert.throws(()=>importBindingInventory(f.field,{...prepared,mapping:bad},f.node),/BINDING_PORT_MISMATCH/);
});
test('pending input cache retains variable identity while the fresh builtin source authorizes its current file',()=>{
 for(const cached of [null,'/own/old.csv']){
  const f=fixture();Object.assign(f.mapping.fields[0],{is_null:cached===null,value:cached});
  Object.assign(f.field,{value:cached??'',variable_caption:'CsvPath ( '+(cached??'')+' )'});
  const prepared={...resolveImportBindingValue(f.proof,'CsvPath',f.mapping),...f,link:f.graph.variable_links[0]};
  const [b]=importBindingInventory(f.field,prepared,f.node);
  assert.equal(b.variable.id,9);assert.equal(b.variable.is_null,false);assert.equal(b.source.variable_id,7);
  assert.equal(resolveImportBindingSourceReadback({fields:{source_path:f.field}},prepared,f.node).fields.source_path.value,'/own/a.csv');
  assert.equal(f.field.value,cached??'');
 }
});
test('Import filename selection can expose the mapped label without a cached value',()=>{
 const f=fixture();Object.assign(f.field,{value:'',variable_caption:'CsvPath'});
 const prepared={...resolveImportBindingValue(f.proof,'CsvPath',f.mapping),...f,link:f.graph.variable_links[0]};
 assert.equal(importBindingInventory(f.field,prepared,f.node)[0].variable.id,9);
 assert.equal(resolveImportBindingSourceReadback({fields:{source_path:f.field}},prepared,f.node).fields.source_path.value,'/own/a.csv');
 assert.throws(()=>importBindingInventory({...f.field,variable_caption:'Sentinel'},prepared,f.node),/BINDING_SOURCE_UNVERIFIED/);
});
test('the Import adapter supplies its verified file-stage gate to the common variable gesture',async()=>{
 const f=fixture(),base='W;ImportTextFilePreviewWizard;edtFileName';
 const s={wizard:{root_ref:'owned',root_tid:'W',stage:'text_import_file'},prepared_node_context:{verified:true},ui:{elements:[{tid:base+';VariableControl;trg_picker',ref:'trigger',allowed_actions:['click']}]}};
 const channel={observe:async o=>{assert.ok(o.ready(s));return s;},perform:async o=>{
  assert.equal(o.ready({...s,wizard:{...s.wizard,stage:'foreign'}}),false);
  assert.equal(o.ready({...s,prepared_node_context:{verified:false}}),false);
  assert.equal(o.ready(s),true);throw Error('OWNED_FILE_GATE');
 }};
 await assert.rejects(configureImportBinding(channel,{...resolveImportBindingValue(f.proof,'CsvPath',f.mapping),mapping:f.mapping,proof:f.proof}),/OWNED_FILE_GATE/);
});
for(const caption of ['CsvPath','CsvPath ( /own/a.csv )'])test('the Import writer uses the common switch, exact picker, selection and commit without writing a literal: '+caption,async()=>{
 const f=fixture(),base='W;ImportTextFilePreviewWizard;edtFileName';
 let phase=0;const actions=[];
 const element=(tid,ref,allowed_actions,extra={})=>({tid,ref,allowed_actions,signature:{tag:'button'},...extra});
 const state=()=>({wizard:{root_ref:'owned',root_tid:'W',stage:'text_import_file',import_source:{fields:{source_path:{status:'observed',variable_mode:phase>=3,variable_caption:phase>=3?caption:undefined}}}},prepared_node_context:{verified:true},ui:{elements:phase===0?[element(base+';SwitchButton','switch',['click'])]:[
  element(base+';VariableControl;trg_picker','trigger',['click']),
  element(null,'input',['press'],{signature:{tag:'input'},identity:{anchor_tid:base+';VariableControl'}}),
  ...(phase===2?[element('option','option',['click'],{import_binding:{caption}})]:[])]}});
 const channel={observe:async o=>{const s=state();assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{
  const s=state();assert.ok(o.ready(s),o.condition);const action=o.resolve(s);actions.push(action);
  if(action.ref==='switch')phase=1;else if(action.ref==='trigger')phase=2;else if(action.ref==='option')phase=3;else if(action.ref==='input'&&action.key==='Tab')phase=4;else assert.fail('unexpected write');
 }};
 await configureImportBinding(channel,{...resolveImportBindingValue(f.proof,'CsvPath',f.mapping),mapping:f.mapping,proof:f.proof});
 assert.equal(phase,4);assert.deepEqual(actions.map(a=>[a.verb,a.ref]),[['click','switch'],['click','trigger'],['click','option'],['press','input']]);
});
for(const fault of ['observe','mapping'])test('Import readback Cancels its owned wizard after '+fault+' refusal',async()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'import',verified:true,tid:'N',locked:false};
 const owner={status:'observed',node:{tid:'flow>Import',label:'Import'},path:[{tid:'flow',label:'Scenario'},{tid:'n',label:'Import'},{tid:'settings',label:'Settings'}]};
 let opened=false;const actions=[];
 const state=()=>({prepared_node_context:{...node,surface:opened?'wizard':'graph'},wizard:opened?{status:'observed',stage:'text_import_file',root_ref:'root',root_tid:'W',owner_context:owner,import_source:{fields:{source_path:{status:'observed'}}}}:{status:'absent'},
  ui:{dialogs:[],masks:[],elements:opened?[{ref:'cancel',tid:'W;btnClose',allowed_actions:['click']}]:[{ref:'settings',tid:'N;Setting',allowed_actions:['begin_wizard'],wizard_open:{node:{node_label:'Import'},workflow_path:[{tid:'flow',label:'Scenario'}]}}]}});
 const channel={observe:async o=>{if(fault==='observe'&&o.condition==='independent Import filename binding readback')throw Error('READ_FAILED');const s=state();assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{const s=state();assert.ok(o.ready(s),o.condition);const a=o.resolve(s);actions.push(a);if(a.verb==='begin_wizard')opened=true;else if(a.ref==='cancel')opened=false;else throw Error('unexpected gesture');},readVariablePortMapping:async()=>{assert.equal(opened,false);throw Error('MAPPING_FAILED');}};
 await assert.rejects(fault==='observe'?readImportBindingField(channel):readImportBindings(channel,{}),fault==='observe'?/READ_FAILED/:/MAPPING_FAILED/);
 assert.equal(opened,false);assert.deepEqual(actions,[{verb:'begin_wizard',ref:'settings'},{verb:'click',ref:'cancel'}]);
});
