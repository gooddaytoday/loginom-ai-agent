import {resolveDataToVarParameters,dataToVarMask,DATA_TO_VAR_FUNCTIONS} from './variables-datatovar-parameters.mjs';

const need=(ok,message)=>{if(!ok)throw Error('Table to variables: '+message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const supported=f=>dataToVarMask(f.type,f.functions);
const FACTORS=['sum','count','min','max','average','median','mode','standard_deviation','unique_count','null_count','first','last','only','concat'];

export async function configureDataToVarWizard(channel,p,{finish='done',newNode=false}={}){
 need(['done','execute','close'].includes(finish),'unsupported finish mode');
 const changed=await configureDataToVar(channel,p,{newNode});
 if(finish==='close')return changed;
 const owner=changed.configuration.node_context;
 const ready=s=>s.wizard?.stage==='datatovar'&&s.node_datatovar?.verified===true;
 const before=await channel.observe({condition:'table-to-variables before native Next',readDataToVar:true,ready});
 await channel.perform({condition:'validate table-to-variables and advance to Done',initialObservation:before,ready,
  identity:()=>owner,resolve:s=>{
   need(same(s.node_datatovar.node_context,owner),'wizard owner changed before Next');
   const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));
   need(es.length===1,'native Next is unavailable');return {verb:'wizard_step',ref:es[0].ref,expected_stage:'done'};
  }});
 const done=await channel.observe({condition:'table-to-variables accepted by Loginom',ready:s=>s.wizard?.stage==='done'});
 need(['document_id','workflow_id','node_id'].every(k=>done.prepared_node_context?.[k]===owner[k]),'Done wizard owner changed');
 return {...changed,validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}

export async function configureDataToVar(channel,p,{newNode=false}={}){
 const ready=s=>s.wizard?.stage==='datatovar'&&s.node_datatovar?.verified===true&&s.node_datatovar.inventory_complete===true;
 const first=await channel.observe({condition:'complete table-to-variables inventory',readDataToVar:true,ready});
 const baseline=first.node_datatovar,owner=baseline.node_context;
 need(owner?.verified===true&&owner.surface==='wizard'&&!owner.input_port&&!owner.output_port,'native wizard owner is required');
 const unchanged=f=>({record_id:f.record_id,name:f.name,label:f.label,type:f.type,settings:f.settings});
 // Native list settings of a field may change only when Apply toggles its
 // concat function; they are then rebound and recorded, never written by us.
 let expected=baseline.input_fields.map(unchanged);const concatDefaults=[];
 const observe=async condition=>{
  const s=await channel.observe({condition,readDataToVar:true,ready});
  need(same(s.node_datatovar.node_context,owner)&&s.wizard.root_tid===first.wizard.root_tid,'wizard owner changed');
  need(same(s.node_datatovar.input_fields.map(unchanged),expected),'input identity or unrelated settings changed');
  return s;
 };
 if(p&&Object.keys(p).length===0){
  need(!newNode&&baseline.fields.length>0&&baseline.fields.length<=16&&baseline.fields.every(supported),'existing configuration is unsupported or incomplete');
  return {verified:true,cleanup_complete:true,effect_possible:false,configuration:baseline,preservation:{unchanged:true}};
 }
 const plan=resolveDataToVarParameters(p,baseline.input_fields),wanted=new Set(plan.fields.map(f=>f.input.name));
 const control=(s,suffix,verb='click')=>{
  const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';'+suffix&&e.allowed_actions.includes(verb));
  need(es.length===1,'unique wizard control is required: '+suffix);return es[0];
 };
 const fieldAt=(s,name)=>{const f=s.node_datatovar.input_fields.find(f=>f.name===name);need(f,'input field is missing: '+name);return f;};
 const cell=(s,f,verb)=>{
  const es=s.ui.elements.filter(e=>e.datatovar_field?.record_id===f.record_id&&e.datatovar_field.field_key===f.name
   &&e.datatovar_field.role===f.role&&e.allowed_actions.includes(verb));
  need(es.length<=1,'native field row is ambiguous: '+f.name);return es[0];
 };
 const select=async(name,role)=>{
  let s=await observe('table-to-variables field selection');
  for(let attempt=0;attempt<128;attempt++){
   const f=fieldAt(s,name);need(f.role===role,'field role changed before selection');
   const e=cell(s,f,'click');
   if(e){
    if(same(s.node_datatovar.selections[role],[f.record_id]))return s;
    await channel.perform({condition:'select exact table-to-variables field',initialObservation:s,ready,
     identity:()=>({owner,record_id:f.record_id,role}),resolve:()=>({verb:'click',ref:e.ref})});
    s=await observe('table-to-variables field selected');
    need(same(s.node_datatovar.selections[role],[f.record_id]),'native field selection differs');return s;
   }
   const visible=s.ui.elements.filter(e=>e.datatovar_field?.role===role&&e.scroll&&e.allowed_actions.includes('scroll'));
   need(visible.length>0,'native field row cannot be revealed: '+name);
   const order=name=>role==='selected'?fieldAt(s,name).order:baseline.input_fields.findIndex(f=>f.name===name);
   visible.sort((a,b)=>order(a.datatovar_field.field_key)-order(b.datatovar_field.field_key));
   const target=order(name),direction=target<order(visible[0].datatovar_field.field_key)?-1:target>order(visible.at(-1).datatovar_field.field_key)?1:0;
   need(direction!==0,'native field row is obscured inside the visible range');
   const anchor=visible[Math.floor(visible.length/2)],scroll=anchor.scroll;
   await channel.perform({condition:'reveal table-to-variables field in its grid',initialObservation:s,ready,
    identity:()=>({owner,record_id:f.record_id,role,scroll:scroll.ref}),resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:direction*400})});
   s=await observe('table-to-variables grid scrolled');
   const next=s.ui.elements.find(e=>e.scroll?.ref===scroll.ref)?.scroll;
   need(next&&direction*(next.top-scroll.top)>0,'native field grid did not scroll');
  }
  throw Error('Table to variables: field row reveal budget exhausted');
 };
 for(const f of baseline.fields)if(!wanted.has(f.name)){
  const s=await select(f.name,'selected');
  await channel.perform({condition:'remove unrequested table-to-variables field',initialObservation:s,ready,
   identity:()=>({owner,record_id:f.record_id}),resolve:s=>{
    const e=cell(s,fieldAt(s,f.name),'press');need(e,'selected native row is unavailable');return {verb:'press',ref:e.ref,key:'Delete'};
   }});
  need(fieldAt(await observe('unrequested field returned to available list'),f.name).role==='available','field removal was not applied');
 }
 for(const [index,desired]of plan.fields.entries()){
  const name=desired.input.name;
  let s=await observe('requested table-to-variables membership'),f=fieldAt(s,name);
  if(f.role==='available'){
   s=await select(name,'available');
   await channel.perform({condition:'move field into table-to-variables selection',initialObservation:s,ready,
    identity:()=>({owner,record_id:f.record_id}),resolve:s=>({verb:'click',ref:control(s,'DataToVariablesWizard;frmMoveButtons;btnMove0').ref})});
   s=await observe('table-to-variables membership applied');f=fieldAt(s,name);need(f.role==='selected','field move was not applied');
  }
  s=await select(name,'selected');f=fieldAt(s,name);
  while(f.order>index){
   const order=f.order;
   await channel.perform({condition:'order table-to-variables field',initialObservation:s,ready,
    identity:()=>({owner,record_id:f.record_id,order}),resolve:s=>({verb:'click',ref:control(s,'DataToVariablesWizard;btnUp').ref})});
   s=await observe('table-to-variables field moved once');f=fieldAt(s,name);need(f.order===order-1,'native field order did not move by one');
  }
  need(f.order===index,'native field order differs');
  if(f.functions===desired.mask)continue;
  await channel.perform({condition:'open exact table-to-variables factor editor',initialObservation:s,ready,
   identity:()=>({owner,record_id:f.record_id}),resolve:s=>{
    const e=cell(s,fieldAt(s,name),'double_click');need(e,'native factor row is unavailable');return {verb:'double_click',ref:e.ref};
   }});
  const editorReady=s=>ready(s)&&s.wizard.factor_editor?.status==='rendered_factor_options'
   &&s.wizard.factor_editor.selected_field?.field_key===name&&same(s.node_datatovar.selections.selected,[f.record_id]);
  const editor=async()=>{
   const s=await channel.observe({condition:'complete bound table-to-variables factor editor',readDataToVar:true,ready:editorReady});
   need(same(s.node_datatovar.node_context,owner),'factor editor owner changed');
   // The open dialog edits this field; its list settings are checked after Apply.
   const editing=xs=>xs.map(x=>x.record_id===f.record_id?{...x,settings:null}:x);
   need(same(editing(s.node_datatovar.input_fields.map(unchanged)),editing(expected)),'input identity changed in factor editor');
   const os=s.wizard.factor_editor.options;
   need(os.length===14&&FACTORS.every(a=>os.filter(o=>o.aggregation===a).length===1)
    &&os.every(o=>typeof o.checked==='boolean'&&typeof o.enabled==='boolean'&&typeof o.display_ref==='string')
    &&new Set(os.map(o=>o.display_ref)).size===14,'complete unique native factor options are required');
   return s;
  };
  // Enabling first avoids a transient empty selection when replacing the only
  // old function. Unknown mutation outcomes propagate; no gesture is replayed.
  for(const enabled of [true,false])for(const aggregation of FACTORS){
   const wanted=desired.aggregations.includes(aggregation==='average'?'avg':aggregation);
   if(wanted!==enabled)continue;
   s=await editor();const o=s.wizard.factor_editor.options.find(o=>o.aggregation===aggregation);
   if(o.checked===wanted)continue;need(o.enabled,'requested native aggregation is disabled: '+aggregation);
   await channel.perform({condition:'set exact table-to-variables function '+aggregation,initialObservation:s,ready:editorReady,
    identity:()=>({owner,record_id:f.record_id,aggregation,checked:wanted}),resolve:()=>({verb:'set_checked',ref:o.display_ref,checked:wanted})});
  }
  s=await editor();
  need(s.wizard.factor_editor.options.every(o=>o.checked===desired.aggregations.includes(o.aggregation==='average'?'avg':o.aggregation)),'native factor set differs before Apply');
  await channel.perform({condition:'apply factors to the exact selected field',initialObservation:s,ready:editorReady,
   identity:()=>({owner,record_id:f.record_id,mask:desired.mask}),resolve:s=>({verb:'click',ref:control(s,'FactorEditDialog;btnApply').ref})});
  const concat=((f.functions^desired.mask)&DATA_TO_VAR_FUNCTIONS.concat)!==0;
  if(concat){
   s=await channel.observe({condition:'table-to-variables factors applied',readDataToVar:true,ready});
   need(same(s.node_datatovar.node_context,owner)&&s.wizard.root_tid===first.wizard.root_tid,'wizard owner changed');
   const settings=fieldAt(s,name).settings,rebound=expected.map(x=>x.record_id===f.record_id?{...x,settings}:x);
   need(same(s.node_datatovar.input_fields.map(unchanged),rebound),'input identity or unrelated settings changed');
   expected=rebound;concatDefaults.push({name,settings:structuredClone(settings)});
  }else s=await observe('table-to-variables factors applied');
  need(fieldAt(s,name).functions===desired.mask,'applied native function bitset differs');
 }
 const after=(await observe('complete final table-to-variables configuration')).node_datatovar;
 need(same(after.fields.map(f=>({name:f.name,mask:f.functions})),plan.fields.map(f=>({name:f.input.name,mask:f.mask}))),'final native field/function order differs');
 return {verified:true,cleanup_complete:true,effect_possible:true,configuration:after,preservation:{input_identity:true,field_settings:!concatDefaults.length,...(concatDefaults.length?{native_concat_settings:concatDefaults}:{})}};
}
