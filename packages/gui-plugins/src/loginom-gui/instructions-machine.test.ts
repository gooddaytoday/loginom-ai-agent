import { expect, test } from "bun:test"
import { initialInstructions, instructionsView, transitionInstructions } from "./instructions-machine"

test("a late load cannot replace the result of a retry", () => {
  const failed = transitionInstructions(initialInstructions, { type: "loaded", attempt: 1, text: undefined }).state
  expect(instructionsView(failed).loadFailed).toBe(true)
  const retry = transitionInstructions(failed, { type: "retry" })
  expect(retry.request).toEqual({ type: "load", attempt: 2 })
  const stale = transitionInstructions(retry.state, { type: "loaded", attempt: 1, text: "stale" }).state
  expect(instructionsView(stale)).toMatchObject({ loading: true, form: undefined })
  const ready = transitionInstructions(stale, { type: "loaded", attempt: 2, text: "" }).state
  expect(instructionsView(ready)).toMatchObject({ loading: false, dirty: false, form: { text: "" } })
})

test("a failed save keeps the draft, and a late result cannot complete a later save", () => {
  const loaded = transitionInstructions(initialInstructions, { type: "loaded", attempt: 1, text: "old" }).state
  const edited = transitionInstructions(loaded, { type: "edit", text: "new" }).state
  const save = transitionInstructions(edited, { type: "submit" })
  expect(save.request).toEqual({ type: "save", attempt: 2, text: "new" })
  expect(transitionInstructions(save.state, { type: "submit" }).request).toBeUndefined()
  const failed = transitionInstructions(save.state, { type: "saved", attempt: 2, text: undefined }).state
  expect(instructionsView(failed)).toMatchObject({ saveFailed: true, canSave: true, form: { text: "new" } })
  const retry = transitionInstructions(failed, { type: "submit" })
  const stale = transitionInstructions(retry.state, { type: "saved", attempt: 2, text: "stale" }).state
  expect(instructionsView(stale)).toMatchObject({ saving: true, canSave: false, form: { text: "new" } })
  const saved = transitionInstructions(stale, { type: "saved", attempt: 3, text: "new" }).state
  expect(instructionsView(saved)).toMatchObject({ saving: false, dirty: false, canSave: false })
})
