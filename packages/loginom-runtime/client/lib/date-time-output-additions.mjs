const need=(v,m)=>{if(!v)throw Error('Date/time output addition: '+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const semantic=f=>{const {index,...rest}=f;return rest;};
const linked=m=>new Set(m.target_fields.map(f=>(f.source??f.exclusion_source)?.record_id));
export function planDateTimeOutputAdditions(native,c,p,resolve){
 const used=linked(native),requested=[];
 for(const field of p.fields??[])for(const t of field.transformations)requested.push(resolve(c,field,t,native.source_fields));
 const requestedIds=new Set(requested.map(s=>s.record_id));
 const missing=native.source_fields.filter(s=>!used.has(s.record_id));
 need(missing.every(s=>s.required&&requestedIds.has(s.record_id)),'unrequested source is absent from manual output');
 need(missing.every(s=>!native.target_fields.some(t=>t.name.toLowerCase()===s.name.toLowerCase())),'new source name collides with retained output');
 return missing;
}
export function verifyDateTimeOutputAddition(before,after,source){
 need(after?.verified&&after.inventory_complete&&after.source_identity_verified
  &&same(before.node_context,after.node_context)&&before.mapping_wizard===after.mapping_wizard
  &&before.autosync===after.autosync&&same(before.source_fields,after.source_fields),'owner, sources or autosync changed');
 const ids=new Set(before.target_fields.map(f=>f.record_id));
 const retained=after.target_fields.filter(f=>ids.has(f.record_id)),added=after.target_fields.filter(f=>!ids.has(f.record_id));
 need(same(retained.map(semantic),before.target_fields.map(semantic))&&added.length===1
  &&after.target_fields.length===before.target_fields.length+1,'retained output definition changed');
 const n=added[0],active=before.target_fields.filter(f=>!f.excluded).length;
 need(n.source&&same(n.source,source)&&n.name===source.name&&n.label===source.label&&n.type===source.type
  &&n.excluded===false&&n.exclusion_source===null&&n.inherited===false&&n.required===false
  &&n.index===active&&n.group_index===active&&n.data_kind==='Дискретный','new output is not the exact requested source copy');
 need(after.target_fields.every((f,i)=>f.index===i),'output order incomplete');
 return {source:structuredClone(source),target:structuredClone(n),retained_output_verified:true,autosync_preserved:true};
}
export async function ensureDateTimeRequestedOutputs(channel,initial,c,p,resolve){
 const missing=planDateTimeOutputAdditions(initial.node_mapping,c,p,resolve),receipts=[];
 if(!missing.length)return {state:initial,receipts};
 const baseline=initial.node_mapping,form=baseline.mapping_wizard;
 need(['DerivedDataSourceOutputSocketWizard','DerivedDataSourceMappingEngineOutputPortWizard'].includes(form),'unsupported output wizard');
 const bound=s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true
  &&same(s.node_mapping.node_context,baseline.node_context)&&s.node_mapping.mapping_wizard===form;
 const control=(s,key)=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';'+form+';'+key&&e.allowed_actions.includes('click'));need(es.length===1,'unique visible control required: '+key);return es[0];};
 const read=condition=>channel.observe({condition,readMappings:true,ready:bound});
 let s=initial;
 for(const source of missing){
  const before=s.node_mapping;
  await channel.perform({condition:'show date/time output links',initialObservation:s,ready:bound,identity:()=>baseline.node_context,
   resolve:s=>({verb:'click',ref:control(s,'rbLinks;DisplayEl').ref})});
  s=await read('date/time output source list');
  for(let attempt=0;attempt<24;attempt++){
   const cell=s.ui.elements.find(e=>e.date_time_cell?.role==='output_source'&&e.date_time_cell.record_id===source.record_id&&e.date_time_cell.field_key===source.name&&e.allowed_actions.includes('click'));
   if(cell){
    await channel.perform({condition:'select requested date/time output source',initialObservation:s,ready:bound,identity:()=>source,
     resolve:()=>({verb:'click',ref:cell.ref})});break;
   }
   const es=s.ui.elements.filter(e=>e.date_time_cell?.role==='output_source'&&e.scroll&&e.allowed_actions.includes('scroll'));
   need(es.length&&attempt<23,'requested source cannot be revealed');const anchor=es[Math.floor(es.length/2)];
   const first=s.node_mapping.source_fields.find(f=>es[0].date_time_cell.record_id===f.record_id);need(first,'visible source identity missing');
   await channel.perform({condition:'reveal requested date/time output source',initialObservation:s,ready:bound,identity:()=>source,
    resolve:()=>({verb:'scroll',ref:anchor.ref,delta_y:source.index<first.index?-350:350})});s=await read('date/time output sources scrolled');
  }
  const selected=s=>bound(s)&&s.node_mapping.source_selection?.verified===true&&same(s.node_mapping.source_selection.record_ids,[source.record_id]);
  s=await channel.observe({condition:'exact date/time output source selected',readMappings:true,ready:selected});
  need(same(s.node_mapping.source_fields,before.source_fields)&&same(s.node_mapping.target_fields,before.target_fields)
   &&s.node_mapping.autosync===before.autosync,'selection changed output definition');
  await channel.perform({condition:'create only requested date/time output',initialObservation:s,ready:selected,identity:()=>source,
   resolve:s=>({verb:'click',ref:control(s,'btnCreateMapping').ref})});
  s=await read('requested date/time output created');
  receipts.push(verifyDateTimeOutputAddition(before,s.node_mapping,source));
  await channel.perform({condition:'restore date/time output table',initialObservation:s,ready:bound,identity:()=>baseline.node_context,
   resolve:s=>({verb:'click',ref:control(s,'rbTable;DisplayEl').ref})});
  s=await read('date/time output table restored');verifyDateTimeOutputAddition(before,s.node_mapping,source);
 }
 return {state:s,receipts};
}
