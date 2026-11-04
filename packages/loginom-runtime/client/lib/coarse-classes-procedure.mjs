import {resolveCoarseClassesFields} from './coarse-classes-parameters.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
const need=(v,m)=>{if(!v)throw Error('Coarse classes: '+m);};
export const coarseClassesReady=s=>s.wizard?.stage==='coarse_classes'&&s.node_coarse_classes?.verified===true;
export const observeCoarseClasses=(channel,condition,ready=()=>true)=>channel.observe({condition,readCoarseClasses:true,ready:s=>coarseClassesReady(s)&&ready(s)});
const one=(s,p,m)=>{const es=s.ui.elements.filter(p);need(es.length===1,m);return es[0];};
const inventory=c=>c.fields.map(({role,...f})=>f);
export async function selectCoarseClassesField(channel,baseline,name){
 let s=await observeCoarseClasses(channel,'coarse classes inventory before selection');
 need(JSON.stringify(inventory(s.node_coarse_classes))===JSON.stringify(inventory(baseline)),'field inventory changed');
 const field=baseline.fields.find(f=>f.name===name);need(field,'exact field disappeared');
 if(s.node_coarse_classes.selected?.record_id===field.record_id)return s;
 const tid=s.wizard.root_tid+';CoarseClassesWizard-1;colColumnDisplayName_'+name;
 await channel.perform({condition:'select exact coarse classes field',initialObservation:s,ready:coarseClassesReady,identity:()=>field,
  resolve:s=>({verb:'click',ref:one(s,e=>e.tid===tid&&e.allowed_actions.includes('click'),'visible coarse classes field required: '+name).ref})});
 return observeCoarseClasses(channel,'coarse classes selected field settled',s=>s.node_coarse_classes.selected?.record_id===field.record_id);
}
export async function configureCoarseClasses(channel,parameters,{request,inputMapping,preconfiguration}){
 const applying=request.mode==='apply',fields=(applying?preconfiguration:inputMapping)?.target_fields;
 need(Array.isArray(fields)&&fields.length>0,'complete current input mapping required');
 let s=await observeCoarseClasses(channel,'owned coarse classes configuration'),baseline=s.node_coarse_classes;
 need(baseline.fields.length===fields.length&&baseline.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===fields[i][k])),'roles differ from current input mapping');
 const used=role=>s.node_coarse_classes.fields.filter(f=>f.role===role);
 const wanted=applying?null:resolveCoarseClassesFields(parameters,fields);
 const act=async(path,action,field)=>{
  const tid=s.wizard.root_tid+';CoarseClassesWizard-1;CoarseClassesSettingsFrame;'+path;
  await channel.perform({condition:'set coarse classes '+path,initialObservation:s,ready:coarseClassesReady,identity:()=>field,
   resolve:s=>({...action,ref:one(s,e=>(e.tid===tid+(action.verb==='set_checked'?';DisplayEl':'')||e.tid===tid||action.verb!=='set_checked'&&e.tid===null&&e.identity?.anchor_tid===tid&&e.signature?.tag==='input')&&e.allowed_actions.includes(action.verb),'exact coarse classes control required: '+path).ref})});
  s=await observeCoarseClasses(channel,'coarse classes control readback',s=>s.node_coarse_classes.selected?.record_id===field.record_id);
 };
 if(!applying)for(const f of baseline.fields){
  s=await selectCoarseClassesField(channel,baseline,f.name);
  const role=f.name===wanted.input_field?'input':f.name===wanted.target_field?'target':'unused';
  if(s.node_coarse_classes.selected.role!==role){
   await act('cbxColumnPurpose;trg_picker',{verb:'click'},f);
   const owner=s.wizard.root_tid+';CoarseClassesWizard-1;CoarseClassesSettingsFrame;cbxColumnPurpose;boundlist;';
   const label={unused:'Не выбрано',input:'Входное',target:'Выходное'}[role];
   s=await observeCoarseClasses(channel,'coarse classes role option',s=>s.ui.elements.some(e=>e.tid?.startsWith(owner)&&e.label===label));
   await channel.perform({condition:'choose coarse classes '+role,initialObservation:s,ready:coarseClassesReady,identity:()=>f,
    resolve:s=>({verb:'click',ref:one(s,e=>e.tid?.startsWith(owner)&&e.label===label&&e.allowed_actions.includes('click'),'exact coarse classes role option required').ref})});
   s=await observeCoarseClasses(channel,'coarse classes role committed',s=>s.node_coarse_classes.selected?.record_id===f.record_id&&s.node_coarse_classes.selected.role===role);
  }
  if(role==='input')for(const [key,path] of [['min_class_percent','edtMinimalClassRate;ValueControl'],['max_classes','edtDesiredClassCount;ValueControl'],['uniformity_percent','edtUniformityCoefficient;ValueControl']]){
   if(s.node_coarse_classes.settings[key]===wanted[key])continue;
   await act(path,{verb:'fill',text:String(wanted[key])},f);await act(path,{verb:'press',key:'Tab'},f);
   need(s.node_coarse_classes.settings[key]===wanted[key],'analytic setting readback differs: '+key);
  }
  if(role==='input'&&s.node_coarse_classes.settings.fine_classes!==false)await act('chkUseFineClassesBinning;ValueControl',{verb:'set_checked',checked:false},f);
  if(role==='target'&&s.node_coarse_classes.settings.event_value!==wanted.event_value){
   await act('cbxEventValue;ValueContainer;txt-1',{verb:'fill',text:wanted.event_value},f);
   await act('cbxEventValue;ValueContainer;txt-1',{verb:'press',key:'Tab'},f);
   need(s.node_coarse_classes.settings.event_value===wanted.event_value,'event label readback differs');
  }
 }
 need(used('input').length===1&&used('target').length===1,'one predictor and one target required');
 const input=used('input')[0],target=used('target')[0];
 resolveCoarseClassesFields({coarse_classes:{input_field:input.name,target_field:target.name}},fields);
 s=await selectCoarseClassesField(channel,baseline,target.name);const event=s.node_coarse_classes.settings.event_value;
 need(typeof event==='string'&&event.length>0,'saved exact event label required');
 s=await selectCoarseClassesField(channel,baseline,input.name);const settings=s.node_coarse_classes.settings;
 need(settings.fine_classes===false,'initial-class bypass is outside this stage');
 const configuration={...s.node_coarse_classes,mode:request.mode,input_field:input.name,target_field:target.name,event_value:event,partition:'automatic',min_class_percent:settings.min_class_percent,max_classes:settings.max_classes,uniformity_percent:settings.uniformity_percent,fields:fields.map(({name,label,type,data_kind})=>({name,label,type,data_kind})),roles:s.node_coarse_classes.fields.map(({name,role})=>({name,role}))};
 const next=async(stage,destination)=>{
  await channel.perform({condition:'accept coarse classes '+stage,ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'coarse classes Next required').ref,expected_stage:destination})});
  return channel.observe({condition:'coarse classes '+destination+' ready',ready:s=>s.wizard?.stage===destination});
 };
 await next('coarse_classes','coarse_classes_model');
 // A model is admitted only from the visible native class grid. Merely saved
 // settings, an empty class page or an old preview cannot authorize apply.
 const model=applying?(await channel.observe({condition:'saved native coarse classes',readCoarseClasses:true,ready:s=>s.wizard?.stage==='coarse_classes_model'&&s.node_coarse_classes?.verified===true})).node_coarse_classes:{state:'settings',classes:[],total_iv:null};
 if(applying){
  if(model.state!=='materialized'||model.input_field!==configuration.input_field){
   const closed=await closePreparedWizard(channel);const error=Error('Coarse classes apply requires saved materialized classes; use internal to train current input');
   error.nodePhaseRefusal={phase:'configure',status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,verification:'coarse_classes_apply_preserved',proof:{closed}};throw error;
  }
  return {verified:true,cleanup_complete:true,effect_possible:false,settings_applied:false,configuration:{...configuration,...model}};
 }
 await next('coarse_classes_model','output_mapping');await next('output_mapping','binning_ranges_mapping');await next('binning_ranges_mapping','coarse_classes_mapping_2');
 const done=await next('coarse_classes_mapping_2','done');
 return {verified:true,cleanup_complete:true,effect_possible:true,configuration:{...configuration,state:'settings',classes:[],total_iv:null},validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
