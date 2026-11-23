import {resolveBinningField} from './binning-parameters.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
const need=(v,m)=>{if(!v)throw Error('Binning: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const binningReady=s=>s.wizard?.stage==='binning'&&s.node_binning?.verified===true&&s.node_binning.binding_ready===true;
export const observeBinning=(channel,condition,ready=()=>true)=>channel.observe({condition,readBinning:true,ready:s=>binningReady(s)&&ready(s)});
const one=(s,p,m)=>{const es=s.ui.elements.filter(p);need(es.length===1,m);return es[0];};
const inventory=c=>c.fields.map(({method_code,bins_count,automatic,...f})=>f);
export async function selectBinningField(channel,baseline,index){
 const f=baseline.fields.find(f=>f.index===index);need(f,'numeric field disappeared');
 let s=await observeBinning(channel,'complete binning fields before selection');
 for(let attempt=0;attempt<130;attempt++){
  need(same(inventory(s.node_binning),inventory(baseline)),'numeric field inventory changed');
  if(s.node_binning.selected?.record_id===f.record_id)return s;
  const tid=s.wizard.root_tid+';MethodSettingsWizard-1;colDisplayName_'+baseline.fields.indexOf(f);
  const cells=s.ui.elements.filter(e=>e.tid===tid&&e.allowed_actions.includes('click'));
  if(cells.length===1){
   await channel.perform({condition:'select exact numeric binning field',initialObservation:s,ready:binningReady,identity:()=>f,resolve:()=>({verb:'click',ref:cells[0].ref})});
   return observeBinning(channel,'selected binning field binding settled',s=>s.node_binning.selected?.record_id===f.record_id);
  }
  const anchor=s.ui.elements.find(e=>e.tid?.startsWith(s.wizard.root_tid+';MethodSettingsWizard-1;colDisplayName_')&&e.scroll&&e.allowed_actions.includes('scroll'));
  need(anchor&&attempt<129,'numeric field cannot be revealed');
  const first=Number(anchor.tid.split('_').at(-1));
  await channel.perform({condition:'reveal numeric binning field',initialObservation:s,ready:binningReady,identity:()=>f,resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:baseline.fields.indexOf(f)<first?-350:350})});
  s=await observeBinning(channel,'numeric binning grid scrolled');
 }
}
async function chooseMethod(channel,baseline,index,code){
 let s=await selectBinningField(channel,baseline,index);
 if(s.node_binning.selected.method_code===code)return s;
 need(!s.node_binning.selected.automatic,'automatic per-field methods are outside this stage');
 const record=s.node_binning.selected,tid=s.wizard.root_tid+';MethodSettingsWizard-1;colMethodType_'+baseline.fields.findIndex(f=>f.index===index);
 await channel.perform({condition:'edit selected binning method',initialObservation:s,ready:binningReady,identity:()=>record,
  resolve:s=>({verb:'double_click',ref:one(s,e=>e.tid===tid&&e.allowed_actions.includes('double_click'),'exact method cell required').ref})});
 const editing=s=>s.node_binning.method_editor?.record_id===record.record_id;
 s=await observeBinning(channel,'bound native method editor',editing);
 const owner=s.node_binning.method_editor.root_tid+';cbx';
 await channel.perform({condition:'open binning method choices',initialObservation:s,ready:s=>binningReady(s)&&editing(s),identity:()=>record,
  resolve:s=>({verb:'click',ref:one(s,e=>e.tid===owner+';trg_picker'&&e.allowed_actions.includes('click'),'method picker required').ref})});
 const label={0:'<Не определён>',2:'Ширина',3:'Количество',4:'Плитка',5:'Коэффициенты СКО'}[code];need(label,'unsupported method');
 s=await observeBinning(channel,'observed native binning method option',s=>editing(s)&&s.ui.elements.some(e=>e.tid?.startsWith(owner+';boundlist;')&&e.label===label&&e.allowed_actions.includes('click')));
 await channel.perform({condition:'select native binning method',initialObservation:s,ready:s=>binningReady(s)&&editing(s),identity:()=>record,
  resolve:s=>({verb:'click',ref:one(s,e=>e.tid?.startsWith(owner+';boundlist;')&&e.label===label&&e.allowed_actions.includes('click'),'unique method option required').ref})});
 const editorInputs=s=>{
  const editor=s.node_binning.method_editor;
  return editor?.record_id===record.record_id?s.ui.elements.filter(e=>e.identity?.anchor_tid===editor.root_tid+';cbx'&&e.signature?.tag==='input'&&e.allowed_actions.includes('press')):[];
 };
 const choiceReady=s=>s.node_binning.selected?.record_id===record.record_id&&s.node_binning.selected.method_code===code
  &&(!s.node_binning.method_editor||editorInputs(s).length===1);
 // Method changes can replace the editor DOM before its cached context settles.
 // Await an actionable input (or completed closure) within the existing window.
 s=await observeBinning(channel,'native method choice returned to its field',choiceReady);
 if(s.node_binning.method_editor){
  need(editing(s),'method editor moved to another field');
  await channel.perform({condition:'commit selected native binning method',initialObservation:s,ready:s=>binningReady(s)&&choiceReady(s)&&editing(s),
   identity:s=>({field:record.record_id,editor:s.node_binning.method_editor.root_tid}),
   resolve:s=>({verb:'press',key:'Enter',ref:editorInputs(s)[0].ref})});
 }
 return observeBinning(channel,'binning method committed',s=>!s.node_binning.method_editor&&s.node_binning.selected?.record_id===record.record_id&&s.node_binning.selected.method_code===code);
}
export async function inspectBinningSettings(channel,baseline,index){
 let s=await selectBinningField(channel,baseline,index);const record=s.node_binning.selected;
 need([2,3,4,5].includes(record.method_code)&&!record.automatic,'saved model requires a supported fixed numeric method');
 if(!s.node_binning.frame){
  await channel.perform({condition:'expand settings of exact binning field',initialObservation:s,ready:binningReady,identity:()=>record,
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid===s.wizard.root_tid+';MethodSettingsWizard-1;btnEditMethodSettings'&&e.allowed_actions.includes('click'),'native field settings expander required').ref})});
  s=await observeBinning(channel,'settings frame belongs to selected field',s=>s.node_binning.frame?.record_id===record.record_id&&s.node_binning.settings!==null);
 }
 need(s.node_binning.frame.switches.length===0,'variable-driven settings unsupported');
 return s;
}
export async function configureBinning(channel,parameters,{request,inputMapping,preconfiguration}){
 const applying=request.mode==='apply',manual=parameters.binning?.method==='manual',fields=(applying||manual?preconfiguration:inputMapping)?.target_fields;
 need(Array.isArray(fields)&&fields.length>0,'complete verified input mapping required');
 let s=await observeBinning(channel,'complete binning configuration'),baseline=s.node_binning;
 need(baseline.fields.every(f=>fields[f.index]?.label===f.label&&fields[f.index]?.type===f.type),'numeric rows differ from input mapping');
 let field;
 if(applying){
  const used=baseline.fields.filter(f=>f.method_code!==0);need(used.length===1,'apply requires exactly one saved numeric method');field=fields[used[0].index];
 }else field=resolveBinningField(parameters,fields);
 const index=fields.findIndex(f=>f.name===field.name),wanted=parameters.binning;
 if(!applying&&!manual){
  for(const f of baseline.fields)if(f.index!==index&&f.method_code!==0)await chooseMethod(channel,baseline,f.index,0);
  await chooseMethod(channel,baseline,index,{count:3,width:2,frequency:4,sd:5}[wanted.method]);
 }
 s=await inspectBinningSettings(channel,baseline,index);
 if(manual){
  need(s.node_binning.state==='materialized'&&s.node_binning.intervals.length===wanted.intervals.length,'manual requires the complete saved materialized intervals');
  need(wanted.intervals.every((b,i)=>s.node_binning.intervals[i].lower_included===b.lower_included&&s.node_binning.intervals[i].upper_included===b.upper_included),'manual edits preserve observed inclusion flags');
  // Native boundary edits also move the adjacent bound. Check the entire edit
  // sequence before opening a cell: an invalid intermediate store is unreadable.
  const planned=s.node_binning.intervals.map(({lower,upper})=>({lower,upper}));
  for(const [i,b] of wanted.intervals.entries())for(const key of ['lower','upper']){
   if(planned[i][key]===b[key])continue;
   planned[i][key]=b[key];
   if(key==='lower'&&i>0)planned[i-1].upper=b[key];
   if(key==='upper'&&i+1<planned.length)planned[i+1].lower=b[key];
   need(planned.every(b=>b.lower<b.upper),'manual boundary would invalidate an observed interval; move boundaries in smaller steps');
  }
  for(const [i,b] of wanted.intervals.entries()){
   for(const [key,value] of [['lower',b.lower],['upper',b.upper],['label',b.label]]){
    if(s.node_binning.intervals[i][key]===value)continue;
    const field={lower:'LowerBoundValue',upper:'UpperBoundValue',label:'BinLabel'}[key],tid=s.wizard.root_tid+';MethodSettingsWizard-1;col'+field+'_'+i;
    await channel.perform({condition:'edit materialized bin '+i+' '+key,initialObservation:s,ready:binningReady,identity:()=>({field:index,interval:i}),
     resolve:s=>({verb:'double_click',ref:one(s,e=>e.tid===tid&&e.allowed_actions.includes('double_click'),'materialized interval cell required').ref})});
    s=await observeBinning(channel,'owned materialized interval editor',s=>s.node_binning.bin_editor?.number===i&&s.node_binning.bin_editor.field===field);
    const editor=s.node_binning.bin_editor;
    const input=s=>one(s,e=>e.signature?.tag==='input'&&e.identity?.anchor_tid?.startsWith(editor.root_tid)&&e.allowed_actions.includes('fill'),'unique owned bin editor input required');
    await channel.perform({condition:'fill materialized bin '+key,initialObservation:s,ready:binningReady,identity:()=>editor,resolve:s=>({verb:'fill',ref:input(s).ref,text:String(value)})});
    s=await observeBinning(channel,'materialized bin editor filled',s=>s.node_binning.bin_editor?.number===i);
    await channel.perform({condition:'commit materialized bin '+key,initialObservation:s,ready:binningReady,identity:()=>editor,resolve:s=>({verb:'press',ref:input(s).ref,key:'Enter'})});
    s=await observeBinning(channel,'manual interval readback',s=>!s.node_binning.bin_editor&&s.node_binning.intervals[i]?.[key]===value);
   }
  }
  need(s.node_binning.intervals.every((b,i)=>Object.entries(wanted.intervals[i]).every(([k,v])=>b[k]===v)),'manual intervals differ from request');
 }
 const act=async(key,action)=>{
  const owner=s.node_binning.frame.controls[key];need(owner,'bound binning control missing: '+key);
  await channel.perform({condition:'set binning '+key,initialObservation:s,ready:binningReady,identity:s=>({node:s.prepared_node_context,field:s.node_binning.selected.record_id}),
   resolve:s=>({...action,ref:one(s,e=>(e.tid===owner+(action.verb==='set_checked'?';DisplayEl':'')||action.verb!=='set_checked'&&e.tid===null&&e.identity?.anchor_tid===owner&&e.signature?.tag==='input')&&e.allowed_actions.includes(action.verb),'exact binning control required: '+key).ref})});
  s=await observeBinning(channel,'binning '+key+' readback',s=>s.node_binning.frame?.record_id===baseline.fields.find(f=>f.index===index).record_id);
 };
 if(!applying&&!manual){
  const sizeKey={count:'cbbCountBins;ValueControl',width:'edtBinWidth;ValueControl',frequency:'cbbTileCount;ValueControl'}[wanted.method];
  for(const [key,value] of [...(sizeKey?[[sizeKey,wanted.size]]:[]),...(['frequency','sd'].includes(wanted.method)?[]:[['chkStrictLowerLimit',wanted.limits!==undefined],['chkStrictUpperLimit',wanted.limits!==undefined],...(wanted.limits?[['edtLowerLimit',wanted.limits[0]],['edtUpperLimit',wanted.limits[1]]]:[])]),['chkRoundingLevel',false],['chkLowerLimitOpen;ValueControl',wanted.method==='sd'],['chkUpperLimitOpen;ValueControl',wanted.method==='sd'],...(wanted.method==='frequency'?[['chkSummTile;ValueControl',false]]:[])]){
   if(s.node_binning.frame.values[key]===value)continue;
   if(typeof value==='boolean')await act(key,{verb:'set_checked',checked:value});
   else {await act(key,{verb:'fill',text:String(value)});await act(key,{verb:'press',key:'Tab'});}
   need(s.node_binning.frame.values[key]===value,'binning control readback differs: '+key);
  }
  if(wanted.method==='sd'&&s.node_binning.settings.sd_coefficient!==wanted.sd_coefficient){
   const key='cbbSDBinsMode;ValueControl',owner=s.node_binning.frame.controls[key],label='+/- '+wanted.sd_coefficient+' СКО';
   await channel.perform({condition:'open owned SD coefficient picker',initialObservation:s,ready:binningReady,identity:()=>field,
    resolve:s=>({verb:'click',ref:one(s,e=>e.tid===owner+';trg_picker'&&e.allowed_actions.includes('click'),'owned SD picker trigger required').ref})});
   s=await observeBinning(channel,'native SD coefficient option',s=>s.ui.elements.some(e=>e.tid?.startsWith(owner+';boundlist;')&&e.label===label&&e.allowed_actions.includes('click')));
   await channel.perform({condition:'choose requested SD coefficient',initialObservation:s,ready:binningReady,identity:()=>field,
    resolve:s=>({verb:'click',ref:one(s,e=>e.tid?.startsWith(owner+';boundlist;')&&e.label===label&&e.allowed_actions.includes('click'),'requested SD option required').ref})});
   s=await observeBinning(channel,'requested SD coefficient readback');
  }
  if(wanted.method==='frequency'&&s.node_binning.settings.ties!==(wanted.ties??'next')){
   const label=wanted.ties==='current'?'Сохранять в текущем':'Добавлять в следующий';
   const owner=s.node_binning.frame.controls['cbbMatchingObservationsMode;ValueControl'];
   await channel.perform({condition:'open owned binning tie policy picker',initialObservation:s,ready:binningReady,identity:()=>field,
    resolve:s=>({verb:'click',ref:one(s,e=>e.tid===owner+';trg_picker'&&e.allowed_actions.includes('click'),'owned tie policy picker trigger required').ref})});
   s=await observeBinning(channel,'native tie policy option',s=>s.ui.elements.some(e=>e.tid?.startsWith(owner+';boundlist;')&&e.label===label&&e.allowed_actions.includes('click')));
   await channel.perform({condition:'choose requested tie policy',initialObservation:s,ready:binningReady,identity:()=>field,resolve:s=>({verb:'click',ref:one(s,e=>e.tid?.startsWith(owner+';boundlist;')&&e.label===label&&e.allowed_actions.includes('click'),'requested tie option required').ref})});
   s=await observeBinning(channel,'requested tie policy readback');
  }
 }
 const c=s.node_binning,q=c.settings;
 need(q&&['count','width','frequency','sd'].includes(q.method)&&!q.rounding&&c.frame.switches.length===0,'supported fixed nonrounded settings required');
 need(q.method==='sd'?field.type!=='datetime'&&q.size===null&&[1,2,3].includes(q.sd_coefficient)&&q.lower_open&&q.upper_open:Number.isFinite(q.size)&&q.size>0&&!q.lower_open&&!q.upper_open,'valid size and closed ends, or numeric SD with both open tails required');
 need(q.method==='frequency'?['next','current'].includes(q.ties)&&q.sums===false:q.method==='sd'?q.limits===null:q.strict_lower&&q.strict_upper&&Array.isArray(q.limits)&&q.limits.every(v=>field.type==='datetime'?typeof v==='string':Number.isFinite(v))&&q.limits[0]<q.limits[1]||!q.strict_lower&&!q.strict_upper&&q.limits===null&&field.type!=='datetime','explicit typed limits, numeric automatic limits, SD or row-frequency policy required');
 if(!applying&&!manual)need(q.method===wanted.method&&q.size===(wanted.size??null)&&same(q.limits,wanted.limits??null)&&(q.method!=='frequency'||q.ties===(wanted.ties??'next'))&&(q.method!=='sd'||q.sd_coefficient===wanted.sd_coefficient),'final settings differ');
 need(c.fields.filter(f=>f.method_code!==0).length===1,'only one binned field allowed');
 const configuration={...c,mode:request.mode,field:field.name,type:field.type,method:q.method,size:q.size,limits:q.limits,sd_coefficient:q.sd_coefficient??null,
  fields:fields.map(({name,label,type,data_kind})=>({name,label,type,data_kind})),rounding:false,open_ends:q.method==='sd',ties:q.method==='frequency'?q.ties:null,...(manual?{manual_edits:true}:{})};
 if(applying){
  if(c.state!=='materialized'||!c.intervals.length){
   const closed=await closePreparedWizard(channel);throw binningApplyRefusal('saved intervals are absent; use internal to train current input',closed,'configure');
  }
  return {verified:true,cleanup_complete:true,effect_possible:false,configuration,settings_applied:false};
 }
 const next=async(stage,destination)=>{
  await channel.perform({condition:'accept binning '+stage,ready:s=>s.wizard?.stage===stage,identity:s=>s.prepared_node_context,
   resolve:s=>({verb:'wizard_step',ref:one(s,e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'),'binning Next required').ref,expected_stage:destination})});
  return channel.observe({condition:'binning '+destination+' ready',ready:s=>s.wizard?.stage===destination});
 };
 await next('binning','output_mapping');await next('output_mapping','binning_ranges_mapping');
 const done=await next('binning_ranges_mapping','done');
 return {verified:true,cleanup_complete:true,effect_possible:true,configuration:manual?configuration:{...configuration,state:'settings',intervals:[]},validation:{status:'accepted_by_loginom_next',node_context:done.prepared_node_context}};
}
export function binningApplyRefusal(message,closed,phase){
 const error=Error('Binning apply: '+message+'; no settings changed and no training requested');
 error.nodePhaseRefusal={phase,status:'FAILED',effect_possible:true,cleanup_complete:true,settings_unchanged:true,verification:'binning_apply_preserved',proof:{closed}};
 return error;
}
