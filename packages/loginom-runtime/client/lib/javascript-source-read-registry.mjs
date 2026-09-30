import {validateJavascriptSourceReadRequest} from './javascript-source-read-session.mjs';

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const signature = value => JSON.stringify(canonical(value));

// An operation ID retains its source reader and every successful reply. An
// exact retry joins or replays that reply; no browser gesture is repeated.
export function createJavascriptSourceReadRegistry({openSession, maxOperations = 128,validateRequest=validateJavascriptSourceReadRequest}) {
  if (typeof openSession !== 'function' || !Number.isInteger(maxOperations)
    || maxOperations < 1 || maxOperations > 1024||typeof validateRequest!=='function') throw Error('Invalid JavaScript source registry');
  const operations = new Map();
  return Object.freeze({
    get busy() { return [...operations.values()].some(entry => entry.inflight !== null); },
    get unsettled() { return [...operations.values()].some(entry => entry.session?.cleanupUnconfirmed === true); },
    async read(request) {
      const kind = validateRequest(request);
      const key = signature(request);
      let entry = operations.get(request.operation_id);
      if (!entry) {
        if (kind !== 'initial') throw Error('Unknown JavaScript source operation');
        if ([...operations.values()].some(value => value.inflight !== null))
          throw Error('Another JavaScript source operation is running');
        if (operations.size >= maxOperations) throw Error('JavaScript source registry full');
        entry = {initial: key, session: null, inflight: null, pendingKey: null,
          receipts: new Map(), retired: false};
        operations.set(request.operation_id, entry);
      }
      if (kind === 'initial' && key !== entry.initial) throw Error('JavaScript source operation ID reused');
      if (entry.retired) throw Error('JavaScript source operation uncertain; no replay');
      if (entry.receipts.has(key)) return structuredClone(entry.receipts.get(key));
      if (entry.inflight) {
        if (entry.pendingKey !== key) throw Error('JavaScript source operation busy');
        return structuredClone(await entry.inflight);
      }
      if (kind === 'continuation' && entry.session === null)
        throw Error('JavaScript source continuation before initial read');
      entry.pendingKey = key;
      entry.inflight = (async () => {
        if (entry.session === null) {
          try { entry.session = await openSession(structuredClone(request)); }
          catch (error) { entry.retired = true; throw error; }
          if (entry.session?.owner?.operation_id !== request.operation_id
            || typeof entry.session.read !== 'function') {
            entry.retired = true; throw Error('JavaScript source session owner changed');
          }
        }
        try {
          const receipt = await entry.session.read(structuredClone(request));
          entry.receipts.set(key, structuredClone(receipt));
          return receipt;
        } catch (error) {
          if (entry.session.uncertain === true) entry.retired = true;
          throw error;
        }
      })();
      try { return structuredClone(await entry.inflight); }
      finally { entry.inflight = null; entry.pendingKey = null; }
    }
  });
}
