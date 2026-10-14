import type { ServerIdentity } from "./slots"
import type { summarizeResourceSamples } from "./parallel-resource-summary"
import path from "node:path"
import { validResourceBound } from "./parallel-resource-budget"
import { serverStorageBinding } from "./parallel-resource-storage"

type ResourceOwner = { kind: string; id: string; launcher: { pid: number; starttime: string } }

export function assessProcessResourceTimeline(input: { samples: readonly unknown[]; intervalMs: number; owners: (ResourceOwner & { startedAt: string; finishedAt: string })[] }) {
  const checks = input.owners.map(owner => {
    const timeline = assessResourceTimeline({ samples: input.samples, intervalMs: input.intervalMs, startedAt: owner.startedAt, finishedAt: owner.finishedAt })
    if (timeline.status !== "passed") return timeline
    const active = input.samples.filter(value => {
      const time = Date.parse(String(acceptanceObject(acceptanceObject(value).host).observed_at))
      return time >= Date.parse(owner.startedAt) && time <= Date.parse(owner.finishedAt)
    })
    return active.length && active.every(sample => processOwnerObserved(sample, owner))
      ? { status: "passed" as const, codes: [] } : { status: "incomplete" as const, codes: ["PROCESS_RESOURCE_TIMELINE_INCOMPLETE"] }
  })
  return { status: checks.some(check => check.status === "failed") ? "failed" as const : checks.some(check => check.status === "incomplete") ? "incomplete" as const : "passed" as const,
    codes: [...new Set(checks.flatMap(check => check.codes))] }
}

// Checks the caller's declared resource scopes; full live admission also requires the frozen manifest and other gates.
export async function checkResourceEvidence(input: {
  file: string; samplesFile: string; runId: string; startedAt: string; finishedAt: string
  coverage: Omit<Parameters<typeof assessResourceCoverage>[0], "samples">
  processWindows: Parameters<typeof assessProcessResourceTimeline>[0]["owners"]
  view: Parameters<typeof assessCgroupCoverage>[0]["view"]; budget: { file: string; sha256: string } | null
}) {
  const { readFrozenResourceBudget, readResourceEvidence } = await import("./parallel-resource-evidence")
  const evidence = await readResourceEvidence({ file: input.file, samplesFile: input.samplesFile, runId: input.runId, phase: "run" })
  const budget = input.budget ? await readFrozenResourceBudget({ ...input.budget, runId: input.runId, startedAt: input.startedAt }) : null
  const groups = evidence.samples.flatMap(value => {
    const sample = acceptanceObject(value), host = acceptanceObject(sample.host), processes = acceptanceObject(sample.processes)
    return [host.collector_cgroup,
      ...(Array.isArray(sample.containers) ? sample.containers.map(value => acceptanceObject(value).cgroup) : []),
      ...(Array.isArray(processes.scopes) ? processes.scopes.flatMap(value => {
        const scope = acceptanceObject(value)
        return Array.isArray(scope.processes) ? scope.processes.map(value => acceptanceObject(value).cgroup) : []
      }) : [])]
  })
  const checks = {
    timeline: assessResourceTimeline({ samples: evidence.samples, intervalMs: 1000, startedAt: input.startedAt, finishedAt: input.finishedAt }),
    coverage: assessResourceCoverage({ ...input.coverage, samples: evidence.samples }),
    processTimeline: input.processWindows.length === input.coverage.owners.length && input.coverage.owners.every(owner =>
      input.processWindows.filter(window => window.kind === owner.kind && window.id === owner.id &&
        window.launcher.pid === owner.launcher.pid && window.launcher.starttime === owner.launcher.starttime).length === 1) &&
      new Set(input.coverage.owners.map(owner => JSON.stringify([owner.kind, owner.id, owner.launcher.pid, owner.launcher.starttime]))).size === input.coverage.owners.length
      ? assessProcessResourceTimeline({ samples: evidence.samples, intervalMs: 1000, owners: input.processWindows })
      : { status: "incomplete" as const, codes: ["PROCESS_RESOURCE_WINDOWS_INCOMPLETE"] },
    cgroups: assessCgroupCoverage({ groups, view: input.view }),
    budget: assessResourceBudget({ runId: input.runId, startedAt: input.startedAt, budget, summary: evidence.receipt.summary }),
    incidents: assessResourceIncidents({ samples: evidence.samples, summary: evidence.receipt.summary }),
  }
  const results = Object.values(checks)
  return { status: results.some(result => result.status === "failed") ? "failed" as const : results.some(result => result.status === "incomplete") ? "incomplete" as const : "passed" as const,
    codes: [...new Set(results.flatMap(result => result.codes))], checks, source: evidence.receipt.source, budget_source: input.budget }
}

export function assessResourceIncidents(input: { samples: readonly unknown[]; summary: ReturnType<typeof summarizeResourceSamples> }) {
  const counters = input.summary.metrics.filter(series => ["memory_events.oom", "memory_events.oom_kill"].includes(series.metric))
  const containers = input.samples.flatMap(value => {
    const containers = acceptanceObject(value).containers
    return Array.isArray(containers) ? containers.map(value => acceptanceObject(acceptanceObject(value).inspect)) : []
  })
  const codes = [...(counters.some(series => (series.counter_increases ?? 0) > 0) ? ["CGROUP_OOM_OBSERVED"] : []),
    ...(containers.some(inspect => inspect.oom_killed === true) ? ["CONTAINER_OOM_OBSERVED"] : [])]
  if (codes.length) return { status: "failed" as const, codes }
  if (containers.some(inspect => typeof inspect.oom_killed !== "boolean"))
    return { status: "incomplete" as const, codes: ["CONTAINER_OOM_OBSERVATIONS_INCOMPLETE"] }
  // Applicability and entirely unavailable counters are handled by the cgroup coverage gate.
  if (counters.some(series => series.observed > 0 && (series.observed < 2 || series.missing > 0 || (series.counter_resets ?? 0) > 0)))
    return { status: "incomplete" as const, codes: ["CGROUP_OOM_OBSERVATIONS_INCOMPLETE"] }
  return { status: "passed" as const, codes: [] }
}

export function assessResourceTimeline(input: { samples: readonly unknown[]; intervalMs: number; startedAt: string; finishedAt: string }) {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1) return { status: "incomplete" as const, codes: ["RESOURCE_INTERVAL_INVALID"] }
  if (input.samples.length < 2) return { status: "incomplete" as const, codes: ["RESOURCE_SAMPLES_MISSING"] }
  const samples = input.samples.map(acceptanceObject)
  const times = samples.map(sample => {
    const time = acceptanceObject(sample.host).observed_at
    return typeof time === "string" ? Date.parse(time) : NaN
  })
  const started = Date.parse(input.startedAt), finished = Date.parse(input.finishedAt)
  if (![started, finished, ...times].every(Number.isFinite)) return { status: "incomplete" as const, codes: ["RESOURCE_TIME_UNVERIFIED"] }
  if (finished < started) return { status: "failed" as const, codes: ["RESOURCE_EXECUTION_WINDOW_INVALID"] }
  if (times[0]! > started || times.at(-1)! < finished)
    return { status: "incomplete" as const, codes: ["RESOURCE_TIMELINE_UNBRACKETED"] }
  if (samples.some((sample, index) => sample.sequence !== index + 1 || sample.interval_ms !== input.intervalMs || sample.missed_intervals !== 0 ||
    typeof sample.elapsed_ms !== "number" || !Number.isFinite(sample.elapsed_ms) || sample.elapsed_ms < 0 || index > 0 && (
      sample.elapsed_ms <= Number(samples[index - 1]!.elapsed_ms) || sample.elapsed_ms - Number(samples[index - 1]!.elapsed_ms) >= input.intervalMs * 2 ||
      times[index]! < times[index - 1]! || times[index]! - times[index - 1]! >= input.intervalMs * 2)))
    return { status: "incomplete" as const, codes: ["RESOURCE_CADENCE_INCOMPLETE"] }
  return { status: "passed" as const, codes: [] }
}

// The expected view must be qualified outside actor namespaces and fixed in the manifest.
export function assessCgroupCoverage(input: { groups: readonly unknown[]; view: { namespace: string; root: { device: number; inode: number } } }) {
  if (!input.groups.length)
    return { status: "incomplete" as const, codes: ["CGROUP_RESOURCE_COVERAGE_INCOMPLETE"] }
  const groups = input.groups.map(acceptanceObject)
  if (groups.some(group => {
    if (!group.view) return false
    const view = acceptanceObject(group.view), root = acceptanceObject(view.root)
    return view.namespace !== input.view.namespace || root.device !== input.view.root.device || root.inode !== input.view.root.inode
  })) return { status: "failed" as const, codes: ["CGROUP_VIEW_MISMATCH"] }
  if (input.groups.some(value => value === null || value === undefined)) return { status: "incomplete" as const, codes: ["CGROUP_RESOURCE_COVERAGE_INCOMPLETE"] }
  if (groups.some(group => !group.view)) return { status: "incomplete" as const, codes: ["CGROUP_VIEW_UNAVAILABLE"] }
  if (groups.some(group => {
    if (typeof group.path !== "string" || !path.posix.isAbsolute(group.path) || path.posix.normalize(group.path) !== group.path || !Array.isArray(group.ancestors)) return true
    const expected = group.path.split("/").filter(Boolean).map((_, index, parts) => "/" + parts.slice(0, -index - 1).join("/"))
    return group.ancestors.length !== expected.length || group.ancestors.some((value, index) => acceptanceObject(value).path !== expected[index])
  })) return { status: "incomplete" as const, codes: ["CGROUP_HIERARCHY_UNVERIFIED"] }
  const scopes = groups.flatMap(group => [group, ...(group.ancestors as unknown[]).map(acceptanceObject)])
  if (scopes.some(scope => scope.path !== "/" && Array.isArray(scope.controllers) && (
    !scope.controllers.includes("cpu") && [scope.cpu_max, scope.cpu_throttling].some(value => value !== null && value !== undefined) ||
    !scope.controllers.includes("memory") && [scope.memory_current_bytes, scope.memory_limit_bytes, scope.swap_current_bytes, scope.swap_limit_bytes, scope.memory_events]
      .some(value => value !== null && value !== undefined)))) return { status: "incomplete" as const, codes: ["CGROUP_CONTROLLER_STATE_INCONSISTENT"] }
  if (scopes.some(scope => {
    if (!Array.isArray(scope.controllers) || !resourceNumbersObserved(scope.cpu_usage, ["usage_usec", "user_usec", "system_usec"])) return true
    // The expected global view above makes / the hierarchy root, whose limit interfaces are non-root only.
    if (scope.path === "/") return false
    if (scope.controllers.includes("cpu")) {
      const quota = acceptanceObject(scope.cpu_max)
      if (quota.quota_usec !== "max" && (!Number.isSafeInteger(quota.quota_usec) || Number(quota.quota_usec) < 1) ||
        !Number.isSafeInteger(quota.period_usec) || Number(quota.period_usec) < 1 ||
        !resourceNumbersObserved(scope.cpu_throttling, ["nr_periods", "nr_throttled", "throttled_usec"])) return true
    }
    return scope.controllers.includes("memory") && (!resourceNumbersObserved(scope, ["memory_current_bytes", "swap_current_bytes"]) ||
      !resourceNumbersObserved(scope.memory_events, ["oom", "oom_kill"]) || ["memory_limit_bytes", "swap_limit_bytes"].some(key =>
        scope[key] !== "max" && (!Number.isSafeInteger(scope[key]) || Number(scope[key]) < 0)))
  })) return { status: "incomplete" as const, codes: ["CGROUP_COUNTERS_INCOMPLETE"] }
  return { status: "passed" as const, codes: [] }
}

export function assessResourceCoverage(input: {
  samples: readonly unknown[]; paths: string[]
  containers: { role: "server" | "studio"; id: string; image: string; startedAt: string; name: string; nonce: string; purpose: string }[]
  owners: ResourceOwner[]
}) {
  if (!input.samples.length) return { status: "incomplete" as const, codes: ["RESOURCE_SAMPLES_MISSING"] }
  if (input.samples.some(value => {
    const host = acceptanceObject(acceptanceObject(value).host), cpu = acceptanceObject(host.cpu)
    return !Array.isArray(cpu.ticks) || cpu.ticks.length < 8 || !cpu.ticks.every(value => Number.isSafeInteger(value) && Number(value) >= 0) ||
      !resourceNumbersObserved(host.memory, ["available_bytes", "total_bytes", "swap_free_bytes", "swap_total_bytes"])
  })) return { status: "incomplete" as const, codes: ["HOST_RESOURCE_COVERAGE_INCOMPLETE"] }
  if (input.samples.some(value => input.paths.some(path => {
    const files = acceptanceObject(acceptanceObject(value).host).filesystems
    const file = Array.isArray(files) ? files.find(value => acceptanceObject(value).path === path) : undefined
    return !resourceNumbersObserved(acceptanceObject(file).capacity, ["available_bytes", "total_bytes", "available_inodes", "total_inodes"])
  }))) return { status: "incomplete" as const, codes: ["FILESYSTEM_RESOURCE_COVERAGE_INCOMPLETE"] }
  const containers = input.samples.flatMap(value => input.containers.map(target => {
    const values = acceptanceObject(value).containers
    const matches = Array.isArray(values) ? values.filter(value => acceptanceObject(value).role === target.role) : []
    const container = acceptanceObject(matches[0]), inspect = acceptanceObject(container.inspect)
    if (matches.length !== 1 || container.epoch_stable !== true || inspect.running !== true) return { missing: true, mismatch: false, storageMissing: false, storageMismatch: false }
    const mismatch = container.container_id !== target.id || inspect.id !== target.id || inspect.image !== target.image ||
      inspect.name !== `/${target.name}` || inspect.started_at !== target.startedAt || inspect.owner_kind !== "users" ||
      inspect.owner_nonce !== target.nonce || inspect.purpose !== target.purpose
    const io = container.io
    const missing = !resourceNumbersObserved(container.cpu, ["total_usage_ns"]) || !resourceNumbersObserved(container.memory, ["current_bytes", "limit_bytes"]) ||
      !resourceNumbersObserved(container.pids, ["current"]) || !Array.isArray(io) || !io.length || io.some(value => {
        const entry = acceptanceObject(value)
        return typeof entry.op !== "string" || !resourceNumbersObserved(entry, ["major", "minor", "bytes"])
      })
    const storage = acceptanceObject(container.storage), files = storage.filesystems
    const binding = target.role === "server" ? serverStorageBinding(container) : "unavailable"
    const storageMissing = target.role === "server" && (binding !== "matched" || ["/workdir/UserStorage", "/workdir/SessionBackup"].some(path => {
      const matches = Array.isArray(files) ? files.filter(value => acceptanceObject(value).path === path) : []
      return matches.length !== 1 || !resourceNumbersObserved(acceptanceObject(matches[0]).capacity, ["available_bytes", "total_bytes", "available_inodes", "total_inodes"])
    }))
    return { missing, mismatch, storageMissing, storageMismatch: target.role === "server" && binding === "mismatched" }
  }))
  if (containers.some(entry => entry.mismatch)) return { status: "failed" as const, codes: ["CONTAINER_RESOURCE_IDENTITY_MISMATCH"] }
  if (containers.some(entry => entry.storageMismatch)) return { status: "failed" as const, codes: ["SERVER_STORAGE_IDENTITY_MISMATCH"] }
  if (containers.some(entry => entry.missing)) return { status: "incomplete" as const, codes: ["CONTAINER_RESOURCE_COVERAGE_INCOMPLETE"] }
  if (containers.some(entry => entry.storageMissing)) return { status: "incomplete" as const, codes: ["SERVER_FILESYSTEM_COVERAGE_INCOMPLETE"] }
  if (input.owners.some(owner => !input.samples.some(sample => processOwnerObserved(sample, owner))))
    return { status: "incomplete" as const, codes: ["PROCESS_RESOURCE_COVERAGE_INCOMPLETE"] }
  return { status: "passed" as const, codes: [] }
}

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

function resourceNumbersObserved(value: unknown, keys: string[]) {
  const counters = acceptanceObject(value)
  return keys.every(key => Number.isSafeInteger(counters[key]) && Number(counters[key]) >= 0)
}

function processOwnerObserved(value: unknown, owner: ResourceOwner) {
  const producer = acceptanceObject(acceptanceObject(value).processes)
  return Array.isArray(producer.scopes) && producer.scopes.some(value => {
    const scope = acceptanceObject(value), observed = acceptanceObject(scope.owner), launcher = acceptanceObject(scope.launcher)
    if (observed.kind !== owner.kind || observed.id !== owner.id || launcher.pid !== owner.launcher.pid || launcher.starttime !== owner.launcher.starttime ||
      scope.status !== "observed" || !Array.isArray(scope.processes) || !scope.processes.length) return false
    return scope.processes.every(value => {
      const process = acceptanceObject(value)
      return process.verified === true && resourceNumbersObserved(process, ["rss_bytes"]) && resourceNumbersObserved(process.cpu, ["user_ticks", "system_ticks"])
    }) && scope.processes.some(value => {
      const identity = acceptanceObject(acceptanceObject(value).identity)
      return identity.pid === owner.launcher.pid && identity.starttime === owner.launcher.starttime
    })
  })
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
