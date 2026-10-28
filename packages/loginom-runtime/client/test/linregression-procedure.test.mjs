import test from 'node:test';
import assert from 'node:assert/strict';
import {configureLinRegression,configureLinRegressionRoles} from '../lib/linregression-procedure.mjs';
import {validateUiAction} from '../lib/workspace-ui.mjs';

test('apply rejects changed or missing predictor roles without opening any role editor',async()=>{
 for(const p of [{input_fields:['Y'],target_field:'X'},{input_fields:['Missing'],target_field:'Y'}]){
  let closed=false;
  const fields=['X','Y'].map((name,i)=>({name,type:'real',data_kind:'Непрерывный',usage_type:i===0?3:4}));
  const state=()=>({node_linregression:{verified:true,fields},
   prepared_node_context:{verified:true,surface:closed?'graph':'wizard',locked:false,document_id:'doc',workflow_id:'flow',node_id:'regression'},
   wizard:closed?{status:'absent'}:{status:'observed',stage:'input_mapping',root_ref:'wizard',root_tid:'W',owner_context:{status:'observed'}},
   ui:{dialogs:[],masks:[],elements:[{tid:'W;btnClose',ref:'close',allowed_actions:['click']}]}});
  const channel={async observe(options){const s=state();assert.equal(options.ready(s),true);return s;},
   async perform(options){assert.deepEqual(options.resolve(state()),{verb:'click',ref:'close'});closed=true;}};
  await assert.rejects(configureLinRegressionRoles(channel,p,null,{preserve:true}),/roles differ from the saved model/);
  assert.equal(closed,true);assert.deepEqual(fields.map(f=>f.usage_type),[3,4]);
 }
});

for(const mode of ['native_order','duplicate','missing','extra','wrong_index','wrong_type','wrong_label','normalized'])
test('regression normalizer matches role identities rather than source order: '+mode,async()=>{
 const node={verified:true,document_id:'doc',workflow_id:'flow',node_id:'regression'};
 const fields=['Net','RowID','Approved','X'].map((name,index)=>({name,label:name,type:name==='RowID'?'integer':name==='Approved'?'boolean':'real',
  data_kind:['Net','X'].includes(name)?'Непрерывный':'Дискретный',index,field_id:String(index),record_id:'role-'+index,usage_type:name==='Net'?4:name==='X'?3:0}));
 const source_fields=fields.map(f=>({record_id:'source-'+f.index,field_id:f.field_id,name:f.name,label:f.label,type:f.type}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...node,input_port:{port:0}},source_fields,target_fields:fields.map((f,index)=>({...f,source:source_fields[index]}))};
 const normalizers=[fields[3],fields[0]].map(f=>({...f,norm_type:0}));
 if(mode==='duplicate')normalizers[1]={...normalizers[0]};
 if(mode==='missing')normalizers.pop();
 if(mode==='extra')normalizers.push({...fields[1],norm_type:0});
 if(mode==='wrong_index')normalizers[0].index=0;
 if(mode==='wrong_type')normalizers[0].type='integer';
 if(mode==='wrong_label')normalizers[0].label='Other';
 if(mode==='normalized')normalizers[0].norm_type=1;
 let stage='input_mapping';const destinations=[];
 const state=()=>({prepared_node_context:node,wizard:{status:'observed',stage,root_tid:'MF;TF-1;WizrdMCF',root_ref:'wizard'},ui:{elements:[{tid:'MF;TF-1;WizrdMCF;btnNext',ref:'ui-next',allowed_actions:['wizard_step']}]},node_linregression:{verified:true,node_context:node,
  ...(stage==='input_mapping'?{inventory_complete:true,fields}:stage==='normalization'?{kind:'normalization',fields:normalizers,source_status:'Активировано'}:stage==='learn_partition'?{kind:'partition',values:{train:100,test:0,validation:0}}:stage==='lin_regression'?{kind:'parameters',values:{pedAutoMethod:false,pedRegressionMethod:0,pedDenormalize:true,pedUseDetailedSettings:true},switches:{}}:{kind:'details',values:{pedIntercept:true},switches:{}})}});
 const channel={async observe({ready}){const s=state();assert.equal(ready(s),true);return s;},async perform({ready,resolve}){const s=state();assert.equal(ready(s),true);const a=resolve(s);validateUiAction(a,s);destinations.push(a.expected_stage);stage=a.expected_stage;return {verified:true};}};
 const run=()=>configureLinRegression(channel,{input_fields:['X'],target_field:'Net'},{request:{target:{kind:'new'}},inputMapping});
 if(mode!=='native_order'){await assert.rejects(run,/only unnormalized continuous/);assert.deepEqual(destinations,['normalization']);return;}
 const result=await run();assert.equal(result.validation.status,'accepted_by_loginom_next');
 assert.deepEqual(result.configuration.normalization.map(f=>[f.name,f.index]),[['X',3],['Net',0]]);
 assert.deepEqual(result.configuration.fields.map(f=>[f.name,f.usage_type]),[['Net',4],['RowID',0],['Approved',0],['X',3]]);
});

test('Enter configuration advances from native details straight to Done under the unchanged UI contract',async()=>{
 const node={verified:true,document_id:'doc',workflow_id:'flow',node_id:'regression'};
 const fields=['X','Y'].map((name,index)=>({name,label:name,type:'real',data_kind:'Непрерывный',index,field_id:String(index),record_id:'role-'+index,usage_type:index===0?3:4}));
 const source_fields=fields.map(f=>({record_id:'source-'+f.index,field_id:f.field_id,name:f.name,label:f.label,type:f.type}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...node,input_port:{port:0}},source_fields,target_fields:fields.map((f,index)=>({...f,source:source_fields[index]}))};
 let stage='input_mapping';const destinations=[];
 const state=()=>({prepared_node_context:node,wizard:{status:'observed',stage,root_tid:'MF;TF-1;WizrdMCF',root_ref:'wizard'},ui:{elements:[{tid:'MF;TF-1;WizrdMCF;btnNext',ref:'ui-next',allowed_actions:['wizard_step']}]},node_linregression:{verified:true,node_context:node,
  ...(stage==='input_mapping'?{inventory_complete:true,fields}:stage==='normalization'?{kind:'normalization',fields:fields.map(f=>({...f,norm_type:0})),source_status:'Активировано'}:stage==='learn_partition'?{kind:'partition',values:{train:100,test:0,validation:0}}:stage==='lin_regression'?{kind:'parameters',values:{pedAutoMethod:false,pedRegressionMethod:0,pedDenormalize:true,pedUseDetailedSettings:true},switches:{}}:{kind:'details',values:{pedIntercept:true},switches:{}})}});
 const channel={
  async observe({ready}){const s=state();assert.equal(ready(s),true,'the expected native configuration must be ready');return s;},
  async perform({ready,resolve}){const s=state();assert.equal(ready(s),true);const action=resolve(s);validateUiAction(action,s);destinations.push(action.expected_stage);stage=action.expected_stage;return {verified:true};}
 };
 const result=await configureLinRegression(channel,{input_fields:['X'],target_field:'Y'},{request:{target:{kind:'new'}},inputMapping});
 assert.equal(destinations.at(-1),'done');assert.equal(result.validation.status,'accepted_by_loginom_next');
 assert.equal(result.configuration.target_field,'Y');assert.equal(result.configuration.intercept,true);
 assert.deepEqual(result.configuration.fields.map(f=>[f.name,f.usage_type]),[['X',3],['Y',4]]);
});
