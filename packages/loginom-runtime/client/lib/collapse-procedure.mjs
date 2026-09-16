import {resolveCollapseParameters} from './collapse-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const control=(s,suffix,verb='click')=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+suffix&&e.allowed_actions.includes(verb));need(es.length===1,'Unique collapse control required: '+suffix);return es[0];};
export async function configureCollapse(channel,p){
 const ready=s=>s.wizard?.stage==='collapse'&&s.node_collapse?.verified===true;
 const observe=condition=>channel.observe({condition,readCollapse:true,ready});
 const before=await observe('complete collapse inventory'),baseline=before.node_collapse;
 need(!baseline.skip_null.switch_pressed,'Variable-controlled empty policy is unsupported');
 const plan=p.information===undefined?{information:baseline.information,transposed:baseline.transposed}:resolveCollapseParameters(p,baseline.input_fields);
 need(plan.transposed.length>0&&[...plan.information,...plan.transposed].every(f=>['integer','real','string','boolean','datetime'].includes(f.type)),'Existing collapse contains unsupported or incomplete roles');
 const wanted=new Map([...plan.information.map(f=>[f.name,6]),...plan.transposed.map(f=>[f.name,7])]);
 const select=async(name,role)=>{
  let s=await observe('collapse field ready for selection');
  for(let attempt=0;attempt<130;attempt++){
   const record=s.node_collapse.input_fields.find(f=>f.name===name);need(record,'Collapse field disappeared');
   const elements=s.ui.elements.filter(e=>e.collapse_field?.role===role&&e.allowed_actions.includes('click'));
   const e=elements.find(e=>e.collapse_field.field_key===name);
   if(e){if(s.node_collapse.selections.selected.length===1&&s.node_collapse.selections.selected[0]===record.record_id&&role!=='available')return s;
    await channel.perform({condition:'select exact collapse '+role+' field',initialObservation:s,ready,identity:()=>({name,record_id:record.record_id,role}),resolve:()=>({verb:'click',ref:e.ref})});
    return observe('collapse field selected');}
   const visible=elements.filter(e=>e.allowed_actions.includes('scroll')&&e.scroll);
   need(visible.length&&attempt<129,'Collapse field cannot be revealed');
   const order=f=>role==='available'?baseline.input_fields.findIndex(x=>x.name===f):s.node_collapse.input_fields.find(x=>x.name===f)?.order;
   visible.sort((a,b)=>order(a.collapse_field.field_key)-order(b.collapse_field.field_key));
   const target=order(name),direction=target<order(visible[0].collapse_field.field_key)?-1:target>order(visible.at(-1).collapse_field.field_key)?1:0;
   need(direction!==0,'Collapse field obscured inside visible rows');const anchor=visible[Math.floor(visible.length/2)],scroll=anchor.scroll;
   await channel.perform({condition:'reveal collapse field in its grid',initialObservation:s,ready,identity:()=>({name,role,scroll:scroll.ref}),resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:direction*400})});
   s=await observe('collapse grid scrolled');const next=s.ui.elements.find(e=>e.scroll?.ref===scroll.ref)?.scroll;need(next&&direction*(next.top-scroll.top)>0,'Collapse grid did not scroll');
  }
 };
 if(p.information!==undefined){
 for(const f of [...baseline.information,...baseline.transposed])if(wanted.get(f.name)!==f.disposition){
  const role=f.disposition===6?'information':'transposed',s=await select(f.name,role);
  await channel.perform({condition:'remove unrequested collapse field',initialObservation:s,ready,identity:()=>({name:f.name,record_id:f.record_id}),resolve:s=>{
   const e=s.ui.elements.find(e=>e.collapse_field?.field_key===f.name&&e.collapse_field.role===role&&e.allowed_actions.includes('press'));need(e,'Selected collapse field absent');return {verb:'press',ref:e.ref,key:'Delete'};}});
  const after=await observe('collapse field returned to available list');need(after.node_collapse.input_fields.find(x=>x.name===f.name)?.disposition===0,'Collapse removal not applied');
 }
 for(const [names,disposition,role] of [[plan.information.map(f=>f.name),6,'information'],[plan.transposed.map(f=>f.name),7,'transposed']])for(const [index,name] of names.entries()){
  let s=await observe('requested collapse membership');let f=s.node_collapse.input_fields.find(f=>f.name===name);
  if(f.disposition!==disposition){need(f.disposition===0,'Unexpected collapse role');s=await select(name,'available');
   await channel.perform({condition:'move field into collapse '+role,initialObservation:s,ready,identity:()=>({name,record_id:f.record_id,role}),resolve:s=>({verb:'click',ref:control(s,';ColumnFlippingWizard;frmMoveButtons;btnMove'+(disposition===6?'0':'1')).ref})});
   s=await observe('requested collapse membership applied');f=s.node_collapse.input_fields.find(f=>f.name===name);need(f.disposition===disposition,'Collapse role did not apply');
  }
  s=await select(name,role);f=s.node_collapse.input_fields.find(f=>f.name===name);
  while(f.order>index){const old=f.order;
   await channel.perform({condition:'order collapse '+role+' field',initialObservation:s,ready,identity:()=>({name,record_id:f.record_id,order:old}),resolve:s=>({verb:'click',ref:control(s,';ColumnFlippingWizard;btnUp').ref})});
   s=await observe('collapse order moved once');f=s.node_collapse.input_fields.find(f=>f.name===name);need(f.order===old-1,'Collapse order did not move by one');
  }
  need(f.order===index,'Collapse order mismatch');
 }
 }
 const desired=p.ignore_empty??baseline.skip_null.value;
 let s=await observe('collapse empty policy');
 if(s.node_collapse.skip_null.value!==desired){await channel.perform({condition:'set collapse empty policy',initialObservation:s,ready,identity:()=>({ignore_empty:desired}),resolve:s=>({verb:'set_checked',ref:control(s,';ColumnFlippingWizard;pedSkipNullCases;ValueControl;DisplayEl','set_checked').ref,checked:desired})});}
 const after=(await observe('complete final collapse configuration')).node_collapse;
 const shape=f=>({name:f.name,label:f.label,type:f.type});
 need(same(after.information.map(shape),plan.information.map(shape))&&same(after.transposed.map(shape),plan.transposed.map(shape)),'Final collapse roles differ');
 need(after.skip_null.value===desired&&!after.skip_null.switch_pressed,'Collapse empty policy differs');
 need(same(after.input_fields.map(shape),baseline.input_fields.map(shape)),'Collapse changed input identity');
 return {verified:true,cleanup_complete:true,effect_possible:p.information!==undefined||desired!==baseline.skip_null.value,configuration:after,preservation:{input_identity:true}};
}
