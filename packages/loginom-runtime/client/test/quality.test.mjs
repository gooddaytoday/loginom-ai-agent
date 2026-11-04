import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateQualityParameters,resolveQualityFields,resolveQualitySource} from '../lib/quality-parameters.mjs';
import {QUALITY_SUMMARY,readQualityOutputs} from '../lib/quality-output.mjs';
import {Page,scriptGraphFixture,clone,build,origin} from './support/workspace-ui-fixture.mjs';
import {workspaceUiCapability} from '../lib/workspace-ui.mjs';
import vm from 'node:vm';
import {nodeApiTools,nodeApplyInputSchema,nodeReadInputSchema,validateNodeApplyEnvelope} from '../lib/node-api.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {describeNodeTypes} from '../lib/node-contracts.mjs';
import {userNodeTool} from '../lib/user-workflow.mjs';
import {configureQuality} from '../lib/quality-procedure.mjs';

test('Quality installs profile with an empty parameter object and five outputs',()=>{
 const handler=createCandidateNodeSupport({}).nodeApplyHandlers.get('research.quality');
 assert.deepEqual(handler.modes,['profile']);
 const request={target:{kind:'new'},inputs:[{input:0}],mappings:[],finish:'execute',read:{ports:[0,1,2,3,4]}};
 assert.doesNotThrow(()=>validateQualityParameters({},'profile',request));
 for(const p of [{threshold:50},{MaxNullsPercent:50},{method:'median'}])assert.throws(()=>validateQualityParameters(p,'profile',request));
 for(const mode of ['train','apply','mark'])assert.throws(()=>validateQualityParameters({},mode,request));
 assert.throws(()=>validateQualityParameters({},'profile',{...request,mappings:[{direction:'output',port:0}]}));
});
test('Quality accepts only observed continuous numbers and discrete strings',()=>{
 const fields=[{name:'X',type:'real',data_kind:'Непрерывный'},{name:'S',type:'string',data_kind:'Дискретный'}];
 assert.deepEqual(resolveQualityFields({},fields),fields);
 // execution-events.jsonl:523: Preview has no data_kind; the input mapping
 // independently supplies it before its first edit/Done.
 const preview=fields.map(({data_kind,...f})=>f);
 assert.deepEqual(resolveQualitySource({},preview),preview);
 assert.throws(()=>resolveQualityFields({},preview));
 for(const f of [{type:'boolean'},{type:'variant'},{type:'datetime'},{type:'integer',data_kind:'Дискретный'}])
  assert.throws(()=>resolveQualityFields({},[{...fields[0],...f}]));
});
test('Quality configuration uses observed target kinds; source identities do not expose kinds',async()=>{
 const fields=[{name:'X',label:'X',type:'integer',data_kind:'Непрерывный',usage_type:3,
  source:{name:'X',label:'X',type:'integer',record_id:'source'}}];
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,target_fields:fields};
 const steps=[];let stage='output_mapping';
 const channel={observe:async()=>({wizard:{stage,root_tid:'wizard'},prepared_node_context:{verified:true,node_id:'quality'},
  ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']}]}}),
  perform:async o=>{const action=o.resolve(await channel.observe());steps.push(action.expected_stage);stage=action.expected_stage;}};
 const result=await configureQuality(channel,{}, {inputMapping,request:{finish:'execute'}});
 assert.deepEqual(result.configuration.fields,fields);
 assert.deepEqual(steps,['done']);
 fields[0].source.type='string';await assert.rejects(configureQuality(channel,{}, {inputMapping,request:{finish:'execute'}}),/unchanged/);
});
test('Quality reads five ports in request order and checks each independent schema',async()=>{
 const fields=[{name:'X',label:'X',type:'real'}];
 const schemas=[0,1,2,3,4].map(port=>({port,schema:port===4?QUALITY_SUMMARY:fields}));
 const channel={readOutputPort:async({port})=>({output:{port,port_guid:'same-guid-'+(port%2),schema:schemas[port].schema,sample_complete:true}})};
 const result=await readQualityOutputs(channel,{ports:[0,1,2,3,4],sample_rows:100,require_exact_numbers:true},{execution:{execution_id:'e'},portExecution:{},receipt_id:'r'},{ports:schemas});
 assert.deepEqual(result.ports.map(p=>p.port),[0,1,2,3,4]);
 schemas[4].schema=[...QUALITY_SUMMARY].reverse();
 await assert.rejects(readQualityOutputs(channel,{ports:[4],sample_rows:100,require_exact_numbers:true},{execution:{execution_id:'e'}},{ports:[{port:4,schema:QUALITY_SUMMARY}]}),/schema/);
});
test('Quality suffix pages are output mappings; Binning retains its ranges page',async()=>{
 for(const quality of [true,false])for(const port of quality?[0,1,2,3,4]:[1]){
  const page=new Page(),base='MF;TF-1;WizrdMCF',root=page.add('div',base);
  if(quality)for(const n of [0,1,2,3,4])page.add('div',base+';DerivedDataSourceMappingEngineOutputPortWizard'+(n?'-'+n:''),'',undefined,root);
  const suffix=port?'-'+port:'';
  page.add('div',base+';DerivedDataSourceMappingEngineOutputPortWizard'+suffix+';btnAddMappingColumn','',undefined,root);
  const r=await page.observe();assert.equal(r.wizard.stage,quality?'output_mapping':'binning_ranges_mapping');
 }
});
test('published and actual envelope validation admit five ports only for Quality',()=>{
 const request={operation_id:'quality',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'tab',navigation_path:[{tid:'crumb',label:'Scenario'}]},
  target:{kind:'new',type:'research.quality'},inputs:[],mappings:[],mode:'profile',parameters:{},finish:'execute',read:{ports:[0,1,2,3,4],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:10000,execute_ms:10000,total_ms:20000}};
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyInputSchema);
 assert.equal(validate(request).valid,true,JSON.stringify(validate(request)));
 assert.doesNotThrow(()=>validateNodeApplyEnvelope(request));
 for(const type of ['preprocessing.elim_outlier','preprocessing.data_partition','preprocessing.smoothing','transform.calculator'])
  assert.equal(validate({...request,target:{kind:'new',type}}).valid,false);
 assert.throws(()=>validateNodeApplyEnvelope({...request,parameters:{threshold:50}}));
 const readValidate=new AjvJsonSchemaValidator().getValidator(nodeReadInputSchema);
 assert.equal(readValidate({operation_id:'read',source_operation_id:'quality',read:{ports:[0,1,2,3,4]}}).valid,true);
});
test('Quality model-visible card, compact apply and dedicated skill obey their byte budgets',async()=>{
 const {readFile}=await import('node:fs/promises');
 const tool=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 const {name,description,inputSchema}=tool;
 assert.ok(Buffer.byteLength(JSON.stringify({name,description,inputSchema}))<=20000);
 const card=describeNodeTypes(['research.quality'],{},new Map(),createCandidateNodeSupport({}).nodeApplyHandlers,'7.4.2')[0];
 assert.equal(card.candidate_node_apply_available,true);assert.ok(Buffer.byteLength(JSON.stringify(card))<=12000);
 const skill=await readFile(new URL('../../../product/skills/loginom-automation/references/nodes/research.quality.md',import.meta.url));
 assert.ok(skill.length<=6000);assert.doesNotMatch(skill.toString(),/\$(?:[1-9]\d*|ARGUMENTS)/);
});
test('Quality opening waits only for its exact native no-master information toast',async()=>{
 for(const fault of [null,'text','type','node']){
  const {page,body}=scriptGraphFixture('Quality',fault==='type'?'bg-vendor-icon-groupdata':'bg-vendor-icon-quality');
  const base='MF;TF-1;',panel=page.add('div',base+'NavigationBar;NavigationPanel');let path='',toast,waits=0;
  for(const label of ['Сервер','Пакеты','Package1','Модуль1','Сценарий']){
   path+=(path?'>':'')+label;const crumb=page.add('a',base+'cnrNaviMode;b.s_'+path,label,undefined,panel);
   if(label==='Сценарий')page.add('span',null,'',undefined,crumb).attrs.class='maptree-icon-workflow';
  }
  const binding=async()=>({verified:true,document_id:'doc',workflow_id:'workflow',node_id:fault==='node'&&waits?'foreign':'node',
   surface:page.events.includes('click')?'wizard':'graph',tid:base+(page.events.includes('click')?'WizrdMCF':'Graph;Quality')});
  page.execute=async options=>clone(await vm.runInContext('('+workspaceUiCapability.toString()+')',page.context)(page,
   {expected_build:build,expected_origin:origin,kind:'workspace-ui',prepared_node_context:{node:{node_id:'node'},workflow_ref:{prefix:'MF;TF-1',navigation_path:[]}},...options},binding));
  const snapshot=await page.observe(),button=snapshot.ui.elements.find(e=>e.wizard_open),click=page.mouse.click;
  page.mouse.click=async(...args)=>{await click(...args);body.parentElement.remove();
   const wizard=page.add('div',base+'WizrdMCF');
   for(const port of [0,1,2,3,4])page.add('div',base+'WizrdMCF;DerivedDataSourceMappingEngineOutputPortWizard'+(port?'-'+port:''),'',undefined,wizard);
   page.add('button',base+'WizrdMCF;DerivedDataSourceMappingEngineOutputPortWizard;btnAddMappingColumn','',undefined,wizard);
   const node=page.add('a',base+'cnrNaviMode;b.s_'+path+'>Quality','Quality',undefined,panel);
   page.add('span',null,'',undefined,node).attrs.class='bg-vendor-icon-quality';
   const settings=page.add('a',base+'cnrNaviMode;b.s_'+path+'>Quality>Настройка','Настройка',undefined,panel);
   page.add('span',null,'',undefined,settings).attrs.class='maptree-icon-wizard';
   toast=page.add('div','toast','',{x:600,y:600,width:300,height:100});toast.attrs.role='dialog';
   page.add('h1',null,'Информация',undefined,toast).attrs.role='heading';
   page.add('div',null,fault==='text'?'Other information':'Мастера настройки для "Quality" не существует. Будут отображены страницы настройки полей и/ или описания узла.',undefined,toast);
  };
  page.waitForTimeout=async ms=>{page.clock.advance(ms);if(++waits===3)toast.remove();};
  const result=await page.act({verb:'begin_wizard',ref:button.ref},snapshot);
  assert.equal(result.status,fault?'AMBIGUOUS':'SUCCEEDED',String(fault)+JSON.stringify(result.error));
  assert.equal(page.events.filter(e=>e==='click').length,1);
  if(!fault)assert.equal(result.trace.filter(e=>e.event==='wizard_toast_wait').length,3);
 }
});
