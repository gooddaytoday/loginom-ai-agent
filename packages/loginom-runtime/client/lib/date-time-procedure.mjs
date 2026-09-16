import {DATE_TIME_OPERATIONS,resolveDateTimeParameters} from './date-time-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error('Date/time: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const flagKey={DoDateTimeFirst:'first',DoDateTimeLast:'last',DoNumber:'number',DoString:'string'};
export async function configureDateTime(channel,p,{inputMapping,beforeChanges,progress}){
 const ready=s=>s.wizard?.stage==='date_time'&&s.node_date_time?.verified===true;
 const observe=condition=>channel.observe({condition,readDateTime:true,ready});
 const start=await observe('complete date/time fields'),baseline=start.node_date_time;
 need(inputMapping?.verified&&inputMapping.inventory_complete,'verified input mapping required');
 const inputs=inputMapping.target_fields.map(f=>({name:f.name,label:f.label,type:f.type}));
 need(same(inputs.filter(f=>f.type==='datetime'),baseline.fields.map(({name,label,type})=>({name,label,type}))),'date input mapping differs');
 const plan=resolveDateTimeParameters(p,inputs),wanted=new Map(plan.map(f=>[f.input.name,f.transformations]));
 const select=name=>selectDateTimeField(channel,baseline,name);
 const before=progress?.before??[],after=[];
 if(progress?.baseline)need(same(baseline.fields.map(({count,...f})=>f),progress.baseline.fields.map(({count,...f})=>f)),'continuation input identity changed');
 if(!progress?.baseline&&(beforeChanges||progress)){
  for(const field of baseline.fields){const s=await select(field.name);before.push({name:field.name,matrix:structuredClone(s.node_date_time.matrix)});}
  if(beforeChanges)await beforeChanges({...baseline,input_fields:inputs,field_matrices:before});
  if(progress){progress.baseline=structuredClone(baseline);progress.before=structuredClone(before);progress.expected=structuredClone(before);}
 }
 for(const field of baseline.fields){
  let s=await select(field.name);const original=structuredClone(s.node_date_time.matrix);
  if(!progress&&!beforeChanges)before.push({name:field.name,matrix:original});
  need(same(original,(progress?.expected??before).find(f=>f.name===field.name).matrix),'matrix changed outside verified configuration');
  if(wanted.has(field.name)){
   const desired=wanted.get(field.name).map(t=>DATE_TIME_OPERATIONS[t.operation]);
   for(const row of original)for(const [flag,key] of Object.entries(flagKey)){
    const checked=!row.iso&&desired.some(d=>d.func===row.func&&d.flag===flag);
    const native=s.node_date_time.matrix.find(r=>r.func===row.func&&r.iso===row.iso);need(native,'matrix row disappeared');
    if(native[key]===checked)continue;
    for(let attempt=0;attempt<12;attempt++){
     const cell=s.ui.elements.find(e=>e.date_time_cell?.role==='flag'&&e.date_time_cell.record_id===native.record_id&&e.date_time_cell.flag===flag&&e.allowed_actions.includes('click'));
     if(cell){need(cell.date_time_cell.checked===native[key],'native flag differs from rendered checkbox');
      // Loginom can leave Count unchanged for an applied numeric flag. Verify
      // the complete cached matrix instead, including absence of side effects.
      const nextMatrix=structuredClone(s.node_date_time.matrix);
      nextMatrix.find(r=>r.record_id===native.record_id)[key]=checked;
      if(progress){progress.receipt_recorded=false;progress.pending={field:field.name,field_record_id:field.record_id,ref:cell.ref,
       cell:{record_id:native.record_id,func:row.func,iso:row.iso,key,checked},expected:structuredClone(nextMatrix),before:structuredClone(s.node_date_time.matrix)};}
      await channel.perform({condition:'set date/time '+field.name+' '+row.func+' '+flag,initialObservation:s,ready:s=>ready(s)&&s.node_date_time.selected.name===field.name,
       identity:()=>({field:field.name,record_id:field.record_id,func:row.func,iso:row.iso,flag,checked}),resolve:()=>({verb:'click',ref:cell.ref})});
      s=await channel.observe({condition:'date/time exact matrix change settled',readDateTime:true,ready:s=>ready(s)&&s.node_date_time.selected.name===field.name&&s.node_date_time.selected.record_id===field.record_id&&same(s.node_date_time.matrix,nextMatrix)});
      if(progress){progress.expected.find(f=>f.name===field.name).matrix=structuredClone(nextMatrix);delete progress.pending;}
      break;
     }
     const es=s.ui.elements.filter(e=>e.date_time_cell?.role==='flag'&&e.scroll&&e.allowed_actions.includes('scroll'));need(es.length&&attempt<11,'date matrix checkbox cannot be revealed');
     const anchor=es[Math.floor(es.length/2)],first=s.node_date_time.matrix.find(r=>r.record_id===es[0].date_time_cell.record_id)?.index,direction=native.index<first?-1:1;
     await channel.perform({condition:'reveal exact date/time matrix row',initialObservation:s,ready,identity:()=>({field:field.name,func:row.func,iso:row.iso}),resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:direction*350})});s=await observe('date matrix scrolled');
    }
   }
  }
  s=await select(field.name);after.push({name:field.name,matrix:structuredClone(s.node_date_time.matrix)});
  need(same(before.find(f=>f.name===field.name).matrix.map(r=>[r.func,r.iso,r.string_format]),s.node_date_time.matrix.map(r=>[r.func,r.iso,r.string_format])),'unrequested string formats changed');
  if(!wanted.has(field.name))need(same(original,s.node_date_time.matrix),'untouched field changed');
 }
 const final=await observe('date/time full configuration collected');
 return {verified:true,cleanup_complete:true,effect_possible:p.fields!==undefined,configuration:{...final.node_date_time,input_fields:inputs,field_matrices:after},
  preservation:{unrequested_fields:true,string_formats:true},before};
}

export async function selectDateTimeField(channel,baseline,name){
 const ready=s=>s.wizard?.stage==='date_time'&&s.node_date_time?.verified===true;
 const observe=condition=>channel.observe({condition,readDateTime:true,ready});
  let s=await observe('date/time field selection');
  for(let i=0;i<130;i++){
   if(s.node_date_time.selected.name===name)return s;
   const f=s.node_date_time.fields.find(f=>f.name===name);need(f,'field disappeared');
   const es=s.ui.elements.filter(e=>e.date_time_cell?.role==='field'),e=es.find(e=>e.date_time_cell.field_key===name&&e.date_time_cell.record_id===f.record_id&&e.allowed_actions.includes('click'));
   if(e){await channel.perform({condition:'select exact date/time input field',initialObservation:s,ready,identity:()=>({name,record_id:f.record_id}),resolve:()=>({verb:'click',ref:e.ref})});
    return channel.observe({condition:'matrix belongs to selected date/time field',readDateTime:true,ready:s=>ready(s)&&s.node_date_time.selected.name===name&&s.node_date_time.selected.record_id===f.record_id});}
   const visible=es.filter(e=>e.scroll&&e.allowed_actions.includes('scroll'));need(visible.length&&i<129,'date field cannot be revealed');
   const index=s.node_date_time.fields.findIndex(f=>f.name===name),first=s.node_date_time.fields.findIndex(f=>f.name===visible[0].date_time_cell.field_key),anchor=visible[Math.floor(visible.length/2)],direction=index<first?-1:1;
   await channel.perform({condition:'reveal date/time input field',initialObservation:s,ready,identity:()=>({name,grid:anchor.date_time_cell.grid_ref}),resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:direction*350})});s=await observe('date/time field list scrolled');
  }
}
