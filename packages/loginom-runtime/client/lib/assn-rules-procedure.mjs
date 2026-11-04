import {resolveAssnRulesRoles} from './assn-rules-parameters.mjs';
import {bindReformInput} from './reform-input.mjs';
import {readOutputDefinitionPages,observeOutputDefinitionPage} from './import-definition-pages.mjs';
const need=(v,m)=>{if(!v)throw Error('Association rules: '+m);};
const semantic=fs=>fs.map(({selected,origin_type,...f})=>f);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function configureAssnRulesRoles(channel,p,inputMapping){
 const ready=s=>s.wizard?.stage==='input_mapping'&&(s.node_assn_rules?.verified===true||s.node_assn_rules?.reason==='assn_rules_record');
 const observe=condition=>channel.observe({condition,readAssnRules:true,ready});
 const bind=s=>{need(s.node_assn_rules?.verified===true,'native role record rejected: '+JSON.stringify(s.node_assn_rules?.invalid_field));return bindReformInput(s.node_assn_rules,inputMapping);};
 const baseline=bind(await observe('complete assn_rules roles'));
 need(baseline.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===inputMapping.target_fields[i][k])),'role schema differs from incoming fields');
 resolveAssnRulesRoles(p,baseline.fields);
 const transaction=p.transaction_field??baseline.fields.find(f=>f.usage_type===baseline.roles.transaction)?.name,item=p.item_field??baseline.fields.find(f=>f.usage_type===baseline.roles.item)?.name;
 resolveAssnRulesRoles({transaction_field:transaction,item_field:item},baseline.fields);
 need(transaction&&item&&transaction!==item,'one transaction role and one item role required');
 const expected=baseline.fields.map(f=>({...f,usage_type:f.name===transaction?baseline.roles.transaction:f.name===item?baseline.roles.item:0}));let current=baseline.fields,edits=0;
 for(const wanted of expected){
  const original=current.find(f=>f.record_id===wanted.record_id);if(original.usage_type===wanted.usage_type)continue;
  const check=bind(await observe('roles before edit'));need(same(semantic(check.fields),semantic(current)),'roles changed before editor');
  const definition=await readOutputDefinitionPages(channel,{expectedCount:current.length});
  let s=await observeOutputDefinitionPage(channel,{offset:Math.floor(original.index/8)*8,schemaId:definition.schema_id,total:definition.total_columns,field:original,fieldAction:'double_click'});
  const root=s.wizard.root_ref,row=s=>s.wizard.output_columns.fields.find(f=>f.name===original.name);
  await channel.perform({condition:'edit exact assn_rules role',initialObservation:s,ready:s=>s.wizard.root_ref===root&&!!row(s),identity:()=>original,
   resolve:s=>({verb:'double_click',ref:row(s).name_ref})});
  const editor=s=>s.wizard?.root_ref===root&&s.wizard.column_parameters?.status==='observed'&&s.wizard.column_parameters.portal_bound===true&&s.wizard.column_parameters.selected_column?.name===original.name;
  const choice=(e,kind)=>e.wizard_combo?.kind===kind&&e.wizard_combo.field.scope==='output_column'&&e.wizard_combo.field.name==='usage';
  const unique=(s,p)=>{const es=s.ui.elements.filter(p);need(es.length===1,'exact role control unavailable');return es[0];};
  const pickerReady=s=>editor(s)&&s.ui.elements.filter(e=>choice(e,'picker')&&e.allowed_actions.includes('click')).length===1;
  s=await channel.observe({condition:'bound assn_rules role editor',ready:pickerReady});
  await channel.perform({condition:'open assn_rules role choices',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'click',ref:unique(s,e=>choice(e,'picker')&&e.allowed_actions.includes('click')).ref})});
  const label=wanted.usage_type===baseline.roles.transaction?'Транзакция':wanted.usage_type===baseline.roles.item?'Элемент':'Не задано';
  s=await channel.observe({condition:'assn_rules role option',ready:s=>editor(s)&&s.ui.elements.some(e=>choice(e,'option')&&e.wizard_combo.label===label)});
  await channel.perform({condition:'select assn_rules role',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'select_wizard_option',ref:unique(s,e=>choice(e,'option')&&e.wizard_combo.label===label).ref})});
  s=await channel.observe({condition:'assn_rules role applied in editor',ready:s=>editor(s)&&s.wizard.column_parameters.fields.usage.value===label
   &&s.ui.elements.filter(e=>e.column_close?.scope==='output'&&e.allowed_actions.includes('apply_output_column')).length===1});
  await channel.perform({condition:'commit assn_rules role once',initialObservation:s,ready:editor,identity:()=>original,
   resolve:s=>({verb:'apply_output_column',ref:unique(s,e=>e.column_close?.scope==='output'&&e.allowed_actions.includes('apply_output_column')).ref})});
  current=current.map(f=>f.record_id===wanted.record_id?{...f,usage_type:wanted.usage_type}:f);
  const actual=bind(await observe('complete role edit readback'));
  need(same(semantic(actual.fields),semantic(current)),'role edit changed unrelated fields');edits++;
 }
 const configuration=bind(await observe('complete final assn_rules roles'));
 need(same(semantic(configuration.fields),semantic(expected)),'final roles differ');
 return {verified:true,cleanup_complete:true,effect_possible:edits>0,baseline_configuration:baseline,configuration,applied_editors:edits,settings_applied:false};
}

export async function configureAssnRules(channel,p,{request,inputMapping}){
 const roles=await configureAssnRulesRoles(channel,p,inputMapping);
 const one=(s,predicate,message)=>{const es=s.ui.elements.filter(predicate);need(es.length===1,message);return es[0];};
 const next=async(stage,destination)=>channel.perform({condition:'association rules '+stage+' accepted',ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
  resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'Next unavailable').ref,expected_stage:destination})});
 await next('input_mapping','assn_rules_auxiliary');
 const auxiliary=await channel.observe({condition:'association rules empty auxiliary input',readAssnRules:true,ready:s=>s.wizard?.stage==='assn_rules_auxiliary'&&s.node_assn_rules?.verified===true});
 need(auxiliary.node_assn_rules.kind==='auxiliary'&&auxiliary.node_assn_rules.field_count===0,'auxiliary input must remain empty');
 await next('assn_rules_auxiliary','assn_rules');
 const ready=s=>s.wizard?.stage==='assn_rules'&&s.node_assn_rules?.verified===true&&s.node_assn_rules.kind==='parameters';
 const observe=condition=>channel.observe({condition,readAssnRules:true,ready});
 let state=await observe('initialized FP-Growth parameters');const old=state.node_assn_rules;
 need(Object.values(old.switches).every(v=>v===false),'variable-driven parameters are unsupported');
 need(old.values.pedExcludeLargeSupportItems===false&&old.values.pedSelectColumn===false&&old.values.pedExcludeSingleItems===false&&old.values.pedNConsequentMax===1,'unsupported saved filters or consequence limit');
 const wanted={pedMinSupport:p.min_support_pct??old.values.pedMinSupport,pedMinConfidence:p.min_confidence_pct??old.values.pedMinConfidence,pedNItemsMax:p.max_items??(request.target.kind==='new'?2:old.values.pedNItemsMax),pedMinLift:0};
 need(wanted.pedNItemsMax===2,'existing max_items must be 2 or explicitly set to 2');
 const act=async(s,condition,key,action)=>channel.perform({condition,initialObservation:s,ready,identity:s=>({node:s.prepared_node_context,parameters:s.node_assn_rules}),
  resolve:s=>({...action,ref:one(s,e=>(e.tid===s.wizard.root_tid+';AssnRulesWizard;'+key||e.identity?.anchor_tid===s.wizard.root_tid+';AssnRulesWizard;'+key)&&e.allowed_actions.includes(action.verb),'Parameter control unavailable: '+key).ref})});
 for(const [name,value] of Object.entries(wanted)){
  state=await observe(name+' before edit');if(state.node_assn_rules.values[name]===value)continue;
  await act(state,'set '+name,name+';ValueControl',{verb:'fill',text:String(value)});
  state=await observe(name+' before commit');
  await act(state,'commit '+name,name+';ValueControl',{verb:'press',key:'Tab'});
  state=await observe(name+' readback');need(state.node_assn_rules.values[name]===value,name+' differs');
 }
 const after=(await observe('complete FP-Growth readback')).node_assn_rules;
 need(Object.entries(old.values).every(([k,v])=>after.values[k]===(Object.hasOwn(wanted,k)?wanted[k]:v))&&same(after.switches,old.switches),'unrequested parameters changed');
 await next('assn_rules','done');
 const done=await channel.observe({condition:'association rule settings accepted',ready:s=>s.wizard?.stage==='done'});
 return {...roles,configuration:{...roles.configuration,min_support_pct:after.values.pedMinSupport,min_confidence_pct:after.values.pedMinConfidence,max_items:after.values.pedNItemsMax,node_context:done.prepared_node_context},validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}

