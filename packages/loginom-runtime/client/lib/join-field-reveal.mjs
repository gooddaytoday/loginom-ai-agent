const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stable=c=>({input_fields:c.input_fields,keys:c.keys,mode:c.mode,case_sensitive:c.case_sensitive,
 include_joined_keys:c.include_joined_keys,node_context:c.node_context});

// Scroll only a rendered cell belonging to the requested native Join grid.
// Each scroll has its own receipt; keys and schemas must remain unchanged.
export async function revealJoinField(channel,state,name,side,verb){
 const before=stable(state.node_join),fields=state.node_join.input_fields[side==='left'?0:1];
 const target=fields.findIndex(f=>f.name===name);need(target>=0,'Join field disappeared');
 const bound=e=>{const f=e.signature?.join_field;
  return f?.side===side&&f.wizard_root_ref===state.wizard.root_ref
   &&fields.some(s=>s.name===f.field_key&&s.record_id===f.record_id);};
 const ready=s=>s.wizard?.stage==='join'&&s.wizard.root_ref===state.wizard.root_ref&&s.node_join?.verified===true;
 let s=state;
 for(let attempt=0;attempt<130;attempt++){
  need(same(before,stable(s.node_join)),'Join settings changed while revealing a field');
  if(s.ui.elements.some(e=>bound(e)&&e.signature.join_field.field_key===name&&e.allowed_actions.includes(verb)))return s;
  const order=e=>fields.findIndex(f=>f.name===e.signature.join_field.field_key);
  const anchors=s.ui.elements.filter(e=>bound(e)&&e.scroll?.ref===e.signature.join_field.grid_ref&&e.allowed_actions.includes('scroll')).sort((a,b)=>order(a)-order(b));
  need(anchors.length&&attempt<129,'Join field cannot be revealed: '+name);
  const direction=target<order(anchors[0])?-1:target>order(anchors.at(-1))?1:0;
  need(direction!==0,'Join field is obscured: '+name);
  const anchor=anchors[Math.floor(anchors.length/2)],scroll=anchor.scroll;
  await channel.perform({condition:'reveal join '+side+' field',initialObservation:s,ready,
   identity:()=>({side,field:fields[target],scroll_owner:scroll.ref}),
   resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:direction*400})});
  s=await channel.observe({condition:'join field scroll applied',readJoin:true,ready});
  const after=s.ui.elements.find(e=>bound(e)&&e.scroll?.ref===scroll.ref)?.scroll;
  need(after&&direction*(after.top-scroll.top)>0,'Join grid did not scroll');
 }
 throw Error('Join field scroll budget exceeded');
}
