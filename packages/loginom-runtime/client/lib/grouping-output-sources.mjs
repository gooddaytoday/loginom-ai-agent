const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function verifyGroupingSourceFetch(before,after){
 // Loginom recreates excluded placeholders (including their synthetic field
 // IDs) when sources are fetched. Active output field IDs remain persistent.
 const project=f=>{const {record_id,source,exclusion_source,...rest}=f;if(f.excluded===true)delete rest.field_id;return rest;};
 need(before.source_fields.length===0&&after.source_fields.length>0&&after.inventory_complete===true&&after.source_identity_verified===true
  &&same(before.node_context,after.node_context)&&before.autosync===after.autosync
  &&same(before.target_fields.map(project),after.target_fields.map(project)),
  'Fetching grouping sources changed the output definition');
 need(after.target_fields.every(f=>f.excluded===true?f.source===null&&f.exclusion_source!=null:f.source!=null),'Grouping output has an unbound source after schema retrieval');
 return true;
}
// Native "Get source columns" retrieves the schema without executing the node.
// The temporary Links view is restored before any field configuration.
export async function ensureGroupingOutputSources(channel,initial,{verify=verifyGroupingSourceFetch}={}){
 if(initial.node_mapping.source_fields.length)return initial;
 const before=initial.node_mapping,owner=before.node_context,root=initial.wizard.root_ref;
 const bound=s=>s.wizard?.stage==='output_mapping'&&s.wizard.root_ref===root&&same(s.prepared_node_context,owner);
 const control=(s,key)=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';DerivedDataSourceOutputSocketWizard;'+key&&e.allowed_actions.includes('click'));need(es.length===1,'Grouping source control unavailable: '+key);return es[0];};
 await channel.perform({condition:'show grouping source links',initialObservation:initial,ready:bound,identity:()=>owner,
  resolve:s=>({verb:'click',ref:control(s,'rbLinks;DisplayEl').ref})});
 const links=await channel.observe({condition:'grouping source retrieval available',ready:s=>bound(s)&&s.ui.elements.some(e=>e.tid===s.wizard.root_tid+';DerivedDataSourceOutputSocketWizard;btnGetSourceColumns'&&e.allowed_actions.includes('click'))});
 await channel.perform({condition:'retrieve grouping output source schema',initialObservation:links,ready:bound,identity:()=>owner,
  resolve:s=>({verb:'click',ref:control(s,'btnGetSourceColumns').ref})});
 const loaded=await channel.observe({condition:'grouping source retrieval settled',ready:bound});
 await channel.perform({condition:'restore grouping output table view',initialObservation:loaded,ready:bound,identity:()=>owner,
  resolve:s=>({verb:'click',ref:control(s,'rbTable;DisplayEl').ref})});
 const after=await channel.observe({condition:'complete grouping sources and retained output links',readMappings:true,
  ready:s=>bound(s)&&s.node_mapping?.verified===true&&s.node_mapping.source_fields.length>0});
 verify(before,after.node_mapping);return after;
}
