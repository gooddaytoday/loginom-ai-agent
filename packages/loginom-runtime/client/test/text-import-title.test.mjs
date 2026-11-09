import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {validateTextImportFieldsRequest,validateTextImportPatch,configureTextImportTitle} from '../lib/text-import-procedure.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';
import {textImportConfigurationReadback} from '../lib/text-import-readback.mjs';
import {workspaceUiCapability} from '../lib/workspace-ui.mjs';
import {Page,build,origin} from './support/workspace-ui-fixture.mjs';

test('node_title is an optional native setting in new imports and existing patches',()=>{
 const settings={source:{source_path:'/typed.csv',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
  format:{delimiter:';',decimal_separator:'.',null_marker:'\\N',text_qualifier:'"'},
  columns:[{name:'Id',label:'Id',type:'integer',data_kind:'Дискретный',used:true}]};
 for(const node_title of [{mode:'automatic'},{mode:'custom',label:'Ежедневные продажи'}]){
  validateTextImportFieldsRequest({...settings,node_title});validateTextImportPatch({node_title});
 }
 validateTextImportPatch({});
});
test('node_title refuses missing custom captions, automatic overrides, unsafe graph keys and unknown settings',()=>{
 for(const node_title of [null,[],{}, {mode:'auto'}, {mode:'custom'}, {mode:'automatic',label:'Override'},
  {mode:'custom',label:''},{mode:'custom',label:' '},{mode:'custom',label:'x'.repeat(121)},
  ...[';','|','<','>','"',"'",'\\','\n'].map(c=>({mode:'custom',label:'bad'+c+'label'})),
  {mode:'custom',label:'Valid',extra:true}])assert.throws(()=>validateTextImportPatch({node_title}));
});
test('observed completion readback returns native title mode and caption, never the request',()=>{
 const input=JSON.parse(fs.readFileSync(new URL('./fixtures/text-import-readback.json',import.meta.url),'utf8'));
 const finish=input.phases.find(p=>p.phase==='finish').value;
 for(const [mode,label] of [['Автоматическая метка','typed-update.csv'],['Пользовательская метка','Ежедневные продажи']]){
  finish.node_title={fields:{label_mode:{status:'observed',value:mode,truncated:false},label:{status:'observed',value:label,truncated:false}}};
  assert.deepEqual(textImportConfigurationReadback(input).node_title,{mode:mode==='Автоматическая метка'?'automatic':'custom',label});
  assert.equal(new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema.properties.configuration)({status:'applied',readback:textImportConfigurationReadback(input)}).valid,true);
 }
 finish.node_title.fields.label_mode.status='unobserved';assert.throws(()=>textImportConfigurationReadback(input));
});

test('title procedure uses native mode selection and commits custom text; omission makes no gesture',async()=>{
 const f=doneFixture(),actions=[];
 let state=(await f.observe()).output;
 const channel={observe:async options=>{assert.ok(options.ready(state));return structuredClone(state);},
  perform:async options=>{
   assert.ok(options.ready(state));const action=options.resolve(state);actions.push(action);
   if(action.verb==='select_wizard_option'){
    state.wizard.completion.fields.label_mode.value='Автоматическая метка';state.wizard.completion.fields.label.value='typed.csv';
   }
   if(action.verb==='fill')state.wizard.completion.fields.label.value=action.text;
  }};
 await configureTextImportTitle(channel,{mode:'automatic'});
 assert.deepEqual(actions.map(a=>a.verb),['click','select_wizard_option']);
 actions.length=0;
 await configureTextImportTitle(channel);
 assert.deepEqual(actions,[]);
 state.wizard.completion.fields.label_mode.value='Пользовательская метка';
 const observed=await configureTextImportTitle(channel,{mode:'custom',label:'Ежедневные продажи'});
 assert.deepEqual(actions.map(a=>a.verb),['fill','press']);
 assert.equal(observed.fields.label.value,'Ежедневные продажи');
});

function doneFixture(icon='importtextfile'){
 const page=new Page(),base='MF;TF-1;',panel=page.add('div',base+'NavigationBar;NavigationPanel');
 let path='';const crumbs=[];
 for(const label of ['Сервер','Пакеты','Package1','Модуль1','Сценарий','Import','Настройка']){
  path+=(path?'>':'')+label;const c=page.add('a',base+'cnrNaviMode;b.s_'+path,label,undefined,panel);crumbs.push(c);
  if(label==='Сценарий')page.add('span',null,'',undefined,c).attrs.class='maptree-icon-workflow';
  if(label==='Import')page.add('span',null,'',undefined,c).attrs.class='bg-vendor-icon-'+icon;
  if(label==='Настройка')page.add('span',null,'',undefined,c).attrs.class='maptree-icon-wizard';
 }
 const wizard=page.add('div',base+'WizrdMCF');
 let labelInput,modeInput,picker;
 for(const [key,value] of [['edtDisplayName','Import'],['cbxNodeTitleMode','Пользовательская метка']]){
  const tid=base+'WizrdMCF;DoneWizard;'+key;
  const owner=page.add('div',tid,'',undefined,wizard),input=page.add('input',null,'',undefined,owner);input.value=value;
  if(key==='edtDisplayName')labelInput=input;
  else{
   modeInput=input;input.readOnly=true;
   picker=page.add('div',tid+';trg_picker','',undefined,owner);
   const list=page.add('div',tid+';boundlist','',undefined,owner);
   page.add('div',tid+';boundlist;Автоматическая_метка','Автоматическая метка',undefined,list);
  }
 }
 const workflow_ref={workflow_id:'wf',prefix:'MF;TF-1',tab_tid:page.tab.getAttribute('data-tid'),navigation_path:crumbs.slice(0,5).map(c=>({tid:c.getAttribute('data-tid'),label:c.textContent.trim()}))};
 const node={document_id:'doc',workflow_id:'wf',node_id:'node'},binding={document_id:'doc',workflow_ref,node};
 const reader=async()=>({verified:true,...node,surface:'wizard',tid:base+'WizrdMCF'});
 const capability=vm.runInContext('('+workspaceUiCapability.toString()+')',page.context);
 return {page,picker,modeInput,labelInput,binding,reader,capability,
  observe:()=>capability(page,{mode:'observe',expected_origin:origin,expected_build:build,prepared_node_context:binding},reader)};
}
test('native Done title choices are bound to the prepared Text Import only',async()=>{
 for(const icon of ['importtextfile','exporttextfile']){
  const f=doneFixture(icon),r=await f.observe();assert.equal(r.status,'SUCCEEDED');
  const picker=r.output.ui.elements.find(e=>e.wizard_combo?.field.scope==='node_title'&&e.wizard_combo.kind==='picker');
  assert.equal(!!picker,icon==='importtextfile');
  if(picker){
   assert.equal(picker.wizard_combo.field.name,'label_mode');
   const option=r.output.ui.elements.find(e=>e.wizard_combo?.kind==='option'&&e.wizard_combo.field.scope==='node_title');
   assert.equal(option.wizard_combo.label,'Автоматическая метка');assert.ok(option.allowed_actions.includes('select_wizard_option'));
   f.page.mouse.click=async()=>{f.modeInput.value='Автоматическая метка';f.labelInput.value='typed.csv';};
   const selected=await f.capability(f.page,{mode:'act',expected_origin:origin,expected_build:build,prepared_node_context:f.binding,
    snapshot:r.output,action:{verb:'select_wizard_option',ref:option.ref},timeout_ms:1000},f.reader);
   assert.equal(selected.status,'SUCCEEDED',JSON.stringify(selected));
   assert.equal(selected.output.wizard.completion.fields.label.value,'typed.csv');
  }
 }
});
