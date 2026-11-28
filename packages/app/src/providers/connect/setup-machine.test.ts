import { expect, test } from "bun:test"
import { setupView, startSetup, transitionSetup } from "./setup-machine"

test("back and dispose reject a late model; a loaded model completes only the current form", () => {
  const first = Symbol()
  const retry = Symbol()
  const selection = { providerID: "fixture-provider", modelID: "alpha" }
  const pending = transitionSetup(startSetup("fixture"), { type: "saved", attempt: first, selection })
  expect(setupView(pending).selection).toEqual(selection)
  const picker = transitionSetup(pending, { type: "back" })
  const form = transitionSetup(picker, { type: "opened", id: "fixture" })
  const waiting = transitionSetup(form, { type: "saved", attempt: retry, selection })
  expect(transitionSetup(waiting, { type: "settled", attempt: first, outcome: "loaded" })).toBe(waiting)
  expect(setupView(transitionSetup(waiting, { type: "settled", attempt: retry, outcome: "loaded" })).completed).toBe(true)
  expect(setupView(transitionSetup(waiting, { type: "settled", attempt: retry, outcome: "timed-out" })).completed).toBe(false)
  expect(setupView(transitionSetup(waiting, { type: "settled", attempt: retry, outcome: "cancelled" })).id).toBeUndefined()
  const disposed = transitionSetup(waiting, { type: "disposed" })
  expect(transitionSetup(disposed, { type: "settled", attempt: retry, outcome: "loaded" })).toBe(disposed)
})
