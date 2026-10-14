import { expect, test } from "bun:test"
import { assessParallelLimits } from "../src/parallel-acceptance"

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
