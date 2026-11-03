import {resolveLogRegressionRoles} from './log-regression-parameters.mjs';
import {bindReformInput} from './reform-input.mjs';
import {readOutputDefinitionPages,observeOutputDefinitionPage} from './import-definition-pages.mjs';
const need=(v,m)=>{if(!v)throw Error('Logistic regression: '+m);};
const semantic=fs=>fs.map(({selected,origin_type,...f})=>f);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function configureLogRegressionRoles(channel,p,inputMapping){
 const ready=s=>s.wizard?.stage==='input_mapping'&&s.node_logregression?.verified===true;
 const observe=condition=>channel.observe({condition,readLogRegression:true,ready});
 const bind=s=>bindReformInput(s.node_logregression,inputMapping);
 const baseline=bind(await observe('complete regression roles'));
 need(baseline.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===inputMapping.target_fields[i][k])),'role schema differs from incoming fields');
 const expected=resolveLogRegressionRoles({logistic:p},baseline.fields);let current=baseline.fields,edits=0;
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

export async function configureLogRegression(channel,parameters,{inputMapping,request}){
 const mode=request?.mode??'enter',p=parameters.logistic,roles=await configureLogRegressionRoles(channel,p,inputMapping);
 const one=(s,predicate,message)=>{const es=s.ui.elements.filter(predicate);need(es.length===1,message);return es[0];};
 const ready=kind=>s=>s.node_logregression?.verified===true&&s.node_logregression.kind===kind;
 const observe=(kind,condition)=>channel.observe({condition,readLogRegression:true,ready:ready(kind)});
 const next=async(stage,destination)=>channel.perform({condition:'logistic '+stage+' accepted',ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
  resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'Next unavailable').ref,expected_stage:destination})});
 await next('input_mapping','normalization');
 let state=await observe('normalization','complete logistic normalizers');const normalization=state.node_logregression;
 const used=roles.configuration.fields.filter(f=>f.usage_type!==0);
 need(normalization.fields.length===used.length&&new Set(normalization.fields.map(f=>f.name)).size===used.length
  &&normalization.fields.every(f=>used.filter(role=>['name','label','type','index'].every(k=>f[k]===role[k])).length===1
   &&(p.input_fields.includes(f.name)?f.norm_type===0&&(mode==='enter'||f.importance===1&&f.irremovable===false):Number.isInteger(f.norm_type))),
  'only unnormalized continuous predictors and native categorical target encoding are supported');
 if(normalization.source_status==='Не активировано'){
  await channel.perform({condition:'activate connected logistic input',initialObservation:state,ready:ready('normalization'),identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid===s.wizard.root_tid+';NormTuneWizard;btnActivationPort'&&e.allowed_actions.includes('click'),'Input activation unavailable').ref})});
  state=await channel.observe({condition:'logistic input activated',readLogRegression:true,ready:s=>ready('normalization')(s)&&s.node_logregression.source_status!=='Не активировано'});
 }
 await next('normalization','learn_partition');
 state=await observe('partition','complete logistic training partition');
 need(state.node_logregression.values.train===100&&state.node_logregression.values.test===0&&state.node_logregression.values.validation===0,'stage 1 requires 100 percent training without validation');
 const partition=state.node_logregression.values;
 await next('learn_partition','lin_regression');
 state=await observe('parameters','complete logistic parameters and classes');
 const nativeClasses=state.node_logregression.classes;
 need(nativeClasses.length===2&&new Set(nativeClasses.map(c=>c.index)).size===2,'exactly two binary target classes are required');
 need(Object.values(state.node_logregression.switches).every(v=>v===false),'variable-driven logistic settings are outside stage 1');
 const control=(s,key,verb)=>one(s,e=>{const tid=s.wizard.root_tid+';'+(s.wizard.stage==='lin_regression_details'?'LogRegressionWizard-1':'LogRegressionWizard')+';'+key;return (e.tid===tid||e.tid===null&&e.identity?.anchor_tid===tid&&e.signature?.tag==='input')&&e.allowed_actions.includes(verb);},'Logistic control unavailable: '+key);
 const act=async(kind,condition,key,action)=>channel.perform({condition,initialObservation:state,ready:ready(kind),identity:s=>s.prepared_node_context,resolve:s=>({...action,ref:control(s,key,action.verb).ref})});
 const choose=async(key,label,value,kind='parameters')=>{
  if(state.node_logregression.values[key]===value)return;
  await act(kind,'open logistic '+key,key+';ValueControl;trg_picker',{verb:'click'});
  state=await channel.observe({condition:'observed logistic option '+label,readLogRegression:true,ready:s=>ready(kind)(s)&&s.ui.elements.some(e=>e.label===label&&e.allowed_actions.includes('click'))});
  await channel.perform({condition:'select logistic '+key,initialObservation:state,ready:ready(kind),identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'click',ref:one(s,e=>e.label===label&&e.allowed_actions.includes('click'),'Unique logistic option unavailable').ref})});
  state=await observe(kind,'logistic '+key+' readback');need(state.node_logregression.values[key]===value,'native logistic option differs: '+key);
 };
 await choose('pedEventType','Задано явно',4);
 // The cached EventId store exposes numeric captions until its native picker
 // renders the category labels (LAB-554 run1, execution-events:345–347).
 // Bind each rendered label to its observed native index, never CSV order.
 await act('parameters','open observed logistic categories','pedEventId;ValueControl;trg_picker',{verb:'click'});
 const categoryOptions=s=>s.ui.elements.filter(e=>e.tid?.startsWith(s.wizard.root_tid+';LogRegressionWizard;pedEventId;ValueControl;boundlist;')&&e.allowed_actions.includes('click'));
 state=await channel.observe({condition:'two rendered logistic categories',readLogRegression:true,ready:s=>ready('parameters')(s)&&categoryOptions(s).length===2});
 const classes=categoryOptions(state).map(e=>{const m=e.label.match(/^([0-9]+) \((.+)\)$/s);need(m,'event category caption must contain its observed index and label');return {index:Number(m[1]),label:m[2]};});
 need(new Set(classes.map(c=>c.label)).size===2&&new Set(classes.map(c=>c.index)).size===2&&classes.every(c=>nativeClasses.some(n=>n.index===c.index&&n.label===c.label)),'rendered categories differ from the complete native class inventory');
 const event=classes.find(c=>c.label===p.event);need(event,'event label must match one of the two observed target categories');
 await channel.perform({condition:'select exact observed logistic event',initialObservation:state,ready:s=>ready('parameters')(s)&&categoryOptions(s).length===2,
  identity:s=>({node:s.prepared_node_context,classes:s.node_logregression.classes}),
  resolve:s=>({verb:'click',ref:one(s,e=>categoryOptions(s).includes(e)&&e.label===event.index+' ('+event.label+')','Unique event category unavailable').ref})});
 state=await observe('parameters','explicit logistic category readback');need(state.node_logregression.values.pedEventId===event.index,'event selection differs from the observed category');
 if(state.node_logregression.values.pedAutoMethod){await act('parameters','disable automatic logistic method','pedAutoMethod;ValueControl;DisplayEl',{verb:'set_checked',checked:false});state=await observe('parameters','manual logistic method');}
 const methods={enter:[0,'Enter (Принудительное включение)'],forward:[1,'Forward (Пошаговое включение)'],backward:[2,'Backward (Пошаговое исключение)'],stepwise:[3,'Stepwise (Пошаговое включение/исключение)']};
 need(methods[mode],'unsupported regression method');
 await choose('pedRegressionMethod',methods[mode][1],methods[mode][0]);
 if(!state.node_logregression.values.pedUseDetailedSettings){await act('parameters','show logistic details','pedUseDetailedSettings;ValueControl;DisplayEl',{verb:'set_checked',checked:true});state=await observe('parameters','logistic details enabled');}
 need(state.node_logregression.values.pedUseScoring===false&&state.node_logregression.values.pedSetupCalibration===false,'scoring and calibration overrides are outside stage 1');
 need(state.node_logregression.values.pedDenormalize===true&&state.node_logregression.values.pedAutoMethod===false
  &&state.node_logregression.values.pedRegressionMethod===methods[mode][0]&&state.node_logregression.values.pedEventType===4&&state.node_logregression.values.pedEventId===event.index,'manual method and explicit event must be observed');
 const observedMode=Object.keys(methods).find(k=>methods[k][0]===state.node_logregression.values.pedRegressionMethod);
 await next('lin_regression','lin_regression_details');
 state=await observe('details','complete logistic details');
 need(state.node_logregression.values.pedIntercept===true&&Object.values(state.node_logregression.switches).every(v=>v===false),'fixed intercept without variable bindings required');
 const cutoffs=[];
 if(mode!=='enter'){
  // Native defaults observed on a new 7.4.2 node (LAB-657 strict journal:493).
  await choose('pedRegSelQuality','Deviance',0,'details');
  need(state.node_logregression.disabled?.pedRegSelQuality===false,'selection criterion must be editable');
  for(const [key,value,applicable] of [['pedAddSignificance',0.05,mode!=='backward'],['pedRemoveSignificance',0.1,mode!=='forward']]){
   need(state.node_logregression.disabled?.[key]===!applicable,'unexpected selection cutoff availability: '+key);
   if(applicable)cutoffs.push([key,value]);
  }
 }
 for(const [key,value] of [['pedEpsilon',1e-10],['pedThreshold',p.threshold],...cutoffs]){
  if(state.node_logregression.values[key]!==value){
   const field=control(state,key+';ValueControl','fill'),scroll=field.scroll;
   if(cutoffs.some(([name])=>name===key)&&scroll&&scroll.top<scroll.max_top){
    // Backward skips the disabled entry field, so focus has not revealed
    // removal below the clipped detail pane (LAB-657 Backward journal:509).
    await channel.perform({condition:'reveal logistic cutoff in its own detail pane',initialObservation:state,ready:ready('details'),
     identity:s=>({node:s.prepared_node_context,scroll:control(s,key+';ValueControl','fill').scroll.ref}),
     resolve:s=>{const target=control(s,key+';ValueControl','fill'),base=s.wizard.root_tid+';LogRegressionWizard-1;';
      const anchor=s.ui.elements.find(e=>e.scroll?.ref===target.scroll.ref&&e.enabled===true&&e.interaction?.state==='point_observed'&&e.allowed_actions.includes('scroll')
       &&(e.tid?.startsWith(base)||e.identity?.anchor_tid?.startsWith(base)));
      need(anchor,'visible logistic detail scroll anchor unavailable');return {verb:'scroll',ref:anchor.ref,delta_y:target.scroll.max_top-target.scroll.top};}});
    state=await observe('details','logistic cutoff revealed');
    const moved=control(state,key+';ValueControl','fill').scroll;need(moved?.ref===scroll.ref&&moved.top>scroll.top,'logistic detail pane did not scroll');
   }
   // Native number fields strip e and minus from scientific notation:
   // 1e-10 became 110 in the owned diagnostic, so enter decimal digits.
   const [coefficient,exponent]=String(value).split('e-');
   const text=exponent?'0.'+'0'.repeat(Number(exponent)-1)+coefficient.replace('.',''):String(value);
   await act('details','fill logistic '+key,key+';ValueControl',{verb:'fill',text});
   state=await observe('details','logistic numeric input');
   await act('details','commit logistic '+key,key+';ValueControl',{verb:'press',key:'Tab'});
   state=await observe('details','logistic numeric readback');
  }
  need(state.node_logregression.values[key]===value,'logistic numeric setting differs: '+key);
 }
 await next('lin_regression_details','done');
 const done=await channel.observe({condition:'logistic settings accepted',ready:s=>s.wizard?.stage==='done'});
 return {...roles,configuration:{...roles.configuration,normalization:normalization.fields,partition,classes:classes.map(({index,label})=>({index,label})),
  mode:observedMode,target_field:p.target_field,event:p.event,threshold:p.threshold,intercept:true,epsilon:1e-10,node_context:done.prepared_node_context},
  validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
