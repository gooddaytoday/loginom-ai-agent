import {resolveSortingParameters} from './sorting-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error(m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function configureSorting(channel,p,{newNode=false}={}){
 const ready=s=>s.wizard?.stage==='sorting'&&s.node_sorting?.verified===true;
 const observe=condition=>channel.observe({condition,readSorting:true,ready});
 const initial=await observe('complete sorting configuration'),baseline=initial.node_sorting;
 need(p.keys!==undefined||baseline.keys.every(k=>!k.missing_input),'Existing sorting contains missing input keys; provide complete replacement keys');
 const plan=p.keys===undefined?baseline.keys:resolveSortingParameters(p,baseline.input_fields);
 need(plan.length>0,'Existing sorting requires nonempty keys');
 const element=(s,name,role,part)=>{const es=s.ui.elements.filter(e=>e.sorting_field?.field_key===name&&e.sorting_field.role===role&&e.sorting_field.part===part&&e.allowed_actions.includes('click'));need(es.length===1,'Sorting field control unavailable: '+name+'/'+part);return es[0];};
 const reveal=async(name,role,part='field')=>{
  let s=await observe('sorting field readiness');
  for(let attempt=0;attempt<130;attempt++){
   if(s.ui.elements.some(e=>e.sorting_field?.field_key===name&&e.sorting_field.role===role&&e.sorting_field.part===part&&e.allowed_actions.includes('click')))return s;
   const fields=role==='available'?s.node_sorting.input_fields.filter(f=>!s.node_sorting.keys.some(k=>k.name===f.name)):s.node_sorting.keys;
   const order=n=>fields.findIndex(f=>f.name===n),target=order(name);need(target>=0,'Sorting field disappeared');
   const visible=s.ui.elements.filter(e=>e.sorting_field?.role===role&&e.sorting_field.part==='field'&&e.scroll&&e.allowed_actions.includes('scroll')).sort((a,b)=>order(a.sorting_field.field_key)-order(b.sorting_field.field_key));
   need(visible.length&&attempt<129,'Sorting field cannot be revealed');const direction=target<order(visible[0].sorting_field.field_key)?-1:target>order(visible.at(-1).sorting_field.field_key)?1:0;
   need(direction!==0,'Sorting field is obscured');const anchor=visible[Math.floor(visible.length/2)],before=anchor.scroll;
   await channel.perform({condition:'reveal sorting field',initialObservation:s,ready,identity:()=>({name,role,scroll:before.ref}),resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:direction*400})});
   s=await observe('sorting scroll applied');const after=s.ui.elements.find(e=>e.scroll?.ref===before.ref)?.scroll;need(after&&direction*(after.top-before.top)>0,'Sorting grid did not scroll');
  }
 };
 const click=async(s,name,role,part,verb='click')=>channel.perform({condition:'sorting '+part+' '+name,initialObservation:s,ready,identity:()=>({name,role,part,record:element(s,name,role,part).sorting_field.record_id}),resolve:s=>({verb,ref:element(s,name,role,part).ref})});
 if(p.keys!==undefined){
  for(const f of baseline.keys)if(!plan.some(k=>k.name===f.name)){
   const s=await reveal(f.name,'selected','delete');await click(s,f.name,'selected','delete');need(!(await observe('unrequested sorting key removed')).node_sorting.keys.some(k=>k.name===f.name),'Sorting removal not applied');
  }
  for(const [index,wanted] of plan.entries()){
   let s=await observe('sorting membership');if(!s.node_sorting.keys.some(k=>k.name===wanted.name)){
    s=await reveal(wanted.name,'available');await click(s,wanted.name,'available','field','double_click');s=await observe('sorting key added');need(s.node_sorting.keys.some(k=>k.name===wanted.name),'Sorting addition not applied');
   }
   s=await reveal(wanted.name,'selected');await click(s,wanted.name,'selected','field');s=await observe('sorting key selected');
   let f=s.node_sorting.keys.find(k=>k.name===wanted.name);need(same(s.node_sorting.selections.selected,[f.record_id]),'Sorting selection differs');
   while(f.order>index){const old=f.order;
    await channel.perform({condition:'move sorting key up once',initialObservation:s,ready,identity:()=>({name:f.name,record_id:f.record_id,order:old}),resolve:s=>{
     const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';SortingWizard;SortingColumnCollection;btnMoveUp'&&e.allowed_actions.includes('click'));need(es.length===1,'Sorting Up unavailable');return {verb:'click',ref:es[0].ref};}});
    s=await observe('sorting key order changed');f=s.node_sorting.keys.find(k=>k.name===wanted.name);need(f.order===old-1,'Sorting priority did not move once');
   }
   need(f.order===index,'Sorting priority differs');
   for(const [property,part] of [['direction','direction'],['case_sensitive','case']])if(wanted[property]!==undefined&&f[property]!==wanted[property]){
    s=await reveal(wanted.name,'selected',part);await click(s,wanted.name,'selected',part);
    s=await observe('sorting '+property+' applied');f=s.node_sorting.keys.find(k=>k.name===wanted.name);need(f[property]===wanted[property],'Sorting '+property+' differs');
   }
  }
 }
 const locale=p.compare_with_locale??(newNode?true:baseline.options.chkLocaleAware.value);
 let s=await observe('sorting locale before change');need(!s.node_sorting.options.chkLocaleAware.switch_pressed,'Variable-driven sorting locale unsupported');
 if(s.node_sorting.options.chkLocaleAware.value!==locale){
  await channel.perform({condition:'set sorting locale explicitly',initialObservation:s,ready,identity:()=>({locale}),resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';SortingWizard;SortingColumnCollection;chkLocaleAware;ValueControl;DisplayEl'&&e.allowed_actions.includes('set_checked'));need(es.length===1,'Sorting locale control unavailable');return {verb:'set_checked',ref:es[0].ref,checked:locale};}});
 }
 const after=(await observe('complete final sorting configuration')).node_sorting;
 need(same(after.keys.map(k=>k.name),plan.map(k=>k.name))&&after.keys.every((k,i)=>!k.missing_input&&k.direction===plan[i].direction&&(plan[i].case_sensitive===undefined||k.case_sensitive===plan[i].case_sensitive)),'Final sorting keys differ');
 need(same(after.input_fields,baseline.input_fields)&&same(after.options.chkBufferWhole,baseline.options.chkBufferWhole)&&same(after.options.cbxMaxThreadCount,baseline.options.cbxMaxThreadCount),'Unrequested sorting settings changed');
 need(after.options.chkLocaleAware.value===locale,'Sorting locale differs');
 return {verified:true,cleanup_complete:true,effect_possible:true,configuration:after,preservation:{input_identity:true,cache:true,threads:true}};
}
