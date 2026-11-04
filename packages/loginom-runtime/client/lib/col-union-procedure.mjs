import {resolveColUnionParameters,validateColUnionSchemas} from './col-union-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error('ColUnion: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const colUnionReady=s=>s.wizard?.stage==='col_union'&&s.node_col_union?.verified===true;
export async function configureColUnion(channel,p,{request,inputMappings}){
 const observe=condition=>channel.observe({condition,readColUnion:true,ready:colUnionReady});
 let s=await observe('complete positional union settings');const before=s.node_col_union;
 if(request.finish==='close')return {verified:true,cleanup_complete:true,effect_possible:false,configuration:before,draft_edits_skipped:true};
 need(before.binding_ready,'saved determining input is not configured');
 need(inputMappings?.length===2&&inputMappings.every((m,port)=>m.port===port&&m.native_mapping?.verified
  &&m.native_mapping.node_context?.input_port?.port_guid===before.sources[port].port_guid),'both input port identities required');
 const input_fields=inputMappings.map(m=>m.native_mapping.target_fields);
 validateColUnionSchemas(request,input_fields);
 const wanted=resolveColUnionParameters(p,before.settings),changes=[];
 const one=(s,predicate)=>{const es=s.ui.elements.filter(predicate);need(es.length===1,'exact control unavailable');return es[0];};
 const labels={padding:{null:'Не дополнять',repeat:'Повторять набор данных',last:'Дополнять последней строчкой'},row_count:{minimum:'Минимальному набору',maximum:'Максимальному набору',input:'Определяется набором'}};
 for(const key of ['padding','row_count']){
  if(s.node_col_union.settings[key]===wanted[key])continue;
  const identity=()=>({node:before.node_context,sources:before.sources,settings:s.node_col_union.settings});
  await channel.perform({condition:'open positional union '+key,initialObservation:s,ready:colUnionReady,identity,
   resolve:s=>({verb:'click',ref:one(s,e=>e.wizard_combo?.kind==='picker'&&e.wizard_combo.field.scope==='col_union'&&e.wizard_combo.field.name===key&&e.allowed_actions.includes('click')).ref})});
  s=await channel.observe({condition:'positional union '+key+' choice',readColUnion:true,ready:s=>colUnionReady(s)&&s.ui.elements.some(e=>e.wizard_combo?.kind==='option'&&e.wizard_combo.field.name===key&&e.wizard_combo.label===labels[key][wanted[key]])});
  await channel.perform({condition:'select positional union '+key,initialObservation:s,ready:colUnionReady,identity,
   resolve:s=>({verb:'select_wizard_option',ref:one(s,e=>e.wizard_combo?.kind==='option'&&e.wizard_combo.field.scope==='col_union'&&e.wizard_combo.field.name===key&&e.wizard_combo.label===labels[key][wanted[key]]&&e.allowed_actions.includes('select_wizard_option')).ref})});
  s=await channel.observe({condition:'positional union '+key+' applied',readColUnion:true,ready:s=>colUnionReady(s)&&s.node_col_union.settings[key]===wanted[key]});changes.push(key);
  need(same(s.node_col_union.sources,before.sources),'input identities changed');
 }
 if(wanted.row_count==='input'&&s.node_col_union.settings.determining_input!==wanted.determining_input){
  const index=wanted.determining_input==='main'?0:1,tid=s.wizard.root_tid+';ColUnionDataWizard;colDisplayText_'+index;
  await channel.perform({condition:'select determining input by verified port GUID',initialObservation:s,ready:colUnionReady,identity:()=>({node:before.node_context,source:before.sources[index]}),
   resolve:s=>({verb:'click',ref:one(s,e=>e.tid===tid&&e.allowed_actions.includes('click')).ref})});
  s=await channel.observe({condition:'determining input applied',readColUnion:true,ready:s=>colUnionReady(s)&&s.node_col_union.binding_ready&&s.node_col_union.settings.determining_input===wanted.determining_input});changes.push('determining_input');
 }
 need(same(s.node_col_union.sources,before.sources)&&s.node_col_union.binding_ready&&same(s.node_col_union.settings,wanted),'final positional settings differ');
 return {verified:true,cleanup_complete:true,effect_possible:changes.length>0,configuration:{...s.node_col_union,input_fields},changes};
}
