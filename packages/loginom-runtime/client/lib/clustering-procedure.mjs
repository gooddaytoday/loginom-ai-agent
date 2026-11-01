import {resolveClusteringFeatures} from './clustering-parameters.mjs';
import {bindReformInput} from './reform-input.mjs';
import {readOutputDefinitionPages,observeOutputDefinitionPage} from './import-definition-pages.mjs';
const need=(v,m)=>{if(!v)throw Error('Clustering: '+m);};
const semantic=fs=>fs.map(({selected,origin_type,...f})=>f);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function configureClusteringRoles(channel,p,inputMapping){
 const ready=s=>s.wizard?.stage==='input_mapping'&&(s.node_clustering?.verified===true||s.node_clustering?.reason==='clustering_record');
 const observe=condition=>channel.observe({condition,readClustering:true,ready});
 const bind=s=>{need(s.node_clustering?.verified===true,'native role record rejected: '+JSON.stringify(s.node_clustering?.invalid_field));return bindReformInput(s.node_clustering,inputMapping);};
 const baseline=bind(await observe('complete clustering roles'));
 need(baseline.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===inputMapping.target_fields[i][k])),'role schema differs from incoming fields');
 resolveClusteringFeatures(p,baseline.fields);
 const expected=p.features?baseline.fields.map(f=>({...f,usage_type:p.features.some(w=>w.name===f.name)?3:0})):baseline.fields;
 need(expected.some(f=>f.usage_type===3),'at least one numeric feature is required');
 need(expected.filter(f=>f.usage_type===3).every(f=>['integer','real'].includes(f.type)&&f.data_kind==='Непрерывный'),'continuous numeric features are required');let current=baseline.fields,edits=0;
 for(const wanted of expected){
  const original=current.find(f=>f.record_id===wanted.record_id);if(original.usage_type===wanted.usage_type)continue;
  const check=bind(await observe('roles before edit'));need(same(semantic(check.fields),semantic(current)),'roles changed before editor');
  const definition=await readOutputDefinitionPages(channel,{expectedCount:current.length});
  let s=await observeOutputDefinitionPage(channel,{offset:Math.floor(original.index/8)*8,schemaId:definition.schema_id,total:definition.total_columns,field:original,fieldAction:'double_click'});
  const root=s.wizard.root_ref,row=s=>s.wizard.output_columns.fields.find(f=>f.name===original.name);
  await channel.perform({condition:'edit exact clustering role',initialObservation:s,ready:s=>s.wizard.root_ref===root&&!!row(s),identity:()=>original,
   resolve:s=>({verb:'double_click',ref:row(s).name_ref})});
  const editor=s=>s.wizard?.root_ref===root&&s.wizard.column_parameters?.status==='observed'&&s.wizard.column_parameters.portal_bound===true&&s.wizard.column_parameters.selected_column?.name===original.name;
  const choice=(e,kind)=>e.wizard_combo?.kind===kind&&e.wizard_combo.field.scope==='output_column'&&e.wizard_combo.field.name==='usage';
  const unique=(s,p)=>{const es=s.ui.elements.filter(p);need(es.length===1,'exact role control unavailable');return es[0];};
  const pickerReady=s=>editor(s)&&s.ui.elements.filter(e=>choice(e,'picker')&&e.allowed_actions.includes('click')).length===1;
  s=await channel.observe({condition:'bound clustering role editor',ready:pickerReady});
  await channel.perform({condition:'open clustering role choices',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'click',ref:unique(s,e=>choice(e,'picker')&&e.allowed_actions.includes('click')).ref})});
  const label={0:'Не задано',3:'Используемое'}[wanted.usage_type];
  s=await channel.observe({condition:'clustering role option',ready:s=>editor(s)&&s.ui.elements.some(e=>choice(e,'option')&&e.wizard_combo.label===label)});
  await channel.perform({condition:'select clustering role',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'select_wizard_option',ref:unique(s,e=>choice(e,'option')&&e.wizard_combo.label===label).ref})});
  s=await channel.observe({condition:'clustering role applied in editor',ready:s=>editor(s)&&s.wizard.column_parameters.fields.usage.value===label
   &&s.ui.elements.filter(e=>e.column_close?.scope==='output'&&e.allowed_actions.includes('apply_output_column')).length===1});
  await channel.perform({condition:'commit clustering role once',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'apply_output_column',ref:unique(s,e=>e.column_close?.scope==='output'&&e.allowed_actions.includes('apply_output_column')).ref})});
  current=current.map(f=>f.record_id===wanted.record_id?{...f,usage_type:wanted.usage_type}:f);
  const actual=bind(await observe('complete role edit readback'));
  need(same(semantic(actual.fields),semantic(current)),'role edit changed unrelated fields');edits++;
 }
 const configuration=bind(await observe('complete final clustering roles'));
 need(same(semantic(configuration.fields),semantic(expected)),'final roles differ');
 return {verified:true,cleanup_complete:true,effect_possible:edits>0,baseline_configuration:baseline,configuration,applied_editors:edits,settings_applied:false};
}

export async function configureClustering(channel,p,{request,inputMapping}){
 const roles=await configureClusteringRoles(channel,p,inputMapping);
 const one=(s,predicate,message)=>{const es=s.ui.elements.filter(predicate);need(es.length===1,message);return es[0];};
 const next=async(stage,destination)=>channel.perform({condition:'clustering '+stage+' accepted',ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
  resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'Next unavailable').ref,expected_stage:destination})});
 await next('input_mapping','normalization');
 const normReady=s=>s.wizard?.stage==='normalization'&&s.node_clustering?.verified===true&&s.node_clustering.kind==='normalization';
 const norm=condition=>channel.observe({condition,readClustering:true,ready:normReady});
 let state=await norm('complete clustering normalizers');const baseline=state.node_clustering;
 const features=roles.configuration.fields.filter(f=>f.usage_type===3);
 need(same(baseline.fields.map(f=>f.name),features.map(f=>f.name)),'normalizer fields differ from the selected numeric features');
 const wantedNorm=p.normalization===undefined&&request.target.kind==='existing'?baseline.fields[0]?.norm_type:p.normalization==='standardize'?5:0;
 need([0,5].includes(wantedNorm)&&(p.normalization!==undefined||request.target.kind==='new'||baseline.fields.every(f=>f.norm_type===wantedNorm)),
  'existing mixed or unsupported normalization requires an explicit none/standardize choice');
 const normLabel=wantedNorm===5?'Стандартизация':'Нет';
 for(const field of baseline.fields){
  state=await norm('normalizer before change');if(state.node_clustering.fields.find(f=>f.record_id===field.record_id)?.norm_type===wantedNorm)continue;
  const base=state.wizard.root_tid+';NormTuneWizard;',key=field.name.replace(/\s/g,'_').replace(/,/g,'');
  await channel.perform({condition:'select normalizer field '+field.name,initialObservation:state,ready:normReady,identity:()=>field,
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid===base+'colDisplayName_'+key&&e.allowed_actions.includes('click'),'Normalizer field unavailable').ref})});
  state=await norm('normalizer field selected');need(same(state.node_clustering.selected,[field.record_id]),'normalizer selection changed');
  await channel.perform({condition:'edit owned normalizer',initialObservation:state,ready:normReady,identity:()=>field,
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid===base+'btnEdit'&&e.allowed_actions.includes('click'),'Normalizer Edit unavailable').ref})});
  const editor=s=>normReady(s)&&same(s.node_clustering.editor?.record_ids,[field.record_id]);
  state=await channel.observe({condition:'bound normalizer editor',readClustering:true,ready:editor});
  const editorBase=state.node_clustering.editor.root_tid;
  await channel.perform({condition:'open native normalizer choices',initialObservation:state,ready:editor,identity:()=>field,
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid===editorBase+';cbxNormType;trg_picker'&&e.allowed_actions.includes('click'),'Normalizer picker unavailable').ref})});
  state=await channel.observe({condition:'native normalizer option',readClustering:true,ready:s=>editor(s)&&s.ui.elements.some(e=>e.label===normLabel&&e.allowed_actions.includes('click')&&(e.role==='option'||e.tid?.startsWith(editorBase+';cbxNormType;boundlist;')))});
  await channel.perform({condition:'select '+normLabel,initialObservation:state,ready:editor,identity:()=>field,
   resolve:s=>({verb:'click',ref:one(s,e=>e.label===normLabel&&e.allowed_actions.includes('click')&&(e.role==='option'||e.tid?.startsWith(editorBase+';cbxNormType;boundlist;')),'Unique normalizer option required').ref})});
  state=await channel.observe({condition:'normalization in owned editor',readClustering:true,ready:s=>editor(s)&&s.node_clustering.editor.norm_type===wantedNorm});
  await channel.perform({condition:'commit owned normalizer once',initialObservation:state,ready:editor,identity:()=>field,
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid===editorBase+';btnApply'&&e.allowed_actions.includes('click'),'Normalizer OK unavailable').ref})});
  state=await norm('normalizer committed');need(!state.node_clustering.editor&&state.node_clustering.fields.find(f=>f.record_id===field.record_id)?.norm_type===wantedNorm,'normalizer was not committed');
 }
 state=await norm('complete normalization readback');const normalization=state.node_clustering;
 need(normalization.fields.every(f=>f.norm_type===wantedNorm)&&same(normalization.fields.map(({norm_type,...f})=>f),baseline.fields.map(({norm_type,...f})=>f)),'normalization changed other field settings');
 if(normalization.source_status!=='Вход активирован'){
  await channel.perform({condition:'activate current clustering input',initialObservation:state,ready:normReady,identity:s=>({node:s.prepared_node_context,fields:normalization.fields}),
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid===s.wizard.root_tid+';NormTuneWizard;btnActivationPort'&&e.allowed_actions.includes('click'),'Input activation unavailable').ref})});
  state=await channel.observe({condition:'clustering input activated',readClustering:true,ready:s=>normReady(s)&&['Вход активирован','Ошибка'].includes(s.node_clustering.source_status)});
  need(state.node_clustering.source_status==='Вход активирован','normalization input activation failed; missing or invalid feature values must be corrected before Execute');
 }
 await next('normalization','clustering');
 const ready=s=>s.wizard?.stage==='clustering'&&s.node_clustering?.verified===true&&s.node_clustering.kind==='parameters';
 const observe=condition=>channel.observe({condition,readClustering:true,ready});
 state=await observe('complete k-means parameters');const old=state.node_clustering;
 need(Object.values(old.switches).every(v=>v===false),'variable-driven clustering parameters are unsupported');
 const control=(s,key,verb)=>one(s,e=>(e.tid===s.wizard.root_tid+';ClusterizationWizard;'+key||e.identity?.anchor_tid===s.wizard.root_tid+';ClusterizationWizard;'+key)&&e.allowed_actions.includes(verb),'Clustering control unavailable: '+key);
 const act=async(s,condition,key,action)=>channel.perform({condition,initialObservation:s,ready,identity:s=>({node:s.prepared_node_context,parameters:s.node_clustering}),resolve:s=>({...action,ref:control(s,key,action.verb).ref})});
 if(old.auto){await act(state,'disable automatic cluster selection','pedAutoClusters;ValueControl;DisplayEl',{verb:'set_checked',checked:false});state=await observe('fixed cluster count enabled');need(state.node_clustering.auto===false,'automatic cluster selection is still enabled');}
 const wanted={clusters:p.clusters??old.clusters,seed:p.seed??(request.target.kind==='new'?42:old.seed)};
 for(const [name,key] of [['clusters','pedClusters;ValueControl'],['seed','RandSeedEdit;edtRandSeed;ValueControl']]){
  state=await observe('k-means '+name+' before edit');if(state.node_clustering[name]===wanted[name])continue;
  await act(state,'set k-means '+name,key,{verb:'fill',text:String(wanted[name])});state=await observe('k-means '+name+' before commit');
  await act(state,'commit k-means '+name,key,{verb:'press',key:'Tab'});state=await observe('k-means '+name+' readback');need(state.node_clustering[name]===wanted[name],'k-means '+name+' differs');
 }
 const after=(await observe('complete fixed k-means readback')).node_clustering;
 need(after.auto===false&&['pedClustersMin','pedClustersMax','pedThreshold'].every(k=>same(after.values[k],old.values[k])),'unrequested clustering parameters changed');
 await next('clustering','done');const done=await channel.observe({condition:'clustering settings accepted',ready:s=>s.wizard?.stage==='done'});
 return {...roles,configuration:{...roles.configuration,clusters:after.clusters,seed:after.seed,normalization:normalization.fields,node_context:done.prepared_node_context},validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
