import {createHash, randomUUID} from 'node:crypto';
import {createJavascriptSourceReader, javascriptSourceIdentity} from './javascript-source-read.mjs';
import {inspectJavascriptModulePolicy} from './javascript-module-policy.mjs';

const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
class SourceAdmissionError extends Error {
  constructor(code, refusal) {
    super('JavaScript source admission refused: ' + code);
    this.name = 'SourceAdmissionError'; this.code = code;
    if (refusal) this.refusal = refusal;
  }
}
const need = (condition, code) => { if (!condition) throw new SourceAdmissionError(code); };
function immutable(value) {
  const copy = structuredClone(value), pending = [copy];
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) continue;
    pending.push(...Object.values(item)); Object.freeze(item);
  }
  return copy;
}
function normalizedOwner(owner, kind) {
  need(owner && Object.getPrototypeOf(owner) === Object.prototype
    && equal(Object.keys(owner).sort(), ['document_id','node_id','operation_id','ui_epoch','workflow_id'])
    && ['document_id','operation_id','workflow_id'].every(key => typeof owner[key] === 'string' && owner[key].length > 0 && owner[key].length <= 256)
    && Number.isSafeInteger(owner.ui_epoch) && owner.ui_epoch >= 0
    && (kind === 'new' ? owner.node_id === null : typeof owner.node_id === 'string' && owner.node_id.length > 0 && owner.node_id.length <= 256), 'owner');
  return Object.freeze({document_id: owner.document_id, workflow_id: owner.workflow_id, node_id: owner.node_id,
    operation_id: owner.operation_id, ui_epoch: owner.ui_epoch});
}
function canonicalSettings(settings) {
  let nodes = 0;
  const visit = (value, depth) => {
    need(++nodes <= 32768 && depth <= 64, 'settings_bound');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { need(Number.isFinite(value), 'settings_value'); return value; }
    if (typeof value === 'string') { need(value.length <= 32768 && value.isWellFormed(), 'settings_value'); return value; }
    need(value && typeof value === 'object' && (Array.isArray(value) || [null, Object.prototype].includes(Object.getPrototypeOf(value))), 'settings_value');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    need(Object.getOwnPropertySymbols(value).length === 0
      && Object.values(descriptors).every(item => Object.hasOwn(item, 'value')), 'settings_value');
    if (Array.isArray(value)) {
      need(value.length <= 32768 && Object.keys(value).length === value.length, 'settings_bound');
      return value.map(item => visit(item, depth + 1));
    }
    return Object.fromEntries(Object.keys(descriptors).sort().map(key => [key, visit(descriptors[key].value, depth + 1)]));
  };
  const value = visit(settings, 0);
  need(Buffer.byteLength(JSON.stringify(value), 'utf8') <= 32768, 'settings_bound');
  return value;
}
function settingsDigest(settings) {
  return createHash('sha256').update(JSON.stringify(canonicalSettings(settings))).digest('hex');
}
function policyFor(source) {
  const policy = inspectJavascriptModulePolicy(source);
  if (policy.status !== 'ADMITTED') throw new SourceAdmissionError('policy', policy);
  return policy;
}

// Internal host seam, not a registered tool or a replacement node driver.
// sourceAdapter is trusted owned navigation; callbacks are host driver functions,
// never model-provided scripts. Existing/new identities are checked by the real
// source reader, not by an injected "verified:true" admission result.
export function createJavascriptSourceAdmission({kind, owner, deadline, sourceAdapter, redactor, record, chunkBytes = 4096, settingsTransition}) {
  need(kind === 'new' || kind === 'existing', 'kind');
  const initialOwner = normalizedOwner(owner, kind), admissionId = randomUUID();
  need(settingsTransition === undefined || settingsTransition && equal(Object.keys(settingsTransition).sort(), ['expected_after','kind'])
    && settingsTransition.kind === 'replace', 'settings_transition');
  const plannedSettings = settingsTransition === undefined ? undefined : immutable(canonicalSettings(settingsTransition.expected_after));
  const plannedSettingsDigest = settingsTransition === undefined ? null : settingsDigest(plannedSettings);
  need(Number.isSafeInteger(deadline) && deadline > Date.now(), 'deadline');
  need(typeof sourceAdapter === 'function' && typeof record === 'function'
    && typeof redactor?.text === 'function' && typeof redactor?.redact === 'function'
    && Number.isInteger(chunkBytes) && chunkBytes >= 4 && chunkBytes <= 4096, 'dependencies');
  let state = 'idle', receipt, effectiveSource, effectivePolicy, intent, previous, targetOwner = initialOwner, observedSettings, readId = 0;
  const timely = () => need(Date.now() < deadline, 'deadline');
  const bounded = async operation => {
    timely(); let timer;
    try {
      const result = await Promise.race([Promise.resolve().then(operation), new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new SourceAdmissionError('timeout')), Math.max(1, deadline - Date.now()));
      })]);
      timely(); return result;
    } finally { clearTimeout(timer); }
  };
  const journal = async event => {
    // Keep a private immutable expected copy: a producer must not mutate the
    // event in-place and make its own changed ACK authoritative.
    const expected = immutable({...event, admission_id: admissionId, deadline});
    const ack = await bounded(() => record(structuredClone(expected)));
    need(Object.keys(expected).every(key => equal(ack?.[key], expected[key])), 'ack');
  };
  const retire = error => {
    state = 'retired';
    throw error instanceof SourceAdmissionError ? error : new SourceAdmissionError('boundary');
  };
  const readFull = async boundOwner => {
    const currentRead = ++readId;
    const adapter = await bounded(() => sourceAdapter(boundOwner));
    const reader = createJavascriptSourceReader({owner: boundOwner, deadline, adapter, redactor, chunkBytes,
      record: async event => {
        const expected = immutable({...event, admission_id: admissionId, read_id: currentRead});
        const ack = await bounded(() => record(structuredClone(expected)));
        need(Object.keys(expected).every(key => equal(ack?.[key], expected[key])), 'ack');
        return ack;
      }});
    let request = {owner: boundOwner}, source = '', metadata, settings, count = 0;
    do {
      const observed = await reader.read(request), part = observed.receipt;
      need(++count <= 8192 && part.kind === 'source' && equal(part.owner, boundOwner)
        && typeof part.source_text === 'string' && part.offset_utf8_bytes === Buffer.byteLength(source, 'utf8')
        && part.chunk_utf8_bytes === Buffer.byteLength(part.source_text, 'utf8'), 'read_receipt');
      const identity = {source_sha256: part.source_sha256, source_utf8_bytes: part.source_utf8_bytes, source_lf_lines: part.source_lf_lines};
      const snapshot = settingsDigest(observed.settings);
      need(!metadata || equal(identity, metadata) && settings === snapshot, 'read_drift');
      metadata = identity; settings = snapshot; source += part.source_text;
      need(Buffer.byteLength(source, 'utf8') <= 32768, 'read_bound');
      request = part.cursor === null ? null : {owner: boundOwner, cursor: part.cursor, expected_source_sha256: part.source_sha256};
    } while (request);
    need(equal(javascriptSourceIdentity(source), metadata), 'read_digest');
    timely(); return {source, identity: metadata, settings};
  };
  const validateReceipt = input => {
    need(input && equal(input.receipt, receipt), 'receipt');
    need(equal(normalizedOwner(input.owner, targetOwner.node_id === null ? 'new' : 'existing'), targetOwner), 'owner');
    need(Object.keys(input).every(key => ['receipt','owner'].includes(key)), 'request');
    timely();
  };
  const currentReceipt = phase => immutable({admission_id: admissionId, phase, kind, owner: targetOwner, deadline,
    intent,
    previous_source: previous?.identity ?? null, effective_source: effectivePolicy, settings_sha256: observedSettings ?? null, planned_settings_sha256: plannedSettingsDigest});
  return {
    get state() { return state; },
    async admit(parameters) {
      need(state === 'idle', 'state'); state = 'admitting';
      try {
        timely();
        need(parameters && Object.getPrototypeOf(parameters) === Object.prototype
          && Object.keys(parameters).every(key => ['source_text','expected_source_sha256'].includes(key)), 'parameters');
        const requested = Object.freeze({...parameters});
        const supplied = Object.hasOwn(requested, 'source_text'), expected = Object.hasOwn(requested, 'expected_source_sha256');
        need(!supplied || typeof requested.source_text === 'string', 'source_text');
        need(kind !== 'new' || supplied && !expected, 'new_source');
        need(kind !== 'existing' || (supplied ? expected && typeof requested.expected_source_sha256 === 'string'
          && /^[a-f0-9]{64}$/.test(requested.expected_source_sha256) : !expected), 'expected_digest');
        if (kind === 'existing') {
          previous = await readFull(initialOwner); observedSettings = previous.settings;
          need(!supplied || requested.expected_source_sha256 === previous.identity.source_sha256, 'stale_digest');
        }
        effectiveSource = supplied ? requested.source_text : previous.source;
        effectivePolicy = policyFor(effectiveSource);
        // Preserve explicit empty/same-text replacement intent; digest equality
        // must never turn a supplied replacement into an omitted-source request.
        intent = kind === 'new' ? 'create' : supplied ? 'replace' : 'preserve';
        receipt = currentReceipt('admitted');
        await journal({phase: 'javascript_source_admitted', receipt});
        state = 'admitted'; return receipt;
      } catch (error) { return retire(error); }
    },
    async withMutation(input, perform) {
      need(state === 'admitted', 'state');
      try {
        validateReceipt(input); need(typeof perform === 'function', 'callback'); state = 'mutating';
        if (kind === 'existing') {
          const fresh = await readFull(targetOwner);
          need(equal(fresh.identity, previous.identity) && fresh.settings === observedSettings, 'mutation_drift');
        }
        need(equal(policyFor(effectiveSource), effectivePolicy), 'policy_drift');
        await journal({phase: 'javascript_source_mutation_dispatch', receipt});
        // The asynchronous dispatch ACK is not a source freshness proof.
        if (kind === 'existing') {
          const fresh = await readFull(targetOwner);
          need(equal(fresh.identity, previous.identity) && fresh.settings === observedSettings, 'mutation_drift');
        }
        need(equal(policyFor(effectiveSource), effectivePolicy), 'policy_drift');
        const result = await bounded(() => perform({owner: targetOwner, deadline, intent: receipt.intent, source_text: effectiveSource, policy: effectivePolicy, planned_settings: plannedSettings}));
        const observedOwner = normalizedOwner(result?.owner, 'existing');
        need(['document_id','workflow_id','operation_id','ui_epoch'].every(key => observedOwner[key] === initialOwner[key])
          && (kind === 'new' || equal(observedOwner, initialOwner)), 'mutation_owner');
        targetOwner = observedOwner;
        const after = await readFull(targetOwner);
        need(equal(policyFor(after.source), effectivePolicy)
          && (plannedSettingsDigest !== null ? after.settings === plannedSettingsDigest : kind === 'new' || after.settings === observedSettings), 'configured_drift');
        observedSettings = after.settings; receipt = currentReceipt('configured');
        await journal({phase: 'javascript_source_configured', receipt});
        state = 'configured'; return receipt;
      } catch (error) { return retire(error); }
    },
    async withEffect(input, perform) {
      need(state === 'configured' || state === 'admitted' && receipt?.intent === 'preserve' && plannedSettingsDigest === null, 'state');
      try {
        validateReceipt(input); need(typeof perform === 'function', 'callback'); state = 'checking_effect';
        const observed = await readFull(targetOwner);
        need(equal(policyFor(observed.source), effectivePolicy) && observed.settings === observedSettings, 'effect_drift');
        await journal({phase: 'javascript_source_effect_dispatch', receipt});
        const final = await readFull(targetOwner);
        need(equal(policyFor(final.source), effectivePolicy) && final.settings === observedSettings, 'effect_drift');
        // The future effect driver must still guard its native owner/epoch at
        // dispatch. Separate UI reads are not atomic exclusion of human edits.
        state = 'effect_dispatched';
        const result = await bounded(() => perform({owner: targetOwner, deadline, policy: effectivePolicy, settings_sha256: observedSettings}));
        // This acknowledges a returned host callback, not successful execution
        // or a server transaction; those remain the actual driver's contract.
        await journal({phase: 'javascript_source_effect_returned', receipt});
        state = 'finished'; return result;
      } catch (error) { return retire(error); }
    }
  };
}
