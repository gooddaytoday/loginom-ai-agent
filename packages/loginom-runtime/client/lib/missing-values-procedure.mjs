import {resolveMissingValuesParameters} from './missing-values-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error(m);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export async function configureMissingValues(channel,p){
 const ready=s=>s.wizard?.stage==='missing_values'&&s.node_missing_values?.verified===true;
 const observe=condition=>channel.observe({condition,readMissingValues:true,ready});
 const initial=await observe('complete missing values settings'),baseline=initial.node_missing_values;
 need(Object.values(baseline.options).every(o=>!o.switch_pressed),'Variable-driven missing values settings unsupported');
 need(baseline.options.pedUseQuality.value===false,'Quality-driven missing values settings unsupported');
 const requested=p.fields===undefined?baseline.fields.filter(f=>f.used).map(f=>({field:{kind:'input_field',name:f.name},method:f.method,...(f.method==='constant'?{value:f.value}:{})})):p.fields;
 const plan=resolveMissingValuesParameters({fields:requested},baseline.input_fields);
 need(plan.length>0,'Missing values requires supported nonempty processing fields');
 need(p.fields!==undefined||baseline.ordered===false,'Saved ordered input unsupported');
 const control=(s,tid,verb='click')=>{const es=s.ui.elements.filter(e=>e.tid===tid&&e.allowed_actions.includes(verb));need(es.length===1,'Missing values control unavailable: '+tid);return es[0];};
 const fieldControl=(s,name,part)=>{const es=s.ui.elements.filter(e=>e.missing_values_field?.field_key===name&&e.missing_values_field.part===part&&e.allowed_actions.includes('click'));need(es.length===1,'Missing values field unavailable: '+name+'/'+part);return es[0];};
 const reveal=async(name,part)=>{
  let s=await observe('missing values field readiness');
  for(let attempt=0;attempt<130;attempt++){
   if(s.ui.elements.some(e=>e.missing_values_field?.field_key===name&&e.missing_values_field.part===part&&e.allowed_actions.includes('click')))return s;
   const fields=s.node_missing_values.fields,index=n=>fields.findIndex(f=>f.name===n),target=index(name);
   const visible=s.ui.elements.filter(e=>e.missing_values_field?.part===part&&e.scroll&&e.allowed_actions.includes('scroll')).sort((a,b)=>index(a.missing_values_field.field_key)-index(b.missing_values_field.field_key));
   need(target>=0&&visible.length&&attempt<129,'Cannot reveal missing values field');
   const direction=target<index(visible[0].missing_values_field.field_key)?-1:target>index(visible.at(-1).missing_values_field.field_key)?1:0;
   need(direction!==0,'Missing values field obscured');const anchor=visible[Math.floor(visible.length/2)],before=anchor.scroll;
   await channel.perform({condition:'reveal missing values field',initialObservation:s,ready,identity:()=>({name,part,scroll:before.ref}),resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:direction*400})});
   s=await observe('missing values scroll applied');const after=s.ui.elements.find(e=>e.scroll?.ref===before.ref)?.scroll;need(after&&direction*(after.top-before.top)>0,'Missing values grid did not scroll');
  }
 };
 const act=async(s,condition,element,action)=>channel.perform({condition,initialObservation:s,ready,identity:s=>({node:s.node_missing_values.node_context,editor:s.node_missing_values.editor,method_context:s.node_missing_values.method_context}),resolve:s=>({...action,ref:element(s).ref})});
 const base=initial.wizard.root_tid+';DataRecoveryWizard;',editorBase=base+'grdColumnsSettings;tbl;celleditor;cbx';
 if(p.fields!==undefined){
  let s=await observe('missing values ordering');
  if(s.node_missing_values.ordered){
   await act(s,'use unordered input',s=>control(s,base+'pedOrderedSample;ValueControl;DisplayEl','set_checked'),{verb:'set_checked',checked:false});
   need(!(await observe('unordered input applied')).node_missing_values.ordered,'Ordering differs');
  }
  if(s.node_missing_values.max_nulls_percent!==p.max_nulls_percent){
   s=await observe('explicit missing values threshold');
   const input=s=>{const es=s.ui.elements.filter(e=>e.identity?.anchor_tid===base+'pedMaxNullsPercent;ValueControl'&&e.allowed_actions.includes('fill'));need(es.length===1,'Threshold input unavailable');return es[0];};
   await act(s,'set missing values threshold',input,{verb:'fill',text:String(p.max_nulls_percent)});
   s=await observe('threshold before blur');await act(s,'commit missing values threshold',input,{verb:'press',key:'Tab'});
   need((await observe('threshold applied')).node_missing_values.max_nulls_percent===p.max_nulls_percent,'Threshold differs');
  }
  for(const field of baseline.fields){
   const wanted=plan.find(f=>f.name===field.name);s=await reveal(field.name,'usage');
   if(s.node_missing_values.fields.find(f=>f.name===field.name).used!==!!wanted){
    await act(s,'set processing membership '+field.name,s=>fieldControl(s,field.name,'usage'),{verb:'click'});
    need((await observe('processing membership applied')).node_missing_values.fields.find(f=>f.name===field.name).used===!!wanted,'Field processing differs');
   }
   if(!wanted)continue;
   s=await reveal(field.name,'method');let actual=s.node_missing_values.fields.find(f=>f.name===field.name);
   if(actual.method===wanted.method&&(wanted.method!=='constant'||actual.value===wanted.value))continue;
   await act(s,'open method '+field.name,s=>fieldControl(s,field.name,'method'),{verb:'click'});
   s=await observe('owned method editor');need(s.node_missing_values.editor?.field_name===field.name,'Foreign method editor');
   const option=editorBase+';boundlist;'+(wanted.method==='mean'?'Заменять_средним':'Заменять_заданным_значением');
   await act(s,'select explicit method '+field.name,s=>control(s,option),{verb:'click'});
   s=await observe('method choice selected');
   if(actual.method!==wanted.method){
    const input=s=>{const es=s.ui.elements.filter(e=>e.identity?.anchor_tid===editorBase&&e.allowed_actions.includes('press'));need(es.length===1,'Method input unavailable');return es[0];};
    await act(s,'commit changed method '+field.name,input,{verb:'press',key:'Enter'});
    s=await channel.observe({condition:'changed method committed',readMissingValues:true,
     ready:s=>ready(s)&&!s.node_missing_values.editor&&s.node_missing_values.fields.find(f=>f.name===field.name)?.method===wanted.method});
    if(wanted.method==='constant'){
     // The prompt trigger belongs to the live cell editor. Reopen only this
     // cell after committing the newly selected method, not the node wizard.
     await act(s,'open committed constant method '+field.name,s=>fieldControl(s,field.name,'method'),{verb:'click'});
     s=await observe('committed constant editor');need(s.node_missing_values.editor?.field_name===field.name,'Foreign constant editor');
     await act(s,'select committed constant '+field.name,s=>control(s,option),{verb:'click'});
     s=await observe('committed constant ready');
    }
   }
   if(wanted.method==='constant'){
    need(s.node_missing_values.editor?.field_name===field.name,'Constant editor owner differs');
    const owner=s.node_missing_values.editor;
    await act(s,'open constant editor '+field.name,s=>fieldControl(s,field.name,'constant'),{verb:'click'});
    s=await observe('constant value dialog');
    const dialog=s=>{const ds=s.ui.dialogs.filter(d=>d.title==='Редактирование значения замены для пропусков');need(ds.length===1&&same(s.node_missing_values.method_context,owner),'Constant dialog owner differs');return ds[0].ref;};
    const input=s=>{const ref=dialog(s),es=s.ui.elements.filter(e=>e.signature?.dialog_ref===ref&&e.identity?.anchor_tid==='msgbox;cnt;cnt;txt'&&e.allowed_actions.includes('fill'));need(es.length===1,'Constant input unavailable');return es[0];};
    await act(s,'set string constant '+field.name,input,{verb:'fill',text:wanted.value});
    s=await observe('constant ready to accept');dialog(s);
    await act(s,'accept string constant '+field.name,s=>control(s,'msgbox;tlb;ok'),{verb:'click'});
   }
   s=await observe('method before closing editor');
   // Opening the constant prompt already closes the cell editor. Mean selection
   // still needs the active editor's Enter commit.
   if(s.node_missing_values.editor){
    const input=s=>{const es=s.ui.elements.filter(e=>e.identity?.anchor_tid===editorBase&&e.allowed_actions.includes('press'));need(es.length===1,'Method input unavailable');return es[0];};
    await act(s,'commit method '+field.name,input,{verb:'press',key:'Enter'});
   }
   s=await channel.observe({condition:'method applied',readMissingValues:true,ready:s=>{if(!ready(s))return false;const f=s.node_missing_values.fields.find(f=>f.name===field.name);return f?.used&&f.method===wanted.method&&(wanted.method!=='constant'||f.value===wanted.value);}});actual=s.node_missing_values.fields.find(f=>f.name===field.name);
   need(actual.used&&actual.method===wanted.method&&(wanted.method!=='constant'||actual.value===wanted.value),'Requested method was not applied');
  }
 }
 const after=(await observe('complete final missing values settings')).node_missing_values;
 need(same(after.input_fields,baseline.input_fields),'Missing values input schema changed');
 need(after.ordered===false&&after.max_nulls_percent===(p.max_nulls_percent??baseline.max_nulls_percent),'Missing values options differ');
 need(same(after.options.pedUseQuality,baseline.options.pedUseQuality)&&same(after.options['RandSeedEdit;edtRandSeed'],baseline.options['RandSeedEdit;edtRandSeed']),'Unrequested missing values settings changed');
 need(after.fields.every(f=>{const wanted=plan.find(p=>p.name===f.name);return f.used===!!wanted&&(!wanted||f.method===wanted.method&&(wanted.method!=='constant'||f.value===wanted.value));}),'Final processing set differs');
 return {verified:true,cleanup_complete:true,effect_possible:p.fields!==undefined,configuration:after};
}
