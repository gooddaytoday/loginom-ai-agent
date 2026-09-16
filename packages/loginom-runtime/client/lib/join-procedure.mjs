import {resolveJoinKeys} from './join-parameters.mjs';
import {revealJoinField} from './join-field-reveal.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const pairs=keys=>keys.map(k=>[k.left,k.right]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
export const joinReady=s=>s.wizard?.stage==='join'&&s.node_join?.verified===true;
const control=(s,suffix,verb)=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';JoinDataWizard;'+suffix&&e.allowed_actions.includes(verb));need(es.length===1,'Join control unavailable: '+suffix);return es[0];};
const semantic=c=>({input_fields:c.input_fields,keys:pairs(c.keys),mode:c.mode,case_sensitive:c.case_sensitive,include_joined_keys:c.include_joined_keys,node_context:c.node_context});
export async function configureJoin(channel,p,{request}){
 let s=await channel.observe({condition:'complete join settings',readJoin:true,ready:joinReady}),before=s.node_join;
 if(request.finish==='close')return {verified:true,cleanup_complete:true,effect_possible:false,configuration:before,draft_edits_skipped:true};
 if(!p.keys){need(before.mode===request.mode,'Preserved join mode differs from requested mode');need(before.keys.length>0,'Preserved join has no keys');return {verified:true,cleanup_complete:true,effect_possible:false,configuration:before,keys:before.keys.map(({left,right})=>({left,right})),preserved:true};}
 resolveJoinKeys(p,before.input_fields);
 const changes=[];
 if(before.mode!==request.mode){
  await channel.perform({condition:'open join mode choices',initialObservation:s,ready:joinReady,identity:()=>semantic(before),resolve:s=>({verb:'click',ref:control(s,'pedJoinType;ValueControl;trg_picker','click').ref})});
  const label=request.mode==='inner'?'Внутреннее_соединение':'Левое_соединение';
  s=await channel.observe({condition:'join mode choice visible',readJoin:true,ready:s=>joinReady(s)&&s.ui.elements.some(e=>e.tid===s.wizard.root_tid+';JoinDataWizard;pedJoinType;ValueControl;boundlist;'+label)});
  await channel.perform({condition:'choose requested join mode',initialObservation:s,ready:joinReady,identity:()=>semantic(before),resolve:s=>({verb:'click',ref:control(s,'pedJoinType;ValueControl;boundlist;'+label,'click').ref})});
  s=await channel.observe({condition:'join mode applied',readJoin:true,ready:s=>joinReady(s)&&s.node_join.mode===request.mode});changes.push('mode');
  need(same({...semantic(before),mode:request.mode},semantic(s.node_join)),'Join mode changed unrelated settings');
 }
 for(const [key,tid] of [['case_sensitive','chbCaseSensitive'],['include_joined_keys','chbIncludeJoinedKeyFields']]){
  const old=s.node_join;if(old[key]===p[key])continue;
  await channel.perform({condition:'set join '+key,initialObservation:s,ready:joinReady,identity:()=>semantic(old),resolve:s=>({verb:'click',ref:control(s,tid+';ValueControl;DisplayEl','click').ref})});
  s=await channel.observe({condition:'join '+key+' applied',readJoin:true,ready:s=>joinReady(s)&&s.node_join[key]===p[key]});
  need(same({...semantic(old),[key]:p[key]},semantic(s.node_join)),'Join option changed unrelated settings');changes.push(key);
 }
 for(const obsolete of s.node_join.keys.filter(k=>!p.keys.some(w=>w.left===k.left&&w.right===k.right))){
  s=await revealJoinField(channel,s,obsolete.left,'left','right_click');
  const old=s.node_join;
  await channel.perform({condition:'select obsolete join link',initialObservation:s,ready:joinReady,identity:()=>({settings:semantic(old),obsolete}),resolve:s=>({verb:'right_click',ref:control(s,'colSourceName_'+obsolete.left,'right_click').ref})});
  s=await channel.observe({condition:'join link removal menu',readJoin:true,ready:s=>joinReady(s)&&same(s.node_join.selected_left,[obsolete.left])&&s.ui.elements.some(e=>e.tid==='mn;btnRemoveSelectedLinks'&&e.allowed_actions.includes('click'))});
  await channel.perform({condition:'remove obsolete join key pair',initialObservation:s,ready:s=>joinReady(s)&&same(s.node_join.selected_left,[obsolete.left]),identity:()=>({settings:semantic(old),obsolete}),resolve:s=>{const es=s.ui.elements.filter(e=>e.tid==='mn;btnRemoveSelectedLinks'&&e.allowed_actions.includes('click'));need(es.length===1,'Join remove command ambiguous');return {verb:'click',ref:es[0].ref};}});
  const expected=old.keys.filter(k=>k.left!==obsolete.left);
  s=await channel.observe({condition:'exact join link removed',readJoin:true,ready:s=>joinReady(s)&&same(pairs(s.node_join.keys),pairs(expected))});
  need(same({...semantic(old),keys:pairs(expected)},semantic(s.node_join)),'Removing join key changed unrelated settings');changes.push({removed:obsolete});
 }
 for(const key of p.keys){
  if(s.node_join.keys.some(k=>k.left===key.left&&k.right===key.right))continue;
  s=await revealJoinField(channel,s,key.left,'left','drag');
  s=await revealJoinField(channel,s,key.right,'right','drag');
  const old=s.node_join;
  await channel.perform({condition:'connect join key fields',initialObservation:s,ready:joinReady,identity:()=>({settings:semantic(old),key}),resolve:s=>({verb:'drag',source_ref:control(s,'colSourceName_'+key.left,'drag').ref,target_ref:control(s,'colDisplayName_'+key.right,'drag').ref})});
  const expected=[...old.keys,key];
  s=await channel.observe({condition:'exact join key pair connected',readJoin:true,ready:s=>joinReady(s)&&same(pairs(s.node_join.keys),pairs(expected))});
  need(same({...semantic(old),keys:pairs(expected)},semantic(s.node_join)),'Connecting join key changed unrelated settings');changes.push({added:key});
 }
 need(s.node_join.mode===request.mode&&s.node_join.case_sensitive===p.case_sensitive&&s.node_join.include_joined_keys===p.include_joined_keys&&same(pairs(s.node_join.keys),pairs(p.keys)),'Join configuration differs');
 return {verified:true,cleanup_complete:true,effect_possible:changes.length>0,configuration:s.node_join,keys:structuredClone(p.keys),changes};
}
