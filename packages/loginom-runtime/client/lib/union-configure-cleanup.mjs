import {createHash} from 'node:crypto';
import {cancelledWizardReady, wizardCloseBinding} from './node-wizard-close.mjs';

// Private component only. The existing Page owner must supply the ORIGINAL
// callback and references at wizard creation. JSON observations cannot do so.
const witnesses = new WeakMap();
const fail = message => { throw new Error(message); };
const bytes = value => {
  const visit = v => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v) && !Object.is(v, -0)) return;
    if (!v || typeof v !== 'object') fail('Cleanup record is not lossless JSON');
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && !(Array.isArray(v) && proto === Array.prototype)) fail('Cleanup record prototype differs');
    const keys = Reflect.ownKeys(v).filter(k => k !== 'length' || !Array.isArray(v));
    if (Array.isArray(v) && (keys.length !== v.length || keys.some((k, i) => k !== String(i)))) fail('Cleanup array has missing or extra fields');
    for (const key of keys) {
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (typeof key !== 'string' || !d.enumerable || !('value' in d)) fail('Cleanup record accessor or hidden field');
      visit(d.value);
    }
  };
  visit(value);
  return JSON.stringify(value);
};
const cause = value => {
  if (value instanceof Error) return {kind:'Error', name:value.name, message:value.message,
    ...(Object.hasOwn(value, 'cause') ? {cause:cause(value.cause)} : {})};
  if (value === undefined) return {kind:'undefined'};
  if (value === null || ['string','boolean','number'].includes(typeof value)) return {kind:typeof value, value};
  return {kind:'unprojected'};
};

// No business result, executor pending field, runner job, or owner is changed.
// A future source-owned consumer must verify this opaque witness for the exact
// operation before performing its separately journalled cleanup settlement.
export function unionCleanupWitness(witness, operation) {
  const proof = witnesses.get(witness);
  return !!proof && proof.operation === operation && proof.check() === true;
}

export function retainUnionConfigureCleanup({operation, tuple, current, prepared,
  originalClose, observeTerminal, record, signal, deadline, now = Date.now}) {
  const keys = ['owner','run','lease','generation','chat','account','session','page','context',
    'package','workflow','node','wizard','controller','close','signal','deadline'];
  if (!operation || operation.parameters?.target?.type !== 'transform.union'
    || !operation.id || !operation.signature || keys.some(k => tuple?.[k] === undefined || tuple[k] === null)
    || !Number.isSafeInteger(tuple.generation) || tuple.generation < 0
    || !Number.isFinite(deadline) || !signal || typeof signal.throwIfAborted !== 'function'
    || tuple.close !== originalClose || tuple.signal !== signal || tuple.deadline !== deadline
    || [current, originalClose, observeTerminal, record].some(f => typeof f !== 'function')) fail('Original Union cleanup inputs missing');
  const operationId = operation.id;
  if (typeof operationId !== 'string' || operation.parameters.operation_id !== operationId) fail('Original Union operation ID/request differs');
  const retained = {...tuple}, request = bytes(operation.parameters), signature = operation.signature;
  const binding = wizardCloseBinding(prepared), bindingBytes = bytes(binding);
  if (!['document_id','workflow_id','node_id'].every(k => binding.node[k] === operation.nodeApply?.node?.[k])) fail('Original prepared Union node differs');
  let primary, held = false, outcomeBytes, stateBytes, pending, closePromise, work, terminal, receipt, witness;
  let callbackState = 'not_started', terminalState = 'not_started';
  const secondary = [];
  const check = () => {
    signal.throwIfAborted();
    if (now() >= deadline || operation.id !== operationId || operation.signature !== signature || bytes(operation.parameters) !== request) fail('Original Union operation/deadline changed');
    const c = current();
    if (!c || keys.some(k => c[k] !== retained[k]) || c.running !== false || c.dirty !== false
      || c.writerPending !== false || c.transportUnknown !== false) fail('Original Union custody is not confirmed');
    if (held && (operation.nodeApply?.pending !== pending || bytes(operation.nodeApply) !== stateBytes
      || bytes(operation.outcome) !== outcomeBytes)) fail('Original failed Union boundary changed');
    return true;
  };
  check();
  const api = {
    holdFailure(error) {
      if (held) { if (primary !== error) fail('First Union failure differs'); return; }
      check();
      const state = operation.nodeApply, outcome = operation.outcome;
      if (state?.pending?.phase !== 'configure' || outcome?.status !== 'AMBIGUOUS'
        || outcome.cleanup_complete !== false || outcome.effect_possible !== true
        || state.execution?.status !== 'not_requested') fail('Only settled failed Union configure is eligible');
      pending = state.pending; stateBytes = bytes(state); outcomeBytes = bytes(outcome); primary = error; held = true;
    },
    get primary() { return primary; },
    get secondary() { return [...secondary]; },
    get state() { return {callback:callbackState, terminal:terminalState, durable:!!witness}; },
    complete() {
      if (work) return work;
      // Claim the work before any callback or writer can synchronously re-enter.
      work = Promise.resolve().then(async () => {
        if (!held) fail('Original Union failure has not settled');
        check();
        if (witness) return witness;
        if (!closePromise) {
          callbackState = 'pending';
          closePromise = Promise.resolve().then(() => originalClose({signal, deadline}));
        }
        if (callbackState === 'unknown') fail('Original Close completion is unknown');
        try { await closePromise; callbackState = 'confirmed'; }
        catch (error) { callbackState = 'unknown'; throw error; }
        check();
        if (!terminal) {
          if (terminalState !== 'not_started') fail('Original terminal read is unknown');
          terminalState = 'pending';
          const observation = await observeTerminal({signal, deadline});
          check();
          const observedBytes = bytes(observation);
          if (!cancelledWizardReady(observation, binding)) fail('Original Union terminal proof differs');
          terminal = observedBytes; terminalState = 'confirmed';
        }
        receipt ??= Object.freeze({phase:'union_configure_partial_cleanup', operation_id:operationId,
          signature, request_sha256:createHash('sha256').update(request).digest('hex'),
          original_outcome:JSON.parse(outcomeBytes), primary:cause(primary),
          binding:JSON.parse(bindingBytes), terminal:JSON.parse(terminal),
          business_status:'AMBIGUOUS', cleanup_settlement:'partial', package_saved:false,
          native_replay:false, release_authority:false});
        check();
        const saved = await record(structuredClone(receipt));
        if (bytes(saved) !== bytes(receipt)) fail('Original partial cleanup durable acknowledgement differs');
        check();
        witness = Object.freeze({}); witnesses.set(witness, {operation, check});
        return witness;
      }).catch(error => { secondary.push(error); throw error; }).finally(() => { work = undefined; });
      return work;
    },
  };
  return Object.freeze(api);
}
