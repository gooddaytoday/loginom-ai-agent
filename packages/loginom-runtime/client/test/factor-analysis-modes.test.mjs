import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFactorAnalysisParameters} from '../lib/factor-analysis-parameters.mjs';
import {configureFactorAnalysis} from '../lib/factor-analysis-procedure.mjs';
import {factorAnalysisOutputColumns} from '../lib/factor-analysis-output.mjs';
import {factorAnalysisConfigurationReadback} from '../lib/factor-analysis-readback.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';

const request={target:{kind:'new'},inputs:[{input:0}],mappings:[],read:{ports:[0,1]}};
const features=['X','Y','Z'];
const fields=features.map((name,index)=>({name,label:name,type:'real',data_kind:'Непрерывный',usage_type:3,index,field_id:String(index),record_id:'role'+index}));

test('automatic PCA criteria validate thresholds before UI and cap is independent of trained count',()=>{
 for(const [mode,selection] of [['pca_eigenvalue',{eigenvalue:1.1}],['pca_variance',{variance_percent:90}]]){
  const p={factor_analysis:{features,rotation:'none',...selection}};
  validateFactorAnalysisParameters(p,mode,request);
  validateFactorAnalysisParameters({},mode,{...request,target:{kind:'existing'}});
  for(const bad of [{...p.factor_analysis,factors:2},{...p.factor_analysis,output_factors:0},{...p.factor_analysis,eigenvalue:NaN},{...p.factor_analysis,variance_percent:101}])
   assert.throws(()=>validateFactorAnalysisParameters({factor_analysis:bad},mode,request));
 }
 validateFactorAnalysisParameters({factor_analysis:{features,factors:2,rotation:'none',output_factors:1}},'pca_fixed',request);
 for(const value of [0,129,1.5,'1',null])assert.throws(()=>validateFactorAnalysisParameters({factor_analysis:{features,factors:2,rotation:'none',output_factors:value}},'pca_fixed',request));
 validateFactorAnalysisParameters({factor_analysis:{output_factors:false}},'pca_fixed',{...request,target:{kind:'existing'}});
});

function fixture(initial={}){
 const node={verified:true,document_id:'doc',workflow_id:'wf',node_id:'pca'};
 const source_fields=fields.map((f,index)=>({...f,record_id:'source'+index}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...node,input_port:{port:0}},source_fields,
  target_fields:fields.map((f,index)=>({...f,source:source_fields[index]}))};
 const native={criterion:2,rotation:0,factors:2,output_cap:false,values:{pedEigenValuesThreshold:1,pedCumDispersion:85,pedNFactors:2,pedNOutFactorsMax:1},switches:{},...initial};
 let stage='input_mapping';const actions=[];
 const state=()=>({prepared_node_context:node,wizard:{stage,root_tid:'wizard'},ui:{elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']},
  ...['pedSignificanceCriterion;ValueControl;radiofield;DisplayEl','pedSignificanceCriterion;ValueControl;radiofield-1;DisplayEl','pedSignificanceCriterion;ValueControl;radiofield-2;DisplayEl','pedRotationType;ValueControl;radiofield;DisplayEl','cntOutFactorsMax;cnt;chb;InputEl',
   'pedNFactors;ValueControl','pedEigenValuesThreshold;ValueControl','pedCumDispersion;ValueControl','pedNOutFactorsMax;ValueControl'].map(key=>({tid:'wizard;FactorAnalysisWizard;'+key,ref:key,allowed_actions:['set_checked','fill','press']}))]},
  node_factor_analysis:stage==='input_mapping'?{verified:true,inventory_complete:true,node_context:node,fields}:{verified:true,kind:'parameters',...structuredClone(native)}});
 const channel={async observe({ready}){const s=state();assert.equal(ready(s),true);return s;},async perform(task){const s=state();assert.equal(task.ready(s),true);const a=task.resolve(s);actions.push(a);
  if(a.verb==='wizard_step')stage=a.expected_stage;
  if(a.verb==='fill'){const key=a.ref.split(';')[0];native.values[key]=Number(a.text);if(key==='pedNFactors')native.factors=Number(a.text);}
  if(a.verb==='set_checked'){
   if(a.ref.startsWith('pedSignificanceCriterion'))native.criterion=a.ref.includes('radiofield-2')?2:a.ref.includes('radiofield-1')?1:0;
   if(a.ref.startsWith('pedRotationType'))native.rotation=0;
   if(a.ref.startsWith('cntOutFactorsMax'))native.output_cap=a.checked;
  }
  return {verified:true};}};
 return {channel,inputMapping,actions,native,node};
}

test('native criterion switching writes only the selected threshold and preserves output cap on omission',async()=>{
 for(const [mode,selection,key,criterion] of [['pca_eigenvalue',{eigenvalue:1.1},'pedEigenValuesThreshold',0],['pca_variance',{variance_percent:90},'pedCumDispersion',1]]){
  const f=fixture({output_cap:true});
  const result=await configureFactorAnalysis(f.channel,{factor_analysis:selection},{inputMapping:f.inputMapping,request:{...request,target:{kind:'existing'},mode}});
  assert.equal(f.native.criterion,criterion);assert.equal(f.native.values[key],Object.values(selection)[0]);
  assert.equal(f.native.factors,2);assert.equal(f.native.output_cap,true);
  assert.deepEqual(f.actions.filter(a=>a.verb==='fill').map(a=>a.ref),[key+';ValueControl']);
  assert.equal(result.configuration.output_cap,true);assert.equal(result.configuration.mode,mode);
 }
});

test('cap patch preserves two trained factors and physically limits both output schemas',async()=>{
 const f=fixture();
 const result=await configureFactorAnalysis(f.channel,{factor_analysis:{output_factors:1}},{inputMapping:f.inputMapping,request:{...request,target:{kind:'existing'},mode:'pca_fixed'}});
 assert.equal(result.configuration.factors,2);assert.equal(result.configuration.output_cap,true);assert.equal(result.configuration.output_factors,1);
 assert.deepEqual(factorAnalysisOutputColumns(result.configuration,0).map(f=>f.name),['Factor1','X','Y','Z']);
 assert.deepEqual(factorAnalysisOutputColumns(result.configuration,1).map(f=>f.name),['ColumnName','ColumnDisplayName','Factor1']);
 const preserved=fixture({output_cap:true});
 const next=await configureFactorAnalysis(preserved.channel,{}, {inputMapping:preserved.inputMapping,request:{...request,target:{kind:'existing'},mode:'pca_fixed'}});
 assert.equal(next.configuration.output_cap,true);assert.equal(preserved.actions.some(a=>a.ref?.startsWith('cntOutFactorsMax')),false);
 const disabled=fixture({output_cap:true});
 const off=await configureFactorAnalysis(disabled.channel,{factor_analysis:{output_factors:false}},{inputMapping:disabled.inputMapping,request:{...request,target:{kind:'existing'},mode:'pca_fixed'}});
 assert.equal(off.configuration.output_cap,false);assert.equal(factorAnalysisOutputColumns(off.configuration,0).length,6);
});

test('automatic readback includes the observed criterion, threshold and output limit',()=>{
 const node={document_id:'doc',workflow_id:'wf',node_id:'pca'},operation_id='pca';
 const configuration={verified:true,node_context:node,fields,mode:'pca_variance',criterion:'variance',variance_percent:90,factors:2,rotation:'none',output_cap:true,output_factors:1};
 const phases=['input_mapping','configure','node_finish','output_mapping','finish'].map(phase=>({phase,status:'verified',receipt_id:operation_id+':'+phase,value:{verified:true,cleanup_complete:true,
  ...(phase==='configure'?{configuration,validation:{status:'accepted_by_loginom_next'}}:{}),...(phase==='node_finish'?{settings_applied:true}:{}),
  ...(phase==='output_mapping'?{ports:[0,1].map(port=>({port,mapping:{target_fields:factorAnalysisOutputColumns(configuration,port)}}))}:{}),
  ...(phase==='finish'?{mode:'done',settings_applied:true}:{})}}));
 const actual=factorAnalysisConfigurationReadback({node,phases,operation_id});
 assert.equal(actual.mode,'pca_variance');assert.equal(actual.variance_percent,90);assert.equal(actual.output_factors,1);
 const validate=new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema);
 const result={operation_id,status:'SUCCEEDED',effect_possible:true,phases:[],node,execution:{status:'not_requested',execution_id:null},
  output:{status:'not_refreshed',evidence_ref:null,ports:[]},configuration:{status:'applied',readback:actual},package_saved:false,cleanup_complete:true,warnings:[]};
 assert.equal(validate(result).valid,true);
 const invalid=structuredClone(result);invalid.configuration.readback.output_factors=0;
 assert.equal(validate(invalid).valid,false);
 const bad=structuredClone(phases);bad[1].value.configuration.variance_percent=101;
 assert.throws(()=>factorAnalysisConfigurationReadback({node,phases:bad,operation_id}));
});
