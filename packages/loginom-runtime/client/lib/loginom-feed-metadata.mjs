export const LOGINOM_METADATA_MAX_BYTES = 16 * 1024;
export const LOGINOM_METADATA_FIELD_MAX_BYTES = Object.freeze({
  kind: 16,
  busy: 256,
  step: 2 * 1024,
  manualEdits: 4 * 1024,
  verificationStale: 5,
  savedPackageGraph: 8 * 1024,
  evidence: 4 * 1024,
  receiptWindow: 512,
  packageAccess: 4 * 1024,
  packageVariables: 8 * 1024,
  agentCopy: 8 * 1024,
});

const lists = {
  limitations: [],
  ports: [],
  files: [],
  manualEdits: ['edits'],
  evidence: [],
  savedPackageGraph: ['savedLabels', 'uncheckedSorting', 'changes'],
  packageVariables: ['usages', 'defaults', 'definitions'],
};

const utf8 = new TextEncoder();

export function loginomMetadataBytes(value) {
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return utf8.encode(json).byteLength;
  } catch { /* A field that cannot cross IPC does not have a byte budget. */ }
  return Infinity;
}

function noteOmitted(metadata, path, count) {
  if (!count) return metadata;
  const omitted = metadata.omitted ?? {};
  return {...metadata, omitted: {...omitted, [path]: (omitted[path] ?? 0) + count}};
}

function noteDropped(metadata, key) {
  return {...metadata, dropped: [...new Set([...(metadata.dropped ?? []), key])]};
}

function shorten(items, build, fits) {
  let lower = 0;
  let upper = items.length - 1;
  let result = build(0);
  while (lower <= upper) {
    const length = Math.floor((lower + upper) / 2);
    const candidate = build(length);
    if (fits(candidate)) {
      result = candidate;
      lower = length + 1;
    } else upper = length - 1;
  }
  return result;
}

function arrayNames(key) {
  return lists[key].length ? lists[key] : [undefined];
}

function fieldList(metadata, key, name) {
  return name ? metadata[key]?.[name] : metadata[key];
}

function shortenField(metadata, key, fits, names) {
  if (!Object.hasOwn(lists, key)) return metadata;
  names ??= [...arrayNames(key)].sort((a,b) => listBytes(fieldList(metadata, key, b)) - listBytes(fieldList(metadata, key, a)));
  for (const name of names) {
    if (fits(metadata)) break;
    const value = metadata[key];
    const items = fieldList(metadata, key, name);
    if (!Array.isArray(items) || !items.length) continue;
    const path = name ? key + '.' + name : key;
    metadata = shorten(items, length => {
      const prefix = items.slice(0, length);
      const shortened = name ? {...value, [name]: prefix} : prefix;
      if (key === 'packageVariables' && (name === 'definitions' || name === 'defaults')
        && shortened[name + 'Coverage'] === 'complete') shortened[name + 'Coverage'] = 'partial';
      if (key === 'manualEdits') {
        shortened.omitted = (Number.isSafeInteger(value.omitted) && value.omitted >= 0 ? value.omitted : 0) + items.length - length;
        return {...metadata, manualEdits: shortened};
      }
      return noteOmitted({...metadata, [key]: shortened}, path, items.length - length);
    }, fits);
  }
  return metadata;
}

const withinBlock = metadata => loginomMetadataBytes(metadata) <= LOGINOM_METADATA_MAX_BYTES;

const listBytes = value => Array.isArray(value) && value.length ? loginomMetadataBytes(value) : 0;
const summaryLists = ['files', 'ports'];
const receiptKeys = new Set(['v','operationId','state','attempt','status','phase','node','executionId','executionStatus',
  'effectPossible','cleanupComplete','limitations','nextStep','ports','error','files','omitted','dropped']);

function fit(metadata) {
  if (withinBlock(metadata)) return metadata;
  if (Array.isArray(metadata.ports)) {
    const ports = metadata.ports.slice();
    for (let index = ports.length - 1; index >= 0; index--) {
      const {preview, ...port} = ports[index] ?? {};
      if (!preview) continue;
      const sample = Array.isArray(preview.sample) ? preview.sample : [];
      metadata = shorten(sample, length => {
        const next = ports.slice();
        next[index] = length ? {...port, preview: {...preview, sample: sample.slice(0, length), sampleComplete: false}} : port;
        return noteOmitted({...metadata, ports: next}, 'previewRows', sample.length - length);
      }, withinBlock);
      ports[index] = metadata.ports[index];
      if (withinBlock(metadata)) return metadata;
    }
  }
  metadata = shortenField(metadata, 'limitations', withinBlock);
  if (withinBlock(metadata)) return metadata;
  const scenarioLists = Object.keys(LOGINOM_METADATA_FIELD_MAX_BYTES).filter(key => Object.hasOwn(lists, key))
    .flatMap(key => arrayNames(key).map(name => ({key, name, bytes: listBytes(fieldList(metadata, key, name))})))
    .filter(list => list.bytes > 0).sort((a,b) => b.bytes - a.bytes);
  for (const {key, name} of scenarioLists) {
    metadata = shortenField(metadata, key, withinBlock, [name]);
    if (withinBlock(metadata)) return metadata;
  }
  for (const key of summaryLists) {
    metadata = shortenField(metadata, key, withinBlock);
    if (withinBlock(metadata)) return metadata;
  }
}

// A receipt supplies the base projection. Other producers add their own fields.
// Give operationId/state when starting a block outside a node or Save reply.
export function withLoginomMetadata(reply, {
  receipt, operationId = receipt?.operationId, state = receipt?.state, dropped = [], omitted = {}, ...fields
}) {
  const existing = reply._meta?.loginom;
  if (existing !== undefined && existing?.v !== 1) return reply;
  if (existing && operationId !== undefined && existing.operationId !== operationId) return reply;
  operationId = existing?.operationId ?? operationId;
  state = receipt?.state ?? existing?.state ?? state;
  if (typeof operationId !== 'string' || !operationId || !['running', 'settled'].includes(state)) return reply;

  const base = Object.fromEntries(Object.entries(receipt ?? {}).filter(([key]) => receiptKeys.has(key)));
  let metadata = fit({...base, ...existing, v: 1, operationId, state});
  if (!metadata) return reply;
  let updated = receipt !== undefined;
  const annotateDrop = key => {
    const next = fit(noteDropped(metadata, key));
    if (!next) return;
    metadata = next;
    updated = true;
  };
  const unknown = [
    ...Object.keys(fields),
    ...Object.keys(receipt ?? {}).filter(key => !receiptKeys.has(key)),
  ].filter(key => !Object.hasOwn(LOGINOM_METADATA_FIELD_MAX_BYTES, key));
  for (const key of [...dropped, ...unknown]) if (key) annotateDrop(key);
  // Keep small status/evidence fields before adding material that can be shortened.
  const fieldsByPriority = Object.entries(LOGINOM_METADATA_FIELD_MAX_BYTES)
    .sort(([a], [b]) => Number(Object.hasOwn(lists, a)) - Number(Object.hasOwn(lists, b)));
  for (const [key, limit] of fieldsByPriority) {
    const value = fields[key] !== undefined ? fields[key] : existing?.[key] === undefined ? receipt?.[key] : undefined;
    if (value === undefined) continue;
    if (!Number.isFinite(loginomMetadataBytes(value))) {
      annotateDrop(key);
      continue;
    }
    const withinField = candidate => loginomMetadataBytes(candidate[key]) <= limit;
    const incoming = key === 'evidence' && Array.isArray(value) && Array.isArray(metadata.evidence)
      ? mergeEvidence(metadata.evidence, value) : value;
    let patch = {...metadata, [key]: incoming};
    if (fields[key] !== undefined) {
      if (patch.omitted && key !== 'evidence') {
        const retained = Object.fromEntries(Object.entries(patch.omitted).filter(([path]) => !ownsCount(key, path)));
        if (Object.keys(retained).length) patch.omitted = retained;
        else delete patch.omitted;
      }
      for (const [path, count] of Object.entries(omitted))
        if (ownsCount(key, path) && path.length <= 64 && Number.isSafeInteger(count) && count >= 0)
          patch = noteOmitted(patch, path, count);
    }
    const candidate = shortenField(patch, key, withinField);
    const next = withinField(candidate) && fit(candidate);
    if (next) {
      metadata = next;
      updated = true;
    } else annotateDrop(key);
  }
  return updated ? {...reply, _meta: {...reply._meta, loginom: metadata}} : reply;
}

const ownsCount = (key, path) => path === key || path.startsWith(key + '.');

function mergeEvidence(existing, updates) {
  const known = new Set(existing.map(value => JSON.stringify(value)));
  return [...existing, ...updates.filter(value => {
    const json = JSON.stringify(value);
    if (known.has(json)) return false;
    known.add(json);
    return true;
  })];
}
