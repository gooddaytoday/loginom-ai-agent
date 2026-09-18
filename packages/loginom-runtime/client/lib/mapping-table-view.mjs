const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const need=(v,m)=>{if(!v)throw Error(m);};
const checked=e=>e?.signature?.check_state?.kind==='radio'&&e.signature.check_state.source==='loginom_ext'
 ?e.signature.check_state.checked:null;
export function mappingLinksView(state){
 const prefix=state.wizard?.root_tid+';';
 const links=(state.ui?.elements??[]).filter(e=>e.tid?.startsWith(prefix)&&e.tid.endsWith(';rbLinks;DisplayEl'));
 return ['output_mapping','input_mapping'].includes(state.wizard?.stage)&&links.length===1&&checked(links[0])===true;
}

// The view switch is technical UI state. Preserve the complete native mapping
// and its owner; never infer that a missing table means missing output fields.
export async function ensureMappingTableView(channel,initial){
 const before=initial.node_mapping,root=initial.wizard?.root_ref;
 const base=initial.wizard?.root_tid+';'+before?.mapping_wizard+';';
 const radios=(s,key)=>s.ui.elements.filter(e=>e.tid===base+key+';DisplayEl');
 const table=radios(initial,'rbTable'),links=radios(initial,'rbLinks');
 if(table.length===0&&links.length===0)return initial;
 const bound=s=>s.wizard?.root_ref===root&&s.wizard?.root_tid===initial.wizard.root_tid&&s.wizard?.stage===initial.wizard.stage
  &&s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true&&s.node_mapping.source_identity_verified===true
  &&same(s.node_mapping.node_context,before.node_context);
 need(before?.verified===true&&before.inventory_complete===true&&before.source_identity_verified===true
  &&table.length===1&&links.length===1&&bound(initial),'Owned complete mapping required to select table view');
 if(checked(table[0])===true&&checked(links[0])===false)return initial;
 need(checked(table[0])===false&&checked(links[0])===true,'Mapping view selection is ambiguous');
 const unchanged=s=>bound(s)&&['mapping_wizard','autosync','produce_mode','source_fields','target_fields'].every(k=>same(s.node_mapping[k],before[k]));
 const linksSelected=s=>radios(s,'rbTable').length===1&&radios(s,'rbLinks').length===1
  &&checked(radios(s,'rbTable')[0])===false&&checked(radios(s,'rbLinks')[0])===true;
 await channel.perform({condition:'show the owned mapping table',initialObservation:initial,ready:s=>unchanged(s)&&linksSelected(s),
  identity:()=>before.node_context,resolve:s=>{
   const controls=radios(s,'rbTable');
   need(controls.length===1&&controls[0].allowed_actions.includes('click'),'Mapping table control unavailable');
   return {verb:'click',ref:controls[0].ref};
  }});
 return channel.observe({condition:'mapping table selected with unchanged fields',readMappings:true,
  ready:s=>unchanged(s)&&radios(s,'rbTable').length===1&&radios(s,'rbLinks').length===1
   &&checked(radios(s,'rbTable')[0])===true&&checked(radios(s,'rbLinks')[0])===false});
}
