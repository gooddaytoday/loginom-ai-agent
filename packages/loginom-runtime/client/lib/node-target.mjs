import { createHash } from 'node:crypto';
import { NODE_TYPES, validateNodeTargetRequest } from './node-contracts.mjs';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const domainNode=({dom_epoch,...value})=>value;
const edgeKey = e => [e.source, e.output, e.target, e.input].join('|');
const node = (graph, id) => {
  const matches = graph.nodes.filter(n => n.ref.node_id === id);
  if (matches.length !== 1) throw new Error('Node identity is absent or ambiguous');
  return matches[0];
};

// One comparison is shared by immediate verification and lost-reply recovery.
export function verifyNodeTargetEffect(effect, after, positionMatches) {
  const before=effect.before,p=effect.parameters,kind=effect.kind;
  if(!after.complete || after.dom_epoch!==before.dom_epoch || after.document_id!==before.document_id || !same(after.workflow_ref,before.workflow_ref)
    || !same(after.foreign_links,before.foreign_links))return null;
  const keep=(g,ids,edges=[])=>({nodes:g.nodes.filter(n=>!ids.includes(n.ref.node_id)).map(domainNode),links:g.links.filter(e=>!edges.includes(edgeKey(e)))});
  if(kind==='create'){
    const added=after.nodes.filter(n=>!before.nodes.some(b=>b.ref.node_id===n.ref.node_id));
    if(added.length!==1 || added[0].type!==p.type)return null;
    const id=added[0].ref.node_id,auto=after.links.filter(e=>!before.links.some(b=>edgeKey(b)===edgeKey(e)));
    if(auto.some(e=>e.source!==id&&e.target!==id) || !same(keep(before,[id],auto.map(edgeKey)),keep(after,[id],auto.map(edgeKey))))return null;
    return {node_id:id,auto_created_links:auto};
  }
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

// Internal graph phase of node.apply. The enclosing runtime owns the gate and
// operation ID; adapters invoke fixed local primitives, never dock_action_run.
// Effects are committed one at a time. A possible effect never retries a gesture.
export async function prepareNodeTarget({ request, operation, adapter, record, signal, now = Date.now }) {
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
  const change = async (kind, parameters, verify) => {
    const original = await observe();
    for(let refresh=0;refresh<3;refresh++){
      budget();
      const before=refresh===0?original:await observe();
      if(!same(before,original))throw new Error('Graph target changed before local refresh');
      const effect = { id: operation.id + ':graph:' + (state.receipts.length+(state.refusals?.length??0)), kind, parameters: structuredClone(parameters), before };
      await save('node_target_effect_prepared', { effect });
      budget();
      state.pending = effect;
      const priorEffect=state.effect_possible;
      state.effect_possible = true;
      let receipt;
      try { receipt = await adapter.mutate(effect, operation.deadline, signal); }
      catch (error) { await commit(); throw error; }
      if (receipt?.status === 'NOT_APPLIED' && receipt.effect_possible === false && receipt.cleanup_complete === true) {
        // Confirm the same live graph before accepting a pre-dispatch refusal.
        // An unrelated change or lost observation keeps this effect pending.
        const after=await observe();
        if(!same(before,after))throw new Error('Graph changed after refused gesture');
        await save('node_target_refusal_observed',{refusal:{effect,receipt:structuredClone(receipt),after_graph:after}});
        (state.refusals??=[]).push({id:effect.id,kind,receipt:structuredClone(receipt)});
        state.pending = null; state.effect_possible=priorEffect;
        await commit();
        // New receipt ID, same graph identity and original deadline. No retry
        // is allowed unless this exact gesture was proved not dispatched.
        if(refresh<2)continue;
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
  try {
    let graph = await observe();
    if (state.pending) {
      // Adapter reads the receipt; it is never allowed to reissue the gesture.
      const recovery = await adapter.reconcile(state.pending, graph, operation.deadline, signal);
      const proof=verifyNodeTargetEffect(state.pending,graph,adapter.positionMatches);
      if (!recovery?.verified || recovery.cleanup_complete !== true || !proof) throw new Error('Pending graph effect is unresolved');
      state.receipts.push({ id: state.pending.id, kind: state.pending.kind, parameters: state.pending.parameters, verified: true, receipt: recovery });
      if (state.pending.kind === 'create') {state.targetId = proof.node_id;state.auto_created_links=proof.auto_created_links;}
      state.pending = null;state.last_graph=structuredClone(graph); await commit(); graph = await observe();
    }
    if (state.completed) {
      if (!same(state.final_graph, graph)) throw new Error('Completed node target has changed');
      await commit();
      return { ...structuredClone(state.result), replayed: true };
    }
    if (!state.baseline) {
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
        for(const input of request.inputs){
          const occupied=graph.links.find(e=>e.target===existing.ref.node_id&&e.input===input.input);
          if(occupied&&(occupied.source!==input.source.node_id||occupied.output!==input.output))throw new Error('Requested input is occupied by an unowned link');
        }
        state.targetId = existing.ref.node_id;
      }
let capacity=request.target.kind==='new'?NODE_TYPES[request.target.type].tabular_inputs:node(graph,state.targetId).inputs.length;
      for(const input of request.inputs.map(i=>i.input).filter(i=>i>=capacity).sort((a,b)=>a-b)){
        if(!NODE_TYPES[request.target.type].additional_tabular_inputs||input!==capacity)throw new Error('Additional tabular inputs must be contiguous');
        capacity++;
      }
      state.baseline = structuredClone(graph); await commit();
    }
    if (!state.targetId) {
      const after = await change('create', request.target, (before, after) => {
        const added = after.nodes.filter(n => !before.nodes.some(b => b.ref.node_id === n.ref.node_id));
        if (added.length !== 1 || added[0].type !== request.target.type) return false;
        const id = added[0].ref.node_id;
        const auto = after.links.filter(e => !before.links.some(b => edgeKey(e) === edgeKey(b)));
        if (auto.some(e => e.target !== id && e.source !== id) || !unchangedExcept(before, after, [id], auto.map(edgeKey))) return false;
        state.targetId = id; state.auto_created_links = auto; return true;
      });
      graph = after;
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
      const owned = (state.auto_created_links ?? []).some(a => edgeKey(a) === edgeKey(edge));
      // Existing links not mentioned by the caller are preserved. Conflicting
      // existing links require an explicit future edit contract, never deletion.
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
    const proof=verifyNodeTargetEffect(effect,graph,adapter.positionMatches);
    if(!recovery.verified || recovery.cleanup_complete!==true || !proof)return {status:'AMBIGUOUS',phase:'target_incomplete',cleanup_complete:recovery.cleanup_complete===true,pending:effect.id};
    if(effect.kind==='create'){state.targetId=proof.node_id;state.auto_created_links=proof.auto_created_links;}
    state.receipts.push({id:effect.id,kind:effect.kind,parameters:effect.parameters,verified:true,receipt:recovery});
    state.pending=null;state.last_graph=structuredClone(graph);
  }else if(!same(state.completed?state.final_graph:(state.last_graph??state.baseline),graph))throw new Error('Partial node target graph changed');
  if(state.completed && !same(state.final_graph,graph))throw new Error('Completed node target changed');
  const event={operation_id:operation.id,phase:'node_target_checkpoint',internal_provenance:'node_target_v1',target_state:structuredClone(state)};
  const ack=await record(event);if(!same(ack?.target_state,event.target_state))throw new Error('Node target journal acknowledgement differs');
  operation.targetPhase=state;
  return state.completed?{...structuredClone(state.result),cleanup_complete:true}:{status:'AMBIGUOUS',phase:'target_partial',cleanup_complete:true,pending:null,node_id:state.targetId,resume_available:true};
}
