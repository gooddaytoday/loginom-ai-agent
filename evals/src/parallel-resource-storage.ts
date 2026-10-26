export function serverStorageBinding(value: unknown) {
  const container = storageObject(value), storage = storageObject(container.storage)
  const frame = storageObject(container.inspect), source = storageObject(storage.inspect)
  const fields = ["id", "image", "name", "started_at", "pid", "owner_kind", "owner_nonce", "purpose"]
  if (typeof container.container_id === "string" && typeof storage.container_id === "string" && container.container_id !== storage.container_id ||
    fields.some(key => frame[key] !== null && frame[key] !== undefined && source[key] !== null && source[key] !== undefined && frame[key] !== source[key]))
    return "mismatched" as const
  if (container.epoch_stable !== true || storage.epoch_stable !== true || frame.running !== true || source.running !== true ||
    typeof container.container_id !== "string" || storage.container_id !== container.container_id || frame.id !== container.container_id || source.id !== container.container_id ||
    fields.some(key => [frame, source].some(inspect => key === "pid" ? !Number.isSafeInteger(inspect[key]) || Number(inspect[key]) < 1 : typeof inspect[key] !== "string" || !String(inspect[key]).trim())))
    return "unavailable" as const
  return "matched" as const
}

function storageObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
