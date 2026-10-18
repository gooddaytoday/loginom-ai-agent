import {resolveLinRegressionRoles} from './linregression-parameters.mjs';
import {bindReformInput} from './reform-input.mjs';
import {readOutputDefinitionPages,observeOutputDefinitionPage} from './import-definition-pages.mjs';
const need=(v,m)=>{if(!v)throw Error('Linear regression: '+m);};
const semantic=fs=>fs.map(({selected,origin_type,...f})=>f);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function configureLinRegressionRoles(channel,p,inputMapping){
 const ready=s=>s.wizard?.stage==='input_mapping'&&s.node_linregression?.verified===true;
 const observe=condition=>channel.observe({condition,readLinRegression:true,ready});
 const bind=s=>bindReformInput(s.node_linregression,inputMapping);
 const baseline=bind(await observe('complete regression roles'));
 need(baseline.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===inputMapping.target_fields[i][k])),'role schema differs from incoming fields');
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
 const roles=await configureLinRegressionRoles(channel,p,inputMapping);
 const one=(s,predicate,message)=>{const es=s.ui.elements.filter(predicate);need(es.length===1,message);return es[0];};
 const next=async(stage,destination)=>channel.perform({condition:'regression '+stage+' accepted',ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
  resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'Next unavailable').ref,expected_stage:destination})});
 await next('input_mapping','normalization');
 const ready=kind=>s=>s.node_linregression?.verified===true&&s.node_linregression.kind===kind;
 const observe=(kind,condition)=>channel.observe({condition,readLinRegression:true,ready:ready(kind)});
 let state=await observe('normalization','complete regression normalizers');const normalization=state.node_linregression;
 const used=roles.configuration.fields.filter(f=>f.usage_type!==0);
 need(same(normalization.fields.map(f=>f.name),used.map(f=>f.name))&&normalization.fields.every(f=>f.norm_type===0),'only unnormalized continuous predictors and target are supported');
 if(normalization.source_status==='Не активировано'){
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
 const control=(s,key,verb)=>one(s,e=>e.tid===s.wizard.root_tid+';LinRegressionWizard;'+key&&e.allowed_actions.includes(verb),'Regression control unavailable: '+key);
 const act=async(s,condition,key,action)=>channel.perform({condition,initialObservation:s,ready:ready('parameters'),identity:s=>({node:s.prepared_node_context,parameters:s.node_linregression}),resolve:s=>({...action,ref:control(s,key,action.verb).ref})});
 need(Object.values(state.node_linregression.switches).every(v=>v===false),'variable-driven regression settings are outside stage 1');
 if(state.node_linregression.values.pedAutoMethod){await act(state,'disable automatic regression method','pedAutoMethod;ValueControl;DisplayEl',{verb:'set_checked',checked:false});state=await observe('parameters','manual regression method enabled');}
 if(state.node_linregression.values.pedRegressionMethod!==0){
  await act(state,'open regression methods','pedRegressionMethod;ValueControl;trg_picker',{verb:'click'});
  state=await channel.observe({condition:'Enter regression option',readLinRegression:true,ready:s=>ready('parameters')(s)&&s.ui.elements.some(e=>e.label==='Enter (Принудительное включение)'&&e.allowed_actions.includes('click'))});
  await channel.perform({condition:'select native Enter method',initialObservation:state,ready:ready('parameters'),identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'click',ref:one(s,e=>e.label==='Enter (Принудительное включение)'&&e.allowed_actions.includes('click'),'Unique Enter option unavailable').ref})});
  state=await observe('parameters','Enter method readback');
 }
 need(state.node_linregression.values.pedAutoMethod===false&&state.node_linregression.values.pedRegressionMethod===0&&state.node_linregression.values.pedDenormalize===true,'manual denormalized Enter is required');
 if(!state.node_linregression.values.pedUseDetailedSettings){await act(state,'show regression intercept settings','pedUseDetailedSettings;ValueControl;DisplayEl',{verb:'set_checked',checked:true});state=await observe('parameters','regression details enabled');}
 await next('lin_regression','lin_regression_details');
 state=await observe('details','regression intercept readback');
 need(state.node_linregression.values.pedIntercept===true&&Object.values(state.node_linregression.switches).every(v=>v===false),'a fixed intercept is required');
 const details=state.node_linregression;
 await next('lin_regression_details',['output_mapping','done']);
 const done=await channel.observe({condition:'regression settings accepted',ready:s=>s.wizard?.stage==='done'});
 return {...roles,configuration:{...roles.configuration,normalization:normalization.fields,partition:partition.values,intercept:details.values.pedIntercept,target_field:p.target_field,node_context:done.prepared_node_context},validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
