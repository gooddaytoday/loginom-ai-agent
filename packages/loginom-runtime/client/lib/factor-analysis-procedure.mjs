import {resolveFactorAnalysisFeatures} from './factor-analysis-parameters.mjs';
import {bindReformInput} from './reform-input.mjs';
import {readOutputDefinitionPages,observeOutputDefinitionPage} from './import-definition-pages.mjs';
import {configureDerivedInlineMapping} from './grouping-inline-mapping.mjs';
import {factorAnalysisInlineSources} from './factor-analysis-output.mjs';
const need=(v,m)=>{if(!v)throw Error('FactorAnalysis: '+m);};
const semantic=fs=>fs.map(({selected,origin_type,...f})=>f);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function configureFactorAnalysisRoles(channel,p,inputMapping){
 const ready=s=>s.wizard?.stage==='input_mapping'&&(s.node_factor_analysis?.verified===true||s.node_factor_analysis?.reason==='factor_analysis_record');
 const observe=condition=>channel.observe({condition,readFactorAnalysis:true,ready});
 const bind=s=>{need(s.node_factor_analysis?.verified===true,'native role record rejected: '+JSON.stringify(s.node_factor_analysis?.invalid_field));return bindReformInput(s.node_factor_analysis,inputMapping);};
 const baseline=bind(await observe('complete factor_analysis roles'));
 need(baseline.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===inputMapping.target_fields[i][k])),'role schema differs from incoming fields');
 resolveFactorAnalysisFeatures(p,baseline.fields);
 const expected=p.factor_analysis?.features?baseline.fields.map(f=>({...f,usage_type:p.factor_analysis?.features.includes(f.name)?3:0})):baseline.fields;
 need(expected.some(f=>f.usage_type===3),'at least one numeric feature is required');
 need(expected.filter(f=>f.usage_type===3).every(f=>['integer','real'].includes(f.type)&&f.data_kind==='Непрерывный'),'continuous numeric features are required');let current=baseline.fields,edits=0;
 for(const wanted of expected){
  const original=current.find(f=>f.record_id===wanted.record_id);if(original.usage_type===wanted.usage_type)continue;
  const check=bind(await observe('roles before edit'));need(same(semantic(check.fields),semantic(current)),'roles changed before editor');
  const definition=await readOutputDefinitionPages(channel,{expectedCount:current.length});
  let s=await observeOutputDefinitionPage(channel,{offset:Math.floor(original.index/8)*8,schemaId:definition.schema_id,total:definition.total_columns,field:original,fieldAction:'double_click'});
  const root=s.wizard.root_ref,row=s=>s.wizard.output_columns.fields.find(f=>f.name===original.name);
  await channel.perform({condition:'edit exact factor_analysis role',initialObservation:s,ready:s=>s.wizard.root_ref===root&&!!row(s),identity:()=>original,
   resolve:s=>({verb:'double_click',ref:row(s).name_ref})});
  const editor=s=>s.wizard?.root_ref===root&&s.wizard.column_parameters?.status==='observed'&&s.wizard.column_parameters.portal_bound===true&&s.wizard.column_parameters.selected_column?.name===original.name;
  const choice=(e,kind)=>e.wizard_combo?.kind===kind&&e.wizard_combo.field.scope==='output_column'&&e.wizard_combo.field.name==='usage';
  const unique=(s,p)=>{const es=s.ui.elements.filter(p);need(es.length===1,'exact role control unavailable');return es[0];};
  const pickerReady=s=>editor(s)&&s.ui.elements.filter(e=>choice(e,'picker')&&e.allowed_actions.includes('click')).length===1;
  s=await channel.observe({condition:'bound factor_analysis role editor',ready:pickerReady});
  await channel.perform({condition:'open factor_analysis role choices',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'click',ref:unique(s,e=>choice(e,'picker')&&e.allowed_actions.includes('click')).ref})});
  const label={0:'Не задано',3:'Используемое'}[wanted.usage_type];
  s=await channel.observe({condition:'factor_analysis role option',ready:s=>editor(s)&&s.ui.elements.some(e=>choice(e,'option')&&e.wizard_combo.label===label)});
  await channel.perform({condition:'select factor_analysis role',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'select_wizard_option',ref:unique(s,e=>choice(e,'option')&&e.wizard_combo.label===label).ref})});
  s=await channel.observe({condition:'factor_analysis role applied in editor',ready:s=>editor(s)&&s.wizard.column_parameters.fields.usage.value===label
   &&s.ui.elements.filter(e=>e.column_close?.scope==='output'&&e.allowed_actions.includes('apply_output_column')).length===1});
  await channel.perform({condition:'commit factor_analysis role once',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'apply_output_column',ref:unique(s,e=>e.column_close?.scope==='output'&&e.allowed_actions.includes('apply_output_column')).ref})});
  current=current.map(f=>f.record_id===wanted.record_id?{...f,usage_type:wanted.usage_type}:f);
  const actual=bind(await observe('complete role edit readback'));
  need(same(semantic(actual.fields),semantic(current)),'role edit changed unrelated fields');edits++;
 }
 const configuration=bind(await observe('complete final factor_analysis roles'));
 need(same(semantic(configuration.fields),semantic(expected)),'final roles differ');
 return {verified:true,cleanup_complete:true,effect_possible:edits>0,baseline_configuration:baseline,configuration,applied_editors:edits,settings_applied:false};
}

export async function configureFactorAnalysis(channel,p,{inputMapping,request}){
 const roles=await configureFactorAnalysisRoles(channel,p,inputMapping);
 const one=(s,predicate,message)=>{const es=s.ui.elements.filter(predicate);need(es.length===1,message);return es[0];};
 const next=async(stage,destination)=>channel.perform({condition:'factor analysis '+stage+' accepted',ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
  resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'Next unavailable').ref,expected_stage:destination})});
 await next('input_mapping','factor_analysis');
 const ready=s=>s.wizard?.stage==='factor_analysis'&&s.node_factor_analysis?.verified===true&&s.node_factor_analysis.kind==='parameters';
 const observe=condition=>channel.observe({condition,readFactorAnalysis:true,ready});
 let state=await observe('complete PCA parameters');const old=state.node_factor_analysis;
 need(Object.values(old.switches).every(v=>v===false),'variable-driven parameters unsupported');
 const control=(s,key,verb)=>one(s,e=>(e.tid===s.wizard.root_tid+';FactorAnalysisWizard;'+key||e.identity?.anchor_tid===s.wizard.root_tid+';FactorAnalysisWizard;'+key)&&e.allowed_actions.includes(verb),'PCA control unavailable: '+key);
 const act=async(s,key,action)=>channel.perform({condition:'set PCA '+key,initialObservation:s,ready,identity:s=>({node:s.prepared_node_context,parameters:s.node_factor_analysis}),resolve:s=>({...action,ref:control(s,key,action.verb).ref})});
 const a=p.factor_analysis??{},features=roles.configuration.fields.filter(f=>f.usage_type===3);
 const mode=request?.mode??'pca_fixed';
 const selection={pca_fixed:['fixed',2,'factors','pedNFactors'],pca_eigenvalue:['eigenvalue',0,'eigenvalue','pedEigenValuesThreshold'],pca_variance:['variance',1,'variance_percent','pedCumDispersion']}[mode];
 need(selection,'unsupported PCA mode');
 const [criterion,radio,parameter,key]=selection;
 const value=a[parameter]??(key==='pedNFactors'?old.factors:old.values[key]);
 need(a[parameter]!==undefined||old.criterion===radio,'criterion switch requires an explicit threshold/count');
 need(radio!==2||Number.isSafeInteger(value)&&value>=1&&value<=features.length,'factor count exceeds selected feature count');
 need(radio!==0||Number.isFinite(value)&&value>=0.1&&value<=1.5,'eigenvalue must be 0.1..1.5');
 need(radio!==1||Number.isFinite(value)&&value>=1&&value<=100,'variance_percent must be 1..100');
 need(a.rotation!==undefined||old.rotation===0,'existing rotation unsupported; provide rotation none');
 for(const [name,wanted,controlKey] of [['criterion',radio,'pedSignificanceCriterion;ValueControl;radiofield'+(radio?'-'+radio:'')+';DisplayEl'],['rotation',0,'pedRotationType;ValueControl;radiofield;DisplayEl']]){
  state=await observe('PCA '+name+' before edit');if(state.node_factor_analysis[name]===wanted)continue;
  await act(state,controlKey,{verb:'set_checked',checked:true});state=await observe('PCA '+name+' readback');need(state.node_factor_analysis[name]===wanted,'PCA '+name+' differs');
 }
 const setNumber=async(key,value)=>{
  state=await observe('PCA '+key+' before edit');
  const current=key==='pedNFactors'?state.node_factor_analysis.factors:state.node_factor_analysis.values[key];
  if(current===value)return;
  await act(state,key+';ValueControl',{verb:'fill',text:String(value)});state=await observe('PCA '+key+' before commit');
  await act(state,key+';ValueControl',{verb:'press',key:'Tab'});
  state=await observe('PCA '+key+' committed');
  need((key==='pedNFactors'?state.node_factor_analysis.factors:state.node_factor_analysis.values[key])===value,'PCA '+key+' differs');
 };
 await setNumber(key,value);
 const output_cap=a.output_factors!==undefined?a.output_factors!==false:request?.target.kind==='new'?false:old.output_cap;
 const output_factors=typeof a.output_factors==='number'?a.output_factors:old.values.pedNOutFactorsMax;
 need(!output_cap||Number.isSafeInteger(output_factors)&&output_factors>=1&&output_factors<=128,'invalid output factor limit');
 state=await observe('PCA output cap');
 if(state.node_factor_analysis.output_cap!==output_cap)await act(state,'cntOutFactorsMax;cnt;chb;InputEl',{verb:'set_checked',checked:output_cap});
 if(output_cap)await setNumber('pedNOutFactorsMax',output_factors);
 const after=(await observe('complete PCA readback')).node_factor_analysis;
 need(after.criterion===radio&&after.rotation===0&&after.output_cap===output_cap,'PCA settings differ');
 need((key==='pedNFactors'?after.factors:after.values[key])===value&&(!output_cap||after.values.pedNOutFactorsMax===output_factors),'PCA threshold/count or output limit differs');
 const changed=new Set([key,...(typeof a.output_factors==='number'?['pedNOutFactorsMax']:[])]);
 need(['pedNFactors','pedEigenValuesThreshold','pedCumDispersion','pedNOutFactorsMax'].filter(k=>!changed.has(k)).every(k=>same(k==='pedNFactors'?after.factors:after.values[k],k==='pedNFactors'?old.factors:old.values[k])),'unrequested PCA settings changed');
 const configuration={...roles.configuration,mode,factors:after.factors,rotation:'none',criterion,...(radio!==2?{[parameter]:value}:{}),output_cap,output_factors:output_cap?output_factors:false,
  output_schema_changed:Math.min(features.length,old.output_cap?old.values.pedNOutFactorsMax:features.length)!==Math.min(features.length,output_cap?output_factors:features.length)};
 await next('factor_analysis',['output_mapping','done']);
 const destination=await channel.observe({condition:'PCA validated destination',ready:s=>['output_mapping','done'].includes(s.wizard?.stage)});
 if(destination.wizard.stage==='output_mapping'){
  await configureDerivedInlineMapping(channel,configuration,factorAnalysisInlineSources,undefined,{nextStage:'binning_ranges_mapping'});
  // The second native derived-output card uses the shared historical stage
  // name. Its complete loadings layout is reconciled through output port 1.
  await next('binning_ranges_mapping','done');
 }
 const done=await channel.observe({condition:'PCA accepted',ready:s=>s.wizard?.stage==='done'});
 return {...roles,configuration:{...configuration,node_context:done.prepared_node_context},validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
