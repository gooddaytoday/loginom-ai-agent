import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLogRegressionParameters,resolveLogRegressionRoles} from '../lib/log-regression-parameters.mjs';
import {configureLogRegression} from '../lib/log-regression-procedure.mjs';
import {logRegressionOutputColumns,readLogRegressionOutputs} from '../lib/log-regression-output.mjs';
import {logRegressionConfigurationReadback} from '../lib/log-regression-readback.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {describeNodeTypes} from '../lib/node-contracts.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {validateUiAction} from '../lib/workspace-ui.mjs';

const logistic={input_fields:['X'],target_field:'Target',event:'yes',threshold:0.8};
const parameters={logistic};
const fields=[['RowID','integer','Непрерывный',0],['X','real','Непрерывный',3],['Target','string','Дискретный',4],['Note','string','Дискретный',0]]
 .map(([name,type,data_kind,usage_type],index)=>({name,label:name,type,data_kind,usage_type,index,field_id:String(index),record_id:'role-'+index}));
const node={document_id:'doc',workflow_id:'flow',node_id:'logistic'};
const request={operation_id:'logistic',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'scenario',label:'Scenario'}]},target:{kind:'new',type:'datamining.log_regression'},inputs:[{source:{...node,node_id:'import'},output:0,input:0}],mode:'enter',parameters,mappings:[],finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:600000,execute_ms:600000,total_ms:600000}};

test('logistic registration and handler accept only binary Enter and its prediction port',()=>{
 const support=createCandidateNodeSupport({targetOrigin:'https://example.test',targetBuild:'7.4.2'});
 const card=describeNodeTypes(['datamining.log_regression'],{},new Map(),support.nodeApplyHandlers,'7.4.2')[0];
 assert.equal(card.palette_group,'Data_Mining');assert.deepEqual(card.modes,['enter','forward','backward','stepwise']);
 assert.equal(card.tabular_outputs,2);assert.ok(card.parameter_schema.properties.logistic.properties.event.description);
 assert.ok(validateNodeApplyRequest(request,support.nodeApplyHandlers).handler);
 for(const patch of [{mode:'apply'},{read:{...request.read,ports:[1]}},{mappings:[{direction:'output',port:0,fields:[]}]},{parameters:{...parameters,weights:'W'}}])
  assert.throws(()=>validateNodeApplyRequest({...request,...patch},support.nodeApplyHandlers));
});

test('logistic roles keep identifiers and comments and require a discrete string target',()=>{
 assert.deepEqual(resolveLogRegressionRoles(parameters,fields).map(f=>[f.name,f.usage_type]),[['RowID',0],['X',3],['Target',4],['Note',0]]);
 for(const change of [{target_field:'X'},{input_fields:['Note']},{target_field:'missing'}])assert.throws(()=>resolveLogRegressionRoles({logistic:{...logistic,...change}},fields));
 for(const threshold of [undefined,null,NaN,Infinity,-0.1,1.01])assert.throws(()=>validateLogRegressionParameters({logistic:{...logistic,threshold}},'enter'));
 for(const event of [undefined,null,'',' '])assert.throws(()=>validateLogRegressionParameters({logistic:{...logistic,event}},'enter'));
 for(const threshold of [0,0.5,1])assert.doesNotThrow(()=>validateLogRegressionParameters({logistic:{...logistic,threshold}},'enter'));
 assert.throws(()=>validateLogRegressionParameters({logistic:{...logistic,target_field:'x'}},'enter'));
});

function fixture({classes=[{index:7,label:'no'},{index:2,label:'yes'}],optionLabels=['7 (no)','2 (yes)'],mode='enter',nativeSelection,needsScroll=false}={}){
 const source_fields=fields.map(f=>({record_id:'source-'+f.index,field_id:f.field_id,name:f.name,label:f.label,type:f.type}));
 const inputMapping={verified:true,inventory_complete:true,source_identity_verified:true,mapping_wizard:'TuneDataSourceMappingWizard',node_context:{...node,verified:true,input_port:{port:0}},source_fields,target_fields:fields.map((f,i)=>({...f,source:source_fields[i]}))};
 const values={pedAutoMethod:true,pedRegressionMethod:4,pedDenormalize:true,pedUseDetailedSettings:false,pedEventType:2,pedEventId:7,pedUseScoring:false,pedSetupCalibration:false};
 const details={pedEpsilon:0.0001,pedThreshold:0.5,pedIntercept:true,pedRegSelQuality:1,pedAddSignificance:0.05,pedRemoveSignificance:0.1,...nativeSelection};
 let stage='input_mapping',picker=null,scrollTop=0;const actions=[];
 const rawState=()=>({prepared_node_context:{...node,verified:true},wizard:{status:'observed',stage,root_tid:'MF;TF-1;WizrdMCF',root_ref:'wizard'},ui:{elements:[{tid:'MF;TF-1;WizrdMCF;btnNext',ref:'ui-next',allowed_actions:['wizard_step']},
  ...Object.keys(stage==='lin_regression_details'?details:values).flatMap(key=>(stage==='lin_regression_details'?['','trg_picker']:['DisplayEl','trg_picker','InputEl']).map(part=>({tid:'MF;TF-1;WizrdMCF;'+(stage==='lin_regression_details'?'LogRegressionWizard-1':'LogRegressionWizard')+';'+key+';ValueControl'+(part?';'+part:''),ref:key+':'+part,allowed_actions:['click','set_checked','fill','press']}))),
  ...(picker==='pedEventId'?optionLabels.map((label,i)=>({label,tid:'MF;TF-1;WizrdMCF;LogRegressionWizard;pedEventId;ValueControl;boundlist;'+i,ref:'event-'+i,allowed_actions:['click']})):picker?[{label:picker==='pedRegressionMethod'?({enter:'Enter (Принудительное включение)',forward:'Forward (Пошаговое включение)',backward:'Backward (Пошаговое исключение)',stepwise:'Stepwise (Пошаговое включение/исключение)'})[mode]:picker==='pedRegSelQuality'?'Deviance':'Задано явно',tid:'boundlist-option',ref:'option',allowed_actions:['click']}]:[])]},
  node_logregression:{verified:true,node_context:{...node,verified:true},...(stage==='input_mapping'?{fields,inventory_complete:true}:stage==='normalization'?{kind:'normalization',fields:fields.filter(f=>f.usage_type).map(f=>({...f,norm_type:f.usage_type===3?0:1,importance:1,irremovable:false})),source_status:'Вход активирован'}:stage==='learn_partition'?{kind:'partition',values:{train:100,test:0,validation:0}}:stage==='lin_regression'?{kind:'parameters',values,classes,switches:{}}:{kind:'details',values:details,switches:{},disabled:{pedRegSelQuality:false,pedAddSignificance:details.pedRegSelQuality!==0||mode==='backward',pedRemoveSignificance:details.pedRegSelQuality!==0||mode==='forward'}})}});
 const state=()=>{const s=rawState();if(needsScroll&&stage==='lin_regression_details')for(const e of s.ui.elements){if(e.ref.startsWith('ped')){e.scroll={ref:'details-scroll',top:scrollTop,max_top:43};e.interaction={state:'point_observed'};e.enabled=true;e.allowed_actions.push('scroll');}}if(stage==='lin_regression_details')for(const e of s.ui.elements)if(/;ped(?:Epsilon|Threshold);ValueControl$/.test(e.tid??'')){e.identity={anchor_tid:e.tid,path:[1,0,0,0]};e.signature={tag:'input'};e.tid=null;}return s;};
 const channel={async observe({ready,condition}){const s=state();assert.ok(ready(s),condition);return s;},async perform({ready,resolve,initialObservation}){
  const s=initialObservation??state();assert.ok(ready(s));const a=resolve(s);actions.push(a);
  if(a.verb==='wizard_step'){validateUiAction(a,s);stage=a.expected_stage;return;}
  const key=a.ref.split(':')[0],target=stage==='lin_regression_details'?details:values;
  if(a.verb==='scroll'){scrollTop=43;return;}
  if(a.verb==='fill'&&key==='pedRemoveSignificance'&&needsScroll&&scrollTop===0)throw Error('UI_REFERENCE_OBSCURED');
  if(a.verb==='set_checked')target[key]=a.checked;
  else if(a.verb==='fill')target[key]=Number(a.text);
  else if(a.ref.startsWith('event-')){target.pedEventId=classes[Number(a.ref.slice(6))].index;picker=null;}
  else if(a.ref==='option'){target[picker]=picker==='pedRegressionMethod'?['enter','forward','backward','stepwise'].indexOf(mode):picker==='pedRegSelQuality'?0:picker==='pedEventType'?4:2;picker=null;}
  else if(a.verb==='click')picker=key;
 }};
 return {channel,inputMapping,actions,values,details,run:()=>configureLogRegression(channel,parameters,{request:{...request,mode},inputMapping})};
}

test('Enter resolves event from observed classes, sets explicit threshold/epsilon and advances to Done',async()=>{
 const f=fixture(),result=await f.run();
 assert.equal(f.values.pedEventId,2);assert.equal(f.values.pedEventType,4);assert.equal(f.values.pedAutoMethod,false);assert.equal(f.values.pedRegressionMethod,0);
 assert.equal(f.details.pedEpsilon,1e-10);assert.equal(f.details.pedThreshold,0.8);
 assert.equal(f.actions.find(a=>a.verb==='fill'&&a.ref.startsWith('pedEpsilon:')).text,'0.0000000001');
 assert.equal(result.configuration.event,'yes');assert.equal(result.configuration.threshold,0.8);assert.equal(result.configuration.intercept,true);
 assert.deepEqual(result.configuration.classes,[{index:7,label:'no'},{index:2,label:'yes'}]);
 assert.equal(f.actions.at(-1).expected_stage,'done');
});

test('missing event and nonbinary classes refuse before selecting any method or committing settings',async()=>{
 for(const classes of [[{index:0,label:'0'}],[{index:0,label:'0'},{index:1,label:'1'},{index:2,label:'2'}]]){
  const f=fixture({classes});await assert.rejects(f.run(),/two|event|binary/);
  assert.ok(f.actions.every(a=>a.verb==='wizard_step'));assert.ok(!f.actions.some(a=>a.expected_stage==='done'));
 }
});

test('only port zero retains native Boolean probability category and original NULL values',async()=>{
 const schema=logRegressionOutputColumns({fields}),rows=[[false,0.5,true,'no',15,0,'yes',null]];
 assert.deepEqual(schema.map(f=>f.name),['PredictionEvent','PredictionProbability','ActualEvent','Target_predicted','RowID','X','Target','Note']);
 const output={port:0,port_guid:'port-zero',schema:schema.map((f,index)=>({...f,index})),sample:rows,sample_complete:true};
 const result=await readLogRegressionOutputs({readOutputPort:async()=>({output})},request.read,{portExecution:{},execution:{execution_id:'fresh'},receipt_id:'read'},{ports:[{port:0,schema}]});
 assert.deepEqual(result.ports[0].sample,rows);
 output.schema[1].type='string';await assert.rejects(readLogRegressionOutputs({readOutputPort:async()=>({output})},request.read,{portExecution:{},execution:{execution_id:'fresh'},receipt_id:'read'},{ports:[{port:0,schema}]}));
});

test('readback binds training, event and cutoff to committed settings and separate Execute',()=>{
 const c={verified:true,node_context:node,fields,target_field:'Target',classes:[{index:0,label:'no'},{index:1,label:'yes'}],event:'yes',threshold:0.8,intercept:true,epsilon:1e-10};
 const entries={input_mapping:{},configure:{configuration:c,validation:{status:'accepted_by_loginom_next'}},node_finish:{settings_applied:true},output_mapping:{},finish:{settings_applied:true,mode:'execute',execution_id:'execute',training:{status:'trained',node,execution_id:'teach',source:[{node:{...node,node_id:'import'},output:0,input:0}]}}};
 const candidate={node,operation_id:'logistic',phases:Object.entries(entries).map(([phase,value])=>({phase,status:'verified',receipt_id:'logistic:'+phase,value:{verified:true,cleanup_complete:true,...value}}))};
 const result=logRegressionConfigurationReadback(candidate);assert.equal(result.threshold,0.8);assert.equal(result.event,'yes');assert.equal(result.training.execution_id,'teach');assert.equal(result.package_persistence_verified,false);
 entries.finish.training.execution_id='execute';assert.throws(()=>logRegressionConfigurationReadback(candidate),/training/);
});

for(const mode of ['forward','backward','stepwise'])test(mode+' uses native selection defaults without public selection parameters',async()=>{
 assert.doesNotThrow(()=>validateLogRegressionParameters(parameters,mode));
 const f=fixture({mode,nativeSelection:{pedAddSignificance:0.95,pedRemoveSignificance:0.99}}),r=await f.run();
 assert.equal(r.configuration.mode,mode);assert.equal(Object.hasOwn(r.configuration,'selection'),false);
 assert.equal(f.details.pedRegSelQuality,0);
 if(mode!=='backward')assert.equal(f.details.pedAddSignificance,0.05);
 if(mode!=='forward')assert.equal(f.details.pedRemoveSignificance,0.1);
 const edited=f.actions.filter(a=>a.verb==='fill').map(a=>a.ref.split(':')[0]);
 assert.equal(edited.includes('pedAddSignificance'),mode!=='backward');
 assert.equal(edited.includes('pedRemoveSignificance'),mode!=='forward');
});

test('custom selection criteria and significance cutoffs refuse before UI for every method',()=>{
 const support=createCandidateNodeSupport({targetOrigin:'https://example.test',targetBuild:'7.4.2'});
 const card=describeNodeTypes(['datamining.log_regression'],{},new Map(),support.nodeApplyHandlers,'7.4.2')[0];
 assert.equal(Object.hasOwn(card.parameter_schema.properties.logistic.properties,'selection'),false);
 for(const mode of ['enter','forward','backward','stepwise'])for(const selection of [{},...['deviance','aic','aicc','bic','hqic'].map(criterion=>({criterion})),{criterion:'deviance',entry_significance:0,removal_significance:0.2}]){
  const p={logistic:{...logistic,selection}};
  assert.throws(()=>validateLogRegressionParameters(p,mode),/not supported/);
  assert.throws(()=>validateNodeApplyRequest({...request,mode,parameters:p},support.nodeApplyHandlers));
 }
});

test('Backward reveals its clipped default removal cutoff using a visible anchor in the same scroll region',async()=>{
 const f=fixture({mode:'backward',nativeSelection:{pedRemoveSignificance:0.2},needsScroll:true});
 await f.run();assert.equal(f.details.pedRemoveSignificance,0.1);
 assert.equal(f.actions.filter(a=>a.verb==='scroll').length,1);
 assert.ok(f.actions.findIndex(a=>a.verb==='scroll')<f.actions.findIndex(a=>a.verb==='fill'&&a.ref.startsWith('pedRemoveSignificance')));
});
