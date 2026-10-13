export type HandoffState = {
  issue_id: string
  phase: "admission" | "rich" | "ben" | "in_review" | "blocked"
  base_sha: string
  frozen_sha: string | null
  delivery_sha?: string | null
  executor: "Rich" | "Ben" | null
  review_cycle: number
  reject_count: number
  processed_report_ids: string[]
  last_dispatch: { id: string; phase: "rich" | "ben"; sha: string; root_trigger: string | null; task_id: string | null;
    outcome: "queued" | "coalesced" | "deferred" | "ambiguous" | "not_queued" } | null
}
export type HandoffEvidence = {
  attachment_id: string
  manifest_sha256: string
  checked_sha: string
  validation: "confirmed" | "unconfirmed"
  cleanup: "confirmed" | "unknown"
  product: "PASS" | "FAIL" | "ERROR"
  review_admission?: { kind: "recovered_author"; resolution_sha256: string }
}
export type HandoffReport = {
  kind: "report"
  id: string
  issue_id: string
  task_id: string
  phase: "rich" | "ben"
  actual_sha: string
  status: "READY_FOR_BEN" | "ACCEPT" | "REJECT" | "BLOCKED"
  evidence?: HandoffEvidence
}
export type HandoffInput = { state: HandoffState; event: HandoffReport | { kind: "dispatch"; id: string; root_trigger: string | null } |
    { kind: "receipt"; dispatch_id: string; outcome: NonNullable<HandoffState["last_dispatch"]>["outcome"]; task_id: string | null }; pending_tasks: { issue_id: string; phase: "rich" | "ben"; sha: string; task_id: string }[] }
export type HandoffDecision = { action: "ready_to_dispatch" | "dispatch" | "no_action" | "blocked" | "in_review"; reason: string; state: HandoffState; target?: "Rich" | "Ben" }

export function evaluateHandoff(value: unknown): HandoffDecision {
  const input = parseInput(value)
  if (input.event.kind === "receipt") {
    if (input.event.dispatch_id !== input.state.last_dispatch?.id) return { action: "no_action", reason: "stale dispatch receipt", state: input.state }
    if (["queued", "coalesced", "deferred"].includes(input.state.last_dispatch.outcome) &&
      (input.event.outcome !== input.state.last_dispatch.outcome ||
        (input.state.last_dispatch.task_id !== null && input.event.task_id !== input.state.last_dispatch.task_id)))
      return { action: "blocked", reason: "accepted dispatch receipt conflict requires readback", state: input.state }
    const review_cycle = input.state.review_cycle + (input.state.last_dispatch.phase === "ben" &&
      ["queued", "coalesced", "deferred"].includes(input.event.outcome) &&
      !["queued", "coalesced", "deferred"].includes(input.state.last_dispatch.outcome) ? 1 : 0)
    return { action: "no_action", reason: "receipt recorded; end turn", state: { ...input.state, review_cycle,
      last_dispatch: { ...input.state.last_dispatch, outcome: input.event.outcome, task_id: input.event.task_id } } }
  }
  if (input.event.kind === "dispatch") {
    const sha = input.state.delivery_sha ?? input.state.frozen_sha ?? input.state.base_sha
    if (input.state.last_dispatch?.phase === input.state.phase && input.state.last_dispatch.sha === sha &&
      ["queued", "coalesced", "deferred"].includes(input.state.last_dispatch.outcome))
      return { action: "no_action", reason: "dispatch already accepted", state: input.state }
    if (input.pending_tasks.some(task => task.issue_id === input.state.issue_id && task.phase === input.state.phase && task.sha === sha))
      return { action: "no_action", reason: "matching task pending", state: input.state }
    if (input.pending_tasks.length) return { action: "blocked", reason: "another task occupies the stand", state: input.state }
    if (input.state.last_dispatch?.phase === input.state.phase && input.state.last_dispatch.sha === sha && input.state.last_dispatch.outcome === "ambiguous")
      return { action: "blocked", reason: "dispatch receipt requires readback", state: input.state }
    if (!["rich", "ben"].includes(input.state.phase) || !input.state.executor)
      return { action: "no_action", reason: "not dispatchable", state: input.state }
    return { action: "dispatch", target: input.state.executor, reason: "one routed mention; record receipt then end turn",
      state: { ...input.state, last_dispatch: { id: input.event.id, phase: input.state.phase as "rich" | "ben", sha,
        root_trigger: input.event.root_trigger, task_id: null, outcome: "ambiguous" } } }
  }
  if (input.state.processed_report_ids.includes(input.event.id)) return { action: "no_action", reason: "report already processed", state: input.state }
  if (input.event.issue_id !== input.state.issue_id || input.event.phase !== input.state.phase ||
    input.state.last_dispatch?.phase !== input.event.phase || input.state.last_dispatch?.task_id !== input.event.task_id)
    return { action: "no_action", reason: "stale issue/task/phase", state: input.state }
  if (input.event.phase === "ben" && input.event.actual_sha !== input.state.frozen_sha)
    return { action: "no_action", reason: "stale frozen SHA", state: input.state }
  if (input.event.status === "BLOCKED" || (input.event.phase === "rich" ? input.event.status !== "READY_FOR_BEN" : !["ACCEPT", "REJECT"].includes(input.event.status)))
    return { action: "blocked", reason: "worker BLOCKED or invalid role status", state: { ...input.state, phase: "blocked", executor: null } }
  if (input.event.phase === "rich" && input.state.reject_count > 0 && input.event.actual_sha === input.state.frozen_sha)
    return { action: "blocked", reason: "corrections require a new SHA", state: { ...input.state, phase: "blocked", executor: null } }
  if (input.state.delivery_sha && input.event.actual_sha !== input.state.delivery_sha)
    return { action: "blocked", reason: "delivery completion must preserve the author SHA", state: { ...input.state, phase: "blocked", executor: null } }
  const evidence = input.event.evidence
  if (!evidence || evidence.checked_sha !== input.event.actual_sha ||
    evidence.validation !== "confirmed" || evidence.cleanup !== "confirmed" || (evidence.product === "ERROR" &&
      (input.event.phase !== "rich" || evidence.review_admission?.kind !== "recovered_author" || !/^[a-f0-9]{64}$/.test(evidence.review_admission.resolution_sha256))))
    return { action: "blocked", reason: "evidence/cleanup unconfirmed or infrastructure ERROR",
      state: { ...input.state, phase: "blocked", executor: null } }
  if (!evidence.attachment_id || !/^[a-f0-9]{64}$/.test(evidence.manifest_sha256)) {
    if (evidence.product === "ERROR" || input.event.phase !== "rich" || input.state.delivery_sha)
      return { action: "blocked", reason: "OWNER_ACTION_REQUIRED: incomplete delivery", state: { ...input.state, phase: "blocked", executor: null } }
    return { action: "ready_to_dispatch", target: "Rich", reason: "DELIVERABLES_REQUIRED: upload existing evidence; no new quality attempt",
      state: { ...input.state, delivery_sha: input.event.actual_sha, last_dispatch: null, processed_report_ids: [...input.state.processed_report_ids, input.event.id] } }
  }
  if (input.event.status === "ACCEPT") return { action: "in_review", reason: `ACCEPT; product ${evidence.product}`,
    state: { ...input.state, phase: "in_review", executor: null, processed_report_ids: [...input.state.processed_report_ids, input.event.id] } }
  if (input.event.status === "REJECT") {
    const reject_count = input.state.reject_count + 1
    const next = { ...input.state, reject_count, processed_report_ids: [...input.state.processed_report_ids, input.event.id] }
    if (reject_count >= 2) return { action: "in_review", reason: "OWNER_ACTION_REQUIRED: two consecutive REJECT",
      state: { ...next, phase: "in_review", executor: null } }
    return { action: "ready_to_dispatch", target: "Rich", reason: "REJECT: corrections require a new SHA",
      state: { ...next, phase: "rich", executor: "Rich" } }
  }
  return { action: "ready_to_dispatch", target: "Ben", reason: "READY_FOR_BEN",
    state: { ...input.state, phase: "ben", executor: "Ben", frozen_sha: input.event.actual_sha, delivery_sha: null,
      processed_report_ids: [...input.state.processed_report_ids, input.event.id] } }
}

function parseInput(value: unknown): HandoffInput {
  const input = record(value)
  const raw = record(input.state)
  const phase = member(raw.phase, ["admission", "rich", "ben", "in_review", "blocked"])
  const executor = raw.executor === null ? null : member(raw.executor, ["Rich", "Ben"])
  if ((phase === "rich" && executor !== "Rich") || (phase === "ben" && executor !== "Ben")) invalid()
  const dispatch = raw.last_dispatch === null ? null : record(raw.last_dispatch)
  const state: HandoffState = { issue_id: text(raw.issue_id), phase, base_sha: sha(raw.base_sha),
    frozen_sha: raw.frozen_sha === null ? null : sha(raw.frozen_sha), executor,
    ...(raw.delivery_sha !== undefined ? { delivery_sha: raw.delivery_sha === null ? null : sha(raw.delivery_sha) } : {}),
    review_cycle: count(raw.review_cycle), reject_count: count(raw.reject_count),
    processed_report_ids: array(raw.processed_report_ids).map(value => text(value)),
    last_dispatch: dispatch ? { id: text(dispatch.id), phase: member(dispatch.phase, ["rich", "ben"]), sha: sha(dispatch.sha),
      root_trigger: dispatch.root_trigger === null ? null : text(dispatch.root_trigger), task_id: dispatch.task_id === null ? null : text(dispatch.task_id),
      outcome: member(dispatch.outcome, ["queued", "coalesced", "deferred", "ambiguous", "not_queued"]) } : null }
  if (phase === "ben" && state.frozen_sha === null) invalid()
  const pending_tasks = array(input.pending_tasks).map(value => {
    const task = record(value)
    return { issue_id: text(task.issue_id), phase: member(task.phase, ["rich", "ben"]), sha: sha(task.sha), task_id: text(task.task_id) }
  })
  const event = record(input.event)
  if (event.kind === "dispatch") return { state, pending_tasks, event: { kind: "dispatch", id: text(event.id), root_trigger: event.root_trigger === null ? null : text(event.root_trigger) } }
  if (event.kind === "receipt") return { state, pending_tasks, event: { kind: "receipt", dispatch_id: text(event.dispatch_id),
    outcome: member(event.outcome, ["queued", "coalesced", "deferred", "ambiguous", "not_queued"]), task_id: event.task_id === null ? null : text(event.task_id) } }
  if (event.kind !== "report") invalid()
  const evidence = event.evidence === undefined ? undefined : record(event.evidence)
  return { state, pending_tasks, event: { kind: "report", id: text(event.id), issue_id: text(event.issue_id), task_id: text(event.task_id),
    phase: member(event.phase, ["rich", "ben"]), actual_sha: sha(event.actual_sha), status: member(event.status, ["READY_FOR_BEN", "ACCEPT", "REJECT", "BLOCKED"]),
    evidence: evidence ? { attachment_id: text(evidence.attachment_id, false), manifest_sha256: text(evidence.manifest_sha256, false), checked_sha: sha(evidence.checked_sha),
      validation: member(evidence.validation, ["confirmed", "unconfirmed"]), cleanup: member(evidence.cleanup, ["confirmed", "unknown"]),
      product: member(evidence.product, ["PASS", "FAIL", "ERROR"]),
      ...(evidence.review_admission !== undefined ? { review_admission: reviewAdmission(evidence.review_admission) } : {}) } : undefined } }
}
function invalid(): never { throw new Error("invalid handoff input") }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
function array(value: unknown): unknown[] { if (!Array.isArray(value)) invalid(); return value }
function text(value: unknown, required = true) { if (typeof value !== "string" || (required && !value.trim())) invalid(); return value }
function sha(value: unknown) { const result = text(value); if (!/^[a-f0-9]{40}$/.test(result)) invalid(); return result }
function count(value: unknown) { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid(); return value }
function member<const T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) invalid()
  return value as T
}

function reviewAdmission(value: unknown): NonNullable<HandoffEvidence["review_admission"]> {
  const admission = record(value)
  const resolution = text(admission.resolution_sha256)
  if (admission.kind !== "recovered_author" || !/^[a-f0-9]{64}$/.test(resolution) ||
    Object.keys(admission).some(key => !["kind", "resolution_sha256"].includes(key))) invalid()
  return { kind: "recovered_author", resolution_sha256: resolution }
}
