import type { ServerIdentity } from "./slots"
import type { summarizeResourceSamples } from "./parallel-resource-summary"

// Declared bounds only; required scope coverage and source integrity are separate gates.
export function assessResourceBudget(input: { runId: string; startedAt: string; budget: unknown; summary: ReturnType<typeof summarizeResourceSamples> | null }) {
  if (input.budget === null || input.budget === undefined) return { status: "incomplete" as const, codes: ["RESOURCE_BUDGET_MISSING"] }
  const budget = acceptanceObject(input.budget)
  if (budget.version !== 1 || budget.kind !== "parallel-resource-budget" || typeof budget.run_id !== "string" || !budget.run_id.trim() ||
    !Array.isArray(budget.bounds) || !budget.bounds.length || !budget.bounds.every(validResourceBound))
    return { status: "incomplete" as const, codes: ["RESOURCE_BUDGET_INVALID"] }
  if (budget.run_id !== input.runId) return { status: "failed" as const, codes: ["RESOURCE_BUDGET_RUN_MISMATCH"] }
  const fixed = typeof budget.fixed_at === "string" ? Date.parse(budget.fixed_at) : NaN
  const started = Date.parse(input.startedAt)
  if (!Number.isFinite(fixed) || !Number.isFinite(started)) return { status: "incomplete" as const, codes: ["RESOURCE_BUDGET_TIME_UNVERIFIED"] }
  if (fixed >= started) return { status: "failed" as const, codes: ["RESOURCE_BUDGET_NOT_FIXED_BEFORE_RUN"] }
  if (!input.summary || input.summary.samples < 1) return { status: "incomplete" as const, codes: ["RESOURCE_SAMPLES_MISSING"] }
  const bounds = budget.bounds.map(acceptanceObject)
  const observations = bounds.map(bound => ({ bound, series: input.summary!.metrics.find(series => series.scope === bound.scope && series.metric === bound.metric) }))
  if (observations.some(entry => entry.series && (typeof entry.bound.minimum === "number" && entry.series.min !== null && entry.series.min < entry.bound.minimum ||
    typeof entry.bound.maximum === "number" && entry.series.peak !== null && entry.series.peak > entry.bound.maximum)))
    return { status: "failed" as const, codes: ["RESOURCE_BUDGET_EXCEEDED"] }
  if (input.summary.missed_intervals > 0 || observations.some(entry => !entry.series || entry.series.observed < 1 || entry.series.missing > 0 || (entry.series.counter_resets ?? 0) > 0))
    return { status: "incomplete" as const, codes: ["RESOURCE_OBSERVATIONS_INCOMPLETE"] }
  return { status: "passed" as const, codes: [] }
}

// Other licence-counting scopes require a qualified producer contract before admission.
export function assessParallelLicence(input: { identity: ServerIdentity; users: string[]; receipt: unknown }) {
  if (input.receipt === null || input.receipt === undefined) return { status: "incomplete" as const, codes: ["LICENCE_EVIDENCE_MISSING"] }
  if (!input.users.length || new Set(input.users).size !== input.users.length || input.users.some(user => !user.trim()))
    return { status: "incomplete" as const, codes: ["LICENCE_SELECTED_USERS_UNVERIFIED"] }
  const receipt = acceptanceObject(input.receipt)
  if (receipt.version !== 1 || receipt.kind !== "loginom-licence-receipt")
    return { status: "incomplete" as const, codes: ["LICENCE_RECEIPT_INVALID"] }
  const server = acceptanceObject(receipt.server)
  if (Object.keys(input.identity).some(key => typeof server[key] !== "string" || !server[key]))
    return { status: "incomplete" as const, codes: ["LICENCE_SERVER_IDENTITY_UNVERIFIED"] }
  if (Object.entries(input.identity).some(([key, value]) => server[key] !== value))
    return { status: "failed" as const, codes: ["LICENCE_SERVER_IDENTITY_MISMATCH"] }
  if (receipt.status === "denied") return { status: "failed" as const, codes: ["LICENCE_DENIED"] }
  if (typeof receipt.licence_type !== "string" || !receipt.licence_type.trim()) return { status: "incomplete" as const, codes: ["LICENCE_RECEIPT_INVALID"] }
  if (receipt.readback !== "confirmed") return { status: "incomplete" as const, codes: ["LICENCE_READBACK_UNPROVEN"] }
  if (receipt.status !== "issued") return { status: "incomplete" as const, codes: ["LICENCE_ISSUANCE_UNPROVEN"] }
  if (receipt.session_limit !== "unlimited" && (!Number.isSafeInteger(receipt.session_limit) || Number(receipt.session_limit) < 1))
    return { status: "incomplete" as const, codes: ["LICENCE_LIMIT_UNKNOWN"] }
  if (receipt.limit_scope !== "all_sessions") return { status: "incomplete" as const, codes: ["LICENCE_LIMIT_SCOPE_UNPROVEN"] }
  if (!Number.isSafeInteger(receipt.session_count) || Number(receipt.session_count) < 1) return { status: "incomplete" as const, codes: ["LICENCE_SESSION_COUNT_UNKNOWN"] }
  if (!Number.isSafeInteger(receipt.admin_sessions) || Number(receipt.admin_sessions) < 1) return { status: "incomplete" as const, codes: ["LICENCE_ADMIN_CONCURRENCY_UNPROVEN"] }
  if (!Array.isArray(receipt.connected_users) || receipt.connected_users.some(user => typeof user !== "string" || !user.trim()) || new Set(receipt.connected_users).size !== receipt.connected_users.length ||
    !input.users.every(user => (receipt.connected_users as unknown[]).includes(user))) return { status: "incomplete" as const, codes: ["LICENCE_USER_CONCURRENCY_UNPROVEN"] }
  if (Number(receipt.session_count) < receipt.connected_users.length + Number(receipt.admin_sessions)) return { status: "incomplete" as const, codes: ["LICENCE_CONCURRENCY_UNPROVEN"] }
  if (receipt.session_limit !== "unlimited" && Number(receipt.session_count) > Number(receipt.session_limit))
    return { status: "failed" as const, codes: ["LICENCE_SESSION_LIMIT_EXCEEDED"] }
  return { status: "passed" as const, codes: [] }
}

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

function validResourceBound(value: unknown) {
  const bound = acceptanceObject(value)
  return typeof bound.scope === "string" && Boolean(bound.scope.trim()) && typeof bound.metric === "string" && Boolean(bound.metric.trim()) &&
    [bound.minimum, bound.maximum].every(value => value === null || typeof value === "number" && Number.isFinite(value) && value >= 0) &&
    (bound.minimum !== null || bound.maximum !== null) && (bound.minimum === null || bound.maximum === null || Number(bound.minimum) <= Number(bound.maximum))
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
