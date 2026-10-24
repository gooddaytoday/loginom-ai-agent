import { createHash } from 'node:crypto';
import { NODE_TYPES, validateNodeTargetRequest } from './node-contracts.mjs';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const domainNode=({dom_epoch,...value})=>value;
const sameDomainGraph=(a,b)=>same({...a,nodes:a.nodes.map(domainNode)},{...b,nodes:b.nodes.map(domainNode)});
export function normalizeGraphRefusal(effect,receipt){
 if(effect.kind==='connect'&&receipt?.status==='FAILED'&&receipt.action_key==='link.create'
   &&receipt.operation_id===effect.id&&receipt.phase==='preconditions'&&receipt.effect_possible===false
   &&receipt.cleanup_complete===true&&receipt.error?.code==='CAPABILITY_ERROR')
   return {...receipt,status:'NOT_APPLIED',native_status:'FAILED'};
 return receipt;
}
const edgeKey = e => [e.source, e.output, e.target, e.input].join('|');
const node = (graph, id) => {
  const matches = graph.nodes.filter(n => n.ref.node_id === id);
  if (matches.length !== 1) throw new Error('Node identity is absent or ambiguous');
  return matches[0];
};

// One comparison is shared by immediate verification and lost-reply recovery.
export function verifyNodeTargetEffect(effect, after, positionMatches) {
  const before=effect.before,p=effect.parameters,kind=effect.kind;
  if(!after.complete || after.dom_epoch!==before.dom_epoch || after.document_id!==before.document_id || !same(after.workflow_ref,before.workflow_ref))return null;
  const keep=(g,ids,edges=[])=>({nodes:g.nodes.filter(n=>!ids.includes(n.ref.node_id)).map(domainNode),links:g.links.filter(e=>!edges.includes(edgeKey(e)))});
  if(kind==='create'){
    const added=after.nodes.filter(n=>!before.nodes.some(b=>b.ref.node_id===n.ref.node_id));
    if(added.length!==1 || added[0].type!==p.type)return null;
    const id=added[0].ref.node_id,auto=after.links.filter(e=>!before.links.some(b=>edgeKey(b)===edgeKey(e)));
    // Loginom 7.4.2 also connects a nearby REST reference on a manual drop.
    // Only the native reader's typed GUID pair may explain a new foreign tid.
    const service=(after.rest_connection_links??[]).filter(e=>!(before.foreign_links??[]).includes(e.tid));
    if(service.length>1 || service.some(e=>p.type!=='integration.rest_request'||e.target!==id
      ||!before.nodes.some(n=>n.ref.node_id===e.source)||!nativeRestServiceEdge(after,e))
      ||!same(after.foreign_links?.filter(tid=>!service.some(e=>e.tid===tid)),before.foreign_links)
      ||!same((after.rest_connection_links??[]).filter(e=>!service.includes(e)),before.rest_connection_links??[]))return null;
    if(auto.some(e=>e.source!==id&&e.target!==id) || !same(keep(before,[id],auto.map(edgeKey)),keep(after,[id],auto.map(edgeKey))))return null;
    return {node_id:id,auto_created_links:auto,auto_created_service_links:service};
  }
  if(kind==='remove_link'&&p.edge.output==='connection:0'&&p.edge.input==='connection:0'){
    const service=(before.rest_connection_links??[]).filter(e=>same(e,p.edge));
    return service.length===1&&nativeRestServiceEdge(before,service[0])
      &&same(after.foreign_links,before.foreign_links.filter(tid=>tid!==service[0].tid))
      &&same(after.rest_connection_links??[],before.rest_connection_links.filter(e=>e!==service[0]))
      &&same(keep(before,[]),keep(after,[]))?{}:null;
  }
  if(!same(after.foreign_links,before.foreign_links))return null;
  if(['rename','move','add_input'].includes(kind)){
    let current,original;try{current=node(after,p.ref.node_id);original=node(before,p.ref.node_id);}catch{return null;}
    const field=kind==='rename'?'label':kind==='move'?'position':'inputs';
    const correct=kind==='rename'?current.label===p.label:kind==='move'?positionMatches(current,p.position):same(current.inputs,[...original.inputs,p.input]);
    return correct && same(domainNode({...current,[field]:original[field]}),domainNode(original)) && same(keep(before,[p.ref.node_id]),keep(after,[p.ref.node_id]))?{}:null;
  }
  if(kind==='connect'||kind==='remove_link'){
    const key=edgeKey(p.edge),present=after.links.some(e=>edgeKey(e)===key);
    return present===(kind==='connect') && same(keep(before,[],[key]),keep(after,[],[key]))?{}:null;
  }
  return null;
}

function nativeRestServiceEdge(graph,edge){
  const source=graph.nodes.filter(n=>n.ref.node_id===edge.source),target=graph.nodes.filter(n=>n.ref.node_id===edge.target);
  return edge.output==='connection:0'&&edge.input==='connection:0'&&graph.foreign_links?.filter(tid=>tid===edge.tid).length===1
    &&source.length===1&&target.length===1&&source[0].type==='bg-vendor-icon-restclientconnection'&&target[0].type==='integration.rest_request'
    &&source[0].other_ports?.includes('Output_Connection-0')&&target[0].other_ports?.includes('Input_Connection-0')
    &&[source[0],target[0]].every(n=>n.ref.document_id===graph.document_id&&n.ref.workflow_id===graph.workflow_ref.workflow_id);
}

// Internal graph phase of node.apply. The enclosing runtime owns the gate and
// operation ID; adapters invoke fixed local primitives, never dock_action_run.
// Effects are committed one at a time. A possible effect never retries a gesture.
export async function prepareNodeTarget({ request, operation, adapter, record, signal, now = Date.now, beforeTarget }) {
  validateNodeTargetRequest(request);
  const signature = digest(request);
  const state = operation.targetPhase ??= { signature, receipts: [], baseline: null, targetId: null, effect_possible: false };
  if (state.signature !== signature) throw new Error('Operation ID reused with a different node target');
  const budget = () => { signal?.throwIfAborted(); if (!(now() < operation.deadline)) throw new Error('Node target deadline exceeded'); };
  const save = async (phase, detail) => {
    const event = { operation_id: operation.id, phase, internal_provenance: 'node_target_v1', ...structuredClone(detail) };
    const ack = await record(event);
    if (!ack || !same(ack[phase === 'node_target_effect_prepared' ? 'effect' : phase === 'node_target_refusal_observed' ? 'refusal' : 'target_state'], event[phase === 'node_target_effect_prepared' ? 'effect' : phase === 'node_target_refusal_observed' ? 'refusal' : 'target_state'])) throw new Error('Node target journal acknowledgement differs');
  };
  const observe = async () => {
    budget();
    const graph = await adapter.observe(request, operation.deadline, signal);
    if (!graph.complete || graph.document_id !== request.document_id || !same(graph.workflow_ref, request.workflow_ref)) throw new Error('Complete graph in the original prepared workflow required');
    if (graph.nodes.length > 200 || graph.links.length > 400 || new Set(graph.nodes.map(n => n.ref.node_id)).size !== graph.nodes.length
      || new Set(graph.links.map(edgeKey)).size !== graph.links.length) throw new Error('Graph exceeds bounds or contains ambiguous identities');
    for (const n of graph.nodes) {
      if (n.ref.document_id !== graph.document_id || n.ref.workflow_id !== graph.workflow_ref.workflow_id) throw new Error('Graph contains foreign node identity');
    }
    return graph;
  };
  const commit = async () => save('node_target_checkpoint', { target_state: state });
  // Private REST preflight authorizes only inserting its generated encoder
  // between the caller-confirmed raw source and the same existing REST node.
  const restInputReplacement = graph => {
    const p=operation.restQueryInput,r=operation.parameters;
    if(!p||r?.finish!=='execute'||r.mode!=='request'||!r.parameters?.connection||!r.parameters.query_parameters?.length
      ||r.target.kind!=='existing'||r.target.type!=='integration.rest_request'
      ||!same(r.target,request.target)||r.document_id!==request.document_id||!same(r.workflow_ref,request.workflow_ref)
      ||r.inputs.length!==1||request.inputs.length!==1)return false;
    const raw=r.inputs[0],encoded=request.inputs[0];
    return p.edge.target===request.target.ref.node_id&&p.edge.input===0&&raw.input===0&&encoded.input===0&&encoded.output===0
      &&p.edge.source===raw.source.node_id&&p.edge.output===raw.output&&same(encoded.source,p.encoder)
      &&p.encoder.document_id===request.document_id&&p.encoder.workflow_id===request.workflow_ref.workflow_id
      &&node(graph,p.encoder.node_id).type==='programming.javascript'
      &&graph.links.filter(e=>e.target===p.encoder.node_id&&e.input===0).length===1
      &&graph.links.some(e=>e.source===raw.source.node_id&&e.output===raw.output&&e.target===p.encoder.node_id&&e.input===0);
  };
  const change = async (kind, parameters, verify) => {
    let original = await observe();
    for(let refresh=0;refresh<3;refresh++){
      budget();
      const before=refresh===0?original:await observe();
      if(!same(before,original))throw new Error('Graph target changed before local refresh');
      if(kind==='remove_link'&&parameters.edge.output==='connection:0'
        &&(request.target.kind!=='new'||parameters.edge.target!==state.targetId
          ||!(state.auto_created_service_links??[]).some(e=>same(e,parameters.edge))))throw Error('Unowned REST service connection');
      if(operation.restQueryInput&&['remove_link','connect'].includes(kind)&&parameters.edge.target===request.target.ref.node_id
        &&(!restInputReplacement(before)||kind==='remove_link'&&!same(parameters.edge,operation.restQueryInput.edge)))
        throw Error('REST encoder input authorization changed before graph effect');
      const effect = { id: operation.id + ':graph:' + (state.receipts.length+(state.refusals?.length??0)), kind, parameters: structuredClone(parameters), before };
      await save('node_target_effect_prepared', { effect });
      budget();
      state.pending = effect;
      const priorEffect=state.effect_possible;
      state.effect_possible = true;
      let receipt;
      try { receipt = normalizeGraphRefusal(effect,await adapter.mutate(effect, operation.deadline, signal)); }
      catch (error) { await commit(); throw error; }
      if (receipt?.status === 'NOT_APPLIED' && receipt.effect_possible === false && receipt.cleanup_complete === true) {
        // Confirm the same live graph before accepting a pre-dispatch refusal.
        // An unrelated change or lost observation keeps this effect pending.
        const after=await observe();
        if(!sameDomainGraph(before,after))throw new Error('Graph changed after refused gesture');
        await save('node_target_refusal_observed',{refusal:{effect,receipt:structuredClone(receipt),after_graph:after}});
        (state.refusals??=[]).push({id:effect.id,kind,receipt:structuredClone(receipt)});
        state.pending = null; state.last_graph=structuredClone(after);state.effect_possible=priorEffect;
        await commit();
        // New receipt ID, same graph identity and original deadline. No retry
        // is allowed unless this exact gesture was proved not dispatched.
        if(refresh<2){original=after;continue;}
        throw new Error('Graph gesture refused before effect: '+(receipt.error??'unknown precondition'));
      }
      state.pending.receipt = structuredClone(receipt);
      await commit();
      const after = await observe();
      if (receipt?.cleanup_complete !== true || !verifyNodeTargetEffect(effect,after,adapter.positionMatches) || !verify(before, after)) { throw new Error('Graph effect needs reconciliation'); }
      state.receipts.push({ id: effect.id, kind, parameters: effect.parameters, verified: true, receipt: structuredClone(receipt) });
      state.pending = null; state.last_graph=structuredClone(after);
      await commit();
      return after;
    }
  };
  const unchangedExcept = (before, after, ids, edges = []) => {
    const retained = g => ({ nodes: g.nodes.filter(n => !ids.includes(n.ref.node_id)).map(domainNode), links: g.links.filter(e => !edges.includes(edgeKey(e))), foreign_links: g.foreign_links });
    return same(retained(before), retained(after));
  };
  if(beforeTarget){
    if(request.target.kind!=='new'||!['transform.cross_table','transform.calculator','preprocessing.data_recovery'].includes(request.target.type)
      ||state.baseline||state.last_graph||state.pending||state.targetId||state.receipts.length)
      throw Error('Source preflight already started; release without replay');
    // The source preview or definition wizard can fail before creation begins.
    // Retain the existing graph checkpoint before that first child gesture, so a
    // later read-only release can compare the original graph. No target
    // effect is prepared here; an unfinished preflight is never resumable.
    state.last_graph=structuredClone(await observe());
    await commit();budget();
    await beforeTarget();
  }
  try {
    let graph = await observe();
    if (state.pending) {
      // Adapter reads the receipt; it is never allowed to reissue the gesture.
      const recovery = await adapter.reconcile(state.pending, graph, operation.deadline, signal);
      const refused=normalizeGraphRefusal(state.pending,recovery?.receipt);
      if(recovery?.completed===true&&refused?.status==='NOT_APPLIED'&&refused.native_status==='FAILED'
        &&recovery.cleanup_complete===true&&sameDomainGraph(state.pending.before,graph)){
        await save('node_target_refusal_observed',{refusal:{effect:state.pending,receipt:structuredClone(refused),after_graph:graph}});
        (state.refusals??=[]).push({id:state.pending.id,kind:state.pending.kind,receipt:structuredClone(refused)});
        state.pending=null;state.last_graph=structuredClone(graph);state.effect_possible=state.receipts.length>0;
        await commit();graph=await observe();
      }else{
      const proof=verifyNodeTargetEffect(state.pending,graph,adapter.positionMatches);
      if (!recovery?.verified || recovery.cleanup_complete !== true || !proof) throw new Error('Pending graph effect is unresolved');
      state.receipts.push({ id: state.pending.id, kind: state.pending.kind, parameters: state.pending.parameters, verified: true, receipt: recovery });
      if (state.pending.kind === 'create') {state.targetId = proof.node_id;state.auto_created_links=proof.auto_created_links;state.auto_created_service_links=proof.auto_created_service_links;}
      state.pending = null;state.last_graph=structuredClone(graph); await commit(); graph = await observe();
      }
    }
    if (state.completed) {
      if (!same(state.final_graph, graph)) throw new Error('Completed node target has changed');
      await commit();
      return { ...structuredClone(state.result), replayed: true };
    }
    if (!state.baseline) {
     for(let refresh=0;;refresh++){
      budget();
      if(refresh)graph=await observe();
      // Validate all source ports, target type/license and input topology BEFORE
      // creating anything. Schema/mapping validation belongs to the type handler.
      await adapter.preflight(request, graph, operation.deadline, signal);
      for (const input of request.inputs) {
        const source = node(graph, input.source.node_id);
        if (!source.outputs.includes(input.output)) throw new Error('Source tabular output does not exist');
      }
      if (request.target.kind === 'existing') {
        const existing = node(graph, request.target.ref.node_id);
        if (existing.type !== request.target.type) throw new Error('Existing node has a different component type');
        if(operation.restQueryInput&&(!restInputReplacement(graph)||!graph.links.some(e=>edgeKey(e)===edgeKey(operation.restQueryInput.edge))))
          throw Error('REST encoder input authorization differs from the existing graph');
        for(const input of request.inputs){
          const occupied=graph.links.find(e=>e.target===existing.ref.node_id&&e.input===input.input);
          if(occupied&&(occupied.source!==input.source.node_id||occupied.output!==input.output)
            &&!(restInputReplacement(graph)&&edgeKey(occupied)===edgeKey(operation.restQueryInput.edge)))throw new Error('Requested input is occupied by an unowned link'
            +(existing.type==='exports.text'?'. dock_node_apply does not replace existing connections. For a different source or output, use a NEW exports.text target with target.kind:"new", complete export settings and a NEW operation_id; preserve the existing export and its link. To keep the same source and only reconfigure the existing export, use inputs:[].':''));
        }
        state.targetId = existing.ref.node_id;
      }
let capacity=request.target.kind==='new'?NODE_TYPES[request.target.type].tabular_inputs:node(graph,state.targetId).inputs.length;
      for(const input of request.inputs.map(i=>i.input).filter(i=>i>=capacity).sort((a,b)=>a-b)){
        if(!NODE_TYPES[request.target.type].additional_tabular_inputs||input!==capacity)throw new Error('Additional tabular inputs must be contiguous');
        capacity++;
      }
      if(request.target.kind==='new' && !request.target.position){
        if(typeof adapter.choosePosition!=='function')throw Error('target.position: automatic placement is unavailable in this driver');
        try{state.newPosition=await adapter.choosePosition(request,graph,operation.deadline,signal);}
        catch(error){
          // Placement only observed the graph: re-admit the sources and palette
          // on a fresh complete graph before preparing any effect or gesture.
          if(error.code!=='NODE_PLACEMENT_GRAPH_CHANGED'||refresh>=2||state.pending||state.targetId
            ||state.effect_possible||state.receipts.length)throw error;
          continue;
        }
        validateNodeTargetRequest({...request,target:{...request.target,position:state.newPosition}});
        if(!state.newPosition)throw Error('target.position: no verified free position available');
      }
      state.baseline = structuredClone(graph); await commit();
      break;
     }
    }
    if (!state.targetId) {
      const after = await change('create', {...request.target,position:request.target.position??state.newPosition}, (before, after) => {
        const proof=verifyNodeTargetEffect({kind:'create',parameters:request.target,before},after,adapter.positionMatches);
        if(!proof)return false;
        state.targetId=proof.node_id;state.auto_created_links=proof.auto_created_links;state.auto_created_service_links=proof.auto_created_service_links;return true;
      });
      graph = after;
    }
    // An automatic service choice is not the caller's requested connection.
    // Remove only this creation's proven edge through the existing native
    // deletion procedure; the REST handler subsequently binds its own choice.
    for(const edge of state.auto_created_service_links??[]){
      if(!(graph.rest_connection_links??[]).some(e=>same(e,edge)))continue;
      graph=await change('remove_link',{edge},(before,after)=>!!verifyNodeTargetEffect({kind:'remove_link',parameters:{edge},before},after,adapter.positionMatches));
    }
    let target = node(graph, state.targetId);
    if (request.target.label !== undefined && target.label !== request.target.label) {
      graph = await change('rename', { ref: target.ref, label: request.target.label }, (before, after) => {
        const current = node(after, state.targetId), original = node(before, state.targetId);
        return current.label === request.target.label && same(domainNode({ ...current, label: original.label }), domainNode(original))
          && unchangedExcept(before, after, [state.targetId]);
      });
    }
    target = node(graph, state.targetId);
    if (request.target.position && !adapter.positionMatches(target, request.target.position)) {
      graph = await change('move', { ref: target.ref, position: request.target.position }, (before, after) => {
        const current = node(after, state.targetId), original = node(before, state.targetId);
        return adapter.positionMatches(current, request.target.position) && same(domainNode({ ...current, position: original.position }), domainNode(original))
          && unchangedExcept(before, after, [state.targetId]);
      });
    }
    const desired = request.inputs.map(i => ({ source: i.source.node_id, output: i.output, target: state.targetId, input: i.input }));
    for (const edge of graph.links.filter(e => e.target === state.targetId && !desired.some(d => edgeKey(d) === edgeKey(e)))) {
      const owned = (state.auto_created_links ?? []).some(a => edgeKey(a) === edgeKey(edge))
        ||restInputReplacement(graph)&&edgeKey(edge)===edgeKey(operation.restQueryInput.edge);
      // Other existing links not mentioned by the caller are preserved.
      // Conflicting links require an explicit edit contract, never deletion.
      if (!owned) {
        if (desired.some(d => d.input === edge.input)) throw new Error('Requested input is occupied by an unowned link');
        continue;
      }
      graph = await change('remove_link', { edge }, (before, after) => !after.links.some(e => edgeKey(e) === edgeKey(edge))
        && unchangedExcept(before, after, [], [edgeKey(edge)]));
    }
    for (const edge of desired) {
      if (graph.links.some(e => edgeKey(e) === edgeKey(edge))) continue;
      target = node(graph, state.targetId);
      if (!target.inputs.includes(edge.input)) {
        if (!NODE_TYPES[target.type].additional_tabular_inputs || edge.input !== Math.max(-1, ...target.inputs) + 1) throw new Error('Additional input must be the next observed tabular input');
        graph = await change('add_input', { ref: target.ref, input: edge.input }, (before, after) => {
          const current = node(after, state.targetId), original = node(before, state.targetId);
          return same(current.inputs, [...original.inputs, edge.input]) && same(domainNode({ ...current, inputs: original.inputs }), domainNode(original))
            && unchangedExcept(before, after, [state.targetId]);
        });
      }
      graph = await change('connect', { edge }, (before, after) => after.links.some(e => edgeKey(e) === edgeKey(edge))
        && unchangedExcept(before, after, [], [edgeKey(edge)]));
    }
    state.completed = true; state.final_graph = structuredClone(graph);
    state.result = { status: 'SUCCEEDED', phase: 'target_ready', node: node(graph, state.targetId),
      created: request.target.kind === 'new', links: desired, auto_created_links: state.auto_created_links ?? [],
      effects: state.receipts.map(({ id, kind, verified }) => ({ id, kind, verified })), configured: false, executed: false, package_saved: false };
    await commit(); return structuredClone(state.result);
  } catch (error) {
    return { status: state.effect_possible ? 'AMBIGUOUS' : 'NOT_APPLIED', phase: 'target_incomplete',
      error: String(error?.message ?? error), node_id: state.targetId, partial_effect: state.effect_possible,
      cleanup_complete: !state.pending,
      pending: state.pending?.id ?? null, effects: state.receipts.map(({ id, kind, verified }) => ({ id, kind, verified })),
      configured: false, executed: false, package_saved: false };
  }
}

// Read-only reconciliation: inspect must never continue the remaining gestures.
export async function inspectNodeTarget({request,operation,adapter,record,deadline}) {
  const state=structuredClone(operation.targetPhase);
  if(!state)throw new Error('Node target has no checkpoint');
  const graph=await adapter.observe(request,deadline);
  if(state.pending){
    const effect=state.pending;
    const recovery=await adapter.reconcile(effect,graph,deadline);
    const refused=normalizeGraphRefusal(effect,recovery.receipt);
    if(recovery.completed===true&&refused?.native_status==='FAILED'&&refused.status==='NOT_APPLIED'
      &&recovery.cleanup_complete===true&&sameDomainGraph(effect.before,graph)){
      (state.refusals??=[]).push({id:effect.id,kind:effect.kind,receipt:structuredClone(refused)});
      state.pending=null;state.last_graph=structuredClone(graph);state.effect_possible=state.receipts.length>0;
    }else{
    const proof=verifyNodeTargetEffect(effect,graph,adapter.positionMatches);
    if(!recovery.verified || recovery.cleanup_complete!==true || !proof)return {status:'AMBIGUOUS',phase:'target_incomplete',cleanup_complete:recovery.cleanup_complete===true,pending:effect.id};
    if(effect.kind==='create'){state.targetId=proof.node_id;state.auto_created_links=proof.auto_created_links;state.auto_created_service_links=proof.auto_created_service_links;}
    state.receipts.push({id:effect.id,kind:effect.kind,parameters:effect.parameters,verified:true,receipt:recovery});
    state.pending=null;state.last_graph=structuredClone(graph);
    }
  }else if(!same(state.completed?state.final_graph:(state.last_graph??state.baseline),graph))throw new Error('Partial node target graph changed');
  if(state.completed && !same(state.final_graph,graph))throw new Error('Completed node target changed');
  const event={operation_id:operation.id,phase:'node_target_checkpoint',internal_provenance:'node_target_v1',target_state:structuredClone(state)};
  const ack=await record(event);if(!same(ack?.target_state,event.target_state))throw new Error('Node target journal acknowledgement differs');
  operation.targetPhase=state;
  return state.completed?{...structuredClone(state.result),cleanup_complete:true}:{status:'AMBIGUOUS',phase:'target_partial',cleanup_complete:true,pending:null,node_id:state.targetId,
    resume_available:!(request?.target.kind==='new'&&['transform.cross_table','transform.calculator','preprocessing.data_recovery'].includes(request.target.type)&&!state.baseline&&state.last_graph)};
}

// A pre-target release observes only. In particular, it cannot finish creation,
// repair links, cancel a foreign draft or infer a target from its label.
export async function releaseNodeTarget({operation,adapter,record,readReceipt,deadline,signal,now=Date.now}) {
  const state=operation.nodeApply,request=state.request;
  const phase=state.pending?.phase??(state.target_reconciled?'target':null);
  if(state.node||state.result||!['source','workflow','target'].includes(phase)||operation.transportUncertain)
    throw Error('Pre-target release boundary is unavailable');
  if(!operation.targetPhase&&operation.nodeEffectPossible===true&&operation.cleanupConfirmed!==true)
    throw Error('Pre-target child effects have no settled checkpoint');
  const check=()=>{signal?.throwIfAborted();if(now()>=deadline)throw Error('Pre-target release deadline elapsed');};
  check();
  if(operation.lastReceipt){
    const response=await readReceipt(operation.lastReceipt);
    if(response?.state!=='completed'||response.receipt?.cleanup_complete!==true)
      throw Error('Pre-target release requires confirmed browser completion and cleanup');
  }
  check();
  const ctx={deadline,signal};
  const value={document_id:request.document_id,workflow_ref:request.workflow_ref};
  if(phase==='workflow')await verifyPendingWorkflowReceipt({operation,adapter,deadline,signal,now});
  const active=await adapter.verifyWorkflow(value,ctx);
  check();
  if(active?.verified!==true||active.status!=='SUCCEEDED'||active.cleanup_complete!==true||active.effect_possible!==false
    ||active.document_id!==request.document_id||!same(active.workflow_ref,request.workflow_ref))
    throw Error('Original prepared workflow is not quiet and active');
  if(operation.targetPhase?.pending)
    await inspectNodeTarget({request,operation,adapter,record,deadline});
  check();
  const target=operation.targetPhase;
  if(target?.pending)throw Error('Original target effect remains unresolved');
  const first=await adapter.observe(value,deadline,signal);
  check();
  const quiet=g=>g?.complete===true&&g.interaction_ready===true&&g.document_id===request.document_id&&same(g.workflow_ref,request.workflow_ref)
    &&g.nodes.every(n=>n.locked===false&&n.ref.document_id===request.document_id&&n.ref.workflow_id===request.workflow_ref.workflow_id)
    &&new Set(g.nodes.map(n=>n.ref.node_id)).size===g.nodes.length;
  if(!quiet(first))throw Error('Complete quiet original graph required for pre-target release');
  const baseline=target?.final_graph??target?.last_graph??target?.baseline??operation.preTargetGraph;
  if(baseline&&!sameDomainGraph(baseline,first))throw Error('Pre-target graph differs from its settled checkpoint');
  if(!baseline&&(target?.effect_possible||target?.receipts?.length||target?.targetId))
    throw Error('Target effects have no settled graph checkpoint');
  const id=target?.targetId??(request.target.kind==='existing'?request.target.ref.node_id:null);
  const matches=id?first.nodes.filter(n=>n.ref.node_id===id):[];
  if(id&&(matches.length!==1||matches[0].type!==request.target.type))throw Error('Original target node is absent or changed');
  // No target phase/effect means this procedure never created its new target.
  // Any known partial target is retained, never removed or recreated.
  if(!id&&(target?.effect_possible||target?.receipts?.length))throw Error('Created target identity is not proved');
  const second=await adapter.observe(value,deadline,signal);
  check();
  if(!quiet(second)||!same(first,second))throw Error('Graph changed during pre-target release');
  return {verified:true,cleanup_complete:true,node:matches[0]?.ref??null,graph:second,
    target_state:id?'found':'not_created',warnings:operation.preTargetWarnings??[],cleanup:{wizard_closed:false,read_view_restored:false,views_returned:false}};
}

// Activation uses its own browser ledger, not operation.lastReceipt. A visible
// active tab is not proof that its original native click finished.
export async function verifyPendingWorkflowReceipt({operation,adapter,deadline,signal,now=Date.now}) {
  const state=operation.nodeApply,pending=state?.pending;
  const check=()=>{signal?.throwIfAborted();if(now()>=deadline)throw Error('Workflow receipt deadline elapsed');};
  check();
  if(pending?.phase!=='workflow'||pending.receipt_id!==operation.id+':workflow'||typeof adapter?.readWorkflowReceipt!=='function')
    throw Error('Original workflow activation receipt is unavailable');
  const value={document_id:state.request.document_id,workflow_ref:state.request.workflow_ref};
  const response=await adapter.readWorkflowReceipt(value,{deadline,signal,receipt_id:pending.receipt_id});
  check();
  const receipt=response?.output?.receipt;
  if(response?.output?.state!=='completed'||receipt?.status!=='SUCCEEDED'||receipt.verified!==true
    ||receipt.cleanup_complete!==true||receipt.document_id!==value.document_id||!same(receipt.workflow_ref,value.workflow_ref))
    throw Error('Original workflow activation has no confirmed completion and cleanup');
}
