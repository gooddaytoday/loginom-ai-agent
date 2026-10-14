// Receipt policy only: trusted producers must prove coverage before declaring it complete.
export function assessParallelLimits(input: unknown) {
  const receipt = acceptanceObject(input)
  const events = Array.isArray(receipt.events) ? receipt.events : []
  const codes = events.flatMap(value => {
    const event = acceptanceObject(value)
    if (["provider", "dock", "judge"].includes(String(event.source))) {
      if (event.status === 429) return [`${String(event.source).toUpperCase()}_HTTP_429`]
      if (event.kind === "rate_limit" || event.kind === "quota_limit") return [`${String(event.source).toUpperCase()}_${event.kind.toUpperCase()}`]
    }
    if (event.source === "loginom" && (event.kind === "licence_denied" || event.kind === "session_limit")) return [`LOGINOM_${event.kind.toUpperCase()}`]
    if (event.source === "host" && (event.kind === "oom" || event.kind === "enospc")) return [`HOST_${event.kind.toUpperCase()}`]
    return []
  })
  const coverage = acceptanceObject(receipt.coverage)
  const incomplete = ["provider", "dock", "judge"].flatMap(source => coverage[source] === "complete" ? [] : [`${source.toUpperCase()}_OBSERVABILITY_INCOMPLETE`])
  if (!Array.isArray(receipt.events)) incomplete.push("LIMIT_EVENTS_MISSING")
  if (events.some(event => !validLimitEvent(event))) incomplete.push("LIMIT_EVENT_INVALID")
  return { status: codes.length ? "failed" as const : incomplete.length ? "incomplete" as const : "passed" as const, codes: [...codes, ...incomplete] }
}

function validLimitEvent(value: unknown) {
  const event = acceptanceObject(value)
  if (["provider", "dock", "judge"].includes(String(event.source))) {
    if (event.status !== undefined && (!Number.isInteger(event.status) || Number(event.status) < 100 || Number(event.status) > 599)) return false
    if (event.kind === "http") return Number.isInteger(event.status) && Number(event.status) >= 100 && Number(event.status) <= 599
    return ["rate_limit", "quota_limit", "other"].includes(String(event.kind))
  }
  if (event.source === "loginom") return ["licence_denied", "session_limit", "other"].includes(String(event.kind))
  if (event.source === "host") return ["oom", "enospc", "other"].includes(String(event.kind))
  return false
}

function acceptanceObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
