import {resolveCoarseClassesFields} from './coarse-classes-parameters.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {configureManualCoarseClasses,configureFrozenCoarseClasses,observeExternalCoarseClasses} from './coarse-classes-manual.mjs';
const need=(v,m)=>{if(!v)throw Error('Coarse classes: '+m);};
export const coarseClassesReady=s=>s.wizard?.stage==='coarse_classes'&&s.node_coarse_classes?.verified===true;
export const observeCoarseClasses=(channel,condition,ready=()=>true)=>channel.observe({condition,readCoarseClasses:true,ready:s=>coarseClassesReady(s)&&ready(s)});
const one=(s,p,m)=>{const es=s.ui.elements.filter(p);need(es.length===1,m);return es[0];};
const inventory=c=>c.fields.map(({role,frozen,external,...f})=>f);
// One feature identifier (1), class number (2) and category (3); every other
// external column stays unused (0). Numeric bound kinds are outside this mode.
export const completeExternalLinks=links=>Array.isArray(links)&&links.length>0&&[1,2,3].every(k=>links.filter(l=>l.kind===k).length===1)&&links.every(l=>[0,1,2,3].includes(l.kind));
const externalReady=s=>s.wizard?.stage==='coarse_classes_external'&&s.node_coarse_classes?.verified===true&&Array.isArray(s.node_coarse_classes.external?.links);
export async function acceptCoarseClassesExternalPage(channel,request){
 const external=request.mode==='internal'&&request.parameters?.coarse_classes?.partition==='external';
 let s=await channel.observe({condition:'coarse classes first page',readCoarseClasses:true,ready:s=>coarseClassesReady(s)||externalReady(s)});
 if(s.wizard.stage!=='coarse_classes_external'){need(!external,'partition external requires the ready class table connected to input 1');return null;}
 need(request.mode==='apply'||external,'table input 1 is the ready class table: use partition external');
 const before=structuredClone(s.node_coarse_classes.external.links);
 if(external&&!completeExternalLinks(before)){
  const tid=s.wizard.root_tid+';CoarseClassesWizard;';
  await channel.perform({condition:'set native external class links automatically',initialObservation:s,ready:externalReady,identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid?.startsWith(tid)&&/;colAutoMappingColumnKind$/.test(e.tid)&&e.allowed_actions.includes('click'),'native external auto-link control required').ref})});
  s=await channel.observe({condition:'external class links readback',readCoarseClasses:true,ready:s=>externalReady(s)&&completeExternalLinks(s.node_coarse_classes.external.links)});
 }
 const links=structuredClone(s.node_coarse_classes.external.links);
 need(completeExternalLinks(links),'external table needs one feature identifier, class number and category column; others unused');
 await channel.perform({condition:'accept coarse classes external links',initialObservation:s,ready:externalReady,identity:s=>s.prepared_node_context,
  resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'coarse classes Next required').ref,expected_stage:'coarse_classes'})});
 await observeCoarseClasses(channel,'coarse classes roles after external links');
 return {links,auto_mapped:JSON.stringify(before)!==JSON.stringify(links)};
}
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
export async function configureCoarseClasses(channel,parameters,{request,inputMapping,preconfiguration,external}){
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
  // LAB-1324 probe: the external partition is the native role 'Входное (внешнее разбиение)' (ColumnPurpose 2).
  const external=role==='input'&&wanted.partition==='external';
  if(s.node_coarse_classes.selected.role!==role||role==='input'&&(external!==(s.node_coarse_classes.selected.external===true)||s.node_coarse_classes.selected.frozen&&!wanted.frozen)){
   await act('cbxColumnPurpose;trg_picker',{verb:'click'},f);
   const owner=s.wizard.root_tid+';CoarseClassesWizard-1;CoarseClassesSettingsFrame;cbxColumnPurpose;boundlist;';
   const label=external?'Входное (внешнее разбиение)':{unused:'Не выбрано',input:'Входное',target:'Выходное'}[role];
   s=await observeCoarseClasses(channel,'coarse classes role option',s=>s.ui.elements.some(e=>e.tid?.startsWith(owner)&&e.label===label));
   await channel.perform({condition:'choose coarse classes '+role,initialObservation:s,ready:coarseClassesReady,identity:()=>f,
    resolve:s=>({verb:'click',ref:one(s,e=>e.tid?.startsWith(owner)&&e.label===label&&e.allowed_actions.includes('click'),'exact coarse classes role option required').ref})});
   s=await observeCoarseClasses(channel,'coarse classes role committed',s=>s.node_coarse_classes.selected?.record_id===f.record_id&&s.node_coarse_classes.selected.role===role&&(role!=='input'||(external?s.node_coarse_classes.selected.external===true:wanted.frozen||!s.node_coarse_classes.selected.frozen&&!s.node_coarse_classes.selected.external)));
  }
  if(role==='input'&&!s.node_coarse_classes.selected.frozen&&!external)for(const [key,path] of [['min_class_percent','edtMinimalClassRate;ValueControl'],['max_classes','edtDesiredClassCount;ValueControl'],['uniformity_percent','edtUniformityCoefficient;ValueControl']]){
   if(s.node_coarse_classes.settings[key]===wanted[key])continue;
   await act(path,{verb:'fill',text:String(wanted[key])},f);await act(path,{verb:'press',key:'Tab'},f);
   need(s.node_coarse_classes.settings[key]===wanted[key],'analytic setting readback differs: '+key);
  }
  if(role==='input'&&!s.node_coarse_classes.selected.frozen&&!external&&s.node_coarse_classes.settings.fine_classes!==false)await act('chkUseFineClassesBinning;ValueControl',{verb:'set_checked',checked:false},f);
  if(role==='target'&&s.node_coarse_classes.settings.event_value!==wanted.event_value){
   const path=s.node_coarse_classes.settings.event_control;need(typeof path==='string','rendered target event editor required');
   if(path.endsWith(';cbx')){
    await act(path+';trg_picker',{verb:'click'},f);
    const owner=s.wizard.root_tid+';CoarseClassesWizard-1;CoarseClassesSettingsFrame;'+path+';boundlist;';
    s=await observeCoarseClasses(channel,'native exact event option',s=>s.ui.elements.some(e=>e.tid?.startsWith(owner)&&e.label===wanted.event_value));
    await channel.perform({condition:'select observed target event',initialObservation:s,ready:coarseClassesReady,identity:()=>f,
     resolve:s=>({verb:'click',ref:one(s,e=>e.tid?.startsWith(owner)&&e.label===wanted.event_value&&e.allowed_actions.includes('click'),'exact native event option required').ref})});
    s=await observeCoarseClasses(channel,'selected target event readback',s=>s.node_coarse_classes.settings.event_value===wanted.event_value);
   }else{
    await act(path,{verb:'fill',text:wanted.event_value},f);await act(path,{verb:'press',key:'Tab'},f);
   }
   need(s.node_coarse_classes.settings.event_value===wanted.event_value,'event label readback differs');
  }
 }
 need(used('input').length===1&&used('target').length===1,'one predictor and one target required');
 const input=used('input')[0],target=used('target')[0];
 resolveCoarseClassesFields({coarse_classes:{input_field:input.name,target_field:target.name,partition:wanted?.partition}},fields);
 s=await selectCoarseClassesField(channel,baseline,target.name);const event=s.node_coarse_classes.settings.event_value;
 need(typeof event==='string'&&event.length>0,'saved exact event label required');
 s=await selectCoarseClassesField(channel,baseline,input.name);
 // Rebind after the target's asynchronous event editor has settled. These
 // controls belong to the selected predictor, never the previous field.
 if(!applying&&!input.frozen&&!input.external)for(const [key,path] of [['min_class_percent','edtMinimalClassRate;ValueControl'],['max_classes','edtDesiredClassCount;ValueControl'],['uniformity_percent','edtUniformityCoefficient;ValueControl']]){
  if(s.node_coarse_classes.settings[key]===wanted[key])continue;
  await act(path,{verb:'fill',text:String(wanted[key])},input);await act(path,{verb:'press',key:'Tab'},input);
  need(s.node_coarse_classes.settings[key]===wanted[key],'final predictor setting differs: '+key);
 }
 if(wanted?.partition==='manual'&&s.node_coarse_classes.settings.prequanting!==false){
  await act('chkPreQuanting;ValueControl',{verb:'set_checked',checked:false},input);
  need(s.node_coarse_classes.settings.prequanting===false,'manual partition requires preliminary quantization off');
 }
 if(wanted?.partition==='manual'){
  // The input checkbox controls X<=cut. The separate port-1 field remains
  // native false in 7.4.2 and is not a readback of this setting.
  need(typeof s.node_coarse_classes.settings.include_upper_input==='boolean','selected input boundary checkbox required');
  if(!s.node_coarse_classes.settings.include_upper_input)await act('chkIncludeHighBounds;ValueControl',{verb:'set_checked',checked:true},input);
  need(s.node_coarse_classes.settings.include_upper_input===true,'manual partition requires an inclusive upper boundary');
 }
 const settings=s.node_coarse_classes.settings;
 // The fine-classes checkbox makes one class per category and ignores input 1.
 if(wanted?.partition==='external')need(s.node_coarse_classes.selected?.external===true,'external partition requires the native role input (external partition)');
 else need(input.frozen||settings.fine_classes===false,'initial-class bypass is outside this stage');
 const configuration={...s.node_coarse_classes,...(wanted?.partition==='external'?{external_partition:{links:external?.links,role:'external'}}:{}),mode:request.mode,input_field:input.name,target_field:target.name,event_value:event,partition:wanted?.partition??'automatic',frozen:wanted?.frozen===true,min_class_percent:settings.min_class_percent,max_classes:settings.max_classes,uniformity_percent:settings.uniformity_percent,fields:fields.map(({name,label,type,data_kind})=>({name,label,type,data_kind})),roles:s.node_coarse_classes.fields.map(({name,role})=>({name,role}))};
 const next=async(stage,destination)=>{
  await channel.perform({condition:'accept coarse classes '+stage,ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'coarse classes Next required').ref,expected_stage:destination})});
  return channel.observe({condition:'coarse classes '+destination+' ready',ready:s=>s.wizard?.stage===destination});
 };
 // The editor reconstructs bins from the current target, including on apply.
 // Inspect saved roles only; native Execute and its fresh report ports prove
 // the persisted model without retraining a holdout with NULL targets.
 if(applying)return {verified:true,cleanup_complete:true,effect_possible:false,settings_applied:false,configuration:{...configuration,state:'settings',classes:[],total_iv:null}};
 await next('coarse_classes','coarse_classes_model');
 if(wanted.frozen)configuration.frozen_partition=await configureFrozenCoarseClasses(channel,wanted);
 if(wanted.partition==='manual')configuration.manual_partition=await configureManualCoarseClasses(channel,wanted);
 if(wanted.partition==='external')configuration.external_partition.model=await observeExternalCoarseClasses(channel,wanted);
 await next('coarse_classes_model','output_mapping');await next('output_mapping','binning_ranges_mapping');await next('binning_ranges_mapping','coarse_classes_mapping_2');
 const done=await next('coarse_classes_mapping_2','done');
 return {verified:true,cleanup_complete:true,effect_possible:true,configuration:{...configuration,state:'settings',classes:[],total_iv:null},validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
