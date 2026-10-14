import { expect, test } from "bun:test"
import { assessParallelLicence, assessParallelLimits } from "../src/parallel-acceptance"

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
