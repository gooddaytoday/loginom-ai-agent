// Fetch populates only this wizard's cache. It is neither a port commit nor
// proof that source identities were persisted in the package.
export async function readCalculatorOutputMapping(channel) {
 const need=(value,message)=>{if(!value)throw Error('Calculator output source: '+message);};
 let state=await channel.observe({condition:'calculator output source controls',ready:s=>
  s.wizard?.stage==='output_mapping'&&s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='wizard'});
 const root=state.wizard.root_ref,tid=state.wizard.root_tid,node=state.prepared_node_context;
 need(typeof root==='string'&&typeof tid==='string','wizard identity unavailable');
 const bound=s=>s.wizard?.stage==='output_mapping'&&s.wizard.root_ref===root&&s.wizard.root_tid===tid
  &&s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='wizard'
  &&['document_id','workflow_id','node_id'].every(k=>typeof node[k]==='string'&&s.prepared_node_context[k]===node[k]);
 const controls=(s,key)=>(s.ui?.elements??[]).filter(e=>e.tid===tid+';DerivedDataSourceOutputSocketWizard;'+key);
 const fetchVisible=s=>controls(s,'btnGetSourceColumns').some(e=>e.visible===true);
 if(!fetchVisible(state)) {
  const links=s=>controls(s,'rbLinks;DisplayEl').filter(e=>e.check_state?.checked===false&&e.allowed_actions?.includes('click'));
  need(links(state).length===1,'links control unavailable');
  await channel.perform({condition:'show calculator output sources once',initialObservation:state,ready:bound,
   identity:()=>({root}),resolve:s=>{const xs=links(s);need(xs.length===1,'links changed');return {verb:'click',ref:xs[0].ref};}});
  state=await channel.observe({condition:'calculator source fetch controls visible',ready:s=>bound(s)&&fetchVisible(s)});
 }
 // A populated owned cache needs no source-fetch gesture (the button can be disabled).
 state=await channel.observe({condition:'calculator cached output mapping',readMappings:true,ready:bound});
 if(state.node_mapping?.verified===true&&state.node_mapping.inventory_complete===true
  &&state.node_mapping.source_identity_verified===true)return state;
 const buttons=s=>controls(s,'btnGetSourceColumns').filter(e=>e.visible===true&&e.enabled===true&&e.allowed_actions?.includes('click'));
 need(buttons(state).length===1,'source fetch unavailable');
 await channel.perform({condition:'get calculator output source columns once',initialObservation:state,ready:bound,
  identity:()=>({root}),resolve:s=>{const xs=buttons(s);need(xs.length===1,'source fetch changed');return {verb:'click',ref:xs[0].ref};}});
 return channel.observe({condition:'calculator output mapping after source fetch',readMappings:true,
  ready:s=>bound(s)&&s.node_mapping?.verified===true});
}
