import {resolveUngroupFields} from './ungroup-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error('Ungroup: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const ungroupReady=s=>s.wizard?.stage==='ungroup'&&s.node_ungroup?.verified===true&&s.node_ungroup.kind!=='seasonality';
export const ungroupSeasonalityReady=s=>s.wizard?.stage==='ungroup_seasonal'&&s.node_ungroup?.verified===true&&s.node_ungroup.kind==='seasonality';
const control=(s,suffix,verb)=>{const tid=suffix.startsWith('mn;')?suffix:s.wizard.root_tid+';'+suffix;
 const es=s.ui.elements.filter(e=>e.tid===tid&&e.allowed_actions.includes(verb));need(es.length===1,'control unavailable: '+suffix);return es[0];};
const field=(port,name,role=false)=>'UngroupDataWizard;col'+(port?'Support':'Ungroup')+(role?'UsageType':'')+'_'+name;
export function supportedUngroupConfiguration(c){
 need(c?.verified&&c.inventory_complete&&['shares','computed','seasonal'].includes(c.method),'saved method unsupported; only shares/computed/seasonal supported');
 const u=c.ungroup,order=u.order_fields??[[],[]];
 need(u.keys.length>0&&u.value_fields.length===1&&u.item_fields.length===1&&u.share_fields.length===1,'exactly one total, item and share role required');
 if(c.method!=='shares')need(u.rounding.format==='none'&&u.balance==='none',c.method+' rounding/balance unsupported');
 need(c.method==='seasonal'?order.every(o=>o.length===1):order.every(o=>o.length===0),'seasonal requires exactly one order field per input; other modes none');
 return {...u,value_field:u.value_fields[0],item_field:u.item_fields[0],share_field:u.share_fields[0],
  ...(c.method==='seasonal'?{total_order_field:order[0][0],support_order_field:order[1][0]}:{})};
}
export async function configureUngroup(channel,p,{request}){
 let s=await channel.observe({condition:'complete ungroup settings',readUngroup:true,ready:ungroupReady});
 if(request.finish==='close')return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_ungroup,draft_edits_skipped:true};
 const mode=request.mode??'shares';
 if(!p.ungroup){supportedUngroupConfiguration(s.node_ungroup);need(s.node_ungroup.method===mode,'saved method differs from requested mode');return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_ungroup,preserved:true};}
 const u=p.ungroup,season=p.seasonality;
 resolveUngroupFields(u,s.node_ungroup.input_fields,{requireKinds:false,seasonality:season});
 const initialFields=s.node_ungroup.input_fields.map(fs=>fs.map(({record_id,name,type,index})=>({record_id,name,type,index})));
 const stable=t=>ungroupReady(t)&&same(t.node_ungroup.input_fields.map(fs=>fs.map(({record_id,name,type,index})=>({record_id,name,type,index}))),initialFields);
 const changes=[];
 const choose=async(key,label,ready)=>{
  const base='UngroupDataWizard;'+key;
  await channel.perform({condition:'open ungroup '+key,initialObservation:s,ready:stable,identity:t=>t.node_ungroup,
   resolve:t=>({verb:'click',ref:control(t,base+';trg_picker','click').ref})});
  s=await channel.observe({condition:'ungroup option visible',readUngroup:true,ready:t=>stable(t)&&t.ui.elements.some(e=>e.tid===t.wizard.root_tid+';'+base+';boundlist;'+label)});
  await channel.perform({condition:'choose ungroup '+key,initialObservation:s,ready:stable,identity:t=>t.node_ungroup,
   resolve:t=>({verb:'click',ref:control(t,base+';boundlist;'+label,'click').ref})});
  s=await channel.observe({condition:'ungroup option applied',readUngroup:true,ready:t=>stable(t)&&ready(t.node_ungroup)});changes.push(key);
 };
 const method=()=>choose('pedUngroupMethod;ValueControl',{shares:'По_заданным_долям',computed:'С_расчетом_долей_по_всей_выборке',seasonal:'С_учётом_временных_колебаний_и_сезонности_опорных_данных'}[mode],c=>c.method===mode);
 // Native seasonal disables balancing: commit rounding/balance first.
 if(mode!=='seasonal'&&s.node_ungroup.method!==mode)await method();
 if(s.node_ungroup.ungroup.rounding.format!==u.rounding.format)await choose('pedRoundFormat;ValueControl',{
  none:'Не_округлять',precision:'Округлять_до_заданной_точности',multiple:'Округлять_до_кратного_целому'}[u.rounding.format],c=>c.ungroup.rounding.format===u.rounding.format);
 if(u.rounding.format!=='none'&&s.node_ungroup.ungroup.rounding.value!==u.rounding.value){
  const find=t=>{const tid=t.wizard.root_tid+';UngroupDataWizard;pedRoundParam;ValueControl';const es=t.ui.elements.filter(e=>e.identity?.anchor_tid===tid&&e.allowed_actions.includes('fill'));need(es.length===1,'round parameter input unavailable');return es[0];};
  const binding=s.prepared_node_context,root=s.wizard.root_tid,editor=find(s).identity,text=String(u.rounding.value);
  need(binding?.verified,'rounding editor owner unavailable');
  const draftReady=t=>t.wizard?.stage==='ungroup'&&t.wizard.root_tid===root&&same(t.prepared_node_context,binding)
   &&t.ui.elements.filter(e=>same(e.identity,editor)&&e.value===text&&e.allowed_actions.includes('fill')&&e.allowed_actions.includes('press')).length===1;
  await channel.perform({condition:'set ungroup rounding value',initialObservation:s,ready:stable,identity:t=>t.node_ungroup,resolve:t=>({verb:'fill',ref:find(t).ref,text:String(u.rounding.value)})});
  // The cached property proof is intentionally invalid between typing and blur.
  // Commit only the same observed editor; recheck every native setting afterward.
  s=await channel.observe({condition:'rounding value editor',readUngroup:false,ready:draftReady});
  await channel.perform({condition:'commit ungroup rounding value',initialObservation:s,ready:draftReady,identity:t=>t.prepared_node_context,resolve:t=>({verb:'press',ref:find(t).ref,key:'Tab'})});
  s=await channel.observe({condition:'rounding value committed',readUngroup:true,ready:t=>stable(t)&&t.node_ungroup.ungroup.rounding.value===u.rounding.value});changes.push('rounding.value');
 }
 if(s.node_ungroup.ungroup.balance!==u.balance)await choose('pedBalanceMethod;ValueControl',{
  none:'Нет_балансировки',last:'Все_последнему',proportional:'Пропорционально',equal:'Равномерно'}[u.balance],c=>c.ungroup.balance===u.balance);
 if(mode==='seasonal'&&s.node_ungroup.method!==mode)await method();
 for(const obsolete of s.node_ungroup.ungroup.keys.filter(k=>!u.keys.some(w=>same(k,w)))){
  await channel.perform({condition:'select obsolete ungroup link',initialObservation:s,ready:stable,identity:t=>t.node_ungroup,
   resolve:t=>({verb:'right_click',ref:control(t,field(0,obsolete.total),'right_click').ref})});
  s=await channel.observe({condition:'ungroup link menu',readUngroup:true,ready:t=>stable(t)&&t.ui.elements.some(e=>e.tid==='mn;btnRemoveSelectedLinks')});
  await channel.perform({condition:'remove obsolete ungroup link',initialObservation:s,ready:stable,identity:t=>t.node_ungroup,
   resolve:t=>({verb:'click',ref:control(t,'mn;btnRemoveSelectedLinks','click').ref})});
  s=await channel.observe({condition:'ungroup link removed',readUngroup:true,ready:t=>stable(t)&&!t.node_ungroup.ungroup.keys.some(k=>same(k,obsolete))});changes.push({removed:obsolete});
 }
 for(const key of u.keys){
  if(s.node_ungroup.ungroup.keys.some(k=>same(k,key)))continue;
  await channel.perform({condition:'connect ungroup group fields',initialObservation:s,ready:stable,identity:t=>t.node_ungroup,
   resolve:t=>({verb:'drag',source_ref:control(t,field(0,key.total),'drag').ref,target_ref:control(t,field(1,key.support),'drag').ref})});
  s=await channel.observe({condition:'ungroup group link applied',readUngroup:true,ready:t=>stable(t)&&t.node_ungroup.ungroup.keys.some(k=>same(k,key))});changes.push({added:key});
 }
 for(const port of [0,1])for(const f of s.node_ungroup.input_fields[port]){
  if(u.keys.some(k=>k[port?'support':'total']===f.name))continue;
  // Native «Порядковое поле» is utTransaction (8); offered only for seasonal.
  const desired=season&&f.name===season[port?'support_order_field':'total_order_field']?8:port?(f.name===u.item_field?4:f.name===u.share_field?9:0):(f.name===u.value_field?7:0);
  if(s.node_ungroup.input_fields[port].find(a=>a.name===f.name).usage===desired)continue;
  await channel.perform({condition:'edit ungroup field role',initialObservation:s,ready:stable,identity:t=>t.node_ungroup,
   resolve:t=>({verb:'double_click',ref:control(t,field(port,f.name,true),'double_click').ref})});
  const editor='grd'+(port?'Support':'Ungroup')+'Columns;tbl;celleditor;cbx';
  s=await channel.observe({condition:'ungroup role editor',readUngroup:true,ready:t=>stable(t)&&t.node_ungroup.selected_records[port].includes(f.record_id)
   &&t.ui.elements.some(e=>e.tid===t.wizard.root_tid+';UngroupDataWizard;'+editor+';trg_picker')});
  await choose(editor,{0:'Не_задано',4:'Поле_с_наименованиями',7:'Разгруппируемое',8:'Порядковое_поле',9:'Поле_с_долями'}[desired],()=>true);
  // Enter commits the native cell editor. Use its observed input, never a UI setter.
  const editors=s.ui.elements.filter(e=>e.allowed_actions.includes('press')&&e.tid===s.wizard.root_tid+';UngroupDataWizard;'+editor+';trg_picker');
  if(editors.length===1){await channel.perform({condition:'commit ungroup role',initialObservation:s,ready:stable,identity:t=>t.node_ungroup,
   resolve:t=>({verb:'press',ref:control(t,'UngroupDataWizard;'+editor+';trg_picker','press').ref,key:'Enter'})});
   s=await channel.observe({condition:'ungroup role committed',readUngroup:true,ready:t=>stable(t)&&t.node_ungroup.input_fields[port].find(a=>a.name===f.name).usage===desired});}
 }
 const c=supportedUngroupConfiguration(s.node_ungroup);
 need(s.node_ungroup.method===mode&&same(c.keys,u.keys)&&c.value_field===u.value_field&&c.item_field===u.item_field&&c.share_field===u.share_field&&same(c.rounding,u.rounding)&&c.balance===u.balance
  &&(!season||c.total_order_field===season.total_order_field&&c.support_order_field===season.support_order_field),'configuration differs');
 return {verified:true,cleanup_complete:true,effect_possible:changes.length>0,configuration:s.node_ungroup,changes};
}
const SEASONAL_KEYS={period:'pedSeasonalityPeriod',multiplier:'pedSeasonalityMultiplier',index_count:'pedNumSeasonalIndexes',rare_density:'pedMaxRareDensity',
 absent_periods:'pedAbsentPeriodFraction',novelty_periods:'pedNoveltyPeriodFraction',max_history_periods:'pedMaxDepthPeriodFraction'};
const PERIODS={year:0};
export const ungroupSeasonality=v=>({period:Object.keys(PERIODS).find(k=>PERIODS[k]===v.pedSeasonalityPeriod)??null,
 ...Object.fromEntries(Object.entries(SEASONAL_KEYS).filter(([k])=>k!=='period').map(([k,key])=>[k,v[key]]))});
// Seasonality page of the same wizard. Without requested values (existing
// node, parameters:{}) it is only observed; the saved values stay unchanged.
export async function configureUngroupSeasonality(channel,season){
 let s=await channel.observe({condition:'ungroup seasonality page',readUngroup:true,ready:ungroupSeasonalityReady});
 const root=s.wizard.root_tid,binding=s.prepared_node_context,changes=[],tid=key=>root+';UngroupDataWizard-1;'+key+';ValueControl';
 need(binding?.verified,'seasonality page owner unavailable');
 const stable=t=>ungroupSeasonalityReady(t)&&t.wizard.root_tid===root&&same(t.prepared_node_context,binding);
 if(season){
  if(s.node_ungroup.values.pedSeasonalityPeriod!==PERIODS[season.period]){
   need(!s.node_ungroup.disabled.pedSeasonalityPeriod,'seasonality period disabled');
   await channel.perform({condition:'open seasonality period',initialObservation:s,ready:stable,identity:t=>t.prepared_node_context,resolve:t=>({verb:'click',ref:control(t,'UngroupDataWizard-1;pedSeasonalityPeriod;ValueControl;trg_picker','click').ref})});
   s=await channel.observe({condition:'seasonality period option',readUngroup:true,ready:t=>stable(t)&&t.ui.elements.some(e=>e.tid===tid('pedSeasonalityPeriod')+';boundlist;Год')});
   await channel.perform({condition:'choose seasonality period',initialObservation:s,ready:stable,identity:t=>t.prepared_node_context,resolve:t=>({verb:'click',ref:control(t,'UngroupDataWizard-1;pedSeasonalityPeriod;ValueControl;boundlist;Год','click').ref})});
   s=await channel.observe({condition:'seasonality period applied',readUngroup:true,ready:t=>stable(t)&&t.node_ungroup.values.pedSeasonalityPeriod===PERIODS[season.period]});changes.push('period');
  }
  for(const [name,key] of Object.entries(SEASONAL_KEYS)){
   if(name==='period'||s.node_ungroup.values[key]===season[name])continue;
   need(!s.node_ungroup.disabled[key],'seasonality setting disabled: '+name);
   const find=t=>{const es=t.ui.elements.filter(e=>e.identity?.anchor_tid===tid(key)&&e.allowed_actions.includes('fill'));need(es.length===1,'seasonality input unavailable: '+name);return es[0];};
   const editor=find(s).identity,text=String(season[name]);
   const draftReady=t=>t.wizard?.stage==='ungroup_seasonal'&&t.wizard.root_tid===root&&same(t.prepared_node_context,binding)
    &&t.ui.elements.filter(e=>same(e.identity,editor)&&e.value===text&&e.allowed_actions.includes('fill')&&e.allowed_actions.includes('press')).length===1;
   await channel.perform({condition:'set seasonality '+name,initialObservation:s,ready:stable,identity:t=>t.prepared_node_context,resolve:t=>({verb:'fill',ref:find(t).ref,text})});
   s=await channel.observe({condition:'seasonality editor '+name,readUngroup:false,ready:draftReady});
   await channel.perform({condition:'commit seasonality '+name,initialObservation:s,ready:draftReady,identity:t=>t.prepared_node_context,resolve:t=>({verb:'press',ref:find(t).ref,key:'Tab'})});
   s=await channel.observe({condition:'seasonality '+name+' committed',readUngroup:true,ready:t=>stable(t)&&t.node_ungroup.values[key]===season[name]});changes.push(name);
  }
 }
 const seasonality=ungroupSeasonality(s.node_ungroup.values);
 if(season)need(Object.keys(SEASONAL_KEYS).every(k=>seasonality[k]===season[k]),'seasonality differs');
 else need(seasonality.period!==null,'saved seasonality period unsupported; only year');
 return {verified:true,cleanup_complete:true,effect_possible:changes.length>0,seasonality,observation:s.node_ungroup,changes};
}
