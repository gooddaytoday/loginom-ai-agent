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

export async function configureLinRegression(channel,p,{request,inputMapping}){
 const preserve=request.mode==='apply',forward=request.mode==='forward',r2=p.linear_regression?.selection?.criterion==='r2',stageRemoval=forward&&r2&&p.linear_regression.selection.remove_significance!==undefined,method=stageRemoval?3:forward?1:0,methodLabel=stageRemoval?'Stepwise (Пошаговое включение/исключение)':forward?'Forward (Пошаговое включение)':'Enter (Принудительное включение)';
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
 state=await observe('partition','complete regression training partition');
 need(state.node_linregression.values.train===100&&state.node_linregression.values.test===0&&state.node_linregression.values.validation===0,'stage 1 requires 100 percent training, no holdout and no validation');
 const partition=state.node_linregression;
 await next('learn_partition','lin_regression');
 state=await observe('parameters','complete regression parameters');
 const control=(s,key,verb)=>one(s,e=>{const tid=s.wizard.root_tid+';'+(s.wizard.stage==='lin_regression_details'?'LinRegressionWizard-1':'LinRegressionWizard')+';'+key;return (e.tid===tid||e.tid===null&&e.identity?.anchor_tid===tid&&e.signature?.tag==='input')&&e.allowed_actions.includes(verb);},'Regression control unavailable: '+key);
 const act=async(s,condition,key,action)=>channel.perform({condition,initialObservation:s,ready:ready(s.node_linregression.kind),identity:s=>({node:s.prepared_node_context,parameters:s.node_linregression}),resolve:s=>({...action,ref:control(s,key,action.verb).ref})});
 need(Object.values(state.node_linregression.switches).every(v=>v===false),'variable-driven regression settings are outside stage 1');
 if(preserve)need(state.node_linregression.values.pedAutoMethod===false&&state.node_linregression.values.pedRegressionMethod===0&&state.node_linregression.values.pedDenormalize===true&&state.node_linregression.values.pedUseDetailedSettings===true,'apply requires the saved Enter model with intercept; settings will not be changed');
 if(state.node_linregression.values.pedAutoMethod){await act(state,'disable automatic regression method','pedAutoMethod;ValueControl;DisplayEl',{verb:'set_checked',checked:false});state=await observe('parameters','manual regression method enabled');}
 if(state.node_linregression.values.pedRegressionMethod!==method){
  await act(state,'open regression methods','pedRegressionMethod;ValueControl;trg_picker',{verb:'click'});
  state=await channel.observe({condition:'Enter regression option',readLinRegression:true,ready:s=>ready('parameters')(s)&&s.ui.elements.some(e=>e.label===methodLabel&&e.allowed_actions.includes('click'))});
  await channel.perform({condition:'select native Enter method',initialObservation:state,ready:ready('parameters'),identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'click',ref:one(s,e=>e.label===methodLabel&&e.allowed_actions.includes('click'),'Unique Enter option unavailable').ref})});
  state=await observe('parameters','Enter method readback');
 }
 need(state.node_linregression.values.pedAutoMethod===false&&state.node_linregression.values.pedRegressionMethod===method&&state.node_linregression.values.pedDenormalize===true,'manual denormalized method is required');
 if(!state.node_linregression.values.pedUseDetailedSettings){await act(state,'show regression intercept settings','pedUseDetailedSettings;ValueControl;DisplayEl',{verb:'set_checked',checked:true});state=await observe('parameters','regression details enabled');}
 await next('lin_regression','lin_regression_details');
 state=await observe('details','regression intercept readback');
 need(state.node_linregression.values.pedIntercept===true&&Object.values(state.node_linregression.switches).every(v=>v===false),'a fixed intercept is required');
 let selection;
 if(forward){
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
  need((criterion!==0||state.node_linregression.disabled.pedAddSignificance===false)&&state.node_linregression.disabled.pedRemoveSignificance===!stageRemoval,'unexpected Forward cutoff availability');
  for(const [key,value] of [['pedEpsilon',1e-10],...(criterion===0?[['pedAddSignificance',wanted.add_significance??0.05]]:criterion===1&&wanted.add_significance!==undefined?[['pedAddSignificance',wanted.add_significance]]:[]),...(stageRemoval?[['pedRemoveSignificance',wanted.remove_significance]]:[])]){
   if(state.node_linregression.values[key]!==value){
    need(state.node_linregression.disabled[key]!==true,'requested cutoff must be natively editable: '+key);
    const field=control(state,key+';ValueControl','fill'),scroll=field.scroll;
    if(key!=='pedEpsilon'&&scroll&&scroll.top<scroll.max_top){
     await channel.perform({condition:'reveal linear cutoff in its native detail pane',initialObservation:state,ready:ready('details'),identity:s=>s.prepared_node_context,
      resolve:s=>{const target=control(s,key+';ValueControl','fill'),base=s.wizard.root_tid+';LinRegressionWizard-1;';
       const anchor=s.ui.elements.find(e=>e.scroll?.ref===target.scroll.ref&&e.enabled===true&&e.interaction?.state==='point_observed'&&e.allowed_actions.includes('scroll')&&(e.tid?.startsWith(base)||e.identity?.anchor_tid?.startsWith(base)));
       need(anchor,'visible linear detail scroll anchor unavailable');return {verb:'scroll',ref:anchor.ref,delta_y:Math.min(1000,target.scroll.max_top-target.scroll.top)};}});
     state=await observe('details','linear cutoff revealed');
    }
    const [coefficient,exponent]=String(value).split('e-');
    const text=exponent?'0.'+'0'.repeat(Number(exponent)-1)+coefficient.replace('.',''):String(value);
    await act(state,'fill linear '+key,key+';ValueControl',{verb:'fill',text});state=await observe('details','linear numeric input');
    await act(state,'commit linear '+key,key+';ValueControl',{verb:'press',key:'Tab'});state=await observe('details','linear numeric readback');
   }
   need(state.node_linregression.values[key]===value,'numeric readback differs: '+key);
  }
  if(stageRemoval){
   await channel.perform({condition:'return to native regression method',ready:s=>s.wizard?.stage==='lin_regression_details',identity:s=>s.prepared_node_context,
    resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnPrev'&&e.allowed_actions.includes('wizard_step'),'Previous unavailable').ref,expected_stage:'lin_regression'})});
   state=await observe('parameters','staged R2 method settings');
   await act(state,'restore Forward after cutoff staging','pedRegressionMethod;ValueControl;trg_picker',{verb:'click'});
   state=await channel.observe({condition:'native Forward option after staging',readLinRegression:true,ready:s=>ready('parameters')(s)&&s.ui.elements.some(e=>e.label==='Forward (Пошаговое включение)'&&e.allowed_actions.includes('click'))});
   await channel.perform({condition:'restore native Forward method',initialObservation:state,ready:ready('parameters'),identity:s=>s.prepared_node_context,
    resolve:s=>({verb:'click',ref:one(s,e=>e.label==='Forward (Пошаговое включение)'&&e.allowed_actions.includes('click'),'Unique Forward option unavailable').ref})});
   state=await observe('parameters','restored Forward readback');
   need(state.node_linregression.values.pedRegressionMethod===1&&state.node_linregression.values.pedAutoMethod===false&&state.node_linregression.values.pedUseDetailedSettings===true,'Forward was not restored after native cutoff staging');
   await next('lin_regression','lin_regression_details');state=await observe('details','restored R2 cutoffs readback');
   need(state.node_linregression.values.pedRegSelQuality===criterion&&state.node_linregression.values.pedEpsilon===1e-10&&state.node_linregression.disabled.pedRemoveSignificance===true,'R2 settings changed when restoring Forward');
   need(wanted.add_significance===undefined||state.node_linregression.values.pedAddSignificance===wanted.add_significance,'R2 entry cutoff changed when restoring Forward');
  }
  need(wanted.remove_significance===undefined||state.node_linregression.values.pedRemoveSignificance===wanted.remove_significance,'disabled removal cutoff differs from requested assertion');
  selection={criterion:criteria[state.node_linregression.values.pedRegSelQuality],...([0,1].includes(criterion)?{add_significance:state.node_linregression.values.pedAddSignificance,remove_significance:state.node_linregression.values.pedRemoveSignificance}: {})};
 }
 const details=state.node_linregression;
 await next('lin_regression_details','done');
 const done=await channel.observe({condition:'regression settings accepted',ready:s=>s.wizard?.stage==='done'});
 return {...roles,configuration:{...roles.configuration,...(preserve?{mode:'apply'}:forward?{mode:'forward',selection,epsilon:details.values.pedEpsilon}:{}),normalization:normalization.fields,partition:partition.values,intercept:details.values.pedIntercept,target_field:p.target_field,node_context:done.prepared_node_context},validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
