import {createNodeProcedure} from './node-procedure.mjs';
import {selectPreparedGraphNode} from './node-graph-selection.mjs';
const need=(v,m)=>{if(!v)throw Error('CrossTable ancestor execution: '+m);};
const same=(a,b)=>['document_id','workflow_id','node_id'].every(k=>a?.[k]===b?.[k]);

// Only independently verified static sources may be refreshed. Resolve native
// topology from the complete owned graph, never from a label or supplied path.
export function resolveCrossTableStaticImport(graph,node,sources){
 need(graph?.complete===true&&graph.document_id===node.document_id
  &&graph.workflow_ref?.workflow_id===node.workflow_id&&graph.foreign_links?.length===0,'complete owned graph required');
 const own=id=>{const ns=graph.nodes.filter(n=>n.ref.node_id===id);need(ns.length===1
  &&ns[0].ref.document_id===node.document_id&&ns[0].ref.workflow_id===node.workflow_id&&!ns[0].locked,'unique unlocked ancestor required');return ns[0];};
 need(same(own(node.node_id).ref,node)&&own(node.node_id).type==='transform.cross_table','owned CrossTable required');
 let target=node.node_id;
 for(let depth=0;depth<2;depth++){
  const edges=graph.links.filter(l=>l.target===target);
  need(edges.length===1&&edges[0].input===0&&edges[0].output===0,'single static input required');
  const source=own(edges[0].source);need(source.ref.node_id!==node.node_id&&source.ref.node_id!==target,'acyclic static input required');
  if(source.type==='imports.text'){
   need(!graph.links.some(l=>l.target===source.ref.node_id),'static import must have no input');
   const proofs=sources.imports.filter(s=>s.node_id===source.ref.node_id);
   need(proofs.length===1,'private import provenance required');const p=proofs[0],c=p.configuration;
   need(c?.kind==='text_import'&&same(c.node,source.ref)&&c.source?.connection==='Локальное'
    &&c.source.source_path===p.source?.destination&&p.source.bytes_verified===true
    &&(p.source.upload_completion_verified===true||p.source.provenance==='independent_server_file_download'&&p.source.download_completion_verified===true)
    &&Number.isSafeInteger(p.source.bytes)&&p.source.bytes>=0&&p.source.bytes<=16777216
    &&/^[a-f0-9]{64}$/.test(p.source.sha256),'byte-verified local import required');
   return source.ref;
  }
  need(depth===0&&source.type==='transform.collapse_columns'
   &&sources.collapses.filter(s=>s.node_id===source.ref.node_id&&same(s.configuration?.node,source.ref)
    &&s.configuration?.kind==='collapse'&&s.configuration.mode==='unpivot').length===1,'only verified Collapse ancestor supported');
  target=source.ref.node_id;
 }
 throw Error('CrossTable ancestor execution: static import not found');
}

// Native history keeps only twenty groups. Refresh the exact byte-verified
// import through the existing owned GUI deactivation action before launching
// CrossTable, so the import and optional Collapse execute in its new group.
// This neither edits settings nor accepts an evicted execution as current.
export async function prepareCrossTableAncestorExecution({graph,node,sources,operation,execute,record,wrapMutation,
 targetOrigin,targetBuild,signal,now}){
 const source=resolveCrossTableStaticImport(graph,node,sources);
 const channel=createNodeProcedure({operation,execute,record,wrapMutation,targetOrigin,targetBuild,signal,now,maxSteps:128,
  preparedNodeContext:{document_id:node.document_id,workflow_ref:graph.workflow_ref,node:source}});
 const owned=s=>s.prepared_node_context?.verified===true&&s.prepared_node_context.surface==='graph'
  &&same(s.prepared_node_context,source)&&s.prepared_node_context.locked===false&&s.wizard?.status==='absent'&&s.node_outputs?.verified===true;
 let state=await channel.observe({condition:'verified static import before owned CrossTable execution',readOutputs:true,ready:owned});
 if(!state.node_outputs.node_selected){await selectPreparedGraphNode(channel,state,'select verified CrossTable static import',{refreshReplacedBody:true});
  state=await channel.observe({condition:'selected verified static import',readOutputs:true,ready:s=>owned(s)&&s.node_outputs.node_selected});}
 const ports=state.node_outputs.ports.filter(p=>p.index===0);need(ports.length===1,'unique source output required');
 const active=ports[0].active;need(typeof active==='boolean','source activity required');
 if(active){
  const controls=s=>s.ui.elements.filter(e=>e.graph_execution?.node_id===source.node_id
   &&e.graph_execution.mode==='deactivate'&&e.allowed_actions.includes('deactivate_graph_node'));
  need(controls(state).length===1,'owned source deactivation control required');
  await channel.perform({condition:'refresh byte-verified import in the owned CrossTable execution group',initialObservation:state,
   ready:s=>owned(s)&&s.node_outputs.node_selected&&controls(s).length===1,
   resolve:s=>({verb:'deactivate_graph_node',ref:controls(s)[0].ref}),
   identity:s=>({node:source,deactivation:controls(s)[0].graph_execution})});
 }
 const after=await channel.observe({condition:'same static import inactive before fresh CrossTable execution',readOutputs:true,
  ready:s=>owned(s)&&s.node_outputs.ports.some(p=>p.index===0&&p.port_guid===ports[0].port_guid&&p.active===false)});
 const proof={verified:true,source,port_guid:ports[0].port_guid,was_active:active,active:false,
  settings_changed:false,execution_started:false,node_context:after.prepared_node_context};
 const ack=await record({phase:'crosstable_ancestor_execution_prepared',operation_id:operation.id,proof});
 need(ack?.phase==='crosstable_ancestor_execution_prepared'&&JSON.stringify(ack.proof)===JSON.stringify(proof),'durable acknowledgement differs');
 return proof;
}
