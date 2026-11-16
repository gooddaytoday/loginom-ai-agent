import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLinRegressionParameters,resolveLinRegressionRoles} from '../lib/linregression-parameters.mjs';
import {linRegressionParametersSchema} from '../lib/node-api.mjs';
import vm from 'node:vm';
import {readLinRegressionBrowser} from '../lib/linregression-context.mjs';
import {configureLinRegression} from '../lib/linregression-procedure.mjs';

const parameters={input_fields:['X','Category'],target_field:'Y',linear_regression:{statistics:'full',normalization:[{field:'Category',method:'indicator',reference:'first'}]}};
const fields=[['RowID','integer','Непрерывный'],['X','integer','Непрерывный'],['Category','string','Дискретный'],['Y','real','Непрерывный']].map(([name,type,data_kind])=>({name,type,data_kind}));
test('C11 accepts an explicitly declared discrete string indicator while retaining all input fields',()=>{
 assert.doesNotThrow(()=>validateLinRegressionParameters(parameters,'enter'));
 assert.deepEqual(resolveLinRegressionRoles(parameters,fields).map(f=>[f.name,f.usage_type]),[['RowID',0],['X',3],['Category',3],['Y',4]]);
 assert.equal(linRegressionParametersSchema.properties.linear_regression.properties.normalization.items.properties.reference.enum[0],'first');
});

function nativeFixture(change=()=>{}){
 const base='MF;TF;WizrdMCF;NormTuneWizard;',elements=new Map(),components={};
 const add=(tid,c={})=>{const e={id:tid,checkVisibility:()=>true,getBoundingClientRect:()=>({x:0,y:0,width:100,height:20})};elements.set(tid,[e]);components[tid]={...c,el:{dom:e}};return e;};
 add(base.slice(0,-1));
 const records=[{isModel:true,internalId:'category',data:{Name:'Category',DisplayName:'Category',DataType:5,UsageType:3,Index:1,NormType:7,Importance:1,Irremovable:false}}];
 const store={$className:'Ext.data.Store',getProxy:()=>({$className:'bg.ext.CollectionProxy'}),getData:()=>({items:records}),getCount:()=>records.length,isLoading:()=>false};
 add(base+'grdNormColumns;tbl',{getStore:()=>store,getSelectionModel:()=>({getSelection:()=>records})});
 const values=['A','B','C'].map((UniqueValue,index)=>({isModel:true,data:{UniqueValue,RefCount:6,Selected:index===0}}));
 const valuesStore={$className:'Ext.data.Store',getProxy:()=>({$className:'Ext.data.proxy.Memory'}),getData:()=>({items:values}),getCount:()=>values.length,isLoading:()=>false};
 const refBase=base+'NormSettingsForm;DiscreteNormParamsForm;';
 add(refBase+'cbxReferenceType',{getValue:()=>0,isDisabled:()=>false});add(refBase+'grdUniqueValues;tbl',{getStore:()=>valuesStore});
 const status=add(base+'txtActivationPortStatus');status.querySelector=()=>({value:'Активировано'});
 change({values,valuesStore,records,components,refBase});
 const document={querySelectorAll:q=>q.startsWith('[data-tid=')?elements.get(JSON.parse(q.slice(10,-1)))??[]:[]};
 return JSON.parse(JSON.stringify(vm.runInNewContext('('+readLinRegressionBrowser.toString()+')',{document,Ext:{getCmp:id=>components[id]},innerWidth:1280,innerHeight:800})('MF;TF')));
}
test('the production native reader binds the indicator to its selected field and complete local values',()=>{
 const s=nativeFixture();assert.equal(s.verified,true);assert.equal(s.fields[0].type,'string');assert.equal(s.fields[0].norm_type,7);
 assert.deepEqual(s.indicator,{record_id:'category',field:'Category',reference_type:0,values:['A','B','C'].map((value,index)=>({index,value,count:6,selected:index===0}))});
 for(const change of [f=>{f.valuesStore.isLoading=()=>true;},f=>{f.valuesStore.getCount=()=>4;},f=>{f.valuesStore.getProxy=()=>({$className:'Ext.data.proxy.Ajax'});},f=>{f.values[1].data.UniqueValue='A';},f=>{f.components[f.refBase+'cbxReferenceType'].el.dom={};}])assert.equal(nativeFixture(change).verified,false);
});

function replay(fault){
 const node={verified:true,document_id:'doc',workflow_id:'flow',node_id:'node'};
 const roles=fields.map((f,index)=>({...f,label:f.name,index,record_id:'r'+index,field_id:String(index),usage_type:index===0?0:index===3?4:3}));
 const source=roles.map((f,index)=>({...f,record_id:'s'+index})),inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...node,input_port:{port:0}},source_fields:source,target_fields:roles.map((f,i)=>({...f,source:source[i]}))};
 const normal=roles.filter(f=>f.usage_type!==0).map(f=>({...f,norm_type:f.type==='string'?7:0,importance:1,irremovable:false}));
 let stage='input_mapping',selected=false,picker=false,reference=3,show=false;const actions=[];
 const state=()=>({prepared_node_context:node,wizard:{stage,root_tid:'W'},node_linregression:{verified:true,
  ...(stage==='input_mapping'?{inventory_complete:true,fields:roles,node_context:node}:stage==='normalization'?{kind:'normalization',fields:normal,source_status:'Активировано',...(selected?{indicator:{record_id:'r2',field:'Category',reference_type:reference,values:['A','B','C'].map((value,index)=>({index,value,count:6,selected:index===(fault==='wrong-reference'?1:0)}))}}:{})}:stage==='learn_partition'?{kind:'partition',values:{sampling:0,validation:0,train:100,test:0},sizes:[{unit:'percent'},{unit:'percent'}]}:stage==='lin_regression'?{kind:'parameters',values:{pedAutoMethod:false,pedRegressionMethod:0,pedDenormalize:true,pedUseDetailedSettings:true,pedShowRefCoeffs:show},switches:{}}:{kind:'details',values:{pedIntercept:true,pedPredictionIntervalLevel:95},switches:{}})},
  ui:{elements:[{tid:'W;btnNext',ref:'next',allowed_actions:['wizard_step']},{tid:'W;NormTuneWizard;colDisplayName_Category',ref:'category',allowed_actions:['click']},{tid:'W;NormTuneWizard;NormSettingsForm;DiscreteNormParamsForm;cbxReferenceType;trg_picker',ref:'picker',allowed_actions:['click']},...(picker?[{tid:'W;NormTuneWizard;NormSettingsForm;DiscreteNormParamsForm;cbxReferenceType;boundlist;Первое_в_списке',ref:'first',allowed_actions:['click']}]:[]),{tid:'W;LinRegressionWizard;pedShowRefCoeffs;ValueControl;DisplayEl',ref:'show',allowed_actions:['set_checked']}]}});
 const channel={async observe(o){const s=state();assert.ok(o.ready(s),o.condition);return s;},async perform(o){const s=state();assert.ok(o.ready(s),o.condition);const a=o.resolve(s);actions.push(a);if(a.verb==='wizard_step')stage=a.expected_stage;else if(a.ref==='category')selected=true;else if(a.ref==='picker')picker=true;else if(a.ref==='first'){reference=0;picker=false;}else if(a.ref==='show')show=a.checked;else assert.fail('unrecognized action');}};
 return {actions,run:()=>configureLinRegression(channel,parameters,{request:{mode:'enter'},inputMapping})};
}
test('the production configure path selects first reference, verifies it, and enables its zero coefficient',async()=>{
 const f=replay(),r=await f.run();assert.deepEqual(r.configuration.indicators,[{field:'Category',method:'indicator',reference:'first',reference_value:'A'}]);
 assert.equal(r.configuration.show_reference_coefficients,true);assert.equal(r.configuration.statistics,'full');
 assert.deepEqual(f.actions.filter(a=>a.verb==='click').map(a=>a.ref),['category','picker','first']);
 assert.deepEqual(f.actions.find(a=>a.ref==='show'),{verb:'set_checked',checked:true,ref:'show'});
 const bad=replay('wrong-reference');await assert.rejects(bad.run(),/first reference/);assert.equal(bad.actions.some(a=>a.expected_stage==='learn_partition'),false);
});

test('serialized normalization observer exposes only the exact first reference choice',async()=>{
 const {Page}=await import('./support/workspace-ui-fixture.mjs');const page=new Page(),base='MF;TF-1;WizrdMCF',form=page.add('div',base);
 page.add('div',base+';NormTuneWizard','',undefined,form);
 const ref=base+';NormTuneWizard;NormSettingsForm;DiscreteNormParamsForm;cbxReferenceType';
 const picker=page.add('div',ref+';trg_picker','',{x:100,y:100,width:20,height:20},form);
 const first=page.add('li',ref+';boundlist;Первое_в_списке','Первое в списке',{x:100,y:150,width:150,height:20},form);
 const s=await page.observe();assert.equal(s.wizard.stage,'normalization');
 for(const e of [picker,first])assert.ok(s.ui.elements.find(v=>v.tid===e.getAttribute('data-tid'))?.allowed_actions.includes('click'));
});
test('C11 rejects unsupported category requests before any Loginom effect',()=>{
 for(const change of [
  p=>{p.linear_regression.statistics='coefficients';},
  p=>{p.linear_regression.normalization[0].reference='last';},
  p=>{p.linear_regression.normalization[0].method='standard';},
  p=>{p.linear_regression.normalization[0].field='Y';},
  p=>{p.linear_regression.normalization.push({...p.linear_regression.normalization[0]});},
  p=>{p.linear_regression.normalization[0].reference_value='A';},
  p=>{p.linear_regression.normalization=[];},
 ]){const p=structuredClone(parameters);change(p);assert.throws(()=>validateLinRegressionParameters(p,'enter'));}
 for(const mode of ['apply','forward','backward','stepwise','ridge','lasso','elastic'])assert.throws(()=>validateLinRegressionParameters(parameters,mode));
 for(const [name,patch] of [['Category',{type:'boolean'}],['Category',{data_kind:'Непрерывный'}],['X',{type:'string'}],['Y',{type:'string',data_kind:'Дискретный'}]]){
  assert.throws(()=>resolveLinRegressionRoles(parameters,fields.map(f=>f.name===name?{...f,...patch}:f)));
 }
 const p=structuredClone(parameters);delete p.linear_regression.normalization;assert.throws(()=>resolveLinRegressionRoles(p,fields));
 const p2=structuredClone(parameters);p2.linear_regression.normalization[0].field='X';assert.throws(()=>resolveLinRegressionRoles(p2,fields));
});
