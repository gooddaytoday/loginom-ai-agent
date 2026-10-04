import {resolveCrossTableParameters,CROSSTABLE_FUNCTIONS} from './crosstable-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error('CrossTable: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const owner=(a,b)=>['document_id','workflow_id','node_id'].every(k=>a?.[k]===b?.[k]);
export const crossTableRoleRemovalOrder=fields=>fields.filter(f=>f.disposition>0)
 .sort((a,b)=>b.disposition-a.disposition||b.order-a.order);
export function bindCrossTableInput(native,mapping){
 need(native?.verified===true&&native.inventory_complete===true&&mapping?.verified===true&&mapping.inventory_complete===true
  &&mapping.node_context?.input_port?.port===0&&owner(native.node_context,mapping.node_context),'verified input mapping owner required');
 const columns=mapping.target_fields;
 need(columns.length===native.input_fields.length&&columns.every(f=>!f.excluded)
  &&new Set(columns.map(f=>f.name)).size===columns.length,'complete active input schema required');
 return native.input_fields.map(f=>{const c=columns[f.index];
  need(c&&c.index===f.index&&['label','type','data_kind'].every(k=>c[k]===f[k]),'input ordinal/label/type changed');
  return {...f,name:c.name};
 });
}
export function crossTableConfiguration(native,mapping){
 const fields=bindCrossTableInput(native,mapping),ordered=role=>fields.filter(f=>f.disposition===role).sort((a,b)=>a.order-b.order);
 const columns=ordered(1),keys=ordered(2),facts=ordered(3),o=native.options;
 need(columns.length<=128&&facts.length>0&&!native.service_fields.some(f=>f.disposition>0),'supported dimensions and typed facts required');
 need(columns.every(f=>f.include_null===columns[0].include_null&&f.include_other===columns[0].include_other),'mixed per-dimension special-group policy is unsupported');
 const column=columns[0]??null,mode=o.pedSlidingUniqueValues.value?'sliding':'fixed';
 need(o.pedDisplayNameSeparator.value==='|'&&o.pedUniqueValueNames.value===false&&o.pedSlidingUniqueValuesLimit.value===0&&columns.every(f=>f.min_values===0),'unsupported names, separator or limits');
 need(mode!=='sliding'||columns.every(f=>!f.include_null&&!f.include_other),'sliding retains unsupported fixed flags; request complete replacement');
 const result={verified:true,inventory_complete:true,kind:'crosstable',node_context:native.node_context,input_fields:fields,
  category_mode:mode,column:column?{...column}:null,columns:columns.map(f=>({...f})),row_keys:keys,facts:facts.map(f=>{
   need(f.functions>0&&(f.functions&~2047)===0&&(f.functions&~f.available_functions)===0,'unsupported fact/function mask');
   return {...f,functions:Object.entries(CROSSTABLE_FUNCTIONS).filter(([,v])=>(f.functions&v.bit)!==0).map(([fn])=>fn)};
  }),options:{separator:'|',unique_names:false,limit:0,min_values:0,include_null:columns.length>0&&columns.every(f=>f.include_null),include_other:columns.length>0&&columns.every(f=>f.include_other)}};
 resolveCrossTableParameters({row_keys:keys.map(f=>({kind:'input_field',name:f.name})),columns:columns.map(f=>({kind:'input_field',name:f.name})),
  facts:result.facts.map(f=>({field:{kind:'input_field',name:f.name},functions:f.functions}))},fields);
 return result;
}
export async function configureCrossTable(channel,p,{inputMapping}){
 const ready=s=>s.wizard?.stage==='crosstable'&&s.node_crosstable?.verified===true;
 const observe=condition=>channel.observe({condition,readCrossTable:true,ready});
 const initial=await observe('complete owned CrossTable inventory'),baseline=initial.node_crosstable;
 need(baseline.dialogs.length===0,'unexpected nested editor');
 need(!baseline.service_fields.some(f=>f.disposition>0),'native Count service fact is outside the supported fact contract');
 const fields=bindCrossTableInput(baseline,inputMapping);
 if(Object.keys(p).length===0)return {verified:true,cleanup_complete:true,effect_possible:false,
  configuration:crossTableConfiguration(baseline,inputMapping),preservation:{unchanged:true}};
 const plan=resolveCrossTableParameters(p,fields),base=initial.wizard.root_tid;
 const oneControl=(s,tid,verb='click',input=false)=>{const xs=s.ui.elements.filter(e=>e.allowed_actions.includes(verb)
  &&(input?e.kind==='field'&&e.identity?.anchor_tid===tid:e.tid===tid));need(xs.length===1,'unique interactable control required: '+tid);return xs[0];};
 const gesture=async(s,condition,tid,verb='click',extra={},input=false)=>channel.perform({condition,initialObservation:s,ready,
  identity:()=>({node:baseline.node_context,tid,...extra}),resolve:s=>({verb,ref:oneControl(s,tid,verb,input).ref,...extra})});
 const current=(s,index)=>s.node_crosstable.input_fields.find(f=>f.index===index);
 const select=async(index,role)=>{
  let s=await observe('CrossTable record selection');
  for(let attempt=0;attempt<130;attempt++){
   const f=current(s,index);need(f,'input record disappeared');
   const candidates=s.ui.elements.filter(e=>e.crosstable_field?.role===role&&e.allowed_actions.includes('click'));
   const cell=candidates.find(e=>e.crosstable_field.input_index===index&&e.crosstable_field.record_id===f.record_id);
   if(cell){
    const selected=s.node_crosstable[role==='used'?'selected_used':'selected_available'];
    if(same(selected,[f.record_id]))return s;
    await channel.perform({condition:'select exact CrossTable record',initialObservation:s,ready,
     identity:()=>({index,record_id:f.record_id,role}),resolve:()=>({verb:'click',ref:cell.ref})});
    s=await observe('CrossTable record selected');need(same(s.node_crosstable[role==='used'?'selected_used':'selected_available'],[f.record_id]),'selection differs');return s;
   }
   const visible=candidates.filter(e=>e.scroll&&e.allowed_actions.includes('scroll'));
   need(visible.length&&attempt<129,'field cannot be revealed in its owned grid');
   const ordered=s.node_crosstable.input_fields.filter(f=>role==='available'?f.disposition===0:f.disposition>0)
    .sort((a,b)=>role==='available'?a.index-b.index:a.disposition-b.disposition||a.order-b.order);
   const position=i=>ordered.findIndex(f=>f.index===i);visible.sort((a,b)=>position(a.crosstable_field.input_index)-position(b.crosstable_field.input_index));
   const target=position(index),direction=target<position(visible[0].crosstable_field.input_index)?-1:target>position(visible.at(-1).crosstable_field.input_index)?1:0;
   need(direction!==0,'field obscured inside rendered grid');const anchor=visible[Math.floor(visible.length/2)],scroll=anchor.scroll;
   await channel.perform({condition:'reveal exact CrossTable record',initialObservation:s,ready,
    identity:()=>({index,role,scroll:scroll.ref}),resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:direction*400})});
   s=await observe('CrossTable grid scrolled');const next=s.ui.elements.find(e=>e.scroll?.ref===scroll.ref)?.scroll;
   need(next&&direction*(next.top-scroll.top)>0,'owned grid did not scroll');
  }
 };
 const setBoolean=async(key,wanted)=>{
  let s=await observe('CrossTable static boolean');if(s.node_crosstable.options[key].value===wanted)return;
  await gesture(s,'set CrossTable '+key,base+';CrossTabWizard;'+key+';ValueControl;DisplayEl');
  s=await observe('CrossTable boolean applied');need(s.node_crosstable.options[key].value===wanted,'boolean change unconfirmed');
 };
 await setBoolean('pedSlidingUniqueValues',true);await setBoolean('pedUniqueValueNames',false);
 let s=await observe('CrossTable limits and separator');
 if(s.node_crosstable.options.pedSlidingUniqueValuesLimit.value!==0){
  const tid=base+';CrossTabWizard;pedSlidingUniqueValuesLimit;ValueControl';
  await gesture(s,'reset global category limit',tid,'fill',{value:'0'},true);s=await observe('limit input entered');
  await gesture(s,'commit global category limit',tid,'press',{key:'Tab'},true);
 }
 s=await observe('CrossTable separator');
 if(s.node_crosstable.options.pedDisplayNameSeparator.value!=='|'){
  await gesture(s,'open separator choices',base+';CrossTabWizard;pedDisplayNameSeparator;ValueControl;trg_picker');s=await observe('separator choices shown');
  await gesture(s,'select supported separator',base+';CrossTabWizard;pedDisplayNameSeparator;ValueControl;boundlist;|');
 }
 // Replace roles completely, then order them after native auto-insertion.
 // Native deletion retains the other records' Order. Remove each role from
 // its tail so the complete inventory remains dense after every gesture.
 for(const old of crossTableRoleRemovalOrder(baseline.input_fields)){
  s=await select(old.index,'used');const cell=s.ui.elements.find(e=>e.crosstable_field?.record_id===old.record_id&&e.allowed_actions.includes('press'));
  need(cell,'selected used record absent');await channel.perform({condition:'clear prior CrossTable role',initialObservation:s,ready,
   identity:()=>({record_id:old.record_id,index:old.index}),resolve:()=>({verb:'press',ref:cell.ref,key:'Delete'})});
  s=await observe('prior role cleared');need(current(s,old.index).disposition===0,'role removal unconfirmed');
 }
 need(!baseline.service_fields.some(f=>f.disposition>0),'native Count service fact is outside the supported fact contract');
 const roles=[[1,plan.columns],[2,plan.keys],[3,plan.facts]];
 for(const [role,list] of roles)for(const f of list){
  s=await select(f.index,'available');await gesture(s,'assign CrossTable role',base+';CrossTabWizard;frmMoveButtons;btnMove'+(role-1));
  s=await observe('CrossTable role assigned');need(current(s,f.index).disposition===role,'role assignment unconfirmed');
 }
 for(const [role,list] of roles)for(const [order,f] of list.entries()){
  s=await select(f.index,'used');let actual=current(s,f.index);
  for(let steps=0;actual.order>order&&steps<1000;steps++){
   const prior=actual.order;await gesture(s,'order CrossTable role',base+';CrossTabWizard;btnUp');
   s=await observe('CrossTable role reordered');actual=current(s,f.index);need(actual.order===prior-1,'role order did not advance');
  }
  need(actual.disposition===role&&actual.order===order,'role order differs');
 }
 const openEditor=async(f,name)=>{
  s=await select(f.index,'used');const e=s.ui.elements.find(e=>e.crosstable_field?.record_id===f.record_id&&e.allowed_actions.includes('double_click'));
  need(e,'exact role editor unavailable');await channel.perform({condition:'open exact CrossTable '+name,initialObservation:s,ready,
   identity:()=>({record_id:f.record_id,index:f.index,name}),resolve:()=>({verb:'double_click',ref:e.ref})});
  s=await observe('CrossTable nested editor bound');need(s.node_crosstable.dialogs.length===1&&s.node_crosstable.dialogs[0].name===name
   &&same(s.node_crosstable.selected_used,[f.record_id]),'nested editor owner differs');
 };
 const dialogValue=(state,tid)=>{const xs=state.node_crosstable.dialogs.flatMap(d=>d.controls).filter(c=>c.tid===tid);need(xs.length===1,'nested value missing: '+tid);return xs[0];};
 const ct=base+';ColumnEditDialog;';
 for(const column of plan.columns){
 await openEditor(column,'ColumnEditDialog');
 if(dialogValue(s,ct+'fldSlidingUniqueValuesMinCount').value!==0){
  await gesture(s,'reset reserved category count',ct+'fldSlidingUniqueValuesMinCount','fill',{value:'0'},true);s=await observe('reserved count entered');
  await gesture(s,'commit reserved count',ct+'fldSlidingUniqueValuesMinCount','press',{key:'Tab'},true);s=await observe('reserved count committed');
 }
 need(dialogValue(s,ct+'fldSlidingUniqueValuesMinCount').value===0,'reserved count differs');
 await gesture(s,'apply column minimum',ct+'btnApply');s=await observe('column minimum applied');
 }
 await setBoolean('pedSlidingUniqueValues',false);
 for(const column of plan.columns){await openEditor(column,'ColumnEditDialog');
 for(const [key,value] of [['cbNullGroup',p.category_mode==='fixed'?p.include_null:false],['cbOtherGroup',p.category_mode==='fixed'?p.include_other:false]]){
  if(dialogValue(s,ct+key).value===value)continue;need(!dialogValue(s,ct+key).disabled,'special group disabled');
  await gesture(s,'set explicit special group',ct+key+';DisplayEl');s=await observe('special group changed');need(dialogValue(s,ct+key).value===value,'special group differs');
 }
 await gesture(s,'apply fixed special-group policy',ct+'btnApply');await observe('special-group policy applied');
 }
 if(p.category_mode==='sliding')await setBoolean('pedSlidingUniqueValues',true);
 for(const f of plan.facts){
  const mask=f.functions.reduce((m,fn)=>m|CROSSTABLE_FUNCTIONS[fn].bit,0);s=await observe('CrossTable fact functions');
  if(current(s,f.index).functions===mask)continue;await openEditor(f,'FactorEditDialog');
  const ft=base+';FactorEditDialog;grpFactors;';
  // Set requested functions first; remove every unrequested native default.
  for(const wanted of [true,false])for(let i=0;i<11;i++){
   const value=(mask&(1<<i))!==0;if(value!==wanted)continue;const tid=ft+'chb'+(i?'-'+i:'');
   const option=dialogValue(s,tid);if(option.value===value)continue;need(!option.disabled,'requested function is disabled');
   await gesture(s,'set exact CrossTable function',tid+';DisplayEl');s=await observe('fact function changed');need(dialogValue(s,tid).value===value,'function change unconfirmed');
  }
  await gesture(s,'apply complete fact function set',base+';FactorEditDialog;btnApply');s=await observe('fact functions applied');need(current(s,f.index).functions===mask,'applied function mask differs');
 }
 const after=(await observe('final owned CrossTable configuration')).node_crosstable,c=crossTableConfiguration(after,inputMapping);
 need(same(c.row_keys.map(f=>f.name),plan.keys.map(f=>f.name))&&same(c.columns.map(f=>f.name),plan.columns.map(f=>f.name))
  &&same(c.facts.map(f=>({name:f.name,functions:f.functions})),plan.facts.map(f=>({name:f.name,functions:Object.keys(CROSSTABLE_FUNCTIONS).filter(fn=>f.functions.includes(fn))})))
  &&c.category_mode===p.category_mode,'final configuration differs');
 const identity=xs=>xs.map(f=>({index:f.index,record_id:f.record_id,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind}));
 need(same(identity(c.input_fields),identity(fields)),'input identity changed');
 return {verified:true,cleanup_complete:true,effect_possible:true,configuration:c,preservation:{input_identity:true}};
}
