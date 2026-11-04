import {resolveFactorAnalysisFeatures} from './factor-analysis-parameters.mjs';
import {bindReformInput} from './reform-input.mjs';
import {readOutputDefinitionPages,observeOutputDefinitionPage} from './import-definition-pages.mjs';
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

export async function configureFactorAnalysis(channel,p,{inputMapping}){
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
 const factors=a.factors??old.factors;
 need(factors>=1&&factors<=features.length,'factor count exceeds selected feature count');
 // Native radio order was observed in discovery: fixed count is option 2,
 // no rotation option 0. Existing omission only preserves supported settings.
 need(a.factors!==undefined||old.criterion===2,'existing automatic criterion unsupported; provide factors');
 need(a.rotation!==undefined||old.rotation===0,'existing rotation unsupported; provide rotation none');
 for(const [name,value,key] of [['criterion',2,'pedSignificanceCriterion;ValueControl;radiofield-2;DisplayEl'],['rotation',0,'pedRotationType;ValueControl;radiofield;DisplayEl']]){
  state=await observe('PCA '+name+' before edit');if(state.node_factor_analysis[name]===value)continue;
  await act(state,key,{verb:'set_checked',checked:true});state=await observe('PCA '+name+' readback');need(state.node_factor_analysis[name]===value,'PCA '+name+' differs');
 }
 state=await observe('PCA factor count before edit');
 if(state.node_factor_analysis.factors!==factors){
  await act(state,'pedNFactors;ValueControl',{verb:'fill',text:String(factors)});state=await observe('PCA factors before commit');
  await act(state,'pedNFactors;ValueControl',{verb:'press',key:'Tab'});
 }
 state=await observe('PCA output cap');if(state.node_factor_analysis.output_cap)await act(state,'cntOutFactorsMax;cnt;chb;InputEl',{verb:'set_checked',checked:false});
 const after=(await observe('complete fixed PCA readback')).node_factor_analysis;
 need(after.criterion===2&&after.rotation===0&&after.factors===factors&&after.output_cap===false,'PCA settings differ');
 need(['pedEigenValuesThreshold','pedCumDispersion','pedNOutFactorsMax'].every(k=>same(after.values[k],old.values[k])),'unrequested PCA settings changed');
 await next('factor_analysis','done');const done=await channel.observe({condition:'PCA accepted',ready:s=>s.wizard?.stage==='done'});
 return {...roles,configuration:{...roles.configuration,factors,rotation:'none',criterion:'fixed',output_cap:false,node_context:done.prepared_node_context},validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
