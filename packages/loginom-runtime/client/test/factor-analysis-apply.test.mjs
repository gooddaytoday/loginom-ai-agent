import test from 'node:test';
import assert from 'node:assert/strict';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
import {validateFactorAnalysisParameters} from '../lib/factor-analysis-parameters.mjs';
import {configureFactorAnalysis} from '../lib/factor-analysis-procedure.mjs';
import {factorAnalysisConfigurationReadback} from '../lib/factor-analysis-readback.mjs';
import {createFactorAnalysisNodeSupport} from '../lib/factor-analysis-node.mjs';
import {nodeApplyResultSchema} from '../lib/node-result-schema.mjs';

const request={mode:'apply',target:{kind:'existing'},inputs:[],mappings:[],finish:'execute',read:{ports:[0,1]}};
const node={document_id:'doc',workflow_id:'flow',node_id:'pca'};
const fields=['RowID','X','Y','Z','Tag'].map((name,index)=>({index,name,label:name,type:index===0?'integer':index===4?'string':'real',data_kind:index===4?'Дискретный':'Непрерывный',usage_type:index>0&&index<4?3:0}));

function fixture(patch={}){
 let stage='input_mapping';const actions=[];
 const params={verified:true,kind:'parameters',criterion:2,factors:2,rotation:0,output_cap:false,values:{pedEigenValuesThreshold:1.1,pedCumDispersion:90,pedNOutFactorsMax:1},switches:{},...patch};
 const state=()=>({prepared_node_context:{...node,verified:true,surface:stage==='graph'?'graph':'wizard',locked:false},
  wizard:stage==='graph'?{status:'absent'}:{status:'observed',stage,root_tid:'wizard',root_ref:'root',owner_context:{status:'observed',node}},
  ui:{dialogs:[],masks:[],elements:[{tid:'wizard;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'wizard;btnClose',ref:'close',allowed_actions:['click']}]},
  node_factor_analysis:stage==='input_mapping'?{verified:true,inventory_complete:true,node_context:node,fields}:params});
 const channel={async observe({ready}){const s=state();assert.equal(ready(s),true);return s;},async perform(task){const s=state();assert.equal(task.ready(s),true);const a=task.resolve(s);actions.push(a);stage=a.ref==='close'?'graph':a.expected_stage;return {verified:true};}};
 return {channel,actions,params};
}

test('saved-model apply accepts only an existing node with no settings or connection edits',()=>{
 validateFactorAnalysisParameters({},'apply',request);
 for(const p of [{factor_analysis:{}},{factor_analysis:{features:['X','Y'],factors:2,rotation:'none'}},null,[]])assert.throws(()=>validateFactorAnalysisParameters(p,'apply',request));
 for(const patch of [{target:{kind:'new'}},{inputs:[{input:0}]},{mappings:[{port:0}]},{finish:'done'},{finish:'close'},{read:{ports:[2]}}])assert.throws(()=>validateFactorAnalysisParameters({},'apply',{...request,...patch}));
});

test('apply observes saved PCA settings without editing roles, parameters or output mappings',async()=>{
 for(const criterion of [0,1,2])for(const rotation of [0,1,2]){
  const f=fixture({criterion,rotation,output_cap:true});
  const result=await configureFactorAnalysis(f.channel,{}, {request});
  assert.equal(result.configuration.mode,'apply');assert.equal(result.configuration.criterion,['eigenvalue','variance','fixed'][criterion]);
  assert.equal(result.configuration.rotation,['none','varimax','quartimax'][rotation]);
  assert.equal(result.configuration.output_factors,1);assert.deepEqual(result.configuration.fields,fields);
  assert.equal(result.settings_applied,false);assert.equal(result.validation.status,'observed_saved_settings');
  assert.deepEqual(f.actions,[{verb:'wizard_step',ref:'next',expected_stage:'factor_analysis'}]);
 }
});

test('apply cancels unsupported saved settings instead of editing or training',async()=>{
 for(const patch of [{rotation:3},{criterion:3},{factors:4},{switches:{pedNFactors:true}},{output_cap:true,values:{pedNOutFactorsMax:0}}]){
  const f=fixture(patch);
  await assert.rejects(()=>configureFactorAnalysis(f.channel,{}, {request}),error=>{
   assert.equal(error.nodePhaseRefusal?.settings_unchanged,true);
   assert.equal(error.nodePhaseRefusal?.proof.closed.draft_discarded,true);return true;
  });
  assert.equal(f.actions.at(-1).ref,'close');assert.ok(f.actions.every(a=>['wizard_step','click'].includes(a.verb)));
 }
});

test('apply input phase skips the native mapping editor',async()=>{
 const support=createFactorAnalysisNodeSupport({});
 const driver=support.nodeApplyDriverFactory({operation:{id:'apply',parameters:{mode:'apply'},nodeApply:{request}},execute:()=>assert.fail('input mapping must be untouched')});
 const mapped=await driver.mapPorts([],{receipt_id:'apply:input_mapping'});
 assert.equal(mapped.settings_applied,false);assert.equal(mapped.effect_possible,false);
});

test('apply readback requires Cancel, preserved settings and absence of training',async()=>{
 const f=fixture();const configured=await configureFactorAnalysis(f.channel,{}, {request});
 const operation_id='apply';
 const phases=['input_mapping','configure','node_finish','output_mapping','finish'].map(phase=>({phase,status:'verified',receipt_id:operation_id+':'+phase,value:{verified:true,cleanup_complete:true,
  ...(phase==='configure'?configured:{}),...(phase==='node_finish'?{settings_applied:false,draft_discarded:true}:{}),
  ...(phase==='output_mapping'?{ports:[{port:0},{port:1}]}:{}),...(phase==='finish'?{mode:'execute',settings_applied:false,execution_id:'execute'}:{})}}));
 const readback=factorAnalysisConfigurationReadback({node,phases,operation_id});
 assert.equal(readback.mode,'apply');assert.deepEqual(readback.training,{status:'not_requested'});assert.deepEqual(readback.output_mappings,[]);
 const result={operation_id,status:'SUCCEEDED',effect_possible:true,phases:[],node,execution:{status:'completed',execution_id:'execute'},output:{status:'not_refreshed',evidence_ref:null,ports:[]},configuration:{status:'applied',readback},package_saved:false,cleanup_complete:true,warnings:[]};
 assert.equal(new AjvJsonSchemaValidator().getValidator(nodeApplyResultSchema)(result).valid,true);
 for(const [phase,patch] of [['node_finish',{settings_applied:true}],['node_finish',{draft_discarded:false}],['finish',{settings_applied:true}],['finish',{training:{status:'trained'}}]]){
  const bad=structuredClone(phases);Object.assign(bad.find(p=>p.phase===phase).value,patch);
  assert.throws(()=>factorAnalysisConfigurationReadback({node,phases:bad,operation_id}));
 }
});
