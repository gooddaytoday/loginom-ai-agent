import {resolveElimOutlierParameters} from './elim-outlier-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error('Outlier detect: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ready=s=>s.wizard?.stage==='elim_outlier'&&s.node_elim_outlier?.verified===true;
const observe=(channel,condition)=>channel.observe({condition,readElimOutlier:true,ready});
const one=(s,p,m)=>{const es=s.ui.elements.filter(p);need(es.length===1,m);return es[0];};
export async function selectElimOutlierField(channel,baseline,name){
 let s=await observe(channel,'outlier field before selection');
 const f=baseline.fields.find(f=>f.name===name);need(f,'field disappeared');
 for(let attempt=0;attempt<130;attempt++){
  need(same(s.node_elim_outlier.fields.map(({used,...f})=>f),baseline.fields.map(({used,...f})=>f)),'field inventory changed');
  if(s.node_elim_outlier.selected.record_id===f.record_id)return s;
  const cells=s.ui.elements.filter(e=>e.elim_outlier_cell?.part==='field'),cell=cells.find(e=>e.elim_outlier_cell.record_id===f.record_id&&e.allowed_actions.includes('click'));
  if(cell){
   await channel.perform({condition:'select exact outlier field',initialObservation:s,ready,identity:()=>f,resolve:()=>({verb:'click',ref:cell.ref})});
   return channel.observe({condition:'selected outlier controls belong to field',readElimOutlier:true,ready:s=>ready(s)&&s.node_elim_outlier.selected.record_id===f.record_id});
  }
  const visible=cells.filter(e=>e.scroll&&e.allowed_actions.includes('scroll'));need(visible.length&&attempt<129,'field cannot be revealed');
  const first=baseline.fields.findIndex(f=>f.record_id===visible[0].elim_outlier_cell.record_id),anchor=visible[Math.floor(visible.length/2)];
  await channel.perform({condition:'reveal outlier field',initialObservation:s,ready,identity:()=>f,resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:f.index<first?-350:350})});
  s=await observe(channel,'outlier field list scrolled');
 }
}
export async function configureElimOutlier(channel,p,{inputMapping}){
 const initial=await observe(channel,'complete outlier field inventory'),baseline=initial.node_elim_outlier;
 need(inputMapping?.verified&&inputMapping.inventory_complete,'verified input mapping required');
 const schema=fs=>fs.map(({name,label,type,data_kind})=>({name,label,type,data_kind}));
 need(same(schema(inputMapping.target_fields),schema(baseline.fields)),'input mapping differs from outlier fields');
 need(!baseline.quality&&!Object.values(baseline.switches).some(Boolean),'quality and variable-driven parameters are unsupported');
 const selected=p.outlier?.fields??baseline.fields.filter(f=>f.used).map(f=>f.name);
 resolveElimOutlierParameters({outlier:{fields:selected}},baseline.fields);
 // Capture every used field through ordinary UI selection before any edit.
 // Existing heterogeneous settings remain per-field when omitted in a patch.
 const before=[];
 for(const f of baseline.fields){const s=await selectElimOutlierField(channel,baseline,f.name);need(!Object.values(s.node_elim_outlier.switches).some(Boolean),'variable-driven field parameters are unsupported');before.push({name:f.name,used:f.used,values:s.node_elim_outlier.values,settings:s.node_elim_outlier.settings});}
 const planned=selected.map(name=>{
  const old=before.find(f=>f.name===name).settings;
  const wanted=resolveElimOutlierParameters(p,baseline.fields,{...old,fields:selected,ordered:baseline.ordered});
  need(['sd','iqr'].includes(wanted.method)&&Number.isFinite(wanted.outlier_factor)&&Number.isFinite(wanted.extreme_factor),'newly enabled fields need explicit method and both factors');
  return {name,method:wanted.method,outlier_factor:wanted.outlier_factor,extreme_factor:wanted.extreme_factor,outlier_policy:'keep',extreme_policy:'keep'};
 });
 const act=async(s,key,action)=>channel.perform({condition:'set outlier '+key,initialObservation:s,ready,identity:s=>({node:s.prepared_node_context,field:s.node_elim_outlier.selected.record_id}),
  resolve:s=>({...action,ref:one(s,e=>(e.tid===s.wizard.root_tid+';ElimOutlierWizard;'+key||e.identity?.anchor_tid===s.wizard.root_tid+';ElimOutlierWizard;'+key)&&e.allowed_actions.includes(action.verb),'Outlier control unavailable: '+key).ref})});
 const after=[];
 for(const f of baseline.fields){
  let s=await selectElimOutlierField(channel,baseline,f.name);const used=selected.includes(f.name);
  if(s.node_elim_outlier.selected.used!==used){
   const cell=one(s,e=>e.elim_outlier_cell?.record_id===f.record_id&&e.elim_outlier_cell.part==='used'&&e.allowed_actions.includes('click'),'Exact outlier checkbox unavailable');
   await channel.perform({condition:'set outlier field participation',initialObservation:s,ready,identity:()=>f,resolve:()=>({verb:'click',ref:cell.ref})});
   s=await channel.observe({condition:'outlier participation readback',readElimOutlier:true,ready:s=>ready(s)&&s.node_elim_outlier.selected.record_id===f.record_id&&s.node_elim_outlier.selected.used===used});
  }
  if(used){
   const wanted=planned.find(w=>w.name===f.name);
   if(s.node_elim_outlier.settings.method!==wanted.method){
    await act(s,'pedModeOE;ValueControl;'+(wanted.method==='sd'?'radiofield':'radiofield-1'),{verb:'click'});
    s=await observe(channel,'outlier method readback');need(s.node_elim_outlier.settings.method===wanted.method,'method differs');
   }
   for(const [key,name] of [[wanted.method==='sd'?'pedDetectOSko':'pedDetectOKvartil','outlier_factor'],[wanted.method==='sd'?'pedDetectESko':'pedDetectEKvartil','extreme_factor']]){
    if(s.node_elim_outlier.settings[name]===wanted[name])continue;
    await act(s,key+';ValueControl',{verb:'fill',text:String(wanted[name])});s=await observe(channel,'outlier factor before commit');
    await act(s,key+';ValueControl',{verb:'press',key:'Tab'});s=await observe(channel,'outlier factor readback');need(s.node_elim_outlier.settings[name]===wanted[name],'factor differs');
   }
   for(const key of ['pedActionOut','pedActionExtr']){
    if(s.node_elim_outlier.values[key]===1)continue;
    const owner=s.wizard.root_tid+';ElimOutlierWizard;'+key+';ValueControl';
    await act(s,key+';ValueControl;trg_picker',{verb:'click'});
    s=await channel.observe({condition:'native keep policy option',readElimOutlier:true,ready:s=>ready(s)&&s.ui.elements.some(e=>e.tid?.startsWith(owner+';boundlist;')&&e.label==='Оставить без изменения'&&e.allowed_actions.includes('click'))});
    const option=one(s,e=>e.tid?.startsWith(owner+';boundlist;')&&e.label==='Оставить без изменения'&&e.allowed_actions.includes('click'),'Unique keep option required');
    await channel.perform({condition:'select native keep policy',initialObservation:s,ready,identity:()=>f,resolve:()=>({verb:'click',ref:option.ref})});
    s=await observe(channel,'keep policy readback');need(s.node_elim_outlier.values[key]===1,'keep policy differs');
   }
   need(same(s.node_elim_outlier.settings,Object.fromEntries(Object.entries(wanted).filter(([k])=>k!=='name'))),'final outlier field settings differ');
  }
  const original=before.find(b=>b.name===f.name);
  if(!used&&!original.used)need(same(s.node_elim_outlier.values,original.values),'ignored field settings changed');
  after.push({name:f.name,used,settings:s.node_elim_outlier.settings});
 }
 let s=await observe(channel,'outlier ordered flag before edit');
 const ordered=p.outlier?.ordered??baseline.ordered;
 if(s.node_elim_outlier.ordered!==ordered){await act(s,'pedOrderedSample;ValueControl;DisplayEl',{verb:'set_checked',checked:ordered});s=await observe(channel,'outlier ordered flag readback');}
 need(s.node_elim_outlier.ordered===ordered&&!s.node_elim_outlier.quality&&!Object.values(s.node_elim_outlier.switches).some(Boolean),'global outlier settings differ');
 need(same(s.node_elim_outlier.fields.filter(f=>f.used).map(f=>f.name),baseline.fields.filter(f=>selected.includes(f.name)).map(f=>f.name)),'selected field set differs');
 const configuration={...s.node_elim_outlier,field_settings:after};
 await channel.perform({condition:'validate outlier detect settings',initialObservation:s,ready,identity:s=>s.prepared_node_context,
  resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'Outlier Next unavailable').ref,expected_stage:'done'})});
 const done=await channel.observe({condition:'outlier detect accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
 return {verified:true,cleanup_complete:true,effect_possible:true,configuration,validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
