import { expect, test } from "bun:test"
import type { Status } from "@loginom-ai-agent/loginom-host/network-settings-rpc"
import { initial, transition } from "./machine"

const status = {
  proxy: { source: "none", hosts: [] },
  port: { current: 28288, saved: 28288, editable: true, maximum: 32767 },
} satisfies Status

function saving() {
  const loading = transition(initial, { type: "target", available: true }).state
  const ready = transition(loading, { type: "loaded", attempt: loading.attempt, status }).state
  const draft = transition(ready, { type: "edit", draft: "28290" }).state

  return transition(draft, { type: "save" }).state
}

test("a timed-out save reloads status and confirms an already saved port", () => {
  const pending = saving()
  const check = transition(pending, { type: "saved", attempt: pending.attempt })

  expect(check.command).toEqual({ type: "status", attempt: check.state.attempt })
  expect(transition(check.state, { type: "save" }).command).toBeUndefined()

  const saved = { ...status, port: { ...status.port, saved: 28290 } }
  const result = transition(check.state, { type: "loaded", attempt: check.state.attempt, status: saved })

  expect(result.state).toEqual({ type: "ready", attempt: check.state.attempt, draft: "28290", status: saved })
  expect(transition(result.state, { type: "save" }).command).toBeUndefined()
})

test.each([status, undefined])("an unconfirmed save keeps the draft available for retry", (observed) => {
  const pending = saving()
  const check = transition(pending, { type: "saved", attempt: pending.attempt }).state
  const result = transition(check, { type: "loaded", attempt: check.attempt, status: observed })

  expect(result.state).toMatchObject({ type: "ready", draft: "28290", issue: "unconfirmed", status })
  expect(transition(result.state, { type: "save" }).command).toMatchObject({ type: "save", port: 28290 })
})

test("a status reply from the previous server cannot confirm the save", () => {
  const pending = saving()
  const check = transition(pending, { type: "saved", attempt: pending.attempt }).state
  const switched = transition(check, { type: "target", available: true }).state

  expect(transition(switched, { type: "loaded", attempt: check.attempt, status }).state).toBe(switched)
})
