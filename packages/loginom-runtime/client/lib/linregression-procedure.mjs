import {resolveLinRegressionRoles} from './linregression-parameters.mjs';
import {bindReformInput} from './reform-input.mjs';
import {readOutputDefinitionPages,observeOutputDefinitionPage} from './import-definition-pages.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
const need=(v,m)=>{if(!v)throw Error('Linear regression: '+m);};
const semantic=fs=>fs.map(({selected,origin_type,...f})=>f);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function linRegressionApplyRefusal(message,closed,phase){
 const error=Error('Linear regression apply: '+message+'; no settings changed and no training requested');
 error.nodePhaseRefusal={phase,status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,
  verification:'linregression_apply_preserved',proof:{closed}};
 return error;
}
export async function configureLinRegressionRoles(channel,p,inputMapping,{preserve=false}={}){
 const ready=s=>s.wizard?.stage==='input_mapping'&&s.node_linregression?.verified===true;
 const observe=condition=>channel.observe({condition,readLinRegression:true,ready});
 const bind=s=>preserve?s.node_linregression:bindReformInput(s.node_linregression,inputMapping);
 const baseline=bind(await observe('complete regression roles'));
 if(!preserve)need(baseline.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===inputMapping.target_fields[i][k])),'role schema differs from incoming fields');
 if(preserve){
  const matches=baseline.fields.every(f=>f.usage_type===(p.input_fields.includes(f.name)?3:f.name===p.target_field?4:0))
   &&[...p.input_fields,p.target_field].every(name=>baseline.fields.some(f=>f.name===name&&['integer','real'].includes(f.type)&&f.data_kind==='Непрерывный'));
  if(!matches)throw linRegressionApplyRefusal('requested roles differ from the saved model',await closePreparedWizard(channel),'configure');
  return {verified:true,cleanup_complete:true,effect_possible:false,configuration:baseline,settings_applied:false};
 }
 const expected=resolveLinRegressionRoles(p,baseline.fields);let current=baseline.fields,edits=0;
 for(const wanted of expected){
  const original=current.find(f=>f.record_id===wanted.record_id);if(original.usage_type===wanted.usage_type)continue;
  const check=bind(await observe('roles before edit'));need(same(semantic(check.fields),semantic(current)),'roles changed before editor');
  const definition=await readOutputDefinitionPages(channel,{expectedCount:current.length});
  let s=await observeOutputDefinitionPage(channel,{offset:Math.floor(original.index/8)*8,schemaId:definition.schema_id,total:definition.total_columns,field:original,fieldAction:'double_click'});
  const root=s.wizard.root_ref,row=s=>s.wizard.output_columns.fields.find(f=>f.name===original.name);
  await channel.perform({condition:'edit exact regression role',initialObservation:s,ready:s=>s.wizard.root_ref===root&&!!row(s),identity:()=>original,
   resolve:s=>({verb:'double_click',ref:row(s).name_ref})});
  const editor=s=>s.wizard?.root_ref===root&&s.wizard.column_parameters?.status==='observed'&&s.wizard.column_parameters.portal_bound===true&&s.wizard.column_parameters.selected_column?.name===original.name;
  const choice=(e,kind)=>e.wizard_combo?.kind===kind&&e.wizard_combo.field.scope==='output_column'&&e.wizard_combo.field.name==='usage';
  const unique=(s,p)=>{const es=s.ui.elements.filter(p);need(es.length===1,'exact role control unavailable');return es[0];};
  const pickerReady=s=>editor(s)&&s.ui.elements.filter(e=>choice(e,'picker')&&e.allowed_actions.includes('click')).length===1;
  s=await channel.observe({condition:'bound regression role editor',ready:pickerReady});
  await channel.perform({condition:'open regression role choices',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'click',ref:unique(s,e=>choice(e,'picker')&&e.allowed_actions.includes('click')).ref})});
  const label={0:'Не задано',3:'Входное',4:'Выходное'}[wanted.usage_type];
  s=await channel.observe({condition:'regression role option',ready:s=>editor(s)&&s.ui.elements.some(e=>choice(e,'option')&&e.wizard_combo.label===label)});
  await channel.perform({condition:'select regression role',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'select_wizard_option',ref:unique(s,e=>choice(e,'option')&&e.wizard_combo.label===label).ref})});
  s=await channel.observe({condition:'regression role applied in editor',ready:s=>editor(s)&&s.wizard.column_parameters.fields.usage.value===label
   &&s.ui.elements.filter(e=>e.column_close?.scope==='output'&&e.allowed_actions.includes('apply_output_column')).length===1});
  await channel.perform({condition:'commit regression role once',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'apply_output_column',ref:unique(s,e=>e.column_close?.scope==='output'&&e.allowed_actions.includes('apply_output_column')).ref})});
  current=current.map(f=>f.record_id===wanted.record_id?{...f,usage_type:wanted.usage_type}:f);
  const actual=bind(await observe('complete role edit readback'));
  need(same(semantic(actual.fields),semantic(current)),'role edit changed unrelated fields');edits++;
 }
 const configuration=bind(await observe('complete final regression roles'));
 need(same(semantic(configuration.fields),semantic(expected)),'final roles differ');
 return {verified:true,cleanup_complete:true,effect_possible:edits>0,baseline_configuration:baseline,configuration,applied_editors:edits,settings_applied:false};
}

export async function configureLinRegressionPartition(channel,wanted){
 const ready=s=>s.wizard?.stage==='learn_partition'&&s.node_linregression?.verified===true&&s.node_linregression.kind==='partition';
 const observe=condition=>channel.observe({condition,readLinRegression:true,ready});
 const one=(s,predicate)=>{const es=s.ui.elements.filter(predicate);need(es.length===1,'one owned partition control required');return es[0];};
 let state=await observe('complete regression training partition');
 const act=async(condition,key,action)=>{
  await channel.perform({condition,initialObservation:state,ready,identity:s=>({node:s.prepared_node_context,partition:s.node_linregression}),
   resolve:s=>({...action,ref:one(s,e=>(e.tid===s.wizard.root_tid+';LearnPartitionWizard;'+key||e.identity?.anchor_tid===s.wizard.root_tid+';LearnPartitionWizard;'+key)&&e.allowed_actions.includes(action.verb)).ref})});
  state=await observe(condition+' readback');
 };
 need(state.node_linregression.values.validation===0,'validation is unsupported');
 if(!wanted){
  need(state.node_linregression.sizes.every(s=>s.unit==='percent')&&state.node_linregression.values.train===100&&state.node_linregression.values.test===0,'explicit sequential partition is required for training with a holdout');
  return state.node_linregression.values;
 }
 if(state.node_linregression.values.sampling!==1){
  await act('open regression sampling methods','pedSamplingMethod;ValueControl;trg_picker',{verb:'click'});
  const key='pedSamplingMethod;ValueControl;boundlist;Последовательный';
  state=await channel.observe({condition:'native sequential regression option',readLinRegression:true,ready:s=>ready(s)&&s.ui.elements.some(e=>e.tid===s.wizard.root_tid+';LearnPartitionWizard;'+key&&e.allowed_actions.includes('click'))});
  await act('select sequential regression split',key,{verb:'click'});
 }
 need(state.node_linregression.values.sampling===1,'sequential sampling readback differs');
 if(!same(state.node_linregression.sequence,[0,1,2]))await act('reset train test unused order','SequenceMethodForm;btnGroupPositionReset',{verb:'click'});
 need(same(state.node_linregression.sequence,[0,1,2]),'train test unused order differs');
 for(const [index,count] of [wanted.train_count,wanted.test_count].entries()){
  const unit=state.node_linregression.sizes[index];
  if(unit.unit==='percent'){
   await channel.perform({condition:'switch regression partition size to rows',initialObservation:state,ready,identity:s=>({node:s.prepared_node_context,partition:s.node_linregression}),
    resolve:s=>({verb:'click',ref:one(s,e=>e.ref===s.node_linregression.sizes[index].icon_ref&&e.signature?.tag==='img'&&e.allowed_actions.includes('click')).ref})});
   state=await observe('regression partition row unit readback');
  }
  const current=state.node_linregression.sizes[index];need(current.unit==='rows','partition size unit differs');
  if(current.count!==count){
   const key=current.absolute_control_tid.slice((state.wizard.root_tid+';LearnPartitionWizard;').length);
   await act('fill regression partition row count',key,{verb:'fill',text:String(count)});
   await act('commit regression partition row count',key,{verb:'press',key:'Tab'});
  }
  need(state.node_linregression.sizes[index].count===count,'partition row count readback differs');
 }
 const observed=state.node_linregression;
 need(observed.values.validation===0&&observed.values.sampling===1&&same(observed.sequence,[0,1,2])&&observed.sizes.every((s,i)=>s.unit==='rows'&&s.count===[wanted.train_count,wanted.test_count][i]),'final sequential partition differs');
 return {method:'sequential',train_count:observed.sizes[0].count,test_count:observed.sizes[1].count};
}

export async function configureLinRegression(channel,p,{request,inputMapping}){
 const elastic=request.mode==='elastic',lasso=request.mode==='lasso',ridge=request.mode==='ridge',preserve=request.mode==='apply',forward=request.mode==='forward',backward=request.mode==='backward',stepwise=request.mode==='stepwise',selecting=forward||backward||stepwise,method=elastic?6:lasso?5:ridge?4:stepwise?3:backward?2:forward?1:0,methodLabel=ridge?null:stepwise?'Stepwise (Пошаговое включение/исключение)':backward?'Backward (Пошаговое исключение)':forward?'Forward (Пошаговое включение)':'Enter (Принудительное включение)';
 const roles=await configureLinRegressionRoles(channel,p,inputMapping,{preserve});
 const one=(s,predicate,message)=>{const es=s.ui.elements.filter(predicate);need(es.length===1,message);return es[0];};
 const next=async(stage,destination)=>channel.perform({condition:'regression '+stage+' accepted',ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
  resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'Next unavailable').ref,expected_stage:destination})});
 await next('input_mapping','normalization');
 const ready=kind=>s=>s.node_linregression?.verified===true&&s.node_linregression.kind===kind;
 const observe=(kind,condition)=>channel.observe({condition,readLinRegression:true,ready:ready(kind)});
 let state=await observe('normalization','complete regression normalizers');const normalization=state.node_linregression;
 const used=roles.configuration.fields.filter(f=>f.usage_type!==0);
 // Loginom lists predictors before the target, independently of source order.
 need(normalization.fields.length===used.length&&new Set(normalization.fields.map(f=>f.name)).size===used.length
  &&normalization.fields.every(f=>f.norm_type===0&&used.filter(role=>['name','label','type','index'].every(k=>f[k]===role[k])).length===1),
  'only unnormalized continuous predictors and target are supported');
 if(!preserve&&normalization.source_status==='Не активировано'){
  await channel.perform({condition:'activate connected regression input',initialObservation:state,ready:ready('normalization'),identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid===s.wizard.root_tid+';NormTuneWizard;btnActivationPort'&&e.allowed_actions.includes('click'),'Input activation unavailable').ref})});
  state=await channel.observe({condition:'regression input activated',readLinRegression:true,ready:s=>ready('normalization')(s)&&s.node_linregression.source_status!=='Не активировано'});
 }
 await next('normalization','learn_partition');
 const partition=await configureLinRegressionPartition(channel,p.linear_regression?.partition);
 await next('learn_partition','lin_regression');
 state=await observe('parameters','complete regression parameters');
 const control=(s,key,verb)=>one(s,e=>{const tid=s.wizard.root_tid+';'+(s.wizard.stage==='lin_regression_details'?'LinRegressionWizard-1':'LinRegressionWizard')+';'+key;return (e.tid===tid||e.tid===null&&e.identity?.anchor_tid===tid&&e.signature?.tag==='input')&&e.allowed_actions.includes(verb);},'Regression control unavailable: '+key);
 const act=async(s,condition,key,action)=>channel.perform({condition,initialObservation:s,ready:ready(s.node_linregression.kind),identity:s=>({node:s.prepared_node_context,parameters:s.node_linregression}),resolve:s=>({...action,ref:control(s,key,action.verb).ref})});
 need(Object.values(state.node_linregression.switches).every(v=>v===false),'variable-driven regression settings are outside stage 1');
 if(preserve)need(state.node_linregression.values.pedAutoMethod===false&&state.node_linregression.values.pedRegressionMethod===0&&state.node_linregression.values.pedDenormalize===true&&state.node_linregression.values.pedUseDetailedSettings===true,'apply requires the saved Enter model with intercept; settings will not be changed');
 if(state.node_linregression.values.pedAutoMethod){await act(state,'disable automatic regression method','pedAutoMethod;ValueControl;DisplayEl',{verb:'set_checked',checked:false});state=await observe('parameters','manual regression method enabled');}
 const methodChoice=ridge||lasso||elastic?state.node_linregression.method_choices?.find(c=>c.value===method)?.label:methodLabel;
 need(typeof methodChoice==='string'&&methodChoice.length>0,'native method choice unavailable');
 if(state.node_linregression.values.pedRegressionMethod!==method){
  await act(state,'open regression methods','pedRegressionMethod;ValueControl;trg_picker',{verb:'click'});
  state=await channel.observe({condition:'Enter regression option',readLinRegression:true,ready:s=>ready('parameters')(s)&&s.ui.elements.some(e=>e.label===methodChoice&&e.allowed_actions.includes('click'))});
  await channel.perform({condition:'select native Enter method',initialObservation:state,ready:ready('parameters'),identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'click',ref:one(s,e=>e.label===methodChoice&&e.allowed_actions.includes('click'),'Unique Enter option unavailable').ref})});
  state=await observe('parameters','Enter method readback');
 }
 need(state.node_linregression.values.pedAutoMethod===false&&state.node_linregression.values.pedRegressionMethod===method&&state.node_linregression.values.pedDenormalize===true,'manual denormalized method is required');
 if(!state.node_linregression.values.pedUseDetailedSettings){await act(state,'show regression intercept settings','pedUseDetailedSettings;ValueControl;DisplayEl',{verb:'set_checked',checked:true});state=await observe('parameters','regression details enabled');}
 await next('lin_regression','lin_regression_details');
 state=await observe('details','regression intercept readback');
 need(state.node_linregression.values.pedIntercept===true&&Object.values(state.node_linregression.switches).every(v=>v===false),'a fixed intercept is required');
 let regularization;
 if(ridge){
  const choices=state.node_linregression.ridge_choices,manual=choices?.filter(c=>/вручную/i.test(c.label));
  need(choices?.length===2&&manual?.length===1&&Number.isInteger(manual[0].value)&&new Set(choices.map(c=>c.value)).size===2,'complete native Ridge setup choices required');
  need(state.node_linregression.disabled.pedRidgeSetupMethod===false,'Ridge setup must be editable');
  if(state.node_linregression.values.pedRidgeSetupMethod!==manual[0].value){
   await act(state,'open Ridge setup','pedRidgeSetupMethod;ValueControl;trg_picker',{verb:'click'});
   const option=s=>s.ui.elements.filter(e=>e.tid?.startsWith(s.wizard.root_tid+';LinRegressionWizard-1;pedRidgeSetupMethod;ValueControl;boundlist;')&&e.label===manual[0].label&&e.allowed_actions.includes('click'));
   state=await channel.observe({condition:'native manual Ridge option',readLinRegression:true,ready:s=>ready('details')(s)&&option(s).length===1});
   await channel.perform({condition:'select manual Ridge',initialObservation:state,ready:ready('details'),identity:s=>s.prepared_node_context,resolve:s=>({verb:'click',ref:option(s)[0].ref})});
   state=await observe('details','manual Ridge setup readback');
  }
  need(state.node_linregression.values.pedRidgeSetupMethod===manual[0].value&&state.node_linregression.disabled.pedLambdaRidge===false,'manual Ridge lambda must be editable');
  for(const [key,value] of [['pedLambdaRidge',p.linear_regression.lambda_l2],['pedEpsilon',1e-10]]){
   if(state.node_linregression.values[key]!==value){
    const [coefficient,exponent]=String(value).split('e-');
    const text=exponent?'0.'+'0'.repeat(Number(exponent)-1)+coefficient.replace('.',''):String(value);
    await act(state,'fill Ridge '+key,key+';ValueControl',{verb:'fill',text});state=await observe('details','Ridge numeric input');
    await act(state,'commit Ridge '+key,key+';ValueControl',{verb:'press',key:'Tab'});state=await observe('details','Ridge numeric readback');
   }
   need(state.node_linregression.values[key]===value,'Ridge numeric readback differs: '+key);
  }
  need(state.node_linregression.values.pedRidgeSetupMethod===manual[0].value&&state.node_linregression.values.pedIntercept===true&&Object.values(state.node_linregression.switches).every(v=>v===false),'manual Ridge settings changed');
  regularization={setup:'manual',lambda_l2:state.node_linregression.values.pedLambdaRidge};
 }
 if(lasso){
  const choices=state.node_linregression.lasso_choices,manual=choices?.filter(c=>/вручную/i.test(c.label));
  need(choices?.length===2&&manual?.length===1&&Number.isInteger(manual[0].value)&&new Set(choices.map(c=>c.value)).size===2,'complete native Lasso setup choices required');
  need(state.node_linregression.disabled.pedLassoSetupMethod===false,'Lasso setup must be editable');
  if(state.node_linregression.values.pedLassoSetupMethod!==manual[0].value){
   await act(state,'open Lasso setup','pedLassoSetupMethod;ValueControl;trg_picker',{verb:'click'});
   const option=s=>s.ui.elements.filter(e=>e.tid?.startsWith(s.wizard.root_tid+';LinRegressionWizard-1;pedLassoSetupMethod;ValueControl;boundlist;')&&e.label===manual[0].label&&e.allowed_actions.includes('click'));
   state=await channel.observe({condition:'native manual Lasso option',readLinRegression:true,ready:s=>ready('details')(s)&&option(s).length===1});
   await channel.perform({condition:'select manual Lasso',initialObservation:state,ready:ready('details'),identity:s=>s.prepared_node_context,resolve:s=>({verb:'click',ref:option(s)[0].ref})});
   state=await observe('details','manual Lasso setup readback');
  }
  need(state.node_linregression.values.pedLassoSetupMethod===manual[0].value&&state.node_linregression.disabled.pedLambdaLasso===false,'manual Lasso lambda must be editable');
  for(const [key,value] of [['pedLambdaLasso',p.linear_regression.lambda_l1],['pedEpsilon',1e-10]]){
   if(state.node_linregression.values[key]!==value){
    const [coefficient,exponent]=String(value).split('e-');
    const text=exponent?'0.'+'0'.repeat(Number(exponent)-1)+coefficient.replace('.',''):String(value);
    await act(state,'fill Lasso '+key,key+';ValueControl',{verb:'fill',text});state=await observe('details','Lasso numeric input');
    await act(state,'commit Lasso '+key,key+';ValueControl',{verb:'press',key:'Tab'});state=await observe('details','Lasso numeric readback');
   }
   need(state.node_linregression.values[key]===value,'Lasso numeric readback differs: '+key);
  }
  need(state.node_linregression.values.pedLassoSetupMethod===manual[0].value&&state.node_linregression.values.pedIntercept===true&&Object.values(state.node_linregression.switches).every(v=>v===false),'manual Lasso settings changed');
  regularization={setup:'manual',lambda_l1:state.node_linregression.values.pedLambdaLasso};
 }
 if(elastic){
  const manualValues={};
  for(const [setup,lambda,value,choices] of [
   ['pedLassoSetupMethod','pedLambdaLasso',p.linear_regression.lambda_l1,state.node_linregression.lasso_choices],
   ['pedRidgeSetupMethod','pedLambdaRidge',p.linear_regression.lambda_l2,state.node_linregression.ridge_choices]]){
   const manual=choices?.filter(c=>/вручную/i.test(c.label));
   need(choices?.length===2&&manual?.length===1&&Number.isInteger(manual[0].value)&&new Set(choices.map(c=>c.value)).size===2,'complete native Elastic Net setup choices required');
   manualValues[setup]=manual[0].value;
   need(state.node_linregression.disabled[setup]===false,'Elastic Net setup must be editable');
   if(state.node_linregression.values[setup]!==manual[0].value){
    await act(state,'open Elastic Net setup',setup+';ValueControl;trg_picker',{verb:'click'});
    const option=s=>s.ui.elements.filter(e=>e.tid?.startsWith(s.wizard.root_tid+';LinRegressionWizard-1;'+setup+';ValueControl;boundlist;')&&e.label===manual[0].label&&e.allowed_actions.includes('click'));
    state=await channel.observe({condition:'native manual Elastic Net option',readLinRegression:true,ready:s=>ready('details')(s)&&option(s).length===1});
    await channel.perform({condition:'select manual Elastic Net coefficient',initialObservation:state,ready:ready('details'),identity:s=>s.prepared_node_context,resolve:s=>({verb:'click',ref:option(s)[0].ref})});
    state=await observe('details','manual Elastic Net setup readback');
   }
   need(state.node_linregression.values[setup]===manual[0].value&&state.node_linregression.disabled[lambda]===false,'manual Elastic Net lambda must be editable');
   if(state.node_linregression.values[lambda]!==value){
    const [coefficient,exponent]=String(value).split('e-');
    const text=exponent?'0.'+'0'.repeat(Number(exponent)-1)+coefficient.replace('.',''):String(value);
    await act(state,'fill Elastic Net '+lambda,lambda+';ValueControl',{verb:'fill',text});state=await observe('details','Elastic Net numeric input');
    await act(state,'commit Elastic Net '+lambda,lambda+';ValueControl',{verb:'press',key:'Tab'});state=await observe('details','Elastic Net numeric readback');
   }
   need(state.node_linregression.values[lambda]===value,'Elastic Net numeric readback differs: '+lambda);
  }
  if(state.node_linregression.values.pedEpsilon!==1e-12){
   await act(state,'set internal Elastic Net solver accuracy','pedEpsilon;ValueControl',{verb:'fill',text:'0.000000000001'});state=await observe('details','Elastic Net epsilon input');
   await act(state,'commit internal Elastic Net solver accuracy','pedEpsilon;ValueControl',{verb:'press',key:'Tab'});state=await observe('details','Elastic Net epsilon readback');
  }
  need(state.node_linregression.values.pedEpsilon===1e-12,'Elastic Net epsilon readback differs');
  need(Object.entries(manualValues).every(([key,value])=>state.node_linregression.values[key]===value)
   &&state.node_linregression.values.pedLambdaLasso===p.linear_regression.lambda_l1&&state.node_linregression.values.pedLambdaRidge===p.linear_regression.lambda_l2
   &&state.node_linregression.values.pedIntercept===true&&Object.values(state.node_linregression.switches).every(v=>v===false),'manual Elastic Net settings changed');
  regularization={setup:'manual',lambda_l1:state.node_linregression.values.pedLambdaLasso,lambda_l2:state.node_linregression.values.pedLambdaRidge};
 }
 let selection;
 if(selecting){
  const wanted=p.linear_regression?.selection??{criterion:'f'},criteria=['f','r2','adjusted_r2','aic','aicc','bic','hqc'];
  const criterion=criteria.indexOf(wanted.criterion),choices=state.node_linregression.selection_choices;
  need(choices.length===7&&new Set(choices.map(c=>c.value)).size===7&&choices.every(c=>Number.isInteger(c.value)&&c.value>=0&&c.value<7&&typeof c.label==='string'&&c.label.length>0),'complete native selection choices required');
  need(state.node_linregression.disabled.pedRegSelQuality===false,'selection criterion must be editable');
  if(state.node_linregression.values.pedRegSelQuality!==criterion){
   const label=choices.find(c=>c.value===criterion).label;
   await act(state,'open linear selection criteria','pedRegSelQuality;ValueControl;trg_picker',{verb:'click'});
   const option=s=>s.ui.elements.filter(e=>e.tid?.startsWith(s.wizard.root_tid+';LinRegressionWizard-1;pedRegSelQuality;ValueControl;boundlist;')&&e.label===label&&e.allowed_actions.includes('click'));
   state=await channel.observe({condition:'native linear selection option',readLinRegression:true,ready:s=>ready('details')(s)&&option(s).length===1});
   await channel.perform({condition:'select linear criterion',initialObservation:state,ready:ready('details'),identity:s=>s.prepared_node_context,resolve:s=>({verb:'click',ref:option(s)[0].ref})});
   state=await observe('details','linear criterion readback');
  }
  need(state.node_linregression.values.pedRegSelQuality===criterion,'selection criterion readback differs');
  need(stepwise?(criterion!==0||state.node_linregression.disabled.pedAddSignificance===false&&state.node_linregression.disabled.pedRemoveSignificance===false):backward?state.node_linregression.disabled.pedAddSignificance===true&&(criterion!==0||state.node_linregression.disabled.pedRemoveSignificance===false):(criterion!==0||state.node_linregression.disabled.pedAddSignificance===false)&&state.node_linregression.disabled.pedRemoveSignificance===true,'unexpected selection cutoff availability');
  for(const [key,value] of [['pedEpsilon',1e-10],...(criterion===0?[...(!backward?[['pedAddSignificance',wanted.add_significance??0.05]]:[]),...(!forward?[['pedRemoveSignificance',wanted.remove_significance??0.1]]:[])]:[])]){
   if(state.node_linregression.values[key]!==value){
    const [coefficient,exponent]=String(value).split('e-');
    const text=exponent?'0.'+'0'.repeat(Number(exponent)-1)+coefficient.replace('.',''):String(value);
    await act(state,'fill linear '+key,key+';ValueControl',{verb:'fill',text});state=await observe('details','linear numeric input');
    await act(state,'commit linear '+key,key+';ValueControl',{verb:'press',key:'Tab'});state=await observe('details','linear numeric readback');
   }
   need(state.node_linregression.values[key]===value,'numeric readback differs: '+key);
  }
  const disabledKey=backward?'add_significance':'remove_significance',disabledControl=backward?'pedAddSignificance':'pedRemoveSignificance';
  need(stepwise||wanted[disabledKey]===undefined||state.node_linregression.values[disabledControl]===wanted[disabledKey],'disabled cutoff differs from requested assertion');
  selection={criterion:criteria[state.node_linregression.values.pedRegSelQuality],...(criterion===0?{add_significance:state.node_linregression.values.pedAddSignificance,remove_significance:state.node_linregression.values.pedRemoveSignificance}: {})};
 }
 const details=state.node_linregression,enter=!preserve&&!ridge&&!lasso&&!elastic&&!selecting,statistics=p.linear_regression?.statistics??'coefficients';
 // The native level stays as saved; full statistics are approved only at 95%.
 if(enter&&statistics==='full')need(details.values.pedPredictionIntervalLevel===95,'full coefficient statistics require the native 95% confidence level');
 await next('lin_regression_details','done');
 const done=await channel.observe({condition:'regression settings accepted',ready:s=>s.wizard?.stage==='done'});
 return {...roles,configuration:{...roles.configuration,...(preserve?{mode:'apply'}:ridge||lasso||elastic?{mode:request.mode,regularization,epsilon:details.values.pedEpsilon}:selecting?{mode:request.mode,selection,epsilon:details.values.pedEpsilon}:{statistics,confidence_level:details.values.pedPredictionIntervalLevel}),normalization:normalization.fields,partition,intercept:details.values.pedIntercept,target_field:p.target_field,node_context:done.prepared_node_context},validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
