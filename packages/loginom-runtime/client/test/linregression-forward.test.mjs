import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLinRegressionParameters,resolveLinRegressionRoles} from '../lib/linregression-parameters.mjs';
import {configureLinRegression} from '../lib/linregression-procedure.mjs';
import {validateUiAction} from '../lib/workspace-ui.mjs';
import {linRegressionConfigurationReadback} from '../lib/linregression-readback.mjs';

const p={input_fields:['X'],target_field:'Y'},criteria=['f','r2','adjusted_r2','aic','aicc','bic','hqc'];
test('Forward accepts only applicable scoped selection parameters and retains role identities',()=>{
 for(const criterion of criteria){
  const parameters={...p,linear_regression:{selection:{criterion,...(criterion==='f'?{add_significance:0.03,remove_significance:0.12}:{})}}};
  assert.doesNotThrow(()=>validateLinRegressionParameters(parameters,'forward'));
  assert.deepEqual(resolveLinRegressionRoles(parameters,[{name:'X',type:'real',data_kind:'Непрерывный'},{name:'Y',type:'real',data_kind:'Непрерывный'}]).map(f=>f.usage_type),[3,4]);
 }
 for(const selection of [{criterion:'unknown'},{criterion:'f',add_significance:0},{criterion:'f',remove_significance:1},{criterion:'aic',add_significance:0.05},{criterion:'f',extra:true}])
  assert.throws(()=>validateLinRegressionParameters({...p,linear_regression:{selection}},'forward'));
 for(const mode of ['enter','apply'])assert.throws(()=>validateLinRegressionParameters({...p,linear_regression:{selection:{criterion:'f'}}},mode));
});

function replay(criterion,fault){
 const node={verified:true,document_id:'doc',workflow_id:'flow',node_id:'regression'};
 const fields=['X','Y'].map((name,index)=>({name,label:name,type:'real',data_kind:'Непрерывный',index,field_id:String(index),record_id:'role-'+index,usage_type:index===0?3:4}));
 const source_fields=fields.map(f=>({record_id:'source-'+f.index,field_id:f.field_id,name:f.name,label:f.label,type:f.type}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...node,input_port:{port:0}},source_fields,target_fields:fields.map((f,index)=>({...f,source:source_fields[index]}))};
 let stage='input_mapping',picker=null;
 const actions=[],values={pedAutoMethod:true,pedRegressionMethod:0,pedDenormalize:true,pedUseDetailedSettings:false,pedIntercept:true,pedEpsilon:0.0001,pedRegSelQuality:0,pedAddSignificance:0.05,pedRemoveSignificance:0.1};
 const state=()=>{
  const card=stage==='lin_regression_details'?'LinRegressionWizard-1':'LinRegressionWizard';
  const elements=[{tid:'W;btnNext',ref:'ui-next',allowed_actions:['wizard_step']}];
  for(const key of Object.keys(values))for(const suffix of ['ValueControl','ValueControl;DisplayEl','ValueControl;trg_picker'])elements.push({tid:'W;'+card+';'+key+';'+suffix,ref:'ui-'+key+'-'+suffix.replaceAll(';','-').replaceAll('_','-'),allowed_actions:['fill','press','click','set_checked']});
  if(picker)for(const [value,label] of (picker==='pedRegressionMethod'?[[0,'Enter (Принудительное включение)'],[1,'Forward (Пошаговое включение)']]:criteria.map((c,i)=>[i,'native '+c])))elements.push({tid:'W;'+card+';'+picker+';ValueControl;boundlist;'+label,ref:'ui-option-'+value,label,allowed_actions:['click']});
  return {prepared_node_context:node,wizard:{status:'observed',stage,root_tid:'W',root_ref:'wizard'},ui:{elements},node_linregression:{verified:true,node_context:node,
   ...(stage==='input_mapping'?{inventory_complete:true,fields}:stage==='normalization'?{kind:'normalization',fields:fields.map(f=>({...f,norm_type:0})),source_status:'Активировано'}:stage==='learn_partition'?{kind:'partition',values:{train:100,test:0,validation:0}}:{kind:stage==='lin_regression'?'parameters':'details',values:{...values},switches:{},disabled:{pedRegSelQuality:false,pedAddSignificance:values.pedRegSelQuality!==0,pedRemoveSignificance:true},selection_choices:criteria.map((c,value)=>({value,label:'native '+c}))})}};
 };
 const channel={async observe({ready}){const s=state();assert.equal(ready(s),true,'ready '+stage);return s;},async perform({ready,resolve}){
  const s=state();assert.equal(ready(s),true);const a=resolve(s);validateUiAction(a,s);actions.push(a);
  if(a.verb==='wizard_step'){stage=a.expected_stage;return;}
  if(a.ref.startsWith('ui-option-')){values[picker]=Number(a.ref.slice(10));picker=null;return;}
  const key=a.ref.split('-')[1];
  if(a.verb==='set_checked')values[key]=a.checked;
  if(a.verb==='fill'&&fault!=='stale')values[key]=Number(a.text);
  if(a.verb==='click'&&a.ref.endsWith('trg-picker'))picker=key;
 }};
 return {actions,run:()=>configureLinRegression(channel,{...p,linear_regression:{selection:{criterion,...(criterion==='f'?{add_significance:0.03,remove_significance:0.1}:{})}}},{request:{mode:'forward',target:{kind:'new'}},inputMapping})};
}
for(const criterion of criteria)test('production Forward procedure selects and reads back '+criterion,async()=>{
 const f=replay(criterion),r=await f.run();assert.equal(r.configuration.mode,'forward');
 assert.equal(r.configuration.selection.criterion,criterion);assert.equal(r.configuration.epsilon,1e-10);
 if(criterion==='f'){assert.equal(r.configuration.selection.add_significance,0.03);assert.equal(f.actions.some(a=>a.ref?.startsWith('ui-pedRemoveSignificance')),false);}
 assert.equal(f.actions.at(-1).expected_stage,'done');
});
test('Forward refuses stale numeric readback before committing the wizard',async()=>{
 const f=replay('f','stale');await assert.rejects(f.run(),/differs|readback/);assert.notEqual(f.actions.at(-1).expected_stage,'done');
});
test('Forward receipt exposes the observed method, selection and solver accuracy',()=>{
 const node={document_id:'doc',workflow_id:'flow',node_id:'regression'},operation_id='forward';
 const c={verified:true,node_context:node,mode:'forward',fields:[{name:'X',usage_type:3}],target_field:'Y',intercept:true,selection:{criterion:'f',add_significance:0.05},epsilon:1e-10};
 const phases=['input_mapping','configure','node_finish','output_mapping','finish'].map(phase=>({phase,status:'verified',receipt_id:operation_id+':'+phase,value:{verified:true,cleanup_complete:true,settings_applied:true,configuration:c,validation:{status:'accepted_by_loginom_next'},mode:'execute',execution_id:'execute',training:{status:'trained',execution_id:'train',source:[{}]}}}));
 const r=linRegressionConfigurationReadback({node,phases,operation_id});assert.equal(r.mode,'forward');assert.deepEqual(r.selection,c.selection);assert.equal(r.epsilon,1e-10);
});
