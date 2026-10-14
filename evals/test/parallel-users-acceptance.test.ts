import { expect, test } from "bun:test"
import { assessParallelLicence, assessParallelLimits, assessResourceBudget, assessResourceCoverage, assessCgroupCoverage } from "../src/parallel-acceptance"
import { sampleCgroupResources, sampleHostResources } from "../src/parallel-resources"
import os from "node:os"
import { readlink, stat } from "node:fs/promises"
import { summarizeResourceSamples } from "../src/parallel-resource-summary"

test("parallel acceptance fails on an intermediate rate limit even when the measured retry succeeds", () => {
  const receipt = {
    coverage: { provider: "complete", dock: "complete", judge: "complete" },
    events: [{ source: "provider", kind: "rate_limit", attempt: 1 }],
    quality: { attempts: [{ attempt: 1, status: "provider_error" }, { attempt: 2, status: "success", score: 1 }] },
  }
  const before = JSON.stringify(receipt)
  expect(assessParallelLimits(receipt)).toEqual({ status: "failed", codes: ["PROVIDER_RATE_LIMIT"] })
  expect(JSON.stringify(receipt)).toBe(before)
  expect(assessParallelLimits({ ...receipt, events: [] })).toEqual({ status: "passed", codes: [] })
})

test("parallel acceptance keeps unavailable provider, Dock and judge limit observations incomplete", () => {
  const coverage = { provider: "complete", dock: "complete", judge: "complete" }
  for (const source of ["provider", "dock", "judge"] as const) {
    expect(assessParallelLimits({ coverage: { ...coverage, [source]: "unavailable" }, events: [] }))
      .toEqual({ status: "incomplete", codes: [`${source.toUpperCase()}_OBSERVABILITY_INCOMPLETE`] })
  }
  expect(assessParallelLimits({ coverage })).toEqual({ status: "incomplete", codes: ["LIMIT_EVENTS_MISSING"] })
  expect(assessParallelLimits(null).status).toBe("incomplete")
  expect(assessParallelLimits({ coverage: { ...coverage, judge: "unavailable" }, events: [{ source: "provider", kind: "rate_limit" }] }))
    .toEqual({ status: "failed", codes: ["PROVIDER_RATE_LIMIT", "JUDGE_OBSERVABILITY_INCOMPLETE"] })
})

test("parallel acceptance rejects classified quota, HTTP 429, license, session, OOM and ENOSPC events", () => {
  const coverage = { provider: "complete", dock: "complete", judge: "complete" }
  const events = [
    ...["provider", "dock", "judge"].flatMap(source => [
      { event: { source, kind: "quota_limit" }, code: `${source.toUpperCase()}_QUOTA_LIMIT` },
      { event: { source, kind: "rate_limit" }, code: `${source.toUpperCase()}_RATE_LIMIT` },
      { event: { source, kind: "http", status: 429 }, code: `${source.toUpperCase()}_HTTP_429` },
    ]),
    { event: { source: "loginom", kind: "licence_denied" }, code: "LOGINOM_LICENCE_DENIED" },
    { event: { source: "loginom", kind: "session_limit" }, code: "LOGINOM_SESSION_LIMIT" },
    { event: { source: "host", kind: "oom" }, code: "HOST_OOM" },
    { event: { source: "host", kind: "enospc" }, code: "HOST_ENOSPC" },
  ]
  for (const item of events) expect(assessParallelLimits({ coverage, events: [item.event] })).toEqual({ status: "failed", codes: [item.code] })
  expect(assessParallelLimits({ coverage, events: [{ source: "provider", kind: "http", status: 200 }] }))
    .toEqual({ status: "passed", codes: [] })
})

test("parallel acceptance cannot treat malformed limit events as proof that no limits occurred", () => {
  const coverage = { provider: "complete", dock: "complete", judge: "complete" }
  for (const event of [null, {}, { source: "private-event-canary", kind: "rate_limit" },
    { source: "provider", kind: "private-event-canary" }, { source: "provider", kind: "http", status: "429" },
    { source: "provider", kind: "http", status: 0 }]) {
    expect(assessParallelLimits({ coverage, events: [event] })).toEqual({ status: "incomplete", codes: ["LIMIT_EVENT_INVALID"] })
  }
  expect(assessParallelLimits({ coverage, events: [{ source: "provider", kind: "rate_limit" }, null] }))
    .toEqual({ status: "failed", codes: ["PROVIDER_RATE_LIMIT", "LIMIT_EVENT_INVALID"] })
})

test("parallel acceptance rejects a visible HTTP 429 even if the event is labelled as another error", () => {
  expect(assessParallelLimits({ coverage: { provider: "complete", dock: "complete", judge: "complete" },
    events: [{ source: "provider", kind: "other", status: 429 }] }))
    .toEqual({ status: "failed", codes: ["PROVIDER_HTTP_429"] })
})

test("parallel acceptance validates HTTP status metadata on otherwise classified events", () => {
  const coverage = { provider: "complete", dock: "complete", judge: "complete" }
  for (const status of ["429", null, 700]) expect(assessParallelLimits({ coverage, events: [{ source: "provider", kind: "other", status }] }))
    .toEqual({ status: "incomplete", codes: ["LIMIT_EVENT_INVALID"] })
  expect(assessParallelLimits({ coverage, events: [{ source: "provider", kind: "other", status: 500 }] }))
    .toEqual({ status: "passed", codes: [] })
})


test("parallel licence policy requires evidence and accepts a complete receipt for the selected identities", () => {
  const fixture = licenceFixture()
  expect(assessParallelLicence({ ...fixture, receipt: null })).toEqual({ status: "incomplete", codes: ["LICENCE_EVIDENCE_MISSING"] })
  expect(assessParallelLicence(fixture)).toEqual({ status: "passed", codes: [] })
})

function licenceFixture() {
  const identity = { containerId: "a".repeat(64), studioContainerId: "b".repeat(64), startedAt: "2026-10-14T10:00:00Z",
    studioStartedAt: "2026-10-14T10:00:00Z", serverEpoch: "fixture-epoch", configurationHash: "c".repeat(64) }
  const users = ["eval-a", "eval-b"]
  return { identity, users, receipt: { version: 1, kind: "loginom-licence-receipt", server: { ...identity },
    status: "issued", readback: "confirmed", licence_type: "redacted-fixture-class", limit_scope: "all_sessions",
    session_limit: 3, session_count: 3, admin_sessions: 1, connected_users: [...users],
  } }
}

test("parallel licence policy cannot accept unknown issuance, readback, limits or concurrency", () => {
  const fixture = licenceFixture()
  for (const item of [
    { change: { version: 0 }, code: "LICENCE_RECEIPT_INVALID" },
    { change: { readback: "unavailable" }, code: "LICENCE_READBACK_UNPROVEN" },
    { change: { status: "unknown" }, code: "LICENCE_ISSUANCE_UNPROVEN" },
    { change: { licence_type: "" }, code: "LICENCE_RECEIPT_INVALID" },
    { change: { session_limit: null }, code: "LICENCE_LIMIT_UNKNOWN" },
    { change: { limit_scope: "unproven" }, code: "LICENCE_LIMIT_SCOPE_UNPROVEN" },
    { change: { session_count: null }, code: "LICENCE_SESSION_COUNT_UNKNOWN" },
    { change: { admin_sessions: 0 }, code: "LICENCE_ADMIN_CONCURRENCY_UNPROVEN" },
    { change: { connected_users: ["eval-a"] }, code: "LICENCE_USER_CONCURRENCY_UNPROVEN" },
    { change: { connected_users: ["eval-a", "eval-a"] }, code: "LICENCE_USER_CONCURRENCY_UNPROVEN" },
  ]) {
    expect(assessParallelLicence({ ...fixture, receipt: { ...fixture.receipt, ...item.change } }))
      .toEqual({ status: "incomplete", codes: [item.code] })
  }
})

test("parallel licence policy binds the receipt to the exact Server and Studio epochs", () => {
  const fixture = licenceFixture()
  for (const key of Object.keys(fixture.identity)) expect(assessParallelLicence({ ...fixture,
    receipt: { ...fixture.receipt, server: { ...fixture.identity, [key]: "changed" } } }))
    .toEqual({ status: "failed", codes: ["LICENCE_SERVER_IDENTITY_MISMATCH"] })
  expect(assessParallelLicence({ ...fixture, receipt: { ...fixture.receipt, server: null } }))
    .toEqual({ status: "incomplete", codes: ["LICENCE_SERVER_IDENTITY_UNVERIFIED"] })
})

test("parallel licence policy refuses denied or exceeded issuance and requires simultaneous admin and user counts", () => {
  const fixture = licenceFixture()
  expect(assessParallelLicence({ ...fixture, receipt: { ...fixture.receipt, status: "denied", session_limit: null } }))
    .toEqual({ status: "failed", codes: ["LICENCE_DENIED"] })
  expect(assessParallelLicence({ ...fixture, receipt: { ...fixture.receipt, session_limit: 2 } }))
    .toEqual({ status: "failed", codes: ["LICENCE_SESSION_LIMIT_EXCEEDED"] })
  expect(assessParallelLicence({ ...fixture, receipt: { ...fixture.receipt, session_count: 2 } }))
    .toEqual({ status: "incomplete", codes: ["LICENCE_CONCURRENCY_UNPROVEN"] })
  expect(assessParallelLicence({ ...fixture, users: ["eval-a"], receipt: { ...fixture.receipt, connected_users: ["eval-a"], session_count: 2, session_limit: 2 } }))
    .toEqual({ status: "passed", codes: [] })
})

test("parallel licence policy rejects empty or duplicate selections and inconsistent observed user counts", () => {
  const fixture = licenceFixture()
  for (const users of [[], ["eval-a", "eval-a"], [""]]) expect(assessParallelLicence({ ...fixture, users }))
    .toEqual({ status: "incomplete", codes: ["LICENCE_SELECTED_USERS_UNVERIFIED"] })
  expect(assessParallelLicence({ ...fixture, receipt: { ...fixture.receipt, connected_users: ["eval-a", "eval-b", null] } }))
    .toEqual({ status: "incomplete", codes: ["LICENCE_USER_CONCURRENCY_UNPROVEN"] })
  expect(assessParallelLicence({ ...fixture, receipt: { ...fixture.receipt, connected_users: ["eval-a", "eval-b", "other-user"] } }))
    .toEqual({ status: "incomplete", codes: ["LICENCE_CONCURRENCY_UNPROVEN"] })
})

test("a bound explicit licence denial remains failed without metadata for a successful issuance", () => {
  const fixture = licenceFixture()
  expect(assessParallelLicence({ ...fixture, receipt: { ...fixture.receipt, status: "denied", licence_type: null, readback: "unavailable", session_limit: null } }))
    .toEqual({ status: "failed", codes: ["LICENCE_DENIED"] })
})

test("parallel licence policy distinguishes an explicitly observed unlimited limit from an unknown value", () => {
  const fixture = licenceFixture()
  expect(assessParallelLicence({ ...fixture, receipt: { ...fixture.receipt, session_limit: "unlimited", session_count: 10 } }))
    .toEqual({ status: "passed", codes: [] })
  for (const session_limit of [null, 0, "unknown"]) expect(assessParallelLicence({ ...fixture, receipt: { ...fixture.receipt, session_limit } }))
    .toEqual({ status: "incomplete", codes: ["LICENCE_LIMIT_UNKNOWN"] })
})


test("resource budget policy requires a budget and samples before it can pass declared bounds", () => {
  const fixture = budgetFixture()
  expect(assessResourceBudget({ ...fixture, budget: null })).toEqual({ status: "incomplete", codes: ["RESOURCE_BUDGET_MISSING"] })
  expect(assessResourceBudget({ ...fixture, summary: null })).toEqual({ status: "incomplete", codes: ["RESOURCE_SAMPLES_MISSING"] })
  expect(assessResourceBudget(fixture)).toEqual({ status: "passed", codes: [] })
})

function budgetFixture() {
  return { runId: "resource-policy-fixture", startedAt: "2026-10-14T10:00:01.000Z",
    budget: { version: 1, kind: "parallel-resource-budget", run_id: "resource-policy-fixture", fixed_at: "2026-10-14T10:00:00.000Z",
      bounds: [{ scope: "host", metric: "memory.available_bytes", minimum: 100, maximum: null },
        { scope: "filesystem:/archives", metric: "available_bytes", minimum: 200, maximum: null }],
    }, summary: summarizeResourceSamples([500, 300].map((available, index) => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0,
      host: { cpu: null, memory: { available_bytes: available }, filesystems: [{ path: "/archives", capacity: { available_bytes: 400 } }] },
    }))),
  }
}

test("resource budget policy fails on observed minima or peaks beyond the fixed bounds", () => {
  const fixture = budgetFixture()
  expect(assessResourceBudget({ ...fixture, budget: { ...fixture.budget,
    bounds: [{ ...fixture.budget.bounds[0], minimum: 301 }] } }))
    .toEqual({ status: "failed", codes: ["RESOURCE_BUDGET_EXCEEDED"] })
  const summary = summarizeResourceSamples([150, 300].map((current, index) => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0,
    host: { cpu: null, memory: null }, containers: [{ container_id: "a".repeat(64), epoch_stable: true, inspect: { started_at: "fixture-start" },
      memory: { current_bytes: current, limit_bytes: 1000 } }],
  })))
  const bound = { scope: `container:${"a".repeat(64)}:fixture-start`, metric: "memory.current_bytes", minimum: null, maximum: 250 }
  expect(assessResourceBudget({ ...fixture, summary, budget: { ...fixture.budget, bounds: [bound] } }))
    .toEqual({ status: "failed", codes: ["RESOURCE_BUDGET_EXCEEDED"] })
  expect(assessResourceBudget({ ...fixture, summary, budget: { ...fixture.budget, bounds: [{ ...bound, maximum: 300 }] } }))
    .toEqual({ status: "passed", codes: [] })
})

test("resource budget policy cannot pass missing series, lost intervals or reset counters", () => {
  const fixture = budgetFixture()
  expect(assessResourceBudget({ ...fixture, summary: summarizeResourceSamples([]) }))
    .toEqual({ status: "incomplete", codes: ["RESOURCE_SAMPLES_MISSING"] })
  expect(assessResourceBudget({ ...fixture, summary: { ...fixture.summary, missed_intervals: 1 } }))
    .toEqual({ status: "incomplete", codes: ["RESOURCE_OBSERVATIONS_INCOMPLETE"] })
  expect(assessResourceBudget({ ...fixture, budget: { ...fixture.budget, bounds: [{ ...fixture.budget.bounds[0], scope: "filesystem:/missing" }] } }))
    .toEqual({ status: "incomplete", codes: ["RESOURCE_OBSERVATIONS_INCOMPLETE"] })
  const summary = summarizeResourceSamples([500, null, 300].map((available, index) => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0,
    host: { cpu: null, memory: available === null ? null : { available_bytes: available } },
  })))
  expect(assessResourceBudget({ ...fixture, summary })).toEqual({ status: "incomplete", codes: ["RESOURCE_OBSERVATIONS_INCOMPLETE"] })
  expect(assessResourceBudget({ ...fixture, summary, budget: { ...fixture.budget, bounds: [{ ...fixture.budget.bounds[0], minimum: 400 }] } }))
    .toEqual({ status: "failed", codes: ["RESOURCE_BUDGET_EXCEEDED"] })
  const reset = summarizeResourceSamples([100, 5].map((ticks, index) => ({ sequence: index + 1, elapsed_ms: index * 1000, missed_intervals: 0,
    host: { cpu: { ticks: [ticks] }, memory: null },
  })))
  expect(assessResourceBudget({ ...fixture, summary: reset, budget: { ...fixture.budget,
    bounds: [{ scope: "host", metric: "cpu.ticks.0", minimum: 0, maximum: null }] } }))
    .toEqual({ status: "incomplete", codes: ["RESOURCE_OBSERVATIONS_INCOMPLETE"] })
})

test("resource budget policy binds the budget to the run and refuses thresholds fixed after execution starts", () => {
  const fixture = budgetFixture()
  expect(assessResourceBudget({ ...fixture, budget: { ...fixture.budget, run_id: "another-run" } }))
    .toEqual({ status: "failed", codes: ["RESOURCE_BUDGET_RUN_MISMATCH"] })
  for (const fixed_at of [fixture.startedAt, "2026-10-14T10:00:02.000Z"]) expect(assessResourceBudget({ ...fixture, budget: { ...fixture.budget, fixed_at } }))
    .toEqual({ status: "failed", codes: ["RESOURCE_BUDGET_NOT_FIXED_BEFORE_RUN"] })
  expect(assessResourceBudget({ ...fixture, budget: { ...fixture.budget, fixed_at: "unverified" } }))
    .toEqual({ status: "incomplete", codes: ["RESOURCE_BUDGET_TIME_UNVERIFIED"] })
  expect(assessResourceBudget({ ...fixture, startedAt: "unverified" }))
    .toEqual({ status: "incomplete", codes: ["RESOURCE_BUDGET_TIME_UNVERIFIED"] })
  expect(assessResourceBudget({ ...fixture, summary: null, budget: { ...fixture.budget, fixed_at: fixture.startedAt } }))
    .toEqual({ status: "failed", codes: ["RESOURCE_BUDGET_NOT_FIXED_BEFORE_RUN"] })
})

test("resource budget policy refuses malformed or empty bounds rather than silently skipping them", () => {
  const fixture = budgetFixture()
  for (const change of [{ version: 0 }, { kind: "unverified" }, { bounds: [] }, { bounds: null },
    { bounds: [{ scope: "host", metric: "memory.available_bytes", minimum: null, maximum: null }] },
    { bounds: [{ scope: "", metric: "memory.available_bytes", minimum: 0, maximum: null }] },
    { bounds: [{ scope: "host", metric: "memory.available_bytes", minimum: "100", maximum: null }] },
    { bounds: [{ scope: "host", metric: "memory.available_bytes", minimum: -1, maximum: null }] },
    { bounds: [{ scope: "host", metric: "memory.available_bytes", minimum: 500, maximum: 100 }] },
  ]) expect(assessResourceBudget({ ...fixture, budget: { ...fixture.budget, ...change } }))
    .toEqual({ status: "incomplete", codes: ["RESOURCE_BUDGET_INVALID"] })
})


test("resource coverage requires real host counters and every selected filesystem", async () => {
  const host = await sampleHostResources([os.tmpdir()])
  const sample = { host, containers: null, processes: null }
  const request = { samples: [sample], paths: [os.tmpdir()], containers: [], owners: [] }
  expect(assessResourceCoverage(request)).toEqual({ status: "passed", codes: [] })
  expect(assessResourceCoverage({ ...request, samples: [] })).toEqual({ status: "incomplete", codes: ["RESOURCE_SAMPLES_MISSING"] })
  expect(assessResourceCoverage({ ...request, samples: [{ ...sample, host: { ...host, memory: null } }] }))
    .toEqual({ status: "incomplete", codes: ["HOST_RESOURCE_COVERAGE_INCOMPLETE"] })
  expect(assessResourceCoverage({ ...request, paths: [os.tmpdir(), "/unobserved-storage"] }))
    .toEqual({ status: "incomplete", codes: ["FILESYSTEM_RESOURCE_COVERAGE_INCOMPLETE"] })
  expect(assessResourceCoverage({ ...request, samples: [{ ...sample, host: { ...host, filesystems: [{ path: os.tmpdir(), capacity: null }] } }] }))
    .toEqual({ status: "incomplete", codes: ["FILESYSTEM_RESOURCE_COVERAGE_INCOMPLETE"] })
})

test("resource coverage binds both container roles to the exact prepared epochs and requires their counters", async () => {
  const host = await sampleHostResources([os.tmpdir()])
  const targets = (["server", "studio"] as const).map((role, index) => ({ role, id: String(index + 1).repeat(64), image: `sha256:${String(index + 3).repeat(64)}`,
    startedAt: "2026-10-14T10:00:00.000Z", name: `fixture-${role}`, nonce: "fixture-nonce", purpose: "acceptance" }))
  const containers = targets.map(target => ({ role: target.role, container_id: target.id, epoch_stable: true,
    inspect: { id: target.id, image: target.image, name: `/${target.name}`, started_at: target.startedAt, running: true, oom_killed: false,
      owner_kind: "users", owner_nonce: target.nonce, purpose: target.purpose },
    cpu: { total_usage_ns: 10 }, memory: { current_bytes: 100, limit_bytes: 1000 }, pids: { current: 1 },
    io: [{ major: 8, minor: 0, op: "Write", bytes: 0 }],
  }))
  const sample = { host, containers, processes: null }
  const request = { samples: [sample], paths: [os.tmpdir()], containers: targets, owners: [] }
  expect(assessResourceCoverage(request)).toEqual({ status: "passed", codes: [] })
  expect(assessResourceCoverage({ ...request, samples: [{ ...sample, containers: containers.slice(0, 1) }] }))
    .toEqual({ status: "incomplete", codes: ["CONTAINER_RESOURCE_COVERAGE_INCOMPLETE"] })
  for (const change of [{ memory: null }, { cpu: null }, { io: null }, { epoch_stable: false }])
    expect(assessResourceCoverage({ ...request, samples: [{ ...sample, containers: [{ ...containers[0], ...change }, containers[1]] }] }))
      .toEqual({ status: "incomplete", codes: ["CONTAINER_RESOURCE_COVERAGE_INCOMPLETE"] })
  for (const change of [{ started_at: "changed" }, { image: "changed" }, { owner_nonce: "changed" }])
    expect(assessResourceCoverage({ ...request, samples: [{ ...sample, containers: [{ ...containers[0], inspect: { ...containers[0]!.inspect, ...change } }, containers[1]] }] }))
      .toEqual({ status: "failed", codes: ["CONTAINER_RESOURCE_IDENTITY_MISMATCH"] })
})


test("cgroup coverage requires scopes and the qualified expected runner hierarchy view", async () => {
  const group = await sampleCgroupResources()
  const root = await stat("/sys/fs/cgroup")
  const view = { namespace: await readlink("/proc/self/ns/cgroup"), root: { device: root.dev, inode: root.ino } }
  expect(assessCgroupCoverage({ groups: [group], view })).toEqual({ status: "passed", codes: [] })
  expect(assessCgroupCoverage({ groups: [], view })).toEqual({ status: "incomplete", codes: ["CGROUP_RESOURCE_COVERAGE_INCOMPLETE"] })
  expect(assessCgroupCoverage({ groups: [null], view })).toEqual({ status: "incomplete", codes: ["CGROUP_RESOURCE_COVERAGE_INCOMPLETE"] })
  expect(assessCgroupCoverage({ groups: [{ ...group, view: null }], view })).toEqual({ status: "incomplete", codes: ["CGROUP_VIEW_UNAVAILABLE"] })
  expect(assessCgroupCoverage({ groups: [group], view: { ...view, root: { ...view.root, inode: view.root.inode + 1 } } }))
    .toEqual({ status: "failed", codes: ["CGROUP_VIEW_MISMATCH"] })
  expect(assessCgroupCoverage({ groups: [group], view: { ...view, namespace: "cgroup:[0]" } }))
    .toEqual({ status: "failed", codes: ["CGROUP_VIEW_MISMATCH"] })
})

test("cgroup coverage requires a bound canonical path and the complete ordered ancestor chain", async () => {
  const group = await sampleCgroupResources()
  const view = group.view!
  for (const change of [{ path: null }, { path: "/receipt/../leaf" }, { ancestors: null },
    { path: "/receipt/leaf", ancestors: [] },
    { path: "/receipt/leaf", ancestors: [{ ...group, path: "/wrong" }, { ...group, path: "/" }] },
  ]) expect(assessCgroupCoverage({ groups: [{ ...group, ...change }], view }))
    .toEqual({ status: "incomplete", codes: ["CGROUP_HIERARCHY_UNVERIFIED"] })
})

test("cgroup coverage requires applicable controller data without inventing counters for disabled local controllers", async () => {
  const group = await sampleCgroupResources()
  const view = group.view!
  for (const change of [{ controllers: null }, { cpu_usage: null },
    { controllers: ["cpu", "memory"], cpu_max: null },
    { controllers: ["cpu", "memory"], cpu_throttling: null },
    { controllers: ["memory"], memory_events: null }, { controllers: ["memory"], memory_limit_bytes: null },
    { controllers: ["memory"], swap_current_bytes: null },
  ]) expect(assessCgroupCoverage({ groups: [{ ...group, ...change }], view }))
    .toEqual({ status: "incomplete", codes: ["CGROUP_COUNTERS_INCOMPLETE"] })
  const disabled = { ...group, controllers: [], cpu_max: null, cpu_throttling: null, memory_current_bytes: null,
    memory_limit_bytes: null, swap_current_bytes: null, swap_limit_bytes: null, memory_events: null }
  const before = JSON.stringify(disabled)
  expect(assessCgroupCoverage({ groups: [disabled], view })).toEqual({ status: "passed", codes: [] })
  expect(JSON.stringify(disabled)).toBe(before)
  expect(assessCgroupCoverage({ groups: [{ ...group, ancestors: group.ancestors!.map((ancestor, index) => index ? ancestor : { ...ancestor, cpu_usage: null }) }], view }))
    .toEqual({ status: "incomplete", codes: ["CGROUP_COUNTERS_INCOMPLETE"] })
})

test("cgroup coverage refuses controller metadata that contradicts observed local interfaces", async () => {
  const group = await sampleCgroupResources()
  const view = group.view!
  expect(assessCgroupCoverage({ groups: [{ ...group, controllers: [], cpu_max: { quota_usec: "max", period_usec: 100000 } }], view }))
    .toEqual({ status: "incomplete", codes: ["CGROUP_CONTROLLER_STATE_INCONSISTENT"] })
  expect(assessCgroupCoverage({ groups: [{ ...group, controllers: [] }], view }))
    .toEqual({ status: "incomplete", codes: ["CGROUP_CONTROLLER_STATE_INCONSISTENT"] })
})

test("a known cgroup view mismatch remains failed alongside unavailable scope evidence", async () => {
  const group = await sampleCgroupResources()
  const view = group.view!
  const wrong = { ...group, view: { ...view, namespace: "cgroup:[0]" } }
  for (const missing of [null, { ...group, view: null }]) expect(assessCgroupCoverage({ groups: [missing, wrong], view }))
    .toEqual({ status: "failed", codes: ["CGROUP_VIEW_MISMATCH"] })
})
