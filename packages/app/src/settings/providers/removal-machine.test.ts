import { expect, test } from "bun:test"
import { canRemove, transitionRemoval } from "./removal-machine"

test("another removal cannot start until the current confirmation and request settle", () => {
  const first = Symbol()
  const second = Symbol()
  const pending = transitionRemoval({ status: "idle" }, { type: "requested", attempt: first })
  expect(canRemove(pending)).toBe(false)
  expect(transitionRemoval(pending, { type: "requested", attempt: second })).toBe(pending)
  expect(transitionRemoval(pending, { type: "settled", attempt: second })).toBe(pending)
  expect(canRemove(transitionRemoval(pending, { type: "settled", attempt: first }))).toBe(true)
  const disposed = transitionRemoval(pending, { type: "disposed" })
  expect(canRemove(transitionRemoval(disposed, { type: "settled", attempt: first }))).toBe(false)
})
