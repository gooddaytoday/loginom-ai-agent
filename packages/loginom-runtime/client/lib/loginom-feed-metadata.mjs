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
  manualEdits: [],
  evidence: [],
  savedPackageGraph: ['savedLabels', 'uncheckedSorting', 'changes'],
  packageVariables: ['usages', 'defaults', 'definitions'],
};

export function loginomMetadataBytes(value) {
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return Buffer.byteLength(json, 'utf8');
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

function shortenField(metadata, key, fits) {
  if (!Object.hasOwn(lists, key)) return metadata;
  const nested = lists[key];
  for (const name of nested.length ? nested : [undefined]) {
    if (fits(metadata)) break;
    const value = metadata[key];
    const items = name ? value?.[name] : value;
    if (!Array.isArray(items) || !items.length) continue;
    const path = name ? key + '.' + name : key;
    metadata = shorten(items, length => {
      const prefix = items.slice(0, length);
      const shortened = name ? {...value, [name]: prefix} : prefix;
      if (key === 'packageVariables' && (name === 'definitions' || name === 'defaults')
        && shortened[name + 'Coverage'] === 'complete') shortened[name + 'Coverage'] = 'partial';
      return noteOmitted({...metadata, [key]: shortened}, path, items.length - length);
    }, fits);
  }
  return metadata;
}

const withinBlock = metadata => loginomMetadataBytes(metadata) <= LOGINOM_METADATA_MAX_BYTES;

function fit(metadata, incoming) {
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
  for (const key of incoming ? [incoming] : Object.keys(lists).filter(key => key !== 'limitations')) {
    if (withinBlock(metadata)) return metadata;
    metadata = shortenField(metadata, key, withinBlock);
  }
  if (withinBlock(metadata)) return metadata;
}

// A receipt supplies the base projection. Other producers add their own fields.
// Give operationId/state when starting a block outside a node or Save reply.
export function withLoginomMetadata(reply, {
  receipt, operationId = receipt?.operationId, state = receipt?.state, dropped = [], ...fields
}) {
  const existing = reply._meta?.loginom;
  if (existing !== undefined && existing?.v !== 1) return reply;
  if (existing && operationId !== undefined && existing.operationId !== operationId) return reply;
  operationId = existing?.operationId ?? operationId;
  state = receipt?.state ?? existing?.state ?? state;
  if (typeof operationId !== 'string' || !operationId || !['running', 'settled'].includes(state)) return reply;

  const base = {...receipt};
  for (const key of Object.keys(LOGINOM_METADATA_FIELD_MAX_BYTES)) delete base[key];
  let metadata = fit({...base, ...existing, v: 1, operationId, state});
  if (!metadata) return reply;
  let updated = receipt !== undefined;
  const annotateDrop = key => {
    const next = fit(noteDropped(metadata, key));
    if (!next) return;
    metadata = next;
    updated = true;
  };
  for (const key of dropped) annotateDrop(key);
  for (const [key, limit] of Object.entries(LOGINOM_METADATA_FIELD_MAX_BYTES)) {
    const value = fields[key] !== undefined ? fields[key] : existing?.[key] === undefined ? receipt?.[key] : undefined;
    if (value === undefined) continue;
    if (!Number.isFinite(loginomMetadataBytes(value))) {
      annotateDrop(key);
      continue;
    }
    const withinField = candidate => loginomMetadataBytes(candidate[key]) <= limit;
    const incoming = key === 'evidence' && Array.isArray(value) && Array.isArray(metadata.evidence)
      ? mergeEvidence(metadata.evidence, value) : value;
    const candidate = shortenField({...metadata, [key]: incoming}, key, withinField);
    const next = withinField(candidate) && fit(candidate, key);
    if (next) {
      metadata = next;
      updated = true;
    } else annotateDrop(key);
  }
  return updated ? {...reply, _meta: {...reply._meta, loginom: metadata}} : reply;
}

function mergeEvidence(existing, updates) {
  const known = new Set(existing.map(value => JSON.stringify(value)));
  return [...existing, ...updates.filter(value => {
    const json = JSON.stringify(value);
    if (known.has(json)) return false;
    known.add(json);
    return true;
  })];
}
