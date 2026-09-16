import {resolveGroupingParameters} from './grouping-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const control=(s,suffix,verb='click')=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+suffix&&e.allowed_actions.includes(verb));need(es.length===1,'Unique grouping control required: '+suffix);return es[0];};
export async function configureGrouping(channel,p){
 const ready=s=>s.wizard?.stage==='grouping'&&s.node_grouping?.verified===true;
 const observe=condition=>channel.observe({condition,readGrouping:true,ready});
 const before=await observe('complete grouping inventory'),baseline=before.node_grouping;
 if(p.group_by===undefined){
  need(baseline.keys.length&&baseline.measures.length&&baseline.measures.every(f=>f.functions>0&&(f.functions&~31)===0),'Existing grouping contains unsupported or incomplete aggregation');
  return {verified:true,cleanup_complete:true,effect_possible:false,configuration:baseline,preservation:{unchanged:true}};
 }
 const plan=resolveGroupingParameters(p,baseline.input_fields),wanted=new Map([...plan.keys.map(f=>[f.name,6]),...plan.functions.map(f=>[f.name,7])]);
 const select=async(name,role)=>{
  let s=await observe('grouping field ready for selection');
  for(let attempt=0;attempt<130;attempt++){
   const record=s.node_grouping.input_fields.find(f=>f.name===name);need(record,'Grouping field disappeared');
   const elements=s.ui.elements.filter(e=>e.grouping_field?.role===role&&e.allowed_actions.includes('click'));
   const e=elements.find(e=>e.grouping_field.field_key===name);
   if(e){if(s.node_grouping.selected_records.length===1&&s.node_grouping.selected_records[0]===record.record_id&&role!=='available')return s;
    await channel.perform({condition:'select exact grouping '+role+' field',initialObservation:s,ready,identity:()=>({name,record_id:record.record_id,role}),resolve:()=>({verb:'click',ref:e.ref})});
    return observe('grouping field selected');}
   const visible=elements.filter(e=>e.allowed_actions.includes('scroll')&&e.scroll);
   need(visible.length&&attempt<129,'Grouping field cannot be revealed');
   const order=f=>role==='available'?baseline.input_fields.findIndex(x=>x.name===f):s.node_grouping.input_fields.find(x=>x.name===f)?.order;
   visible.sort((a,b)=>order(a.grouping_field.field_key)-order(b.grouping_field.field_key));
   const target=order(name),direction=target<order(visible[0].grouping_field.field_key)?-1:target>order(visible.at(-1).grouping_field.field_key)?1:0;
   need(direction!==0,'Grouping field obscured inside visible rows');const anchor=visible[Math.floor(visible.length/2)],scroll=anchor.scroll;
   await channel.perform({condition:'reveal grouping field in its grid',initialObservation:s,ready,identity:()=>({name,role,scroll:scroll.ref}),resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:direction*400})});
   s=await observe('grouping grid scrolled');const next=s.ui.elements.find(e=>e.scroll?.ref===scroll.ref)?.scroll;need(next&&direction*(next.top-scroll.top)>0,'Grouping grid did not scroll');
  }
 };
 for(const f of [...baseline.keys,...baseline.measures])if(wanted.get(f.name)!==f.disposition){
  const role=f.disposition===6?'group':'measure',s=await select(f.name,role);
  await channel.perform({condition:'remove unrequested grouping field',initialObservation:s,ready,identity:()=>({name:f.name,record_id:f.record_id}),resolve:s=>{
   const e=s.ui.elements.find(e=>e.grouping_field?.field_key===f.name&&e.grouping_field.role===role&&e.allowed_actions.includes('press'));need(e,'Selected grouping field absent');return {verb:'press',ref:e.ref,key:'Delete'};}});
  const after=await observe('grouping field returned to available list');need(after.node_grouping.input_fields.find(x=>x.name===f.name)?.disposition===0,'Grouping removal not applied');
 }
 for(const [names,disposition,role] of [[plan.keys.map(f=>f.name),6,'group'],[plan.field_order,7,'measure']])for(const [index,name] of names.entries()){
  let s=await observe('requested grouping membership');let f=s.node_grouping.input_fields.find(f=>f.name===name);
  if(f.disposition!==disposition){need(f.disposition===0,'Unexpected grouping role');s=await select(name,'available');
   await channel.perform({condition:'move field into grouping '+role,initialObservation:s,ready,identity:()=>({name,record_id:f.record_id,role}),resolve:s=>({verb:'click',ref:control(s,';GroupDataWizard;frmMoveButtons;btnMove'+(disposition===6?'0':'1')).ref})});
   s=await observe('requested grouping membership applied');f=s.node_grouping.input_fields.find(f=>f.name===name);need(f.disposition===disposition,'Grouping role did not apply');
  }
  s=await select(name,role);f=s.node_grouping.input_fields.find(f=>f.name===name);
  while(f.order>index){const old=f.order;
   await channel.perform({condition:'order grouping '+role+' field',initialObservation:s,ready,identity:()=>({name,record_id:f.record_id,order:old}),resolve:s=>({verb:'click',ref:control(s,';GroupDataWizard;btnUp').ref})});
   s=await observe('grouping order moved once');f=s.node_grouping.input_fields.find(f=>f.name===name);need(f.order===old-1,'Grouping order did not move by one');
  }
  need(f.order===index,'Grouping order mismatch');
 }
 for(const desired of plan.functions){
  let s=await select(desired.name,'measure'),field=s.node_grouping.input_fields.find(f=>f.name===desired.name);
  if(field.functions===desired.mask)continue;
  await channel.perform({condition:'open exact grouping factor editor',initialObservation:s,ready,identity:()=>({name:field.name,record_id:field.record_id}),resolve:s=>{
   const e=s.ui.elements.find(e=>e.grouping_field?.role==='measure'&&e.grouping_field.field_key===field.name&&e.allowed_actions.includes('double_click'));need(e,'Measure editor unavailable');return {verb:'double_click',ref:e.ref};}});
  const editorReady=s=>ready(s)&&s.wizard.factor_editor?.status==='rendered_factor_options'&&s.wizard.factor_editor.selected_field?.field_key===field.name
   &&same(s.node_grouping.selected_records,[field.record_id]);
  const options=['sum','count','min','max','average','median','mode','standard_deviation','unique_count','null_count','first','last','only','concat'];
  for(const enabled of [true,false])for(const [i,aggregation] of options.entries()){
   const wanted=(desired.mask&(1<<i))!==0;if(wanted!==enabled)continue;
   s=await channel.observe({condition:'factor options bound to requested input',readGrouping:true,ready:editorReady});
   const option=s.wizard.factor_editor.options.find(o=>o.aggregation===aggregation);need(option,'Aggregation option missing');
   if(option.checked===wanted)continue;need(option.enabled,'Requested aggregation is disabled');
   await channel.perform({condition:'set exact aggregation '+aggregation,initialObservation:s,ready:editorReady,identity:()=>({record_id:field.record_id,aggregation,value:wanted}),resolve:()=>({verb:'set_checked',ref:option.display_ref,checked:wanted})});
  }
  s=await channel.observe({condition:'complete requested factor set',readGrouping:true,ready:editorReady});
  need(s.wizard.factor_editor.options.every((o,i)=>o.checked===((desired.mask&(1<<i))!==0)),'Factor set differs before Apply');
  await channel.perform({condition:'apply grouping factor to bound measure',initialObservation:s,ready:editorReady,identity:()=>({record_id:field.record_id,mask:desired.mask}),resolve:s=>({verb:'click',ref:control(s,';FactorEditDialog;btnApply').ref})});
  s=await observe('grouping factor applied');need(s.node_grouping.measures.find(f=>f.name===field.name)?.functions===desired.mask,'Applied aggregation bitset differs');
 }
 const after=(await observe('complete final grouping configuration')).node_grouping;
 need(same(after.keys.map(f=>f.name),plan.keys.map(f=>f.name))&&same(after.measures.map(f=>({name:f.name,mask:f.functions})),plan.functions),'Final grouping lists differ');
 need(same(after.options,baseline.options),'Unrequested grouping options changed');
 const untouched=f=>({record_id:f.record_id,name:f.name,label:f.label,type:f.type,concat:f.concat});
 need(same(after.input_fields.map(untouched),baseline.input_fields.map(untouched)),'Grouping changed input identity or unrelated options');
 return {verified:true,cleanup_complete:true,effect_possible:true,configuration:after,preservation:{input_identity:true,concat_options:true,node_options:true},requested_output:plan.measures.map(m=>({field:m.input.name,function:m.function,name:m.name,label:m.label}))};
}
