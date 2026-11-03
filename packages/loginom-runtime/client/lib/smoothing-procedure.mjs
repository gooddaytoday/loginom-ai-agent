import {resolveSmoothingParameters} from './smoothing-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error('Smoothing: '+m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ready=s=>s.wizard?.stage==='smoothing'&&s.node_smoothing?.verified===true&&s.node_smoothing.binding_ready===true;
const observe=(channel,condition)=>channel.observe({condition,readSmoothing:true,ready});
const one=(s,p,m)=>{const es=s.ui.elements.filter(p);need(es.length===1,m);return es[0];};
export async function selectSmoothingField(channel,baseline,name){
 let s=await observe(channel,'smoothing field before selection');
 const field=baseline.fields.find(f=>f.name===name);need(field,'field disappeared');
 for(let attempt=0;attempt<130;attempt++){
  need(same(s.node_smoothing.fields.map(({used,...f})=>f),baseline.fields.map(({used,...f})=>f)),'field inventory changed');
  if(s.node_smoothing.selected?.record_id===field.record_id)return s;
  const cells=s.ui.elements.filter(e=>e.smoothing_cell?.part==='field'),cell=cells.find(e=>e.smoothing_cell.record_id===field.record_id&&e.allowed_actions.includes('click'));
  if(cell){
   await channel.perform({condition:'select exact smoothing field',initialObservation:s,ready,identity:()=>field,resolve:()=>({verb:'click',ref:cell.ref})});
   return channel.observe({condition:'smoothing editors bound to selected field',readSmoothing:true,ready:s=>ready(s)&&s.node_smoothing.selected?.record_id===field.record_id});
  }
  const visible=cells.filter(e=>e.scroll&&e.allowed_actions.includes('scroll'));need(visible.length&&attempt<129,'field cannot be revealed');
  const first=baseline.fields.findIndex(f=>f.record_id===visible[0].smoothing_cell.record_id),anchor=visible[Math.floor(visible.length/2)];
  await channel.perform({condition:'reveal smoothing field',initialObservation:s,ready,identity:()=>field,resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:field.index<first?-350:350})});s=await observe(channel,'smoothing fields scrolled');
 }
}
export async function configureSmoothing(channel,p,{inputMapping}){
 const initial=await observe(channel,'complete smoothing field inventory'),baseline=initial.node_smoothing;
 need(baseline.fields.every(f=>f.algorithm===0),'wavelet settings unsupported');
 need(inputMapping?.verified&&inputMapping.inventory_complete,'verified input mapping required');
 const inputs=inputMapping.target_fields,schema=fs=>fs.map(({name,label,type,data_kind})=>({name,label,type,data_kind}));
 need(same(schema(inputs.filter(f=>['integer','real'].includes(f.type)&&f.data_kind==='Непрерывный')),schema(baseline.fields)),'smoothing input schema differs');
 resolveSmoothingParameters(p,inputs);
 const before=[];
 for(const field of baseline.fields){const s=await selectSmoothingField(channel,baseline,field.name);before.push({...field,...s.node_smoothing.settings});}
 const rules=p.smoothing??before.filter(f=>f.used).map(f=>({field:f.name,[f.strength]:f[f.strength]}));
 resolveSmoothingParameters({smoothing:rules},inputs);
 const act=async(s,key,action)=>channel.perform({condition:'set smoothing '+key,initialObservation:s,ready,identity:s=>({node:s.prepared_node_context,field:s.node_smoothing.selected.record_id}),
  resolve:s=>({...action,ref:one(s,e=>(e.tid===s.wizard.root_tid+';SmoothingWizard;'+key||e.identity?.anchor_tid===s.wizard.root_tid+';SmoothingWizard;'+key)&&e.allowed_actions.includes(action.verb),'Smoothing control unavailable: '+key).ref})});
 const after=[];
 for(const field of baseline.fields){
  let s=await selectSmoothingField(channel,baseline,field.name);const rule=rules.find(r=>r.field===field.name);
  if(s.node_smoothing.selected.used!==!!rule){
   const cell=one(s,e=>e.smoothing_cell?.record_id===field.record_id&&e.smoothing_cell.part==='used'&&e.allowed_actions.includes('click'),'exact smoothing checkbox unavailable');
   await channel.perform({condition:'set smoothing field participation',initialObservation:s,ready,identity:()=>field,resolve:()=>({verb:'click',ref:cell.ref})});
   s=await channel.observe({condition:'smoothing participation readback',readSmoothing:true,ready:s=>ready(s)&&s.node_smoothing.selected?.record_id===field.record_id&&s.node_smoothing.selected.used===!!rule});
  }
  if(rule){
   const strength=rule.lambda===undefined?'period':'lambda',title=strength==='lambda'?'Lambda':'Period';
   if(s.node_smoothing.settings.strength!==strength){await act(s,'rb'+title+';ValueControl;DisplayEl',{verb:'click'});s=await observe(channel,'smoothing strength mode readback');}
   if(s.node_smoothing.settings[strength]!==rule[strength]){
    await act(s,'edt'+title+';ValueControl',{verb:'fill',text:String(rule[strength])});s=await observe(channel,'smoothing strength before blur');
    await act(s,'edt'+title+';ValueControl',{verb:'press',key:'Tab'});s=await observe(channel,'smoothing strength committed');
   }
   need(s.node_smoothing.settings.strength===strength&&s.node_smoothing.settings[strength]===rule[strength],'smoothing strength differs');
  }
  after.push({...s.node_smoothing.selected,...(rule?s.node_smoothing.settings:{})});
 }
 const final=(await observe(channel,'complete final smoothing settings')).node_smoothing;
 need(final.fields.every(f=>f.used===rules.some(r=>r.field===f.name)),'processing set differs');
 return {verified:true,cleanup_complete:true,effect_possible:!same(before,after),configuration:{...final,input_fields:structuredClone(inputs),fields:after},before};
}
