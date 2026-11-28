import { expect, test } from "bun:test"
import type { Status } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { initial, transition, view } from "./machine"

const fresh = {
  revision: 0,
  generation: 0,
  url: "https://app.loginom.ai/",
  username: "user",
  folder: "/user",
  state: "unconfigured",
  hasPassword: false,
  failed: false,
} satisfies Status

function form(status: Status = fresh) {
  const loaded = transition(initial, { type: "target", available: true, now: 0 }).state

  return transition(loaded, { type: "status", now: 1000, attempt: loaded.attempt, result: { ok: true, value: status } })
    .state
}

function check(state = form()) {
  return transition(state, { type: "submit", submit: "check", now: 1000 })
}

const validation = { ok: true, value: { validationId: "checked", expiresAt: 5000 } } as const

test("an empty password belongs to the password field unless passwordless was selected", () => {
  const state = form()
  expect(view(state).draft?.noPassword).toBe(true)
  const changed = transition(state, { type: "edit", patch: { noPassword: false } }).state
  const failed = check(changed)
  expect(failed.effects).toEqual([])
  expect(view(failed.state).fieldErrors).toMatchObject({ password: "passwordRequired" })
  const passwordless = transition(failed.state, { type: "edit", patch: { noPassword: true } }).state
  expect(check(passwordless).effects).toMatchObject([{ type: "check", input: { password: { operation: "empty" } } }])
})

test("a rejected password stays on its field and allows another check", () => {
  const checking = check().state

  const rejected = transition(checking, {
    type: "checked",
    attempt: checking.attempt,
    result: { ok: false, issue: "credentialsRejected" },
  }).state

  expect(view(rejected)).toMatchObject({ fieldErrors: { password: "credentialsRejected" }, busy: false })
  expect(check(rejected).effects).toMatchObject([{ type: "check" }])
})

test("a verified draft is unsaved until Save and changes invalidate the check", () => {
  const checking = check().state
  const result = { type: "checked", attempt: checking.attempt, result: validation } as const
  const verified = transition(checking, result)
  expect(verified.effects).toEqual([])
  expect(view(verified.state).message).toBe("verified")
  const saved = transition(verified.state, { type: "submit", submit: "save", now: 3000 })
  expect(saved.effects).toMatchObject([{ type: "save", input: { revision: 0, validationId: "checked" } }])

  const edited = transition(checking, { type: "edit", patch: { username: "other" } }).state
  expect(transition(edited, result).state).toBe(edited)
  expect(transition(edited, { type: "submit", submit: "save", now: 3000 }).effects).toMatchObject([
    { type: "check", input: { username: "other" } },
  ])
  expect(transition(verified.state, { type: "submit", submit: "save", now: 5000 }).effects).toMatchObject([
    { type: "check" },
  ])
})

test("Save checks first and reports pending activation until the service applies the connection", () => {
  const checking = transition(form(), { type: "submit", submit: "save", now: 1000 }).state
  const saved = transition(checking, { type: "checked", attempt: checking.attempt, result: validation })
  expect(saved.effects).toMatchObject([{ type: "save", input: { validationId: "checked" } }])

  const pending = transition(saved.state, {
    type: "saved",
    now: 1000,
    attempt: saved.state.attempt,
    result: { ok: true, value: { ...fresh, revision: 1, state: "pending" } },
  })

  expect(view(pending.state)).toMatchObject({ message: "pending", readOnly: false })
  expect(pending.effects).toMatchObject([{ type: "status" }])

  const applied = transition(pending.state, {
    type: "status",
    now: 2000,
    attempt: pending.state.attempt,
    result: { ok: true, value: { ...fresh, revision: 1, generation: 1, state: "ready" } },
  }).state

  expect(view(applied)).toMatchObject({ connected: { username: "user", folder: "/user" }, readOnly: false })
})

test.each([
  { outcome: { pendingOutcome: "pendingCleanupFailed" }, message: "pendingCleanupFailed" },
  { outcome: { pendingOutcome: "pendingResumeFailed" }, message: "pendingResumeFailed" },
  { outcome: { pendingOutcome: "pendingNotApplied" }, message: "pendingNotApplied" },
  { outcome: {}, message: "activationFailed" },
] satisfies { outcome: Partial<Status>; message: string }[])(
  "settings show the original connection alongside $message",
  ({ outcome, message }) => {
    const state = form({ ...fresh, revision: 2, generation: 1, state: "ready", failed: true, ...outcome })
    expect(view(state)).toMatchObject({
      message,
      busy: false,
      connected: { generation: 1, username: fresh.username, folder: fresh.folder },
    })
  },
)

test("a saved warning stays visible while polling for the original connection and can be acknowledged when ready", () => {
  const warning = { ...fresh, revision: 2, generation: 1, failed: true, pendingOutcome: "pendingNotApplied", pendingNotice: "notice" } as const
  const starting = form({ ...warning, state: "starting" })
  expect(view(starting)).toMatchObject({ message: "pendingNotApplied", busy: true })
  const stillStarting = transition(starting, {
    type: "status", attempt: starting.attempt, now: 20_000,
    result: { ok: true, value: { ...warning, state: "starting" } },
  })
  expect(stillStarting.effects).toMatchObject([{ type: "status" }])
  const failure = { ok: false, issue: "unavailable" } as const
  const interrupted = transition(stillStarting.state, {
    type: "status", attempt: stillStarting.state.attempt, now: 21_000,
    result: failure,
  })
  expect(interrupted.effects).toMatchObject([{ type: "status", delay: 1000 }])
  expect(view(interrupted.state)).toMatchObject({ message: "pendingNotApplied", busy: true })
  const expired = transition(interrupted.state, {
    type: "status", attempt: interrupted.state.attempt, now: 35_000,
    result: failure,
  })
  expect(expired.effects).toEqual([])
  const refreshed = transition(expired.state, { type: "application", revision: 2, generation: 1, now: 36_000 })
  expect(refreshed.effects).toMatchObject([{ type: "cancel" }, { type: "status" }])
  const ready = transition(refreshed.state, {
    type: "status", attempt: refreshed.state.attempt, now: 36_000,
    result: { ok: true, value: { ...warning, state: "ready" } },
  }).state
  expect(view(ready)).toMatchObject({ connected: { generation: 1 }, message: "pendingNotApplied", canAcknowledge: true })
  expect(transition(ready, { type: "acknowledge" }).effects).toMatchObject([{ type: "acknowledge", id: "notice" }])
})

test("the form shows primary write and secondary cleanup failures together", () => {
  expect(view(form({
    ...fresh, state: "ready", generation: 1, failed: true,
    pendingOutcome: "pendingWriteFailed", pendingCleanupFailed: true,
  }))).toMatchObject({ message: "pendingWriteFailed", pendingCleanupFailed: true, connected: { generation: 1 } })
})

test("unavailable, changed targets and disposal ignore late completions", () => {
  const checking = check().state
  const result = { type: "checked", attempt: checking.attempt, result: validation } as const
  const gone = transition(checking, { type: "target", available: false, now: 0 }).state
  expect(view(gone)).toMatchObject({ message: "serviceUnavailable", retry: true })
  expect(transition(gone, result).state).toBe(gone)

  const loading = transition(gone, { type: "target", available: true, now: 0 }).state

  const refused = transition(loading, {
    type: "status",
    now: 2000,
    attempt: loading.attempt,
    result: { ok: false, issue: "unavailable", reason: "LOGINOM_HOST_CLOSED" },
  }).state

  expect(view(refused)).toMatchObject({ message: "serviceUnavailable", retry: true })
  const disposed = transition(loading, { type: "disposed" }).state
  expect(transition(disposed, result).state).toBe(disposed)
})

test("the saved password can only be reused for its own Loginom address and user", () => {
  const stored = form({ ...fresh, generation: 1, state: "ready", hasPassword: true })
  expect(check(stored).effects).toMatchObject([{ type: "check", input: { password: { operation: "preserve" } } }])
  const changed = transition(stored, { type: "edit", patch: { url: "https://other.example/" } }).state
  expect(view(check(changed).state).fieldErrors.password).toBe("passwordRequired")
})

test("a disconnected check preserves the address and username for a retry", () => {
  const draft = { url: "https://other.example/", username: "analyst" }
  const edited = transition(form(), { type: "edit", patch: draft }).state
  const checking = check(edited).state

  const failed = transition(checking, {
    type: "checked",
    attempt: checking.attempt,
    result: { ok: false, issue: "unavailable" },
  }).state

  expect(view(failed)).toMatchObject({ draft, issue: "unavailable", busy: false })
  expect(check(failed).effects).toMatchObject([{ type: "check", input: draft }])
})

test("a lost Save reply refreshes the revision before another check", () => {
  const checking = check().state
  const verified = transition(checking, { type: "checked", attempt: checking.attempt, result: validation }).state
  const saving = transition(verified, { type: "submit", submit: "save", now: 3000 }).state

  const refreshing = transition(saving, {
    type: "saved",
    attempt: saving.attempt,
    now: 4000,
    result: { ok: false, issue: "saveFailed" },
  })

  expect(refreshing.effects).toMatchObject([{ type: "status", attempt: refreshing.state.attempt }])
  expect(view(refreshing.state).issue).toBeUndefined()
  const edited = transition(refreshing.state, { type: "edit", patch: { username: "next-user" } }).state

  const current = transition(edited, {
    type: "status",
    attempt: refreshing.state.attempt,
    now: 5000,
    result: { ok: true, value: { ...fresh, revision: 1, generation: 1, state: "ready" } },
  }).state

  expect(view(current)).toMatchObject({
    issue: undefined,
    connected: { username: "user" },
    draft: { username: "next-user" },
  })
  expect(check(current).effects).toMatchObject([{ type: "check", input: { revision: 1, username: "next-user" } }])
})

test("opening settings during connection activation keeps the form and application notice", () => {
  const applying = form({ ...fresh, revision: 1, state: "starting", application: { state: "pending", tasks: 0 } })

  expect(view(applying)).toMatchObject({
    message: "starting",
    readOnly: false,
    draft: { url: fresh.url, username: fresh.username },
  })
})

test.each([
  { ok: true, state: "starting" },
  { ok: true, value: { ...fresh, state: "ready" } },
] as const)("the startup deadline includes the first status request (%j)", (result) => {
  const openedAt = 1_000
  const loading = transition(initial, { type: "target", available: true, now: openedAt }).state

  const started = transition(loading, {
    type: "status",
    attempt: loading.attempt,
    now: openedAt + 11_000,
    result: { ok: true, state: "starting" },
  })

  expect(view(started.state).message).toBe("serviceStarting")

  const expiredAt = openedAt + 180_000
  const expired = transition(started.state, { type: "status", attempt: started.state.attempt, now: expiredAt, result })
  expect(view(expired.state)).toMatchObject({ message: "serviceUnavailable", retry: true })
  expect(expired.effects).toEqual([])

  const retried = transition(expired.state, { type: "refresh", now: expiredAt }).state
  const next = transition(retried, { type: "status", attempt: retried.attempt, now: expiredAt + 1_000, result })
  expect(view(next.state).message).not.toBe("serviceUnavailable")
})

test("an unavailable startup reply without a reason keeps polling until the deadline", () => {
  const loading = transition(initial, { type: "target", available: true, now: 0 }).state
  const result = { ok: false, issue: "unavailable" } as const
  const pending = transition(loading, { type: "status", attempt: loading.attempt, now: 1000, result })

  expect(view(pending.state)).toMatchObject({ message: "serviceStarting", retry: false })
  expect(pending.effects).toMatchObject([{ type: "status", attempt: pending.state.attempt }])

  const expired = transition(pending.state, { type: "status", attempt: pending.state.attempt, now: 180_000, result })
  expect(view(expired.state)).toMatchObject({ message: "serviceUnavailable", retry: true })
  expect(expired.effects).toEqual([])
})

test("polling is bounded and keeps edits made while the connection is pending", () => {
  const loading = transition(initial, { type: "target", available: true, now: 0 }).state
  const pending = { ok: true, value: { ...fresh, revision: 1, state: "pending" } } as const
  const applying = transition(loading, { type: "status", attempt: loading.attempt, now: 1000, result: pending }).state
  const edited = transition(applying, { type: "edit", patch: { username: "next-user" } }).state
  expect(view(edited)).toMatchObject({ message: "pending", readOnly: false, draft: { username: "next-user" } })
  const paused = transition(edited, { type: "status", attempt: edited.attempt, now: 16000, result: pending })
  expect(paused.effects).toEqual([])
  expect(view(paused.state)).toMatchObject({
    message: "applicationPaused",
    busy: false,
    retry: true,
    draft: { username: "next-user" },
  })
  expect(check(paused.state).effects).toMatchObject([{ type: "check", input: { revision: 1, username: "next-user" } }])
})

test("a temporary status failure retries and refreshes the pending task count", () => {
  const pending = { ...fresh, revision: 1, state: "pending", application: { state: "pending", tasks: 2 } } as const
  const applying = form(pending)
  expect(view(applying).waitingTasks).toBe(2)

  const failedPoll = transition(applying, {
    type: "status",
    attempt: applying.attempt,
    now: 2000,
    result: { ok: false, issue: "unavailable" },
  })

  expect(failedPoll.effects).toMatchObject([{ type: "status", delay: 1000 }])

  const updated = transition(failedPoll.state, {
    type: "status",
    attempt: failedPoll.state.attempt,
    now: 3000,
    result: { ok: true, value: { ...pending, application: { state: "pending", tasks: 1 } } },
  })

  expect(view(updated.state)).toMatchObject({ waitingTasks: 1, issue: undefined })
})

test("the last task count disappears when status polling runs out of time", () => {
  const applying = form({ ...fresh, revision: 1, state: "pending", application: { state: "pending", tasks: 2 } })

  const expired = transition(applying, {
    type: "status",
    attempt: applying.attempt,
    now: 16000,
    result: { ok: false, issue: "unavailable" },
  })

  expect(expired.effects).toEqual([])
  expect(view(expired.state)).toMatchObject({ waitingTasks: 0, retry: true })
})
