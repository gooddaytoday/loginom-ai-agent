import {resolveSlidingWindowParameters,SLIDING_WINDOW_POLICIES} from './sliding-window-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error('Sliding window: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function configureSlidingWindow(channel,p,{inputMapping}){
 const ready=s=>s.wizard?.stage==='sliding_window'&&s.node_sliding_window?.verified===true;
 const observe=condition=>channel.observe({condition,readSlidingWindow:true,ready});
 let s=await observe('complete sliding window settings');const baseline=s.node_sliding_window;
 need(inputMapping?.verified&&inputMapping.inventory_complete,'verified input mapping required');
 need(same(baseline.fields.map(({name,label,type})=>({name,label,type})),inputMapping.target_fields.map(({name,label,type})=>({name,label,type}))),'window input schema differs');
 const expected=resolveSlidingWindowParameters(p,baseline.fields);
 const unique=(s,predicate)=>{const es=s.ui.elements.filter(predicate);need(es.length===1,'exact sliding window control unavailable');return es[0];};
 for(const field of expected){
  const original=baseline.fields.find(f=>f.name===field.name);
  if(original.history===field.history&&original.horizon===field.horizon)continue;
  let cell;
  for(let attempt=0;attempt<130;attempt++){
   cell=s.ui.elements.find(e=>e.tid===s.wizard.root_tid+';SlidingWindowWizard;colDisplayName_'+field.name&&e.allowed_actions.includes('double_click'));
   if(cell)break;
   const visible=s.ui.elements.filter(e=>e.tid?.startsWith(s.wizard.root_tid+';SlidingWindowWizard;colDisplayName_')&&e.scroll&&e.allowed_actions.includes('scroll'));
   need(visible.length&&attempt<129,'window field cannot be revealed');
   const first=baseline.fields.findIndex(f=>visible[0].tid.endsWith(';colDisplayName_'+f.name)),anchor=visible[Math.floor(visible.length/2)];
   await channel.perform({condition:'reveal window field',initialObservation:s,ready,identity:()=>original,resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:field.index<first?-350:350})});
   s=await observe('window fields scrolled');
  }
  await channel.perform({condition:'edit exact window field',initialObservation:s,ready,identity:()=>original,resolve:()=>({verb:'double_click',ref:cell.ref})});
  for(const [key,column] of [['history','colHistory_num'],['horizon','colForecast_num']]){
   const tid=s.wizard.root_tid+';SlidingWindowWizard;grdColumns;roweditor;'+column;
   const editorReady=s=>ready(s)&&s.ui.elements.some(e=>e.tid===tid&&e.allowed_actions.includes('fill'));
   s=await channel.observe({condition:'window row editor '+key,readSlidingWindow:true,ready:editorReady});
   await channel.perform({condition:'set window '+key,initialObservation:s,ready:editorReady,identity:()=>original,
    resolve:s=>({verb:'fill',ref:unique(s,e=>e.tid===tid&&e.allowed_actions.includes('fill')).ref,value:String(field[key])})});
  }
  const update=s.wizard.root_tid+';SlidingWindowWizard;grdColumns;roweditorbuttons;update';
  s=await channel.observe({condition:'window row ready to apply',readSlidingWindow:true,ready:s=>ready(s)&&s.ui.elements.some(e=>e.tid===update&&e.allowed_actions.includes('click'))});
  await channel.perform({condition:'apply window row once',initialObservation:s,ready,identity:()=>original,resolve:s=>({verb:'click',ref:unique(s,e=>e.tid===update&&e.allowed_actions.includes('click')).ref})});
  s=await channel.observe({condition:'exact window row readback',readSlidingWindow:true,ready:s=>ready(s)&&s.node_sliding_window.fields.some(f=>f.record_id===original.record_id&&f.history===field.history&&f.horizon===field.horizon)});
 }
 if(p.incomplete_records!==undefined&&s.node_sliding_window.incomplete_records!==p.incomplete_records){
  const base=s.wizard.root_tid+';SlidingWindowWizard;pedIncompleteRecordsProcessing;ValueControl';
  await channel.perform({condition:'open incomplete records policies',initialObservation:s,ready,identity:()=>baseline.node_context,
   resolve:s=>({verb:'click',ref:unique(s,e=>e.tid===base+';trg_picker'&&e.allowed_actions.includes('click')).ref})});
  const label=SLIDING_WINDOW_POLICIES[p.incomplete_records],tid=base+';boundlist;'+label.replace(/\s/g,'_');
  s=await channel.observe({condition:'exact incomplete records policy',readSlidingWindow:true,ready:s=>ready(s)&&s.ui.elements.some(e=>e.tid===tid&&e.allowed_actions.includes('click'))});
  await channel.perform({condition:'select incomplete records policy',initialObservation:s,ready,identity:()=>baseline.node_context,resolve:s=>({verb:'click',ref:unique(s,e=>e.tid===tid&&e.allowed_actions.includes('click')).ref})});
 }
 s=await observe('complete final sliding window settings');
 const configuration=s.node_sliding_window;
 need(same(configuration.fields,expected),'window settings changed outside requested rows');
 need(configuration.incomplete_records===(p.incomplete_records??baseline.incomplete_records),'incomplete records policy differs');
 return {verified:true,cleanup_complete:true,effect_possible:!same(configuration,baseline),configuration,before:baseline};
}
