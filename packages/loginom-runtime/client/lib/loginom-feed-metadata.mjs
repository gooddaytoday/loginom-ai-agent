export const LOGINOM_METADATA_MAX_BYTES = 16 * 1024;
export const LOGINOM_METADATA_FIELD_MAX_BYTES = Object.freeze({
  busy: 256,
  step: 2 * 1024,
  manualEdits: 4 * 1024,
  verificationStale: 5,
  savedPackageGraph: 8 * 1024,
});

export function loginomMetadataBytes(value) {
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return Buffer.byteLength(json, 'utf8');
  } catch { /* A field that cannot cross IPC does not have a byte budget. */ }
  return Infinity;
}

function fit(metadata) {
  if (loginomMetadataBytes(metadata) <= LOGINOM_METADATA_MAX_BYTES) return metadata;
  if (!Array.isArray(metadata.ports)) return;

  const ports = metadata.ports.slice();
  const result = {...metadata, ports};
  for (let index = ports.length - 1; index >= 0; index--) {
    const {preview, ...port} = ports[index];
    if (!preview) continue;
    const sample = Array.isArray(preview.sample) ? preview.sample.slice() : [];
    while (sample.length > 1) {
      sample.pop();
      ports[index] = {...port, preview: {...preview, sample, sampleComplete: false}};
      if (loginomMetadataBytes(result) <= LOGINOM_METADATA_MAX_BYTES) return result;
    }
    ports[index] = port;
    if (loginomMetadataBytes(result) <= LOGINOM_METADATA_MAX_BYTES) return result;
  }
}

// A node receipt supplies the base projection. Other producers add only their
// own fields. Give operationId/state when starting a block outside a node reply.
export function withLoginomMetadata(reply, {receipt, operationId = receipt?.operationId, state = receipt?.state, ...fields}) {
  const existing = reply._meta?.loginom;
  if (existing !== undefined && existing?.v !== 1) return reply;
  // A result can refer to a previous step. Do not mix facts for different operations.
  if (existing && operationId !== undefined && existing.operationId !== operationId) return reply;
  operationId = existing?.operationId ?? operationId;
  state = receipt?.state ?? existing?.state ?? state;
  if (typeof operationId !== 'string' || !operationId || !['running', 'settled'].includes(state)) return reply;

  let metadata = fit({...receipt, ...existing, v: 1, operationId, state});
  if (!metadata) return reply;
  let updated = receipt !== undefined;
  for (const [key, limit] of Object.entries(LOGINOM_METADATA_FIELD_MAX_BYTES)) {
    const value = fields[key];
    if (value === undefined || loginomMetadataBytes(value) > limit) continue;
    const next = fit({...metadata, [key]: value});
    if (!next) continue;
    metadata = next;
    updated = true;
  }
  return updated ? {...reply, _meta: {...reply._meta, loginom: metadata}} : reply;
}
