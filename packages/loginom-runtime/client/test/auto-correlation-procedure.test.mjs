import test from 'node:test';
import assert from 'node:assert/strict';
import {configureAutoCorrelation} from '../lib/auto-correlation-procedure.mjs';
import {nodeApiTools} from '../lib/node-api.mjs';
function fixture({existing=false,empty=false,variable=false,overwrite=false,foreignOutput=false}={}){
 const node={verified:true,document_id:'doc',workflow_id:'flow',node_id:'acf'},root='MF;TF-1;WizrdMCF';
 const fields=['RowID','X'].map((name,index)=>({index,name,label:name,type:index===0?'integer':'real',data_kind:'Непрерывный',field_id:String(index),record_id:'role-'+index,usage_type:index===0?1:0}));
 const source_fields=fields.map(f=>({record_id:'source-'+f.index,field_id:f.field_id,name:f.name,label:f.label,type:f.type}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...node,input_port:{port:0}},source_fields,target_fields:fields.map((f,index)=>({...f,source:source_fields[index]}))};
 const schema=[{name:'Lag',label:'Лаг',type:'integer'},{name:'X_ACF',label:'АКФ',type:'real'},{name:'X_StdErr',label:'Ошибка',type:'real'},{name:'X_Significant',label:'Значимость',type:'boolean'}];
 const settings={verified:true,kind:'parameters',lag_count:12,domain:'auto',pacf:true,switches:{pedLagCount:variable,pedDomainCalc:false,pedCalcPacf:false}},actions=[];
 let stage='input_mapping',editor=null,usage='',picker=false,domainPicker=false;
 const controls=()=>[
  {tid:root+';btnNext',ref:'next',allowed_actions:['wizard_step']},
  ...fields.map(f=>({ref:'field:'+f.name,allowed_actions:['double_click']})),
  {tid:root+';AutoCorrelationWizard;pedLagCount;ValueControl',ref:'lag',allowed_actions:['fill','press']},
  {tid:root+';AutoCorrelationWizard;pedDomainCalc;ValueControl;trg_picker',ref:'domain',allowed_actions:['click']},
  ...(domainPicker?[{tid:root+';AutoCorrelationWizard;pedDomainCalc;ValueControl;boundlist;Временная',ref:'time',allowed_actions:['click']}]:[]),
  {tid:root+';AutoCorrelationWizard;pedCalcPacf;ValueControl;DisplayEl',ref:'pacf',allowed_actions:['set_checked']},
  ...(editor?[{ref:'usage',allowed_actions:['click'],wizard_combo:{kind:'picker',field:{scope:'output_column',name:'usage'}}},
   ...(picker?['Не задано','Используемое'].map(label=>({ref:label,allowed_actions:['select_wizard_option'],wizard_combo:{kind:'option',field:{scope:'output_column',name:'usage'},label}})):[]),
   {ref:'apply',allowed_actions:['apply_output_column'],column_close:{scope:'output'}}]:[])
 ];
 const snapshot=()=>({prepared_node_context:node,wizard:{status:'observed',stage,root_tid:root,root_ref:'wizard',
  output_columns:{fields:fields.map(f=>({...f,status:'observed',name_ref:'field:'+f.name})),page:{status:'complete_definition_page',schema_id:'definition',offset:0,limit:8,total_columns:2,returned:2,next_offset:null}},
  ...(editor?{column_parameters:{status:'observed',portal_bound:true,selected_column:{name:editor.name},fields:{usage:{value:usage}}}}:{})},
  ui:{elements:controls()},
  node_auto_correlation:stage==='input_mapping'?{verified:true,kind:'roles',inventory_complete:true,fields:structuredClone(fields),node_context:node}:{...structuredClone(settings),node_context:node},
  node_mapping:{verified:true,inventory_complete:true,source_identity_verified:!foreignOutput,source_fields:schema.map((f,i)=>({...f,record_id:'out-'+i})),
   target_fields:schema.map((f,i)=>({...f,excluded:false,source:{...f,record_id:'out-'+i}}))}});
 const channel={async observe(o){const s=snapshot();assert.ok(o.ready(s),o.condition);return s;},async perform(o){
  const s=snapshot();assert.ok(o.ready(s),o.condition);const a=o.resolve(s);actions.push(a);
  if(a.verb==='wizard_step'){stage=a.expected_stage;return;}
  if(a.verb==='double_click'){editor=fields.find(f=>a.ref==='field:'+f.name);usage=editor.usage_type?'Используемое':'Не задано';return;}
  if(a.ref==='usage'){picker=true;return;}
  if(a.verb==='select_wizard_option'){usage=a.ref;picker=false;return;}
  if(a.verb==='apply_output_column'){editor.usage_type=usage==='Используемое'?1:0;editor=null;return;}
  if(a.verb==='fill'){settings.lag_count=Number(a.text);return;}
  if(a.verb==='press'){if(overwrite)settings.lag_count=12;return;}
  if(a.ref==='domain'){domainPicker=true;return;}
  if(a.ref==='time'){settings.domain='time';domainPicker=false;return;}
  if(a.ref==='pacf'){settings.pacf=a.checked;return;}
  assert.fail('unexpected action '+JSON.stringify(a));
 }};
 return {actions,fields,settings,run:()=>configureAutoCorrelation(channel,empty?{}:{autocorrelation:{field:'X',lag_count:4}},{request:{target:{kind:existing?'existing':'new'},finish:'execute'},inputMapping})};
}
test('ACF replaces every role, commits loaded lag/domain/PACF controls and observes all native output fields',async()=>{
 const f=fixture(),result=await f.run();
 assert.deepEqual(f.fields.map(f=>f.usage_type),[0,1]);assert.equal(result.configuration.field,'X');
 assert.equal(result.configuration.lag_count,4);assert.equal(result.configuration.domain,'time');assert.equal(result.configuration.pacf,false);
 assert.deepEqual(f.actions.filter(a=>a.verb==='wizard_step').map(a=>a.expected_stage),['auto_correlation','output_mapping','done']);
 assert.equal(f.actions.filter(a=>a.verb==='apply_output_column').length,2);
 assert.equal(result.validation.status,'accepted_by_loginom_next');
});
test('ACF refuses overwritten lag values, variable settings, foreign output and unsupported preserved mode',async()=>{
 for(const options of [{overwrite:true},{variable:true},{foreignOutput:true},{existing:true,empty:true}]){
  const f=fixture(options);await assert.rejects(f.run);assert.equal(f.actions.some(a=>a.expected_stage==='done'),false);
 }
});
test('registered ACF input schema adds 690 bytes and stays within both schema limits',()=>{
 const schema=nodeApiTools.find(t=>t.name==='dock_node_apply').inputSchema,baseline=structuredClone(schema);
 baseline.properties.target.properties.type.enum=baseline.properties.target.properties.type.enum.filter(v=>v!=='research.auto_correlation');
 baseline.properties.mode.enum=baseline.properties.mode.enum.filter(v=>v!=='time_domain');
 delete baseline.properties.parameters.properties.autocorrelation;
 const bytes=v=>Buffer.byteLength(JSON.stringify(v));
 assert.equal(bytes(schema)-bytes(baseline),690);assert.ok(bytes(schema)<46000);assert.ok(bytes(schema)-bytes(baseline)<=1050);
});
