import {resolveUnionTables} from './union-parameters.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Generic gestures recheck the box centre. A quarter-point exposed at a
// clipped cell edge is insufficient for either clicking or scrolling it.
const centered=e=>e.interaction?.state==='point_observed'&&e.bounding_box&&e.interaction.point
 &&Math.abs(e.interaction.point.x-e.bounding_box.x-e.bounding_box.width/2)<0.75
 &&Math.abs(e.interaction.point.y-e.bounding_box.y-e.bounding_box.height/2)<0.75;
export const unionReady=s=>s.wizard?.stage==='union'&&s.node_union?.verified===true;
const semantic=c=>({input_fields:c.input_fields,mappings:c.mappings,prefixes:c.prefixes,node_context:c.node_context});
const control=(s,tid,verb)=>{const es=s.ui.elements.filter(e=>e.tid===tid&&e.allowed_actions.includes(verb));need(es.length===1,'Union control unavailable: '+tid);return es[0];};
const cellTid=(s,port,name,part)=>s.wizard.root_tid+';UnionDataWizard;normalHeaderCt;'+(part==='check'?'chk':'col')+port+'_'+name;
export async function revealUnionChoice(channel,s,port,source){
 const before=semantic(s.node_union),editor=s.node_union.editor;
 need(editor?.port===port&&editor.choices_tid,'Owned union source editor required');
 const prefix=editor.choices_tid+';',tid=prefix+source;
 need(s.node_union.input_fields[port]?.some(f=>f.name===source),'Union source field disappeared');
 for(let attempt=0;attempt<150;attempt++){
  need(same(before,semantic(s.node_union)),'Union settings changed during choice scrolling');
  need(same(editor,s.node_union.editor),'Union source editor changed during scrolling');
  const options=s.ui.elements.filter(e=>e.tid===tid);need(options.length===1,'Exact union source option unavailable');
  const option=options[0];
  if(centered(option)&&option.allowed_actions.includes('click'))return s;
  const anchors=s.ui.elements.filter(e=>e.tid?.startsWith(prefix)&&centered(e)&&e.allowed_actions.includes('scroll')&&e.scroll?.ref===option.scroll?.ref);
  need(anchors.length,'Union source list scroll anchor unavailable');
  const anchor=anchors[Math.floor(anchors.length/2)],old=anchor.scroll;
  const delta=Math.max(-400,Math.min(400,option.bounding_box.y-anchor.bounding_box.y));need(delta,'Union source option is obscured');
  await channel.perform({condition:'reveal explicit union source',initialObservation:s,ready:unionReady,identity:()=>({port,source,scroll:old,configuration:before}),resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:delta})});
  s=await channel.observe({condition:'union source list scrolled',readUnion:true,ready:s=>unionReady(s)&&s.ui.elements.some(e=>e.tid?.startsWith(prefix)&&e.scroll?.ref===old.ref&&centered(e))});
  const after=s.ui.elements.find(e=>e.tid===tid&&e.scroll?.ref===old.ref)?.scroll;
  need(after&&delta*(after.top-old.top)>0,'Union source list did not scroll');
 }
 throw Error('Union source scroll budget exceeded');
}
export async function revealUnionField(channel,s,port,name,part){
 const before=semantic(s.node_union),fields=s.node_union.input_fields[0],index=fields.findIndex(f=>f.name===name);need(index>=0,'Union field disappeared');
 for(let attempt=0;attempt<150;attempt++){
  need(same(before,semantic(s.node_union)),'Union settings changed during scrolling');
  if(s.ui.elements.some(e=>e.tid===cellTid(s,port,name,part)&&centered(e)&&e.allowed_actions.includes('click')))return s;
  const candidates=s.ui.elements.filter(e=>e.signature?.union_field&&centered(e)&&e.allowed_actions.includes('click'));
  const indices=candidates.map(e=>fields.findIndex(f=>f.name===e.signature.union_field.field_key)),lo=Math.min(...indices),hi=Math.max(...indices);
  const vertical=index<lo?-1:index>hi?1:0;
  // Each joined input has two separately clipped columns. A visible checkbox
  // does not prove that its adjacent source editor is reachable (or vice versa).
  const column=f=>f.port*2+(f.part==='field'?1:0),targetColumn=column({port,part});
  const ps=candidates.map(e=>column(e.signature.union_field)),horizontal=targetColumn<Math.min(...ps)?-1:targetColumn>Math.max(...ps)?1:0;
  const direction=vertical||horizontal,verb=vertical?'scroll':'scroll_horizontal',prop=vertical?'scroll':'horizontal_scroll';
  const anchor=candidates.find(e=>e.allowed_actions.includes(verb)&&e[prop]);need(direction&&anchor,'Union field cannot be revealed');
  const old=anchor[prop];
  await channel.perform({condition:'reveal union mapping field',initialObservation:s,ready:unionReady,identity:()=>({port,name,part,scroll:old}),resolve:()=>({verb,ref:anchor.ref,...(vertical?{delta_y:direction*400}:{delta_x:direction*400})})});
  s=await channel.observe({condition:'union mapping scroll applied',readUnion:true,ready:s=>unionReady(s)&&s.ui.elements.some(e=>e.signature?.union_field&&centered(e)&&e.allowed_actions.includes('click'))});
  const after=s.ui.elements.find(e=>e.signature?.union_field&&e[prop]?.ref===old.ref)?.[prop];
  need(after&&direction*((vertical?after.top:after.left)-(vertical?old.top:old.left))>0,'Union grid did not scroll');
 }
 throw Error('Union scroll budget exceeded');
}
export async function configureUnion(channel,p,{request}){
 let s=await channel.observe({condition:'complete union settings',readUnion:true,ready:unionReady});
 if(request.finish==='close')return {verified:true,cleanup_complete:true,effect_possible:false,configuration:s.node_union,draft_edits_skipped:true};
 const wanted=resolveUnionTables(p,s.node_union.input_fields),changes=[];
 const click=async(tid,condition)=>{const old=s.node_union;await channel.perform({condition,initialObservation:s,ready:unionReady,identity:()=>semantic(old),resolve:s=>({verb:'click',ref:control(s,tid,'click').ref})});};
 const base=s.wizard.root_tid+';UnionDataWizard;';
 if(s.node_union.prefixes.enabled!==p.prefixes.enabled){
  const before=s.node_union;
  await channel.perform({condition:'set union prefix use',initialObservation:s,ready:unionReady,identity:()=>semantic(before),
   resolve:s=>({verb:'set_checked',ref:control(s,base+'cntUsePrefixes;cnt;chb;InputEl','set_checked').ref,checked:p.prefixes.enabled})});
  s=await channel.observe({condition:'union prefix flag applied',readUnion:true,ready:s=>unionReady(s)&&s.node_union.prefixes.enabled===p.prefixes.enabled});changes.push('prefix_use');
 }
 if(p.prefixes.enabled)for(const [key,tid] of [['name','pedNamePrefix'],['label','pedDisplayNamePrefix']]){
  if(s.node_union.prefixes[key]===p.prefixes[key])continue;
  const old=s.node_union;
  const inputs=s.ui.elements.filter(e=>e.allowed_actions.includes('fill')&&e.signature?.tag==='input'&&e.identity?.anchor_tid===base+tid+';ValueControl');
  need(inputs.length===1,'Union prefix editor unavailable');
  await channel.perform({condition:'edit union prefix '+key,initialObservation:s,ready:unionReady,identity:()=>semantic(old),resolve:()=>({verb:'fill',ref:inputs[0].ref,text:p.prefixes[key]})});
  s=await channel.observe({condition:'union prefix editor before blur',ready:s=>s.wizard?.stage==='union'});
  await channel.perform({condition:'commit union prefix '+key,initialObservation:s,ready:s=>s.wizard?.stage==='union',identity:()=>old.node_context,resolve:s=>{const inputs=s.ui.elements.filter(e=>e.allowed_actions.includes('press')&&e.signature?.tag==='input'&&e.identity?.anchor_tid===base+tid+';ValueControl');need(inputs.length===1,'Union prefix commit control unavailable');return {verb:'press',ref:inputs[0].ref,key:'Tab'};}});
  s=await channel.observe({condition:'union prefix value applied',readUnion:true,ready:s=>unionReady(s)&&s.node_union.prefixes[key]===p.prefixes[key]});changes.push('prefix_'+key);
 }
 // Remove obsolete pairs individually; retaining correct pairs prevents the
 // automatic first-compatible-field selection from changing unrelated rows.
 for(const table of wanted){
  const current=()=>s.node_union.mappings.find(m=>m.port===table.port);
  for(const obsolete of current().pairs.filter(k=>!table.pairs.some(p=>p.main===k.main&&p.source===k.source))){
   s=await revealUnionField(channel,s,table.port,obsolete.main,'check');const old=s.node_union;
   await click(cellTid(s,table.port,obsolete.main,'check'),'remove obsolete union mapping');
   s=await channel.observe({condition:'union pair removed',readUnion:true,ready:s=>unionReady(s)&&!s.node_union.mappings.find(m=>m.port===table.port).pairs.some(k=>k.main===obsolete.main)});
   need(same(old.input_fields,s.node_union.input_fields)&&same(old.prefixes,s.node_union.prefixes),'Union schema changed during mapping');changes.push({removed:obsolete,port:table.port});
  }
  for(const pair of table.pairs){
   if(current().pairs.some(k=>k.main===pair.main&&k.source===pair.source))continue;
   s=await revealUnionField(channel,s,table.port,pair.main,'check');
   await click(cellTid(s,table.port,pair.main,'check'),'enable union mapping');
   s=await channel.observe({condition:'union auto pair available',readUnion:true,ready:s=>unionReady(s)&&s.node_union.mappings.find(m=>m.port===table.port).pairs.some(k=>k.main===pair.main)});
   if(!current().pairs.some(k=>k.main===pair.main&&k.source===pair.source)){
    s=await revealUnionField(channel,s,table.port,pair.main,'field');await click(cellTid(s,table.port,pair.main,'field'),'open union field choices');
    s=await channel.observe({condition:'explicit union source choice',readUnion:true,ready:s=>unionReady(s)&&s.node_union.editor?.port===table.port&&s.node_union.editor.main===pair.main&&s.node_union.editor.choices_tid&&s.ui.elements.some(e=>e.tid===s.node_union.editor.choices_tid+';'+pair.source)});
    const option=s.node_union.editor.choices_tid+';'+pair.source;
    s=await revealUnionChoice(channel,s,table.port,pair.source);
    await click(option,'choose explicit union source');
    s=await channel.observe({condition:'explicit union pair applied',readUnion:true,ready:s=>unionReady(s)&&s.node_union.mappings.find(m=>m.port===table.port).pairs.some(k=>k.main===pair.main&&k.source===pair.source)});
   }changes.push({added:pair,port:table.port});
  }
 }
 const normalize=ms=>ms.map(m=>({port:m.port,pairs:m.pairs.map(({main,source})=>({main,source})).sort((a,b)=>a.main.localeCompare(b.main)),unmatched:[...m.unmatched].sort()}));
 need(same(normalize(wanted),normalize(s.node_union.mappings)),'Union final mapping differs');
 return {verified:true,cleanup_complete:true,effect_possible:changes.length>0,configuration:s.node_union,changes};
}
