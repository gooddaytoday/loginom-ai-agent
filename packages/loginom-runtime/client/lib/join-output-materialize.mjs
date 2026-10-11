import {ensureMappingTableView,mappingLinksView} from './mapping-table-view.mjs';
import {readOutputDefinitionPages} from './import-definition-pages.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const linked=s=>s.ui.elements.filter(e=>e.date_time_cell?.link);
// Materialization is confined to a new default Join. Every gesture uses the
// current native Links proof; neither a name nor prepared identity grants it.
export async function materializeJoinDefaultOutput(channel,initial,orderedIds){
 const baseline=initial.node_mapping,owner=baseline.node_context,root=initial.wizard.root_ref;
 const bound=s=>s.wizard?.stage==='output_mapping'&&s.wizard.root_ref===root
  &&s.node_mapping?.verified===true&&s.node_mapping.inventory_complete===true
  &&s.node_mapping.source_identity_verified===true&&same(s.node_mapping.node_context,owner);
 const mappingSame=(a,b)=>['mapping_wizard','autosync','produce_mode','source_fields','target_fields'].every(k=>same(a[k],b[k]));
 const unchanged=s=>bound(s)&&mappingSame(s.node_mapping,baseline);
 need(bound(initial)&&baseline.autosync===true&&baseline.source_fields.length===6
  &&baseline.target_fields.length===6&&orderedIds.length===6&&new Set(orderedIds).size===6
  &&orderedIds.every(id=>baseline.target_fields.some(t=>t.record_id===id)), 'Join materializer requires complete six-pair autosync output');
 let state=initial;
 if(!mappingLinksView(state)){
  await channel.perform({condition:'show owned Join Links for default materialization',initialObservation:state,ready:unchanged,identity:()=>baseline,
   resolve:s=>{const es=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';DerivedDataSourceOutputSocketWizard;rbLinks;DisplayEl'&&e.allowed_actions.includes('click'));
    need(es.length===1,'Join Links control unavailable');return {verb:'click',ref:es[0].ref};}});
  state=await channel.observe({condition:'complete Join Links preflight',readMappings:true,ready:s=>unchanged(s)&&mappingLinksView(s)});
 }
 const proof=(s,sourceId,targetId,unbound=false)=>{
  need(bound(s)&&mappingLinksView(s),'Join Links owner changed');
  const es=linked(s).filter(e=>e.date_time_cell.link.source_record===sourceId&&e.date_time_cell.link.target_record===targetId);
  const sources=es.filter(e=>e.date_time_cell.role==='output_source'),targets=es.filter(e=>e.date_time_cell.role==='output_target');
  need(sources.length===1&&targets.length===1,'Join Links pair unavailable or ambiguous');
  const link=sources[0].date_time_cell.link;
  need(same(link,targets[0].date_time_cell.link)&&same(link.owner.port,owner.output_port)
   &&link.owner.document_id===owner.document_id&&link.owner.workflow_id===owner.workflow_id&&link.owner.node_id===owner.node_id&&link.owner.root_ref===root
   &&link.settlement?.FLinksUpdateMode===false&&link.settlement.FRelationRefreshMode===false&&link.settlement.FWaitingRedraw===false
   &&typeof link.settlement.controller_ref==='string'&&typeof link.settlement.draw_ref==='string'
   &&(unbound?link.state==='unbound':link.state===undefined),'Join Links binding is not settled');
  return {source:sources[0],target:targets[0],link};
 };
 const planned=[];
 // Validate all pairs before the first possible effect, including custom ones.
 for(const id of orderedIds){
  const target=baseline.target_fields.find(t=>t.record_id===id),source=baseline.source_fields.filter(s=>same(s,target.source));
  need(source.length===1&&!target.excluded&&target.exclusion_source===null,'Join implicit binding is incomplete');
  const p=proof(state,source[0].record_id,id);need([0,1].includes(p.link.target.OriginType),'Join output origin is not observed');
  planned.push({sourceId:source[0].record_id,targetId:id,original:p.link,implicit:p.link.target.OriginType===0});
 }
 need(new Set(planned.map(p=>p.sourceId)).size===6,'Join output sources are ambiguous');
 const receipts=[],completed=new Set();
 const definitions=s=>{for(const p of planned){const current=proof(s,p.sourceId,p.targetId);need(same(current.link.source,p.original.source)&&same(current.link.target,{...p.original.target,OriginType:completed.has(p.targetId)?1:p.original.target.OriginType}), 'Join retained native definition changed');}};
 for(const pair of planned.filter(p=>p.implicit)){
  const pairProof=s=>proof(s,pair.sourceId,pair.targetId);
  need(unchanged(state),'Join output changed before materialization');definitions(state);
  await channel.perform({condition:'select exact implicit Join binding',initialObservation:state,ready:unchanged,identity:()=>({owner,pair}),resolve:s=>{
   definitions(s);const p=pairProof(s);need(p.source.allowed_actions.includes('click'),'Join binding selection unavailable');return {verb:'click',ref:p.source.ref};}});
  state=await channel.observe({condition:'selected implicit Join binding',readMappings:true,ready:unchanged});
  const selected=pairProof(state);need(selected.link.selected===true&&same(selected.link.target,pair.original.target),'Join selected target definition changed');
  receipts.push(await channel.perform({condition:'unlink exact implicit Join binding',initialObservation:state,ready:unchanged,identity:()=>({owner,pair}),resolve:s=>{
   definitions(s);const p=pairProof(s);need(p.link.selected===true,'Join relation selection changed');
   const es=linked(s).filter(e=>e.date_time_cell.role==='output_relation_remove'&&same(e.date_time_cell.link,p.link)&&e.allowed_actions.includes('click'));
   need(es.length===1,'Join single unlink control unavailable');return {verb:'click',ref:es[0].ref};}}));
  const unbound=structuredClone(baseline);unbound.target_fields.find(t=>t.record_id===pair.targetId).source=null;
  state=await channel.observe({condition:'one settled unbound Join pair',readMappings:true,ready:s=>bound(s)&&mappingSame(s.node_mapping,unbound)});
  const vacant=proof(state,pair.sourceId,pair.targetId,true);
  for(const p of planned){const records=vacant.link.inventory?.records;need(Array.isArray(records)&&records.length===2,'Join unbound inventory unavailable');for(const [i,id,expected] of [[0,p.sourceId,p.original.source],[1,p.targetId,{...p.original.target,OriginType:completed.has(p.targetId)?1:p.original.target.OriginType}]]){const rows=records[i].filter(r=>r.record_id===id);need(rows.length===1&&same(rows[0].definition,expected),'Join unbound retained definition changed');}}
  need(same(vacant.link.source,pair.original.source)&&same(vacant.link.target,pair.original.target), 'Join unlink changed definitions');
  receipts.push(await channel.perform({condition:'restore exact settled Join pair',initialObservation:state,ready:s=>bound(s)&&mappingSame(s.node_mapping,unbound),identity:()=>({owner,pair}),resolve:s=>{
   const p=proof(s,pair.sourceId,pair.targetId,true);need(p.source.allowed_actions.includes('drag')&&p.target.allowed_actions.includes('drag'),'Join reconnect unavailable');
   return {verb:'drag',source_ref:p.source.ref,target_ref:p.target.ref};}}));
  state=await channel.observe({condition:'complete restored Join mapping',readMappings:true,ready:unchanged});
  const restored=pairProof(state);need(same(restored.link.source,pair.original.source)&&same(restored.link.target,{...pair.original.target,OriginType:1}), 'Join reconnect changed definition or origin');completed.add(pair.targetId);definitions(state);
 }
 state=await ensureMappingTableView(channel,state);
 const definition=await readOutputDefinitionPages(channel,{expectedCount:6,ready:s=>s.wizard?.root_ref===root&&same(s.prepared_node_context,owner)});
 need(definition.fields.every((f,i)=>['name','label','type','data_kind'].every(k=>f[k]===baseline.target_fields[i][k])), 'Join materialized rendered definition differs');
 state=await channel.observe({condition:'native Join mapping after complete rendered materialization',readMappings:true,ready:unchanged});
 return {state,receipt:{verified:true,effect_possible:receipts.length>0,cleanup_complete:true,persisted_content_verified:false,
  materialized_fields:planned.filter(p=>p.implicit).map(p=>p.targetId),receipts,definition}};
}
