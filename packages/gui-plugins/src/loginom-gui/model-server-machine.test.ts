import { expect, test } from "bun:test"
import { initial, transition, view } from "./model-server-machine"

test("discovery retries ignore stale results; editing clears the model catalog", () => {
  const first = Symbol()
  const retry = Symbol()
  const input = transition(initial, { type: "edited", field: "address", value: "http://localhost/v1" })
  const started = transition(input, { type: "requested", action: "discover", attempt: first })
  const failure = transition(started, { type: "settled", attempt: first, issue: "modelServerDiscoveryFailed" })
  expect(view(failure)).toMatchObject({ busy: undefined, issue: "modelServerDiscoveryFailed", models: [] })
  const pending = transition(failure, { type: "requested", action: "discover", attempt: retry })
  const event = { type: "discovered", models: ["alpha", "beta"], selected: "alpha" } as const
  expect(transition(pending, { ...event, attempt: first })).toBe(pending)
  const ready = transition(pending, { ...event, attempt: retry })
  expect(view(ready)).toMatchObject({ busy: undefined, models: ["alpha", "beta"], selected: "alpha" })
  expect(view(transition(ready, { type: "edited", field: "key", value: "fixture" })).models).toEqual([])
})

test("save failure keeps the selected model, and a saved key is not retained", () => {
  const discover = Symbol()
  const save = Symbol()
  const retry = Symbol()
  const input = transition(initial, { type: "edited", field: "address", value: "http://localhost/v1" })
  const keyed = transition(input, { type: "edited", field: "key", value: "fixture" })
  const pending = transition(keyed, { type: "requested", action: "discover", attempt: discover })
  const ready = transition(pending, { type: "discovered", attempt: discover, models: ["alpha"], selected: "alpha" })
  const saving = transition(ready, { type: "requested", action: "save", attempt: save })
  expect(transition(saving, { type: "requested", action: "save", attempt: retry })).toBe(saving)
  const failure = transition(saving, { type: "settled", attempt: save, issue: "modelServerSaveFailed" })
  expect(view(failure)).toMatchObject({ selected: "alpha", issue: "modelServerSaveFailed" })
  const retried = transition(failure, { type: "requested", action: "save", attempt: retry })
  const stored = transition(retried, { type: "stored", attempt: retry })
  expect(view(stored)).toMatchObject({ key: "", selected: "alpha", busy: "save" })
  expect(view(transition(stored, { type: "settled", attempt: retry })).busy).toBeUndefined()
  const disposed = transition(stored, { type: "disposed" })
  expect(view(transition(disposed, { type: "settled", attempt: retry })).selected).toBe("")
})
