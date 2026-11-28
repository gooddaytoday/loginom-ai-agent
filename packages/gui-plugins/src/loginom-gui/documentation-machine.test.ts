import { expect, test } from "bun:test"
import type { Run } from "./documentation-run"
import { initial, transition, view } from "./documentation-machine"

const run: Run = {
  server: "local",
  sessionID: "ses_documentation",
  directory: "/work",
  filename: "input.lgp",
  formats: ["pdf"],
}

function preparing() {
  const form = transition(initial, { type: "edit", form: { path: "/data/input.lgp" } })
  const access = transition(form, { type: "next" })

  return transition(access, { type: "start", attempt: "first" })
}

test("a timeout makes the result unknown and allows checking the same run, not starting another", () => {
  const execution = transition(preparing(), { type: "admitted", attempt: "first", run })
  const timeout = transition(execution, { type: "finish", attempt: "first", result: { outcome: "unknown", run } })
  expect(view(timeout)).toMatchObject({ step: 3, outcome: "unknown", run })
  expect(transition(timeout, { type: "again" })).toBe(timeout)

  const checking = transition(timeout, { type: "check", attempt: "check" })
  const late = { type: "finish", attempt: "first", result: { outcome: "ready", run } } as const
  expect(transition(checking, late)).toBe(checking)
  expect(view(transition(checking, { ...late, attempt: "check" }))).toMatchObject({ outcome: "ready", run })
})

test("stopping before admission does not reveal a discarded conversation", () => {
  const stopping = transition(preparing(), { type: "stop" })
  const result = transition(stopping, { type: "finish", attempt: "first", result: { outcome: "stopped" } })
  expect(view(result)).toMatchObject({ step: 3, outcome: "stopped", run: undefined })
})

test("disposing the wizard ignores an in-flight admission", () => {
  const disposed = transition(preparing(), { type: "dispose" })
  expect(transition(disposed, { type: "admitted", attempt: "first", run })).toBe(disposed)
})
