import {bindReformInput} from './reform-input.mjs';
import {resolveReformChanges,REFORM_TYPES,REFORM_USAGE} from './reform-parameters.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const semantic=fields=>fields.map(({selected,...f})=>f);

export async function configureReform(channel,parameters,{inputMapping}={}) {
 const ready=s=>s.wizard?.stage==='field_parameters'&&s.node_reform?.verified===true;
 const observe=condition=>channel.observe({condition,readReform:true,ready});
 const configuration=s=>inputMapping?bindReformInput(s.node_reform,inputMapping):s.node_reform;
 const baseline=configuration(await observe('complete reform configuration'));
 const plan=resolveReformChanges(parameters,baseline);
 let expected=structuredClone(baseline.fields),edits=0;
 const unique=(s,predicate,message)=>{const es=s.ui.elements.filter(predicate);need(es.length===1,message);return es[0];};
 const reveal=async field=>{
  let s=await observe('reform field readiness');
  for(let attempt=0;attempt<130;attempt++) {
   need(same(semantic(configuration(s).fields),semantic(expected)),'Reform inventory changed before editor');
   const row=s.wizard.reform_columns?.fields.find(r=>r.status==='observed'&&r.name===field.name);
   if(row&&s.ui.elements.some(e=>e.ref===row.name_ref&&e.allowed_actions.includes('double_click')))return s;
   const visible=(s.wizard.reform_columns?.fields??[]).map(r=>({field:expected.find(f=>f.name===r.name),
    control:s.ui.elements.find(e=>e.ref===r.name_ref&&e.scroll&&e.allowed_actions.includes('scroll'))})).filter(r=>r.field&&r.control).sort((a,b)=>a.field.index-b.field.index);
   need(visible.length&&attempt<129,'Reform field cannot be revealed');
   const direction=field.index<visible[0].field.index?-1:field.index>visible.at(-1).field.index?1:0;
   need(direction!==0,'Reform field is obscured');const anchor=visible[Math.floor(visible.length/2)].control,scroll=anchor.scroll;
   await channel.perform({condition:'reveal exact reform field',initialObservation:s,ready,identity:()=>({record_id:field.record_id,scroll_owner:scroll.ref}),
    resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:direction*400})});
   s=await observe('reform scroll applied');const after=s.ui.elements.find(e=>e.scroll?.ref===scroll.ref)?.scroll;
   need(after&&direction*(after.top-scroll.top)>0,'Reform scroll made no progress');
  }
 };
 for(const {original,wanted} of plan.changes) {
  if(same(semantic([original]),semantic([wanted])))continue;
  let s=await reveal(original);const root=s.wizard.root_ref;
  await channel.perform({condition:'open exact reform field editor',initialObservation:s,ready,
   identity:()=>({record_id:original.record_id,field_id:original.field_id,name:original.name}),resolve:s=>{
    const row=s.wizard.reform_columns.fields.find(r=>r.name===original.name);
    need(row,'Reform row disappeared');return {verb:'double_click',ref:row.name_ref};}});
  const editorReady=s=>s.wizard?.root_ref===root&&s.wizard.stage==='field_parameters'
   &&s.wizard.reform_parameters?.status==='observed'&&s.wizard.reform_parameters.portal_bound===true
   &&s.wizard.reform_parameters.selected_column?.name===original.name;
  const identity=s=>({record_id:original.record_id,field_id:original.field_id,editor:s.wizard.reform_parameters.root_ref});
  const usage=Object.keys(REFORM_USAGE).find(k=>REFORM_USAGE[k]===wanted.usage_type);
  // Type first; name can update a linked label, so restore the requested or
  // retained label after blur. Preserve kind/usage even when type defaults vary.
  const values={type_label:REFORM_TYPES[wanted.type]??'Переменный',name:wanted.name,label:wanted.label,data_kind:wanted.data_kind,usage,excluded:wanted.excluded};
  for(const [key,value] of Object.entries(values)) {
   s=await channel.observe({condition:'bound reform '+key+' editor',ready:editorReady});
   const field=s.wizard.reform_parameters.fields[key];need(field?.status==='observed'&&!field.truncated,'Reform editor property unavailable');
   if(field.value===value)continue;
   need(field.enabled,'Requested reform property is disabled');
   if(['type_label','data_kind','usage'].includes(key)) {
    const choice=(e,kind)=>e.wizard_combo?.kind===kind&&e.wizard_combo.field?.scope==='reform_column'&&e.wizard_combo.field.name===key;
    await channel.perform({condition:'open reform '+key+' choices',initialObservation:s,ready:editorReady,identity,
     resolve:s=>({verb:'click',ref:unique(s,e=>choice(e,'picker')&&e.allowed_actions.includes('click'),'Reform picker unavailable').ref})});
    s=await channel.observe({condition:'exact reform '+key+' choice',ready:s=>editorReady(s)&&s.ui.elements.some(e=>choice(e,'option')&&e.wizard_combo.label===value)});
    await channel.perform({condition:'select reform '+key,initialObservation:s,ready:editorReady,identity,
     resolve:s=>({verb:'select_wizard_option',ref:unique(s,e=>choice(e,'option')&&e.wizard_combo.label===value&&e.allowed_actions.includes('select_wizard_option'),'Reform option unavailable').ref})});
   } else if(key==='excluded') {
    await channel.perform({condition:'set reform exclusion',initialObservation:s,ready:editorReady,identity,
     resolve:s=>({verb:'set_checked',ref:s.wizard.reform_parameters.fields.excluded.display_ref,checked:value})});
   } else await channel.perform({condition:'set reform '+key,initialObservation:s,ready:editorReady,identity,
    resolve:s=>({verb:'set_wizard_field',ref:s.wizard.reform_parameters.fields[key].input_ref,text:value})});
  }
  s=await channel.observe({condition:'reform editor values applied before commit',ready:editorReady});
  need(Object.entries(values).every(([k,v])=>s.wizard.reform_parameters.fields[k]?.value===v),'Reform editor differs from complete requested patch');
  await channel.perform({condition:'apply exact reform field once',initialObservation:s,ready:editorReady,identity,
   resolve:s=>({verb:'apply_reform_column',ref:unique(s,e=>e.column_close?.scope==='reform'&&e.allowed_actions.includes('apply_reform_column'),'Reform Apply unavailable').ref})});
  s=await observe('reform record applied');expected=expected.map(f=>f.record_id===original.record_id?{...wanted}:f);
  need(same(semantic(configuration(s).fields),semantic(expected)),'Reform edit changed unrequested fields or properties');
  need(same(s.node_reform.caching,baseline.caching),'Reform edit changed node caching');edits++;
 }
 const after=configuration(await observe('complete final reform draft'));
 need(same(semantic(after.fields),semantic(plan.fields))&&same(after.caching,baseline.caching),'Final reform draft differs');
 return {verified:true,cleanup_complete:true,effect_possible:edits>0,baseline_configuration:baseline,configuration:after,
  preservation:{unrequested_fields:true,unrequested_properties:true,caching:true},applied_editors:edits,settings_applied:false};
}
