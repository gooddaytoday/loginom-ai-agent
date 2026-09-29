import {validateNodeTargetRequest} from './node-contracts.mjs';
import {createJavascriptSourceReader} from './javascript-source-read.mjs';

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const need = (condition, message) => { if (!condition) throw Error(message); };
const id = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const exact = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype
  && same(Object.keys(value).sort(), keys.slice().sort());

// Only trusted host code supplies the browser adapter. A model cannot choose
// a browser script, settings, output port, execution mode, or source operation.
export function validateJavascriptSourceReadRequest(request) {
  need(request?.kind === 'source' && id(request.operation_id), 'Invalid JavaScript source read identity');
  if (Object.hasOwn(request, 'cursor')) {
    need(exact(request, ['kind', 'operation_id', 'cursor', 'expected_source_sha256'])
      && typeof request.cursor === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(request.cursor)
      && /^[a-f0-9]{64}$/.test(request.expected_source_sha256),
    'Invalid JavaScript source continuation');
    return 'continuation';
  }
  need((exact(request, ['kind', 'operation_id', 'document_id', 'workflow_ref', 'node'])
    || exact(request, ['kind', 'operation_id', 'document_id', 'workflow_ref', 'node', 'budget_ms']))
    && (request.budget_ms === undefined || Number.isSafeInteger(request.budget_ms)
      && request.budget_ms >= 1 && request.budget_ms <= 1800000),
  'Invalid JavaScript source initial request');
  validateNodeTargetRequest({document_id: request.document_id, workflow_ref: request.workflow_ref,
    target: {kind: 'existing', type: 'programming.javascript', ref: request.node}, inputs: []});
  return 'initial';
}

// One session owns an immutable prepared JS node. The source reader reopens and
// discards its own wizard once per chunk, checks the full source before any
// delivery, and refuses a changed digest or duplicate cursor.
export function createJavascriptSourceReadSession({request, uiEpoch, deadline, adapter, redactor, record,
  chunkBytes = 4096}) {
  need(validateJavascriptSourceReadRequest(request) === 'initial'
    && Number.isSafeInteger(uiEpoch) && uiEpoch >= 0, 'Invalid JavaScript source session');
  const initial = structuredClone(request);
  need(Number.isSafeInteger(deadline) && deadline > Date.now()
    && deadline <= Date.now() + (initial.budget_ms ?? 300000), 'JavaScript source session deadline unavailable');
  const owner = Object.freeze({document_id: initial.document_id, workflow_id: initial.workflow_ref.workflow_id,
    node_id: initial.node.node_id, operation_id: initial.operation_id, ui_epoch: uiEpoch});
  const reader = createJavascriptSourceReader({owner, deadline, adapter, redactor, record, chunkBytes});
  let started = false;
  return Object.freeze({
    get owner() { return owner; },
    get deadline() { return deadline; },
    get uncertain() { return reader.uncertain; },
    async read(next) {
      const kind = validateJavascriptSourceReadRequest(next);
      need(next.operation_id === initial.operation_id, 'JavaScript source operation changed');
      if (kind === 'initial') {
        need(!started && same(next, initial), 'JavaScript source initial request changed');
        started = true;
        return (await reader.read({owner})).receipt;
      }
      need(started, 'JavaScript source continuation before initial read');
      return (await reader.read({owner, cursor: next.cursor,
        expected_source_sha256: next.expected_source_sha256})).receipt;
    }
  });
}
