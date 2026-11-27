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
  deviceOnly: false,
} satisfies Status

function form(status: Status = fresh) {
  const loaded = transition(initial, { type: "target", available: true }).state
  return transition(loaded, { type: "status", attempt: loaded.attempt, result: { ok: true, value: status } }).state
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
    attempt: saved.state.attempt,
    result: { ok: true, value: { ...fresh, revision: 1, state: "pending" } },
  })
  expect(view(pending.state)).toMatchObject({ message: "pending", readOnly: true })
  expect(pending.effects).toMatchObject([{ type: "status" }])
  const applied = transition(pending.state, {
    type: "status",
    attempt: pending.state.attempt,
    result: { ok: true, value: { ...fresh, revision: 1, generation: 1, state: "ready" } },
  }).state
  expect(view(applied)).toMatchObject({ connected: { username: "user", folder: "/user" }, readOnly: false })
})

test("unavailable, changed targets and disposal ignore late completions", () => {
  const checking = check().state
  const result = { type: "checked", attempt: checking.attempt, result: validation } as const
  const gone = transition(checking, { type: "target", available: false }).state
  expect(view(gone)).toMatchObject({ message: "serviceUnavailable", retry: true })
  expect(transition(gone, result).state).toBe(gone)

  const loading = transition(gone, { type: "target", available: true }).state
  const timedOut = transition(loading, {
    type: "status",
    attempt: loading.attempt,
    result: { ok: false, issue: "unavailable" },
  }).state
  expect(view(timedOut)).toMatchObject({ message: "serviceUnavailable", retry: true })
  const disposed = transition(loading, { type: "disposed" }).state
  expect(transition(disposed, result).state).toBe(disposed)
})

test("the saved password can only be reused for its own Loginom address and user", () => {
  const stored = form({ ...fresh, generation: 1, state: "ready", hasPassword: true })
  expect(check(stored).effects).toMatchObject([{ type: "check", input: { password: { operation: "preserve" } } }])
  const changed = transition(stored, { type: "edit", patch: { url: "https://other.example/" } }).state
  expect(view(check(changed).state).fieldErrors.password).toBe("passwordRequired")
})
