import {resolveSmoothingParameters,validateSmoothingParameters} from './smoothing-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error('Smoothing: '+m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ready=s=>s.wizard?.stage==='smoothing'&&s.node_smoothing?.verified===true&&s.node_smoothing.binding_ready===true;
const observe=(channel,condition)=>channel.observe({condition,readSmoothing:true,ready});
const one=(s,p,m)=>{const es=s.ui.elements.filter(p);need(es.length===1,m);return es[0];};
export async function selectSmoothingField(channel,baseline,name){
 let s=await observe(channel,'smoothing field before selection');
 const field=baseline.fields.find(f=>f.name===name);need(field,'field disappeared');
 for(let attempt=0;attempt<130;attempt++){
  need(same(s.node_smoothing.fields.map(({used,algorithm,...f})=>f),baseline.fields.map(({used,algorithm,...f})=>f)),'field inventory changed');
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
export async function configureSmoothing(channel,p,{inputMapping,mode='hodrick_prescott'}){
 const initial=await observe(channel,'complete smoothing field inventory'),baseline=initial.node_smoothing;
 if(mode==='hodrick_prescott')need(baseline.fields.every(f=>f.algorithm===0),'wavelet settings unsupported in hodrick_prescott');
 need(inputMapping?.verified&&inputMapping.inventory_complete,'verified input mapping required');
 const inputs=inputMapping.target_fields,schema=fs=>fs.map(({name,label,type,data_kind})=>({name,label,type,data_kind}));
 need(same(schema(inputs.filter(f=>['integer','real'].includes(f.type)&&f.data_kind==='Непрерывный')),schema(baseline.fields)),'smoothing input schema differs');
 resolveSmoothingParameters(p,inputs);
 const before=[];
 for(const field of baseline.fields){const s=await selectSmoothingField(channel,baseline,field.name);before.push({...field,...s.node_smoothing.settings});}
 const rules=p.smoothing??before.filter(f=>f.used).map(f=>f.algorithm===1?{field:f.name,family:f.family,...(f.family==='cdf_9_7'?{}:{order:f.order}),depth:f.depth,boundary:f.boundary}:{field:f.name,[f.strength]:f[f.strength]});
 validateSmoothingParameters({smoothing:rules},mode,{target:{kind:'existing'},mappings:[]});
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
   const algorithm=rule.family?1:0;
   if(s.node_smoothing.selected.algorithm!==algorithm){
    const cell=one(s,e=>e.smoothing_cell?.record_id===field.record_id&&e.smoothing_cell.part==='algorithm'&&e.allowed_actions.includes('double_click'),'exact algorithm cell unavailable');
    await channel.perform({condition:'open smoothing algorithm',initialObservation:s,ready,identity:()=>field,resolve:()=>({verb:'double_click',ref:cell.ref})});
    s=await observe(channel,'smoothing algorithm editor');
    const label='Вейвлет-сглаживание';
    const optionMatches=e=>e.tid===s.wizard.root_tid+';SmoothingWizard;grdColumnsSettings;tbl;celleditor;cbx;boundlist;'+label&&e.allowed_actions.includes('click');
    // Native double click can open the list directly and occlude its picker.
    if(!s.ui.elements.some(optionMatches)){await act(s,'grdColumnsSettings;tbl;celleditor;cbx;trg_picker',{verb:'click'});s=await observe(channel,'smoothing algorithm options');}
    const option=one(s,optionMatches,'algorithm option unavailable: '+label);
    await channel.perform({condition:'choose smoothing algorithm',initialObservation:s,ready,identity:()=>field,resolve:()=>({verb:'click',ref:option.ref})});
    s=await observe(channel,'smoothing algorithm committed');
    need(s.node_smoothing.selected.algorithm===algorithm,'algorithm differs');
   }
   if(algorithm===1){
    if(s.node_smoothing.settings.family!==rule.family){await act(s,'pedWaveletType;ValueControl;radiofield'+({'daubechies':'','coiflet':'-1','cdf_9_7':'-2'}[rule.family])+';DisplayEl',{verb:'click'});s=await observe(channel,'wavelet family readback');}
    for(const [key,value] of [...(rule.family==='cdf_9_7'?[]:[['edtWaveletOrder',rule.order]]),['edtDecompositionLevel',rule.depth]])if(s.node_smoothing.settings[key==='edtWaveletOrder'?'order':'depth']!==value){
     await act(s,key+';ValueControl',{verb:'fill',text:String(value)});s=await observe(channel,'wavelet value before blur');
     await act(s,key+';ValueControl',{verb:'press',key:'Tab'});s=await observe(channel,'wavelet value committed');
    }
    if(s.node_smoothing.settings.boundary!==rule.boundary){
     await act(s,'edtEdgeExtension;ValueControl;trg_picker',{verb:'click'});s=await observe(channel,'wavelet boundary options');
     const option=one(s,e=>e.tid?.startsWith(s.wizard.root_tid+';SmoothingWizard;edtEdgeExtension;ValueControl;boundlist;')&&({symmetric:/^симметричное$/i,zero:/^(продолжение )?нулями$/i,reflect:/^симметричное без крайней точки$/i}[rule.boundary]).test((e.label??'').trim())&&e.allowed_actions.includes('click'),'requested boundary option unavailable: '+rule.boundary);
     await channel.perform({condition:'choose requested wavelet boundary',initialObservation:s,ready,identity:()=>field,resolve:()=>({verb:'click',ref:option.ref})});s=await observe(channel,'wavelet boundary committed');
    }
    need(s.node_smoothing.settings.family===rule.family&&s.node_smoothing.settings.order===(rule.family==='cdf_9_7'?null:rule.order)&&s.node_smoothing.settings.depth===rule.depth&&s.node_smoothing.settings.boundary===rule.boundary,'wavelet settings differ');
   }else{
   const strength=rule.lambda===undefined?'period':'lambda',title=strength==='lambda'?'Lambda':'Period';
   if(s.node_smoothing.settings.strength!==strength){await act(s,'rb'+title+';ValueControl;DisplayEl',{verb:'click'});s=await observe(channel,'smoothing strength mode readback');}
   if(s.node_smoothing.settings[strength]!==rule[strength]){
    await act(s,'edt'+title+';ValueControl',{verb:'fill',text:String(rule[strength])});s=await observe(channel,'smoothing strength before blur');
    await act(s,'edt'+title+';ValueControl',{verb:'press',key:'Tab'});s=await observe(channel,'smoothing strength committed');
   }
   need(s.node_smoothing.settings.strength===strength&&s.node_smoothing.settings[strength]===rule[strength],'smoothing strength differs');
   }
  }
  after.push({...s.node_smoothing.selected,...(rule?s.node_smoothing.settings:{})});
 }
 const final=(await observe(channel,'complete final smoothing settings')).node_smoothing;
 need(final.fields.every(f=>f.used===rules.some(r=>r.field===f.name)),'processing set differs');
 return {verified:true,cleanup_complete:true,effect_possible:!same(before,after),configuration:{...final,mode,input_fields:structuredClone(inputs),fields:after},before};
}
